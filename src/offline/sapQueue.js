// src/offline/sapQueue.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import api from "../services/api";

const QUEUE_KEY = "sapQueue:v2";
const MAX_TRIES = 8; // evita loops eternos

function nowMs() {
  return Date.now();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(items) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items || []));
  } catch {}
}

/**
 * Item schema:
 * {
 *   id,
 *   key?: string, // opcional (dedupe)
 *   type: "STATUS" | "CONFIRMATIONS" | "SIGNATURE" | "PDF" | "GENERIC",
 *   orderId,
 *   endpoint,
 *   method: "POST" | "PATCH" | "PUT",
 *   payload,
 *   createdAt,
 *   updatedAt,
 *   tries,
 *   lastError
 * }
 */

function normalizeMethod(method) {
  const m = String(method || "POST").toUpperCase();
  return ["POST", "PATCH", "PUT"].includes(m) ? m : "POST";
}

function normalizeEndpoint(endpoint) {
  if (!endpoint) return "";
  // soporta absoluto o relativo
  return String(endpoint).trim();
}

function normalizeType(type) {
  const t = String(type || "GENERIC").toUpperCase();
  const allowed = ["STATUS", "CONFIRMATIONS", "SIGNATURE", "PDF", "GENERIC"];
  return allowed.includes(t) ? t : "GENERIC";
}

/**
 * Inserta o actualiza un item.
 * - Si pasas key, intenta "dedupe": reemplaza el existente con misma key+orderId+type+endpoint+method.
 * - Si NO pasas key, simplemente encola (push).
 */
export async function upsertSapQueueItem({
  type,
  orderId,
  endpoint,
  method = "POST",
  payload,
  key, // opcional
}) {
  const item = {
    id: uid(),
    key: key ? String(key) : undefined,
    type: normalizeType(type),
    orderId: String(orderId || "").trim(),
    endpoint: normalizeEndpoint(endpoint),
    method: normalizeMethod(method),
    payload,
    createdAt: nowMs(),
    updatedAt: nowMs(),
    tries: 0,
    lastError: null,
  };

  const q = await loadQueue();

  if (item.key) {
    const idx = q.findIndex(
      (x) =>
        x &&
        x.key === item.key &&
        String(x.orderId || "").trim() === item.orderId &&
        String(x.type || "").toUpperCase() === item.type &&
        String(x.endpoint || "").trim() === item.endpoint &&
        normalizeMethod(x.method) === item.method
    );

    if (idx >= 0) {
      // reemplaza manteniendo tries/createdAt
      const prev = q[idx];
      q[idx] = {
        ...prev,
        ...item,
        id: prev.id || item.id,
        createdAt: prev.createdAt || item.createdAt,
        tries: prev.tries || 0,
        lastError: prev.lastError || null,
        updatedAt: nowMs(),
      };
      await saveQueue(q);
      return q[idx];
    }
  }

  q.push(item);
  await saveQueue(q);
  return item;
}

/**
 * ✅ Tu función original: enqueueSapItem
 * La dejamos por compatibilidad (por si la usas en otros lados).
 */
export async function enqueueSapItem({ type, orderId, endpoint, method = "POST", payload, key }) {
  return upsertSapQueueItem({ type, orderId, endpoint, method, payload, key });
}

export async function getSapQueue() {
  return await loadQueue();
}

export async function clearSapQueue() {
  await saveQueue([]);
}

/**
 * Procesa cola (solo si hay internet).
 * Pasa token para Authorization header.
 */
export async function processSapQueue(token) {
  const net = await NetInfo.fetch();
  const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);
  if (!isOnline) return { ok: false, reason: "offline" };

  let q = await loadQueue();
  if (!q.length) return { ok: true, processed: 0, remaining: 0 };

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const keep = [];
  let processed = 0;
  let dropped = 0;

  for (const item of q) {
    // si ya falló mucho, lo descartamos para no ciclar infinito
    const tries = Number(item?.tries || 0);
    if (tries >= MAX_TRIES) {
      dropped += 1;
      continue;
    }

    try {
      const method = normalizeMethod(item.method).toLowerCase();
      const endpoint = normalizeEndpoint(item.endpoint);

      if (!endpoint) throw new Error("Queue item sin endpoint");

      if (method === "post") {
        await api.post(endpoint, item.payload, { headers });
      } else if (method === "patch") {
        await api.patch(endpoint, item.payload, { headers });
      } else if (method === "put") {
        await api.put(endpoint, item.payload, { headers });
      } else {
        throw new Error(`Método no soportado: ${item.method}`);
      }

      processed += 1;
    } catch (e) {
      const msg = e?.response?.data
        ? JSON.stringify(e.response.data)
        : e?.message || String(e);

      keep.push({
        ...item,
        tries: tries + 1,
        updatedAt: nowMs(),
        lastError: msg,
      });
    }
  }

  await saveQueue(keep);
  return { ok: true, processed, remaining: keep.length, dropped };
}
