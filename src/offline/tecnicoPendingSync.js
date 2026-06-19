// src/offline/tecnicoPendingSync.js
//
// Sincronización de pendientes del técnico en segundo plano.
// Objetivo:
// - Buscar check-ins guardados en cola offline.
// - Enviar foto/evidencia a SAP.
// - Enviar cambio de estatus a SAP.
// - Eliminar de la cola solo cuando se mandó correctamente.
// - No bloquear pantallas del técnico.

import AsyncStorage from "@react-native-async-storage/async-storage";

const CHECKIN_QUEUE_PREFIX = "checkin_queue_v1_";

/**
 * Normaliza estatus SAP a 4 dígitos.
 * Ejemplo:
 * 100  -> 0100
 * 200  -> 0200
 * 0300 -> 0300
 */
function normalizeCode(code) {
  if (code === null || code === undefined) return "";

  const s = String(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;

  return String(n).padStart(4, "0");
}

/**
 * Obtiene correo del usuario técnico.
 */
function getUserEmail(user) {
  return (
    user?.correo ||
    user?.email ||
    user?.Email ||
    user?.username ||
    user?.preferred_username ||
    user?.mail ||
    user?.upn ||
    null
  );
}

/**
 * Genera la misma key que usa app/tecnico/ordenes/index.js
 */
function makeCheckinQueueKey(userEmail) {
  const safe =
    String(userEmail || "anon")
      .toLowerCase()
      .trim() || "anon";

  return `${CHECKIN_QUEUE_PREFIX}${safe}`;
}

/**
 * Carga cola de check-in de un usuario.
 */
async function loadCheckinQueueByKey(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];

    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.log("[TECNICO PENDING] Error leyendo cola:", key, e?.message || e);
    return [];
  }
}

/**
 * Guarda cola de check-in.
 */
async function saveCheckinQueueByKey(key, arr) {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify(Array.isArray(arr) ? arr : []),
    );

    return true;
  } catch (e) {
    console.log("[TECNICO PENDING] Error guardando cola:", key, e?.message || e);
    return false;
  }
}

/**
 * Obtiene todas las colas de check-in.
 * Normalmente se usará la del usuario actual, pero esto permite rescatar
 * pendientes aunque el correo se guardara con otra variante.
 */
async function getCheckinQueueKeys(userEmail = null) {
  const keys = new Set();

  if (userEmail) {
    keys.add(makeCheckinQueueKey(userEmail));
  }

  try {
    const allKeys = await AsyncStorage.getAllKeys();

    (allKeys || []).forEach((key) => {
      if (String(key).startsWith(CHECKIN_QUEUE_PREFIX)) {
        keys.add(key);
      }
    });
  } catch (e) {
    console.log("[TECNICO PENDING] Error leyendo keys:", e?.message || e);
  }

  return Array.from(keys);
}

/**
 * Envía evidencia/foto de check-in a SAP.
 */
