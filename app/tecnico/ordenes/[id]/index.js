// app/ordenes/[id]/index.js
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
import { useLocalSearchParams, router } from "expo-router";

import {
  loadOrdenTecnicoDetail,
  saveOrdenTecnicoDetail,
  shouldCacheDetailByOrder,
} from "../../../../src/offline/ordenesTecnicoCache";

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

// ✅ Cola offline SAP
import { processSapQueue, upsertSapQueueItem } from "../../../../src/offline/sapQueue";

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

// ✅ NUEVO: tiempo transcurrido congelable (para 0400)
const ORDER_ELAPSED_KEY = (orderId) => `orderElapsed:${orderId}`;

/* ====================== ✅ Pendiente de firma (persistir checks) ====================== */
const PENDING_SIGN_KEY = (orderId) => `pendingSign:${orderId}`;

/* ===== Estado local de operaciones (SIN BD) ===== */
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

// ✅ NUEVO: elapsed persistente
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
    return raw ? JSON.parse(raw) : null; // { checkedMap, savedAt, confirmationsSent?, confirmationsFinishMs? }
  } catch {
    return null;
  }
}
async function savePendingSign(orderId, payload) {
  try {
    await AsyncStorage.setItem(PENDING_SIGN_KEY(orderId), JSON.stringify(payload));
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
    await AsyncStorage.setItem(OPSTATE_KEY(orderId), JSON.stringify(state || {}));
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

const opKey = (orderId, op) =>
  `${orderId}-${op.activity || op.Activity || ""}${
    op.subactivity || op.SubActivity ? `-${op.subactivity || op.SubActivity}` : ""
  }`;

/* ====== SAP helpers para fechas/horas y prorrateo (FINAL 0300 + CONFIRMATIONS) ====== */
function msToMinutesRounded(ms) {
  const min = Math.round(ms / 60000);
  return Math.max(1, min);
}
function sapDateFromMs(ms) {
  const d = new Date(ms);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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

/* ======================
   ✅ NUEVO: Materiales/Consumibles → ConfirmationMaterialSet
   - Se manda a SAP dentro del MISMO payload de confirmaciones
   - NO mandamos Almacen (te dijeron que ya no)
====================== */
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalizeConsumiblesToMaterialSet(consumiblesRows, plantFallback) {
  const rows = Array.isArray(consumiblesRows) ? consumiblesRows : [];

  const out = [];
  for (const r of rows) {
    // soporta variantes de nombres de campos
    const Material = String(
      r?.Material ?? r?.material ?? r?.codigo ?? r?.Codigo ?? r?.matnr ?? ""
    ).trim();

    const CantidadRaw = r?.Cantidad ?? r?.cantidad ?? r?.qty ?? r?.Qty ?? r?.quantity ?? "0";
    const Unidad = String(r?.Unidad ?? r?.unidad ?? r?.uom ?? r?.Uom ?? "").trim();
    const Centro = "TLP1";

    const qtyNum = toNum(CantidadRaw);
    const qtyOk = qtyNum != null ? qtyNum > 0 : String(CantidadRaw || "").trim() !== "" && String(CantidadRaw) !== "0";

    if (!Material) continue;
    if (!qtyOk) continue;
    if (!Unidad) continue;
    if (!Centro) continue;

    out.push({
      Material,
      Cantidad: String(CantidadRaw),
      Unidad,
      Centro,
      // ✅ NO Almacen
    });
  }

  return out;
}

/* ======================
   ✅ NUEVO: construir payload de confirmaciones desde ops seleccionadas
   (sirve para 0400 y 0300 si necesitas)
====================== */
function buildConfirmationPayloadFromSelectedOps({
  orderId,
  opsAll,
  selectedIds,
  startMs,
  finishMs,
  consumiblesRows,
  plantFallback,
}) {
  const selectedOpsRaw = (selectedIds || [])
    .map((idKey) => (opsAll || []).find((op) => String(op.id) === String(idKey)))
    .filter(Boolean);

  // dedupe por Activity/SubActivity
  const uniqByOp = (ops) => {
    const map = new Map();
    for (const op of ops) {
      const act = String(op.activity || op.Activity || "").trim();
      const sub = String(op.subactivity || op.SubActivity || "").trim();
      const key = `${act}__${sub}`;
      if (!map.has(key)) map.set(key, op);
    }
    return Array.from(map.values());
  };

  const selectedOps = uniqByOp(selectedOpsRaw);
  if (!selectedOps.length) return null;

  if (!Number.isFinite(startMs) || !Number.isFinite(finishMs) || finishMs <= startMs) return null;

  const totalMs = Math.max(0, finishMs - startMs);
  const totalMin = msToMinutesRounded(totalMs);

  const minsArr = prorateMinutes(totalMin, selectedOps.length);
  const windows = buildSequentialWindows(startMs, minsArr);

  const ConfirmationMaterialSet = normalizeConsumiblesToMaterialSet(consumiblesRows, plantFallback);

  return {
    Order: "S1",
    ConfirmationOrderSet: selectedOps.map((op, idx) => {
      const actRaw = String(op.activity || op.Activity || "").trim();
      const subRaw = String(op.subactivity || op.SubActivity || "").trim();

      const Operation = actRaw.padStart(4, "0");
      const SubActivity = subRaw ? subRaw.padStart(4, "0") : "";

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

      if (SubActivity) row.SubActivity = SubActivity;
      return row;
    }),
    // ✅ AQUÍ VAN LOS CONSUMIBLES
    ConfirmationMaterialSet,
    Return: [],
  };
}

/* ====================== ✅ Dirección igual que rutas-asignadas ====================== */
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
function pickSecondAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results.length >= 2 ? results[1] : results[0];
}

function mergeOpsWithLocalState(orderId, ops, state) {
  return (ops || []).map((o) => {
    const id = o.id || opKey(orderId, o);
    const st = state?.[id] || {};

    const sapEstatus = (o.estatus || "pendiente").toLowerCase();
    const estatusFinal =
      sapEstatus === "finalizada" ? "finalizada" : st.estatus || sapEstatus || "pendiente";

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

    const posibleFull = full || direccion || value.fullAddress || value.addressString;
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
    const SubActivity = op.SubActivity || op.subactivity || op.Uvorn || "";
    const Description = op.Description || op.description || op.Ltxa1 || "";
    const StandardTextKey = op.StandardTextKey || op.standardTextKey || "";

    return {
      ...op,
      activity: String(Activity || ""),
      subactivity: String(SubActivity || ""),
      description: String(Description || ""),
      Activity: String(Activity || ""),
      SubActivity: String(SubActivity || ""),
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

/* ======================
   ✅ Detectar cobertura desde ShortText (COBERTURABASICA/MEDIA/SEMI)
   Ej: "0040000034000010COBERTURASEMI"
====================== */
function detectCoberturaFromShortText(shortText) {
  const s = String(shortText || "").toUpperCase();
  const idx = s.indexOf("COBERTURA");
  if (idx < 0) return null;

  const tail = s.slice(idx); // "COBERTURASEMI..."
  if (tail.includes("COBERTURABASICA")) return "BASICA";
  if (tail.includes("COBERTURAMEDIA")) return "MEDIA";
  if (tail.includes("COBERTURASEMI")) return "SEMI";
  return null;
}

/* ======================
   ✅ ESTATUS: detectar 0200 vs 0400 + armar payload 0300
====================== */
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
  const all = Array.from(new Set([...(codes || []), ...(apiCode ? [apiCode] : [])]));
  if (all.includes("0400")) return "0400";
  if (all.includes("0200")) return "0200";
  return apiCode || (codes[0] || "");
}

function buildStatus0300Payload({ orderId, email, currentCode }) {
  const remove = currentCode === "0400" ? "0400" : "0200";
  return {
    OrderId: orderId,
    WorkOrderHeader: {
      Orderid: orderId,
      FunctLoc: email, // ✅ correo del cliente
    },
    WorkOrderUserStatusSet: [
      { UserStText: "0300", Langu: "ES", Inactive: "" },
      { UserStText: remove, Langu: "ES", Inactive: "X" },
    ],
    Return: [],
  };
}

/* ====================== Logs (no revienta consola con base64) ====================== */
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
    if (att?.Base64) att.Base64 = `<<base64 omitted: ${String(att.Base64).length} chars>>`;
    console.log(label);
    console.log(JSON.stringify(cloned, null, 2));
  } catch {
    console.log(label, payload);
  }
}

/* ====================== Email ====================== */
function isValidEmail(email) {
  const s = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* ====================== Componente ====================== */
export default function DetalleOrden() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth(); // api mete Bearer por interceptor

  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);

  const [soundObj, setSoundObj] = useState(null);

  const signatureRef = useRef(null);
  const wasOnlineRef = useRef(false);

  // ✅ modo finalizar (checkboxes en operaciones)
  const [finalizeMode, setFinalizeMode] = useState(false);
  const [checkedMap, setCheckedMap] = useState({});

  // ✅ correo cliente para estatus 0300
  const [clienteEmail, setClienteEmail] = useState("");

  // ✅ nombre/cargo/aviso cliente (para PDF y registro)
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCargo, setClienteCargo] = useState("");
  const [avisoCliente, setAvisoCliente] = useState("");

  // ✅ descripción breve del técnico (para PDF)
  const [notaTecnico, setNotaTecnico] = useState("");

  // ✅ Consumibles / cobertura
  const [consumibles, setConsumibles] = useState([]);

  // ===== iniciar orden + contador (SOLO LOCAL) =====
  const [startingOrder, setStartingOrder] = useState(false);
  const [orderStartedAtMs, setOrderStartedAtMs] = useState(null);
  const [orderFinishedAtMs, setOrderFinishedAtMs] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // ✅ NUEVO: elapsed congelado (para 0400 / final)
  const [orderElapsedMs, setOrderElapsedMs] = useState(null);

  // ===== ✅ PREVIEW MANTENIMIENTO (ANTES DE ENVIAR) =====
  const [showMantPreview, setShowMantPreview] = useState(false);
  const [mantHtmlPreview, setMantHtmlPreview] = useState(null);
  const [mantPdfUri, setMantPdfUri] = useState(null);

  // Guardamos todo lo necesario para “Continuar” después del preview
  const [pendingFinalize, setPendingFinalize] = useState(null);

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

  // 🔁 Procesar cola SAP cuando regresa el internet
  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (state) => {
      const online = !!(state?.isConnected && state?.isInternetReachable !== false);

      if (online && !wasOnlineRef.current) {
        wasOnlineRef.current = true;
        try {
          console.log("📡 Conexión restaurada, procesando cola SAP…");
          await processSapQueue();
        } catch (e) {
          console.warn("Error procesando cola SAP:", e?.message || e);
        }
      }

      if (!online) wasOnlineRef.current = false;
    });

    return () => unsub();
  }, []);

  // modal materiales por operación (SOLO VIEW)
  const [showCompModal, setShowCompModal] = useState(false);
  const [selectedOp, setSelectedOp] = useState(null);
  const [compList, setCompList] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(false);

  // modal materiales orden
  const [showAllMaterialsModal, setShowAllMaterialsModal] = useState(false);

  // modal PDF no mantenimiento
  const [showNoMantPdfModal, setShowNoMantPdfModal] = useState(false);
  const [noMantPdfUrl, setNoMantPdfUrl] = useState(null);
  const [noMantPdfRawUrl, setNoMantPdfRawUrl] = useState(null);
  const [loadingNoMantPdf, setLoadingNoMantPdf] = useState(false);
  const [noMantError, setNoMantError] = useState(null);
  const [downloadingNoMantPdf, setDownloadingNoMantPdf] = useState(false);

  // finalizar orden (firma) -> modal de firma
  const [finishingOrder, setFinishingOrder] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [savingPending0400, setSavingPending0400] = useState(false);

  // ===== estatus orden / bloqueo =====
  const statusCode = String(orden?.estatus_code || orden?.userstatus || "").trim();
  const statusTipo = String(orden?.estatus_tipo || "").toUpperCase();
  const isNoMant = statusTipo === "NO_MANTENIMIENTO";
  const isOrderSinEmpezar = !statusCode;
  const isOrderPendiente0100 = statusCode === "0100";

  // 🔴 0400 NO es "finalizada real", es PENDIENTE DE FIRMA
  const isOrderFinishedReal = !!orden?.isFinal || ["0300", "0500"].includes(statusCode);
  const isPending0400 = statusCode === "0400" || String(statusCode).includes("0400");

  const estatusTxt = String(orden?.estatus_label || orden?.estatus || orden?.status || "")
    .trim()
    .toUpperCase();

  const isOrderEnProceso =
    estatusTxt === "EN_PROCESO" || estatusTxt === "EN PROCESO" || statusCode === "0200";

  useEffect(() => {
    if (!orderStartedAtMs) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [orderStartedAtMs]);

  const checkinDone =
    !!orden?.checkin_done || !!orden?.checkin || !!orden?.checked_in || statusCode === "0200";

  // ✅ Operaciones bloqueadas si:
  const isOpsLocked =
    isNoMant || isOrderSinEmpezar || isOrderPendiente0100 || isOrderFinishedReal || !checkinDone;

  const canStartTimer = isOrderEnProceso && !isNoMant && !isOrderFinishedReal && !!checkinDone;

  // ✅ cobertura detectada ya con la orden cargada
  const coberturaTipo = String(orden?.cobertura_tipo || "").trim().toUpperCase();

  // ✅ NUEVO: visibilidad del timer
  const showRunningTimer = isOrderEnProceso && !!orderStartedAtMs;
  const showFrozenTimer = isPending0400 && orderElapsedMs != null;

  /* ====================== Helpers Offline (UI + cache + opstate + queue) ====================== */
  const safeSaveDetailIfWindow = async (orderId, detailObj) => {
    if (!detailObj) return;
    const ok = shouldCacheDetailByOrder(detailObj, new Date());
    if (!ok) return;
    await saveOrdenTecnicoDetail(orderId, detailObj);
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
      await safeSaveDetailIfWindow(orderId, { ...(base || {}), operaciones: ops2 });
    } catch {}
  };

  const updateLocalOrderAsFinalizada0300 = async (orderId, finishMs) => {
    // ✅ guardar finish
    await saveOrderFinish(orderId, finishMs);
    setOrderFinishedAtMs(finishMs);

    // ✅ guardar elapsed final (si hay start)
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
        estatus_label: "FINALIZADA",
        isFinal: true,
      });
    } catch {}
  };

  const enqueueSap = async ({ type, orderId, endpoint, payload, dedupeKey, method }) => {
    if (typeof upsertSapQueueItem !== "function") {
      throw new Error(
        "upsertSapQueueItem no existe en src/offline/sapQueue.js. Asegúrate de exportarla."
      );
    }

    await upsertSapQueueItem({
      type,
      orderId,
      endpoint,
      payload,
      method: method || "POST",
      dedupeKey, // ✅ IMPORTANTE
    });
  };

  const obtenerOrden = async () => {
    const orderIdParam = String(id || "").trim();

    try {
      setLoading(true);

      // 1) cache si existe
      const cached = await loadOrdenTecnicoDetail(orderIdParam);
      if (cached?.data) {
        setOrden(cached.data);

        const cachedOrderId = String(cached?.data?.Orderid || orderIdParam).trim();

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
        if (pendingCached?.checkedMap) setCheckedMap(pendingCached.checkedMap);

        // intenta precargar email guardado en cache
        const emailCached = String(cached?.data?.cliente_email || "").trim();
        if (emailCached) setClienteEmail(emailCached);

        // si en cache ya traes nombre/cargo/aviso (opcional)
        const cn = String(cached?.data?.cliente_nombre || "").trim();
        const cc = String(cached?.data?.cliente_cargo || "").trim();
        const av = String(cached?.data?.aviso_cliente || "").trim();
        if (cn) setClienteNombre(cn);
        if (cc) setClienteCargo(cc);
        if (av) setAvisoCliente(av);
      }

      const net = await NetInfo.fetch();
      const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);

      if (!isOnline) {
        if (!cached?.data) {
          Alert.alert(
            "Sin conexión",
            "No hay internet y no hay detalle guardado aún para esta orden."
          );
        }
        return;
      }

      // 2) Online: trae detalle base
      const resOrden = await api.get(`/api/ordenes/sap/${orderIdParam}`);
      const baseOrden = resOrden.data || {};

      // ✅ traer ShortText real desde WorkOrderHeaderSet (OData) para detectar COBERTURA
      let shortTextHeader = "";
      try {
        const resHeader = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdParam}')`
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
          e?.response?.data || e?.message || e
        );
      }

      // ✅ Detectar cobertura desde ShortText (primero OData, luego el baseOrden si lo trae)
      const shortTextForCoverage =
        shortTextHeader ||
        baseOrden?.ShortText ||
        baseOrden?.shorttext ||
        baseOrden?.Shorttext ||
        baseOrden?.shortText ||
        "";

      const coberturaDetectada = detectCoberturaFromShortText(shortTextForCoverage);

      // 3) addresses
      let direccionSap = "";
      let clienteSap = "";
      try {
        const resAddr = await api.get(`/api/ordenes/sap/${orderIdParam}/addresses`);
        const results = resAddr?.data?.results || resAddr?.data?.d?.results || [];
        const chosen = pickSecondAddress(results);
        const mapped = mapDireccionLikeBackend(chosen);
        direccionSap = mapped.direccion || "";
        clienteSap = mapped.cliente || "";
      } catch (e) {
        console.warn("[ADDR] no se pudo cargar /addresses:", e?.response?.data || e?.message || e);
      }

      // 4) operaciones
      let ops = [];
      try {
        const resOps = await api.get(`/api/operaciones/sap/${String(orderIdParam)}`);

        const rawOps =
          resOps?.data?.d?.results ||
          resOps?.data?.results ||
          resOps?.data?.operaciones ||
          resOps?.data ||
          [];

        ops = normalizeOpsFromBackend(rawOps);
      } catch (e) {
        console.warn("No se pudieron cargar operaciones:", e?.response?.data || e);
        ops = normalizeOpsFromBackend(baseOrden?.operaciones || []);
      }

      const orderIdReal = String(baseOrden?.Orderid || baseOrden?.OrderId || orderIdParam).trim();
      const opsWithId = ops.map((o) => ({ ...o, id: o.id || opKey(orderIdReal, o) }));

      const localState = await loadOpState(orderIdReal);
      const opsMerged = mergeOpsWithLocalState(orderIdReal, opsWithId, localState);

      // 5) email partners
      let emailFromPartners = "";
      try {
        const resPartners = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdParam}')/ToPartners`
        );

        const results =
          resPartners?.data?.d?.results ||
          resPartners?.data?.results ||
          resPartners?.data?.d?.ToPartners?.results ||
          [];

        const re = (results || []).find((p) => String(p?.PartnRoleOld || "").trim() === "RE");
        emailFromPartners = String(re?.Mail1 || re?.Mail2 || "").trim();
      } catch (e) {
        console.warn("[MAIL] no se pudo cargar ToPartners:", e?.response?.data || e?.message || e);
      }

      const data = {
        ...baseOrden,

        // ✅ Guardar ShortText real y cobertura detectada
        ShortText: shortTextForCoverage || baseOrden?.ShortText || "",
        cobertura_tipo: coberturaDetectada || baseOrden?.cobertura_tipo || null,

        direccion:
          direccionSap ||
          baseOrden?.direccion ||
          baseOrden?.address ||
          baseOrden?.partner_address ||
          "",
        cliente:
          clienteSap ||
          baseOrden?.cliente ||
          `${baseOrden?.Name1 ?? ""} ${baseOrden?.Name2 ?? ""}`.trim(),
        cliente_email: emailFromPartners || baseOrden?.cliente_email || "",
        operaciones: opsMerged,

        // (opcional, si quieres persistir después en cache)
        cliente_nombre: String(clienteNombre || "").trim(),
        cliente_cargo: String(clienteCargo || "").trim(),
        aviso_cliente: String(avisoCliente || "").trim(),
      };

      setOrden(data);

      // ✅ prefill email si viene de partners
      if (emailFromPartners && !String(clienteEmail || "").trim()) {
        setClienteEmail(emailFromPartners);
      }

      await safeSaveDetailIfWindow(orderIdReal, data);

      // migrar keys si cambia id
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

      // restaurar checks si 0400
      try {
        const sc = String(data?.estatus_code || data?.userstatus || "").trim();
        const isPending0400Local2 = sc.includes("0400");

        const pending = await loadPendingSign(orderIdReal);
        if (pending?.checkedMap) {
          setCheckedMap(pending.checkedMap || {});
          if (isPending0400Local2) setFinalizeMode(true);
        }
      } catch {}

      // timer auto
      const estatusTxtLocal = String(data?.estatus_label || data?.estatus || data?.status || "")
        .trim()
        .toUpperCase();
      const statusCodeLocal = String(data?.estatus_code || data?.userstatus || "").trim();

      const isEnProcesoLocal =
        estatusTxtLocal === "EN_PROCESO" ||
        estatusTxtLocal === "EN PROCESO" ||
        statusCodeLocal === "0200";

      const isPending0400Local =
        statusCodeLocal === "0400" || String(statusCodeLocal).includes("0400");
      const isFinalLocal = ["0300", "0500"].includes(statusCodeLocal) || !!data?.isFinal;

      if (isEnProcesoLocal) {
        const savedStart = await loadOrderStart(orderIdReal);
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }
      } else if (isPending0400Local) {
        // ✅ 0400: NO borrar start; el timer se muestra congelado con elapsed
        const savedStart = await loadOrderStart(orderIdReal);
        if (savedStart) setOrderStartedAtMs(savedStart);

        const savedElapsed = await loadOrderElapsed(orderIdReal);
        if (savedElapsed != null) setOrderElapsedMs(savedElapsed);
      } else {
        // ✅ otros estados sí limpian start
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
      console.error("Error al obtener orden (SAP):", error?.response?.data || error);

      const orderIdParam2 = String(id || "").trim();
      const cached2 = await loadOrdenTecnicoDetail(orderIdParam2);
      if (cached2?.data) {
        setOrden(cached2.data);

        const cachedOrderId = String(cached2?.data?.Orderid || orderIdParam2).trim();
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
        if (pending?.checkedMap) setCheckedMap(pending.checkedMap);

        const emailCached = String(cached2?.data?.cliente_email || "").trim();
        if (emailCached) setClienteEmail(emailCached);
      } else {
        Alert.alert("Error", "No se pudo cargar la orden desde SAP");
      }
    } finally {
      setLoading(false);
    }
  };

  const openComponentsModal = async (op) => {
    try {
      setSelectedOp(op);
      setCompList([]);
      setShowCompModal(true);
      setLoadingComponents(true);

      const Orderid = orden?.Orderid || id;
      const Activity = op.activity || op.Activity;

      const res = await api.get(
        `/api/operaciones/ordenes/${Orderid}/operaciones/${Activity}/componentes`
      );

      setCompList(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error al obtener componentes:", error?.response?.data || error);
      Alert.alert("Materiales", "No se pudieron obtener los materiales de esta operación.");
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
        const { sound } = await Audio.Sound.createAsync(require("../../../../assets/alert.mp3"));
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
    router.push({ pathname: "/tecnico/ordenes/[id]/aviso-averia", params: { id: orderid } });
  };

  const iniciarOrden = async () => {
    if (!orden?.Orderid) return;

    const estatusTxtNow = String(orden?.estatus_label || orden?.estatus || orden?.status || "")
      .trim()
      .toUpperCase();

    const puedeIniciarPorEstatus =
      estatusTxtNow === "EN_PROCESO" || estatusTxtNow === "EN PROCESO" || statusCode === "0200";

    if (!puedeIniciarPorEstatus) {
      Alert.alert(
        "No disponible",
        'El cronómetro solo se puede iniciar cuando la orden está en "EN_PROCESO" (o código 0200).'
      );
      return;
    }

    if (!checkinDone) {
      Alert.alert("Check-in requerido", "Primero debes hacer Check-in para iniciar el cronómetro.");
      return;
    }

    if (isNoMant || isOrderFinishedReal) {
      Alert.alert("No disponible", "La orden no permite iniciar cronómetro en este estado.");
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

            // ✅ reiniciar elapsed para nueva corrida
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
      const res = await api.get(`/evidencias/orden/${orden.Orderid}/no-mantenimiento-pdf`);

      const { pdf_url } = res.data || {};
      if (!pdf_url) throw new Error("Sin URL de PDF desde backend");

      const apiBase = api.defaults.baseURL || "";
      const serverRoot = apiBase.replace(/\/api\/?$/, "");

      const rawUrl = pdf_url.startsWith("http") ? pdf_url : `${serverRoot}${pdf_url}`;
      setNoMantPdfRawUrl(rawUrl);

      const viewerUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(rawUrl)}`;
      setNoMantPdfUrl(viewerUrl);
    } catch (error) {
      console.error("Error al obtener PDF no mantto:", error?.response?.data || error);
      setNoMantError("No se pudo cargar el PDF de la carta de no mantenimiento.");
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
      Alert.alert("Sin archivo", "No se encontró la URL del PDF para descargar.");
      return;
    }

    try {
      setDownloadingNoMantPdf(true);

      const filename =
        noMantPdfRawUrl.split("/").pop() || `carta-no-mantto_${orden?.Orderid || ""}.pdf`;
      const localUri = FileSystem.documentDirectory + filename;

      const { uri } = await FileSystem.downloadAsync(noMantPdfRawUrl, localUri);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Descarga completa", "El PDF se guardó en la carpeta de documentos de la app.");
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Compartir / guardar carta de no mantenimiento",
      });
    } catch (e) {
      console.error("Error al descargar PDF:", e);
      Alert.alert("Error", "No se pudo descargar el PDF. Verifica acceso a la URL del servidor.");
    } finally {
      setDownloadingNoMantPdf(false);
    }
  };

  // ✅ Finalizar orden: solo activa finalizeMode
  const handleFinalizarOrden = (e) => {
    e?.stopPropagation?.();

    const orderid = String(orden?.Orderid ?? id ?? "").trim();
    if (!orderid) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    setFinalizeMode(true);
  };

  // ✅ Guardar checks como pendiente de firma (0400) + ✅ CONFIRMACIONES + ✅ CONSUMIBLES
  const guardarPendienteDeFirma = async () => {
    const orderId = String(orden?.Orderid || id || "").trim();
    if (!orderId) return;

    const selectedIds = Object.keys(checkedMap || {});
    if (!selectedIds.length) {
      Alert.alert("Sin selección", "Marca al menos una operación realizada antes de guardar.");
      return;
    }

    // Para confirmaciones necesitas cronómetro
    if (!orderStartedAtMs) {
      Alert.alert(
        "Sin cronómetro",
        "No se detectó el inicio del cronómetro. Inicia la orden para poder prorratear y mandar operaciones."
      );
      return;
    }

    try {
      setSavingPending0400(true);

      const finishMs = Date.now();

      // ✅ Congelar tiempo al pasar a 0400 (para poder visualizarlo después)
      if (orderStartedAtMs) {
        const elapsed = Math.max(0, finishMs - orderStartedAtMs);
        await saveOrderElapsed(orderId, elapsed);
        setOrderElapsedMs(elapsed);
      }

      // ✅ Estatus 0400 (quita 0200)
      const payload0400 = {
        OrderId: orderId,
        WorkOrderHeader: { Orderid: orderId },
        WorkOrderUserStatusSet: [
          { UserStText: "0400", Langu: "ES", Inactive: "" },
          { UserStText: "0200", Langu: "ES", Inactive: "X" },
        ],
        Return: [],
      };

      // ✅ Confirmaciones (operaciones) + ✅ ConfirmationMaterialSet (consumibles)
      const opsAll = Array.isArray(orden?.operaciones) ? orden.operaciones : [];
      const plantFallback = String(orden?.Plant || orden?.plant || orden?.centro || "").trim();

      const confirmationPayload0400 = buildConfirmationPayloadFromSelectedOps({
        orderId,
        opsAll,
        selectedIds,
        startMs: orderStartedAtMs,
        finishMs,
        consumiblesRows: consumibles, // ✅ usa lo seleccionado en UI
        plantFallback,
      });

      if (!confirmationPayload0400) {
        Alert.alert("Error", "No se pudo armar el payload de confirmaciones de operaciones.");
        return;
      }

      // ✅ si NO hay consumibles, igual mandamos confirmaciones (SAP lo acepta)
      // si SÍ hay, se manda ConfirmationMaterialSet dentro del payload

      // ✅ Guardar pendingSign con bandera para NO duplicar confirmaciones después
      await savePendingSign(orderId, {
        checkedMap,
        savedAt: Date.now(),
        confirmationsSent: true, // ✅ anti-duplicado
        confirmationsFinishMs: finishMs,
      });

      const net = await NetInfo.fetch();
      const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);

      if (!isOnline) {
        // 1) Encolar estatus 0400
        await enqueueSap({
          type: "STATUS",
          orderId,
          endpoint: "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
          payload: payload0400,
          dedupeKey: `STATUS:${orderId}`,
        });

        // 2) Encolar confirmaciones + consumibles (dedupe para no repetir)
        await enqueueSap({
          type: "CONFIRMATIONS",
          orderId,
          endpoint: "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
          payload: confirmationPayload0400,
          dedupeKey: `CONFIRMATIONS:${orderId}:0400`,
        });

        setOrden((prev) => ({
          ...(prev || {}),
          estatus_code: "0400",
          userstatus: "0400",
          estatus_label: prev?.estatus_label || "PENDIENTE DE FIRMA",
        }));

        try {
          const cached = await loadOrdenTecnicoDetail(orderId);
          const base = cached?.data || orden || {};
          await safeSaveDetailIfWindow(orderId, {
            ...(base || {}),
            estatus_code: "0400",
            userstatus: "0400",
            estatus_label: base?.estatus_label || "PENDIENTE DE FIRMA",
          });
        } catch {}

        Alert.alert(
          "Guardado (sin internet)",
          "Se guardó 0400 y se encolaron confirmaciones + consumibles. Cuando vuelva el internet se enviará todo."
        );

        setFinalizeMode(false);
        return;
      }

      // ===== ONLINE =====
      // 1) Enviar estatus 0400
      await api.post(`/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet`, payload0400);

      // 2) Enviar confirmaciones + consumibles
      await api.post(
        `/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet`,
        confirmationPayload0400
      );

      setOrden((prev) => ({
        ...(prev || {}),
        estatus_code: "0400",
        userstatus: "0400",
        estatus_label: prev?.estatus_label || "PENDIENTE DE FIRMA",
      }));

      Alert.alert("Listo", "Se guardó 0400 y se enviaron confirmaciones + consumibles.");
      setFinalizeMode(false);
    } catch (e) {
      console.error("Error guardando pendiente de firma:", e?.response?.data || e);
      Alert.alert("Error", "No se pudo guardar como pendiente de firma.");
    } finally {
      setSavingPending0400(false);
    }
  };

  // ✅ Abrir firma cliente (y guardar progreso antes)
  const abrirFirmaCliente = async () => {
    const orderId = String(orden?.Orderid || id || "").trim();
    if (!orderId) return;

    const selectedIds = Object.keys(checkedMap || {});
    if (!selectedIds.length) {
      Alert.alert("Sin selección", "Marca al menos una operación realizada antes de solicitar firma.");
      return;
    }

    // ✅ Congelar elapsed también cuando vas a firmar (por si cambia el estatus / UI)
    if (orderStartedAtMs) {
      const elapsed = Math.max(0, Date.now() - orderStartedAtMs);
      await saveOrderElapsed(orderId, elapsed);
      setOrderElapsedMs(elapsed);
    }

    // OJO: aquí NO marcamos confirmationsSent; esto es solo “guardar progreso”
    await savePendingSign(orderId, { checkedMap, savedAt: Date.now() });
      setShowSignModal(true);
    };

  // ✅ PASO 1: Preparar finalización + generar preview (NO ENVÍA AÚN)
  const confirmarFinalizarConFirma = async () => {
    if (!orden?.Orderid) return;

    const orderId = String(orden.Orderid).trim();

    const email = String(clienteEmail || "").trim();
    if (!email) {
      Alert.alert("Falta correo", "Escribe el correo del cliente (obligatorio).");
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert("Correo inválido", "Escribe un correo válido (ej: nombre@dominio.com).");
      return;
    }

    if (!String(clienteNombre || "").trim()) {
      Alert.alert("Falta nombre", "Escribe el nombre del cliente (obligatorio).");
      return;
    }
    if (!String(clienteCargo || "").trim()) {
      Alert.alert("Falta cargo", "Escribe el cargo del cliente (obligatorio).");
      return;
    }

    if (!signatureData) {
      Alert.alert("Falta firma", 'Pida al cliente que firme y toque "Listo" dentro del recuadro.');
      return;
    }

    const selectedIds = Object.keys(checkedMap || {});
    if (!selectedIds.length) {
      Alert.alert("Sin selección", "Marca al menos una operación realizada antes de finalizar.");
      return;
    }

    if (!orderStartedAtMs) {
      Alert.alert(
        "Sin cronómetro",
        "No se detectó el inicio del cronómetro. Inicia la orden para poder prorratear tiempos."
      );
      return;
    }

    try {
      setSavingSignature(true);

      const finishMs = Date.now();

      // ✅ guardar elapsed “final” para visualización local (por si se va a 0400/preview)
      const elapsedNow = Math.max(0, finishMs - orderStartedAtMs);
      await saveOrderElapsed(orderId, elapsedNow);
      setOrderElapsedMs(elapsedNow);

      const totalMs = elapsedNow;
      const totalMin = msToMinutesRounded(totalMs);

      const opsAll = Array.isArray(orden?.operaciones) ? orden.operaciones : [];

      const selectedOpsRaw = selectedIds
        .map((idKey) => opsAll.find((op) => String(op.id) === String(idKey)))
        .filter(Boolean);

      // dedupe por Activity/SubActivity
      const uniqByOp = (ops) => {
        const map = new Map();
        for (const op of ops) {
          const act = String(op.activity || op.Activity || "").trim();
          const sub = String(op.subactivity || op.SubActivity || "").trim();
          const key = `${act}__${sub}`;
          if (!map.has(key)) map.set(key, op);
        }
        return Array.from(map.values());
      };

      const selectedOps = uniqByOp(selectedOpsRaw);
      if (!selectedOps.length) {
        Alert.alert("Error", "No se encontraron las operaciones seleccionadas en la orden.");
        return;
      }

      const n = selectedOps.length;
      const minsArr = prorateMinutes(totalMin, n);
      const windows = buildSequentialWindows(orderStartedAtMs, minsArr);

      // ✅ Base status 0300 (quita 0200 o 0400 según orden)
      const currentCode = pickCurrentStatusCode(orden);
      const statusPayload0300 = buildStatus0300Payload({
        orderId,
        email,
        currentCode,
      });

      // ✅ ConfirmationMaterialSet desde consumibles seleccionados
      const plantFallback = String(orden?.Plant || orden?.plant || orden?.centro || "").trim();
      const ConfirmationMaterialSet = normalizeConsumiblesToMaterialSet(consumibles, plantFallback);

      // ✅ Confirmaciones (operaciones) + ✅ consumibles en el mismo payload
      const confirmationPayload = {
        Order: "S1",
        ConfirmationOrderSet: selectedOps.map((op, idx) => {
          const actRaw = String(op.activity || op.Activity || "").trim();
          const subRaw = String(op.subactivity || op.SubActivity || "").trim();

          const Operation = actRaw.padStart(4, "0");
          const SubActivity = subRaw ? subRaw.padStart(4, "0") : "";

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

          if (SubActivity) row.SubActivity = SubActivity;
          return row;
        }),
        // ✅ AQUÍ VAN LOS CONSUMIBLES
        ConfirmationMaterialSet,
        Return: [],
      };

      // ✅ Generar HTML + PDF (para preview + base64)
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
          ""
        ).trim(),

        avisoCliente: String(avisoCliente || "").trim(),
        notaTecnico: String(notaTecnico || "").trim(),

        coberturaTipo: coberturaTipo || null,
        consumibles,

        startMs: orderStartedAtMs,
        finishMs,
        elapsedMs: Math.max(0, finishMs - orderStartedAtMs),
      });

      setMantHtmlPreview(String(html || ""));

      let pdfBase64 = "";
      let pdfUri = null;

      try {
        const { uri } = await Print.printToFileAsync({ html: String(html || "") });
        pdfUri = uri;
        setMantPdfUri(uri);

        pdfBase64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (e) {
        console.warn("No se pudo generar PDF (base64):", e?.message || e);
        setMantPdfUri(null);
      }

      const fileName =
        tipo === "escalera" ? "mantenimiento_escaleras.pdf" : "mantenimiento_elevadores.pdf";

      // ✅ Payload UNIFICADO: 0300 + PDF
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
      console.error("Error preparando finalización (preview):", e?.response?.data || e);
      Alert.alert("Error", "No se pudo generar la vista previa del reporte.");
    } finally {
      setSavingSignature(false);
    }
  };

  // ✅ Abrir PDF real con el visor del sistema
  const abrirPdfMantenimiento = async () => {
    if (!mantPdfUri) {
      Alert.alert("Sin PDF", "No se pudo generar el PDF en este dispositivo (puedes continuar).");
      return;
    }
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "No disponible",
          "Este dispositivo no permite abrir/compartir archivos. Puedes continuar igualmente."
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

  // ✅ PASO 2: Continuar -> aquí sí se envía / encola y redirige (sin duplicar confirmaciones si ya se mandaron en 0400)
  const continuarFinalizacionDespuesPreview = async () => {
    if (!pendingFinalize?.orderId) {
      setShowMantPreview(false);
      return;
    }

    const { orderId, finishMs, selectedIds, change0300WithPdfPayload, confirmationPayload } =
      pendingFinalize;

    try {
      setFinishingOrder(true);

      const net = await NetInfo.fetch();
      const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);

      // anti-duplicado: si en 0400 ya mandaste confirmaciones, no las vuelvas a mandar en 0300
      let alreadySentConfirmations = false;
      try {
        const pending = await loadPendingSign(orderId);
        alreadySentConfirmations = !!pending?.confirmationsSent;
      } catch {}

      // logs solicitados (sin reventar consola por base64)
      logSapPayload("=== SAP PAYLOAD (CHANGE 0300 + PDF) ===", change0300WithPdfPayload, {
        stripBase64: true,
      });
      logSapPayload("=== SAP PAYLOAD (CONFIRMATIONS + CONSUMIBLES) ===", confirmationPayload);
      console.log("CONFIRMATIONS alreadySent:", alreadySentConfirmations);

      if (!isOnline) {
        // UI local
        await updateLocalOpsAsFinalizadas(orderId, selectedIds);
        await updateLocalOrderAsFinalizada0300(orderId, finishMs);

        // 1) encolar: 0300 + PDF (UNIFICADO)
        await enqueueSap({
          type: "STATUS",
          orderId,
          endpoint: "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
          payload: change0300WithPdfPayload,
          dedupeKey: `STATUS:${orderId}`, // pisa el 0400 si existía
        });

        // 2) encolar confirmaciones+consumibles SOLO si NO se mandaron en 0400
        if (!alreadySentConfirmations) {
          await enqueueSap({
            type: "CONFIRMATIONS",
            orderId,
            endpoint: "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
            payload: confirmationPayload,
            dedupeKey: `CONFIRMATIONS:${orderId}:0300`,
          });
        } else {
          console.log("Saltando enqueue confirmaciones (ya fueron enviadas en 0400)");
        }

        // ya quedó elapsed final guardado; ahora sí limpias el start
        await clearOrderStart(orderId);
        setOrderStartedAtMs(null);

        await clearPendingSign(orderId);
        setCheckedMap({});
        setFinalizeMode(false);

        setShowMantPreview(false);
        setPendingFinalize(null);

        Alert.alert(
          "Finalizado (offline)",
          alreadySentConfirmations
            ? "Se encoló (Estatus 0300+PDF). Confirmaciones+consumibles ya se habían enviado en 0400."
            : "Se encoló: (Estatus 0300+PDF) + confirmaciones+consumibles."
        );

        router.replace("/tecnico/ordenes");
        return;
      }

      // ===== ONLINE =====
      if (!change0300WithPdfPayload?.Attachments?.[0]?.Base64) {
        Alert.alert(
          "No se pudo generar el PDF",
          "No se pudo generar el PDF en este dispositivo. Intenta de nuevo o revisa permisos/almacenamiento."
        );
        return;
      }

      // 1) UN SOLO POST: 0300 + PDF
      await api.post(`/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet`, change0300WithPdfPayload);

      // 2) Confirmaciones+consumibles SOLO si NO se mandaron en 0400
      if (!alreadySentConfirmations) {
        await api.post(
          `/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet`,
          confirmationPayload
        );
      } else {
        console.log("Saltando POST confirmaciones (ya fueron enviadas en 0400)");
      }

      // UI local final
      await updateLocalOpsAsFinalizadas(orderId, selectedIds);
      await updateLocalOrderAsFinalizada0300(orderId, finishMs);

      //  ya quedó elapsed final guardado; ahora sí limpias el start
      await clearOrderStart(orderId);
      setOrderStartedAtMs(null);

      await clearPendingSign(orderId);
      setCheckedMap({});
      setFinalizeMode(false);

      setShowMantPreview(false);
      setPendingFinalize(null);

      Alert.alert(
        "Orden finalizada",
        alreadySentConfirmations
          ? "Se envió: (0300 + PDF). Confirmaciones+consumibles ya se habían enviado en 0400."
          : "Se envió: (0300 + PDF) y confirmaciones+consumibles."
      );
      router.replace("/tecnico/ordenes");
    } catch (error) {
      console.error("Error al finalizar (SAP):", error?.response?.data || error);

      const data = error?.response?.data;
      const msg =
        data?.error?.message?.value ||
        data?.message?.value ||
        data?.detail ||
        (typeof data?.error === "string" ? data.error : null) ||
        error?.message ||
        "No se pudo finalizar.";

      Alert.alert("Error", String(msg));
    } finally {
      setFinishingOrder(false);
    }
  };

  useEffect(() => {
    obtenerOrden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================== Render ================== */
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
              <Text style={styles.timerText}>{msToHMS(nowTick - orderStartedAtMs)}</Text>
            </View>
          </View>
        ) : showFrozenTimer ? (
          <View style={styles.topActionBar}>
            <View style={styles.timerPill}>
              <Ionicons name="pause-circle-outline" size={16} color={FIORI.text} />
              <Text style={styles.timerText}>{msToHMS(orderElapsedMs)}</Text>
            </View>
          </View>
        ) : null}

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={FIORI.brand} />
          <Text style={{ marginTop: 10, color: FIORI.textMuted, fontWeight: "700" }}>
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

  const direccionValor = orden.direccion || orden.address || orden.partner_address || null;
  const allMaterials = Array.isArray(orden.componentes) ? orden.componentes : [];
  const hasSelectedOps = Object.keys(checkedMap || {}).length > 0;

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
            <Text style={styles.timerText}>{msToHMS(nowTick - orderStartedAtMs)}</Text>
          </View>
        </View>
      ) : showFrozenTimer ? (
        <View style={styles.topActionBar}>
          <View style={styles.timerPill}>
            <Ionicons name="pause-circle-outline" size={16} color={FIORI.text} />
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
            orden={orden}
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
          />
        }
        renderItem={() => {
          const ops = Array.isArray(orden?.operaciones) ? orden.operaciones : [];
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
                  <Text style={styles.panelTitle}>Descripción general de las actividades</Text>
                  <Text style={{ color: FIORI.textMuted, fontWeight: "700", marginBottom: 8 }}>
                    Se insertará en el PDF.
                  </Text>

                  <TextInput
                    value={notaTecnico}
                    onChangeText={setNotaTecnico}
                    placeholder="Insertar descripción"
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

                  {/* ✅ Consumibles filtrados por cobertura */}
                  <ConsumiblesFinalizacion
                    plant={String(orden?.Plant || orden?.plant || orden?.centro || "").trim()}
                    coberturaTipo={coberturaTipo || null}
                    FIORI={FIORI}
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
        <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={(e) => irAAvisoAveria(e)}>
          <Ionicons name="warning-outline" size={20} color="#000000ff" />
          <Text style={styles.fabLabel}>Avería</Text>
        </TouchableOpacity>
      )}

      <ModalesDetalleOrden
        styles={styles}
        FIORI={FIORI}
        orden={orden}
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
        // ✅ correo cliente
        clienteEmail={clienteEmail}
        setClienteEmail={setClienteEmail}
        isValidEmail={isValidEmail}
        // ✅ nombre/cargo/aviso
        clienteNombre={clienteNombre}
        setClienteNombre={setClienteNombre}
        clienteCargo={clienteCargo}
        setClienteCargo={setClienteCargo}
        avisoCliente={avisoCliente}
        setAvisoCliente={setAvisoCliente}
        // PDF no mant
        showNoMantPdfModal={showNoMantPdfModal}
        cerrarModalNoMantPdf={cerrarModalNoMantPdf}
        loadingNoMantPdf={loadingNoMantPdf}
        noMantError={noMantError}
        noMantPdfUrl={noMantPdfUrl}
        noMantPdfRawUrl={noMantPdfRawUrl}
        descargarNoMantPdf={descargarNoMantPdf}
        downloadingNoMantPdf={downloadingNoMantPdf}
      />

      {/* ✅ Modal “vista previa” antes de redirigir */}
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
              <Text style={styles.modalTitle}>Vista previa · Reporte de mantenimiento</Text>
              <TouchableOpacity
                onPress={() => {
                  if (finishingOrder) return;
                  setShowMantPreview(false);
                }}
                style={[styles.modalCloseBtn, finishingOrder && { opacity: 0.7 }]}
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
                <WebView originWhitelist={["*"]} source={{ html: mantHtmlPreview }} style={{ flex: 1 }} />
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
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>Finalizando…</Text>
                ) : (
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>Continuar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ Overlay bloqueante cuando guardas 0400 */}
      <Modal visible={savingPending0400} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.blockBackdrop}>
          <View style={styles.blockCard}>
            <ActivityIndicator size="large" color={FIORI.brand} />
            <Text style={styles.blockTitle}>Guardando pendiente de firma…</Text>
            <Text style={styles.blockSub}>No cierres la pantalla ni toques botones.</Text>
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
  noMantTitle: { fontSize: 14, fontWeight: "800", color: FIORI.text, marginBottom: 4 },
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
  panelTitle: { fontSize: 14, fontWeight: "800", color: FIORI.text, marginBottom: 8 },

  row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: FIORI.borderSoft },
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
  badgeSmall: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
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
  timerText: { color: FIORI.text, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },

  /* ====== Modales ====== */
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

  /* ✅ Overlay bloqueante */
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
  blockSub: { marginTop: 6, color: FIORI.textMuted, textAlign: "center", fontSize: 12 },
});

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