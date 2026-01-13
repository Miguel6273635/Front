import api from "./api";

/** Encabezado/Detalle de orden (SAP) */
export async function fetchOrdenDetalleSupervisor(orderid) {
  const res = await api.get(`/api/ordenes/sap/${encodeURIComponent(String(orderid))}`);
  return res.data || null;
}

/** Operaciones “bonitas” (SAP) */
export async function fetchOperacionesSupervisor(orderid) {
  const res = await api.get(`/api/operaciones/sap/${encodeURIComponent(String(orderid))}`);
  return Array.isArray(res.data) ? res.data : [];
}

/** Componentes por operación (SAP) */
export async function fetchComponentesPorOperacion(orderid, activity) {
  const a = String(activity || "").padStart(4, "0");
  const res = await api.get(
    `/api/operaciones/ordenes/${encodeURIComponent(String(orderid))}/operaciones/${encodeURIComponent(a)}/componentes`
  );
  return Array.isArray(res.data) ? res.data : [];
}
