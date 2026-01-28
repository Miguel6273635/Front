// src/offline/ordenesTecnicoCache.js
import AsyncStorage from "@react-native-async-storage/async-storage";

// Ventana requerida: 8 días antes y 8 después
export const OFFLINE_DAYS_BEFORE = 8;
export const OFFLINE_DAYS_AFTER = 8;

const LIST_KEY = (userEmail) => `ordenesTecnico:list:${userEmail || "unknown"}`;
const DETAIL_KEY = (orderId) => `ordenesTecnico:detail:${String(orderId || "").trim()}`;
const META_KEY = (userEmail) => `ordenesTecnico:meta:${userEmail || "unknown"}`;

// --- helpers fecha ---
const atStartOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const ymd = (d) => {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function parseSapDate(value) {
  if (!value) return null;
  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = parseInt(value.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Usa UTC ymd para comparar sin problemas de zona horaria
const getUtcYmd = (d) => {
  if (!d) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export function buildOfflineWindow(baseDate = new Date()) {
  const base = atStartOfDay(baseDate);
  const start = addDays(base, -OFFLINE_DAYS_BEFORE);
  const end = addDays(base, OFFLINE_DAYS_AFTER);
  return { start, end, startStr: ymd(start), endStr: ymd(end) };
}

/**
 * Filtra órdenes por start_date dentro de ventana (UTC-safe)
 */
export function filterOrdenesByWindow(ordenes = [], start, end) {
  const s = start ? getUtcYmd(start) : null;
  const e = end ? getUtcYmd(end) : null;

  return (ordenes || []).filter((it) => {
    const d = parseSapDate(it?.start_date);
    if (!d) return false;
    const ds = getUtcYmd(d);
    if (s && ds < s) return false;
    if (e && ds > e) return false;
    return true;
  });
}

/**
 * Guarda lista completa + ventana usada (para que tu app sepa "qué tan fresca" está)
 */
export async function saveOrdenesTecnicoList(userEmail, ordenes, window) {
  const payload = {
    updatedAt: Date.now(),
    window: window
      ? {
          start: window.start?.toISOString?.() || null,
          end: window.end?.toISOString?.() || null,
          startStr: window.startStr,
          endStr: window.endStr,
        }
      : null,
    data: Array.isArray(ordenes) ? ordenes : [],
  };

  await AsyncStorage.multiSet([
    [LIST_KEY(userEmail), JSON.stringify(payload)],
    [META_KEY(userEmail), JSON.stringify({ lastSyncAt: Date.now() })],
  ]);
}

export async function loadOrdenesTecnicoList(userEmail) {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY(userEmail));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getOrdenesTecnicoLastSync(userEmail) {
  try {
    const raw = await AsyncStorage.getItem(META_KEY(userEmail));
    const obj = raw ? JSON.parse(raw) : null;
    return obj?.lastSyncAt ?? null;
  } catch {
    return null;
  }
}

// --- Detalle ---
export async function saveOrdenTecnicoDetail(orderId, data) {
  const payload = { updatedAt: Date.now(), data: data || null };
  await AsyncStorage.setItem(DETAIL_KEY(orderId), JSON.stringify(payload));
}

export async function loadOrdenTecnicoDetail(orderId) {
  try {
    const raw = await AsyncStorage.getItem(DETAIL_KEY(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Limpieza: deja solo detalles de órdenes que aún existan en la lista cacheada.
 * Útil para que no crezca infinito.
 */
export async function pruneDetallesNoUsados(orderIdsKeep = []) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const detailKeys = keys.filter((k) => k.startsWith("ordenesTecnico:detail:"));
    const keepSet = new Set(orderIdsKeep.map((x) => `ordenesTecnico:detail:${String(x).trim()}`));
    const toDelete = detailKeys.filter((k) => !keepSet.has(k));
    if (toDelete.length) await AsyncStorage.multiRemove(toDelete);
  } catch {
    // no-op
  }
}
