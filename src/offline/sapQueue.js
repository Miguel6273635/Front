import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

/**
 * Cola SAP offline.
 *
 * Objetivo:
 * - Guardar envíos pendientes cuando no hay internet o la red es inestable.
 * - Procesarlos después desde backgroundSync o cuando regrese conexión.
 * - Evitar duplicados usando dedupeKey.
 * - No bloquear pantallas como Detalle de Orden.
 *
 * Tipos soportados:
 * - STATUS
 * - CONFIRMATIONS
 * - SIGNATURE
 * - PDF
 * - GENERIC
 * - PENDIENTE_FIRMA_0300
 *
 * Ejemplo recomendado:
 *
 * upsertSapQueueItem({
 *   type: "STATUS",
 *   orderId,
 *   endpoint: "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
 *   payload,
 *   dedupeKey: `STATUS:${orderId}:0300`,
 * });
 */

const QUEUE_KEY = "sapQueue:v3";
const MAX_TRIES = 8;
const PROCESS_LOCK_KEY = "sapQueue:v3:processing";
const PROCESS_LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutos
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos por request

function nowMs() {
  return Date.now();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function normalizeMethod(method) {
  const m = String(method || "POST").toUpperCase();
  return ["POST", "PATCH", "PUT"].includes(m) ? m : "POST";
}

function normalizeType(type) {
  const t = String(type || "GENERIC").toUpperCase();

  const allowed = [
    "STATUS",
    "CONFIRMATIONS",
    "SIGNATURE",
    "PDF",
    "GENERIC",
    "PENDIENTE_FIRMA_0300",
  ];

  return allowed.includes(t) ? t : "GENERIC";
}

function getAxiosConfig(item = {}) {
  const timeout = Number(item?.timeoutMs || REQUEST_TIMEOUT_MS);

  return {
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : REQUEST_TIMEOUT_MS,
  };
}

async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.log("[SAP QUEUE] loadQueue error:", e?.message || e);
    return [];
  }
}

async function saveQueue(items) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items || []));
  } catch (e) {
    console.log("[SAP QUEUE] saveQueue error:", e?.message || e);
  }
}

