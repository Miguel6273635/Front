// src/services/avisoAveriaSap.js
import api from "./api";

export async function fetchMetaAviso(orderid, token) {
  if (!orderid || orderid === "undefined" || orderid === "null") {
    throw new Error("orderid inválido al cargar meta de aviso");
  }

  const res = await api.get(`/api/aviso-averia/meta/${orderid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function fetchCatalogoCircunstancia(catalogo, token) {
  const res = await api.get(
    `/api/aviso-averia/catalogos/circunstancia?catalogo=${encodeURIComponent(
      catalogo
    )}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

export async function crearAvisoAveriaSap(payload, token) {
  // payload debe incluir piezaDescripcion ✅
  const res = await api.post(`/api/aviso-averia/create`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
