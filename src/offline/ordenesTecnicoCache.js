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

function safeTrim(value) {
  return String(value ?? "").trim();
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function pickValue(...values) {
  for (const value of values) {
    if (hasValue(value)) return value;
  }

  return null;
}

function parseSapDate(value) {
  if (!hasValue(value)) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const raw = String(value).trim();

  // /Date(1771891200000)/
  if (raw.startsWith("/Date(")) {
    const ms = parseInt(raw.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }

  // yyyyMMdd
  if (/^\d{8}$/.test(raw)) {
    const yyyy = Number(raw.slice(0, 4));
    const mm = Number(raw.slice(4, 6));
    const dd = Number(raw.slice(6, 8));

    if (yyyy && mm && dd) {
      const d = new Date(Date.UTC(yyyy, mm - 1, dd));
      return Number.isFinite(d.getTime()) ? d : null;
    }
  }

  const d = new Date(raw);
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

function getOrderDateCandidate(order = {}) {
  return pickValue(
    order?.start_date,
    order?.StartDate,
    order?.startDate,
    order?.BasicStartDate,
    order?.BasicStart,
    order?.BasicStartDt,
    order?.Inicio,
    order?.fecha_inicio,
    order?.FechaInicio,
    order?.fechaInicio,
    order?.Start,
    order?.start,
    order?.ScheduledStartDate,
    order?.PlannedStartDate,
    order?.ActualStartDate,
    order?.ProductionStartDate,
    order?.finish_date,
    order?.FinishDate,
    order?.finishDate,
    order?.BasicFinDate,
    order?.BasicFinish,
    order?.Fin,
    order?.FechaFin,
  );
}

function getOrderDate(order = {}) {
  return parseSapDate(getOrderDateCandidate(order));
}

function getOrderIdFromAny(order = {}) {
  return safeTrim(
    order?.Orderid ||
      order?.OrderId ||
      order?.orderid ||
      order?.order_id ||
      order?.Orden ||
      order?.orden ||
      "",
  );
}

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
 *
 * Miguel Ángel Hernández Álvarez - 01/07/2026
 * Se amplían los nombres de fecha aceptados porque SAP/backend no siempre
 * manda start_date. Si una orden trae ID pero no trae fecha usable, NO se
 * descarta automáticamente para evitar perder detalle offline.
 */
export function isOrderInWindow(order, window) {
  if (!order || !window?.start || !window?.end) return false;

  const d = getOrderDate(order);

  if (!d) {
    const orderId = getOrderIdFromAny(order);

    if (orderId) {
      console.log("[OFFLINE][WINDOW] Orden sin fecha usable, se conserva:", {
        orderId,
      });

      return true;
    }

    return false;
  }

  const ds = getUtcYmd(d);
  const s = getUtcYmd(window.start);
  const e = getUtcYmd(window.end);

  if (s && ds < s) return false;
  if (e && ds > e) return false;

  return true;
}

/**
 * Filtra órdenes por ventana.
 *
 * Importante:
 * Si una orden tiene ID pero no trae fecha usable, se conserva. Esto evita que
 * una respuesta válida de SAP/backend termine guardando lista vacía solo por
 * diferencias de nombres de campos.
 */
export function filterOrdenesByWindow(ordenes = [], start, end, options = {}) {
  const { keepNoDate = false } = options || {};

  const s = start ? getUtcYmd(start) : null;
  const e = end ? getUtcYmd(end) : null;

  return (ordenes || []).filter((it) => {
    const d = getOrderDate(it);

    /*
      Corrección:
      Antes, si una orden tenía ID pero no fecha, se conservaba siempre.
      Eso puede meter órdenes que no pertenecen al día/rango actual.
    */
    if (!d) {
      return keepNoDate && !!getOrderIdFromAny(it);
    }

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

const MAX_DETAIL_BYTES = 900_000; // ~900 KB por detalle

function normalizeOrderId(detail) {
  return getOrderIdFromAny(detail);
}

function normalizeOperation(op = {}) {
  const activity = safeTrim(op?.Activity ?? op?.activity ?? op?.Vornr ?? "");
  const description = safeTrim(
    op?.Description ?? op?.description ?? op?.Ltxa1 ?? "",
  );
  const standardTextKey = safeTrim(
    op?.StandardTextKey ?? op?.standardTextKey ?? op?.Ktsch ?? "",
  );

  return {
    id: op?.id ?? activity,

    Usr02: op?.Usr02 ?? op?.usr02 ?? null,
    usr02: op?.usr02 ?? op?.Usr02 ?? null,

    Activity: activity,
    activity,

    Description: description,
    description,

    StandardTextKey: standardTextKey,
    standardTextKey,

    FieldUserStatus: op?.FieldUserStatus ?? op?.fieldUserStatus ?? null,

    estatus: op?.estatus ?? op?.status ?? "pendiente",
    status: op?.status ?? op?.estatus ?? "pendiente",

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
    Name3: p?.Name3 ?? null,
    Name4: p?.Name4 ?? null,
    Mail1: p?.Mail1 ?? null,
    Mail2: p?.Mail2 ?? null,
    Tel1Numbr: p?.Tel1Numbr ?? null,
  };
}

function normalizeComponent(c = {}) {
  const activity = safeTrim(c?.Activity ?? c?.activity ?? c?.Vornr ?? "");

  const material =
    c?.Material ?? c?.material ?? c?.Matnr ?? c?.matnr ?? null;

  const description =
    c?.Description ??
    c?.description ??
    c?.Maktx ??
    c?.maktx ??
    c?.TextoMaterial ??
    null;

  const quantity =
    c?.Quantity ??
    c?.quantity ??
    c?.Cantidad ??
    c?.cantidad ??
    c?.RequirementQuantity ??
    null;

  const unit =
    c?.Unit ?? c?.unit ?? c?.Unidad ?? c?.unidad ?? c?.BaseUnit ?? null;

  return {
    Material: material,
    material,

    Description: description,
    description,

    Quantity: quantity,
    quantity,

    Unit: unit,
    unit,

    Plant: c?.Plant ?? c?.plant ?? c?.Centro ?? c?.centro ?? null,
    StorageLocation:
      c?.StorageLocation ??
      c?.storageLocation ??
      c?.Almacen ??
      c?.almacen ??
      null,

    Activity: activity || null,
    activity: activity || null,
  };
}

function normalizeArray(value, mapper) {
  return Array.isArray(value) ? value.map(mapper) : [];
}

function mergeArraysPreferIncoming(incoming = [], previous = []) {
  if (Array.isArray(incoming) && incoming.length > 0) return incoming;
  if (Array.isArray(previous) && previous.length > 0) return previous;
  return [];
}

function mergeScalar(incoming, previous, fallback = null) {
  if (hasValue(incoming)) return incoming;
  if (hasValue(previous)) return previous;
  return fallback;
}

function mergeBoolean(incoming, previous) {
  if (incoming === true || incoming === false) return incoming;
  if (previous === true || previous === false) return previous;
  return false;
}

function mergeDetailBeforeSanitize(previous = {}, incoming = {}, cleanOrderId = "") {
  const prev = previous && typeof previous === "object" ? previous : {};
  const next = incoming && typeof incoming === "object" ? incoming : {};
  const orderId = cleanOrderId || normalizeOrderId(next) || normalizeOrderId(prev);

  const merged = {
    ...prev,
    ...next,

    Orderid: orderId,
    OrderId: orderId,

    order_type: mergeScalar(next?.order_type, prev?.order_type),
    OrderType: mergeScalar(next?.OrderType, prev?.OrderType, next?.order_type || prev?.order_type),

    equipment: mergeScalar(next?.equipment, prev?.equipment),
    Equipment: mergeScalar(next?.Equipment, prev?.Equipment, next?.equipment || prev?.equipment),

    plant: mergeScalar(next?.plant, prev?.plant),
    Plant: mergeScalar(next?.Plant, prev?.Plant, next?.plant || prev?.plant),

    start_date: mergeScalar(
      next?.start_date,
      prev?.start_date,
      mergeScalar(
        next?.StartDate ?? next?.BasicStartDate ?? next?.BasicStart ?? next?.Inicio,
        prev?.StartDate ?? prev?.BasicStartDate ?? prev?.BasicStart ?? prev?.Inicio,
        null,
      ),
    ),
    StartDate: mergeScalar(
      next?.StartDate,
      prev?.StartDate,
      mergeScalar(
        next?.start_date ?? next?.BasicStartDate ?? next?.BasicStart ?? next?.Inicio,
        prev?.start_date ?? prev?.BasicStartDate ?? prev?.BasicStart ?? prev?.Inicio,
        null,
      ),
    ),

    finish_date: mergeScalar(
      next?.finish_date,
      prev?.finish_date,
      mergeScalar(
        next?.FinishDate ?? next?.BasicFinDate ?? next?.BasicFinish,
        prev?.FinishDate ?? prev?.BasicFinDate ?? prev?.BasicFinish,
        null,
      ),
    ),
    FinishDate: mergeScalar(
      next?.FinishDate,
      prev?.FinishDate,
      mergeScalar(
        next?.finish_date ?? next?.BasicFinDate ?? next?.BasicFinish,
        prev?.finish_date ?? prev?.BasicFinDate ?? prev?.BasicFinish,
        null,
      ),
    ),

    ShortText: mergeScalar(
      next?.ShortText ?? next?.shortText ?? next?.shorttext ?? next?.Shorttext,
      prev?.ShortText ?? prev?.shortText ?? prev?.shorttext ?? prev?.Shorttext,
      "",
    ),

    short_text: mergeScalar(
      next?.short_text ?? next?.ShortText ?? next?.shortText,
      prev?.short_text ?? prev?.ShortText ?? prev?.shortText,
      "",
    ),

    direccion: mergeScalar(
      next?.direccion ?? next?.address ?? next?.partner_address,
      prev?.direccion ?? prev?.address ?? prev?.partner_address,
      "",
    ),
    address: mergeScalar(
      next?.address ?? next?.direccion ?? next?.partner_address,
      prev?.address ?? prev?.direccion ?? prev?.partner_address,
      "",
    ),
    partner_address: mergeScalar(
      next?.partner_address ?? next?.direccion ?? next?.address,
      prev?.partner_address ?? prev?.direccion ?? prev?.address,
      "",
    ),

    cliente: mergeScalar(
      next?.cliente ?? next?.razon_social ?? next?.partner_name,
      prev?.cliente ?? prev?.razon_social ?? prev?.partner_name,
      "",
    ),
    razon_social: mergeScalar(
      next?.razon_social ?? next?.cliente ?? next?.partner_name,
      prev?.razon_social ?? prev?.cliente ?? prev?.partner_name,
      "",
    ),
    partner_name: mergeScalar(
      next?.partner_name ?? next?.cliente ?? next?.razon_social,
      prev?.partner_name ?? prev?.cliente ?? prev?.razon_social,
      "",
    ),

    cliente_email: mergeScalar(next?.cliente_email ?? next?.email, prev?.cliente_email ?? prev?.email, ""),
    email: mergeScalar(next?.email ?? next?.cliente_email, prev?.email ?? prev?.cliente_email, ""),

    cliente_nombre: mergeScalar(next?.cliente_nombre, prev?.cliente_nombre, ""),
    cliente_cargo: mergeScalar(next?.cliente_cargo, prev?.cliente_cargo, ""),
    aviso_cliente: mergeScalar(next?.aviso_cliente, prev?.aviso_cliente, ""),

    userstatus: mergeScalar(
      next?.userstatus ?? next?.UserStatus ?? next?.UserStText,
      prev?.userstatus ?? prev?.UserStatus ?? prev?.UserStText,
      "",
    ),
    UserStatus: mergeScalar(
      next?.UserStatus ?? next?.userstatus ?? next?.UserStText,
      prev?.UserStatus ?? prev?.userstatus ?? prev?.UserStText,
      "",
    ),
    UserStText: mergeScalar(
      next?.UserStText ?? next?.userstatus ?? next?.UserStatus,
      prev?.UserStText ?? prev?.userstatus ?? prev?.UserStatus,
      "",
    ),

    estatus_code: mergeScalar(
      next?.estatus_code ?? next?.UserStatus ?? next?.userstatus,
      prev?.estatus_code ?? prev?.UserStatus ?? prev?.userstatus,
      "",
    ),
    estatus_label: mergeScalar(
      next?.estatus_label ?? next?.estatus ?? next?.status,
      prev?.estatus_label ?? prev?.estatus ?? prev?.status,
      "",
    ),
    estatus_tipo: mergeScalar(next?.estatus_tipo, prev?.estatus_tipo, null),

    isFinal: mergeBoolean(next?.isFinal, prev?.isFinal),
    isPendingSignature: mergeBoolean(
      next?.isPendingSignature,
      prev?.isPendingSignature,
    ),
    checkin_done: mergeBoolean(next?.checkin_done, prev?.checkin_done),
    checkin: mergeBoolean(next?.checkin, prev?.checkin),
    checked_in: mergeBoolean(next?.checked_in, prev?.checked_in),

    cobertura_tipo: mergeScalar(
      next?.cobertura_tipo ?? next?.coberturaTipo,
      prev?.cobertura_tipo ?? prev?.coberturaTipo,
      null,
    ),
    coberturaTipo: mergeScalar(
      next?.coberturaTipo ?? next?.cobertura_tipo,
      prev?.coberturaTipo ?? prev?.cobertura_tipo,
      null,
    ),

    componentes: mergeArraysPreferIncoming(next?.componentes, prev?.componentes),
    operaciones: mergeArraysPreferIncoming(next?.operaciones, prev?.operaciones),
    partners: mergeArraysPreferIncoming(next?.partners, prev?.partners),
  };

  return merged;
}

/**
 * Adelgaza el detalle para que no explote AsyncStorage.
 * Se guarda solo lo necesario para UI offline.
 */
function sanitizeDetailForCache(detail) {
  if (!detail || typeof detail !== "object") return null;

  const ops = normalizeArray(detail?.operaciones, normalizeOperation);
  const partners = normalizeArray(detail?.partners, normalizePartner);
  const componentes = normalizeArray(detail?.componentes, normalizeComponent);
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

    start_date:
      detail?.start_date ??
      detail?.StartDate ??
      detail?.BasicStartDate ??
      detail?.BasicStart ??
      detail?.Inicio ??
      null,
    StartDate:
      detail?.StartDate ??
      detail?.start_date ??
      detail?.BasicStartDate ??
      detail?.BasicStart ??
      detail?.Inicio ??
      null,

    finish_date:
      detail?.finish_date ??
      detail?.FinishDate ??
      detail?.BasicFinDate ??
      detail?.BasicFinish ??
      null,
    FinishDate:
      detail?.FinishDate ??
      detail?.finish_date ??
      detail?.BasicFinDate ??
      detail?.BasicFinish ??
      null,

    ShortText:
      detail?.ShortText ??
      detail?.shortText ??
      detail?.shorttext ??
      detail?.Shorttext ??
      "",
    short_text:
      detail?.short_text ??
      detail?.ShortText ??
      detail?.shortText ??
      detail?.shorttext ??
      "",

    direccion:
      detail?.direccion ?? detail?.address ?? detail?.partner_address ?? "",
    address:
      detail?.address ?? detail?.direccion ?? detail?.partner_address ?? "",
    partner_address:
      detail?.partner_address ?? detail?.direccion ?? detail?.address ?? "",

    cliente:
      detail?.cliente ?? detail?.razon_social ?? detail?.partner_name ?? "",
    razon_social:
      detail?.razon_social ?? detail?.cliente ?? detail?.partner_name ?? "",
    partner_name:
      detail?.partner_name ?? detail?.cliente ?? detail?.razon_social ?? "",

    cliente_email: detail?.cliente_email ?? detail?.email ?? "",
    email: detail?.email ?? detail?.cliente_email ?? "",

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

    cobertura_tipo: detail?.cobertura_tipo ?? detail?.coberturaTipo ?? null,
    coberturaTipo: detail?.coberturaTipo ?? detail?.cobertura_tipo ?? null,

    componentes,
    operaciones: ops,
    partners,
  };
}

/**
 * Decide si conviene guardar el detalle en offline.
 *
 * Si falta fecha pero existe Orderid, se permite guardar para no perder cache.
 * El filtro de ventana ya se aplica principalmente en la lista.
 */
export function shouldCacheDetailByOrder(orderLike, baseDate = new Date()) {
  const window = buildOfflineWindow(baseDate);
  return isOrderInWindow(orderLike, window);
}

export async function saveOrdenTecnicoDetail(orderId, data) {
  const cleanOrderId = String(orderId || normalizeOrderId(data) || "").trim();
  if (!cleanOrderId) return false;

  try {
    /*
      Miguel Ángel Hernández Álvarez - 01/07/2026

      Corrección offline:
      Antes este guardado reemplazaba todo el detalle completo.
      Si llegaba un objeto parcial, se podían borrar datos buenos como:
      - dirección
      - razón social
      - partners
      - operaciones
      - componentes

      Ahora primero se lee el detalle anterior y se hace merge.
    */
    const previousRaw = await AsyncStorage.getItem(DETAIL_KEY(cleanOrderId));
    const previousPayload = previousRaw ? JSON.parse(previousRaw) : null;
    const previousData = previousPayload?.data || {};

    const mergedBeforeSanitize = mergeDetailBeforeSanitize(
      previousData,
      data,
      cleanOrderId,
    );

    const slim = sanitizeDetailForCache(mergedBeforeSanitize);
    if (!slim) return false;

    const payload = {
      updatedAt: Date.now(),
      previousUpdatedAt: previousPayload?.updatedAt || null,
      data: slim,
    };

    let raw = JSON.stringify(payload);
    let bytes = estimateBytes(raw);

    // Si aún es grande, quitamos componentes porque suelen pesar más.
    // Los componentes también se guardan por operación en orderComponents.
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