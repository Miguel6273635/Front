// src/offline/backgroundSync.js
// Sincronización en segundo plano para Mike-dev
// Objetivo corregido:
//
/*
  Miguel Ángel Hernández Álvarez - 01/07/2026

  Separación importante:
  1) runPendingSendsOnly:
     - Solo envía pendientes.
     - NO precarga órdenes.
     - NO precarga operaciones.
     - NO precarga componentes.
     - NO precarga consumibles.

  2) runBackgroundSyncNow:
     - Se conserva como sincronización completa/pesada.
     - Debe ejecutarse únicamente desde la pantalla de precarga
       o desde un botón explícito de recarga/precarga completa.

  Con esto, Inicio Técnico, app/index, background fetch y pantallas normales
  pueden mandar pendientes en segundo plano sin volver a consumir datos SAP
  de forma masiva.
*/

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import api from "../services/api";
import { ensureValidAuthToken } from "../services/tokenManager";
import { runOutboxSync } from "./syncEngine";
import { bootstrapPrefetchOrdenesSupervisor } from "./bootstrapSync";
import { syncTecnicoPendingActions } from "./tecnicoPendingSync";
import { bootstrapPrefetchConsumiblesCatalogo } from "./bootstrapConsumiblesCatalogo";
import { processSapQueue } from "./sapQueue";
import { processCheckinQueueForUser } from "./checkinQueue";

const BACKGROUND_SYNC_TASK = "MITSU_BACKGROUND_SYNC_TASK";

const LAST_SYNC_KEY = "ultima_sincronizacion";
const LAST_SYNC_RESULT_KEY = "ultima_sincronizacion_resultado";
const BG_USER_KEY = "background_sync_user";
const BG_RUNNING_KEY = "background_sync_running";

const DEFAULT_MINIMUM_INTERVAL_SECONDS = 15 * 60; // 15 minutos

// Si por algún cierre raro de la app se queda la bandera prendida,
// después de este tiempo dejamos volver a sincronizar.
const RUNNING_LOCK_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutos

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
  try {
    const raw = await AsyncStorage.getItem(BG_RUNNING_KEY);

    if (!raw) return false;

    // Compatibilidad con versión vieja que guardaba solo "1".
    if (raw === "1") return true;

    const obj = JSON.parse(raw);
    const startedAt = Number(obj?.startedAt || 0);

    if (!Number.isFinite(startedAt) || startedAt <= 0) {
      return true;
    }

    const age = Date.now() - startedAt;

    if (age > RUNNING_LOCK_MAX_AGE_MS) {
      console.log("[BACKGROUND SYNC] Limpiando lock viejo:", {
        ageMs: age,
      });

      await AsyncStorage.removeItem(BG_RUNNING_KEY);
      return false;
    }

    return true;
  } catch {
    return true;
  }
}

async function setSyncRunning(value, source = "unknown") {
  if (value) {
    await AsyncStorage.setItem(
      BG_RUNNING_KEY,
      JSON.stringify({
        running: true,
        source,
        startedAt: Date.now(),
      }),
    );

    return;
  }

  await AsyncStorage.removeItem(BG_RUNNING_KEY);
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

/*
  Esta función reemplaza el uso directo de globalThis.__AUTH__.
  Así backgroundSync puede validar token aunque AuthContext no esté montado.
*/
function getEnsureValidToken() {
  return async () => {
    const r = await ensureValidAuthToken({
      source: "background_sync",
    });

    return !!r?.ok;
  };
}

async function runSapQueueSync() {
  try {
    if (typeof processSapQueue !== "function") {
      return {
        ok: false,
        reason: "processSapQueue_not_available",
      };
    }

    const result = await processSapQueue({
      apiInstance: api,
      ensureValidToken: getEnsureValidToken(),
    });

    return {
      ok: true,
      result,
    };
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] Error cola SAP:",
      e?.response?.data || e?.message || e,
    );

    return {
      ok: false,
      reason: "sap_queue_error",
      error: e?.message || String(e),
    };
  }
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

    return await fn(userEmail, {
      apiInstance: api,
      ensureValidToken: getEnsureValidToken(),
    });
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
  let checkinQueueResult = null;
  let tecnicoPendingResult = null;
  let tecnicoPrefetchResult = null;
  let consumiblesResult = null;

  /*
    Miguel Ángel Hernández Álvarez - 30/06/2026

    Ahora el check-in también se procesa desde backgroundSync.
    Antes dependía principalmente de app/tecnico/ordenes/index.js.
    Con esto, si la app corre en segundo plano o Android despierta la tarea,
    también intenta enviar la foto de check-in y el estatus pendiente.
  */
  try {
    checkinQueueResult = await processCheckinQueueForUser(user, {
      apiInstance: api,
      ensureValidToken: getEnsureValidToken(),
    });
  } catch (e) {
    console.log(
      "[BACKGROUND SYNC] Error cola check-in:",
      e?.response?.data || e?.message || e,
    );

    checkinQueueResult = {
      ok: false,
      reason: "checkin_queue_error",
      error: e?.message || String(e),
    };
  }

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
    consumiblesResult = await bootstrapPrefetchConsumiblesCatalogo({
      coberturaTipo: "BASICA",
    });
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
    checkinQueueResult,
    tecnicoPendingResult,
    tecnicoPrefetchResult,
    consumiblesResult,
  };
}


