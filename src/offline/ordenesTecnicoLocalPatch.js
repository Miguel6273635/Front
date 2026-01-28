// src/offline/ordenesTecnicoLocalPatch.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadOrdenesTecnicoList, saveOrdenesTecnicoList } from "./ordenesTecnicoCache";

const PATCH_KEY = (userEmail) => `ordenesTecnico:statusPatch:${userEmail || "unknown"}`;

/**
 * patchMap: { [orderId]: { estatus_code: "0400", updatedAt: ms } }
 */
export async function setLocalStatusPatch(userEmail, orderId, estatus_code) {
  try {
    const key = PATCH_KEY(userEmail);
    const raw = await AsyncStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    obj[String(orderId)] = { estatus_code: String(estatus_code), updatedAt: Date.now() };
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
 * ✅ aplica patches al arreglo de órdenes (solo modifica estatus_code)
 */
export function applyStatusPatchToOrdenes(ordenes = [], patchMap = {}) {
  if (!ordenes?.length) return ordenes || [];
  const map = patchMap || {};
  return (ordenes || []).map((it) => {
    const id = String(it?.Orderid ?? "");
    const p = map?.[id];
    if (!p?.estatus_code) return it;
    return { ...it, estatus_code: String(p.estatus_code) };
  });
}

/**
 * ✅ también actualiza el cache de lista para que quede persistente
 */
export async function patchCacheOrdenesTecnicoList(userEmail, orderId, newStatusCode) {
  try {
    const cached = await loadOrdenesTecnicoList(userEmail);
    if (!cached?.data?.length) return;

    const newData = cached.data.map((it) => {
      if (String(it?.Orderid) !== String(orderId)) return it;
      return { ...it, estatus_code: String(newStatusCode) };
    });

    await saveOrdenesTecnicoList(userEmail, newData, cached?.window || null);
  } catch {}
}
