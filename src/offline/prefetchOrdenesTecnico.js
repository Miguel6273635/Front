import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../services/api";
import {
  saveOrdenTecnicoDetail,
  shouldCacheDetailByOrder,
  buildOfflineWindow,
  saveOrdenesTecnicoList,
  pruneDetallesByWindow,
} from "./ordenesTecnicoCache";

/*
  Archivo: src/offline/prefetchOrdenesTecnico.js

  Objetivo:
  - Traer la lista de órdenes del técnico en ventana offline.
  - Guardar la lista en cache.
  - Descargar en segundo plano el detalle de cada orden:
    cabecera, dirección, partners/correo, operaciones y componentes.
  - Evitar que app/tecnico/ordenes/[id]/index.js tenga que esperar SAP
    cuando el técnico abre el detalle.
*/

const COMPONENTS_KEY = (orderId, activity) =>
  `orderComponents:${String(orderId || "").trim()}:${String(activity || "").trim()}`;

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
  const raw = String(shortText || "").toUpperCase();
  const normalized = raw.replace(/\s+/g, "");

  if (!raw.includes("COBERTURA")) return null;

  if (normalized.includes("COBERTURABASICA")) return "BASICA";
  if (normalized.includes("COBERTURAMEDIA")) return "MEDIA";
  if (normalized.includes("COBERTURASEMI")) return "SEMI";

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

async function fetchBackendDetalle(orderId) {
  try {
    const resOrden = await api.get(`/api/ordenes/sap/${orderId}`);

    return resOrden?.data || {};
  } catch (e) {
    console.log(
      "[prefetch][backend detalle] no se pudo cargar:",
      orderId,
      e?.response?.data || e?.message || e,
    );

    return {};
  }
}

async function fetchHeaderDetalle(orderId) {
  try {
    const resHeader = await api.get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')?$format=json`,
    );

    return odataEntity(resHeader);
  } catch (e) {
    console.log(
      "[prefetch][header] no se pudo cargar:",
      orderId,
      e?.response?.data || e?.message || e,
    );

    return {};
  }
}

