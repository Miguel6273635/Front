// src/offline/backgroundSync.js
// Sincronización en segundo plano para Mike-dev
// Objetivo:
// 1. Enviar cola pendiente cuando haya red estable.
// 2. Enviar cola SAP pendiente validando token.
// 3. Enviar pendientes específicos del técnico.
// 4. Actualizar órdenes offline sin trabar la app.
// 5. Actualizar consumibles/catálogos.
// 6. Ejecutar por rol: técnico o supervisor.
// 7. Guardar última sincronización.

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import api from "../services/api";
import { runOutboxSync } from "./syncEngine";
import { bootstrapPrefetchOrdenesSupervisor } from "./bootstrapSync";
import { syncTecnicoPendingActions } from "./tecnicoPendingSync";
import { bootstrapPrefetchConsumiblesCatalogo } from "./bootstrapConsumiblesCatalogo";
import { processSapQueue } from "./sapQueue";

const BACKGROUND_SYNC_TASK = "MITSU_BACKGROUND_SYNC_TASK";

const LAST_SYNC_KEY = "ultima_sincronizacion";
const LAST_SYNC_RESULT_KEY = "ultima_sincronizacion_resultado";
const BG_USER_KEY = "background_sync_user";
const BG_RUNNING_KEY = "background_sync_running";

const DEFAULT_MINIMUM_INTERVAL_SECONDS = 15 * 60; // 15 minutos

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

function getUserEmail(user) {
  return (
    user?.correo ||
    user?.email ||
    user?.Email ||
    user?.username ||
    user?.mail ||
    user?.preferred_username ||
    user?.upn ||
    null
  );
}

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

    const userEmail = getUserEmail(user);

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

async function runSupervisorPrefetch() {
  try {
    return await bootstrapPrefetchOrdenesSupervisor();
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] Error supervisor:",
      e?.response?.data || e?.message || e,
    );

    return {
      ok: false,
      reason: "supervisor_prefetch_error",
      error: e?.message || String(e),
    };
  }
}

async function runTecnicoFullSync(user) {
  let tecnicoPendingResult = null;
  let tecnicoPrefetchResult = null;
  let consumiblesResult = null;

  try {
    tecnicoPendingResult = await syncTecnicoPendingActions(user, api, {
      limit: 5,
    });
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] Error pendientes técnico:",
      e?.response?.data || e?.message || e,
    );

    tecnicoPendingResult = {
      ok: false,
      reason: "tecnico_pending_error",
      error: e?.message || String(e),
    };
  }

  try {
    tecnicoPrefetchResult = await runTecnicoPrefetch(user);
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] Error prefetch técnico:",
      e?.response?.data || e?.message || e,
    );

    tecnicoPrefetchResult = {
      ok: false,
      reason: "tecnico_prefetch_error",
      error: e?.message || String(e),
    };
  }

  try {
    consumiblesResult = await bootstrapPrefetchConsumiblesCatalogo();
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] Error consumibles técnico:",
      e?.response?.data || e?.message || e,
    );

    consumiblesResult = {
      ok: false,
      reason: "consumibles_prefetch_error",
      error: e?.message || String(e),
    };
  }

  return {
    ok: true,
    tecnicoPendingResult,
    tecnicoPrefetchResult,
    consumiblesResult,
  };
}

function getEnsureValidToken() {
  return globalThis.__AUTH__?.ensureValidToken;
}

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
      email: getUserEmail(user),
      network,
    });

    let outboxResult = null;

    try {
      outboxResult = await runOutboxSync(api, { limit: 10 });
    } catch (e) {
      console.log("[BACKGROUND SYNC] Error outbox:", e?.message || e);

      outboxResult = {
        ok: false,
        reason: "outbox_error",
        error: e?.message || String(e),
      };
    }

    let sapQueueResult = null;

    try {
      sapQueueResult = await processSapQueue({
        apiInstance: api,

        // Mejora importante:
        // Antes la cola SAP se mandaba sin validar token.
        // Ahora primero intenta renovar/validar el token antes de enviar pendientes SAP.
        ensureValidToken: getEnsureValidToken(),
      });
    } catch (e) {
      console.log("[BACKGROUND SYNC] Error cola SAP:", e?.message || e);

      sapQueueResult = {
        ok: false,
        reason: "sap_queue_error",
        error: e?.message || String(e),
      };
    }

    let prefetchResult = null;

    const rolId = Number(user?.rol_id);

    if (rolId === 2) {
      prefetchResult = await runSupervisorPrefetch();
    } else if (rolId === 3) {
      prefetchResult = await runTecnicoFullSync(user);
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
        email: getUserEmail(user),
      },
      outboxResult,
      sapQueueResult,
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
      result?.reason === "no_user" ||
      result?.reason === "sync_already_running"
    ) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (e) {
    console.log("[BACKGROUND FETCH] Error:", e?.message || e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

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