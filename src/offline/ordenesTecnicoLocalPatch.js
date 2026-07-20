// src/offline/ordenesTecnicoLocalPatch.js

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  loadOrdenesTecnicoList,
  saveOrdenesTecnicoList,
  loadOrdenTecnicoDetail,
  saveOrdenTecnicoDetail,
} from "./ordenesTecnicoCache";

const PATCH_KEY = (userEmail) =>
  `ordenesTecnico:statusPatch:${String(userEmail || "unknown")
    .trim()
    .toLowerCase()}`;

const TBMKY_STATUS_KEY = (orderId) =>
  `tbmky_status_${String(orderId || "").trim()}`;

export const STATUS_LABELS = {
  "0100": "PENDIENTE",
  "0200": "EN PROCESO",
  "0300": "FINALIZADA",
  "0400": "PENDIENTE DE FIRMA",
  "0500": "FINALIZADA C/PENDIENTES",
  "0600": "Carta No Mantto",
};

export function normalizeStatusCode(code) {
  if (code === null || code === undefined) return "";

  const value = String(code).trim();
  if (!value) return "";

  const number = parseInt(value, 10);

  if (Number.isNaN(number)) {
    return value;
  }

  return String(number).padStart(4, "0");
}

export function resolveStatusLabel(code) {
  const normalized = normalizeStatusCode(code);

  return STATUS_LABELS[normalized] || normalized || "Sin empezar";
}

/**
 * Devuelve el estatus anterior que debe desactivarse en SAP.
 *
 * Sin estatus -> 0100
 * 0100 -> 0200
 * 0200 -> 0400
 * 0200 -> 0300
 * 0400 -> 0300
 */
export function getPreviousStatusForTransition(nextStatus, currentStatus = "") {
  const next = normalizeStatusCode(nextStatus);
  const current = normalizeStatusCode(currentStatus);

  if (next === "0100") return "";

  if (next === "0200") {
    return current === "0100" ? "0100" : "0100";
  }

  if (next === "0400") {
    return current === "0200" ? "0200" : "0200";
  }

  if (next === "0300") {
    if (current === "0400") return "0400";
    return "0200";
  }

  if (next === "0600") {
    return current || "0100";
  }

  return current;
}

/**
 * Construye el arreglo correcto para SAP.
 *
 * Ejemplo:
 * 0200 activo y 0100 inactivo.
 */
export function buildStatusTransitionSet({
  nextStatus,
  currentStatus = "",
  language = "ES",
}) {
  const next = normalizeStatusCode(nextStatus);
  const previous = getPreviousStatusForTransition(next, currentStatus);

  if (!next) return [];

  const rows = [
    {
      UserStText: next,
      Langu: language,
      Inactive: "",
    },
  ];

  if (previous && previous !== next) {
    rows.push({
      UserStText: previous,
      Langu: language,
      Inactive: "X",
    });
  }

  return rows;
}

