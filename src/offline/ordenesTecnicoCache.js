import AsyncStorage from "@react-native-async-storage/async-storage";

// Ventana requerida: 30 días antes y 8 días después
export const OFFLINE_DAYS_BEFORE = 30;
export const OFFLINE_DAYS_AFTER = 8;
// Tiempo durante el cual la información se considera actualizada.
// 60 minutos × 60 segundos × 1000 milisegundos = 1 hora.
export const ORDENES_CACHE_TTL_MS = 60 * 60 * 1000;

const LIST_KEY = (userEmail) => `ordenesTecnico:list:${userEmail || "unknown"}`;
const DETAIL_KEY = (orderId) =>
  `ordenesTecnico:detail:${String(orderId || "").trim()}`;
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

  // /Date(1771891200000)/
  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = parseInt(value.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }

  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Comparación UTC-safe
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
 * TRUE si una orden cae dentro de la ventana (usa start_date)
 */
export function isOrderInWindow(order, window) {
  if (!order || !window?.start || !window?.end) return false;

  const d = parseSapDate(order?.start_date);
  if (!d) return false;

  const ds = getUtcYmd(d);
  const s = getUtcYmd(window.start);
  const e = getUtcYmd(window.end);

  if (s && ds < s) return false;
  if (e && ds > e) return false;
  return true;
}

/**
 * Filtra órdenes por ventana
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
 * Guarda lista offline (YA FILTRADA)
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

/**
 * Indica si una fecha de caché todavía está vigente.
 *
 * updatedAt:
 *   Fecha guardada como milisegundos con Date.now().
 *
 * ttlMs:
 *   Tiempo máximo que puede tener la información.
 *   Por defecto es una hora.
 */
export function isCacheFresh(
  updatedAt,
  ttlMs = ORDENES_CACHE_TTL_MS,
) {
  const timestamp = Number(updatedAt || 0);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return false;
  }

  const cacheAge = Date.now() - timestamp;

  return cacheAge >= 0 && cacheAge < ttlMs;
}

/**
 * Revisa si la lista de órdenes de un técnico tiene menos de una hora.
 */
export async function isOrdenesTecnicoListFresh(
  userEmail,
  ttlMs = ORDENES_CACHE_TTL_MS,
) {
  const cached = await loadOrdenesTecnicoList(userEmail);

  return isCacheFresh(cached?.updatedAt, ttlMs);
}

/**
 * Revisa si el detalle guardado de una orden tiene menos de una hora.
 */
export async function isOrdenTecnicoDetailFresh(
  orderId,
  ttlMs = ORDENES_CACHE_TTL_MS,
) {
  const cached = await loadOrdenTecnicoDetail(orderId);

  return isCacheFresh(cached?.updatedAt, ttlMs);
}

/* =========================
   ✅ Detalle (con límite)
   ========================= */

function estimateBytes(str) {
  return (str?.length || 0) * 2; // aproximado
}

const MAX_DETAIL_BYTES = 350_000; // ~350KB por detalle (ajustable)

/**
 * Adelgaza el detalle para que no explote storage
 * Guardamos lo necesario para UI offline.
 */
