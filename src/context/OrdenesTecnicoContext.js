import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { useAuth } from "./AuthContext";
import { useOffline } from "../offline/OfflineProvider";

import {
  loadOrdenesTecnicoList,
  ORDENES_CACHE_TTL_MS,
  isCacheFresh,
} from "../offline/ordenesTecnicoCache";

import { bootstrapPrefetchOrdenesTecnico } from "../offline/bootstrapSyncTecnico";

const OrdenesTecnicoContext = createContext(null);

function getUserEmail(user) {
  return String(
    user?.email ||
      user?.correo ||
      user?.upn ||
      user?.username ||
      "",
  )
    .trim()
    .toLowerCase();
}

export function OrdenesTecnicoProvider({ children }) {
  const { user } = useAuth();
  const { online } = useOffline() || {};

  const userEmail = useMemo(() => getUserEmail(user), [user]);

  const [ordenes, setOrdenes] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingBackground, setSyncingBackground] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [lastError, setLastError] = useState(null);

  const syncLockRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
        mountedRef.current = false;
    };
    }, []);

  const loadLocal = useCallback(async () => {
    if (!userEmail) {
      if (mountedRef.current) {
        setOrdenes([]);
        setLastUpdatedAt(null);
      }

      return null;
    }

    const cached = await loadOrdenesTecnicoList(userEmail);

    if (mountedRef.current && Array.isArray(cached?.data)) {
      setOrdenes(cached.data);
      setLastUpdatedAt(cached.updatedAt || null);
    }

    return cached;
  }, [userEmail]);

  const synchronize = useCallback(
    async ({ force = false, manual = false } = {}) => {
      if (!userEmail) {
        return {
          ok: false,
          reason: "missing_user",
        };
      }

      if (syncLockRef.current) {
        return {
          ok: false,
          reason: "already_syncing",
        };
      }

      syncLockRef.current = true;

      if (mountedRef.current) {
        setLastError(null);

        if (manual) {
          setRefreshing(true);
        } else {
          setSyncingBackground(true);
        }
      }

      try {
        const result = await bootstrapPrefetchOrdenesTecnico(userEmail, {
          force,
          prefetchDetails: true,
          ttlMs: ORDENES_CACHE_TTL_MS,
        });

        /*
         * Siempre volvemos a leer la caché.
         *
         * Esto permite actualizar el contexto tanto si llegaron datos
         * nuevos desde SAP como si bootstrap utilizó la información
         * que ya estaba guardada localmente.
         */
        const cached = await loadLocal();

        if (mountedRef.current && result?.error) {
          setLastError(result.error);
        }

        return {
          ...result,
          cached,
        };
      } catch (error) {
        console.error(
          "[OrdenesTecnicoContext] Error sincronizando órdenes:",
          error,
        );

        if (mountedRef.current) {
          setLastError(error);
        }

        /*
         * Si SAP o la conexión fallan, intentamos mantener visible
         * la información que ya estaba guardada.
         */
        const cached = await loadLocal();

        return {
          ok: false,
          reason: "sync_error",
          error,
          cached,
        };
      } finally {
        syncLockRef.current = false;

        if (mountedRef.current) {
          setRefreshing(false);
          setSyncingBackground(false);
        }
      }
    },
    [loadLocal, userEmail],
  );

  const refresh = useCallback(async () => {
    return synchronize({
      force: true,
      manual: true,
    });
  }, [synchronize]);

  const refreshIfNeeded = useCallback(async () => {
    if (!userEmail) {
      return {
        ok: false,
        reason: "missing_user",
      };
    }

    const cached = await loadLocal();

    const cacheIsFresh = isCacheFresh(
      cached?.updatedAt,
      ORDENES_CACHE_TTL_MS,
    );

    if (cacheIsFresh) {
      return {
        ok: true,
        source: "cache",
        fresh: true,
        data: cached?.data || [],
      };
    }

    if (online === false) {
      return {
        ok: true,
        source: "cache",
        fresh: false,
        offline: true,
        data: cached?.data || [],
      };
    }

    return synchronize({
      force: false,
      manual: false,
    });
  }, [loadLocal, online, synchronize, userEmail]);

  /*
   * Carga inicial:
   * 1. Muestra primero lo que exista localmente.
   * 2. Revisa si la caché todavía es válida.
   * 3. Si está vencida, actualiza en segundo plano.
   */
  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!userEmail) {
        if (!cancelled && mountedRef.current) {
          setOrdenes([]);
          setLastUpdatedAt(null);
          setLoadingInitial(false);
        }

        return;
      }

      try {
        const cached = await loadLocal();

        if (!cancelled && mountedRef.current) {
          setLoadingInitial(false);
        }

        const cacheIsFresh = isCacheFresh(
          cached?.updatedAt,
          ORDENES_CACHE_TTL_MS,
        );

        if (!cacheIsFresh && online !== false) {
          synchronize({
            force: false,
            manual: false,
          });
        }
      } catch (error) {
        console.error(
          "[OrdenesTecnicoContext] Error cargando caché inicial:",
          error,
        );

        if (!cancelled && mountedRef.current) {
          setLastError(error);
          setLoadingInitial(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [loadLocal, online, synchronize, userEmail]);

  /*
   * Cuando vuelve la conexión, revisa si hace falta actualizar.
   */
  useEffect(() => {
    if (!userEmail || online !== true) {
      return;
    }

    refreshIfNeeded();
  }, [online, refreshIfNeeded, userEmail]);

  /*
   * Cuando la aplicación vuelve del segundo plano,
   * revisa si la caché ya superó una hora.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active") {
          refreshIfNeeded();
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [refreshIfNeeded]);

  const value = useMemo(
    () => ({
      ordenes,
      loadingInitial,
      refreshing,
      syncingBackground,
      lastUpdatedAt,
      lastError,
      userEmail,
      online,

      loadLocal,
      synchronize,
      refresh,
      refreshIfNeeded,
    }),
    [
      ordenes,
      loadingInitial,
      refreshing,
      syncingBackground,
      lastUpdatedAt,
      lastError,
      userEmail,
      online,
      loadLocal,
      synchronize,
      refresh,
      refreshIfNeeded,
    ],
  );

  return (
    <OrdenesTecnicoContext.Provider value={value}>
      {children}
    </OrdenesTecnicoContext.Provider>
  );
}

export function useOrdenesTecnico() {
  const context = useContext(OrdenesTecnicoContext);

  if (!context) {
    throw new Error(
      "useOrdenesTecnico debe usarse dentro de OrdenesTecnicoProvider",
    );
  }

  return context;
}