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

function normalizeOrdenFromList(row) {
  if (!row) return null;

  const Orderid = String(row?.Orderid || row?.OrderId || "").trim();
  if (!Orderid) return null;

  return {
    ...row,

    Orderid,

    order_type:
      row?.order_type ||
      row?.OrderType ||
      row?.OrderTypeTxt ||
      null,

    equipment:
      row?.equipment ||
      row?.Equipment ||
      null,

    plant:
      row?.plant ||
      row?.Plant ||
      null,

    // ✅ La cache y el filtro offline usan start_date / finish_date
    start_date:
      row?.start_date ||
      row?.StartDate ||
      row?.BasicStartDate ||
      null,

    finish_date:
      row?.finish_date ||
      row?.FinishDate ||
      row?.BasicFinDate ||
      null,

    short_text:
      row?.short_text ||
      row?.ShortText ||
      row?.shorttext ||
      null,

    userstatus:
      row?.userstatus ||
      row?.Userstatus ||
      row?.UserSt ||
      null,

    estatus_code:
      row?.estatus_code ||
      row?.EstatusCode ||
      row?.StatusCode ||
      null,

    estatus_label:
      row?.estatus_label ||
      row?.EstatusLabel ||
      row?.StatusText ||
      null,
  };
}

export async function bootstrapPrefetchOrdenesTecnico(userEmail) {
  const online = await isOnline();
  if (!online) return { ok: false, reason: "offline" };

  const win = buildOfflineWindow(new Date());
  const start = win.startStr;
  const end = win.endStr;

  const params = new URLSearchParams({
    start,
    end,
    mode: "range",
  });

  if (userEmail) {
    params.set("user", String(userEmail).trim());
  }

  console.log("[BOOTSTRAP TECNICO] Request list:", {
    start,
    end,
    user: userEmail,
  });

  // ✅ Usamos el mismo endpoint que usa la vista de órdenes del técnico.
  // Esto evita filtrar mal por Userstatus = correo.
  const res = await api.get(`/api/ordenes/sap/list?${params.toString()}`);

  const rowsRaw = Array.isArray(res.data) ? res.data : [];

  const rows = rowsRaw
    .map(normalizeOrdenFromList)
    .filter(Boolean);

  // Seguridad: aplica ventana con tu helper por si backend/SAP manda algo fuera.
  const inWindow = filterOrdenesByWindow(rows, win.start, win.end);

  console.log("[BOOTSTRAP TECNICO] Ordenes en ventana offline:", {
    totalBackend: rows.length,
    inWindow: inWindow.length,
    start,
    end,
  });

  // 1) Guarda lista offline
  await saveOrdenesTecnicoList(userEmail, inWindow, win);

  // 2) Baja y guarda detalle + addresses + partners + operaciones
  const orderIds = inWindow
    .map((o) => String(o?.Orderid || "").trim())
    .filter(Boolean);

  const detailsResult = await prefetchOrdenesTecnicoDetalles({
    orderIds,
    concurrency: 3,
  });

  // 3) Limpia detalles de órdenes que ya no están en la ventana
  await pruneDetallesNoUsados(orderIds);

  console.log("[BOOTSTRAP TECNICO] Prefetch terminado:", {
    count: inWindow.length,
    orderIds: orderIds.length,
    details: detailsResult,
  });

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