/*
  Miguel Ángel Hernández Álvarez - 01/07/2026

  Esta función es la que deben usar:
  - app/index.js
  - app/tecnico/index.js
  - BackgroundFetch automático
  - cualquier pantalla que solo necesite enviar pendientes

  IMPORTANTE:
  Aquí NO se llama:
  - runTecnicoPrefetch
  - prefetchOrdenesTecnico
  - bootstrapPrefetchConsumiblesCatalogo
  - bootstrapPrefetchOrdenesSupervisor

  Por eso no vuelve a disparar peticiones masivas de componentes como:
  /api/operaciones/ordenes/{orden}/operaciones/{actividad}/componentes
*/
export async function runPendingSendsOnly(options = {}) {
  const { force = false, source = "pending_sends_only" } = options;

  const alreadyRunning = await isSyncRunning();

  if (alreadyRunning && !force) {
    return {
      ok: false,
      reason: "sync_already_running",
      source,
      mode: "pending_sends_only",
    };
  }

  await setSyncRunning(true, source);

  try {
    const user = await getStoredUser();

    if (!user) {
      const result = {
        ok: false,
        reason: "no_user",
        source,
        mode: "pending_sends_only",
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
        mode: "pending_sends_only",
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
        mode: "pending_sends_only",
        network,
      };

      await saveSyncResult(result);
      return result;
    }

    /*
      Para enviar pendientes también validamos token.
      Esto NO precarga nada, solo prepara autorización para outbox/SAP queue.
    */
    const tokenReady = await ensureValidAuthToken({
      source,
    });

    if (!tokenReady?.ok) {
      const result = {
        ok: false,
        reason: "token_not_available",
        tokenReason: tokenReady?.reason || null,
        source,
        mode: "pending_sends_only",
        network,
      };

      await saveSyncResult(result);
      return result;
    }

    console.log("[BACKGROUND SEND ONLY] Iniciando envío de pendientes:", {
      source,
      rol_id: user?.rol_id,
      email: getUserEmail(user),
      network,
    });

    let outboxResult = null;
    let sapQueueResult = null;
    let checkinQueueResult = null;
    let tecnicoPendingResult = null;

    try {
      outboxResult = await runOutboxSync(api, { limit: 10 });
    } catch (e) {
      console.log("[BACKGROUND SEND ONLY] Error outbox:", e?.message || e);

      outboxResult = {
        ok: false,
        reason: "outbox_error",
        error: e?.message || String(e),
      };
    }

    try {
      sapQueueResult = await runSapQueueSync();
    } catch (e) {
      console.log(
        "[BACKGROUND SEND ONLY] Error SAP queue:",
        e?.response?.data || e?.message || e,
      );

      sapQueueResult = {
        ok: false,
        reason: "sap_queue_error",
        error: e?.message || String(e),
      };
    }

    const rolId = Number(user?.rol_id);

    if (rolId === 3) {
      try {
        checkinQueueResult = await processCheckinQueueForUser(user, {
          apiInstance: api,
          ensureValidToken: getEnsureValidToken(),
        });
      } catch (e) {
        console.log(
          "[BACKGROUND SEND ONLY] Error cola check-in:",
          e?.response?.data || e?.message || e,
        );

        checkinQueueResult = {
          ok: false,
          reason: "checkin_queue_error",
          error: e?.message || String(e),
        };
      }

      try {
        tecnicoPendingResult = await syncTecnicoPendingActions(user, api, {
          limit: 5,
        });
      } catch (e) {
        console.log(
          "[BACKGROUND SEND ONLY] Error pendientes técnico:",
          e?.response?.data || e?.message || e,
        );

        tecnicoPendingResult = {
          ok: false,
          reason: "tecnico_pending_error",
          error: e?.message || String(e),
        };
      }
    } else {
      checkinQueueResult = {
        ok: true,
        skipped: true,
        reason: "role_not_tecnico",
        rol_id: user?.rol_id,
      };

      tecnicoPendingResult = {
        ok: true,
        skipped: true,
        reason: "role_not_tecnico",
        rol_id: user?.rol_id,
      };
    }

    const result = {
      ok: true,
      source,
      mode: "pending_sends_only",
      network,
      user: {
        rol_id: user?.rol_id,
        email: getUserEmail(user),
      },
      outboxResult,
      sapQueueResult,
      checkinQueueResult,
      tecnicoPendingResult,

      /*
        Bandera visible en logs para confirmar que esta función NO hizo
        precarga pesada.
      */
      prefetchSkipped: true,
      consumiblesSkipped: true,

      finishedAt: new Date().toISOString(),
    };

    await saveSyncResult(result);

    console.log("[BACKGROUND SEND ONLY] Finalizado:", result);

    return result;
  } catch (e) {
    const result = {
      ok: false,
      reason: "pending_sends_only_error",
      source,
      mode: "pending_sends_only",
      error: e?.message || String(e),
    };

    await saveSyncResult(result);

    console.log("[BACKGROUND SEND ONLY] Error general:", e?.message || e);

    return result;
  } finally {
    await setSyncRunning(false, source);
  }
}


