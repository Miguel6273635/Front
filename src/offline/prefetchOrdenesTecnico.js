import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../services/api";
import {
  saveOrdenTecnicoDetail,
  shouldCacheDetailByOrder,
  buildOfflineWindow,
  saveOrdenesTecnicoList,
  filterOrdenesByWindow,
  pruneDetallesByWindow,
} from "./ordenesTecnicoCache";

let PREFETCH_API_INSTANCE = api;
let PREFETCH_ENSURE_VALID_TOKEN = null;

function configurePrefetchRuntime(options = {}) {
  PREFETCH_API_INSTANCE = options?.apiInstance || api;
  PREFETCH_ENSURE_VALID_TOKEN =
    typeof options?.ensureValidToken === "function"
      ? options.ensureValidToken
      : null;
}

function getPrefetchApi() {
  return PREFETCH_API_INSTANCE || api;
}

async function ensureTokenBeforeRequest(label = "request") {
  if (typeof PREFETCH_ENSURE_VALID_TOKEN !== "function") return true;

  try {
    const ok = await PREFETCH_ENSURE_VALID_TOKEN();

    if (!ok) {
      throw new Error(`Token no válido antes de ${label}`);
    }

    return true;
  } catch (e) {
    console.log(
      "[PREFETCH TECNICO][TOKEN] No se pudo validar token:",
      label,
      e?.message || e,
    );

    throw e;
  }
}

function isTokenAusenteError(e) {
  const status = Number(e?.response?.status || 0);
  const msg = JSON.stringify(e?.response?.data || e?.message || e || "")
    .toLowerCase();

  return status === 401 && msg.includes("token ausente");
}

async function retryOnceWithFreshToken(fn, label = "request") {
  try {
    await ensureTokenBeforeRequest(label);
    return await fn();
  } catch (e) {
    if (!isTokenAusenteError(e)) throw e;

    console.log("[PREFETCH TECNICO][TOKEN] 401 Token ausente. Reintentando:", label);

    await ensureTokenBeforeRequest(`${label}:retry`);

    return await fn();
  }
}


/*
  Archivo: src/offline/prefetchOrdenesTecnico.js

  Objetivo:
  - Traer la lista de órdenes del técnico en ventana offline.
  - Guardar la lista en cache.
  - Precargar el detalle de cada orden:
    cabecera, dirección, partners/correo, operaciones y componentes.
  - Evitar que app/tecnico/ordenes/[id]/index.js tenga que esperar SAP
    cuando el técnico abre el detalle.
*/

const COMPONENTS_KEY = (orderId, activity) =>
  `orderComponents:${String(orderId || "").trim()}:${String(activity || "").trim()}`;

function pickBestAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const clean = results.filter(Boolean);

  if (!clean.length) return null;

  const scoreAddress = (a) => {
    const nameScore = [a?.Name1, a?.Name2, a?.Name3, a?.Name4].filter((x) =>
      String(x || "").trim(),
    ).length;

    const dirScore = [
      a?.Street,
      a?.StreetName,
      a?.HouseNum1,
      a?.StrSuppl1,
      a?.StrSuppl2,
      a?.StrSuppl3,
      a?.Location,
      a?.City2,
      a?.City1,
      a?.Region,
      a?.PostCode1,
      a?.Country,
    ].filter((x) => String(x || "").trim()).length;

    return nameScore * 10 + dirScore;
  };

  return clean.sort((a, b) => scoreAddress(b) - scoreAddress(a))[0] || null;
}

