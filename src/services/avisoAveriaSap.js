// src/services/avisoAveriaSap.js
import api from "./api";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "@mitsu:avisoAveria:";
const keyMeta = (orderid) => `${PREFIX}meta:${String(orderid || "").trim()}`;
const keyCatalog = (catalogo) => `${PREFIX}catalog:${String(catalogo || "").trim().toUpperCase()}`;

const jsonParse = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

export async function fetchMetaAviso(orderid, token) {
  if (!orderid || orderid === "undefined" || orderid === "null") {
    throw new Error("orderid inválido al cargar meta de aviso");
  }

  const k = keyMeta(orderid);

  // ✅ cache primero (rápido)
  const cachedRaw = await AsyncStorage.getItem(k);
  const cached = cachedRaw ? jsonParse(cachedRaw, null) : null;

  try {
    const res = await api.get(`/api/aviso-averia/meta/${orderid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const payload = { savedAt: Date.now(), data: res.data };
    await AsyncStorage.setItem(k, JSON.stringify(payload));
    return res.data;
  } catch (e) {
    if (cached?.data) {
      return cached.data;
    }
    throw e;
  }
}

export async function fetchCatalogoCircunstancia(catalogo, token) {
  const cat = String(catalogo || "").trim().toUpperCase();
  const k = keyCatalog(cat);

  // ✅ cache primero
  const cachedRaw = await AsyncStorage.getItem(k);
  const cached = cachedRaw ? jsonParse(cachedRaw, null) : null;

  try {
    const res = await api.get(
      `/api/aviso-averia/catalogos/circunstancia?catalogo=${encodeURIComponent(cat)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const payload = { savedAt: Date.now(), data: res.data };
    await AsyncStorage.setItem(k, JSON.stringify(payload));
    return res.data;
  } catch (e) {
    if (cached?.data) return cached.data;
    throw e;
  }
}

export async function crearAvisoAveriaSap(payload, token) {
  // ✅ esto NO lo encolamos aquí (si quieres, luego lo mandamos a tu outbox sqlite)
  try {
    const res = await api.post(`/api/aviso-averia/create`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (e) {
    // mensaje más claro cuando es por red
    const msg = e?.message || "";
    if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("timeout")) {
      throw new Error("Sin conexión: no se puede crear el aviso offline. Intenta cuando tengas internet.");
    }
    throw e;
  }
}