async function fetchBaseOrden(orderId) {
  /*
    Se combinan los dos orígenes porque:
    - /api/ordenes/sap/:id suele venir normalizado por backend.
    - WorkOrderHeaderSet trae campos SAP directos como ShortText.
  */
  const [backendDetalle, headerDetalle] = await Promise.all([
    fetchBackendDetalle(orderId),
    fetchHeaderDetalle(orderId),
  ]);

  return {
    ...(backendDetalle || {}),
    ...(headerDetalle || {}),
  };
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
      "[prefetch][addresses] falló ToAddresses, intentando endpoint backend:",
      orderIdReal,
      e?.response?.data || e?.message || e,
    );
  }

  try {
    const resAddr = await api.get(`/api/ordenes/sap/${orderIdReal}/addresses`);
    const results = resAddr?.data?.results || resAddr?.data?.d?.results || [];
    const chosen = pickSecondAddress(results);
    const mapped = mapDireccionLikeBackend(chosen);

    return {
      cliente: mapped.cliente || "",
      direccion: mapped.direccion || "",
    };
  } catch (e2) {
    console.log(
      "[prefetch][addresses] no se pudieron cargar:",
      orderIdReal,
      e2?.response?.data || e2?.message || e2,
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

async function saveOfflineComponents(orderId, activity, data) {
  try {
    await AsyncStorage.setItem(
      COMPONENTS_KEY(orderId, activity),
      JSON.stringify(Array.isArray(data) ? data : []),
    );

    return true;
  } catch (e) {
    console.log(
      "[prefetch][componentes] no se pudieron guardar offline:",
      orderId,
      activity,
      e?.message || e,
    );

    return false;
  }
}

async function fetchComponentesOperacion(orderId, activity) {
  const cleanOrderId = String(orderId || "").trim();
  const cleanActivity = String(activity || "").trim();

  if (!cleanOrderId || !cleanActivity) return [];

  try {
    const res = await api.get(
      `/api/operaciones/ordenes/${cleanOrderId}/operaciones/${cleanActivity}/componentes`,
    );

    const data = Array.isArray(res.data) ? res.data : [];

    await saveOfflineComponents(cleanOrderId, cleanActivity, data);

    return data;
  } catch (e) {
    console.log(
      "[prefetch][componentes] no se pudieron cargar:",
      cleanOrderId,
      cleanActivity,
      e?.response?.data || e?.message || e,
    );

    return [];
  }
}

async function prefetchComponentesOrden(orderId, ops = [], concurrency = 2) {
  const actividades = [
    ...new Set(
      (Array.isArray(ops) ? ops : [])
        .map((op) => String(op?.activity || op?.Activity || "").trim())
        .filter(Boolean),
    ),
  ];

  if (!actividades.length) {
    return { ok: 0, fail: 0, total: 0 };
  }

  let i = 0;
  let ok = 0;
  let fail = 0;

  async function worker() {
    while (i < actividades.length) {
      const idx = i++;
      const activity = actividades[idx];

      const data = await fetchComponentesOperacion(orderId, activity);

      if (Array.isArray(data)) ok++;
      else fail++;
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Number(concurrency) || 1) },
    () => worker(),
  );

  await Promise.all(workers);

  return {
    ok,
    fail,
    total: actividades.length,
  };
}

export async function prefetchOrdenesTecnicoDetalles({
  orderIds = [],
  concurrency = 3,
  prefetchComponents = true,
}) {
  const ids = [
    ...new Set(orderIds.map((x) => String(x).trim()).filter(Boolean)),
  ];

  if (!ids.length) {
    return {
      ok: 0,
      skip: 0,
      fail: 0,
      components: { ok: 0, fail: 0, total: 0 },
    };
  }

  const win = buildOfflineWindow(new Date());

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let componentsOk = 0;
  let componentsFail = 0;
  let componentsTotal = 0;
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const orderId = ids[idx];

      try {
        const baseOrden = await fetchBaseOrden(orderId);

        const orderIdReal = String(
          baseOrden?.Orderid || baseOrden?.OrderId || orderId,
        ).trim();

        const startDate = pickStartDate(baseOrden);
        const finishDate = pickFinishDate(baseOrden);

        const orderLikeForWindow = {
          Orderid: orderIdReal,
          start_date: startDate,
          StartDate: startDate,
          finish_date: finishDate,
          FinishDate: finishDate,
        };

        if (!shouldCacheDetailByOrder(orderLikeForWindow, new Date())) {
          console.log("[prefetch][skip fuera ventana]", {
            orderId: orderIdReal,
            start_date: startDate,
            finish_date: finishDate,
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

        const [{ cliente, direccion }, { partners, emailFromPartners }, ops] =
          await Promise.all([
            fetchAddresses(orderIdReal),
            fetchPartners(orderIdReal),
            fetchOperaciones(orderIdReal),
          ]);

        let componentResult = { ok: 0, fail: 0, total: 0 };

        if (prefetchComponents) {
          componentResult = await prefetchComponentesOrden(orderIdReal, ops, 2);
          componentsOk += componentResult.ok;
          componentsFail += componentResult.fail;
          componentsTotal += componentResult.total;
        }

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
          ...baseOrden,

          Orderid: orderIdReal,
          OrderId: orderIdReal,

          order_type:
            baseOrden?.order_type ||
            baseOrden?.OrderType ||
            baseOrden?.OrderTypeTxt ||
            null,

          equipment: baseOrden?.equipment || baseOrden?.Equipment || null,
          Equipment: baseOrden?.Equipment || baseOrden?.equipment || null,

          plant: baseOrden?.plant || baseOrden?.Plant || null,
          Plant: baseOrden?.Plant || baseOrden?.plant || null,

          start_date: startDate,
          StartDate: startDate,
          finish_date: finishDate,
          FinishDate: finishDate,

          ShortText: shortTextValue || null,
          short_text: shortTextValue || null,
          cobertura_tipo: coberturaDetectada || baseOrden?.cobertura_tipo || null,

          userstatus: userstatusRaw || baseOrden?.userstatus || null,
          estatus_code: estatusCodeRaw || userstatusRaw || null,
          estatus_label: estatusLabelRaw || baseOrden?.estatus_label || null,
          estatus_tipo: baseOrden?.estatus_tipo ?? null,
          checkin_done: !!baseOrden?.checkin_done,

          cliente:
            cliente ||
            baseOrden?.cliente ||
            `${baseOrden?.Name1 ?? ""} ${baseOrden?.Name2 ?? ""}`.trim() ||
            "",
          direccion:
            direccion ||
            baseOrden?.direccion ||
            baseOrden?.address ||
            baseOrden?.partner_address ||
            "",
          cliente_email:
            emailFromPartners ||
            baseOrden?.cliente_email ||
            baseOrden?.email ||
            "",

          partners: Array.isArray(partners) ? partners : [],
          operaciones: Array.isArray(ops) ? ops : [],

          _prefetchedAt: Date.now(),
          _componentsPrefetch: componentResult,
          _raw: baseOrden,
        };

        const saved = await saveOrdenTecnicoDetail(orderIdReal, detail);

        console.log("[prefetch][detail saved]", {
          orderId: orderIdReal,
          saved,
          operaciones: Array.isArray(detail?.operaciones)
            ? detail.operaciones.length
            : "NO_ARRAY",
          componentes: componentResult,
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

  return {
    ok,
    skip,
    fail,
    window: win,
    components: {
      ok: componentsOk,
      fail: componentsFail,
      total: componentsTotal,
    },
  };
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
      prefetchComponents: true,
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
