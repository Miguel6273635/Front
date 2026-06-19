import api from "../services/api";
import {
  saveOrdenTecnicoDetail,
  shouldCacheDetailByOrder,
  buildOfflineWindow,
  saveOrdenesTecnicoList,
  pruneDetallesByWindow,
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
    const Description = op.Description || op.description || op.Ltxa1 || "";
    const StandardTextKey = op.StandardTextKey || op.standardTextKey || "";

    return {
      ...op,
      id: op.id,
      activity: String(Activity || ""),
      description: String(Description || ""),
      standardTextKey: String(StandardTextKey || ""),
      Activity: String(Activity || ""),
      Description: String(Description || ""),
      StandardTextKey: String(StandardTextKey || ""),
    };
  });
}

const opKey = (orderId, op, idx) => {
  const activity = String(op.activity || op.Activity || "").trim();
  const usr02 = String(op.Usr02 || op.usr02 || "SIN UBICACIÓN").trim();
  const desc = String(op.description || op.Description || "").trim();
  const stk = String(op.standardTextKey || op.StandardTextKey || "").trim();

  return `${orderId}-${activity}-${usr02}-${desc}-${stk}-${idx}`;
};

function odataResults(res) {
  return res?.data?.d?.results || res?.data?.results || [];
}

function odataEntity(res) {
  return res?.data?.d || res?.data || {};
}

function detectCoberturaFromShortText(shortText) {
  const s = String(shortText || "").toUpperCase();
  const idx = s.indexOf("COBERTURA");
  if (idx < 0) return null;

  const tail = s.slice(idx);

  if (tail.includes("COBERTURABASICA")) return "BASICA";
  if (tail.includes("COBERTURAMEDIA")) return "MEDIA";
  if (tail.includes("COBERTURASEMI")) return "SEMI";

  return null;
}

function pickStartDate(baseOrden) {
  return (
    baseOrden?.start_date ||
    baseOrden?.StartDate ||
    baseOrden?.BasicStartDate ||
    baseOrden?.BasicStart ||
    null
  );
}

function pickFinishDate(baseOrden) {
  return (
    baseOrden?.finish_date ||
    baseOrden?.FinishDate ||
    baseOrden?.BasicFinDate ||
    baseOrden?.BasicFinish ||
    null
  );
}

async function fetchHeaderDetalle(orderId) {
  const resOrden = await api.get(
    `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')?$format=json`,
  );

  return odataEntity(resOrden);
}

async function fetchAddresses(orderIdReal) {
  try {
    const resAddr = await api.get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdReal}')/ToAddresses?$format=json`,
    );

    const results = odataResults(resAddr);
    const chosen = pickSecondAddress(results);
    const mapped = mapDireccionLikeBackend(chosen);

    return {
      cliente: mapped.cliente || "",
      direccion: mapped.direccion || "",
    };
  } catch (e) {
    console.log(
      "[prefetch][addresses] no se pudieron cargar:",
      orderIdReal,
      e?.response?.data || e?.message || e,
    );

    return {
      cliente: "",
      direccion: "",
    };
  }
}

async function fetchPartners(orderIdReal) {
  try {
    const resPartners = await api.get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdReal}')/ToPartners?$format=json`,
    );

    const partners = odataResults(resPartners);

    const re = (partners || []).find(
      (p) => String(p?.PartnRoleOld || "").trim() === "RE",
    );

    const emailFromPartners = String(re?.Mail1 || re?.Mail2 || "").trim();

    return {
      partners,
      emailFromPartners,
    };
  } catch (e) {
    console.log(
      "[prefetch][partners] no se pudieron cargar:",
      orderIdReal,
      e?.response?.data || e?.message || e,
    );

    return {
      partners: [],
      emailFromPartners: "",
    };
  }
}

async function fetchOperaciones(orderIdReal) {
  let ops = [];

  try {
    const resOps = await api.get(`/api/operaciones/sap/${String(orderIdReal)}`);

    const rawOps =
      resOps?.data?.d?.results ||
      resOps?.data?.results ||
      resOps?.data?.operaciones ||
      resOps?.data ||
      [];

    ops = normalizeOpsFromBackend(rawOps).map((o, idx) => ({
      ...o,
      id: o.id || opKey(orderIdReal, o, idx),
    }));

    console.log("[prefetch][ops] cargadas desde /api/operaciones/sap:", {
      orderId: orderIdReal,
      count: ops.length,
    });

    return ops;
  } catch (e1) {
    console.log(
      "[prefetch][ops] falló /api/operaciones/sap, intentando ToOperations:",
      orderIdReal,
      e1?.response?.data || e1?.message || e1,
    );
  }

  try {
    const resOps = await api.get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdReal}')/ToOperations?$format=json`,
    );

    const rawOps = odataResults(resOps);
    ops = normalizeOpsFromBackend(rawOps).map((o, idx) => ({
      ...o,
      id: o.id || opKey(orderIdReal, o, idx),
    }));

    console.log("[prefetch][ops] cargadas desde ToOperations:", {
      orderId: orderIdReal,
      count: ops.length,
    });

    return ops;
  } catch (e2) {
    console.log(
      "[prefetch][ops] no se pudieron cargar operaciones:",
      orderIdReal,
      e2?.response?.data || e2?.message || e2,
    );

    return [];
  }
}

