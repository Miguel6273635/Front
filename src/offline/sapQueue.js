// src/offline/sapQueue.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import api from "../services/api";

const QUEUE_KEY = "sapQueue:v1";

function nowMs() {
  return Date.now();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Item schema:
 * {
 *   id, type: "STATUS" | "PDF",
 *   orderId,
 *   endpoint,          // "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet"
 *   payload,           // JSON a mandar
 *   createdAt,
 *   updatedAt,
 *   tries,
 *   lastError
 * }
 */

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
 * ✅ Encola, pero:
 * - Si ya existe un item del MISMO (type + orderId), lo reemplaza (se queda el "último JSON")
 */
export async function upsertSapQueueItem({ type, orderId, endpoint, payload }) {
  const q = await loadQueue();
  const idx = q.findIndex((x) => x?.type === type && String(x?.orderId) === String(orderId));

  const item = {
    id: idx >= 0 ? q[idx].id : uid(),
    type,
    orderId: String(orderId),
    endpoint,
    payload,
    createdAt: idx >= 0 ? q[idx].createdAt : nowMs(),
    updatedAt: nowMs(),
    tries: idx >= 0 ? q[idx].tries || 0 : 0,
    lastError: null,
  };

  if (idx >= 0) q[idx] = item;
  else q.push(item);

  await saveQueue(q);
  return item;
}

export async function getSapQueue() {
  return await loadQueue();
}

export async function clearSapQueue() {
  await saveQueue([]);
}

async function isOnlineNow() {
  const net = await NetInfo.fetch();
  return !!(net?.isConnected && net?.isInternetReachable !== false);
}

/**
 * ✅ Procesa cola en orden: primero PDF y luego STATUS (recomendado).
 * - Si algo falla, se detiene para no “romper” orden de envíos.
 * - Reintenta después.
 */
export async function processSapQueue({ ensureValidToken } = {}) {
  const online = await isOnlineNow();
  if (!online) return { ok: false, reason: "offline", processed: 0, remaining: (await loadQueue()).length };

  let q = await loadQueue();
  if (!q.length) return { ok: true, processed: 0, remaining: 0 };

  // ✅ prioridad: PDF primero, luego STATUS
  q = q.sort((a, b) => {
    const pa = a?.type === "PDF" ? 0 : 1;
    const pb = b?.type === "PDF" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (a?.createdAt || 0) - (b?.createdAt || 0);
  });

  let processed = 0;
  const newQueue = [];

  for (const item of q) {
    try {
      if (ensureValidToken) {
        const ok = await ensureValidToken();
        if (!ok) {
          // token no válido: no borres cola
          newQueue.push(item);
          break;
        }
      }

      // ⚠️ api ya debería meter Authorization por interceptor
      await api.post(item.endpoint, item.payload, {
        headers: { "Content-Type": "application/json" },
      });

      processed += 1;
      // ✅ éxito: NO re-agregamos el item
    } catch (e) {
      const tries = (item?.tries || 0) + 1;
      const err = e?.response?.data || e?.message || String(e);

      newQueue.push({
        ...item,
        tries,
        lastError: err,
        updatedAt: nowMs(),
      });

      // ✅ detenemos para reintentar luego (evita mandar status sin pdf, etc.)
      // Si quieres que continúe con otros, quita este break.
      break;
    }
  }

  // agrega los que no alcanzamos a procesar
  const processedIds = new Set(q.slice(0, processed).map((x) => x.id));
  for (const item of q) {
    if (!processedIds.has(item.id) && !newQueue.find((x) => x.id === item.id)) {
      newQueue.push(item);
    }
  }

  await saveQueue(newQueue);

  return { ok: true, processed, remaining: newQueue.length };
}
