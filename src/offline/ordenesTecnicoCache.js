import AsyncStorage from "@react-native-async-storage/async-storage";

// Ventana requerida: 8 días antes y 8 después
export const OFFLINE_DAYS_BEFORE = 8;
export const OFFLINE_DAYS_AFTER = 8;

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

  return {
    start,
    end,
    startStr: ymd(start),
    endStr: ymd(end),
  };
}

/**
 * TRUE si una orden cae dentro de la ventana offline.
 * Usa start_date como fecha principal.
 */
export function isOrderInWindow(order, window) {
  if (!order || !window?.start || !window?.end) return false;

  const d = parseSapDate(
    order?.start_date ||
      order?.StartDate ||
      order?.startDate ||
      order?.fecha_inicio ||
      order?.Inicio,
  );

  if (!d) return false;

  const ds = getUtcYmd(d);
  const s = getUtcYmd(window.start);
  const e = getUtcYmd(window.end);

  if (s && ds < s) return false;
  if (e && ds > e) return false;

  return true;
}

/**
 * Filtra órdenes por ventana.
 */
export function filterOrdenesByWindow(ordenes = [], start, end) {
  const s = start ? getUtcYmd(start) : null;
  const e = end ? getUtcYmd(end) : null;

  return (ordenes || []).filter((it) => {
    const d = parseSapDate(
      it?.start_date ||
        it?.StartDate ||
        it?.startDate ||
        it?.fecha_inicio ||
        it?.Inicio,
    );

    if (!d) return false;

    const ds = getUtcYmd(d);

    if (s && ds < s) return false;
    if (e && ds > e) return false;

    return true;
  });
}

/**
 * Guarda lista offline.
 * La lista debe venir ya filtrada por ventana desde el prefetch.
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

/* =========================
   Detalle de orden offline
   ========================= */

function estimateBytes(str) {
  return (str?.length || 0) * 2; // aproximado UTF-16
}

const MAX_DETAIL_BYTES = 350_000; // ~350 KB por detalle

function normalizeOrderId(detail) {
  return String(
    detail?.Orderid ||
      detail?.OrderId ||
      detail?.orderid ||
      detail?.order_id ||
      "",
  ).trim();
}

function normalizeOperation(op = {}) {
  return {
    id: op?.id,
    Usr02: op?.Usr02 ?? op?.usr02 ?? null,
    Activity: op?.Activity ?? op?.activity ?? op?.Vornr ?? "",

    // Cambio agregado por Miguel Ángel 04/06/2026:
    // Se elimina SubActivity porque SAP ya no debe usar ese campo en la app.
    // SubActivity: op?.SubActivity ?? op?.subactivity ?? op?.Uvorn,

    Description: op?.Description ?? op?.description ?? op?.Ltxa1 ?? "",
    StandardTextKey: op?.StandardTextKey ?? op?.standardTextKey ?? "",
    estatus: op?.estatus ?? "pendiente",
    worked_ms: op?.worked_ms ?? 0,
    last_resume_at: op?.last_resume_at ?? null,
    Strttimcon: op?.Strttimcon ?? null,
    Fintimcons: op?.Fintimcons ?? null,
    paused_at: op?.paused_at ?? null,
    pause_motivo: op?.pause_motivo ?? null,
  };
}

function normalizePartner(p = {}) {
  return {
    PartnRole: p?.PartnRole ?? null,
    PartnRoleOld: p?.PartnRoleOld ?? null,
    Partner: p?.Partner ?? null,
    PartnerOld: p?.PartnerOld ?? null,
    Name1: p?.Name1 ?? null,
    Name2: p?.Name2 ?? null,
    Mail1: p?.Mail1 ?? null,
    Mail2: p?.Mail2 ?? null,
  };
}

function normalizeComponent(c = {}) {
  return {
    Material: c?.Material ?? c?.material ?? c?.Matnr ?? c?.matnr ?? null,
    Description:
      c?.Description ??
      c?.description ??
      c?.Maktx ??
      c?.maktx ??
      c?.TextoMaterial ??
      null,
    Quantity:
      c?.Quantity ??
      c?.quantity ??
      c?.Cantidad ??
      c?.cantidad ??
      c?.RequirementQuantity ??
      null,
    Unit: c?.Unit ?? c?.unit ?? c?.Unidad ?? c?.unidad ?? c?.BaseUnit ?? null,
    Plant: c?.Plant ?? c?.plant ?? c?.Centro ?? c?.centro ?? null,
    StorageLocation:
      c?.StorageLocation ?? c?.storageLocation ?? c?.Almacen ?? c?.almacen ?? null,
    Activity: c?.Activity ?? c?.activity ?? c?.Vornr ?? null,
  };
}

/**
 * Adelgaza el detalle para que no explote AsyncStorage.
 * Se guarda solo lo necesario para UI offline.
 */