export async function prefetchOrdenesTecnicoDetalles({
  orderIds = [],
  concurrency = 3,
}) {
  const ids = [
    ...new Set(orderIds.map((x) => String(x).trim()).filter(Boolean)),
  ];

  if (!ids.length) return { ok: 0, skip: 0, fail: 0 };

  const win = buildOfflineWindow(new Date());

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const orderId = ids[idx];

      try {
        const baseOrden = await fetchHeaderDetalle(orderId);

        const orderIdReal = String(
          baseOrden?.Orderid || baseOrden?.OrderId || orderId,
        ).trim();

        const startDate = pickStartDate(baseOrden);
        const finishDate = pickFinishDate(baseOrden);

        const orderLikeForWindow = {
          Orderid: orderIdReal,
          start_date: startDate,
        };

        if (!shouldCacheDetailByOrder(orderLikeForWindow, new Date())) {
          console.log("[prefetch][skip fuera ventana]", {
            orderId: orderIdReal,
            start_date: startDate,
          });

          skip++;
          continue;
        }

        const shortTextValue =
          baseOrden?.ShortText ??
          baseOrden?.shorttext ??
          baseOrden?.Shorttext ??
          baseOrden?.shortText ??
          "";

        const coberturaDetectada = detectCoberturaFromShortText(shortTextValue);

        const { cliente, direccion } = await fetchAddresses(orderIdReal);
        const { partners, emailFromPartners } =
          await fetchPartners(orderIdReal);
        const ops = await fetchOperaciones(orderIdReal);

        const userstatusRaw = String(
          baseOrden?.Userstatus ??
            baseOrden?.userstatus ??
            baseOrden?.UserSt ??
            baseOrden?.userSt ??
            "",
        ).trim();

        const estatusCodeRaw = String(
          baseOrden?.estatus_code ??
            baseOrden?.EstatusCode ??
            baseOrden?.StatusCode ??
            "",
        ).trim();

        const estatusLabelRaw = String(
          baseOrden?.estatus_label ??
            baseOrden?.EstatusLabel ??
            baseOrden?.StatusText ??
            "",
        ).trim();

        const detail = {
          Orderid: orderIdReal,

          order_type:
            baseOrden?.order_type ||
            baseOrden?.OrderType ||
            baseOrden?.OrderTypeTxt ||
            null,

          equipment: baseOrden?.equipment || baseOrden?.Equipment || null,
          plant: baseOrden?.plant || baseOrden?.Plant || null,

          start_date: startDate,
          finish_date: finishDate,

          ShortText: shortTextValue || null,
          short_text: shortTextValue || null,
          cobertura_tipo: coberturaDetectada || null,

          userstatus: userstatusRaw || null,
          estatus_code: estatusCodeRaw || userstatusRaw || null,
          estatus_label: estatusLabelRaw || null,
          estatus_tipo: baseOrden?.estatus_tipo ?? null,
          checkin_done: !!baseOrden?.checkin_done,

          cliente: cliente || "",
          direccion: direccion || "",
          cliente_email: emailFromPartners || "",

          partners: Array.isArray(partners) ? partners : [],
          operaciones: Array.isArray(ops) ? ops : [],

          _raw: baseOrden,
        };

        const saved = await saveOrdenTecnicoDetail(orderIdReal, detail);

        console.log("[prefetch][detail saved]", {
          orderId: orderIdReal,
          saved,
          operaciones: Array.isArray(detail?.operaciones)
            ? detail.operaciones.length
            : "NO_ARRAY",
          start_date: detail?.start_date,
          finish_date: detail?.finish_date,
        });

        ok++;
      } catch (e) {
        console.log(
          "[prefetch] fail order:",
          orderId,
          e?.response?.data || e?.message || e,
        );

        fail++;
      }
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Number(concurrency) || 1) },
    () => worker(),
  );

  await Promise.all(workers);

  return { ok, skip, fail, window: win };
}

// ==========================================
// Función maestra para sincronizar órdenes del técnico
// Se usa desde backgroundSync.js
// ==========================================
export async function prefetchOrdenesTecnico(userEmail = null) {
  try {
    console.log("[PREFETCH TECNICO] Iniciando sincronización...");

    const win = buildOfflineWindow(new Date());

    const startStr = win.startStr;
    const endStr = win.endStr;

    const params = new URLSearchParams({
      start: startStr,
      end: endStr,
      mode: "range",
    });

    if (userEmail) {
      params.set("user", userEmail);
    }

    const res = await api.get(`/api/ordenes/sap/list?${params.toString()}`);

    const data = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.data?.data)
        ? res.data.data
        : Array.isArray(res?.data?.results)
          ? res.data.results
          : [];

    await saveOrdenesTecnicoList(userEmail, data, win);

    const orderIds = data
      .map((x) => x?.Orderid || x?.OrderId || x?.orderid)
      .filter(Boolean)
      .map((x) => String(x).trim());

    console.log("[PREFETCH TECNICO] Órdenes encontradas:", orderIds.length);

    const detalleResult = await prefetchOrdenesTecnicoDetalles({
      orderIds,
      concurrency: 3,
    });

    await pruneDetallesByWindow(userEmail, win);

    const result = {
      ok: true,
      count: orderIds.length,
      window: {
        startStr,
        endStr,
      },
      detalleResult,
    };

    console.log("[PREFETCH TECNICO] Finalizado:", result);

    return result;
  } catch (e) {
    console.log(
      "[PREFETCH TECNICO] Error:",
      e?.response?.data || e?.message || e,
    );

    return {
      ok: false,
      reason: "prefetch_tecnico_error",
      error: e?.message || String(e),
    };
  }
}