export async function runBackgroundSyncNow(options = {}) {
  /*
    Miguel Ángel Hernández Álvarez - 01/07/2026

    Esta función queda como sincronización COMPLETA/PESADA.
    Úsala solamente desde la pantalla de precarga o desde una acción explícita
    donde sí se quiera volver a traer órdenes, detalles, componentes y consumibles.

    Para Inicio Técnico, app/index y BackgroundFetch usa runPendingSendsOnly.
  */
  const { force = false, source = "manual" } = options;

  const alreadyRunning = await isSyncRunning();

  if (alreadyRunning && !force) {
    return {
      ok: false,
      reason: "sync_already_running",
      source,
    };
  }

  await setSyncRunning(true, source);

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

    /*
      Antes de mandar cola, órdenes, componentes o consumibles,
      validamos/renovamos token usando tokenManager.
    */
    const tokenReady = await ensureValidAuthToken({
      source,
    });

    if (!tokenReady?.ok) {
      const result = {
        ok: false,
        reason: "token_not_available",
        tokenReason: tokenReady?.reason || null,
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

    // Cola SAP centralizada:
    // Esto evita que pantallas como detalle de orden tengan que procesar SAP
    // mientras el usuario está esperando que cargue la vista.
    const sapQueueResult = await runSapQueueSync();

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
    await setSyncRunning(false, source);
  }
}


/*
  Alias opcional para que desde la pantalla de precarga se pueda llamar
  con un nombre más claro.
*/
export async function runFullPreloadNow(options = {}) {
  return runBackgroundSyncNow({
    ...options,
    source: options?.source || "full_preload",
  });
}


TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    console.log("[BACKGROUND FETCH] Android despertó la app");

    /*
      Miguel Ángel Hernández Álvarez - 01/07/2026

      BackgroundFetch automático NO debe precargar órdenes/componentes.
      Solo debe intentar enviar pendientes guardados.
    */
    const result = await runPendingSendsOnly({
      source: "background_fetch_send_only",
    });

    if (result?.ok) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    if (
      result?.reason === "offline" ||
      result?.reason === "network_not_stable" ||
      result?.reason === "no_user" ||
      result?.reason === "sync_already_running" ||
      result?.reason === "token_not_available"
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
      /*
        Miguel Ángel Hernández Álvarez - 01/07/2026

        Al registrar la tarea no hacemos precarga pesada.
        Solo intentamos enviar pendientes si existen.
      */
      runPendingSendsOnly({
        source: "foreground_register_send_only",
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