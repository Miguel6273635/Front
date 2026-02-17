// src/offline/bootstrapSyncTecnico.js
import { isOnline } from "./net";
import {
  buildOfflineWindow,
  filterOrdenesByWindow,
  saveOrdenesTecnicoList,
  pruneDetallesNoUsados,
} from "./ordenesTecnicoCache";
import { prefetchOrdenesTecnicoDetalles } from "./prefetchOrdenesTecnico";
import api from "../services/api";

// helpers OData datetime
const odataStart = (ymd) => `datetime'${ymd}T00:00:00'`;
const odataEnd = (ymd) => `datetime'${ymd}T23:59:59'`;

// OData => tu shape (IMPORTANTE: start_date/finish_date)
function mapHeaderRow(r) {
  if (!r) return null;
  const Orderid = String(r.Orderid || "").trim();
  if (!Orderid) return null;

  return {
    Orderid,
    order_type: r.OrderType ?? null,
    equipment: r.Equipment ?? null,
    plant: r.Plant ?? null,

    // 👇 tu cache usa start_date para filtrar ventana
    start_date: r.StartDate ?? null,
    finish_date: r.FinishDate ?? null,

    short_text: r.ShortText ?? null,

    userstatus: r.Userstatus ?? null,
    SysStatus: r.SysStatus ?? null,
    UserSt: r.UserSt ?? null,
  };
}

function extractODataResults(res) {
  return res?.data?.d?.results || res?.data?.results || [];
}

export async function bootstrapPrefetchOrdenesTecnico(userEmail) {
  const online = await isOnline();
  if (!online) return { ok: false, reason: "offline" };

  const win = buildOfflineWindow(new Date());
  const start = win.startStr;
  const end = win.endStr;

  // ✅ Tu listado real OData (ventana hoy±8)
  const filter =
    `StartDate ge ${odataStart(start)} ` +
    `and FinishDate le ${odataEnd(end)} ` +
    `and Userstatus eq '${String(userEmail).trim()}'`;

  const url =
    `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$format=json`;

  const res = await api.get(url);

  const rows = extractODataResults(res).map(mapHeaderRow).filter(Boolean);

  // seguridad: aplica ventana con tu helper (por si SAP manda algo raro)
  const inWindow = filterOrdenesByWindow(rows, win.start, win.end);

  // 1) guarda lista offline
  await saveOrdenesTecnicoList(userEmail, inWindow, win);

  // 2) baja y guarda detalle+addresses+partners+ops para esas órdenes
  const orderIds = inWindow
    .map((o) => String(o?.Orderid || "").trim())
    .filter(Boolean);

  const detailsResult = await prefetchOrdenesTecnicoDetalles({
    orderIds,
    concurrency: 3,
  });

  // 3) limpia detalles de órdenes que ya no están
  await pruneDetallesNoUsados(orderIds);

  return {
    ok: true,
    start,
    end,
    count: inWindow.length,
    orderIds,
    window: win,
    details: detailsResult,
  };
}
