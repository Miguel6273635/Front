import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  FlatList,
  AppState,
  Modal,
  TextInput,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { WebView } from "react-native-webview";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { addPageNumbersToPdfBase64 } from "../../../../src/services/pdf/addPageNumbersToPdf";
import { useLocalSearchParams, router } from "expo-router";

import {
  loadOrdenTecnicoDetail,
  loadOrdenesTecnicoList,
  saveOrdenTecnicoDetail,
  shouldCacheDetailByOrder,
} from "../../../../src/offline/ordenesTecnicoCache";

import {
  processSapQueue,
  upsertSapQueueItem,
} from "../../../../src/offline/sapQueue";
import {
  setLocalStatusPatch,
  patchCacheOrdenesTecnicoList,
  patchCacheOrdenTecnicoDetail,
} from "../../../../src/offline/ordenesTecnicoLocalPatch";

import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";

// ✅ HTML/PDF mantenimiento (plantillas + operaciones)
import { buildMantenimientoHtml } from "../../../../src/services/templates/buildMantenimientoHtml";

// ✅ Secciones (segmentación)
import EncabezadoDetalleOrden from "./secciones/EncabezadoDetalleOrden";
import ModalesDetalleOrden from "./secciones/ModalesDetalleOrden";
import { ListaOperacionesAgrupadas } from "./secciones/ListaOperacionesDetalle";
import PieDetalleOrden from "./secciones/PieDetalleOrden";
import ConsumiblesFinalizacion from "./secciones/ConsumiblesFinalizacion";

/* ====================== Paleta SAP Fiori (Horizon) ====================== */
const FIORI = {
  pageBg: "#F7F7F7",
  surface: "#FFFFFF",
  surfaceAlt: "#F5F7FA",
  border: "#DDE6F2",
  borderSoft: "#E8EEF7",
  text: "#0B1F3B",
  textMuted: "#63718B",
  brand: "#0A6ED1",
  brandSoft: "#E3F2FD",
  ok: "#2FBF71",
  warn: "#F5A623",
  err: "#E74C3C",
  pause: "#26a5e0ff",
};

/* ====================== Orden iniciada (contador) ====================== */
const ORDER_START_KEY = (orderId) => `orderStart:${orderId}`;
const ORDER_FINISH_KEY = (orderId) => `orderFinish:${orderId}`;
const ORDER_ELAPSED_KEY = (orderId) => `orderElapsed:${orderId}`;
const PENDING_SIGN_KEY = (orderId) => `pendingSign:${orderId}`;
const OPSTATE_KEY = (orderId) => `opState:${orderId}`;

