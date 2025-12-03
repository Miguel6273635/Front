// src/services/noMantenimiento.js
import api from './api';

// Datos base para autollenar la carta (MX, equipo, razón social, dirección, etc.)
export async function fetchDatosNoMantenimiento(orderid) {
  const res = await api.get(`/carta-no-mantenimiento/datos/${orderid}`);
  return res.data;
}

// Catálogo de causas (001–017)
export async function fetchCausasNoMantenimiento() {
  const res = await api.get('/carta-no-mantenimiento/causas');
  return res.data || [];
}

// Guardar carta + generar PDF + cambiar estatus
export async function guardarCartaNoMantenimiento(payload) {
  const res = await api.post('/carta-no-mantenimiento', payload);
  return res.data;
}