function sanitizeDetailForCache(detail) {
  if (!detail || typeof detail !== "object") return null;

  const ops = Array.isArray(detail?.operaciones) ? detail.operaciones : [];

  const opsSlim = ops.map((op) => ({
    id: op?.id,
    Usr02: op?.Usr02 ?? op?.usr02,
    Activity: op?.Activity ?? op?.activity ?? op?.Vornr,
    //Cambios agregados por lo del campo de subactivity Miguel Angel 04/06/2026
    //SubActivity: op?.SubActivity ?? op?.subactivity ?? op?.Uvorn,
    Description: op?.Description ?? op?.description ?? op?.Ltxa1,
    StandardTextKey: op?.StandardTextKey ?? op?.standardTextKey,
    estatus: op?.estatus,
    worked_ms: op?.worked_ms,
    last_resume_at: op?.last_resume_at,
    Strttimcon: op?.Strttimcon,
    Fintimcons: op?.Fintimcons,
    paused_at: op?.paused_at,
    pause_motivo: op?.pause_motivo,
  }));

  // ✅ NUEVO: conservar partners mínimos para pantallas offline como TBMK
  const partnersSlim = Array.isArray(detail?.partners)
    ? detail.partners.map((p) => ({
        PartnRole: p?.PartnRole ?? null,
        PartnRoleOld: p?.PartnRoleOld ?? null,
        Partner: p?.Partner ?? null,
        PartnerOld: p?.PartnerOld ?? null,
        Name1: p?.Name1 ?? null,
        Name2: p?.Name2 ?? null,
        Mail1: p?.Mail1 ?? null,
        Mail2: p?.Mail2 ?? null,
      }))
    : [];

  return {
    Orderid: String(detail?.Orderid ?? detail?.OrderId ?? "").trim(),
    order_type: detail?.order_type,
    equipment: detail?.equipment,
    plant: detail?.plant ?? detail?.Plant ?? null,
    start_date: detail?.start_date,
    finish_date: detail?.finish_date,
    ShortText: detail?.ShortText ?? detail?.short_text ?? null,
    short_text: detail?.short_text ?? detail?.ShortText ?? null,
    cobertura_tipo: detail?.cobertura_tipo ?? detail?.cobertura ?? null,
    direccion: detail?.direccion,
    cliente: detail?.cliente,
    cliente_email: detail?.cliente_email,
    userstatus: detail?.userstatus,
    estatus_code: detail?.estatus_code,
    estatus_label: detail?.estatus_label,
    estatus_tipo: detail?.estatus_tipo,
    isFinal: detail?.isFinal,
    checkin_done: detail?.checkin_done,
    componentes: Array.isArray(detail?.componentes) ? detail.componentes : [],
    operaciones: opsSlim,

    // ✅ NUEVO
    partners: partnersSlim,
  };
}

/**
 * Decide si conviene guardar el detalle en offline:
 * solo si la orden está dentro de los 30 días anteriores
 * o los 8 días posteriores a la fecha actual.
 */
export function shouldCacheDetailByOrder(orderLike, baseDate = new Date()) {
  const window = buildOfflineWindow(baseDate);
  return isOrderInWindow(orderLike, window);
}

export async function saveOrdenTecnicoDetail(orderId, data) {
  const slim = sanitizeDetailForCache(data);
  const payload = { updatedAt: Date.now(), data: slim };

  let raw = JSON.stringify(payload);
  let bytes = estimateBytes(raw);

  // si aún es grande, quitamos componentes (suele pesar mucho)
  if (bytes > MAX_DETAIL_BYTES) {
    payload.data = { ...(payload.data || {}), componentes: [] };
    raw = JSON.stringify(payload);
    bytes = estimateBytes(raw);
  }

  if (bytes > MAX_DETAIL_BYTES) {
    console.log(
      "[OFFLINE] Detalle demasiado grande, NO se guarda:",
      orderId,
      "bytes:",
      bytes,
    );
    return false;
  }

  try {
    await AsyncStorage.setItem(DETAIL_KEY(orderId), raw);
    return true;
  } catch (e) {
    console.log("[OFFLINE] saveOrdenTecnicoDetail ERROR:", e?.message || e);
    return false;
  }
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
 * Limpieza por lista:
 * deja solo detalles de órdenes que aún existan en la lista cacheada.
 */
export async function pruneDetallesNoUsados(orderIdsKeep = []) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const detailKeys = keys.filter((k) =>
      k.startsWith("ordenesTecnico:detail:"),
    );
    const keepSet = new Set(
      orderIdsKeep.map((x) => `ordenesTecnico:detail:${String(x).trim()}`),
    );
    const toDelete = detailKeys.filter((k) => !keepSet.has(k));
    if (toDelete.length) await AsyncStorage.multiRemove(toDelete);
  } catch {
    // no-op
  }
}

/**
 * Limpieza por ventana:
 * borra detalles de órdenes que NO caen en la ventana actual.
 */
export async function pruneDetallesByWindow(userEmail, window) {
  try {
    const cached = await loadOrdenesTecnicoList(userEmail);
    const list = cached?.data || [];
    const keepIds = list
      .map((x) => String(x?.Orderid ?? "").trim())
      .filter(Boolean);

    await pruneDetallesNoUsados(keepIds);
    return { ok: true, keep: keepIds.length };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}