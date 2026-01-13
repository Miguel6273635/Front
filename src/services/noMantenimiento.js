// src/services/noMantenimiento.js
import api from './api';

export async function fetchDatosNoMantenimiento(orderid) {
  const res = await api.get(`/api/carta-no-mantenimiento/datos/${orderid}`);
  return res.data;
}

export async function guardarCartaNoMantenimiento(payload) {
  const res = await api.post(`/api/carta-no-mantenimiento`, payload);
  return res.data;
}