function sanitizeDetailForCache(detail) {
  if (!detail || typeof detail !== "object") return null;

  const ops = Array.isArray(detail?.operaciones) ? detail.operaciones : [];
  const opsSlim = ops.map(normalizeOperation);

  // Partners mínimos para pantallas offline como TBM/KY y correo cliente.
  const partnersSlim = Array.isArray(detail?.partners)
    ? detail.partners.map(normalizePartner)
    : [];

  // Componentes de orden/materiales. Se guardan slim; si pesa mucho se eliminan más abajo.
  const componentesSlim = Array.isArray(detail?.componentes)
    ? detail.componentes.map(normalizeComponent)
    : [];

  const orderId = normalizeOrderId(detail);

  return {
    Orderid: orderId,
    OrderId: orderId,
    order_type: detail?.order_type ?? detail?.OrderType ?? null,
    OrderType: detail?.OrderType ?? detail?.order_type ?? null,
    equipment: detail?.equipment ?? detail?.Equipment ?? null,
    Equipment: detail?.Equipment ?? detail?.equipment ?? null,
    plant: detail?.plant ?? detail?.Plant ?? null,
    Plant: detail?.Plant ?? detail?.plant ?? null,
    start_date: detail?.start_date ?? detail?.StartDate ?? null,
    StartDate: detail?.StartDate ?? detail?.start_date ?? null,
    finish_date: detail?.finish_date ?? detail?.FinishDate ?? null,
    FinishDate: detail?.FinishDate ?? detail?.finish_date ?? null,
    ShortText:
      detail?.ShortText ??
      detail?.shortText ??
      detail?.shorttext ??
      detail?.Shorttext ??
      "",
    direccion: detail?.direccion ?? detail?.address ?? detail?.partner_address ?? "",
    address: detail?.address ?? detail?.direccion ?? "",
    partner_address: detail?.partner_address ?? detail?.direccion ?? "",
    cliente: detail?.cliente ?? "",
    cliente_email: detail?.cliente_email ?? "",
    cliente_nombre: detail?.cliente_nombre ?? "",
    cliente_cargo: detail?.cliente_cargo ?? "",
    aviso_cliente: detail?.aviso_cliente ?? "",
    userstatus: detail?.userstatus ?? detail?.UserStatus ?? detail?.UserStText ?? "",
    UserStatus: detail?.UserStatus ?? detail?.userstatus ?? detail?.UserStText ?? "",
    UserStText: detail?.UserStText ?? detail?.userstatus ?? detail?.UserStatus ?? "",
    estatus_code: detail?.estatus_code ?? detail?.UserStatus ?? detail?.userstatus ?? "",
    estatus_label: detail?.estatus_label ?? detail?.estatus ?? detail?.status ?? "",
    estatus_tipo: detail?.estatus_tipo ?? null,
    isFinal: !!detail?.isFinal,
    isPendingSignature: !!detail?.isPendingSignature,
    checkin_done: !!detail?.checkin_done,
    checkin: !!detail?.checkin,
    checked_in: !!detail?.checked_in,
    cobertura_tipo: detail?.cobertura_tipo ?? null,

    componentes: componentesSlim,
    operaciones: opsSlim,
    partners: partnersSlim,
  };
}

/**
 * Decide si conviene guardar el detalle en offline:
 * solo si la orden está dentro de hoy ± 8 días.
 */
export function shouldCacheDetailByOrder(orderLike, baseDate = new Date()) {
  const window = buildOfflineWindow(baseDate);
  return isOrderInWindow(orderLike, window);
}

export async function saveOrdenTecnicoDetail(orderId, data) {
  const cleanOrderId = String(orderId || normalizeOrderId(data) || "").trim();
  if (!cleanOrderId) return false;

  const slim = sanitizeDetailForCache(data);
  if (!slim) return false;

  const payload = {
    updatedAt: Date.now(),
    data: slim,
  };

  let raw = JSON.stringify(payload);
  let bytes = estimateBytes(raw);

  // Si aún es grande, quitamos componentes porque suelen pesar más.
  if (bytes > MAX_DETAIL_BYTES) {
    payload.data = { ...(payload.data || {}), componentes: [] };
    raw = JSON.stringify(payload);
    bytes = estimateBytes(raw);
  }

  // Si sigue grande, quitamos partners.
  if (bytes > MAX_DETAIL_BYTES) {
    payload.data = { ...(payload.data || {}), partners: [] };
    raw = JSON.stringify(payload);
    bytes = estimateBytes(raw);
  }

  if (bytes > MAX_DETAIL_BYTES) {
    console.log(
      "[OFFLINE] Detalle demasiado grande, NO se guarda:",
      cleanOrderId,
      "bytes:",
      bytes,
    );
    return false;
  }

  try {
    await AsyncStorage.setItem(DETAIL_KEY(cleanOrderId), raw);
    return true;
  } catch (e) {
    console.log("[OFFLINE] saveOrdenTecnicoDetail ERROR:", e?.message || e);
    return false;
  }
}

export async function loadOrdenTecnicoDetail(orderId) {
  try {
    const cleanOrderId = String(orderId || "").trim();
    if (!cleanOrderId) return null;

    const raw = await AsyncStorage.getItem(DETAIL_KEY(cleanOrderId));
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

    if (toDelete.length) {
      await AsyncStorage.multiRemove(toDelete);
    }

    return { ok: true, deleted: toDelete.length };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
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
      .map((x) => String(x?.Orderid ?? x?.OrderId ?? "").trim())
      .filter(Boolean);

    await pruneDetallesNoUsados(keepIds);

    return {
      ok: true,
      keep: keepIds.length,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
    };
  }
}

/**
 * Borra toda la cache offline del técnico.
 * Útil para soporte o cuando se cambia de usuario/ambiente.
 */
export async function clearOrdenesTecnicoCache(userEmail) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const detailKeys = keys.filter((k) =>
      k.startsWith("ordenesTecnico:detail:"),
    );

    const baseKeys = [LIST_KEY(userEmail), META_KEY(userEmail)];
    const allToDelete = Array.from(new Set([...baseKeys, ...detailKeys]));

    if (allToDelete.length) {
      await AsyncStorage.multiRemove(allToDelete);
    }

    return { ok: true, deleted: allToDelete.length };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
