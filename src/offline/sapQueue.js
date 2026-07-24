import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

const QUEUE_KEY = "sapQueue:v3";
const STATUS_ACK_KEY = "sapQueue:statusAck:v1";
const MAX_TRIES = 8;
export const STATUS_ACK_GRACE_MS = 2 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeStr(value) {
  return String(value ?? "").trim();
}

async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveQueue(items) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items || []));
  } catch {}
}

async function loadStatusAcks() {
  try {
    const raw = await AsyncStorage.getItem(STATUS_ACK_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveStatusAcks(acks) {
  try {
    await AsyncStorage.setItem(STATUS_ACK_KEY, JSON.stringify(acks || {}));
  } catch {}
}

function normalizeMethod(method) {
  const value = String(method || "POST").toUpperCase();
  return ["POST", "PATCH", "PUT"].includes(value) ? value : "POST";
}

function normalizeType(type) {
  const value = String(type || "GENERIC").toUpperCase();
  const allowed = [
    "STATUS",
    "CONFIRMATIONS",
    "SIGNATURE",
    "PDF",
    "GENERIC",
    "PENDIENTE_FIRMA_0300",
    "PENDIENTE_FIRMA_BULK_0300",
  ];
  return allowed.includes(value) ? value : "GENERIC";
}

function addOrderId(target, value) {
  const clean = safeStr(value);
  if (clean) target.add(clean);
}

function collectOrderIdsFromValue(value, target, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectOrderIdsFromValue(item, target, depth + 1));
    return;
  }

  if (typeof value !== "object") return;

  Object.entries(value).forEach(([key, child]) => {
    const normalizedKey = String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();

    if (normalizedKey === "orderid") {
      addOrderId(target, child);
      return;
    }

    collectOrderIdsFromValue(child, target, depth + 1);
  });
}

export function getQueueItemOrderIds(item) {
  const result = new Set();
  const type = normalizeType(item?.type);
  const dedupeKey = safeStr(item?.dedupeKey || item?.key);

  if (type === "STATUS" || type.includes("PENDIENTE_FIRMA")) {
    addOrderId(result, item?.orderId);
  }

  if (dedupeKey.startsWith("STATUS:")) {
    addOrderId(result, dedupeKey.slice("STATUS:".length));
  }

  collectOrderIdsFromValue(item?.payload, result);
  return Array.from(result);
}

function isStatusQueueItem(item) {
  const type = normalizeType(item?.type);
  const dedupeKey = safeStr(item?.dedupeKey || item?.key);
  return type === "STATUS" || type.includes("PENDIENTE_FIRMA") || dedupeKey.startsWith("STATUS:");
}

async function registerSuccessfulStatusItem(item) {
  if (!isStatusQueueItem(item)) return;

  const orderIds = getQueueItemOrderIds(item);
  if (!orderIds.length) return;

  const acks = await loadStatusAcks();
  const sentAt = nowMs();

  orderIds.forEach((orderId) => {
    acks[orderId] = sentAt;
  });

  await saveStatusAcks(acks);
}

export async function getSapQueueStatusState() {
  const [queue, storedAcks] = await Promise.all([loadQueue(), loadStatusAcks()]);
  const pendingOrderIds = new Set();

  queue.forEach((item) => {
    if (!isStatusQueueItem(item)) return;
    getQueueItemOrderIds(item).forEach((orderId) => pendingOrderIds.add(orderId));
  });

  const cutoff = nowMs() - STATUS_ACK_GRACE_MS;
  const recentAcks = {};
  let changed = false;

  Object.entries(storedAcks || {}).forEach(([orderId, sentAt]) => {
    const timestamp = Number(sentAt || 0);
    if (timestamp >= cutoff) recentAcks[orderId] = timestamp;
    else changed = true;
  });

  if (changed) await saveStatusAcks(recentAcks);

  return { pendingOrderIds, recentAcks };
}

export async function clearSapStatusAck(orderId) {
  const cleanOrderId = safeStr(orderId);
  if (!cleanOrderId) return false;

  const acks = await loadStatusAcks();
  if (!acks[cleanOrderId]) return true;

  delete acks[cleanOrderId];
  await saveStatusAcks(acks);
  return true;
}

export async function upsertSapQueueItem({
  type,
  orderId,
  endpoint,
  method = "POST",
  payload,
  dedupeKey,
  key,
}) {
  const orderIdNorm = safeStr(orderId);
  const finalKey = safeStr(dedupeKey) || safeStr(key) || undefined;
  const item = {
    id: uid(),
    dedupeKey: finalKey,
    key: finalKey,
    type: normalizeType(type),
    orderId: orderIdNorm,
    endpoint: safeStr(endpoint),
    method: normalizeMethod(method),
    payload,
    createdAt: nowMs(),
    updatedAt: nowMs(),
    tries: 0,
    lastError: null,
  };

  const queue = await loadQueue();

  if (item.dedupeKey) {
    const index = queue.findIndex(
      (queued) =>
        queued &&
        safeStr(queued.orderId) === item.orderId &&
        safeStr(queued.dedupeKey || queued.key) === item.dedupeKey,
    );

    if (index >= 0) {
      const previous = queue[index];
      queue[index] = {
        ...previous,
        ...item,
        id: previous.id,
        createdAt: previous.createdAt,
        // Es una acción nueva que sustituye a la anterior, por lo tanto
        // también recibe una nueva oportunidad completa de sincronización.
        tries: 0,
        lastError: null,
      };
      await saveQueue(queue);
      return queue[index];
    }
  }

  queue.push(item);
  await saveQueue(queue);
  return item;
}

export async function removeSapQueueItemsByKey({ orderId, dedupeKey }) {
  const orderIdNorm = safeStr(orderId);
  const key = safeStr(dedupeKey);
  if (!orderIdNorm || !key) return { ok: false, removed: 0 };

  const queue = await loadQueue();
  const next = queue.filter(
    (item) =>
      !(safeStr(item.orderId) === orderIdNorm && safeStr(item.dedupeKey || item.key) === key),
  );

  await saveQueue(next);
  return { ok: true, removed: queue.length - next.length };
}

export async function processSapQueue({ ensureValidToken, apiInstance } = {}) {
  const net = await NetInfo.fetch();
  const online = !!(net?.isConnected && net?.isInternetReachable !== false);

  if (!online) return { ok: false, reason: "offline" };
  if (!apiInstance) return { ok: false, reason: "missing_apiInstance" };

  let queue = await loadQueue();
  if (!queue.length) return { ok: true, processed: 0, remaining: 0 };

  queue = queue.filter(
    (item) => item && (safeStr(item.endpoint) || normalizeType(item.type).includes("PENDIENTE_FIRMA")),
  );

  const keep = [];
  let processed = 0;
  let skippedMaxTries = 0;
  let discardedMaxTries = 0;

  try {
    await ensureValidToken?.();
  } catch {}

  for (const item of queue) {
    const tries = Number(item?.tries || 0);

    if (tries >= MAX_TRIES) {
      skippedMaxTries++;
      discardedMaxTries++;
      continue;
    }

    try {
      if (normalizeType(item.type) === "PENDIENTE_FIRMA_0300") {
        const endpoint = safeStr(item.endpoint);

        if (
          endpoint &&
          item.payload?.WorkOrderHeader &&
          Array.isArray(item.payload?.WorkOrderUserStatusSet) &&
          Array.isArray(item.payload?.Attachments)
        ) {
          await apiInstance.post(endpoint, item.payload);
        } else {
          const attachmentEndpoint = safeStr(item?.payload?.attachmentEndpoint);
          const statusEndpoint = safeStr(item?.payload?.statusEndpoint);
          const attachmentPayload = item?.payload?.attachmentPayload;
          const statusPayload = item?.payload?.statusPayload;

          if (!attachmentEndpoint || !attachmentPayload || !statusEndpoint || !statusPayload) {
            throw new Error(`Queue item PENDIENTE_FIRMA_0300 inválido para orden ${item.orderId}`);
          }

          await apiInstance.post(attachmentEndpoint, attachmentPayload);
          await apiInstance.post(statusEndpoint, statusPayload);
        }
      } else {
        const method = normalizeMethod(item.method).toLowerCase();
        const endpoint = safeStr(item.endpoint);
        if (!endpoint) throw new Error("Queue item sin endpoint");

        if (method === "post") await apiInstance.post(endpoint, item.payload);
        else if (method === "patch") await apiInstance.patch(endpoint, item.payload);
        else if (method === "put") await apiInstance.put(endpoint, item.payload);
        else throw new Error("Método no soportado");
      }

      await registerSuccessfulStatusItem(item);
      processed++;
    } catch (error) {
      const nextTries = tries + 1;

      if (nextTries >= MAX_TRIES) {
        discardedMaxTries++;
        console.warn("[SAP QUEUE] Elemento descartado por máximo de intentos:", {
          id: item?.id,
          type: item?.type,
          orderId: item?.orderId,
          tries: nextTries,
          lastError: error?.message || "error",
        });
      } else {
        keep.push({
          ...item,
          tries: nextTries,
          updatedAt: nowMs(),
          lastError: error?.message || "error",
        });
      }
    }
  }

  await saveQueue(keep);
  return {
    ok: true,
    processed,
    remaining: keep.length,
    skippedMaxTries,
    discardedMaxTries,
  };
}

export async function getSapQueue() {
  return loadQueue();
}

export async function clearSapQueue() {
  await saveQueue([]);
  return { ok: true };
}