function mapDireccionLikeBackend(addr) {
  if (!addr) return { cliente: "", direccion: "" };

  const cliente = [addr?.Name1, addr?.Name2, addr?.Name3, addr?.Name4]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  const street = [addr?.Street || addr?.StreetName, addr?.HouseNum1]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");

  const supl = [addr?.StrSuppl1, addr?.StrSuppl2, addr?.StrSuppl3]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");

  const loc = [addr?.Location, addr?.City2, addr?.City1]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");

  const reg = [addr?.Region, addr?.PostCode1, addr?.Country]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");

  const direccion = [street, supl, loc, reg]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
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

/*
  Miguel Ángel Hernández Álvarez - 01/07/2026

  Regla para guardar detalle offline:
  No debemos saltar una orden únicamente porque SAP no regresó la fecha con
  el nombre esperado. Si no hay fecha usable, se guarda parcial para que la
  app pueda trabajar offline con lo que sí se pudo traer.

  Solo se salta cuando sí hay fecha usable y claramente queda fuera de la
  ventana offline.
*/
function parseDateForWindow(value) {
  if (!value) return null;

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = parseInt(value.replace("/Date(", "").replace(")/", ""), 10);
    return Number.isNaN(ms) ? null : new Date(ms);
  }

  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function getUtcYmdForWindow(d) {
  if (!d) return null;

  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getWindowDateCandidates(orderLike = {}) {
  return [
    orderLike?.start_date,
    orderLike?.StartDate,
    orderLike?.startDate,
    orderLike?.fecha_inicio,
    orderLike?.Inicio,
    orderLike?.BasicStartDate,
    orderLike?.BasicStart,
    orderLike?.Start,

    orderLike?.finish_date,
    orderLike?.FinishDate,
    orderLike?.finishDate,
    orderLike?.fecha_fin,
    orderLike?.Fin,
    orderLike?.BasicFinDate,
    orderLike?.BasicFinish,
    orderLike?.Finish,
  ]
    .map(parseDateForWindow)
    .filter(Boolean);
}

function isDateInsideWindow(d, win) {
  const ds = getUtcYmdForWindow(d);
  const s = getUtcYmdForWindow(win?.start);
  const e = getUtcYmdForWindow(win?.end);

  if (!ds) return false;
  if (s && ds < s) return false;
  if (e && ds > e) return false;

  return true;
}

function shouldSaveDetailForOffline(orderLike, baseDate = new Date()) {
  const dates = getWindowDateCandidates(orderLike);

  if (!dates.length) {
    return {
      keep: true,
      reason: "sin_fecha_usable",
    };
  }

  /*
    Conservamos compatibilidad con shouldCacheDetailByOrder, pero agregamos
    fallback con más nombres de fecha para evitar saltar detalles válidos.
  */
  if (shouldCacheDetailByOrder(orderLike, baseDate)) {
    return {
      keep: true,
      reason: "fecha_principal_en_ventana",
    };
  }

  const win = buildOfflineWindow(baseDate);
  const inside = dates.some((d) => isDateInsideWindow(d, win));

  return {
    keep: inside,
    reason: inside ? "fecha_alternativa_en_ventana" : "fuera_ventana",
  };
}

async function fetchBackendDetalle(orderId) {
  try {
    const resOrden = await getPrefetchApi().get(`/api/ordenes/sap/${orderId}`);

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
    const resHeader = await getPrefetchApi().get(
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
    const resAddr = await getPrefetchApi().get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdReal}')/ToAddresses?$format=json`,
    );

    const results = odataResults(resAddr);
    const chosen = pickBestAddress(results);
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
    const resAddr = await getPrefetchApi().get(`/api/ordenes/sap/${orderIdReal}/addresses`);
    const results = resAddr?.data?.results || resAddr?.data?.d?.results || [];
    const chosen = pickBestAddress(results);
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
    const resPartners = await getPrefetchApi().get(
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
    const resOps = await getPrefetchApi().get(`/api/operaciones/sap/${String(orderIdReal)}`);

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
    const resOps = await getPrefetchApi().get(
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

  const label = `componentes:${cleanOrderId}:${cleanActivity}`;

  try {
    const res = await retryOnceWithFreshToken(
      () =>
        getPrefetchApi().get(
          `/api/operaciones/ordenes/${cleanOrderId}/operaciones/${cleanActivity}/componentes`,
        ),
      label,
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
  apiInstance = null,
  ensureValidToken = null,
} = {}) {
  configurePrefetchRuntime({ apiInstance, ensureValidToken });
  const ids = [
    ...new Set(orderIds.map((x) => String(x).trim()).filter(Boolean)),
  ];

  if (!ids.length) {
    return {
      ok: 0,
      skip: 0,
      fail: 0,
      operaciones: { ok: 0, total: 0 },
      actividades: { ok: 0, total: 0 },
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
  let operacionesTotal = 0;
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const orderId = ids[idx];

      try {
        await ensureTokenBeforeRequest(`detalle:${orderId}`);

        const baseOrden = await fetchBaseOrden(orderId);

        const orderIdReal = String(
          baseOrden?.Orderid || baseOrden?.OrderId || orderId,
        ).trim();

        const startDate = pickStartDate(baseOrden);
        const finishDate = pickFinishDate(baseOrden);

        const orderLikeForWindow = {
          ...baseOrden,
          Orderid: orderIdReal,
          OrderId: orderIdReal,

          start_date: startDate,
          StartDate: startDate,
          startDate:
            baseOrden?.startDate ||
            baseOrden?.BasicStartDate ||
            baseOrden?.BasicStart ||
            startDate,
          fecha_inicio: baseOrden?.fecha_inicio || baseOrden?.Inicio || startDate,
          Inicio: baseOrden?.Inicio || baseOrden?.fecha_inicio || startDate,
          BasicStartDate: baseOrden?.BasicStartDate || startDate,
          BasicStart: baseOrden?.BasicStart || startDate,

          finish_date: finishDate,
          FinishDate: finishDate,
          finishDate:
            baseOrden?.finishDate ||
            baseOrden?.BasicFinDate ||
            baseOrden?.BasicFinish ||
            finishDate,
          fecha_fin: baseOrden?.fecha_fin || baseOrden?.Fin || finishDate,
          Fin: baseOrden?.Fin || baseOrden?.fecha_fin || finishDate,
          BasicFinDate: baseOrden?.BasicFinDate || finishDate,
          BasicFinish: baseOrden?.BasicFinish || finishDate,
        };

        const windowDecision = shouldSaveDetailForOffline(
          orderLikeForWindow,
          new Date(),
        );

        if (!windowDecision.keep) {
          console.log("[prefetch][skip fuera ventana]", {
            orderId: orderIdReal,
            reason: windowDecision.reason,
            start_date: startDate,
            finish_date: finishDate,
          });

          skip++;
          continue;
        }

        if (windowDecision.reason === "sin_fecha_usable") {
          console.log("[prefetch][sin fecha] Se guarda detalle parcial:", {
            orderId: orderIdReal,
          });
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

        /*
          Miguel Ángel Hernández Álvarez - 02/07/2026

          Conteo para la primera vista:
          detalleResult.ok cuenta órdenes guardadas, no actividades.
          Por eso acumulamos aquí las operaciones reales que llegaron
          desde SAP/API durante la precarga.
        */
        const opsCount = Array.isArray(ops) ? ops.length : 0;
        operacionesTotal += opsCount;

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
    operaciones: {
      ok: operacionesTotal,
      total: operacionesTotal,
    },
    actividades: {
      ok: operacionesTotal,
      total: operacionesTotal,
    },
    components: {
      ok: componentsOk,
      fail: componentsFail,
      total: componentsTotal,
    },
  };
}

// ==========================================
// Precarga rápida del rango offline del técnico
// Se usa desde app/tecnico/preparando/index.js
// Objetivo:
// - Cargar únicamente el rango configurado en buildOfflineWindow.
// - Guardar lista limpia sin mezclar cache viejo.
// - Precargar detalle, operaciones y componentes del rango.
// - La precarga fuerte se hace aquí para que Inicio Técnico y Órdenes usen cache.
// ==========================================
export async function prefetchOrdenesTecnicoDiaRapido(
  userEmail = null,
  options = {},
) {
  configurePrefetchRuntime(options);

  try {
    console.log(
      "[PREFETCH TECNICO][3_DIAS] Iniciando precarga completa del rango offline...",
    );

    const offlineWindow = buildOfflineWindow(new Date());

    const params = new URLSearchParams({
      start: offlineWindow.startStr,
      end: offlineWindow.endStr,
      mode: "range",
    });

    if (userEmail) {
      params.set("user", userEmail);
    }

    const res = await retryOnceWithFreshToken(
      () =>
        getPrefetchApi().get(`/api/ordenes/sap/list?${params.toString()}`),
      "ordenes:list:dia",
    );

    const data = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.data?.data)
        ? res.data.data
        : Array.isArray(res?.data?.results)
          ? res.data.results
          : [];

    /*
      Miguel Ángel Hernández Álvarez - 02/07/2026

      Corrección:
      La precarga NO debe mezclar cache viejo con la respuesta nueva de SAP.
      Antes, si el cache ya traía 250 órdenes, aunque SAP devolviera 26,
      se volvían a guardar las 250.

      Ahora la precarga guarda únicamente lo que SAP respondió para el rango
      actual de trabajo.
    */
    const windowData = filterOrdenesByWindow(
      data,
      offlineWindow.start,
      offlineWindow.end,
    );

    await saveOrdenesTecnicoList(userEmail, windowData, offlineWindow);

    /*
      Miguel Ángel Hernández Álvarez - 02/07/2026

      Corrección:
      Los detalles, operaciones y componentes deben precargarse solo para
      las órdenes que quedaron dentro de la ventana offline.

      Antes se usaba data, y si SAP/backend respondía más registros,
      se podían precargar detalles/componentes de órdenes fuera del rango.
    */
    const orderIdsDia = windowData
      .map((x) => x?.Orderid || x?.OrderId || x?.orderid)
      .filter(Boolean)
      .map((x) => String(x).trim());

    console.log(
      "[PREFETCH TECNICO][3_DIAS] Órdenes del rango:",
      orderIdsDia.length,
    );

    const detalleResult = await prefetchOrdenesTecnicoDetalles({
      orderIds: orderIdsDia,
      concurrency: 2,
      prefetchComponents: true,
      apiInstance: options?.apiInstance || getPrefetchApi(),
      ensureValidToken: options?.ensureValidToken || PREFETCH_ENSURE_VALID_TOKEN,
    });

    const result = {
      ok: true,
      mode: "range_3_days_full",
      count: orderIdsDia.length,
      rangeStr: `${offlineWindow.startStr} -> ${offlineWindow.endStr}`,
      window: {
        startStr: offlineWindow.startStr,
        endStr: offlineWindow.endStr,
      },
      detalleResult,
    };

    console.log("[PREFETCH TECNICO][3_DIAS] Finalizado:", result);

    return result;
  } catch (e) {
    console.log(
      "[PREFETCH TECNICO][3_DIAS] Error:",
      e?.response?.data || e?.message || e,
    );

    return {
      ok: false,
      reason: "prefetch_tecnico_dia_error",
      error: e?.message || String(e),
    };
  }
}
// ==========================================
// Función maestra para precargar órdenes del técnico
// Debe usarse solo desde la pantalla de precarga o procesos explícitos de recarga,
// no desde Inicio Técnico como sincronización silenciosa.
// ==========================================
export async function prefetchOrdenesTecnico(userEmail = null, options = {}) {
  configurePrefetchRuntime(options);

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

    const res = await retryOnceWithFreshToken(
      () => getPrefetchApi().get(`/api/ordenes/sap/list?${params.toString()}`),
      "ordenes:list",
    );

    const data = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.data?.data)
        ? res.data.data
        : Array.isArray(res?.data?.results)
          ? res.data.results
          : [];

    /*
      Miguel Ángel Hernández Álvarez - 02/07/2026

      Protección para sincronización completa:
      Aunque esta función ya no debe ejecutarse desde Inicio Técnico,
      si algún flujo la llama, también debe respetar la ventana offline.
    */
    const windowData = filterOrdenesByWindow(data, win.start, win.end);

    await saveOrdenesTecnicoList(userEmail, windowData, win);

    const orderIds = windowData
      .map((x) => x?.Orderid || x?.OrderId || x?.orderid)
      .filter(Boolean)
      .map((x) => String(x).trim());

    console.log("[PREFETCH TECNICO] Órdenes encontradas:", orderIds.length);

    const detalleResult = await prefetchOrdenesTecnicoDetalles({
      orderIds,
      concurrency: 2,
      prefetchComponents: true,
      apiInstance: options?.apiInstance || getPrefetchApi(),
      ensureValidToken: options?.ensureValidToken || PREFETCH_ENSURE_VALID_TOKEN,
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