async function postCheckinEvidence(apiInstance, orderId, base64) {
  const cleanOrderId = String(orderId || "").trim();
  const cleanBase64 = String(base64 || "").trim();

  if (!cleanOrderId) {
    throw new Error("orderId requerido para evidencia");
  }

  if (!cleanBase64) {
    throw new Error("base64 requerido para evidencia");
  }

  const payload = {
    WorkOrderHeader: {
      Orderid: cleanOrderId,
    },
    Attachments: [
      {
        DocId: cleanOrderId,
        FileName: `CHECKIN_${cleanOrderId}.jpg`,
        MimeType: "image/jpeg",
        Base64: cleanBase64,
      },
    ],
    Return: [],
  };

  console.log("[TECNICO PENDING][CHECKIN FOTO] Enviando evidencia:", {
    orderId: cleanOrderId,
    base64Length: cleanBase64.length,
  });

  await apiInstance.post(
    `/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet?sap-client=400&sap-language=ES`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return {
    ok: true,
    orderId: cleanOrderId,
  };
}

/**
 * Envía cambio de estatus a SAP.
 *
 * Mantengo la estructura BulkSet porque tu app ya estaba usando ese flujo
 * en app/tecnico/ordenes/index.js.
 */
async function postChangeStatusToSap(apiInstance, orderId, statusCode = "0100") {
  const cleanOrderId = String(orderId || "").trim();
  const finalStatus = normalizeCode(statusCode) || "0100";

  if (!cleanOrderId) {
    throw new Error("orderId requerido para cambio de estatus");
  }

  const payload = {
    BulkId: `PENDIENTE_TEC_${Date.now()}`,
    WorkOrderSet: [
      {
        OrderId: cleanOrderId,
        WorkOrderHeader: {
          Orderid: cleanOrderId,
        },
        WorkOrderUserStatusSet: [
          {
            UserStText: finalStatus,
            Langu: "ES",
            Inactive: "",
          },
        ],
        Return: [],
      },
    ],
  };

  console.log("[TECNICO PENDING][STATUS] Enviando estatus:", {
    orderId: cleanOrderId,
    finalStatus,
  });

  await apiInstance.post(
    `/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderBulkSet?sap-client=400&sap-language=ES`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return {
    ok: true,
    orderId: cleanOrderId,
    statusCode: finalStatus,
  };
}

/**
 * Sincroniza un item de check-in.
 */
async function syncCheckinItem(apiInstance, item) {
  const orderId = String(item?.orderId || item?.Orderid || "").trim();

  const photoBase64 = String(
    item?.photoBase64 ||
      item?.base64 ||
      item?.imageBase64 ||
      item?.evidenciaBase64 ||
      "",
  ).trim();

  const statusCode = normalizeCode(
    item?.statusCode ||
      item?.estatus_code ||
      item?.UserStText ||
      item?.userstatus ||
      "0100",
  );

  if (!orderId) {
    return {
      ok: false,
      remove: true,
      reason: "missing_orderId",
    };
  }

  if (!photoBase64) {
    return {
      ok: false,
      remove: true,
      orderId,
      reason: "missing_photoBase64",
    };
  }

  await postCheckinEvidence(apiInstance, orderId, photoBase64);
  await postChangeStatusToSap(apiInstance, orderId, statusCode);

  return {
    ok: true,
    orderId,
    statusCode,
  };
}

/**
 * Sincroniza pendientes de check-in guardados en AsyncStorage.
 *
 * Esta función se llama desde backgroundSync.js.
 */
async function syncCheckinQueues(user, apiInstance, options = {}) {
  const { limit = 5 } = options;

  const userEmail = getUserEmail(user);
  const keys = await getCheckinQueueKeys(userEmail);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let removedInvalid = 0;

  const details = [];

  for (const key of keys) {
    if (processed >= limit) break;

    const queue = await loadCheckinQueueByKey(key);

    if (!queue.length) {
      details.push({
        key,
        total: 0,
        sent: 0,
        failed: 0,
      });

      continue;
    }

    const ordered = [...queue].sort(
      (a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0),
    );

    const remaining = [];
    let keySent = 0;
    let keyFailed = 0;
    let keyInvalid = 0;

    for (const item of ordered) {
      if (processed >= limit) {
        remaining.push(item);
        continue;
      }

      processed += 1;

      try {
        const result = await syncCheckinItem(apiInstance, item);

        if (result?.ok) {
          sent += 1;
          keySent += 1;

          console.log("[TECNICO PENDING] Check-in enviado:", {
            orderId: result.orderId,
            statusCode: result.statusCode,
          });

          continue;
        }

        if (result?.remove) {
          removedInvalid += 1;
          keyInvalid += 1;

          console.log("[TECNICO PENDING] Item inválido removido:", result);
          continue;
        }

        failed += 1;
        keyFailed += 1;
        remaining.push(item);
      } catch (e) {
        failed += 1;
        keyFailed += 1;

        const status = e?.response?.status;
        const errorText =
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          String(e);

        const nextItem = {
          ...item,
          attempts: Number(item?.attempts || 0) + 1,
          lastError: status ? `HTTP ${status}: ${errorText}` : errorText,
          lastAttemptAt: new Date().toISOString(),
        };

        remaining.push(nextItem);

        console.log("[TECNICO PENDING] Error enviando check-in:", {
          orderId: item?.orderId,
          status,
          error: errorText,
        });

        /**
         * Si no hubo status HTTP, probablemente se cayó internet o no llegó al servidor.
         * Cortamos para no marcar todos los pendientes como error.
         */
        if (!status) {
          const restIndex = ordered.indexOf(item) + 1;
          remaining.push(...ordered.slice(restIndex));
          break;
        }

        /**
         * Si el token falló aun después del interceptor de api.js,
         * también cortamos.
         */
        if (status === 401) {
          const restIndex = ordered.indexOf(item) + 1;
          remaining.push(...ordered.slice(restIndex));
          break;
        }
      }
    }

    await saveCheckinQueueByKey(key, remaining);

    details.push({
      key,
      before: queue.length,
      after: remaining.length,
      sent: keySent,
      failed: keyFailed,
      removedInvalid: keyInvalid,
    });
  }

  return {
    ok: true,
    type: "checkin_queue",
    processed,
    sent,
    failed,
    removedInvalid,
    details,
  };
}

/**
 * Función principal para pendientes del técnico.
 *
 * Aquí después podemos agregar:
 * - TBM/KY pendiente
 * - finalización pendiente
 * - carta no mantenimiento pendiente
 * - PDFs pendientes
 * - aviso de avería pendiente
 */
export async function syncTecnicoPendingActions(user, apiInstance, options = {}) {
  const { limit = 5 } = options;

  if (!user) {
    return {
      ok: false,
      reason: "no_user",
    };
  }

  if (!apiInstance) {
    return {
      ok: false,
      reason: "no_api_instance",
    };
  }

  const userEmail = getUserEmail(user);

  console.log("[TECNICO PENDING] Iniciando sincronización:", {
    userEmail,
    limit,
  });

  const checkinResult = await syncCheckinQueues(user, apiInstance, {
    limit,
  });

  const result = {
    ok: true,
    userEmail,
    checkinResult,
    finishedAt: new Date().toISOString(),
  };

  console.log("[TECNICO PENDING] Finalizado:", result);

  return result;
}

export default syncTecnicoPendingActions;