export async function getLocalStatusPatch(userEmail) {
  try {
    const raw = await AsyncStorage.getItem(PATCH_KEY(userEmail));
    const parsed = raw ? JSON.parse(raw) : {};

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Guarda el estatus local pendiente.
 *
 * pendingSync:
 *   true  = todavía debe confirmarse con SAP.
 *   false = SAP ya lo confirmó.
 */
export async function setLocalStatusPatch(
  userEmail,
  orderId,
  estatusCode,
  options = {},
) {
  try {
    const cleanOrderId = String(orderId || "").trim();
    const code = normalizeStatusCode(estatusCode);

    if (!cleanOrderId || !code) return null;

    const key = PATCH_KEY(userEmail);
    const patchMap = await getLocalStatusPatch(userEmail);

    const previousPatch = patchMap[cleanOrderId] || {};

    patchMap[cleanOrderId] = {
      ...previousPatch,

      estatus_code: code,
      estatus_label: resolveStatusLabel(code),

      previous_status: normalizeStatusCode(
        options.previousStatus ?? previousPatch.previous_status ?? "",
      ),

      pendingSync:
        options.pendingSync === undefined
          ? true
          : !!options.pendingSync,

      source: String(options.source || previousPatch.source || "local"),

      updatedAt: Date.now(),
    };

    await AsyncStorage.setItem(key, JSON.stringify(patchMap));

    /*
     * Una orden que ya avanzó no debe conservar una marca antigua
     * de check-in/TBMK 0100.
     */
    if (["0200", "0300", "0400", "0600"].includes(code)) {
      await AsyncStorage.removeItem(TBMKY_STATUS_KEY(cleanOrderId));
    }

    return patchMap[cleanOrderId];
  } catch (error) {
    console.log(
      "[STATUS PATCH] No se pudo guardar:",
      error?.message || error,
    );

    return null;
  }
}

/**
 * Elimina un parche solamente cuando SAP ya confirmó el estatus.
 */
export async function removeLocalStatusPatch(userEmail, orderId) {
  try {
    const cleanOrderId = String(orderId || "").trim();
    if (!cleanOrderId) return false;

    const key = PATCH_KEY(userEmail);
    const patchMap = await getLocalStatusPatch(userEmail);

    if (!patchMap[cleanOrderId]) return true;

    delete patchMap[cleanOrderId];

    await AsyncStorage.setItem(key, JSON.stringify(patchMap));

    return true;
  } catch {
    return false;
  }
}

/**
 * Conserva el parche, pero lo marca como enviado.
 * Todavía no se elimina hasta que SAP devuelva ese estatus.
 */
export async function markLocalStatusPatchSent(userEmail, orderId) {
  try {
    const cleanOrderId = String(orderId || "").trim();
    const patchMap = await getLocalStatusPatch(userEmail);
    const currentPatch = patchMap[cleanOrderId];

    if (!currentPatch) return null;

    patchMap[cleanOrderId] = {
      ...currentPatch,
      pendingSync: false,
      sentAt: Date.now(),
      updatedAt: Date.now(),
    };

    await AsyncStorage.setItem(
      PATCH_KEY(userEmail),
      JSON.stringify(patchMap),
    );

    return patchMap[cleanOrderId];
  } catch {
    return null;
  }
}

function buildStatusFields(item, code) {
  const normalized = normalizeStatusCode(code);

  return {
    ...(item || {}),

    estatus_code: normalized,
    userstatus: normalized,
    Userstatus: normalized,
    UserStatus: normalized,
    UserStText: normalized,

    estatus_label: resolveStatusLabel(normalized),

    isPendingSignature: normalized === "0400",
    isFinal: ["0300", "0600"].includes(normalized),
    checkin_done: ["0100", "0200", "0300", "0400", "0600"].includes(
      normalized,
    ),
  };
}

/**
 * Aplica los cambios locales después de obtener órdenes desde SAP.
 *
 * Mientras exista un parche local, este tiene prioridad sobre
 * una respuesta atrasada de SAP.
 */
export function applyStatusPatchToOrdenes(ordenes = [], patchMap = {}) {
  const list = Array.isArray(ordenes) ? ordenes : [];

  return list.map((item) => {
    const orderId = String(
      item?.Orderid ??
        item?.OrderId ??
        item?.orderid ??
        "",
    ).trim();

    const patch = patchMap?.[orderId];
    const code = normalizeStatusCode(patch?.estatus_code);

    if (!code) return item;

    return buildStatusFields(item, code);
  });
}

/**
 * Actualiza la orden dentro de la lista cacheada.
 */
export async function patchCacheOrdenesTecnicoList(
  userEmail,
  orderId,
  newStatusCode,
) {
  try {
    const cached = await loadOrdenesTecnicoList(userEmail);

    if (!Array.isArray(cached?.data)) {
      return false;
    }

    const cleanOrderId = String(orderId || "").trim();
    const code = normalizeStatusCode(newStatusCode);

    const newData = cached.data.map((item) => {
      const itemOrderId = String(
        item?.Orderid ??
          item?.OrderId ??
          item?.orderid ??
          "",
      ).trim();

      if (itemOrderId !== cleanOrderId) {
        return item;
      }

      return buildStatusFields(item, code);
    });

    await saveOrdenesTecnicoList(
      userEmail,
      newData,
      cached?.window || null,
    );

    return true;
  } catch (error) {
    console.log(
      "[STATUS PATCH] Error actualizando lista:",
      error?.message || error,
    );

    return false;
  }
}

/**
 * Actualiza el detalle cacheado de la orden.
 */
export async function patchCacheOrdenTecnicoDetail(
  orderId,
  newStatusCode,
) {
  try {
    const cached = await loadOrdenTecnicoDetail(orderId);
    const base = cached?.data;

    if (!base) return false;

    const updated = buildStatusFields(base, newStatusCode);
    const saved = await saveOrdenTecnicoDetail(orderId, updated);

    return saved === true;
  } catch (error) {
    console.log(
      "[STATUS PATCH] Error actualizando detalle:",
      error?.message || error,
    );

    return false;
  }
}

/**
 * Realiza el cambio local completo.
 *
 * Debe usarse para:
 * - check-in 0100
 * - TBMK 0200
 * - pendiente de firma 0400
 * - finalizada 0300
 * - no mantenimiento 0600
 */
export async function applyLocalStatusTransition({
  userEmail,
  orderId,
  nextStatus,
  currentStatus = "",
  source = "local",
  pendingSync = true,
}) {
  const code = normalizeStatusCode(nextStatus);
  const previousStatus = getPreviousStatusForTransition(
    code,
    currentStatus,
  );

  if (!userEmail || !orderId || !code) {
    return {
      ok: false,
      reason: "missing_data",
    };
  }

  const patch = await setLocalStatusPatch(
    userEmail,
    orderId,
    code,
    {
      previousStatus,
      pendingSync,
      source,
    },
  );

  const listUpdated = await patchCacheOrdenesTecnicoList(
    userEmail,
    orderId,
    code,
  );

  const detailUpdated = await patchCacheOrdenTecnicoDetail(
    orderId,
    code,
  );

  return {
    ok: !!patch,
    orderId: String(orderId),
    previousStatus,
    nextStatus: code,
    listUpdated,
    detailUpdated,
    patch,
  };
}