async function acquireProcessLock() {
  try {
    const raw = await AsyncStorage.getItem(PROCESS_LOCK_KEY);
    const previous = raw ? Number(raw) : 0;
    const now = nowMs();

    if (Number.isFinite(previous) && previous > 0) {
      const age = now - previous;

      if (age >= 0 && age < PROCESS_LOCK_TTL_MS) {
        return false;
      }
    }

    await AsyncStorage.setItem(PROCESS_LOCK_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

async function releaseProcessLock() {
  try {
    await AsyncStorage.removeItem(PROCESS_LOCK_KEY);
  } catch {}
}

function normalizeQueueItem(input = {}) {
  const orderIdNorm = safeStr(input.orderId);
  const finalKey = safeStr(input.dedupeKey) || safeStr(input.key) || undefined;

  return {
    id: input.id || uid(),
    dedupeKey: finalKey,
    key: finalKey,
    type: normalizeType(input.type),
    orderId: orderIdNorm,
    endpoint: safeStr(input.endpoint),
    method: normalizeMethod(input.method),
    payload: input.payload,
    createdAt: Number(input.createdAt || nowMs()),
    updatedAt: nowMs(),
    tries: Number(input.tries || 0),
    lastError: input.lastError || null,
    timeoutMs: Number(input.timeoutMs || REQUEST_TIMEOUT_MS),
  };
}

/**
 * Inserta o reemplaza un item de la cola.
 *
 * Reglas:
 * - Si viene dedupeKey, reemplaza el item existente con mismo orderId + dedupeKey.
 * - Si no viene dedupeKey, agrega un item nuevo.
 */
export async function upsertSapQueueItem({
  type,
  orderId,
  endpoint,
  method = "POST",
  payload,
  dedupeKey,
  key,
  timeoutMs,
}) {
  const item = normalizeQueueItem({
    type,
    orderId,
    endpoint,
    method,
    payload,
    dedupeKey,
    key,
    timeoutMs,
  });

  const q = await loadQueue();

  if (item.dedupeKey) {
    const idx = q.findIndex(
      (x) =>
        x &&
        safeStr(x.orderId) === item.orderId &&
        safeStr(x.dedupeKey || x.key) === item.dedupeKey,
    );

    if (idx >= 0) {
      const prev = q[idx];

      q[idx] = {
        ...prev,
        ...item,
        id: prev.id,
        createdAt: prev.createdAt,
        tries: Number(prev.tries || 0),
        lastError: null,
        updatedAt: nowMs(),
      };

      await saveQueue(q);

      console.log("[SAP QUEUE] Reemplazado:", {
        type: q[idx].type,
        orderId: q[idx].orderId,
        dedupeKey: q[idx].dedupeKey,
      });

      return q[idx];
    }
  }

  q.push(item);
  await saveQueue(q);

  console.log("[SAP QUEUE] Agregado:", {
    type: item.type,
    orderId: item.orderId,
    dedupeKey: item.dedupeKey,
  });

  return item;
}

export async function addSapQueueItem(args = {}) {
  return upsertSapQueueItem(args);
}

export async function removeSapQueueItemsByKey({ orderId, dedupeKey }) {
  const orderIdNorm = safeStr(orderId);
  const k = safeStr(dedupeKey);

  if (!orderIdNorm || !k) {
    return { ok: false, removed: 0 };
  }

  const q = await loadQueue();
  const before = q.length;

  const next = q.filter(
    (x) =>
      !(
        safeStr(x.orderId) === orderIdNorm &&
        safeStr(x.dedupeKey || x.key) === k
      ),
  );

  await saveQueue(next);

  return {
    ok: true,
    removed: before - next.length,
  };
}

export async function removeSapQueueItemsByOrder(orderId) {
  const orderIdNorm = safeStr(orderId);

  if (!orderIdNorm) {
    return { ok: false, removed: 0 };
  }

  const q = await loadQueue();
  const before = q.length;
  const next = q.filter((x) => safeStr(x.orderId) !== orderIdNorm);

  await saveQueue(next);

  return {
    ok: true,
    removed: before - next.length,
  };
}

async function sendQueueItem(apiInstance, item) {
  const method = normalizeMethod(item.method).toLowerCase();
  const endpoint = safeStr(item.endpoint);

  if (!endpoint) {
    throw new Error("Queue item sin endpoint");
  }

  const config = getAxiosConfig(item);

  if (method === "post") {
    return apiInstance.post(endpoint, item.payload, config);
  }

  if (method === "patch") {
    return apiInstance.patch(endpoint, item.payload, config);
  }

  if (method === "put") {
    return apiInstance.put(endpoint, item.payload, config);
  }

  throw new Error(`Método no soportado: ${method}`);
}

async function processPendienteFirma0300(apiInstance, item) {
  const endpoint = safeStr(item.endpoint);

  console.log("[SAP QUEUE] Procesando PENDIENTE_FIRMA_0300:", {
    orderId: item.orderId,
    endpoint,
    hasPayload: !!item.payload,
    hasHeader: !!item.payload?.WorkOrderHeader,
    hasStatus: Array.isArray(item.payload?.WorkOrderUserStatusSet),
    hasAttachments: Array.isArray(item.payload?.Attachments),
  });

  // Flujo nuevo: un solo JSON con PDF + estatus 0300.
  if (
    endpoint &&
    item.payload?.WorkOrderHeader &&
    Array.isArray(item.payload?.WorkOrderUserStatusSet) &&
    Array.isArray(item.payload?.Attachments)
  ) {
    await apiInstance.post(endpoint, item.payload, getAxiosConfig(item));

    console.log("[SAP QUEUE] OK PENDIENTE_FIRMA_0300 payload único:", {
      orderId: item.orderId,
    });

    return true;
  }

  // Flujo viejo: compatibilidad con items ya guardados.
  const attachmentEndpoint = safeStr(item?.payload?.attachmentEndpoint);
  const statusEndpoint = safeStr(item?.payload?.statusEndpoint);
  const attachmentPayload = item?.payload?.attachmentPayload;
  const statusPayload = item?.payload?.statusPayload;

  if (attachmentEndpoint && attachmentPayload && statusEndpoint && statusPayload) {
    await apiInstance.post(attachmentEndpoint, attachmentPayload, getAxiosConfig(item));
    await apiInstance.post(statusEndpoint, statusPayload, getAxiosConfig(item));

    console.log("[SAP QUEUE] OK PENDIENTE_FIRMA_0300 payload viejo:", {
      orderId: item.orderId,
    });

    return true;
  }

  throw new Error(
    `Queue item PENDIENTE_FIRMA_0300 inválido para orden ${item.orderId}`,
  );
}

/**
 * Procesa la cola en orden FIFO.
 *
 * Importante:
 * - Esta función ya trae lock para no correr dos veces al mismo tiempo.
 * - Úsala preferentemente desde backgroundSync.js.
 * - Si una pantalla la llama y ya está corriendo, regresa sap_queue_already_running.
 */
export async function processSapQueue({ ensureValidToken, apiInstance } = {}) {
  const locked = await acquireProcessLock();

  if (!locked) {
    return {
      ok: false,
      reason: "sap_queue_already_running",
    };
  }

  try {
    const net = await NetInfo.fetch();
    const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);

    if (!isOnline) {
      return { ok: false, reason: "offline" };
    }

    if (!apiInstance) {
      return { ok: false, reason: "missing_apiInstance" };
    }

    let q = await loadQueue();

    if (!q.length) {
      return { ok: true, processed: 0, remaining: 0 };
    }

    q = q.filter(
      (x) => x && (safeStr(x.endpoint) || x.type === "PENDIENTE_FIRMA_0300"),
    );

    const keep = [];
    let processed = 0;
    let failed = 0;
    let skippedMaxTries = 0;

    try {
      const okToken = await ensureValidToken?.();

      if (okToken === false) {
        return {
          ok: false,
          reason: "invalid_token",
          processed: 0,
          remaining: q.length,
        };
      }
    } catch (e) {
      console.log("[SAP QUEUE] ensureValidToken error:", e?.message || e);
    }

    for (const rawItem of q) {
      const item = normalizeQueueItem(rawItem);
      const tries = Number(item?.tries || 0);

      if (tries >= MAX_TRIES) {
        keep.push(item);
        skippedMaxTries++;
        continue;
      }

      try {
        if (item.type === "PENDIENTE_FIRMA_0300") {
          await processPendienteFirma0300(apiInstance, item);
          processed++;
          continue;
        }

        await sendQueueItem(apiInstance, item);
        processed++;

        console.log("[SAP QUEUE] OK:", {
          type: item.type,
          orderId: item.orderId,
          dedupeKey: item.dedupeKey,
        });
      } catch (e) {
        failed++;

        const lastError =
          e?.response?.data?.error?.message?.value ||
          e?.response?.data?.message ||
          e?.message ||
          "error";

        console.log("[SAP QUEUE] ERROR:", {
          type: item.type,
          orderId: item.orderId,
          dedupeKey: item.dedupeKey,
          tries: tries + 1,
          lastError,
        });

        keep.push({
          ...item,
          tries: tries + 1,
          updatedAt: nowMs(),
          lastError,
        });
      }
    }

    await saveQueue(keep);

    return {
      ok: true,
      processed,
      failed,
      remaining: keep.length,
      skippedMaxTries,
    };
  } finally {
    await releaseProcessLock();
  }
}

export async function getSapQueue() {
  return await loadQueue();
}

export async function getSapQueueCount() {
  const q = await loadQueue();

  return {
    total: q.length,
    pending: q.filter((x) => Number(x?.tries || 0) < MAX_TRIES).length,
    maxTries: q.filter((x) => Number(x?.tries || 0) >= MAX_TRIES).length,
  };
}

export async function clearSapQueue() {
  await saveQueue([]);
  await releaseProcessLock();
  return { ok: true };
}

export async function resetSapQueueLock() {
  await releaseProcessLock();
  return { ok: true };
}