// src/offline/prefetchOrdenesTecnico.js
import api from "../services/api";
import {
  saveOrdenTecnicoDetail,
  shouldCacheDetailByOrder,
  buildOfflineWindow,
} from "./ordenesTecnicoCache";

function pickSecondAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results.length >= 2 ? results[1] : results[0];
}

function mapDireccionLikeBackend(addr) {
  if (!addr) return { cliente: "", direccion: "" };

  const Name1 = addr.Name1 ?? "";
  const Name2 = addr.Name2 ?? "";
  const Street = addr.Street ?? addr.StreetName ?? "";
  const HouseNum1 = addr.HouseNum1 ?? "";
  const StrSuppl3 = addr.StrSuppl3 ?? "";
  const Location = addr.Location ?? "";
  const City1 = addr.City1 ?? "";
  const Region = addr.Region ?? "";
  const PostCode1 = addr.PostCode1 ?? "";
  const Country = addr.Country ?? "";

  const cliente = [Name1, Name2].filter(Boolean).join(" ").trim();
  const direccion = [
    `${Street} ${HouseNum1}`.trim(),
    StrSuppl3,
    Location,
    City1,
    Region,
    PostCode1,
    Country,
  ]
    .filter((x) => x && String(x).trim().length > 0)
    .join(", ");

  return { cliente, direccion };
}

function normalizeOpsFromBackend(ops = []) {
  if (!Array.isArray(ops)) return [];
  return ops.map((op) => {
    const Activity = op.Activity || op.activity || op.Vornr || "";
    const SubActivity = op.SubActivity || op.subactivity || op.Uvorn || "";
    const Description = op.Description || op.description || op.Ltxa1 || "";
    const StandardTextKey = op.StandardTextKey || op.standardTextKey || "";

    return {
      ...op,
      id: op.id, // si ya viene
      activity: String(Activity || ""),
      subactivity: String(SubActivity || ""),
      description: String(Description || ""),
      standardTextKey: String(StandardTextKey || ""),
      Activity: String(Activity || ""),
      SubActivity: String(SubActivity || ""),
      Description: String(Description || ""),
      StandardTextKey: String(StandardTextKey || ""),
    };
  });
}

// id estable para operaciones
const opKey = (orderId, op) =>
  `${orderId}-${op.activity || op.Activity || ""}${
    op.subactivity || op.SubActivity ? `-${op.subactivity || op.SubActivity}` : ""
  }`;

// helper para leer results OData
function odataResults(res) {
  return res?.data?.d?.results || res?.data?.results || [];
}

// helper para leer entidad OData (WorkOrderHeaderSet('id'))
function odataEntity(res) {
  return res?.data?.d || res?.data || {};
}

export async function prefetchOrdenesTecnicoDetalles({
  orderIds = [],
  concurrency = 3,
}) {
  const ids = [...new Set(orderIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return { ok: 0, skip: 0, fail: 0 };

  // ventana hoy ± 8 (incluye hoy)
  const win = buildOfflineWindow(new Date());

  let ok = 0,
    skip = 0,
    fail = 0;
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const orderId = ids[idx];

      try {
        // 1) Header detalle (OData)
        const resOrden = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')?$format=json`
        );
        const baseOrden = odataEntity(resOrden);

        const orderIdReal = String(baseOrden?.Orderid || orderId).trim();

        // 1.1) si está fuera de ventana hoy±8 -> NO guardes
        // shouldCacheDetailByOrder usa order.start_date, aquí se lo damos desde StartDate
        const orderLikeForWindow = {
          Orderid: orderIdReal,
          start_date: baseOrden?.StartDate,
        };

        if (!shouldCacheDetailByOrder(orderLikeForWindow, new Date())) {
          skip++;
          continue;
        }

        // 2) Addresses (cliente + dirección)
        let direccionSap = "";
        let clienteSap = "";
        try {
          const resAddr = await api.get(
            `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdReal}')/ToAddresses?$format=json`
          );
          const results = odataResults(resAddr);
          const chosen = pickSecondAddress(results);
          const mapped = mapDireccionLikeBackend(chosen);
          direccionSap = mapped.direccion || "";
          clienteSap = mapped.cliente || "";
        } catch {}

        // 3) Partners (OData)
        let partners = [];
        try {
          const resPartners = await api.get(
            `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdReal}')/ToPartners?$format=json`
          );
          partners = odataResults(resPartners);
        } catch {}

        // 4) Operations (OData)
        let ops = [];
        try {
          const resOps = await api.get(
            `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdReal}')/ToOperations?$format=json`
          );
          const rawOps = odataResults(resOps);
          ops = normalizeOpsFromBackend(rawOps).map((o) => ({
            ...o,
            id: o.id || opKey(orderIdReal, o),
          }));
        } catch {
          ops = [];
        }

        // 5) shape final (similar a tu DetalleOrden)
        const detail = {
          // mapeo OData -> tu app
          Orderid: orderIdReal,
          order_type: baseOrden?.OrderType ?? null,
          equipment: baseOrden?.Equipment ?? null,
          plant: baseOrden?.Plant ?? null,

          // IMPORTANTÍSIMO: tus filtros offline usan start_date/finish_date
          start_date: baseOrden?.StartDate ?? null,
          finish_date: baseOrden?.FinishDate ?? null,

          short_text: baseOrden?.ShortText ?? null,

          cliente: clienteSap || "",
          direccion: direccionSap || "",

          partners,
          operaciones: ops,

          // si quieres conservar el resto del header por si tu UI lo usa:
          // (no suele pesar mucho)
          _raw: baseOrden,
        };

        await saveOrdenTecnicoDetail(orderIdReal, detail);
        ok++;
      } catch (e) {
        console.log("[prefetch] fail order:", orderId, e?.message || e);
        fail++;
      }
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Number(concurrency) || 1) },
    () => worker()
  );
  await Promise.all(workers);

  return { ok, skip, fail, window: win };
}
