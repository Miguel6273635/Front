// src/services/ordenesSupervisor.js
import api from "./api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cacheGet, cacheSet } from "../offline/db";
import { cacheKeys } from "../offline/keys";
import { isOnline } from "../offline/net";

/* ======================
   Helpers: SAP /Date(…)/ -> ms
   ====================== */
function sapDateToMs(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;

  const s = String(value);
  const m = s.match(/\/Date\((\-?\d+)\)\//);
  if (!m) return null;
  return Number(m[1]);
}

/* ======================
   Normaliza OData/Array a Array
   ====================== */
function extractArray(payload) {
  // 1) ya viene como array
  if (Array.isArray(payload)) return payload;

  // 2) OData típico: { d: { results: [...] } }
  const odata = payload?.d?.results;
  if (Array.isArray(odata)) return odata;

  // 3) variante: { results: [...] }
  const results = payload?.results;
  if (Array.isArray(results)) return results;

  // 4) si el backend te manda algo raro
  return [];
}

/* ======================
   Mapea objeto SAP -> UI
   - si ya viene normalizado, también lo respeta
   ====================== */
function mapOrdenToUi(o) {
  // Caso A: ya viene normalizado (tu backend anterior)
  // ej: { orderid, equipment, startdate, finishdate, estatus, ... }
  if (o && (o.orderid || o.Orderid)) {
    const orderid = o.orderid ?? o.Orderid ?? "";
    const equipment = o.equipment ?? o.Equipment ?? "";
    const nombre_orden = o.nombre_orden ?? o.ShortText ?? o.shortText ?? "";

    // fechas: si ya vienen como ms/ISO, o si vienen /Date(...)/
    const startMs =
      typeof o.startdate === "number"
        ? o.startdate
        : sapDateToMs(o.startdate ?? o.StartDate);

    const finishMs =
      typeof o.finishdate === "number"
        ? o.finishdate
        : sapDateToMs(o.finishdate ?? o.FinishDate);

    // userstatus: preferimos el de SAP si existe
    const userstatus = o.userstatus ?? o.Userstatus ?? "";

    return {
      ...o,
      orderid: String(orderid),
      equipment: String(equipment),
      nombre_orden: String(nombre_orden),
      startdate: startMs,
      finishdate: finishMs,
      userstatus: String(userstatus || ""),
    };
  }

  // Caso B: objeto SAP crudo (OData)
  return {
    orderid: String(o?.Orderid ?? ""),
    equipment: String(o?.Equipment ?? ""),
    nombre_orden: String(o?.ShortText ?? ""),
    startdate: sapDateToMs(o?.StartDate),
    finishdate: sapDateToMs(o?.FinishDate),
    userstatus: String(o?.Userstatus ?? ""),
    _raw: o, // opcional por si ocupas luego algo
  };
}

/* ======================
   Export
   ====================== */
export async function fetchOrdenesSupervisor(startDate, endDate, mode = "range") {
  const correo =
    (await AsyncStorage.getItem("correo")) ||
    (await AsyncStorage.getItem("email")) ||
    (await AsyncStorage.getItem("userEmail")) ||
    "";

  const userKey = correo || "unknown";
  const key = cacheKeys.ordenesSupervisor({
    userKey,
    start: startDate,
    end: endDate,
    mode,
  });

  // 1) cache primero (rápido / offline)
  const cached = await cacheGet(key);
  const cachedArray = Array.isArray(cached?.value) ? cached.value : null;

  // 2) si no hay red -> cache
  const online = await isOnline();
  if (!online) {
    console.log("[ORDENES SUP OFFLINE] usando cache:", key, "len:", cachedArray?.length || 0);
    return cachedArray || [];
  }

  // 3) hay red: fetch + cache
  try {
    const url = "/api/ordenes/sap/list";
    const params = { start: startDate, end: endDate, mode, user: correo };

    console.log("[ORDENES SUP URL]", `${api.defaults?.baseURL || ""}${url}`, params);

    const res = await api.get(url, { params });

    // ✅ soporta array o OData
    const rawArr = extractArray(res?.data);

    // ✅ normaliza SIEMPRE (para que la vista no tenga que adivinar)
    const mapped = rawArr.map(mapOrdenToUi).filter((x) => x?.orderid);

    // cachea lo normalizado
    await cacheSet(key, mapped);

    console.log("[ORDENES SUP OK] len:", mapped.length, "ej:", mapped[0]?.orderid || "—");
    return mapped;
  } catch (e) {
    console.log("[ORDENES SUP ERROR] fallback cache:", e?.message || e);
    return cachedArray || [];
  }
}
