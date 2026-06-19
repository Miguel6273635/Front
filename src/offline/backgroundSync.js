// src/offline/backgroundSync.js
// Sincronización en segundo plano para Mike-dev
// Objetivo:
// 1. Enviar cola pendiente cuando haya red estable.
// 2. Actualizar órdenes offline sin trabar la app.
// 3. Ejecutar por rol: técnico o supervisor.
// 4. Guardar última sincronización.

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import api from "../services/api";
import { runOutboxSync } from "./syncEngine";
import { bootstrapPrefetchOrdenesSupervisor } from "./bootstrapSync";

const BACKGROUND_SYNC_TASK = "MITSU_BACKGROUND_SYNC_TASK";

const LAST_SYNC_KEY = "ultima_sincronizacion";
const LAST_SYNC_RESULT_KEY = "ultima_sincronizacion_resultado";
const BG_USER_KEY = "background_sync_user";
const BG_RUNNING_KEY = "background_sync_running";

const DEFAULT_MINIMUM_INTERVAL_SECONDS = 15 * 60; // 15 minutos

/**
 * Lee el usuario guardado.
 * Primero intenta el usuario que registramos para background.
 * Si no existe, usa el user normal de AuthContext.
 */
async function getStoredUser() {
  try {
    const bgRaw = await AsyncStorage.getItem(BG_USER_KEY);
    if (bgRaw) return JSON.parse(bgRaw);

    const userRaw = await AsyncStorage.getItem("user");
    if (userRaw) return JSON.parse(userRaw);

    return null;
  } catch (e) {
    console.log("[BACKGROUND SYNC] No se pudo leer usuario:", e?.message || e);
    return null;
  }
}

/**
 * Revisa red estable.
 * Para envío pesado usamos:
 * - WiFi
 * - Celular 4G
 * - Celular 5G
 */
export async function getBackgroundNetworkState() {
  const st = await NetInfo.fetch();

  const online = !!st.isConnected && st.isInternetReachable !== false;

  const type = st.type;
  const cellularGeneration = String(
    st.details?.cellularGeneration || "",
  ).toLowerCase();

  const isWifi = type === "wifi";
  const isGoodCellular =
    type === "cellular" &&
    (cellularGeneration === "4g" || cellularGeneration === "5g");

  const stable = online && (isWifi || isGoodCellular);

  return {
    online,
    stable,
    type,
    cellularGeneration: cellularGeneration || null,
    isInternetReachable: st.isInternetReachable,
  };
}

/**
 * Evita que se ejecuten dos sincronizaciones al mismo tiempo.
 */
async function isSyncRunning() {
  const value = await AsyncStorage.getItem(BG_RUNNING_KEY);
  return value === "1";
}

async function setSyncRunning(value) {
  if (value) {
    await AsyncStorage.setItem(BG_RUNNING_KEY, "1");
  } else {
    await AsyncStorage.removeItem(BG_RUNNING_KEY);
  }
}

/**
 * Guarda resultado para poder mostrarlo en pantalla si lo necesitas.
 */
async function saveSyncResult(result) {
  try {
    const now = new Date();

    await AsyncStorage.multiSet([
      [LAST_SYNC_KEY, now.toISOString()],
      [
        LAST_SYNC_RESULT_KEY,
        JSON.stringify({
          ...result,
          savedAt: now.toISOString(),
        }),
      ],
    ]);
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] No se pudo guardar resultado:",
      e?.message || e,
    );
  }
}

/**
 * Intenta ejecutar prefetch técnico.
 * Lo hacemos con require dinámico para no romper el build si todavía no agregas
 * la función maestra prefetchOrdenesTecnico en prefetchOrdenesTecnico.js.
 */
async function runTecnicoPrefetch(user) {
  try {
    const tecnicoModule = require("./prefetchOrdenesTecnico");

    const fn = tecnicoModule?.prefetchOrdenesTecnico;

    if (typeof fn !== "function") {
      console.log(
        "[BACKGROUND SYNC] prefetchOrdenesTecnico todavía no existe. Se omite técnico.",
      );

      return {
        ok: false,
        reason: "prefetchOrdenesTecnico_not_available",
      };
    }

    const userEmail =
      user?.correo ||
      user?.email ||
      user?.mail ||
      user?.preferred_username ||
      user?.upn ||
      null;

    return await fn(userEmail);
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] Error en prefetch técnico:",
      e?.response?.data || e?.message || e,
    );

    return {
      ok: false,
      reason: "tecnico_prefetch_error",
      error: e?.message || String(e),
    };
  }
}

/**
 * Sincronización principal.
 * Esta función se puede correr:
 * - En segundo plano.
 * - Al abrir la app.
 * - Cuando vuelve internet.
 */
