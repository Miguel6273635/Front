import api from './api';

export async function fetchDatosMantenimiento(orderid) {
  const { data } = await api.get(`/mantenimiento/datos/${orderid}`);
  return data; // { Orderid, order_type, equipment, tecnico_nombre, Client, Name1, Name2 }
}

export async function guardarMantEscaleras(payload) {
  const { data } = await api.post(`/mantenimiento/escaleras`, payload);
  return data; // { ok:true, id }
}

export async function guardarMantElevadores(payload) {
  const { data } = await api.post(`/mantenimiento/elevadores`, payload);
  return data; // { ok:true, id }
}
