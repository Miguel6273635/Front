// src/offline/ordenesTecnicoLocalPatch.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadOrdenesTecnicoList,
  saveOrdenesTecnicoList,
  loadOrdenTecnicoDetail,
  saveOrdenTecnicoDetail,
} from "./ordenesTecnicoCache";

const PATCH_KEY = (userEmail) => `ordenesTecnico:statusPatch:${userEmail || "unknown"}`;

/**
 * patchMap: { [orderId]: { estatus_code: "0400", updatedAt: ms } }
 */
export async function setLocalStatusPatch(userEmail, orderId, estatus_code) {
  try {
    const key = PATCH_KEY(userEmail);
    const raw = await AsyncStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    obj[String(orderId)] = {
      estatus_code: String(estatus_code),
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(obj));
    return obj;
  } catch {
    return null;
  }
}

export async function getLocalStatusPatch(userEmail) {
  try {
    const raw = await AsyncStorage.getItem(PATCH_KEY(userEmail));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * aplica patches al arreglo de órdenes
 */
export function applyStatusPatchToOrdenes(ordenes = [], patchMap = {}) {
  if (!ordenes?.length) return ordenes || [];
  const map = patchMap || {};

  return (ordenes || []).map((it) => {
    const id = String(it?.Orderid ?? it?.orderid ?? "");
    const p = map?.[id];
    if (!p?.estatus_code) return it;

    const code = String(p.estatus_code);

    return {
      ...it,
      estatus_code: code,
      userstatus: code,
      estatus_label: resolveStatusLabel(code),
    };
  });
}

function resolveStatusLabel(code) {
  const c = String(code || "").trim();
  if (c === "0100") return "PENDIENTE";
  if (c === "0200") return "PROCESO";
  if (c === "0300") return "FINALIZADA";
  if (c === "0400") return "PENDIENTE DE FIRMA";
  if (c === "0500") return "FINALIZADA C/PENDIENTES";
  return c || "—";
}

/**
 * actualiza cache de lista
 */
export async function patchCacheOrdenesTecnicoList(userEmail, orderId, newStatusCode) {
  try {
    const cached = await loadOrdenesTecnicoList(userEmail);
    if (!cached?.data?.length) return;

    const code = String(newStatusCode);

    const newData = cached.data.map((it) => {
      if (String(it?.Orderid ?? it?.orderid) !== String(orderId)) return it;
      return {
        ...it,
        estatus_code: code,
        userstatus: code,
        estatus_label: resolveStatusLabel(code),
      };
    });

    await saveOrdenesTecnicoList(userEmail, newData, cached?.window || null);
  } catch {}
}

/**
 * actualiza cache de detalle
 */
export async function patchCacheOrdenTecnicoDetail(orderId, newStatusCode) {
  try {
    const cached = await loadOrdenTecnicoDetail(orderId);
    const base = cached?.data;
    if (!base) return;

    const code = String(newStatusCode);

    const updated = {
      ...base,
      estatus_code: code,
      userstatus: code,
      estatus_label: resolveStatusLabel(code),
    };

    await saveOrdenTecnicoDetail(orderId, updated);
  } catch {}
}