export async function runBackgroundSyncNow(options = {}) {
  const { force = false, source = "manual" } = options;

  const alreadyRunning = await isSyncRunning();

  if (alreadyRunning && !force) {
    return {
      ok: false,
      reason: "sync_already_running",
      source,
    };
  }

  await setSyncRunning(true);

  try {
    const user = await getStoredUser();

    if (!user) {
      const result = {
        ok: false,
        reason: "no_user",
        source,
      };

      await saveSyncResult(result);
      return result;
    }

    const network = await getBackgroundNetworkState();

    if (!network.online) {
      const result = {
        ok: false,
        reason: "offline",
        source,
        network,
      };

      await saveSyncResult(result);
      return result;
    }

    /**
     * Si no es red estable, no mandamos pendientes ni descargamos datos pesados.
     * Esto evita que se queden a medias los envíos.
     */
    if (!network.stable) {
      const result = {
        ok: false,
        reason: "network_not_stable",
        source,
        network,
      };

      await saveSyncResult(result);
      return result;
    }

    console.log("[BACKGROUND SYNC] Iniciando sincronización:", {
      source,
      rol_id: user?.rol_id,
      network,
    });

    /**
     * 1. Primero enviar pendientes.
     * Esto es importante para que cuando regrese buena red, se mande lo guardado.
     */
    let outboxResult = null;

    try {
      outboxResult = await runOutboxSync(api, { limit: 10 });
    } catch (e) {
      outboxResult = {
        ok: false,
        reason: "outbox_error",
        error: e?.message || String(e),
      };

      console.log("[BACKGROUND SYNC] Error outbox:", e?.message || e);
    }

    /**
     * 2. Luego actualizar offline por rol.
     */
    let prefetchResult = null;

    const rolId = Number(user?.rol_id);

    if (rolId === 2) {
      try {
        prefetchResult = await bootstrapPrefetchOrdenesSupervisor();
      } catch (e) {
        prefetchResult = {
          ok: false,
          reason: "supervisor_prefetch_error",
          error: e?.message || String(e),
        };

        console.log(
          "[BACKGROUND SYNC] Error supervisor:",
          e?.response?.data || e?.message || e,
        );
      }
    } else if (rolId === 3) {
      prefetchResult = await runTecnicoPrefetch(user);
    } else {
      prefetchResult = {
        ok: false,
        reason: "role_without_prefetch",
        rol_id: user?.rol_id,
      };
    }

    const result = {
      ok: true,
      source,
      network,
      user: {
        rol_id: user?.rol_id,
        email:
          user?.correo ||
          user?.email ||
          user?.mail ||
          user?.preferred_username ||
          null,
      },
      outboxResult,
      prefetchResult,
      finishedAt: new Date().toISOString(),
    };

    await saveSyncResult(result);

    console.log("[BACKGROUND SYNC] Finalizada:", result);

    return result;
  } catch (e) {
    const result = {
      ok: false,
      reason: "background_sync_error",
      source,
      error: e?.message || String(e),
    };

    await saveSyncResult(result);

    console.log("[BACKGROUND SYNC] Error general:", e?.message || e);

    return result;
  } finally {
    await setSyncRunning(false);
  }
}

/**
 * Definición de la tarea.
 * Debe quedar fuera de componentes React.
 */
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    console.log("[BACKGROUND FETCH] Android despertó la app");

    const result = await runBackgroundSyncNow({
      source: "background_fetch",
    });

    if (result?.ok) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    if (
      result?.reason === "offline" ||
      result?.reason === "network_not_stable" ||
      result?.reason === "no_user"
    ) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (e) {
    console.log("[BACKGROUND FETCH] Error:", e?.message || e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Registra la tarea de segundo plano.
 * Se debe llamar cuando ya existe usuario y dbReady.
 */
export async function registerBackgroundSync(user = null, options = {}) {
  const {
    minimumInterval = DEFAULT_MINIMUM_INTERVAL_SECONDS,
    runImmediately = false,
  } = options;

  try {
    if (user) {
      await AsyncStorage.setItem(BG_USER_KEY, JSON.stringify(user));
    }

    const status = await BackgroundFetch.getStatusAsync();

    console.log("[BACKGROUND SYNC] BackgroundFetch status:", status);

    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);

    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval,
        stopOnTerminate: false,
        startOnBoot: true,
      });

      console.log("[BACKGROUND SYNC] Tarea registrada correctamente");
    } else {
      console.log("[BACKGROUND SYNC] Tarea ya estaba registrada");
    }

    if (runImmediately) {
      runBackgroundSyncNow({
        source: "foreground_register",
      }).catch((e) => {
        console.log(
          "[BACKGROUND SYNC] Error en ejecución inmediata:",
          e?.message || e,
        );
      });
    }

    return {
      ok: true,
      registered: true,
      taskName: BACKGROUND_SYNC_TASK,
      status,
    };
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] Error registrando tarea:",
      e?.message || e,
    );

    return {
      ok: false,
      registered: false,
      error: e?.message || String(e),
    };
  }
}

/**
 * Cancela la tarea.
 * Útil al cerrar sesión.
 */
export async function unregisterBackgroundSync() {
  try {
    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);

    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }

    await AsyncStorage.multiRemove([BG_USER_KEY, BG_RUNNING_KEY]);

    return {
      ok: true,
      unregistered: true,
    };
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] Error cancelando tarea:",
      e?.message || e,
    );

    return {
      ok: false,
      error: e?.message || String(e),
    };
  }
}

/**
 * Lee la última sincronización.
 * Lo puedes usar para mostrarlo en pantalla.
 */
export async function getLastBackgroundSyncInfo() {
  try {
    const values = await AsyncStorage.multiGet([
      LAST_SYNC_KEY,
      LAST_SYNC_RESULT_KEY,
    ]);

    const lastSyncAt = values?.[0]?.[1] || null;
    const rawResult = values?.[1]?.[1] || null;

    return {
      lastSyncAt,
      result: rawResult ? JSON.parse(rawResult) : null,
    };
  } catch (e) {
    return {
      lastSyncAt: null,
      result: null,
      error: e?.message || String(e),
    };
  }
}

export { BACKGROUND_SYNC_TASK };