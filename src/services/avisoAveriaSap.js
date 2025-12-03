// src/services/avisoAveriaSap.js
import api from './api';

// Trae los datos base de la orden desde SAP
export async function fetchMetaAviso(orderid, token) {
  if (!orderid || orderid === 'undefined' || orderid === 'null') {
    throw new Error('orderid inválido al cargar meta de aviso');
  }

  const res = await api.get(`/sap/aviso-averia/meta/${orderid}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
}

// Trae catálogo P/R/S/T
export async function fetchCatalogoCircunstancia(catalogo, token) {
  const res = await api.get(
    `/sap/catalogos/circunstancia?catalogo=${encodeURIComponent(catalogo)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return res.data;
}

// Crea el aviso en SAP
export async function crearAvisoAveriaSap(payload, token) {
  const res = await api.post('/sap/aviso-averia', payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
}