/* ====================== Utils tiempo ====================== */
function msToHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function fmtDateTimeLocal(ms) {
  if (!Number.isFinite(ms)) return "—";

  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

async function loadOrderStart(orderId) {
  try {
    const raw = await AsyncStorage.getItem(ORDER_START_KEY(orderId));
    const v = raw ? Number(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
async function saveOrderStart(orderId, ms) {
  try {
    await AsyncStorage.setItem(ORDER_START_KEY(orderId), String(ms));
  } catch {}
}
async function clearOrderStart(orderId) {
  try {
    await AsyncStorage.removeItem(ORDER_START_KEY(orderId));
  } catch {}
}

async function loadOrderFinish(orderId) {
  try {
    const raw = await AsyncStorage.getItem(ORDER_FINISH_KEY(orderId));
    const v = raw ? Number(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
async function saveOrderFinish(orderId, ms) {
  try {
    await AsyncStorage.setItem(ORDER_FINISH_KEY(orderId), String(ms));
  } catch {}
}
async function clearOrderFinish(orderId) {
  try {
    await AsyncStorage.removeItem(ORDER_FINISH_KEY(orderId));
  } catch {}
}

async function loadOrderElapsed(orderId) {
  try {
    const raw = await AsyncStorage.getItem(ORDER_ELAPSED_KEY(orderId));
    const v = raw ? Number(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
async function saveOrderElapsed(orderId, ms) {
  try {
    await AsyncStorage.setItem(ORDER_ELAPSED_KEY(orderId), String(ms));
  } catch {}
}
async function clearOrderElapsed(orderId) {
  try {
    await AsyncStorage.removeItem(ORDER_ELAPSED_KEY(orderId));
  } catch {}
}

async function loadPendingSign(orderId) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SIGN_KEY(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function savePendingSign(orderId, payload) {
  try {
    await AsyncStorage.setItem(
      PENDING_SIGN_KEY(orderId),
      JSON.stringify(payload),
    );
  } catch {}
}
async function clearPendingSign(orderId) {
  try {
    await AsyncStorage.removeItem(PENDING_SIGN_KEY(orderId));
  } catch {}
}

async function loadOpState(orderId) {
  try {
    const raw = await AsyncStorage.getItem(OPSTATE_KEY(orderId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
async function saveOpState(orderId, state) {
  try {
    await AsyncStorage.setItem(
      OPSTATE_KEY(orderId),
      JSON.stringify(state || {}),
    );
  } catch {}
}

/* ====================== Helpers generales ====================== */
function parseSapDate(val) {
  if (!val) return null;

  if (typeof val === "string" && val.startsWith("/Date(")) {
    const ms = parseInt(val.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }

  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDMY(val) {
  const d = parseSapDate(val);
  if (!d) return "—";

  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();

  return `${dd}/${mm}/${yyyy}`;
}

const opKey = (orderId, op) => `${orderId}-${op.activity || op.Activity || ""}`;

/* ====== SAP helpers para fechas/horas y prorrateo ====== */
function msToMinutesRounded(ms) {
  const min = Math.round(ms / 60000);
  return Math.max(1, min);
}
function sapDateFromMs(ms) {
  const d = new Date(ms);
  const midnight = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();
  return `/Date(${midnight})/`;
}
function sapTimePTFromMs(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  return `PT${h}H${m}M${s}S`;
}
function prorateMinutes(totalMin, n) {
  const base = Math.floor(totalMin / n);
  const rem = totalMin % n;
  const arr = Array(n).fill(base);
  for (let i = 0; i < rem; i++) arr[i] += 1;
  return arr;
}
function buildSequentialWindows(startMs, mins) {
  let cursor = startMs;
  return mins.map((m) => {
    const end = cursor + m * 60000;
    const win = { start: cursor, end };
    cursor = end;
    return win;
  });
}

/* ====================== Consumibles -> ConfirmationMaterialSet ====================== */
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalizeConsumiblesToMaterialSet(consumiblesRows, plantFallback) {
  const rows = Array.isArray(consumiblesRows) ? consumiblesRows : [];
  const out = [];

  for (const r of rows) {
    const Material = String(
      r?.Material ?? r?.material ?? r?.codigo ?? r?.Codigo ?? r?.matnr ?? "",
    ).trim();

    const CantidadRaw =
      r?.Cantidad ?? r?.cantidad ?? r?.qty ?? r?.Qty ?? r?.quantity ?? "0";

    const Unidad = String(
      r?.Unidad ?? r?.unidad ?? r?.uom ?? r?.Uom ?? "",
    ).trim();

    const Centro = String(plantFallback || "TLP1").trim();

    const qtyNum = toNum(CantidadRaw);
    const qtyOk =
      qtyNum != null
        ? qtyNum > 0
        : String(CantidadRaw || "").trim() !== "" &&
          String(CantidadRaw) !== "0";

    if (!Material) continue;
    if (!qtyOk) continue;
    if (!Unidad) continue;
    if (!Centro) continue;

    out.push({
      Material,
      Cantidad: String(CantidadRaw),
      Unidad,
      Centro,
    });
  }

  return out;
}

/* ====================== Payload confirmaciones desde ops seleccionadas ====================== */
function buildConfirmationPayloadFromSelectedOps({
  orderId,
  opsAll,
  selectedIds,
  startMs,
  finishMs,
  consumiblesRows,
  plantFallback,
  user, // 👈 CAMBIA 'userEmail' POR 'user' PARA TENER EL OBJETO COMPLETO
}) {
  const selectedOpsRaw = (selectedIds || [])
    .map((idKey) =>
      (opsAll || []).find((op) => String(op.id) === String(idKey)),
    )
    .filter(Boolean);

  const uniqByOp = (ops) => {
    const map = new Map();
    for (const op of ops) {
      const act = String(op.activity || op.Activity || "").trim();
      const key = `${act}`;
      if (!map.has(key)) map.set(key, op);
    }
    return Array.from(map.values());
  };

  const selectedOps = uniqByOp(selectedOpsRaw);
  if (!selectedOps.length) return null;

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(finishMs) ||
    finishMs <= startMs
  )
    return null;

  const totalMs = Math.max(0, finishMs - startMs);
  const totalMin = msToMinutesRounded(totalMs);
  const minsArr = prorateMinutes(totalMin, selectedOps.length);
  const windows = buildSequentialWindows(startMs, minsArr);

  const ConfirmationMaterialSet = normalizeConsumiblesToMaterialSet(
    consumiblesRows,
    plantFallback,
  );

  return {
    Order: "S1",
    // Ahora 'user' ya existe porque lo pasamos como parámetro
    Mail: String(user?.correo || user?.email || "").trim(),
    ConfirmationOrderSet: selectedOps.map((op, idx) => {
      const actRaw = String(op.activity || op.Activity || "").trim();
      const Operation = actRaw.padStart(4, "0");
      const w = windows[idx];

      const row = {
        ConfNo: "",
        Orderid: orderId,
        Operation,
        PostgDate: sapDateFromMs(finishMs),
        ActWork: String(minsArr[idx]),
        UnWork: "min",
        ExecStartDate: sapDateFromMs(w.start),
        ExecFinDate: sapDateFromMs(w.end),
        ExecStartTime: sapTimePTFromMs(w.start),
        ExecFinTime: sapTimePTFromMs(w.end),
        FinConf: "X",
      };
      return row;
    }),
    ConfirmationMaterialSet,
    Return: [],
  };
}

/* ====================== Dirección ====================== */
function mapDireccionLikeBackend(addr) {
  if (!addr) return { cliente: "", direccion: "" };

  /*
    Miguel Ángel Hernández Álvarez - 30/06/2026

    Corrección:
    SAP no siempre manda razón social/dirección en el segundo nodo.
    Además puede mandar datos repartidos en Name1..Name4 y StrSuppl1..3.
    Por eso armamos razón social y dirección con todos los campos posibles.
  */
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

function pickBestAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const clean = results.filter(Boolean);

  if (!clean.length) return null;

  const scoreAddress = (a) => {
    const nameScore = [
      a?.Name1,
      a?.Name2,
      a?.Name3,
      a?.Name4,
    ].filter((x) => String(x || "").trim()).length;

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

function mergeOpsWithLocalState(orderId, ops, state) {
  return (ops || []).map((o) => {
    const id = o.id || opKey(orderId, o);
    const st = state?.[id] || {};

    const sapEstatus = (o.estatus || "pendiente").toLowerCase();
    const estatusFinal =
      sapEstatus === "finalizada"
        ? "finalizada"
        : st.estatus || sapEstatus || "pendiente";

    return {
      ...o,
      id,
      estatus: estatusFinal,
      worked_ms: st.worked_ms ?? o.worked_ms ?? 0,
      last_resume_at: st.last_resume_at ?? o.last_resume_at ?? null,
      Strttimcon: st.started_at ?? o.Strttimcon ?? null,
      Fintimcons: st.finished_at ?? o.Fintimcons ?? null,
      paused_at: st.paused_at ?? o.paused_at ?? null,
      pause_motivo: st.pause_motivo ?? o.pause_motivo ?? null,
    };
  });
}

function formatValueForRow(value) {
  if (value == null) return "—";

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return String(value);

  if (t === "object") {
    const {
      calle,
      street,
      colonia,
      neighborhood,
      municipio,
      city,
      estado,
      region,
      estado_provincia,
      cp,
      postalCode,
      zip,
      pais,
      country,
      full,
      direccion,
    } = value;

    const posibleFull =
      full || direccion || value.fullAddress || value.addressString;
    if (posibleFull && typeof posibleFull === "string") return posibleFull;

    const partes = [
      calle || street,
      colonia || neighborhood,
      municipio || city,
      estado || region || estado_provincia,
      cp || postalCode || zip,
      pais || country,
    ]
      .filter(Boolean)
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0);

    if (partes.length) return partes.join(", ");

    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }

  try {
    return String(value);
  } catch {
    return "—";
  }
}

function normalizeOpsFromBackend(ops = []) {
  if (!Array.isArray(ops)) return [];
  return ops.map((op) => {
    const Activity = op.Activity || op.activity || op.Vornr || "";
    const Description = op.Description || op.description || op.Ltxa1 || "";
    const StandardTextKey = op.StandardTextKey || op.standardTextKey || "";

    return {
      ...op,
      activity: String(Activity || ""),
      description: String(Description || ""),
      Activity: String(Activity || ""),
      Description: String(Description || ""),
      StandardTextKey: String(StandardTextKey || ""),
      standardTextKey: String(StandardTextKey || ""),
    };
  });
}

const safeStr = (v) => String(v ?? "").trim();

function detectTipoMantenimiento(orden) {
  const raw = [
    orden?.tipo_equipo,
    orden?.EquipmentType,
    orden?.equipment_type,
    orden?.equipo_tipo,
    orden?.tipo,
    orden?.Type,
    orden?.DescripcionEquipo,
    orden?.description,
  ]
    .map((x) => safeStr(x))
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  if (raw.includes("escal")) return "escalera";
  return "elevador";
}

function detectCoberturaFromShortText(shortText) {
  const s = String(shortText || "").toUpperCase();

  if (s.includes("COBERTURA BASICA")) return "BASICA";
  if (s.includes("COBERTURA MEDIA")) return "MEDIA";
  if (s.includes("COBERTURA SEMI")) return "SEMI";

  return "SIN COBERTURA";
}

/* ====================== Estatus ====================== */
function normalizeCode(code) {
  if (code === null || code === undefined) return "";
  const s = String(code).trim();
  if (!s) return "";
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;
  return String(n).padStart(4, "0");
}

function extractCodes(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  const matches = s.match(/\d{1,4}/g) || [];
  const codes = matches
    .map((x) => normalizeCode(x))
    .filter((x) => /^\d{4}$/.test(x));
  return Array.from(new Set(codes));
}

function pickCurrentStatusCode(orden) {
  const codes = extractCodes(orden?.userstatus ?? "");
  const apiCode = normalizeCode(orden?.estatus_code ?? "");

  const all = Array.from(
    new Set([...(codes || []), ...(apiCode ? [apiCode] : [])]),
  );

  // Prioridad de los únicos estatus válidos actuales.
  if (all.includes("0600")) return "0600";
  if (all.includes("0400")) return "0400";
  if (all.includes("0300")) return "0300";
  if (all.includes("0200")) return "0200";
  if (all.includes("0100")) return "0100";

  return apiCode || codes[0] || "";
}

function buildStatus0300Payload({ orderId, email, currentCode }) {
  const remove = currentCode === "0400" ? "0400" : "0200";
  return {
    OrderId: orderId,
    WorkOrderHeader: {
      Orderid: orderId,
      MaterialLong: email,
    },
    WorkOrderUserStatusSet: [
      { UserStText: "0300", Langu: "ES", Inactive: "" },
      { UserStText: remove, Langu: "ES", Inactive: "X" },
    ],
    Return: [],
  };
}

/* ====================== Logs ====================== */
function logSapPayload(label, payload, { stripBase64 = false } = {}) {
  try {
    if (!payload) {
      console.log(label, payload);
      return;
    }
    if (!stripBase64) {
      console.log(label);
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    const cloned = JSON.parse(JSON.stringify(payload));
    const att = cloned?.Attachments?.[0];
    if (att?.Base64)
      att.Base64 = `<<base64 omitted: ${String(att.Base64).length} chars>>`;
    console.log(label);
    console.log(JSON.stringify(cloned, null, 2));
  } catch {
    console.log(label, payload);
  }
}

/* ====================== Email / Red ====================== */
function isValidEmail(email) {
  const s = String(email || "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function resolveStatusLabelFromCode(code, fallbackLabel = "") {
  const c = normalizeCode(code);

  if (!c) return "Sin empezar";
  if (c === "0100") return "PENDIENTE";
  if (c === "0200") return "EN PROCESO";
  if (c === "0300") return "FINALIZADA";
  if (c === "0400") return "PENDIENTE DE FIRMA";
  if (c === "0600") return "Carta No Mantto";

  return String(fallbackLabel || c || "—").trim();
}

function isNetworkLikeError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  const hasResponse = !!error?.response;

  if (!hasResponse) {
    if (
      msg.includes("network error") ||
      msg.includes("timeout") ||
      msg.includes("socket") ||
      msg.includes("aborted") ||
      msg.includes("load failed") ||
      msg.includes("failed to fetch") ||
      code === "ECONNABORTED" ||
      code === "ERR_NETWORK" ||
      code === "ETIMEDOUT"
    ) {
      return true;
    }
  }

  return false;
}

function getSapErrorMessage(error, fallback = "Ocurrió un error con SAP.") {
  const data = error?.response?.data;
  return (
    data?.error?.message?.value ||
    data?.message?.value ||
    data?.detail ||
    (typeof data?.error === "string" ? data.error : null) ||
    error?.message ||
    fallback
  );
}

function makeCheckinQueueKey(userEmail) {
  const safe =
    String(userEmail || "anon")
      .toLowerCase()
      .trim() || "anon";
  return `checkin_queue_v1_${safe}`;
}

async function hasOfflineQueuedCheckin(userEmail, orderId) {
  try {
    const key = makeCheckinQueueKey(userEmail);
    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return false;

    return arr.some(
      (x) => String(x?.orderId || "").trim() === String(orderId || "").trim(),
    );
  } catch {
    return false;
  }
}

const BG_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos

function isTimeoutError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();

  return (
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    msg.includes("timeout") ||
    msg.includes("tiempo de espera") ||
    msg.includes("exceeded")
  );
}

async function postWithBackgroundFallback({
  apiInstance,
  endpoint,
  payload,
  timeoutMs = BG_TIMEOUT_MS,
  enqueueFn,
  queueItem,
}) {
  try {
    const response = await apiInstance.post(endpoint, payload, {
      timeout: timeoutMs,
    });

    return {
      ok: true,
      queued: false,
      response,
    };
  } catch (error) {
    const networkLike = isNetworkLikeError(error);
    const timeoutLike = isTimeoutError(error);

    if (networkLike || timeoutLike) {
      await enqueueFn(queueItem);

      return {
        ok: true,
        queued: true,
        response: null,
        error,
      };
    }

    throw error;
  }
}

function hasValidConsumibles(consumiblesRows) {
  const rows = Array.isArray(consumiblesRows) ? consumiblesRows : [];

  return rows.some((r) => {
    const material = String(
      r?.Material ?? r?.material ?? r?.codigo ?? r?.Codigo ?? r?.matnr ?? "",
    ).trim();

    const cantidadRaw =
      r?.Cantidad ?? r?.cantidad ?? r?.qty ?? r?.Qty ?? r?.quantity ?? "";

    const unidad = String(
      r?.Unidad ?? r?.unidad ?? r?.uom ?? r?.Uom ?? "",
    ).trim();

    const cantidadNum = Number(cantidadRaw);
    const cantidadValida = Number.isFinite(cantidadNum) && cantidadNum > 0;

    return !!material && cantidadValida && !!unidad;
  });
}


/*
  Miguel Ángel Hernández Álvarez - 01/07/2026

  Valida si el detalle en cache ya tiene información suficiente para pintar
  la vista sin volver a consultar SAP/API.

  Esto evita dos problemas:
  1) Si la precarga sí guardó detalle útil, esta pantalla trabaja 100% cache.
  2) Si por algún motivo solo existe un respaldo parcial de la lista, se permite
     consultar API como emergencia cuando hay internet.
*/
function hasUsefulCachedOrderDetail(cachedData) {
  if (!cachedData || typeof cachedData !== "object") return false;

  const hasOrderId = !!String(
    cachedData?.Orderid ||
      cachedData?.OrderId ||
      cachedData?.orderid ||
      "",
  ).trim();

  const hasOps =
    Array.isArray(cachedData?.operaciones) && cachedData.operaciones.length > 0;

  const hasComponents =
    Array.isArray(cachedData?.componentes) && cachedData.componentes.length > 0;

  const hasAddress = !!String(
    cachedData?.direccion ||
      cachedData?.partner_address ||
      cachedData?.address ||
      "",
  ).trim();

  const hasClient = !!String(
    cachedData?.cliente ||
      cachedData?.razon_social ||
      cachedData?.partner_name ||
      "",
  ).trim();

  const hasShortText = !!String(
    cachedData?.ShortText ||
      cachedData?.shortText ||
      cachedData?.shorttext ||
      "",
  ).trim();

  const hasBasicHeader =
    !!String(cachedData?.equipment || cachedData?.Equipment || "").trim() ||
    !!String(cachedData?.order_type || cachedData?.OrderType || "").trim() ||
    !!String(cachedData?.start_date || cachedData?.StartDate || "").trim();

  /*
    Miguel Ángel Hernández Álvarez - 03/07/2026

    Ajuste:
    Si la precarga dejó cabecera básica, cliente, dirección, texto corto
    u operaciones, se considera cache útil para no forzar consulta API/SAP.
  */
  return (
    hasOrderId &&
    (hasOps || hasComponents || hasAddress || hasClient || hasShortText || hasBasicHeader)
  );
}

// CAMBIOS agregasdos por miguel
/* ====================== Componente ====================== */
export default function DetalleOrden() {
  const { id } = useLocalSearchParams();
  const { user, ensureValidToken } = useAuth();

  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);

  const [soundObj, setSoundObj] = useState(null);

  const signatureRef = useRef(null);
  const wasOnlineRef = useRef(false);
  const queueProcessingRef = useRef(false);

  const [finalizeMode, setFinalizeMode] = useState(false);
  const [checkedMap, setCheckedMap] = useState({});

  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCargo, setClienteCargo] = useState("");
  const [avisoCliente, setAvisoCliente] = useState("");

  const [notaTecnico, setNotaTecnico] = useState("");
  const [consumibles, setConsumibles] = useState([]);

  const [startingOrder, setStartingOrder] = useState(false);
  const [orderStartedAtMs, setOrderStartedAtMs] = useState(null);
  const [orderFinishedAtMs, setOrderFinishedAtMs] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [orderElapsedMs, setOrderElapsedMs] = useState(null);

  const [showMantPreview, setShowMantPreview] = useState(false);
  const [mantHtmlPreview, setMantHtmlPreview] = useState(null);
  const [mantPdfUri, setMantPdfUri] = useState(null);
  const [pendingFinalize, setPendingFinalize] = useState(null);

  const [showCompModal, setShowCompModal] = useState(false);
  const [selectedOp, setSelectedOp] = useState(null);
  const [compList, setCompList] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(false);

  const [showAllMaterialsModal, setShowAllMaterialsModal] = useState(false);

  const [showNoMantPdfModal, setShowNoMantPdfModal] = useState(false);
  const [noMantPdfUrl, setNoMantPdfUrl] = useState(null);
  const [noMantPdfRawUrl, setNoMantPdfRawUrl] = useState(null);
  const [loadingNoMantPdf, setLoadingNoMantPdf] = useState(false);
  const [noMantError, setNoMantError] = useState(null);
  const [downloadingNoMantPdf, setDownloadingNoMantPdf] = useState(false);

  const [finishingOrder, setFinishingOrder] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [savingPending0400, setSavingPending0400] = useState(false);
  const [hasPendingOfflineCheckin, setHasPendingOfflineCheckin] =
    useState(false);

  const userEmail = String(
    user?.correo ||
      user?.email ||
      user?.username ||
      user?.preferred_username ||
      "unknown",
  ).trim();

  const baseStatusCode = pickCurrentStatusCode(orden);

  const isAdvancedStatus = ["0400", "0300", "0600"].includes(baseStatusCode);

  // ✅ Solo mostrar 0100 por check-in pendiente si la orden NO avanzó.
  // Si ya está 0400, 0300 o 0600, respetamos ese estatus.
  const statusCode =
    hasPendingOfflineCheckin && !isAdvancedStatus && baseStatusCode !== "0200"
      ? "0100"
      : baseStatusCode;
  const statusLabel =
    hasPendingOfflineCheckin && !isAdvancedStatus && statusCode !== "0200"
      ? "CHECK-IN PENDIENTE (OFFLINE)"
      : resolveStatusLabelFromCode(
          statusCode,
          String(
            orden?.estatus_label || orden?.estatus || orden?.status || "",
          ).trim(),
        );

  const statusTipo = String(orden?.estatus_tipo || "").toUpperCase();

  // Nueva regla:
  // Carta No Mantto solo debe identificarse por 0600.
  // Dejamos statusTipo como apoyo temporal por si viene de cache viejo.
  const isNoMant = statusCode === "0600" || statusTipo === "NO_MANTENIMIENTO";

  const isOrderSinEmpezar = !statusCode;
  const isOrderPendiente0100 = statusCode === "0100";

  const isOrderFinishedReal =
    statusCode === "0300" || statusCode === "0600" || !!orden?.isFinal;
  const isPending0400 =
    statusCode === "0400" || String(statusCode).includes("0400");

  const estatusTxt = String(
    orden?.estatus_label || orden?.estatus || orden?.status || "",
  )
    .trim()
    .toUpperCase();

  const isOrderEnProceso =
    estatusTxt === "EN_PROCESO" ||
    estatusTxt === "EN PROCESO" ||
    statusCode === "0200";

  const coberturaTipo = String(orden?.cobertura_tipo || "")
    .trim()
    .toUpperCase();

  const checkinDone =
    statusCode === "0200" ||
    (!hasPendingOfflineCheckin &&
      (!!orden?.checkin_done || !!orden?.checkin || !!orden?.checked_in));

  const isOpsLocked =
    isNoMant ||
    isOrderSinEmpezar ||
    isOrderPendiente0100 ||
    isOrderFinishedReal ||
    (!checkinDone && statusCode !== "0200");

  const canStartTimer =
    isOrderEnProceso && !isNoMant && !isOrderFinishedReal && !!checkinDone;
  const showRunningTimer = isOrderEnProceso && !!orderStartedAtMs;
  const showFrozenTimer = isPending0400 && orderElapsedMs != null;

  const safeSaveDetailIfWindow = async (orderId, detailObj, options = {}) => {
    const { force = false, reason = "detalle" } = options || {};

    if (!detailObj) return false;

    const cleanOrderId = String(
      orderId || detailObj?.Orderid || detailObj?.OrderId || id || "",
    ).trim();

    if (!cleanOrderId) return false;

    const detailToSave = {
      ...(detailObj || {}),
      Orderid: detailObj?.Orderid || cleanOrderId,
      OrderId: detailObj?.OrderId || cleanOrderId,
    };

    const okByWindow = shouldCacheDetailByOrder(detailToSave, new Date());

    if (!force && !okByWindow) {
      console.log("[DETALLE][CACHE] No se guarda fuera de ventana:", {
        orderId: cleanOrderId,
        reason,
        start_date: detailToSave?.start_date || detailToSave?.StartDate,
      });
      return false;
    }

    const saved = await saveOrdenTecnicoDetail(cleanOrderId, detailToSave);

    console.log("[DETALLE][CACHE] Guardado detalle:", {
      orderId: cleanOrderId,
      saved,
      force,
      reason,
      operaciones: Array.isArray(detailToSave?.operaciones)
        ? detailToSave.operaciones.length
        : 0,
    });

    return saved;
  };

  const applyLocalOrderStatus = async (orderId, code) => {
    const statusCodeStr = normalizeCode(code);
    const statusLabelStr = resolveStatusLabelFromCode(statusCodeStr);

    const localPatch = {
      estatus_code: statusCodeStr,
      userstatus: statusCodeStr,
      UserStatus: statusCodeStr,
      UserStText: statusCodeStr,
      estatus_label: statusLabelStr,

      // ✅ Extra para que la pantalla identifique bien 0400
      isPendingSignature: statusCodeStr === "0400",
      isFinal: statusCodeStr === "0300" || statusCodeStr === "0600",
    };

    setOrden((prev) => ({
      ...(prev || {}),
      ...localPatch,
    }));

    try {
      await setLocalStatusPatch(userEmail, orderId, statusCodeStr);
      await patchCacheOrdenesTecnicoList(userEmail, orderId, statusCodeStr);
      await patchCacheOrdenTecnicoDetail(orderId, statusCodeStr);

      // ✅ Guardar también el detalle completo con el estatus nuevo
      const cached = await loadOrdenTecnicoDetail(orderId);
      const base = cached?.data || orden || {};

      await safeSaveDetailIfWindow(orderId, {
        ...(base || {}),
        ...localPatch,
      });

      // ✅ Si ya avanzó a 0400/0300/0600, quitamos marca vieja de TBM/check-in
      if (["0400", "0300", "0600"].includes(statusCodeStr)) {
        await AsyncStorage.removeItem(`tbmky_status_${String(orderId).trim()}`);
      }

      console.log("[DETALLE][STATUS][LOCAL]", {
        orderId,
        statusCodeStr,
        statusLabelStr,
      });
    } catch (e) {
      console.log("[DETALLE] applyLocalOrderStatus error:", e?.message || e);
    }
  };

  const updateLocalOpsAsFinalizadas = async (orderId, selectedOpIds) => {
    const current = await loadOpState(orderId);
    const next = { ...(current || {}) };

    for (const opId of selectedOpIds) {
      next[opId] = {
        ...(next[opId] || {}),
        estatus: "finalizada",
        finished_at: next[opId]?.finished_at ?? Date.now(),
      };
    }

    await saveOpState(orderId, next);

    setOrden((prev) => {
      const ops = Array.isArray(prev?.operaciones) ? prev.operaciones : [];
      const ops2 = ops.map((o) => {
        const oid = String(o?.id ?? "");
        if (selectedOpIds.includes(oid)) return { ...o, estatus: "finalizada" };
        return o;
      });
      return { ...(prev || {}), operaciones: ops2 };
    });

    try {
      const cached = await loadOrdenTecnicoDetail(orderId);
      const base = cached?.data || orden || {};
      const ops = Array.isArray(base?.operaciones) ? base.operaciones : [];
      const ops2 = ops.map((o) => {
        const oid = String(o?.id ?? "");
        if (selectedOpIds.includes(oid)) return { ...o, estatus: "finalizada" };
        return o;
      });
      await safeSaveDetailIfWindow(orderId, {
        ...(base || {}),
        operaciones: ops2,
      });
    } catch {}
  };

  const updateLocalOrderAsFinalizada0300 = async (orderId, finishMs) => {
    await saveOrderFinish(orderId, finishMs);
    setOrderFinishedAtMs(finishMs);

    try {
      const startMs = await loadOrderStart(orderId);
      if (startMs) {
        const elapsedFinal = Math.max(0, finishMs - startMs);
        await saveOrderElapsed(orderId, elapsedFinal);
        setOrderElapsedMs(elapsedFinal);
      }
    } catch {}

    setOrden((prev) => ({
      ...(prev || {}),
      estatus_code: "0300",
      userstatus: "0300",
      UserStatus: "0300",
      UserStText: "0300",
      estatus_label: "FINALIZADA",
      isFinal: true,
    }));

    try {
      const cached = await loadOrdenTecnicoDetail(orderId);
      const base = cached?.data || orden || {};

      await safeSaveDetailIfWindow(orderId, {
        ...(base || {}),
        estatus_code: "0300",
        userstatus: "0300",
        UserStatus: "0300",
        UserStText: "0300",
        estatus_label: "FINALIZADA",
        isFinal: true,
      });

      await setLocalStatusPatch(userEmail, orderId, "0300");
      await patchCacheOrdenesTecnicoList(userEmail, orderId, "0300");
      await patchCacheOrdenTecnicoDetail(orderId, "0300");
      await AsyncStorage.removeItem(`tbmky_status_${String(orderId).trim()}`);
    } catch (e) {
      console.log("[FINALIZAR][0300][LOCAL] error:", e?.message || e);
    }
  };

  const enqueueSap = async ({
    type,
    orderId,
    endpoint,
    payload,
    dedupeKey,
    method,
  }) => {
    if (typeof upsertSapQueueItem !== "function") {
      throw new Error(
        "upsertSapQueueItem no existe en src/offline/sapQueue.js. Asegúrate de exportarla.",
      );
    }

    await upsertSapQueueItem({
      type,
      orderId,
      endpoint,
      payload,
      method: method || "POST",
      dedupeKey,
      key: dedupeKey,
    });
  };

  const runSapQueueInBackground = () => {
    if (queueProcessingRef.current) return;

    queueProcessingRef.current = true;

    Promise.resolve()
      .then(async () => {
        const net = await NetInfo.fetch();
        const online = !!(
          net?.isConnected && net?.isInternetReachable !== false
        );

        if (!online) return;

        console.log("[DETALLE][SAP_QUEUE] Procesando en segundo plano...");

        await processSapQueue({
          ensureValidToken,
          apiInstance: api,
        });
      })
      .catch((e) => {
        console.log(
          "[DETALLE][SAP_QUEUE] Error segundo plano:",
          e?.message || e,
        );
      })
      .finally(() => {
        queueProcessingRef.current = false;
      });
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const orderIdGuess = String(id || "").trim();
      if (!orderIdGuess) return;

      const savedStart = await loadOrderStart(orderIdGuess);
      const savedFinish = await loadOrderFinish(orderIdGuess);
      const savedElapsed = await loadOrderElapsed(orderIdGuess);

      if (mounted) {
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }
        if (savedFinish) setOrderFinishedAtMs(savedFinish);
        if (savedElapsed != null) setOrderElapsedMs(savedElapsed);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNowTick(Date.now());
    });
    return () => sub.remove();
  }, []);

  //CAMBIOS agregados por miguel

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;

      try {
        const net = await NetInfo.fetch();
        const online = !!(
          net?.isConnected && net?.isInternetReachable !== false
        );
        if (!online) return;

        console.log("📲 App activa, intentando procesar cola SAP...");
        await processSapQueue({
          ensureValidToken,
          apiInstance: api,
        });
      } catch (e) {
        console.warn(
          "Error procesando cola al volver a la app:",
          e?.message || e,
        );
      }
    });

    return () => sub.remove();
  }, [ensureValidToken]);

  // CAMBIOS agregados por miguel

  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (state) => {
      const online = !!(
        state?.isConnected && state?.isInternetReachable !== false
      );

      if (online && !wasOnlineRef.current) {
        wasOnlineRef.current = true;
        try {
          console.log("📡 Conexión restaurada, procesando cola SAP…");
          await processSapQueue({
            ensureValidToken,
            apiInstance: api,
          });
        } catch (e) {
          console.warn("Error procesando cola SAP:", e?.message || e);
        }
      }

      if (!online) wasOnlineRef.current = false;
    });

    return () => unsub();
  }, [ensureValidToken]);

  useEffect(() => {
    if (!orderStartedAtMs) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [orderStartedAtMs]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const orderId = String(orden?.Orderid || id || "").trim();
      if (!orderId) {
        if (mounted) setHasPendingOfflineCheckin(false);
        return;
      }

      const pending = await hasOfflineQueuedCheckin(
        user?.correo || user?.email || user?.username || null,
        orderId,
      );

      if (mounted) setHasPendingOfflineCheckin(pending);
    })();

    return () => {
      mounted = false;
    };
  }, [orden?.Orderid, id, user?.correo, user?.email, user?.username]);

  /*
    Miguel Ángel Hernández Álvarez - 03/07/2026

    Fallback offline:
    Si no existe detalle guardado, intentamos pintar la orden desde la lista
    precargada. Esto evita pantalla vacía cuando la lista sí tiene la orden,
    pero todavía no se guardó el detalle completo.

    También compara el OrderId con y sin ceros a la izquierda.
  */
  const loadOrderFromCachedList = async (orderIdParam) => {
    try {
      const cleanId = String(orderIdParam || "").trim();
      if (!cleanId) return null;

      const removeZeros = (v) => String(v || "").trim().replace(/^0+/, "");

      const cachedList = await loadOrdenesTecnicoList(userEmail);
      const list = Array.isArray(cachedList?.data) ? cachedList.data : [];

      const found = list.find((item) => {
        const itemId = String(
          item?.Orderid || item?.OrderId || item?.orderid || "",
        ).trim();

        return itemId === cleanId || removeZeros(itemId) === removeZeros(cleanId);
      });

      if (!found) {
        console.log("[DETALLE][LIST_FALLBACK] Orden no encontrada en lista offline:", {
          orderId: cleanId,
          totalLista: list.length,
        });

        return null;
      }

      const normalized = {
        ...(found || {}),
        Orderid: found?.Orderid || found?.OrderId || cleanId,
        OrderId: found?.OrderId || found?.Orderid || cleanId,
        operaciones: Array.isArray(found?.operaciones) ? found.operaciones : [],
        partners: Array.isArray(found?.partners) ? found.partners : [],
        componentes: Array.isArray(found?.componentes) ? found.componentes : [],
        _fromListFallback: true,
      };

      await saveOrdenTecnicoDetail(cleanId, normalized);

      console.log("[DETALLE][LIST_FALLBACK] Orden tomada desde lista offline:", {
        orderId: cleanId,
        operaciones: normalized.operaciones.length,
      });

      return normalized;
    } catch (e) {
      console.log("[DETALLE][LIST_FALLBACK] Error:", e?.message || e);
      return null;
    }
  };

  const obtenerOrden = async () => {
    const orderIdParam = String(id || "").trim();

    try {
      setLoading(true);

      const cached = await loadOrdenTecnicoDetail(orderIdParam);
      if (cached?.data) {
        setOrden(cached.data);

        const cachedOrderId = String(
          cached?.data?.Orderid || orderIdParam,
        ).trim();

        const savedStartCached = await loadOrderStart(cachedOrderId);
        if (savedStartCached) {
          setOrderStartedAtMs(savedStartCached);
          setNowTick(Date.now());
        }

        const savedFinishCached = await loadOrderFinish(cachedOrderId);
        if (savedFinishCached) setOrderFinishedAtMs(savedFinishCached);

        const savedElapsedCached = await loadOrderElapsed(cachedOrderId);
        if (savedElapsedCached != null) setOrderElapsedMs(savedElapsedCached);

        const pendingCached = await loadPendingSign(cachedOrderId);
        if (pendingCached?.checkedMap)
          setCheckedMap(pendingCached.checkedMap || {});
        if (Array.isArray(pendingCached?.consumibles))
          setConsumibles(pendingCached.consumibles);
        if (typeof pendingCached?.notaTecnico === "string")
          setNotaTecnico(pendingCached.notaTecnico || "");
        if (typeof pendingCached?.clienteNombre === "string")
          setClienteNombre(pendingCached.clienteNombre || "");
        if (typeof pendingCached?.clienteCargo === "string")
          setClienteCargo(pendingCached.clienteCargo || "");
        if (typeof pendingCached?.avisoCliente === "string")
          setAvisoCliente(pendingCached.avisoCliente || "");

        if (Number.isFinite(pendingCached?.orderStartedAtMs)) {
          setOrderStartedAtMs(pendingCached.orderStartedAtMs);
        }
        if (Number.isFinite(pendingCached?.orderFinishedAtMs)) {
          setOrderFinishedAtMs(pendingCached.orderFinishedAtMs);
        }
        if (Number.isFinite(pendingCached?.orderElapsedMs)) {
          setOrderElapsedMs(pendingCached.orderElapsedMs);
        }

        const emailCached = String(cached?.data?.cliente_email || "").trim();
        if (emailCached && isValidEmail(emailCached))
          setClienteEmail(emailCached);

        const cn = String(cached?.data?.cliente_nombre || "").trim();
        const cc = String(cached?.data?.cliente_cargo || "").trim();
        const av = String(cached?.data?.aviso_cliente || "").trim();
        if (cn) setClienteNombre(cn);
        if (cc) setClienteCargo(cc);
        if (av) setAvisoCliente(av);

        /*
          Miguel Ángel Hernández Álvarez - 01/07/2026

          Corrección consumo de datos:
          Si la pantalla de precarga ya guardó un detalle útil de la orden,
          esta vista NO debe volver a consultar SAP/API.

          Si solamente existe un cache parcial, se pinta primero lo guardado
          y se permite consultar API como emergencia cuando hay internet.
        */
        if (hasUsefulCachedOrderDetail(cached.data)) {
          console.log("[DETALLE][CACHE_ONLY] Usando detalle precargado. No se consulta API.", {
            orderId: cachedOrderId,
            operaciones: Array.isArray(cached?.data?.operaciones)
              ? cached.data.operaciones.length
              : 0,
            componentes: Array.isArray(cached?.data?.componentes)
              ? cached.data.componentes.length
              : 0,
          });

          setLoading(false);
          return;
        }

        console.log("[DETALLE][CACHE_PARTIAL] Cache parcial. Se consulta API como respaldo.", {
          orderId: cachedOrderId,
          operaciones: Array.isArray(cached?.data?.operaciones)
            ? cached.data.operaciones.length
            : 0,
          });
      }

      const net = await NetInfo.fetch();
      const isOnline = !!(
        net?.isConnected && net?.isInternetReachable !== false
      );

      if (!isOnline) {
        if (!cached?.data) {
          const fromList = await loadOrderFromCachedList(orderIdParam);

          if (fromList) {
            setOrden(fromList);
            setLoading(false);
            return;
          }

          Alert.alert(
            "Sin conexión",
            "No hay internet y no hay detalle guardado aún para esta orden. Vuelve a ejecutar la precarga con internet.",
          );
        }

        return;
      }

      const resOrden = await api.get(`/api/ordenes/sap/${orderIdParam}`);
      const baseOrden = resOrden.data || {};

      let shortTextHeader = "";
      try {
        const resHeader = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdParam}')`,
        );

        shortTextHeader =
          resHeader?.data?.d?.ShortText ||
          resHeader?.data?.d?.shorttext ||
          resHeader?.data?.d?.ShortText ||
          resHeader?.data?.d?.shorttext ||
          "";
      } catch (e) {
        console.warn(
          "[COBERTURA] No se pudo cargar WorkOrderHeaderSet:",
          e?.response?.data || e?.message || e,
        );
      }

      const shortTextForCoverage =
        shortTextHeader ||
        baseOrden?.ShortText ||
        baseOrden?.shorttext ||
        baseOrden?.Shorttext ||
        baseOrden?.shortText ||
        "";

      const coberturaDetectada =
        detectCoberturaFromShortText(shortTextForCoverage);

      let direccionSap = "";
      let clienteSap = "";
      try {
        const resAddr = await api.get(
          `/api/ordenes/sap/${orderIdParam}/addresses`,
        );
        const results =
          resAddr?.data?.results || resAddr?.data?.d?.results || [];
        const chosen = pickBestAddress(results);
        const mapped = mapDireccionLikeBackend(chosen);
        direccionSap = mapped.direccion || "";
        clienteSap = mapped.cliente || "";
      } catch (e) {
        console.warn(
          "[ADDR] no se pudo cargar /addresses:",
          e?.response?.data || e?.message || e,
        );
      }

      let ops = [];
      try {
        const resOps = await api.get(
          `/api/operaciones/sap/${String(orderIdParam)}`,
        );
        const rawOps =
          resOps?.data?.d?.results ||
          resOps?.data?.results ||
          resOps?.data?.operaciones ||
          resOps?.data ||
          [];

        ops = normalizeOpsFromBackend(rawOps);
      } catch (e) {
        console.warn(
          "No se pudieron cargar operaciones:",
          e?.response?.data || e,
        );
        ops = normalizeOpsFromBackend(baseOrden?.operaciones || []);
      }

      const orderIdReal = String(
        baseOrden?.Orderid || baseOrden?.OrderId || orderIdParam,
      ).trim();
      const opsWithId = ops.map((o) => ({
        ...o,
        id: o.id || opKey(orderIdReal, o),
      }));

      const localState = await loadOpState(orderIdReal);
      const opsMerged = mergeOpsWithLocalState(
        orderIdReal,
        opsWithId,
        localState,
      );

      let emailFromPartners = "";
      try {
        const resPartners = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdParam}')/ToPartners`,
        );

        const results =
          resPartners?.data?.d?.results ||
          resPartners?.data?.results ||
          resPartners?.data?.d?.ToPartners?.results ||
          [];

        const re = (results || []).find(
          (p) => String(p?.PartnRoleOld || "").trim() === "RE",
        );
        emailFromPartners = String(re?.Mail1 || re?.Mail2 || "").trim();
      } catch (e) {
        console.warn(
          "[MAIL] no se pudo cargar ToPartners:",
          e?.response?.data || e?.message || e,
        );
      }

      const cachedDataForMerge = cached?.data || {};

      const data = {
        /*
          Miguel Ángel Hernández Álvarez - 30/06/2026

          Corrección:
          No reemplazamos la información buena del cache con respuestas
          incompletas del endpoint base de SAP.

          Si la precarga ya guardó razón social, dirección, operaciones,
          partners o componentes, los conservamos cuando SAP no los mande.
        */
        ...cachedDataForMerge,
        ...baseOrden,

        Orderid: baseOrden?.Orderid || baseOrden?.OrderId || cachedDataForMerge?.Orderid || orderIdReal,
        OrderId: baseOrden?.OrderId || baseOrden?.Orderid || cachedDataForMerge?.OrderId || orderIdReal,

        ShortText:
          shortTextForCoverage ||
          baseOrden?.ShortText ||
          cachedDataForMerge?.ShortText ||
          "",

        cobertura_tipo:
          coberturaDetectada ||
          baseOrden?.cobertura_tipo ||
          cachedDataForMerge?.cobertura_tipo ||
          null,

        direccion:
          direccionSap ||
          baseOrden?.direccion ||
          baseOrden?.address ||
          baseOrden?.partner_address ||
          cachedDataForMerge?.direccion ||
          cachedDataForMerge?.address ||
          cachedDataForMerge?.partner_address ||
          "",

        partner_address:
          direccionSap ||
          baseOrden?.partner_address ||
          baseOrden?.direccion ||
          baseOrden?.address ||
          cachedDataForMerge?.partner_address ||
          cachedDataForMerge?.direccion ||
          cachedDataForMerge?.address ||
          "",

        cliente:
          clienteSap ||
          baseOrden?.cliente ||
          baseOrden?.razon_social ||
          cachedDataForMerge?.cliente ||
          cachedDataForMerge?.razon_social ||
          `${baseOrden?.Name1 ?? ""} ${baseOrden?.Name2 ?? ""}`.trim() ||
          "",

        razon_social:
          clienteSap ||
          baseOrden?.razon_social ||
          baseOrden?.cliente ||
          cachedDataForMerge?.razon_social ||
          cachedDataForMerge?.cliente ||
          "",

        cliente_email:
          emailFromPartners ||
          baseOrden?.cliente_email ||
          cachedDataForMerge?.cliente_email ||
          "",

        partners:
          Array.isArray(baseOrden?.partners) && baseOrden.partners.length
            ? baseOrden.partners
            : Array.isArray(cachedDataForMerge?.partners)
              ? cachedDataForMerge.partners
              : [],

        operaciones:
          Array.isArray(opsMerged) && opsMerged.length
            ? opsMerged
            : Array.isArray(cachedDataForMerge?.operaciones)
              ? cachedDataForMerge.operaciones
              : [],

        componentes:
          Array.isArray(baseOrden?.componentes) && baseOrden.componentes.length
            ? baseOrden.componentes
            : Array.isArray(cachedDataForMerge?.componentes)
              ? cachedDataForMerge.componentes
              : [],

        cliente_nombre:
          String(clienteNombre || "").trim() ||
          cachedDataForMerge?.cliente_nombre ||
          "",
        cliente_cargo:
          String(clienteCargo || "").trim() ||
          cachedDataForMerge?.cliente_cargo ||
          "",
        aviso_cliente:
          String(avisoCliente || "").trim() ||
          cachedDataForMerge?.aviso_cliente ||
          "",
      };

      setOrden(data);

      const emailResolved = String(emailFromPartners || "").trim();
      if (
        emailResolved &&
        isValidEmail(emailResolved) &&
        !String(clienteEmail || "").trim()
      ) {
        setClienteEmail(emailResolved);
      }

      await safeSaveDetailIfWindow(orderIdReal, data, { force: true, reason: "detalle_sap" });

      if (orderIdParam && orderIdParam !== orderIdReal) {
        const oldStart = await loadOrderStart(orderIdParam);
        const realStart = await loadOrderStart(orderIdReal);
        if (oldStart && !realStart) {
          await saveOrderStart(orderIdReal, oldStart);
          await clearOrderStart(orderIdParam);
          setOrderStartedAtMs(oldStart);
          setNowTick(Date.now());
        }

        const oldFinish = await loadOrderFinish(orderIdParam);
        const realFinish = await loadOrderFinish(orderIdReal);
        if (oldFinish && !realFinish) {
          await saveOrderFinish(orderIdReal, oldFinish);
          await clearOrderFinish(orderIdParam);
          setOrderFinishedAtMs(oldFinish);
        }

        const oldElapsed = await loadOrderElapsed(orderIdParam);
        const realElapsed = await loadOrderElapsed(orderIdReal);
        if (oldElapsed != null && realElapsed == null) {
          await saveOrderElapsed(orderIdReal, oldElapsed);
          await clearOrderElapsed(orderIdParam);
          setOrderElapsedMs(oldElapsed);
        }

        const oldPending = await loadPendingSign(orderIdParam);
        const realPending = await loadPendingSign(orderIdReal);
        if (oldPending && !realPending) {
          await savePendingSign(orderIdReal, oldPending);
          await clearPendingSign(orderIdParam);
        }
      }

      try {
        const sc = String(data?.estatus_code || data?.userstatus || "").trim();
        const isPending0400Local2 = sc.includes("0400");
        const pending = await loadPendingSign(orderIdReal);

        if (pending) {
          if (pending?.checkedMap) setCheckedMap(pending.checkedMap || {});
          if (Array.isArray(pending?.consumibles))
            setConsumibles(pending.consumibles);
          if (typeof pending?.notaTecnico === "string")
            setNotaTecnico(pending.notaTecnico || "");
          if (typeof pending?.clienteNombre === "string")
            setClienteNombre(pending.clienteNombre || "");
          if (typeof pending?.clienteCargo === "string")
            setClienteCargo(pending.clienteCargo || "");
          if (typeof pending?.avisoCliente === "string")
            setAvisoCliente(pending.avisoCliente || "");

          if (Number.isFinite(pending?.orderStartedAtMs)) {
            setOrderStartedAtMs(pending.orderStartedAtMs);
          }
          if (Number.isFinite(pending?.orderFinishedAtMs)) {
            setOrderFinishedAtMs(pending.orderFinishedAtMs);
          }
          if (Number.isFinite(pending?.orderElapsedMs)) {
            setOrderElapsedMs(pending.orderElapsedMs);
          }

          if (isPending0400Local2) setFinalizeMode(true);
        }
      } catch {}

      const estatusTxtLocal = String(
        data?.estatus_label || data?.estatus || data?.status || "",
      )
        .trim()
        .toUpperCase();
      const statusCodeLocal = String(
        data?.estatus_code || data?.userstatus || "",
      ).trim();

      const isEnProcesoLocal =
        estatusTxtLocal === "EN_PROCESO" ||
        estatusTxtLocal === "EN PROCESO" ||
        statusCodeLocal === "0200";

      const isPending0400Local =
        statusCodeLocal === "0400" || String(statusCodeLocal).includes("0400");
      const isFinalLocal =
        ["0300", "0500", "0600"].includes(statusCodeLocal) || !!data?.isFinal;

      if (isEnProcesoLocal) {
        const savedStart = await loadOrderStart(orderIdReal);
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }
      } else if (isPending0400Local) {
        const savedStart = await loadOrderStart(orderIdReal);
        if (savedStart) setOrderStartedAtMs(savedStart);

        const savedElapsed = await loadOrderElapsed(orderIdReal);
        if (savedElapsed != null) setOrderElapsedMs(savedElapsed);
      } else {
        setOrderStartedAtMs(null);
        await clearOrderStart(orderIdReal);
      }

      if (isFinalLocal) {
        const savedFinish = await loadOrderFinish(orderIdReal);
        if (savedFinish) setOrderFinishedAtMs(savedFinish);

        const savedElapsed = await loadOrderElapsed(orderIdReal);
        if (savedElapsed != null) setOrderElapsedMs(savedElapsed);
      }
    } catch (error) {
      console.error(
        "Error al obtener orden (SAP):",
        error?.response?.data || error,
      );

      const orderIdParam2 = String(id || "").trim();
      const cached2 = await loadOrdenTecnicoDetail(orderIdParam2);

      if (cached2?.data) {
        setOrden(cached2.data);

        const cachedOrderId = String(
          cached2?.data?.Orderid || orderIdParam2,
        ).trim();
        const savedStart = await loadOrderStart(cachedOrderId);
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }

        const savedFinish = await loadOrderFinish(cachedOrderId);
        if (savedFinish) setOrderFinishedAtMs(savedFinish);

        const savedElapsed = await loadOrderElapsed(cachedOrderId);
        if (savedElapsed != null) setOrderElapsedMs(savedElapsed);

        const pending = await loadPendingSign(cachedOrderId);
        if (pending?.checkedMap) setCheckedMap(pending.checkedMap || {});
        if (Array.isArray(pending?.consumibles))
          setConsumibles(pending.consumibles);
        if (typeof pending?.notaTecnico === "string")
          setNotaTecnico(pending.notaTecnico || "");
        if (typeof pending?.clienteNombre === "string")
          setClienteNombre(pending.clienteNombre || "");
        if (typeof pending?.clienteCargo === "string")
          setClienteCargo(pending.clienteCargo || "");
        if (typeof pending?.avisoCliente === "string")
          setAvisoCliente(pending.avisoCliente || "");

        if (Number.isFinite(pending?.orderStartedAtMs)) {
          setOrderStartedAtMs(pending.orderStartedAtMs);
        }
        if (Number.isFinite(pending?.orderFinishedAtMs)) {
          setOrderFinishedAtMs(pending.orderFinishedAtMs);
        }
        if (Number.isFinite(pending?.orderElapsedMs)) {
          setOrderElapsedMs(pending.orderElapsedMs);
        }

        const emailCached = String(cached2?.data?.cliente_email || "").trim();
        if (emailCached && isValidEmail(emailCached))
          setClienteEmail(emailCached);
      } else {
        Alert.alert("Error", "No se pudo cargar la orden desde SAP");
      }
    } finally {
      setLoading(false);
    }
  };
  const COMPONENTS_KEY = (orderId, activity) =>
    `orderComponents:${orderId}:${activity}`;

  function getComponentsFromOrderDetail(orderObj, activity) {
    const act = String(activity || "").trim();

    if (!act) return [];

    const all = Array.isArray(orderObj?.componentes)
      ? orderObj.componentes
      : Array.isArray(orderObj?.components)
        ? orderObj.components
        : [];

    return all.filter((c) => {
      const cAct = String(
        c?.Activity ||
          c?.activity ||
          c?.Vornr ||
          c?.Operation ||
          c?.operation ||
          "",
      ).trim();

      return cAct === act;
    });
  }

  async function mergeComponentsIntoOrderCache(orderId, activity, components = []) {
    const cleanOrderId = String(orderId || "").trim();
    const cleanActivity = String(activity || "").trim();

    if (!cleanOrderId || !cleanActivity) return;

    try {
      const cachedDetail = await loadOrdenTecnicoDetail(cleanOrderId);
      const base = cachedDetail?.data || orden || {};

      const prevComponents = Array.isArray(base?.componentes)
        ? base.componentes
        : [];

      const withoutCurrentActivity = prevComponents.filter((c) => {
        const cAct = String(
          c?.Activity ||
            c?.activity ||
            c?.Vornr ||
            c?.Operation ||
            c?.operation ||
            "",
        ).trim();

        return cAct !== cleanActivity;
      });

      const nextComponents = [
        ...withoutCurrentActivity,
        ...(Array.isArray(components) ? components : []),
      ];

      await safeSaveDetailIfWindow(
        cleanOrderId,
        {
          ...(base || {}),
          componentes: nextComponents,
        },
        {
          force: true,
          reason: "componentes_operacion",
        },
      );

      setOrden((prev) => ({
        ...(prev || {}),
        componentes: nextComponents,
      }));

      console.log("[DETALLE][COMPONENTES][CACHE] Guardados:", {
        orderId: cleanOrderId,
        activity: cleanActivity,
        count: Array.isArray(components) ? components.length : 0,
        total: nextComponents.length,
      });
    } catch (e) {
      console.log(
        "[DETALLE][COMPONENTES][CACHE] No se pudo actualizar detalle:",
        e?.message || e,
      );
    }
  }

  async function saveOfflineComponents(orderId, activity, data) {
    try {
      await AsyncStorage.setItem(
        COMPONENTS_KEY(orderId, activity),
        JSON.stringify(Array.isArray(data) ? data : []),
      );
    } catch {}
  }

  async function loadOfflineComponents(orderId, activity) {
    try {
      const raw = await AsyncStorage.getItem(COMPONENTS_KEY(orderId, activity));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  const openComponentsModal = async (op) => {
    try {
      setSelectedOp(op);
      setCompList([]);
      setShowCompModal(true);
      setLoadingComponents(true);

      const Orderid = String(orden?.Orderid || id || "").trim();
      const Activity = String(op?.activity || op?.Activity || "").trim();

      if (!Orderid || !Activity) {
        Alert.alert("Materiales", "No se encontró la operación.");
        return;
      }

      /*
        Miguel Ángel Hernández Álvarez - 01/07/2026

        Corrección consumo de datos:
        Los componentes ya deben venir desde la pantalla de precarga.
        Por eso, al abrir materiales:

        1) Primero se lee AsyncStorage por operación.
        2) Después se busca dentro del detalle offline de la orden.
        3) Solo si NO existe nada en cache, se hace una consulta de emergencia.

        Con esto evitamos que la vista de detalle dispare varias peticiones:
        /api/operaciones/ordenes/:orderId/operaciones/:activity/componentes
      */

      const offlineData = await loadOfflineComponents(Orderid, Activity);

      if (offlineData.length > 0) {
        setCompList(offlineData);
        return;
      }

      const detailData = getComponentsFromOrderDetail(orden, Activity);

      if (detailData.length > 0) {
        setCompList(detailData);
        await saveOfflineComponents(Orderid, Activity, detailData);
        return;
      }

      const net = await NetInfo.fetch();
      const isOnline = !!(
        net?.isConnected && net?.isInternetReachable !== false
      );

      if (!isOnline) {
        Alert.alert(
          "Materiales",
          "No hay conexión y esta operación no tiene materiales guardados offline.",
        );
        return;
      }

      console.log(
        "[DETALLE][COMPONENTES] Consulta de emergencia porque no existe cache:",
        {
          Orderid,
          Activity,
        },
      );

      const res = await api.get(
        `/api/operaciones/ordenes/${Orderid}/operaciones/${Activity}/componentes`,
      );

      const data = Array.isArray(res.data) ? res.data : [];
      setCompList(data);

      await saveOfflineComponents(Orderid, Activity, data);
      await mergeComponentsIntoOrderCache(Orderid, Activity, data);
    } catch (error) {
      console.error(
        "Error al obtener componentes:",
        error?.response?.data || error,
      );

      const Orderid = String(orden?.Orderid || id || "").trim();
      const Activity = String(op?.activity || op?.Activity || "").trim();

      const offlineData = await loadOfflineComponents(Orderid, Activity);

      if (offlineData.length > 0) {
        setCompList(offlineData);
        Alert.alert(
          "Materiales",
          "Se mostraron los materiales guardados offline.",
        );
      } else {
        const detailData = getComponentsFromOrderDetail(orden, Activity);

        if (detailData.length > 0) {
          setCompList(detailData);
          await saveOfflineComponents(Orderid, Activity, detailData);

          Alert.alert(
            "Materiales",
            "Se mostraron los materiales guardados en el detalle offline.",
          );
        } else {
          Alert.alert(
            "Materiales",
            "No se encontraron materiales guardados para esta operación.",
          );
        }
      }
    } finally {
      setLoadingComponents(false);
    }
  };

  const closeComponentsModal = () => {
    setShowCompModal(false);
    setSelectedOp(null);
    setCompList([]);
  };

  useEffect(() => {
    let mounted = true;
    let localSound = null;

    (async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require("../../../../assets/alert.mp3"),
        );
        localSound = sound;
        if (mounted) setSoundObj(sound);
      } catch (e) {
        console.warn("No se pudo cargar el sonido de alerta:", e);
      }
    })();

    return () => {
      mounted = false;
      try {
        localSound?.unloadAsync?.();
      } catch {}
    };
  }, []);

  const irAAvisoAveria = (e) => {
    e?.stopPropagation?.();
    if (!orden?.Orderid) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }
    const orderid = String(orden.Orderid).trim();
    router.push({
      pathname: "/tecnico/ordenes/[id]/aviso-averia",
      params: { id: orderid },
    });
  };

  const iniciarOrden = async () => {
    if (!orden?.Orderid) return;

    const estatusTxtNow = String(
      orden?.estatus_label || orden?.estatus || orden?.status || "",
    )
      .trim()
      .toUpperCase();

    const puedeIniciarPorEstatus =
      estatusTxtNow === "EN_PROCESO" ||
      estatusTxtNow === "EN PROCESO" ||
      statusCode === "0200";

    if (!puedeIniciarPorEstatus) {
      Alert.alert(
        "No disponible",
        'El cronómetro solo se puede iniciar cuando la orden está en "EN_PROCESO" (o código 0200).',
      );
      return;
    }

    if (!checkinDone) {
      Alert.alert(
        "Check-in requerido",
        "Primero debes hacer Check-in para iniciar el cronómetro.",
      );
      return;
    }

    if (isNoMant || isOrderFinishedReal) {
      Alert.alert(
        "No disponible",
        "La orden no permite iniciar cronómetro en este estado.",
      );
      return;
    }

    if (orderStartedAtMs) return;

    const orderId = String(orden.Orderid).trim();

    Alert.alert("Iniciar orden", "¿Deseas iniciar el cronómetro de la orden?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sí, iniciar",
        onPress: async () => {
          try {
            setStartingOrder(true);

            await clearOrderFinish(orderId);
            setOrderFinishedAtMs(null);

            await clearOrderElapsed(orderId);
            setOrderElapsedMs(null);

            const startMs = Date.now();
            await saveOrderStart(orderId, startMs);
            setOrderStartedAtMs(startMs);
            setNowTick(Date.now());

            Alert.alert("Listo", "Cronómetro iniciado.");
          } catch (e) {
            console.error("Error al iniciar cronómetro:", e);
            Alert.alert("Error", "No se pudo iniciar el cronómetro.");
          } finally {
            setStartingOrder(false);
          }
        },
      },
    ]);
  };

  const abrirModalNoMantPdf = async () => {
    if (!orden?.Orderid) return;

    setShowNoMantPdfModal(true);
    setLoadingNoMantPdf(true);
    setNoMantPdfUrl(null);
    setNoMantPdfRawUrl(null);
    setNoMantError(null);

    try {
      const res = await api.get(
        `/evidencias/orden/${orden.Orderid}/no-mantenimiento-pdf`,
      );
      const { pdf_url } = res.data || {};
      if (!pdf_url) throw new Error("Sin URL de PDF desde backend");

      const apiBase = api.defaults.baseURL || "";
      const serverRoot = apiBase.replace(/\/api\/?$/, "");

      const rawUrl = pdf_url.startsWith("http")
        ? pdf_url
        : `${serverRoot}${pdf_url}`;
      setNoMantPdfRawUrl(rawUrl);

      const viewerUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(rawUrl)}`;
      setNoMantPdfUrl(viewerUrl);
    } catch (error) {
      console.error(
        "Error al obtener PDF no mantto:",
        error?.response?.data || error,
      );
      setNoMantError(
        "No se pudo cargar el PDF de la carta de no mantenimiento.",
      );
    } finally {
      setLoadingNoMantPdf(false);
    }
  };

  const cerrarModalNoMantPdf = () => {
    setShowNoMantPdfModal(false);
    setNoMantPdfUrl(null);
    setNoMantPdfRawUrl(null);
    setNoMantError(null);
    setDownloadingNoMantPdf(false);
  };

  const descargarNoMantPdf = async () => {
    if (!noMantPdfRawUrl) {
      Alert.alert(
        "Sin archivo",
        "No se encontró la URL del PDF para descargar.",
      );
      return;
    }

    try {
      setDownloadingNoMantPdf(true);

      const filename =
        noMantPdfRawUrl.split("/").pop() ||
        `carta-no-mantto_${orden?.Orderid || ""}.pdf`;
      const localUri = FileSystem.documentDirectory + filename;

      const { uri } = await FileSystem.downloadAsync(noMantPdfRawUrl, localUri);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "Descarga completa",
          "El PDF se guardó en la carpeta de documentos de la app.",
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Compartir / guardar carta de no mantenimiento",
      });
    } catch (e) {
      console.error("Error al descargar PDF:", e);
      Alert.alert(
        "Error",
        "No se pudo descargar el PDF. Verifica acceso a la URL del servidor.",
      );
    } finally {
      setDownloadingNoMantPdf(false);
    }
  };

  const handleFinalizarOrden = (e) => {
    e?.stopPropagation?.();

    const orderid = String(orden?.Orderid ?? id ?? "").trim();
    if (!orderid) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    setFinalizeMode(true);
  };

  const guardarPendienteDeFirma = async () => {
    const orderId = String(orden?.Orderid || id || "").trim();
    if (!orderId) return;

    const selectedIds = Object.keys(checkedMap || {});
    if (!selectedIds.length) {
      Alert.alert(
        "Sin selección",
        "Marca al menos una operación realizada antes de guardar.",
      );
      return;
    }

    if (!orderStartedAtMs) {
      Alert.alert(
        "Sin cronómetro",
        "No se detectó el inicio del cronómetro. Inicia la orden para poder prorratear y mandar operaciones.",
      );
      return;
    }

    const consumiblesValidos = hasValidConsumibles(consumibles);
    if (!consumiblesValidos) {
      Alert.alert(
        "Consumibles obligatorios",
        "Debes agregar al menos un consumible válido antes de guardar pendiente de firma.",
      );
      return;
    }

    try {
      setSavingPending0400(true);

      const finishMs = Date.now();
      const elapsedMs = Math.max(0, finishMs - orderStartedAtMs);

      await saveOrderElapsed(orderId, elapsedMs);
      setOrderElapsedMs(elapsedMs);

      await saveOrderFinish(orderId, finishMs);
      setOrderFinishedAtMs(finishMs);

      const payload0400 = {
        OrderId: orderId,
        WorkOrderHeader: { Orderid: orderId },
        WorkOrderUserStatusSet: [
          { UserStText: "0400", Langu: "ES", Inactive: "" },
          { UserStText: "0200", Langu: "ES", Inactive: "X" },
        ],
        Return: [],
      };

      const opsAll = Array.isArray(orden?.operaciones) ? orden.operaciones : [];
      const plantFallback = String(
        orden?.Plant || orden?.plant || orden?.centro || "",
      ).trim();

      const confirmationPayload0400 = buildConfirmationPayloadFromSelectedOps({
        orderId,
        opsAll,
        selectedIds,
        startMs: orderStartedAtMs,
        finishMs,
        consumiblesRows: consumibles,
        plantFallback,
        user,
      });

      if (!confirmationPayload0400) {
        Alert.alert(
          "Error",
          "No se pudo armar el payload de confirmaciones de operaciones.",
        );
        return;
      }

      const pendingPayload = {
        checkedMap,
        savedAt: Date.now(),
        confirmationsSent: true,
        confirmationsFinishMs: finishMs,
        consumibles: Array.isArray(consumibles) ? consumibles : [],
        notaTecnico: String(notaTecnico || "").trim(),
        clienteNombre: String(clienteNombre || "").trim(),
        clienteCargo: String(clienteCargo || "").trim(),
        avisoCliente: String(avisoCliente || "").trim(),
        orderStartedAtMs: Number.isFinite(orderStartedAtMs)
          ? orderStartedAtMs
          : null,
        orderFinishedAtMs: finishMs,
        orderElapsedMs: elapsedMs,
      };

      await savePendingSign(orderId, pendingPayload);

      // ✅ Segundo plano: primero se guarda todo local y se encola.
      // Ya no esperamos el POST de SAP desde esta pantalla.
      await enqueueSap({
        type: "CONFIRMATIONS",
        orderId,
        endpoint: "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
        payload: confirmationPayload0400,
        dedupeKey: `CONFIRMATIONS:${orderId}:0400`,
      });

      await enqueueSap({
        type: "STATUS",
        orderId,
        endpoint: "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
        payload: payload0400,
        dedupeKey: `STATUS:${orderId}:0400`,
      });

      await applyLocalOrderStatus(orderId, "0400");

      setFinalizeMode(false);

      runSapQueueInBackground();

      Alert.alert(
        "Guardado en el dispositivo",
        "La orden quedó como pendiente de firma localmente. Las operaciones, consumibles y el estatus 0400 se enviarán en segundo plano cuando haya conexión.",
      );

      router.replace("/tecnico/ordenes");
    } catch (e) {
      console.error(
        "Error guardando pendiente de firma:",
        e?.response?.data || e,
      );
      Alert.alert(
        "Error",
        "No se pudo completar el guardado como pendiente de firma.",
      );
    } finally {
      setSavingPending0400(false);
    }
  };

  function hacerPreviewConColumnasManuales(html = "") {
    return String(html || "")
      .replaceAll('class="ubicGrid"', 'class="ubicGrid previewManualGrid"')
      .replace(
        "</head>",
        `
        <style>
          @media screen {
            html, body {
              width: 816px !important;
              min-width: 816px !important;
            }

            .pagina {
              width: 796px !important;
              min-width: 796px !important;
            }

            .previewManualGrid {
              display: grid !important;
              grid-template-columns: 1fr 1fr !important;
              column-gap: 10px !important;
            }

            .previewManualGrid .opItem {
              width: 100% !important;
              display: table !important;
            }

            .previewManualGrid .opItem:nth-child(odd) {
              grid-column: 1;
            }

            .previewManualGrid .opItem:nth-child(even) {
              grid-column: 2;
            }
          }
        </style>
        </head>`,
      );
  }

  const generarVistaPreviaPdfAntesFirma = async () => {
    try {
      const orderId = String(orden?.Orderid || id || "").trim();

      if (!orderId) {
        Alert.alert("Error", "No se encontró el número de orden.");
        return;
      }

      const selectedIds = Object.keys(checkedMap || {});

      if (!selectedIds.length) {
        Alert.alert(
          "Sin selección",
          "Marca al menos una operación realizada antes de visualizar el PDF.",
        );
        return;
      }

      const draftFinishMs = Date.now();
      const draftElapsedMs = orderStartedAtMs
        ? Math.max(0, draftFinishMs - orderStartedAtMs)
        : null;

      setShowSignModal(false);
      setMantHtmlPreview(null);
      setMantPdfUri(null);
      setShowMantPreview(true);

      const tipo = detectTipoMantenimiento(orden);
      const opsAll = Array.isArray(orden?.operaciones) ? orden.operaciones : [];

      const html = await buildMantenimientoHtml({
        tipo,
        orden,
        operaciones: opsAll,
        checkedMap,
        signatureData,
        clienteEmail: String(clienteEmail || "").trim(),
        clienteNombre: String(clienteNombre || "").trim(),
        clienteCargo: String(clienteCargo || "").trim(),
        tecnicoNombre: String(
          user?.nombre ||
            user?.name ||
            user?.fullName ||
            user?.displayName ||
            user?.username ||
            "",
        ).trim(),
        avisoCliente: String(avisoCliente || "").trim(),
        notaTecnico: String(notaTecnico || "").trim(),
        coberturaTipo:
          coberturaTipo || orden?.cobertura_tipo || "SIN COBERTURA",
        consumibles,
        startMs: orderStartedAtMs,
        finishMs: draftFinishMs,
        elapsedMs: draftElapsedMs,
      });

      const htmlPreview = hacerPreviewConColumnasManuales(html);
      setMantHtmlPreview(htmlPreview);

      const result = await Print.printToFileAsync({
        html: String(html || ""),
        base64: true,
      });

      const pdfBase64ConPaginas = await addPageNumbersToPdfBase64(
        result.base64,
      );

      await FileSystem.writeAsStringAsync(result.uri, pdfBase64ConPaginas, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setMantPdfUri(result.uri);
    } catch (error) {
      console.log("[PDF PREVIEW] Error:", error);
      setShowMantPreview(false);
      Alert.alert("Error", "No se pudo generar la vista previa del PDF.");
    }
  };
  const abrirFirmaCliente = async () => {
    const orderId = String(orden?.Orderid || id || "").trim();
    if (!orderId) return;

    const selectedIds = Object.keys(checkedMap || {});
    if (!selectedIds.length) {
      Alert.alert(
        "Sin selección",
        "Marca al menos una operación realizada antes de solicitar firma.",
      );
      return;
    }

    if (orderStartedAtMs) {
      const elapsed = Math.max(0, Date.now() - orderStartedAtMs);
      await saveOrderElapsed(orderId, elapsed);
      setOrderElapsedMs(elapsed);
    }

    const draftFinishMs = Date.now();
    const draftElapsedMs = orderStartedAtMs
      ? Math.max(0, draftFinishMs - orderStartedAtMs)
      : null;

    await savePendingSign(orderId, {
      checkedMap,
      savedAt: Date.now(),
      consumibles: Array.isArray(consumibles) ? consumibles : [],
      notaTecnico: String(notaTecnico || "").trim(),
      clienteNombre: String(clienteNombre || "").trim(),
      clienteCargo: String(clienteCargo || "").trim(),
      avisoCliente: String(avisoCliente || "").trim(),
      orderStartedAtMs: Number.isFinite(orderStartedAtMs)
        ? orderStartedAtMs
        : null,
      orderFinishedAtMs: draftFinishMs,
      orderElapsedMs: draftElapsedMs,
    });

    setShowSignModal(true);
  };

  const confirmarFinalizarConFirma = async () => {
    if (!orden?.Orderid) return;

    const orderId = String(orden.Orderid).trim();

    const email = String(clienteEmail || "").trim();
    if (email && !isValidEmail(email)) {
      Alert.alert(
        "Correo inválido",
        "Si capturas un correo, debe ser válido (ej: nombre@dominio.com).",
      );
      return;
    }

    if (!String(clienteNombre || "").trim()) {
      Alert.alert(
        "Falta nombre",
        "Escribe el nombre del cliente (obligatorio).",
      );
      return;
    }
    if (!String(clienteCargo || "").trim()) {
      Alert.alert("Falta cargo", "Escribe el cargo del cliente (obligatorio).");
      return;
    }

    if (!signatureData) {
      Alert.alert(
        "Falta firma",
        'Pida al cliente que firme y toque "Listo" dentro del recuadro.',
      );
      return;
    }

    const consumiblesValidos = hasValidConsumibles(consumibles);
    if (!consumiblesValidos) {
      Alert.alert(
        "Consumibles obligatorios",
        "Debes agregar al menos un consumible válido antes de finalizar la orden.",
      );
      return;
    }

    const selectedIds = Object.keys(checkedMap || {});
    if (!selectedIds.length) {
      Alert.alert(
        "Sin selección",
        "Marca al menos una operación realizada antes de finalizar.",
      );
      return;
    }

    try {
      setSavingSignature(true);

      const pendingDraft = await loadPendingSign(orderId);

      const effectiveStartMs = Number.isFinite(pendingDraft?.orderStartedAtMs)
        ? pendingDraft.orderStartedAtMs
        : orderStartedAtMs;

      const effectiveFinishMs = Number.isFinite(pendingDraft?.orderFinishedAtMs)
        ? pendingDraft.orderFinishedAtMs
        : Date.now();

      const effectiveElapsedMs = Number.isFinite(pendingDraft?.orderElapsedMs)
        ? pendingDraft.orderElapsedMs
        : Number.isFinite(effectiveStartMs)
          ? Math.max(0, effectiveFinishMs - effectiveStartMs)
          : null;

      if (!effectiveStartMs) {
        Alert.alert(
          "Sin cronómetro",
          "No se detectó el inicio del cronómetro. Inicia la orden para poder prorratear tiempos.",
        );
        return;
      }

      const finishMs = effectiveFinishMs;
      const elapsedNow =
        effectiveElapsedMs ?? Math.max(0, finishMs - effectiveStartMs);

      await saveOrderElapsed(orderId, elapsedNow);
      setOrderElapsedMs(elapsedNow);
      await saveOrderFinish(orderId, finishMs);
      setOrderFinishedAtMs(finishMs);

      const totalMs = elapsedNow;
      const totalMin = msToMinutesRounded(totalMs);

      const opsAll = Array.isArray(orden?.operaciones) ? orden.operaciones : [];
      const selectedOpsRaw = selectedIds
        .map((idKey) => opsAll.find((op) => String(op.id) === String(idKey)))
        .filter(Boolean);

      const uniqByOp = (ops) => {
        const map = new Map();
        for (const op of ops) {
          const act = String(op.activity || op.Activity || "").trim();
          const key = `${act}`;
          if (!map.has(key)) map.set(key, op);
        }
        return Array.from(map.values());
      };

      const selectedOps = uniqByOp(selectedOpsRaw);
      if (!selectedOps.length) {
        Alert.alert(
          "Error",
          "No se encontraron las operaciones seleccionadas en la orden.",
        );
        return;
      }

      const n = selectedOps.length;
      const minsArr = prorateMinutes(totalMin, n);
      const windows = buildSequentialWindows(effectiveStartMs, minsArr);

      const currentCode = pickCurrentStatusCode(orden);
      const statusPayload0300 = buildStatus0300Payload({
        orderId,
        email,
        currentCode,
      });

      const plantFallback = String(
        orden?.Plant || orden?.plant || orden?.centro || "",
      ).trim();
      const ConfirmationMaterialSet = normalizeConsumiblesToMaterialSet(
        consumibles,
        plantFallback,
      );

      const confirmationPayload = {
        Order: "S1",
        Mail: String(userEmail || "").trim(), // 👈 AQUI
        ConfirmationOrderSet: selectedOps.map((op, idx) => {
          const actRaw = String(op.activity || op.Activity || "").trim();
          const Operation = actRaw.padStart(4, "0");
          const w = windows[idx];

          const row = {
            ConfNo: "",
            Orderid: orderId,
            Operation,
            PostgDate: sapDateFromMs(finishMs),
            ActWork: String(minsArr[idx]),
            UnWork: "min",
            ExecStartDate: sapDateFromMs(w.start),
            ExecFinDate: sapDateFromMs(w.end),
            ExecStartTime: sapTimePTFromMs(w.start),
            ExecFinTime: sapTimePTFromMs(w.end),
            FinConf: "X",
          };
          return row;
        }),
        ConfirmationMaterialSet,
        Return: [],
      };

      const tipo = detectTipoMantenimiento(orden);

      const html = await buildMantenimientoHtml({
        tipo,
        orden,
        operaciones: opsAll,
        checkedMap,
        signatureData,
        clienteEmail: email,
        clienteNombre: String(clienteNombre || "").trim(),
        clienteCargo: String(clienteCargo || "").trim(),
        tecnicoNombre: String(
          user?.nombre ||
            user?.name ||
            user?.fullName ||
            user?.displayName ||
            user?.username ||
            "",
        ).trim(),
        avisoCliente: String(avisoCliente || "").trim(),
        notaTecnico: String(notaTecnico || "").trim(),
        coberturaTipo:
          coberturaTipo || orden?.cobertura_tipo || "SIN COBERTURA",
        consumibles,
        startMs: effectiveStartMs,
        finishMs,
        elapsedMs: elapsedNow,
      });

      const htmlPreview = hacerPreviewConColumnasManuales(html);
      setMantHtmlPreview(htmlPreview);

      let pdfBase64 = "";
      let pdfUri = null;

      try {
        const result = await Print.printToFileAsync({
          html: String(html || ""),
          base64: true,
        });

        const pdfBase64ConPaginas = await addPageNumbersToPdfBase64(
          result.base64,
        );

        await FileSystem.writeAsStringAsync(result.uri, pdfBase64ConPaginas, {
          encoding: FileSystem.EncodingType.Base64,
        });

        pdfUri = result.uri;
        pdfBase64 = pdfBase64ConPaginas;
        setMantPdfUri(result.uri);
      } catch (e) {
        console.warn("No se pudo generar PDF (base64):", e?.message || e);
        setMantPdfUri(null);
      }

      const fileName =
        tipo === "escalera"
          ? "mantenimiento_escaleras.pdf"
          : "mantenimiento_elevadores.pdf";

      const change0300WithPdfPayload = {
        ...statusPayload0300,
        Attachments: [
          {
            DocId: orderId,
            FileName: fileName,
            MimeType: "pdf",
            Base64: pdfBase64 || "",
          },
        ],
      };

      setPendingFinalize({
        orderId,
        finishMs,
        selectedIds,
        change0300WithPdfPayload,
        confirmationPayload,
        clienteNombre: String(clienteNombre || "").trim(),
        clienteCargo: String(clienteCargo || "").trim(),
        avisoCliente: String(avisoCliente || "").trim(),
        notaTecnico: String(notaTecnico || "").trim(),
      });

      setShowSignModal(false);
      setShowMantPreview(true);
    } catch (e) {
      console.error(
        "Error preparando finalización (preview):",
        e?.response?.data || e,
      );
      Alert.alert("Error", "No se pudo generar la vista previa del reporte.");
    } finally {
      setSavingSignature(false);
    }
  };

  const abrirPdfMantenimiento = async () => {
    if (!mantPdfUri) {
      Alert.alert(
        "Sin PDF",
        "No se pudo generar el PDF en este dispositivo (puedes continuar).",
      );
      return;
    }
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "No disponible",
          "Este dispositivo no permite abrir/compartir archivos. Puedes continuar igualmente.",
        );
        return;
      }
      await Sharing.shareAsync(mantPdfUri, {
        mimeType: "application/pdf",
        dialogTitle: "Abrir / compartir PDF de mantenimiento",
      });
    } catch (e) {
      console.warn("No se pudo abrir/compartir PDF:", e?.message || e);
      Alert.alert("Error", "No se pudo abrir el PDF.");
    }
  };

  const continuarFinalizacionDespuesPreview = async () => {
    if (!pendingFinalize?.orderId) {
      setShowMantPreview(false);
      return;
    }

    const {
      orderId,
      finishMs,
      selectedIds,
      change0300WithPdfPayload,
      confirmationPayload,
    } = pendingFinalize;

    try {
      setFinishingOrder(true);

      let alreadySentConfirmations = false;
      try {
        const pending = await loadPendingSign(orderId);
        alreadySentConfirmations = !!pending?.confirmationsSent;
      } catch {}

      logSapPayload(
        "=== SAP PAYLOAD ENCOLADO (CHANGE 0300 + PDF) ===",
        change0300WithPdfPayload,
        {
          stripBase64: true,
        },
      );
      logSapPayload(
        "=== SAP PAYLOAD ENCOLADO (CONFIRMATIONS + CONSUMIBLES) ===",
        confirmationPayload,
      );
      console.log("CONFIRMATIONS alreadySent:", alreadySentConfirmations);

      if (!change0300WithPdfPayload?.Attachments?.[0]?.Base64) {
        Alert.alert(
          "No se pudo generar el PDF",
          "No se pudo generar el PDF en este dispositivo. Intenta de nuevo o revisa permisos/almacenamiento.",
        );
        return;
      }

      // ✅ Segundo plano: la orden se finaliza localmente y se encola el envío SAP.
      // Ya no esperamos el POST del PDF Base64 ni de confirmaciones desde esta pantalla.
      await enqueueSap({
        type: "STATUS",
        orderId,
        endpoint: "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
        payload: change0300WithPdfPayload,
        dedupeKey: `STATUS:${orderId}:0300`,
      });

      if (!alreadySentConfirmations) {
        await enqueueSap({
          type: "CONFIRMATIONS",
          orderId,
          endpoint: "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
          payload: confirmationPayload,
          dedupeKey: `CONFIRMATIONS:${orderId}:0300`,
        });
      } else {
        console.log(
          "Saltando enqueue confirmaciones (ya fueron enviadas o encoladas en 0400)",
        );
      }

      await updateLocalOpsAsFinalizadas(orderId, selectedIds);
      await updateLocalOrderAsFinalizada0300(orderId, finishMs);

      await clearOrderStart(orderId);
      setOrderStartedAtMs(null);

      await clearPendingSign(orderId);
      setCheckedMap({});
      setConsumibles([]);
      setNotaTecnico("");
      setFinalizeMode(false);

      setShowMantPreview(false);
      setPendingFinalize(null);

      runSapQueueInBackground();

      Alert.alert(
        "Orden finalizada localmente",
        alreadySentConfirmations
          ? "La orden quedó finalizada en el dispositivo. El estatus 0300 + PDF se enviará en segundo plano."
          : "La orden quedó finalizada en el dispositivo. El estatus 0300 + PDF y las confirmaciones se enviarán en segundo plano.",
      );

      router.replace("/tecnico/ordenes");
    } catch (error) {
      console.error(
        "Error al finalizar localmente / encolar SAP:",
        error?.response?.data || error,
      );

      const msg = getSapErrorMessage(error, "No se pudo finalizar.");
      Alert.alert("Error", String(msg));
    } finally {
      setFinishingOrder(false);
    }
  };

  useEffect(() => {
    obtenerOrden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={`Orden ${id || ""}`} />

        {canStartTimer && !orderStartedAtMs ? (
          <View style={styles.topActionBar}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.startOrderBtn, startingOrder && { opacity: 0.7 }]}
              onPress={iniciarOrden}
              disabled={startingOrder}
            >
              <Ionicons name="play-circle-outline" size={18} color="#fff" />
              <Text style={styles.startOrderBtnText}>
                {startingOrder ? "Iniciando..." : "Iniciar orden"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : showRunningTimer ? (
          <View style={styles.topActionBar}>
            <View style={styles.timerPill}>
              <Ionicons name="time-outline" size={16} color={FIORI.text} />
              <Text style={styles.timerText}>
                {msToHMS(nowTick - orderStartedAtMs)}
              </Text>
            </View>
          </View>
        ) : showFrozenTimer ? (
          <View style={styles.topActionBar}>
            <View style={styles.timerPill}>
              <Ionicons
                name="pause-circle-outline"
                size={16}
                color={FIORI.text}
              />
              <Text style={styles.timerText}>{msToHMS(orderElapsedMs)}</Text>
            </View>
          </View>
        ) : null}

        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={FIORI.brand} />
          <Text
            style={{ marginTop: 10, color: FIORI.textMuted, fontWeight: "700" }}
          >
            Cargando orden…
          </Text>
        </View>
      </View>
    );
  }

  if (!orden) {
    return (
      <View style={styles.container}>
        <Header title={`Orden ${id || ""}`} />
        <Text style={styles.error}>No se pudo cargar la orden.</Text>
      </View>
    );
  }

  const estatusColor = isNoMant
    ? FIORI.textMuted
    : isOrderFinishedReal
      ? FIORI.ok
      : !statusCode
        ? FIORI.err
        : statusCode === "0100"
          ? FIORI.err
          : statusCode === "0200"
            ? FIORI.warn
            : statusCode === "0400"
              ? FIORI.warn
              : FIORI.ok;

  const direccionValor =
    orden.direccion || orden.address || orden.partner_address || null;
  const allMaterials = Array.isArray(orden.componentes)
    ? orden.componentes
    : [];
  const hasSelectedOps = Object.keys(checkedMap || {}).length > 0;

  const ordenParaVista = {
    ...(orden || {}),
    cliente_email: String(orden?.cliente_email || "").trim() || "(sin correo)",
  };

  return (
    <View style={styles.container}>
      <Header title={`Orden ${orden?.Orderid || id || ""}`} />

      {canStartTimer && !orderStartedAtMs ? (
        <View style={styles.topActionBar}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.startOrderBtn, startingOrder && { opacity: 0.7 }]}
            onPress={iniciarOrden}
            disabled={startingOrder}
          >
            <Ionicons name="play-circle-outline" size={18} color="#fff" />
            <Text style={styles.startOrderBtnText}>
              {startingOrder ? "Iniciando..." : "Iniciar orden"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : showRunningTimer ? (
        <View style={styles.topActionBar}>
          <View style={styles.timerPill}>
            <Ionicons name="time-outline" size={16} color={FIORI.text} />
            <Text style={styles.timerText}>
              {msToHMS(nowTick - orderStartedAtMs)}
            </Text>
          </View>
        </View>
      ) : showFrozenTimer ? (
        <View style={styles.topActionBar}>
          <View style={styles.timerPill}>
            <Ionicons
              name="pause-circle-outline"
              size={16}
              color={FIORI.text}
            />
            <Text style={styles.timerText}>{msToHMS(orderElapsedMs)}</Text>
          </View>
        </View>
      ) : null}

      <FlatList
        style={{ flex: 1 }}
        data={[{ _k: "single" }]}
        keyExtractor={(x) => x._k}
        contentContainerStyle={[styles.content, { paddingBottom: 140 }]}
        ListHeaderComponent={
          <EncabezadoDetalleOrden
            orden={ordenParaVista}
            id={id}
            styles={styles}
            FIORI={FIORI}
            estatusColor={estatusColor}
            isNoMant={isNoMant}
            checkinDone={checkinDone}
            isOrderFinished={isOrderFinishedReal}
            direccionValor={direccionValor}
            allMaterialsLen={allMaterials.length}
            fmtDMY={fmtDMY}
            formatValueForRow={formatValueForRow}
            onAbrirPdfNoMant={abrirModalNoMantPdf}
            onVerMaterialesOrden={() => setShowAllMaterialsModal(true)}
            orderStartedAtMs={orderStartedAtMs}
            orderFinishedAtMs={orderFinishedAtMs}
            orderElapsedMs={orderElapsedMs}
            fmtDateTimeLocal={fmtDateTimeLocal}
            msToHMS={msToHMS}
            statusCode={statusCode}
            statusLabel={statusLabel}
          />
        }
        renderItem={() => {
          const ops = Array.isArray(orden?.operaciones)
            ? orden.operaciones
            : [];
          return (
            <>
              <ListaOperacionesAgrupadas
                operaciones={ops}
                styles={styles}
                FIORI={FIORI}
                onOpenComponentsView={openComponentsModal}
                finalizeMode={finalizeMode}
                onRequestCancelFinalize={() => setFinalizeMode(false)}
                checkedMap={checkedMap}
                setCheckedMap={setCheckedMap}
                orderId={String(orden?.Orderid || id || "").trim()}
              />

              {finalizeMode ? (
                <View style={[styles.panel, { marginTop: 12 }]}>
                  <Text style={styles.panelTitle}>
                    Descripción general de las actividades
                  </Text>
                  <Text
                    style={{
                      color: FIORI.textMuted,
                      fontWeight: "700",
                      marginBottom: 8,
                    }}
                  >
                    Se insertará en el PDF.
                  </Text>

                  <TextInput
                    value={notaTecnico}
                    onChangeText={setNotaTecnico}
                    placeholder="Descripción de actividades"
                    placeholderTextColor={FIORI.textMuted}
                    multiline
                    style={{
                      minHeight: 90,
                      borderWidth: 1,
                      borderColor: FIORI.border,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      fontWeight: "700",
                      color: FIORI.text,
                      backgroundColor: FIORI.surfaceAlt,
                    }}
                  />

                  <ConsumiblesFinalizacion
                    plant={String(
                      orden?.Plant || orden?.plant || orden?.centro || "",
                    ).trim()}
                    coberturaTipo={
                      coberturaTipo || orden?.cobertura_tipo || null
                    }
                    FIORI={FIORI}
                    initialRows={consumibles}
                    onChange={(rows) => setConsumibles(rows)}
                  />
                </View>
              ) : null}
            </>
          );
        }}
        ListFooterComponent={
          <PieDetalleOrden
            FIORI={FIORI}
            isNoMant={isNoMant}
            userRolId={user?.rol_id}
            finishingOrder={finishingOrder}
            statusCode={statusCode}
            finalizeMode={finalizeMode}
            onCancelarFinalizacion={() => setFinalizeMode(false)}
            onFinalizarOrden={handleFinalizarOrden}
            onAgregarFirma={abrirFirmaCliente}
            onGuardarPendiente={guardarPendienteDeFirma}
            hasSelectedOps={hasSelectedOps}
          />
        }
      />

      {!isOpsLocked && (
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.9}
          onPress={(e) => irAAvisoAveria(e)}
        >
          <Ionicons name="warning-outline" size={20} color="#000000ff" />
          <Text style={styles.fabLabel}>Avería</Text>
        </TouchableOpacity>
      )}

      <ModalesDetalleOrden
        styles={styles}
        FIORI={FIORI}
        orden={ordenParaVista}
        allMaterials={allMaterials}
        showAllMaterialsModal={showAllMaterialsModal}
        setShowAllMaterialsModal={setShowAllMaterialsModal}
        showCompModal={showCompModal}
        closeComponentsModal={closeComponentsModal}
        selectedOp={selectedOp}
        loadingComponents={loadingComponents}
        compList={compList}
        showSignModal={showSignModal}
        setShowSignModal={setShowSignModal}
        signatureRef={signatureRef}
        signatureData={signatureData}
        setSignatureData={setSignatureData}
        savingSignature={savingSignature}
        confirmarFinalizarConFirma={confirmarFinalizarConFirma}
        clienteEmail={clienteEmail}
        setClienteEmail={setClienteEmail}
        isValidEmail={isValidEmail}
        clienteNombre={clienteNombre}
        setClienteNombre={setClienteNombre}
        clienteCargo={clienteCargo}
        setClienteCargo={setClienteCargo}
        avisoCliente={avisoCliente}
        setAvisoCliente={setAvisoCliente}
        showNoMantPdfModal={showNoMantPdfModal}
        cerrarModalNoMantPdf={cerrarModalNoMantPdf}
        loadingNoMantPdf={loadingNoMantPdf}
        noMantError={noMantError}
        noMantPdfUrl={noMantPdfUrl}
        noMantPdfRawUrl={noMantPdfRawUrl}
        descargarNoMantPdf={descargarNoMantPdf}
        downloadingNoMantPdf={downloadingNoMantPdf}
        onPreviewPdfAntesFirma={generarVistaPreviaPdfAntesFirma}
      />
      <Modal
        visible={!!showMantPreview}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          if (finishingOrder) return;
          setShowMantPreview(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 720, height: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Reporte de mantenimiento (vista previa)
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (finishingOrder) return;
                  setShowMantPreview(false);
                }}
                style={[
                  styles.modalCloseBtn,
                  finishingOrder && { opacity: 0.7 },
                ]}
                disabled={!!finishingOrder}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, padding: 10 }}>
              {!mantHtmlPreview ? (
                <View style={{ alignItems: "center", marginTop: 20 }}>
                  <ActivityIndicator size="large" color={FIORI.brand} />
                  <Text style={{ marginTop: 10, color: FIORI.textMuted }}>
                    Generando vista previa…
                  </Text>
                </View>
              ) : (
                <WebView
                  originWhitelist={["*"]}
                  source={{ html: mantHtmlPreview }}
                  style={{ flex: 1 }}
                />
              )}
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={abrirPdfMantenimiento}
                disabled={!!finishingOrder}
              >
                <Text style={styles.smallBtnText}>Abrir PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  { backgroundColor: "#0B8457" },
                  finishingOrder && { opacity: 0.7 },
                ]}
                onPress={continuarFinalizacionDespuesPreview}
                disabled={!!finishingOrder}
              >
                {finishingOrder ? (
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                    Finalizando…
                  </Text>
                ) : (
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                    Continuar
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={savingPending0400}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.blockBackdrop}>
          <View style={styles.blockCard}>
            <ActivityIndicator size="large" color={FIORI.brand} />
            <Text style={styles.blockTitle}>Guardando pendiente de firma…</Text>
            <Text style={styles.blockSub}>
              No cierres la pantalla ni toques botones.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ====================== Estilos ====================== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },
  content: { padding: 16, paddingBottom: 28 },

  headerBox: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    ...elev(0.4),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  titulo: { fontSize: 18, fontWeight: "800", color: FIORI.text },

  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  statusBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  noMantBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    backgroundColor: FIORI.surfaceAlt,
    marginBottom: 12,
    ...elev(0.3),
  },
  noMantTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: FIORI.text,
    marginBottom: 4,
  },
  noMantText: { fontSize: 12, color: FIORI.textMuted },
  btnNoMantBanner: {
    marginLeft: 10,
    backgroundColor: FIORI.brand,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  btnNoMantBannerText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  panel: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    marginBottom: 12,
    ...elev(0.4),
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: FIORI.text,
    marginBottom: 8,
  },

  row: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: FIORI.borderSoft,
  },
  rowLabel: { fontSize: 13, color: FIORI.textMuted, marginBottom: 2 },
  rowValue: { fontSize: 14, color: FIORI.text, fontWeight: "600" },

  btnSeeMaterials: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: FIORI.brand,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnSeeMaterialsText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  labelInline: { fontWeight: "700", color: FIORI.text },
  value: { color: FIORI.text, marginBottom: 4 },

  sectionKicker: {
    fontSize: 13,
    color: FIORI.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  grupoCard: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 12,
    ...elev(0.4),
  },
  grupoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  grupoTitle: { fontSize: 14, fontWeight: "900", color: FIORI.text },

  operCardSmall: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    padding: 10,
  },
  badgeSmall: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeSmallText: { fontSize: 11, fontWeight: "900", color: FIORI.text },
  operTitleSmall: { fontSize: 13, fontWeight: "900", color: FIORI.text },
  operDescSmall: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },

  error: { marginTop: 40, textAlign: "center", fontSize: 16, color: FIORI.err },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 80,
    backgroundColor: FIORI.warn,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...elev(0.8),
  },
  fabLabel: { color: "#000000ff", fontWeight: "800", fontSize: 13 },

  topActionBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  startOrderBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: FIORI.brand,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...elev(0.6),
  },
  startOrderBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  timerPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: FIORI.surface,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...elev(0.3),
  },
  timerText: {
    color: FIORI.text,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.3,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: FIORI.brand,
  },
  modalTitle: { fontSize: 14, fontWeight: "900", color: "#fff", flex: 1 },
  modalCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  compRow: {
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    backgroundColor: FIORI.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  compTitle: { fontWeight: "900", color: FIORI.text, marginBottom: 4 },
  compSub: { color: FIORI.textMuted, fontWeight: "700", marginBottom: 6 },
  compMeta: { color: FIORI.textMuted, fontSize: 12 },
  modalFooterRow: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E8EEF7",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
  },
  smallBtnText: { fontWeight: "900", color: FIORI.text, fontSize: 13 },

  blockBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  blockCard: {
    width: "92%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  blockTitle: { marginTop: 10, fontWeight: "900", color: FIORI.text },
  blockSub: {
    marginTop: 6,
    color: FIORI.textMuted,
    textAlign: "center",
    fontSize: 12,
  },
});
////////////////////////////////

/*
function elev(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 8 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });
}

*/
function elev(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 8 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });
}

//////////////////////////////////////////////////