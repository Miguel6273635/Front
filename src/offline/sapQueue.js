// src/offline/sapQueue.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

/**
 * ✅ Cola SAP con "dedupeKey" para pisar estatus:
 * - Estatus (0400 / 0300 / etc) deben usar dedupeKey = `STATUS:<orderId>`
 * - Confirmaciones NO deben pisarse normalmente (dedupeKey opcional)
 *
 * Uso recomendado desde tu index:
 *   upsertSapQueueItem({
 *     type: "STATUS",
 *     orderId,
 *     endpoint: "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
 *     payload,
 *     dedupeKey: `STATUS:${orderId}`,
 *   })
 */

const QUEUE_KEY = "sapQueue:v3";
const MAX_TRIES = 8;

function nowMs() {
  return Date.now();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

function normalizeMethod(method) {
  const m = String(method || "POST").toUpperCase();
  return ["POST", "PATCH", "PUT"].includes(m) ? m : "POST";
}

function normalizeType(type) {
  const t = String(type || "GENERIC").toUpperCase();
  // puedes agregar más tipos si quieres
  const allowed = ["STATUS", "CONFIRMATIONS", "SIGNATURE", "PDF", "GENERIC"];
  return allowed.includes(t) ? t : "GENERIC";
}

function safeStr(v) {
  return String(v ?? "").trim();
}

/**
 * ✅ Inserta o reemplaza item
 * Reglas:
 * - Si viene dedupeKey (o key legacy), se busca item existente con:
 *    same orderId + same dedupeKey
 *   y se REEMPLAZA el payload/endpoint/method manteniendo id/createdAt/tries.
 * - Si no viene dedupeKey, solo hace append.
 */
export async function upsertSapQueueItem({
  type,
  orderId,
  endpoint,
  method = "POST",
  payload,

  // ✅ NUEVO
  dedupeKey,

  // 🔁 legacy (compat)
  key,
}) {
  const orderIdNorm = safeStr(orderId);

  const finalKey = safeStr(dedupeKey) || safeStr(key) || undefined;

  const item = {
    id: uid(),
    // guardamos en ambos por compat
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

  const q = await loadQueue();

  // ✅ Dedupe/replace
  if (item.dedupeKey) {
    const idx = q.findIndex(
      (x) =>
        x &&
        safeStr(x.orderId) === item.orderId &&
        safeStr(x.dedupeKey || x.key) === item.dedupeKey
    );

    if (idx >= 0) {
      const prev = q[idx];

      q[idx] = {
        ...prev,
        ...item,
        id: prev.id, // mantiene identidad
        createdAt: prev.createdAt,
        tries: Number(prev.tries || 0), // mantiene tries
        // lastError se limpia porque es "nuevo intento lógico"
        lastError: null,
      };

      await saveQueue(q);
      return q[idx];
    }
  }

  // append
  q.push(item);
  await saveQueue(q);
  return item;
}

/**
 * ✅ Útil si quieres limpiar estatus viejos manualmente (opcional)
 */
export async function removeSapQueueItemsByKey({ orderId, dedupeKey }) {
  const orderIdNorm = safeStr(orderId);
  const k = safeStr(dedupeKey);
  if (!orderIdNorm || !k) return { ok: false, removed: 0 };

  const q = await loadQueue();
  const before = q.length;

  const next = q.filter(
    (x) => !(safeStr(x.orderId) === orderIdNorm && safeStr(x.dedupeKey || x.key) === k)
  );

  await saveQueue(next);
  return { ok: true, removed: before - next.length };
}

/**
 * Procesa la cola en orden FIFO.
 * - Solo intenta items con tries < MAX_TRIES.
 * - Si falla, incrementa tries y conserva item.
 * - Si éxito, lo elimina.
 */
export async function processSapQueue({ ensureValidToken, apiInstance } = {}) {
  const net = await NetInfo.fetch();
  const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);

  if (!isOnline) return { ok: false, reason: "offline" };
  if (!apiInstance) return { ok: false, reason: "missing_apiInstance" };

  let q = await loadQueue();
  if (!q.length) return { ok: true, processed: 0, remaining: 0 };

  // Normaliza por si hay basura
  q = q.filter((x) => x && safeStr(x.endpoint));

  const keep = [];
  let processed = 0;
  let skippedMaxTries = 0;

  try {
    await ensureValidToken?.();
  } catch {}

  for (const item of q) {
    const tries = Number(item?.tries || 0);

    if (tries >= MAX_TRIES) {
      // lo dejamos tal cual (o podrías moverlo a "dead letter")
      keep.push(item);
      skippedMaxTries++;
      continue;
    }

    try {
      const method = normalizeMethod(item.method).toLowerCase();
      const endpoint = safeStr(item.endpoint);

      if (!endpoint) throw new Error("Queue item sin endpoint");

      if (method === "post") {
        await apiInstance.post(endpoint, item.payload);
      } else if (method === "patch") {
        await apiInstance.patch(endpoint, item.payload);
      } else if (method === "put") {
        await apiInstance.put(endpoint, item.payload);
      } else {
        throw new Error("Método no soportado");
      }

      processed++;
      // ✅ éxito => NO se conserva
    } catch (e) {
      keep.push({
        ...item,
        tries: tries + 1,
        updatedAt: nowMs(),
        lastError: e?.message || "error",
      });
    }
  }

  await saveQueue(keep);

  return {
    ok: true,
    processed,
    remaining: keep.length,
    skippedMaxTries,
  };
}

/**
 * Helpers opcionales
 */
export async function getSapQueue() {
  return await loadQueue();
}

export async function clearSapQueue() {
  await saveQueue([]);
  return { ok: true };
}
