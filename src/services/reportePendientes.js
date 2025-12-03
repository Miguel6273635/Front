import api from './api';

// GET autollenado por orderid
export async function fetchDatosReportePendientes(orderid) {
  const { data } = await api.get(`/reporte-pendientes/datos/${orderid}`);
  return data; // { Orderid, Equipment, razon_social, direccion, TelNumber, nombre }
}

// POST guardar reporte (endpoint sugerido)
export async function guardarReportePendientes(payload) {
  const { data } = await api.post(`/reporte-pendientes`, payload);
  return data; // { ok:true, id }
}
