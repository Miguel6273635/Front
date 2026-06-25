import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Platform, Alert, Pressable, Modal, ScrollView
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import { router } from "expo-router";
import { useAuth } from "../../../src/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import Signature from "react-native-signature-canvas";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  loadOrdenTecnicoDetail, loadOrdenesTecnicoList, saveOrdenesTecnicoList,
  buildOfflineWindow, filterOrdenesByWindow,
} from "../../../src/offline/ordenesTecnicoCache";
import {
  getLocalStatusPatch, setLocalStatusPatch, applyStatusPatchToOrdenes,
} from "../../../src/offline/ordenesTecnicoLocalPatch";
import { upsertSapQueueItem, processSapQueue } from "../../../src/offline/sapQueue";
import { buildMantenimientoHtml } from "../../../src/services/templates/buildMantenimientoHtml";
import { addPageNumbersToPdfBase64 } from "../../../src/services/pdf/addPageNumbersToPdf";

const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  cardSubtle: "#F5F7FA",
  border: "#DDE6F2",
  borderMuted: "#CFD8E3",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
  accentSoft: "#E3F2FD",
  neutralBtn: "#ECEFF5",
  warn: "#2D9CDB",
  danger: "#EB5757",
  ok: "#2FBF71",
  successDark: "#0B8457",
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const safeStr = (v) => (v == null ? "" : String(v));
const safeTrim = (v) => String(v ?? "").trim();

const PENDING_SIGN_KEY = (orderId) => `pendingSign:${orderId}`;
const DEFAULT_RECOVERY_ELAPSED_MS = 2.5 * 60 * 60 * 1000;

const PENDING_PDFS_DIR = `${FileSystem.documentDirectory}pdfs_no_enviados/`;
const PENDING_PDFS_INDEX_KEY = "pendingFailedSignaturePdfs:index";

const SENT_PDFS_DIR = `${FileSystem.documentDirectory}pdfs_enviados/`;
const SENT_PDFS_INDEX_KEY = "sentSignaturePdfs:index";

const atStartOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const atEndOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfYear = (y) => new Date(y, 0, 1, 0, 0, 0, 0);
const endOfYear = (y) => new Date(y, 11, 31, 23, 59, 59, 999);

const formatLocalYmd = (d) => {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const parseSapDate = (value) => {
  if (!value) return null;

  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = parseInt(value.replace("/Date(", "").replace(")/", ""), 10);
    return Number.isNaN(ms) ? null : new Date(ms);
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const getUtcYmd = (d) => {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const isWithin = (date, start, end) => {
  if (!date) return false;

  const dStr = getUtcYmd(date);
  const sStr = start ? getUtcYmd(start) : null;
  const eStr = end ? getUtcYmd(end) : null;

  if (sStr && dStr < sStr) return false;
  if (eStr && dStr > eStr) return false;

  return true;
};

const formatDateDMY = (value) => {
  const d = parseSapDate(value);
  if (!d) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

function normalizeCode(code) {
  if (code === null || code === undefined) return "";

  const s = String(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  return Number.isNaN(n) ? s : String(n).padStart(4, "0");
}

function extractCodes(raw) {
  if (!raw) return [];

  const s = String(raw).trim();
  const matches = s.match(/\d{1,4}/g) || [];

  return Array.from(
    new Set(matches.map(normalizeCode).filter((x) => /^\d{4}$/.test(x)))
  );
}

function isPending0400(item) {
  const rawStatusText = [
    item?.userstatus,
    item?.Userstatus,
    item?.estatus_label,
    item?.status_text,
    item?.user_status,
    item?.system_status,
  ].filter(Boolean).join(" | ").toLowerCase();

  const codes = new Set([
    ...extractCodes(item?.userstatus),
    ...extractCodes(item?.Userstatus),
    ...extractCodes(item?.estatus_code),
    ...extractCodes(item?.estatusCode),
    ...extractCodes(item?.status_code),
  ]);

  return codes.has("0400") ||
    rawStatusText.includes("pendiente de firma") ||
    rawStatusText.includes("pendiente firma");
}

const matchesQuery = (item, q) => {
  if (!q) return true;

  const needle = q.toLowerCase().trim();

  const fields = [
    item?.Orderid,
    item?.OrderId,
    item?.order_type,
    item?.equipment,
    item?.Equipment,
    item?.partner_name,
    item?.partner_address,
    item?.cliente,
    item?.direccion,
    item?.userstatus,
    item?.estatus_label,
    item?.estatus_code,
  ].filter(Boolean).join(" ").toLowerCase();

  return fields.includes(needle);
};

function CheckBox({ checked, disabled, onPress }) {
  return (
    <Pressable
      onPress={disabled ? null : onPress}
      style={[
        styles.cbBox,
        checked && styles.cbBoxChecked,
        disabled && { opacity: 0.5 },
      ]}
      hitSlop={10}
    >
      {checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
    </Pressable>
  );
}

async function loadPendingSign(orderId) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SIGN_KEY(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function savePendingSign(orderId, value) {
  const id = String(orderId || "").trim();
  if (!id) return null;

  const payload = {
    ...(value || {}),
    orderId: id,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(PENDING_SIGN_KEY(id), JSON.stringify(payload));
  return payload;
}

function parseSapTimeToParts(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);

  if (!match) return null;

  return {
    hours: Number(match[1] || 0),
    minutes: Number(match[2] || 0),
    seconds: Number(match[3] || 0),
  };
}

function isValidSapClock(value) {
  const t = parseSapTimeToParts(value);
  return !!t && (t.hours > 0 || t.minutes > 0 || t.seconds > 0);
}

function sapDateAndTimeToMs(dateValue, timeValue) {
  const date = parseSapDate(dateValue);
  const time = parseSapTimeToParts(timeValue);

  if (!date || !time) return null;

  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    time.hours,
    time.minutes,
    time.seconds,
    0
  );
}

function getRecoveredTimeFromSapHeader(header) {
  const startCandidates = [
    { date: header?.ActualStartDate, time: header?.ActualStartTime },
    { date: header?.ProductionStartDate, time: header?.ProductionStartTime },
    { date: header?.StartDate, time: header?.ActualStartTime },
    { date: header?.StartDate, time: header?.ProductionStartTime },
  ];

  const finishCandidates = [
    { date: header?.ActualFinishDate, time: header?.ActualFinishTime },
    { date: header?.ProductionFinishDate, time: header?.ProductionFinishTime },
    { date: header?.FinishDate, time: header?.ActualFinishTime },
    { date: header?.FinishDate, time: header?.ProductionFinishTime },
  ];

  let startMs = null;
  let finishMs = null;

  for (const item of startCandidates) {
    if (!isValidSapClock(item.time)) continue;
    const ms = sapDateAndTimeToMs(item.date, item.time);
    if (ms) {
      startMs = ms;
      break;
    }
  }

  for (const item of finishCandidates) {
    if (!isValidSapClock(item.time)) continue;
    const ms = sapDateAndTimeToMs(item.date, item.time);
    if (ms) {
      finishMs = ms;
      break;
    }
  }

  if (startMs && finishMs && finishMs < startMs) {
    finishMs += 24 * 60 * 60 * 1000;
  }

  const elapsedMs = startMs && finishMs ? Math.max(0, finishMs - startMs) : 0;

  return { startMs, finishMs, elapsedMs };
}

function isFinishedSapOperation(op) {
  const status = String(op?.FieldUserStatus || "").trim().toUpperCase();
  return status === "FINA" || status.includes("FINA");
}

function buildCheckedMapFromOperations(ops = [], { allowAllIfNoFinished = false } = {}) {
  const list = Array.isArray(ops) ? ops : [];
  let sourceOps = list.filter(isFinishedSapOperation);

  if (!sourceOps.length && allowAllIfNoFinished) {
    sourceOps = list;
  }

  const checkedMap = {};

  for (const op of sourceOps) {
    const activity = String(op?.Activity || op?.activity || op?.Vornr || "").trim();
    if (!activity) continue;

    checkedMap[activity] = true;
  }

  return checkedMap;
}

function checkedCountFromMap(checkedMap) {
  return Object.keys(checkedMap || {}).filter((k) => !!checkedMap[k]).length;
}

function pendingNeedsRecovery(pending) {
  if (!pending) return true;
  if (!checkedCountFromMap(pending?.checkedMap)) return true;
  if (!pending?.orderStartedAtMs || !pending?.orderFinishedAtMs) return true;

  const elapsedMs =
    pending?.orderElapsedMs ??
    Math.max(0, pending.orderFinishedAtMs - pending.orderStartedAtMs);

  return !elapsedMs || elapsedMs <= 0;
}

async function fetchSapHeaderForRecovery({ apiClient, token, orderId }) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const res = await apiClient.get(
    `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')`,
    {
      headers,
      params: {
        $format: "json",
        "sap-client": "400",
        "sap-language": "ES",
      },
    }
  );

  return res?.data?.d || res?.data || {};
}

async function fetchSapOperationsForRecovery({ apiClient, token, orderId }) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const res = await apiClient.get(
    `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')/ToOperations`,
    {
      headers,
      params: {
        $format: "json",
        "sap-client": "400",
        "sap-language": "ES",
      },
    }
  );

  const data =
    res?.data?.d?.results ||
    res?.data?.results ||
    res?.data?.operaciones ||
    res?.data ||
    [];

  return normalizeOpsForPdf(Array.isArray(data) ? data : []);
}

async function rebuildPendingSignFromSap({ apiClient, token, orderId, previousPending }) {
  const header = await fetchSapHeaderForRecovery({ apiClient, token, orderId });
  const operacionesSap = await fetchSapOperationsForRecovery({ apiClient, token, orderId });

  const finishedOps = operacionesSap.filter(isFinishedSapOperation);

  const checkedMap = buildCheckedMapFromOperations(operacionesSap, {
    allowAllIfNoFinished: true,
  });

  if (!checkedCountFromMap(checkedMap)) {
    throw new Error("No se pudieron reconstruir operaciones desde SAP.");
  }

  let { startMs, finishMs, elapsedMs } = getRecoveredTimeFromSapHeader(header);
  let usedDefaultTime = false;

  if (!startMs || !finishMs || !elapsedMs) {
    const baseDate =
      parseSapDate(header?.ActualStartDate) ||
      parseSapDate(header?.StartDate) ||
      parseSapDate(header?.ProductionStartDate) ||
      new Date();

    startMs = baseDate.getTime();
    finishMs = startMs + DEFAULT_RECOVERY_ELAPSED_MS;
    elapsedMs = DEFAULT_RECOVERY_ELAPSED_MS;
    usedDefaultTime = true;
  }

  return savePendingSign(orderId, {
    ...(previousPending || {}),
    checkedMap,
    consumibles: Array.isArray(previousPending?.consumibles)
      ? previousPending.consumibles
      : [],
    notaTecnico: String(previousPending?.notaTecnico || "").trim(),
    orderStartedAtMs: startMs,
    orderFinishedAtMs: finishMs,
    orderElapsedMs: elapsedMs,
    __recoveredFromSap: true,
    __recoveredAt: new Date().toISOString(),
    __recoveredUsedAllOperations: !finishedOps.length,
    __recoveredUsedDefaultTime: usedDefaultTime,
  });
}

async function getPendingSignForOrder({ apiClient, token, orderId }) {
  const pending = await loadPendingSign(orderId);

  if (!pendingNeedsRecovery(pending)) {
    return pending;
  }

  return rebuildPendingSignFromSap({
    apiClient,
    token,
    orderId,
    previousPending: pending,
  });
}

async function loadPending0400FromOffline(userEmail) {
  try {
    const cached = await loadOrdenesTecnicoList(userEmail);
    let data = Array.isArray(cached?.data) ? cached.data : [];

    const patchMap = await getLocalStatusPatch(userEmail);
    data = applyStatusPatchToOrdenes(data, patchMap);

    return data.filter((it) => {
      const orderId = String(it?.Orderid || it?.OrderId || "").trim();

      const localCode = normalizeCode(
        patchMap?.[orderId]?.code ||
        patchMap?.[orderId]?.estatus_code ||
        patchMap?.[orderId]?.status_code ||
        patchMap?.[orderId]
      );

      if (localCode === "0300") return false;

      return isPending0400(it);
    });
  } catch {
    return [];
  }
}

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
  ].map(safeTrim).filter(Boolean).join(" | ").toLowerCase();

  return raw.includes("escal") ? "escalera" : "elevador";
}

function detectCoberturaFromShortText(shortText) {
  const s = String(shortText || "").toUpperCase();

  if (s.includes("COBERTURA BASICA") || s.includes("COBERTURA BÁSICA")) return "BASICA";
  if (s.includes("COBERTURA MEDIA")) return "MEDIA";
  if (s.includes("COBERTURA SEMI")) return "SEMI";

  return "SIN COBERTURA";
}

function normalizeOpsForPdf(ops = []) {
  if (!Array.isArray(ops)) return [];

  return ops.map((op) => {
    const Activity = op.Activity || op.activity || op.Vornr || "";
    const Description = op.Description || op.description || op.Ltxa1 || "";
    const StandardTextKey = op.StandardTextKey || op.standardTextKey || "";

    return {
      ...op,
      activity: String(Activity),
      description: String(Description),
      Activity: String(Activity),
      Description: String(Description),
      StandardTextKey: String(StandardTextKey),
      standardTextKey: String(StandardTextKey),
    };
  });
}

function mapDireccionLikeBackend(addr) {
  if (!addr) return { cliente: "", direccion: "" };

  const cliente = [addr.Name1 ?? "", addr.Name2 ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  const direccion = [
    `${addr.Street ?? addr.StreetName ?? ""} ${addr.HouseNum1 ?? ""}`.trim(),
    addr.StrSuppl3 ?? "",
    addr.Location ?? "",
    addr.City1 ?? "",
    addr.Region ?? "",
    addr.PostCode1 ?? "",
    addr.Country ?? "",
  ].filter((x) => x && String(x).trim().length > 0).join(", ");

  return { cliente, direccion };
}

function pickSecondAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results.length >= 2 ? results[1] : results[0];
}

async function fetchOrdenFullForPdf({ apiClient, token, orderId }) {
  try {
    const cached = await loadOrdenTecnicoDetail(orderId);

    if (cached?.data?.Orderid || cached?.data?.OrderId) {
      const ops = normalizeOpsForPdf(cached?.data?.operaciones || []);

      const shortTextCached =
        cached?.data?.ShortText ||
        cached?.data?.shorttext ||
        cached?.data?.Shorttext ||
        cached?.data?.shortText ||
        "";

      const coberturaCached =
        cached?.data?.cobertura_tipo ||
        cached?.data?.coberturaTipo ||
        detectCoberturaFromShortText(shortTextCached);

      return {
        ...cached.data,
        ShortText: shortTextCached,
        cobertura_tipo: coberturaCached || "SIN COBERTURA",
        operaciones: ops,
      };
    }
  } catch {}

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const resOrden = await apiClient
    .get(`/api/ordenes/sap/${orderId}`, { headers })
    .catch(() => ({ data: {} }));

  const baseOrden = resOrden?.data || {};
  let shortTextHeader = "";

  try {
    const resHeader = await apiClient.get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')`,
      { headers }
    );

    shortTextHeader =
      resHeader?.data?.d?.ShortText ||
      resHeader?.data?.d?.shorttext ||
      "";
  } catch {}

  const shortTextForCoverage =
    shortTextHeader ||
    baseOrden?.ShortText ||
    baseOrden?.shorttext ||
    baseOrden?.Shorttext ||
    baseOrden?.shortText ||
    "";

  const coberturaDetectada = detectCoberturaFromShortText(shortTextForCoverage);

  let ops = [];

  try {
    const resOps = await apiClient.get(`/api/operaciones/sap/${orderId}`, { headers });

    ops = Array.isArray(
      resOps?.data?.d?.results ||
      resOps?.data?.results ||
      resOps?.data?.operaciones ||
      resOps?.data
    )
      ? (
        resOps?.data?.d?.results ||
        resOps?.data?.results ||
        resOps?.data?.operaciones ||
        resOps?.data
      )
      : [];
  } catch {
    ops = Array.isArray(baseOrden?.operaciones) ? baseOrden.operaciones : [];
  }

  ops = normalizeOpsForPdf(ops);

  let direccionSap = "";
  let clienteSap = "";

  try {
    const resAddr = await apiClient.get(`/api/ordenes/sap/${orderId}/addresses`, { headers });
    const results = resAddr?.data?.results || resAddr?.data?.d?.results || [];
    const mapped = mapDireccionLikeBackend(pickSecondAddress(results));

    direccionSap = mapped.direccion || "";
    clienteSap = mapped.cliente || "";
  } catch {}

  return {
    ...baseOrden,
    ShortText: shortTextForCoverage || baseOrden?.ShortText || "",
    cobertura_tipo:
      coberturaDetectada ||
      baseOrden?.cobertura_tipo ||
      baseOrden?.coberturaTipo ||
      "SIN COBERTURA",
    cliente:
      clienteSap ||
      baseOrden?.cliente ||
      baseOrden?.partner_name ||
      `${baseOrden?.Name1 ?? ""} ${baseOrden?.Name2 ?? ""}`.trim(),
    direccion:
      direccionSap ||
      baseOrden?.direccion ||
      baseOrden?.address ||
      baseOrden?.partner_address ||
      "",
    operaciones: ops,
  };
}

function maskBase64Deep(value) {
  if (Array.isArray(value)) return value.map(maskBase64Deep);

  if (value && typeof value === "object") {
    const next = {};

    for (const key of Object.keys(value)) {
      next[key] =
        key === "Base64"
          ? `<<base64 omitted: ${String(value[key] || "").length} chars>>`
          : maskBase64Deep(value[key]);
    }

    return next;
  }

  return value;
}

function logSapPayload(label, payload, { stripBase64 = false } = {}) {
  try {
    console.log(label);

    if (payload) {
      console.log(JSON.stringify(stripBase64 ? maskBase64Deep(payload) : payload, null, 2));
    }
  } catch {}
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(email || "").trim().toLowerCase()
  );
}

function getSapErrorDetail(error, fallback = "No se pudo enviar a SAP.") {
  const data = error?.response?.data;

  const raw =
    data?.error?.message?.value ||
    data?.message?.value ||
    data?.detail ||
    data?.error_description ||
    data?.message ||
    (typeof data?.error === "string" ? data.error : "") ||
    error?.message ||
    fallback;

  const status = error?.response?.status;

  return [
    status
      ? `HTTP ${status}${error?.response?.statusText ? ` ${error?.response?.statusText}` : ""}`
      : "",
    String(raw || fallback),
  ].filter(Boolean).join(" - ");
}

function sanitizeFileName(value) {
  return String(value || "").replace(/[^\w.-]/g, "_").replace(/_+/g, "_");
}

function buildShortPdfFileName({ tipo, orderId }) {
  const cleanOrderId = sanitizeFileName(String(orderId || "").trim());
  const prefix = String(tipo || "").toLowerCase() === "escalera"
    ? "mantenimiento_esca"
    : "mantenimiento_elev";

  return `${prefix}_${cleanOrderId}.pdf`;
}

async function ensureDir(dir) {
  const info = await FileSystem.getInfoAsync(dir);

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function readJsonIndex(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeJsonIndex(key, items) {
  await AsyncStorage.setItem(key, JSON.stringify(items || []));
}

async function readFailedPdfsIndex() {
  return readJsonIndex(PENDING_PDFS_INDEX_KEY);
}

async function writeFailedPdfsIndex(items) {
  return writeJsonIndex(PENDING_PDFS_INDEX_KEY, items);
}

async function readSentPdfsIndex() {
  return readJsonIndex(SENT_PDFS_INDEX_KEY);
}

async function writeSentPdfsIndex(items) {
  return writeJsonIndex(SENT_PDFS_INDEX_KEY, items);
}

async function savePdfCopy({
  targetDir,
  indexKey,
  orderId,
  tempUri,
  fileName,
  clienteEmail,
  clienteNombre,
  clienteCargo,
  comentarioCliente,
  reason = "",
}) {
  await ensureDir(targetDir);

  const finalFileName = `${sanitizeFileName(orderId)}_${Date.now()}_${sanitizeFileName(fileName || `MANT_${orderId}.pdf`)}`;
  const finalUri = `${targetDir}${finalFileName}`;

  await FileSystem.copyAsync({ from: tempUri, to: finalUri });

  const prev = await readJsonIndex(indexKey);

  const item = {
    id: `${orderId}_${Date.now()}`,
    orderId: String(orderId),
    fileName: finalFileName,
    uri: finalUri,
    clienteEmail: String(clienteEmail || ""),
    clienteNombre: String(clienteNombre || ""),
    clienteCargo: String(clienteCargo || ""),
    comentarioCliente: String(comentarioCliente || ""),
    reason: String(reason || ""),
    createdAt: new Date().toISOString(),
  };

  await writeJsonIndex(indexKey, [item, ...prev]);

  return item;
}

async function saveFailedSignaturePdf(args) {
  return savePdfCopy({
    ...args,
    targetDir: PENDING_PDFS_DIR,
    indexKey: PENDING_PDFS_INDEX_KEY,
    reason: args?.reason || "No se pudo enviar a SAP",
  });
}

async function saveSentSignaturePdf(args) {
  return savePdfCopy({
    ...args,
    targetDir: SENT_PDFS_DIR,
    indexKey: SENT_PDFS_INDEX_KEY,
  });
}

async function deletePdfItem(item, indexKey) {
  try {
    if (!item?.uri) return;

    const prev = await readJsonIndex(indexKey);

    await writeJsonIndex(
      indexKey,
      prev.filter((x) => x.uri !== item.uri)
    );

    await FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => {});
  } catch {}
}

function isTodayIso(value) {
  if (!value) return false;

  const d = new Date(value);
  const today = new Date();

  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

async function cleanupOldPdfItems(indexKey) {
  const items = await readJsonIndex(indexKey);
  const keep = [];

  for (const item of items) {
    if (isTodayIso(item?.createdAt)) {
      keep.push(item);
    } else if (item?.uri) {
      await FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => {});
    }
  }

  await writeJsonIndex(indexKey, keep);

  return keep;
}

async function sharePdfItem(item) {
  try {
    if (!item?.uri) {
      Alert.alert("PDF no disponible", "No se encontró la ruta del archivo.");
      return;
    }

    const info = await FileSystem.getInfoAsync(item.uri);

    if (!info.exists) {
      Alert.alert("PDF no encontrado", "El archivo ya no existe en el dispositivo.");
      return;
    }

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Compartir no disponible", "Este dispositivo no permite compartir archivos desde la app.");
      return;
    }

    await Sharing.shareAsync(item.uri, {
      mimeType: "application/pdf",
      dialogTitle: `Compartir PDF orden ${item.orderId}`,
      UTI: "com.adobe.pdf",
    });
  } catch (e) {
    Alert.alert("Error al compartir", e?.message || "No se pudo compartir el PDF.");
  }
}

async function generateMaintenancePdfFile({ html }) {
  const result = await Print.printToFileAsync({
    html: String(html || ""),
    base64: true,
  });

  if (!result?.base64) {
    throw new Error("El PDF se generó vacío. Intenta generar nuevamente la orden.");
  }

  const pdfBase64Final = await addPageNumbersToPdfBase64(result.base64);

  if (!pdfBase64Final) {
    throw new Error("No se pudo corregir el PDF final.");
  }

  await FileSystem.writeAsStringAsync(result.uri, pdfBase64Final, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    uri: result.uri,
    base64: pdfBase64Final,
  };
}

export default function PendienteFirmaIndex() {
  const { user, ensureValidToken, token } = useAuth();

  const userEmail = safeStr(
    user?.correo ||
    user?.email ||
    user?.upn ||
    user?.username
  ).trim();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const [allOrdenes, setAllOrdenes] = useState([]);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");

  const [dateMode, setDateMode] = useState("all");
  const [dayRef, setDayRef] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);

  const [weekStart, setWeekStart] = useState(null);
  const [weekEnd, setWeekEnd] = useState(null);
  const [showWeekStartPicker, setShowWeekStartPicker] = useState(false);
  const [showWeekEndPicker, setShowWeekEndPicker] = useState(false);

  const now = new Date();

  const [monthYear, setMonthYear] = useState({
    month: now.getMonth(),
    year: now.getFullYear(),
  });

  const [showMonthModal, setShowMonthModal] = useState(false);
  const [yearOnly, setYearOnly] = useState(now.getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedMap, setSelectedMap] = useState({});

  const [validatingOrders, setValidatingOrders] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationResults, setValidationResults] = useState([]);
  const [validatedOrderIds, setValidatedOrderIds] = useState([]);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showFirmaModal, setShowFirmaModal] = useState(false);
  const [firmaDataUrl, setFirmaDataUrl] = useState(null);
  const [firmaForOrderIds, setFirmaForOrderIds] = useState([]);

  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCargo, setClienteCargo] = useState("");
  const [comentarioCliente, setComentarioCliente] = useState("");

  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({
    done: 0,
    total: 0,
    current: "",
  });

  const [sendResults, setSendResults] = useState([]);
  const [showSendSummaryModal, setShowSendSummaryModal] = useState(false);
  const [lastSendSummary, setLastSendSummary] = useState([]);

  const [showFailedPdfsModal, setShowFailedPdfsModal] = useState(false);
  const [failedPdfs, setFailedPdfs] = useState([]);

  const [showSentPdfsModal, setShowSentPdfsModal] = useState(false);
  const [sentPdfs, setSentPdfs] = useState([]);

  const signatureRef = useRef(null);
  const queueProcessingRef = useRef(false);

  const selectedIds = useMemo(
    () => Object.keys(selectedMap).filter((k) => !!selectedMap[k]),
    [selectedMap]
  );

  const selectedCount = selectedIds.length;

  const selectedAllReady =
    selectedCount > 0 &&
    validatedOrderIds.length === selectedCount &&
    selectedIds.every((id) => validatedOrderIds.includes(String(id)));

  const canSend =
    selectedCount > 0 &&
    firmaDataUrl &&
    isValidEmail(clienteEmail) &&
    clienteNombre.trim() &&
    clienteCargo.trim() &&
    comentarioCliente.trim() &&
    !sending;

  const { start, end } = useMemo(() => {
    if (dateMode === "day") {
      return {
        start: atStartOfDay(dayRef),
        end: atStartOfDay(dayRef),
      };
    }

    if (dateMode === "weekRange") {
      return {
        start: weekStart ? atStartOfDay(weekStart) : atStartOfDay(new Date()),
        end: weekEnd ? atEndOfDay(weekEnd) : atEndOfDay(new Date()),
      };
    }

    if (dateMode === "month") {
      const ref = new Date(monthYear.year, monthYear.month, 1);

      return {
        start: startOfMonth(ref),
        end: endOfMonth(ref),
      };
    }

    if (dateMode === "year") {
      return {
        start: startOfYear(yearOnly),
        end: endOfYear(yearOnly),
      };
    }

    const s = new Date();
    s.setDate(s.getDate() - 365);

    return {
      start: atStartOfDay(s),
      end: atEndOfDay(new Date()),
    };
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const getSapRequestRange = useCallback(() => {
    if (dateMode === "all") {
      const e = atEndOfDay(new Date());
      const s = new Date();

      s.setDate(s.getDate() - 365);

      const ss = atStartOfDay(s);

      return {
        startDate: ss,
        endDate: e,
        startStr: formatLocalYmd(ss),
        endStr: formatLocalYmd(e),
      };
    }

    if (dateMode === "day") {
      const s = atStartOfDay(dayRef);
      const e = atEndOfDay(dayRef);

      return {
        startDate: s,
        endDate: e,
        startStr: formatLocalYmd(s),
        endStr: formatLocalYmd(e),
      };
    }

    if (["weekRange", "month", "year"].includes(dateMode)) {
      const s = atStartOfDay(start);
      const e = atEndOfDay(end);

      return {
        startDate: s,
        endDate: e,
        startStr: formatLocalYmd(s),
        endStr: formatLocalYmd(e),
      };
    }

    const e = atEndOfDay(new Date());
    const s = new Date();

    s.setDate(s.getDate() - 365);

    const ss = atStartOfDay(s);

    return {
      startDate: ss,
      endDate: e,
      startStr: formatLocalYmd(ss),
      endStr: formatLocalYmd(e),
    };
  }, [dateMode, dayRef, start, end]);

  const fetchOrdenes0400 = useCallback(async ({ isRefresh = false } = {}) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      if (!userEmail) {
        Alert.alert("Sin usuario", "No se detectó el correo/usuario del técnico.");
        setAllOrdenes([]);
        return;
      }

      if (!isRefresh) {
        const offlineRows = await loadPending0400FromOffline(userEmail);

        if (offlineRows.length) {
          setAllOrdenes(offlineRows);
          setLoading(false);
        }
      }

      const net = await NetInfo.fetch();
      const online = !!(net?.isConnected && net?.isInternetReachable !== false);

      setIsOnline(online);

      if (!online) {
        const offlineRows = await loadPending0400FromOffline(userEmail);

        if (!offlineRows.length) {
          Alert.alert(
            "Sin conexión",
            "No hay internet y no se encontró una lista offline de órdenes pendientes de firma."
          );
        } else {
          setAllOrdenes(offlineRows);
        }

        return;
      }

      if (!(await ensureValidToken())) return;

      const req = getSapRequestRange();

      const params = new URLSearchParams({
        start: req.startStr,
        end: req.endStr,
        mode: "range",
        user: userEmail,
      });

      const res = await api.get(`/api/ordenes/sap/list?${params.toString()}`);
      const data = Array.isArray(res.data) ? res.data : [];

      const only0400 = data.filter((it) => isPending0400(it));

      const offlineWin = buildOfflineWindow(new Date());

      await saveOrdenesTecnicoList(
        userEmail,
        filterOrdenesByWindow(only0400, offlineWin.start, offlineWin.end),
        offlineWin
      );

      setAllOrdenes(only0400);

      setSelectedMap((prev) => {
        const valid = new Set(only0400.map((x) => String(x?.Orderid)));
        const next = {};

        for (const k of Object.keys(prev)) {
          if (valid.has(k) && prev[k]) next[k] = true;
        }

        return next;
      });
    } catch (e) {
      const offlineRows = await loadPending0400FromOffline(userEmail);

      if (offlineRows.length) {
        setAllOrdenes(offlineRows);

        Alert.alert(
          "Modo offline",
          "No se pudo actualizar desde SAP, se muestran las órdenes guardadas localmente."
        );
      } else {
        Alert.alert(
          "Error",
          e?.response?.data?.detail ||
          e?.response?.data?.error ||
          "No se pudieron cargar las órdenes pendientes de firma."
        );

        setAllOrdenes([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ensureValidToken, userEmail, getSapRequestRange]);

  const processPendingQueue = useCallback(async () => {
    if (queueProcessingRef.current) return;

    try {
      queueProcessingRef.current = true;

      const net = await NetInfo.fetch();
      const online = !!(net?.isConnected && net?.isInternetReachable !== false);

      setIsOnline(online);

      if (!online || !(await ensureValidToken())) return;

      await processSapQueue({
        ensureValidToken,
        apiInstance: api,
      });

      await fetchOrdenes0400({ isRefresh: true });
    } catch (e) {
      console.warn(
        "[PENDIENTE FIRMA] Error procesando cola SAP:",
        e?.response?.data || e?.message || e
      );
    } finally {
      queueProcessingRef.current = false;
    }
  }, [ensureValidToken, fetchOrdenes0400]);

  const loadFailedPdfs = useCallback(async () => {
    const items = await cleanupOldPdfItems(PENDING_PDFS_INDEX_KEY);
    const validItems = [];

    for (const item of items) {
      try {
        const info = await FileSystem.getInfoAsync(item.uri);

        if (info.exists && isTodayIso(item.createdAt)) {
          validItems.push(item);
        }
      } catch {}
    }

    if (validItems.length !== items.length) {
      await writeFailedPdfsIndex(validItems);
    }

    setFailedPdfs(validItems);
  }, []);

  const loadSentPdfs = useCallback(async () => {
    const items = await cleanupOldPdfItems(SENT_PDFS_INDEX_KEY);
    const validItems = [];

    for (const item of items) {
      try {
        const info = await FileSystem.getInfoAsync(item.uri);

        if (info.exists && isTodayIso(item.createdAt)) {
          validItems.push(item);
        }
      } catch {}
    }

    if (validItems.length !== items.length) {
      await writeSentPdfsIndex(validItems);
    }

    setSentPdfs(validItems);
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!(state?.isConnected && state?.isInternetReachable !== false);

      setIsOnline(online);

      if (online) {
        processPendingQueue();
      }
    });

    NetInfo.fetch().then((state) => {
      const online = !!(state?.isConnected && state?.isInternetReachable !== false);

      setIsOnline(online);

      if (online) {
        processPendingQueue();
      }
    });

    return () => unsubscribe();
  }, [processPendingQueue]);

  useEffect(() => {
    fetchOrdenes0400();
  }, [fetchOrdenes0400]);

  useEffect(() => {
    loadFailedPdfs();
    loadSentPdfs();
  }, [loadFailedPdfs, loadSentPdfs]);

  useFocusEffect(
    useCallback(() => {
      fetchOrdenes0400({ isRefresh: true });
      loadFailedPdfs();
      loadSentPdfs();
    }, [fetchOrdenes0400, loadFailedPdfs, loadSentPdfs])
  );

  useEffect(() => {
    setRows(
      (allOrdenes || []).filter((item) => {
        if (!matchesQuery(item, query)) return false;

        const sd = parseSapDate(item?.start_date);

        return sd ? isWithin(sd, start, end) : false;
      })
    );
  }, [allOrdenes, query, start, end]);

  useEffect(() => {
    setValidatedOrderIds((prev) =>
      prev.filter((id) => selectedIds.includes(String(id)))
    );

    setValidationResults((prev) =>
      prev.filter((r) => selectedIds.includes(String(r.orderId)))
    );
  }, [selectedIds.join("|")]);

  const activeRangeText = useMemo(() => {
    if (dateMode === "all") return "Últimos 365 días";
    if (dateMode === "day") return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
    if (dateMode === "weekRange") {
      return `Semana: ${weekStart ? atStartOfDay(weekStart).toLocaleDateString() : "—"} → ${weekEnd ? atEndOfDay(weekEnd).toLocaleDateString() : "—"}`;
    }
    if (dateMode === "month") return `Mes: ${MONTHS[monthYear.month]} ${monthYear.year}`;
    if (dateMode === "year") return `Año: ${yearOnly}`;

    return "";
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const openDetalle = (orderId) => {
    const id = String(orderId || "").trim();

    if (id) {
      router.push(`/tecnico/ordenes/${id}`);
    }
  };

  const toggleSelect = (orderId) => {
    const id = String(orderId || "").trim();

    if (id) {
      setSelectedMap((prev) => ({
        ...prev,
        [id]: !prev[id],
      }));
    }
  };

  const clearSelection = () => {
    setSelectedMap({});
    setValidatedOrderIds([]);
    setValidationResults([]);
  };

  const resetFirmaFields = () => {
    setFirmaDataUrl(null);
    setFirmaForOrderIds([]);
    setClienteEmail("");
    setClienteNombre("");
    setClienteCargo("");
    setComentarioCliente("");
  };

  const clearFilters = () => {
    setQuery("");
    setDateMode("all");
    setDayRef(new Date());
    setWeekStart(null);
    setWeekEnd(null);
    setMonthYear({
      month: now.getMonth(),
      year: now.getFullYear(),
    });
    setYearOnly(now.getFullYear());
  };

  const validateSelectedOrdersBeforeSign = async () => {
  if (!selectedIds.length) {
    Alert.alert("Selecciona órdenes", "Selecciona al menos una orden para validar.");
    return;
  }

  try {
    setValidatingOrders(true);
    setValidationResults([]);
    setValidatedOrderIds([]);

    const results = [];

    for (const orderIdRaw of selectedIds) {
      const orderId = String(orderIdRaw || "").trim();

      try {
        const pending = await getPendingSignForOrder({
          apiClient: api,
          token,
          orderId,
        });

        const checkedCount = checkedCountFromMap(pending?.checkedMap);

        if (!checkedCount) {
          throw new Error("No tiene operaciones marcadas.");
        }

        if (!pending?.orderStartedAtMs || !pending?.orderFinishedAtMs) {
          throw new Error("Falta hora de inicio/fin guardada.");
        }

        const elapsedMs =
          pending?.orderElapsedMs ??
          Math.max(0, pending.orderFinishedAtMs - pending.orderStartedAtMs);

        if (!elapsedMs || elapsedMs <= 0) {
          throw new Error("Tiempo total inválido.");
        }

        const ordenFull = await fetchOrdenFullForPdf({
          apiClient: api,
          token,
          orderId,
        });

        if (!(Array.isArray(ordenFull?.operaciones) ? ordenFull.operaciones : []).length) {
          throw new Error("Sin operaciones de SAP.");
        }

        results.push({
          orderId,
          ok: true,
          msg: pending?.__recoveredFromSap
            ? "Orden lista para firma y envío. Información reconstruida desde SAP."
            : "Orden lista para firma y envío.",
          tipo: detectTipoMantenimiento(ordenFull),
          cobertura: String(
            ordenFull?.cobertura_tipo ||
            ordenFull?.coberturaTipo ||
            detectCoberturaFromShortText(ordenFull?.ShortText || ordenFull?.shorttext || "") ||
            "SIN COBERTURA"
          ).trim(),
          operaciones: checkedCount,
          consumibles: Array.isArray(pending?.consumibles) ? pending.consumibles.length : 0,
        });
      } catch (err) {
        results.push({
          orderId,
          ok: false,
          msg: getSapErrorDetail(err, "No se pudo validar esta orden."),
        });
      }
    }

    setValidationResults(results);
    setValidatedOrderIds(
      results.filter((r) => r.ok).map((r) => String(r.orderId))
    );
    setShowValidationModal(true);
  } catch (err) {
    Alert.alert("Error validando", err?.message || "No se pudieron validar las órdenes.");
  } finally {
    setValidatingOrders(false);
  }
};

  const continueToSignatureAfterValidation = () => {
    if (validationResults.filter((r) => !r.ok).length > 0) {
      Alert.alert(
        "Hay órdenes con error",
        "Corrige o deselecciona las órdenes con error antes de capturar la firma."
      );
      return;
    }

    const okIds = validationResults
      .filter((r) => r.ok)
      .map((r) => String(r.orderId));

    if (!okIds.length) {
      Alert.alert("Sin órdenes listas", "No hay órdenes válidas para capturar firma.");
      return;
    }

    resetFirmaFields();
    setFirmaForOrderIds(okIds);
    setShowValidationModal(false);
    setShowPreviewModal(true);
  };

  const onSignatureOK = (sig) => {
    setFirmaDataUrl(sig);
    setShowFirmaModal(false);
    Alert.alert("Firma capturada", `Firma lista para ${firmaForOrderIds.length} orden(es).`);
  };

  const onSignatureEmpty = () => {
    Alert.alert("Firma vacía", "El cliente no firmó. Intenta de nuevo.");
  };

  const sendSelectedOrders = async () => {
    const email = String(clienteEmail || "").trim();
    const nombre = String(clienteNombre || "").trim();
    const cargo = String(clienteCargo || "").trim();
    const comentario = String(comentarioCliente || "").trim();

    if (!selectedIds.length) {
      Alert.alert("Sin selección", "Selecciona al menos una orden.");
      return;
    }

    if (!selectedAllReady) {
      Alert.alert("Validación requerida", "Primero valida las órdenes seleccionadas antes de enviarlas.");
      return;
    }

    if (!email || !isValidEmail(email)) {
      setShowPreviewModal(true);
      Alert.alert("Correo inválido", "Captura un correo válido del cliente.");
      return;
    }

    if (!nombre) {
      setShowPreviewModal(true);
      Alert.alert("Falta nombre", "Captura el nombre del cliente.");
      return;
    }

    if (!cargo) {
      setShowPreviewModal(true);
      Alert.alert("Falta cargo", "Captura el cargo del cliente.");
      return;
    }

    if (!comentario) {
      setShowPreviewModal(true);
      Alert.alert("Falta comentario", "Captura el comentario del cliente.");
      return;
    }

    if (!firmaDataUrl) {
      setShowFirmaModal(true);
      Alert.alert("Falta firma", "Captura la firma del cliente.");
      return;
    }

    const net = await NetInfo.fetch();
    const online = !!(net?.isConnected && net?.isInternetReachable !== false);

    if (online && !(await ensureValidToken())) return;

    Alert.alert(
      "Confirmar envío",
      online
        ? `Se enviará un paquete con ${selectedIds.length} orden(es) a SAP:\n\n- PDFs de mantenimiento\n- Cambio de estatus a FINALIZADA\n\n¿Deseas continuar?`
        : `No hay internet.\n\nSe guardará un paquete con ${selectedIds.length} orden(es) localmente y se enviará cuando vuelva la conexión.`,
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Sí, continuar",
          style: "default",
          onPress: async () => {
            setSending(true);
            setSendResults([]);
            setSendProgress({
              done: 0,
              total: selectedIds.length,
              current: "Iniciando paquete...",
            });

            const results = [];
            const toWorkOrders = [];
            const tempPdfsByOrder = {};
            const tiempoInicioCronometro = performance.now();

            try {
              for (let i = 0; i < selectedIds.length; i++) {
                const orderId = String(selectedIds[i] || "").trim();

                setSendProgress((prev) => ({
                  ...prev,
                  current: `Generando PDF #${orderId}`,
                }));

                await new Promise((resolve) => setTimeout(resolve, 10));

                try {
                  const pending = await getPendingSignForOrder({
                    apiClient: api,
                    token,
                    orderId,
                  });

                  if (!pending?.checkedMap || !Object.keys(pending.checkedMap).length) {
                    throw new Error("No hay operaciones guardadas.");
                  }

                  const ordenFull = await fetchOrdenFullForPdf({
                    apiClient: api,
                    token,
                    orderId,
                  });

                  const tipo = detectTipoMantenimiento(ordenFull);

                  const tecnicoNombreFinal = String(
                    user?.nombre ||
                    user?.name ||
                    user?.fullName ||
                    user?.displayName ||
                    user?.username ||
                    ""
                  ).trim();

                  const html = await buildMantenimientoHtml({
                    tipo,
                    orden: ordenFull,
                    operaciones: Array.isArray(ordenFull?.operaciones) ? ordenFull.operaciones : [],
                    checkedMap: pending.checkedMap,
                    signatureData: firmaDataUrl,
                    clienteEmail: email,
                    clienteNombre: nombre,
                    clienteCargo: cargo,
                    avisoCliente: comentario,
                    notaTecnico: String(pending?.notaTecnico || "").trim(),
                    tecnicoNombre: tecnicoNombreFinal,
                    coberturaTipo: String(
                      ordenFull?.cobertura_tipo ||
                      ordenFull?.coberturaTipo ||
                      detectCoberturaFromShortText(ordenFull?.ShortText || "") ||
                      "SIN COBERTURA"
                    ).trim(),
                    consumibles: Array.isArray(pending?.consumibles) ? pending.consumibles : [],
                    startMs: pending?.orderStartedAtMs,
                    finishMs: pending?.orderFinishedAtMs,
                    elapsedMs:
                      pending?.orderElapsedMs ??
                      Math.max(0, pending?.orderFinishedAtMs - pending?.orderStartedAtMs),
                  });

                  const pdfResult = await generateMaintenancePdfFile({ html });
                  const fileName = buildShortPdfFileName({ tipo, orderId });

                  tempPdfsByOrder[orderId] = {
                    orderId,
                    tempUri: pdfResult.uri,
                    fileName,
                    clienteEmail: email,
                    clienteNombre: nombre,
                    clienteCargo: cargo,
                    comentarioCliente: comentario,
                  };

                  if (!pdfResult.base64) {
                    throw new Error("El PDF se generó vacío.");
                  }

                  toWorkOrders.push({
                    OrderId: orderId,
                    WorkOrderHeader: {
                      Orderid: orderId,
                      MaterialLong: email,
                    },
                    WorkOrderUserStatusSet: [
                      {
                        UserStText: "0300",
                        Langu: "ES",
                        Inactive: "",
                      },
                      {
                        UserStText: "0400",
                        Langu: "ES",
                        Inactive: "X",
                      },
                    ],
                    Attachments: [
                      {
                        DocId: orderId,
                        FileName: fileName,
                        MimeType: "application/pdf",
                        Base64: pdfResult.base64,
                      },
                    ],
                  });

                  setSendProgress((prev) => ({
                    ...prev,
                    done: prev.done + 1,
                    current: `PDF listo #${orderId}`,
                  }));
                } catch (err) {
                  results.push({
                    orderId,
                    ok: false,
                    msg: getSapErrorDetail(err, "No se pudo preparar la orden para el envío."),
                    fileName: "",
                    uri: "",
                  });

                  setSendProgress((prev) => ({
                    ...prev,
                    done: prev.done + 1,
                  }));
                }
              }

              if (!toWorkOrders.length) {
                setSendResults([...results]);
                setLastSendSummary([...results]);
                setShowSendSummaryModal(true);
                return;
              }

              const bulkPayload = {
                BulkId: `PAQUETE_${Date.now()}`,
                WorkOrderSet: toWorkOrders,
              };

              const tiempoTranscurridoMili = (performance.now() - tiempoInicioCronometro).toFixed(2);
              const workOrderBulkEndpoint = "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderBulkSet";

              logSapPayload("=== SAP PAYLOAD BULK ===", bulkPayload, {
                stripBase64: true,
              });

              // ✅ CAMBIO: Siempre se encola primero, aunque haya internet.
              // Así la pantalla no se queda esperando el POST pesado con PDFs/Base64.
              await upsertSapQueueItem({
                type: "PENDIENTE_FIRMA_BULK_0300",
                orderId: bulkPayload.BulkId,
                endpoint: workOrderBulkEndpoint,
                method: "POST",
                dedupeKey: `PENDIENTE_FIRMA_BULK_0300:${bulkPayload.BulkId}`,
                payload: bulkPayload,
              });

              for (const item of toWorkOrders) {
                const orderId = String(item?.OrderId || "").trim();

                // ✅ Se marca localmente como finalizada para que desaparezca de pendiente de firma.
                await setLocalStatusPatch(userEmail, orderId, "0300");

                const tempPdf = tempPdfsByOrder[orderId];
                let localPdfItem = null;

                if (tempPdf?.tempUri) {
                  localPdfItem = await saveSentSignaturePdf(tempPdf);
                  await FileSystem.deleteAsync(tempPdf.tempUri, { idempotent: true }).catch(() => {});
                }

                results.push({
                  orderId,
                  ok: true,
                  msg: online
                    ? `Guardado en cola. Se enviará en segundo plano. Tiempo armado paquete: ${tiempoTranscurridoMili}ms.`
                    : "Guardado offline dentro del paquete bulk. Se enviará cuando vuelva la red.",
                  fileName: localPdfItem?.fileName || tempPdf?.fileName || "",
                  uri: localPdfItem?.uri || "",
                });
              }

              await loadSentPdfs();

              // ✅ Si hay internet, intentamos procesar la cola sin bloquear el flujo del usuario.
              if (online) {
                processPendingQueue().catch((e) => {
                  console.warn(
                    "[PENDIENTE FIRMA] Cola enviada a segundo plano:",
                    e?.response?.data || e?.message || e
                  );
                });
              }

              setSendResults([...results]);

              const okSet = new Set(
                results.filter((r) => r.ok).map((r) => String(r.orderId))
              );

              if (okSet.size) {
                setAllOrdenes((prev) =>
                  (prev || []).filter(
                    (it) => !okSet.has(String(it?.Orderid || it?.OrderId || ""))
                  )
                );

                setSelectedMap((prev) => {
                  const next = { ...prev };

                  for (const id of okSet) {
                    delete next[id];
                  }

                  return next;
                });
              }

              setLastSendSummary([...results]);
              setShowSendSummaryModal(true);

              if (results.filter((r) => !r.ok).length === 0) {
                setSelectMode(false);
                clearSelection();
                resetFirmaFields();
              }
            } catch (globalErr) {
              Alert.alert(
                "Error Global",
                getSapErrorDetail(
                  globalErr,
                  "Ocurrió un fallo enviando el paquete. Revisa conexión, memoria o SAP."
                )
              );
            } finally {
              setSending(false);
              setSendProgress((p) => ({
                ...p,
                current: "",
              }));
            }
          },
        },
      ]
    );
  };

  const YearPickerContent = ({
    selectedYear,
    onSelect,
    from = 2020,
    to = now.getFullYear() + 2,
  }) => {
    const years = [];

    for (let y = to; y >= from; y--) {
      years.push(y);
    }

    return (
      <ScrollView style={{ maxHeight: 320 }}>
        {years.map((y) => (
          <TouchableOpacity
            key={y}
            style={[
              styles.yearItem,
              selectedYear === y && styles.yearItemActive,
            ]}
            onPress={() => onSelect(y)}
          >
            <Text
              style={[
                styles.yearItemText,
                selectedYear === y && styles.yearItemTextActive,
              ]}
            >
              {y}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderItem = ({ item }) => {
    const orderId = String(item?.Orderid || item?.OrderId || "");
    const startLabel = formatDateDMY(item.start_date);
    const finishLabel = formatDateDMY(item.finish_date);
    const checked = !!selectedMap[orderId];
    const isValidated = validatedOrderIds.includes(orderId);

    return (
      <Pressable
        style={[
          styles.compactCard,
          checked && styles.compactCardSelected,
          isValidated && styles.compactCardValidated,
        ]}
        onPress={() => {
          if (selectMode) {
            toggleSelect(orderId);
          } else {
            openDetalle(orderId);
          }
        }}
      >
        <View style={styles.compactCardTop}>
          {selectMode ? (
            <CheckBox checked={checked} onPress={() => toggleSelect(orderId)} />
          ) : (
            <View style={styles.statusDotPending} />
          )}

          <View style={styles.compactCardTitleWrap}>
            <Text style={styles.compactOrderTitle} numberOfLines={1}>
              #{orderId} - {safeStr(item?.order_type || "Mantenimiento")}
            </Text>

            {isValidated && (
              <Ionicons name="shield-checkmark" size={14} color={FIORI.ok} />
            )}
          </View>
        </View>

        <View style={styles.compactInfoGrid}>
          <View style={styles.compactInfoItem}>
            <Ionicons name="build-outline" size={12} color={FIORI.textMuted} />
            <Text style={styles.compactInfoText} numberOfLines={1}>
              Eq: {safeStr(item?.equipment || item?.Equipment || "—")}
            </Text>
          </View>

          <View style={styles.compactInfoItem}>
            <Ionicons name="calendar-outline" size={12} color={FIORI.textMuted} />
            <Text style={styles.compactInfoText}>
              {startLabel} a {finishLabel}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Pendiente de firma" />

      <View style={styles.topPanel}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={FIORI.textMuted} />

            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar orden, equipo, cliente…"
              placeholderTextColor={FIORI.textMuted}
              returnKeyType="search"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.selectBtn,
              selectMode ? styles.selectBtnCancel : styles.selectBtnActive,
            ]}
            onPress={() => {
              if (selectMode) {
                setSelectMode(false);
                clearSelection();
                resetFirmaFields();
              } else {
                setSelectMode(true);
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons
              name={selectMode ? "close" : "checkbox-outline"}
              size={18}
              color="#fff"
            />

            <Text style={styles.selectBtnText}>
              {selectMode ? "Cancelar" : "Seleccionar"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
        >
          {[
            ["all", "Todas"],
            ["day", "Día"],
            ["weekRange", "Semana"],
            ["month", "Mes"],
            ["year", "Año"],
          ].map(([mode, label]) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.chip,
                dateMode === mode && styles.chipActive,
              ]}
              onPress={() => {
                setDateMode(mode);

                if (mode === "day") setShowDayPicker(true);
                if (mode === "weekRange") setShowWeekStartPicker(true);
                if (mode === "month") setShowMonthModal(true);
                if (mode === "year") setShowYearModal(true);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  dateMode === mode && styles.chipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.clearChip} onPress={clearFilters}>
            <Text style={styles.clearChipText}>Limpiar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reloadChip}
            onPress={() => fetchOrdenes0400({ isRefresh: true })}
          >
            <Ionicons name="refresh-outline" size={15} color="#fff" />
            <Text style={styles.reloadChipText}>Recargar</Text>
          </TouchableOpacity>
        </ScrollView>

        {showDayPicker && (
          <DateTimePicker
            value={dayRef ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android") {
                setShowDayPicker(false);
                if (e.type !== "set") return;
              }

              if (date) setDayRef(date);
              if (Platform.OS === "ios") setShowDayPicker(true);
            }}
          />
        )}

        {showWeekStartPicker && (
          <DateTimePicker
            value={weekStart ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android") {
                setShowWeekStartPicker(false);
                if (e.type !== "set") return;
              }

              if (date) {
                setWeekStart(date);
                if (Platform.OS !== "ios") setShowWeekEndPicker(true);
              }

              if (Platform.OS === "ios") setShowWeekStartPicker(true);
            }}
          />
        )}

        {showWeekEndPicker && (
          <DateTimePicker
            value={weekEnd ?? weekStart ?? new Date()}
            mode="date"
            minimumDate={weekStart ?? undefined}
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android") {
                setShowWeekEndPicker(false);
                if (e.type !== "set") return;
              }

              if (date) setWeekEnd(date);
              if (Platform.OS === "ios") setShowWeekEndPicker(true);
            }}
          />
        )}
      </View>

      {loading && allOrdenes.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={FIORI.accent} />
          <Text style={styles.loadingText}>Cargando órdenes…</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, idx) =>
            String(item?.Orderid || item?.OrderId || `row-${idx}`)
          }
          renderItem={renderItem}
          contentContainerStyle={{
            padding: 12,
            paddingTop: 10,
            paddingBottom: selectMode ? 210 : 90,
          }}
          refreshing={refreshing}
          onRefresh={() => fetchOrdenes0400({ isRefresh: true })}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="document-text-outline" size={32} color={FIORI.textMuted} />
              <Text style={styles.emptyTitle}>Sin órdenes pendientes</Text>
              <Text style={styles.emptySub}>
                No hay órdenes pendientes de firma con los filtros actuales.
              </Text>
            </View>
          }
        />
      )}

      {selectMode && (
        <View style={styles.wizardBar}>
          <View style={styles.wizardHeaderCompact}>
            <View style={styles.wizardHeaderTextBox}>
              <Text style={styles.wizardTitle}>Finalizar órdenes pendientes</Text>

              <Text style={styles.wizardSub}>
                Paso 1 de 3 · {selectedCount} orden(es) seleccionada(s)
              </Text>

              <Text style={styles.wizardTinyInfo}>
                {isOnline ? "Online" : "Offline"} · {activeRangeText}
              </Text>
            </View>
          </View>

          <View style={styles.pdfActionsFullRow}>
            <TouchableOpacity
              style={styles.pdfActionBtn}
              onPress={async () => {
                await loadSentPdfs();
                setShowSentPdfsModal(true);
              }}
              disabled={sending}
            >
              <Ionicons name="checkmark-done-outline" size={16} color={FIORI.ok} />
              <Text style={styles.pdfActionText}>Enviados</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pdfActionBtn}
              onPress={async () => {
                await loadFailedPdfs();
                setShowFailedPdfsModal(true);
              }}
              disabled={sending}
            >
              <Ionicons name="alert-circle-outline" size={16} color={FIORI.danger} />
              <Text style={styles.pdfActionText}>Pendientes</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.wizardStepsRow}>
            <TouchableOpacity
              style={[
                styles.stepButton,
                selectedCount ? styles.stepButtonActive : styles.stepButtonDisabled,
              ]}
              onPress={validateSelectedOrdersBeforeSign}
              disabled={!selectedCount || validatingOrders || sending}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
              <Text style={styles.stepButtonText}>
                {validatingOrders ? "Validando" : "1 Validar"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.stepButton,
                selectedAllReady ? styles.stepButtonActive : styles.stepButtonDisabled,
              ]}
              onPress={() => {
                if (!selectedAllReady) {
                  Alert.alert(
                    "Valida primero",
                    "Primero valida todas las órdenes seleccionadas."
                  );
                } else {
                  setShowValidationModal(true);
                }
              }}
              disabled={!selectedCount || sending}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.stepButtonText}>2 Firmar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.stepButton,
                canSend ? styles.stepButtonSuccess : styles.stepButtonDisabled,
              ]}
              onPress={sendSelectedOrders}
              disabled={!canSend}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.stepButtonText}>
                {sending ? "Enviando" : "3 Enviar"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.wizardStatusBox}>
            <Text style={styles.wizardStatusText}>
              {selectedAllReady
                ? firmaDataUrl
                  ? "Todo listo. Ya puedes enviar las órdenes a SAP."
                  : "Órdenes validadas. Falta capturar datos y firma del cliente."
                : "Selecciona las órdenes y presiona Validar antes de firmar."}
            </Text>
          </View>
        </View>
      )}

      <Modal visible={showMonthModal} transparent animationType="fade" onRequestClose={() => setShowMonthModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setMonthYear((s) => ({ ...s, year: s.year - 1 }))}>
                <Text style={styles.modalHeaderBtn}>{"‹"}</Text>
              </TouchableOpacity>

              <Text style={styles.modalHeaderTitle}>{monthYear.year}</Text>

              <TouchableOpacity onPress={() => setMonthYear((s) => ({ ...s, year: s.year + 1 }))}>
                <Text style={styles.modalHeaderBtn}>{"›"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.monthGrid}>
              {MONTHS.map((m, idx) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.monthCell,
                    idx === monthYear.month && dateMode === "month" && styles.monthCellActive,
                  ]}
                  onPress={() => {
                    setMonthYear({
                      month: idx,
                      year: monthYear.year,
                    });

                    setShowMonthModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.monthCellText,
                      idx === monthYear.month && dateMode === "month" && styles.monthCellTextActive,
                    ]}
                  >
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.modalPrimaryBtn} onPress={() => setShowMonthModal(false)}>
              <Text style={styles.modalPrimaryBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showYearModal} transparent animationType="fade" onRequestClose={() => setShowYearModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { marginBottom: 10 }]}>
              Selecciona un año
            </Text>

            <YearPickerContent
              selectedYear={yearOnly}
              onSelect={(y) => {
                setYearOnly(y);
                setShowYearModal(false);
              }}
              from={now.getFullYear() - 10}
              to={now.getFullYear() + 2}
            />

            <TouchableOpacity style={styles.modalPrimaryBtn} onPress={() => setShowYearModal(false)}>
              <Text style={styles.modalPrimaryBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showValidationModal} transparent animationType="slide" onRequestClose={() => setShowValidationModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>Validación de órdenes</Text>

            <Text style={styles.modalSub}>
              Listas: {validationResults.filter((r) => r.ok).length} · Con error: {validationResults.filter((r) => !r.ok).length}
            </Text>

            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {validationResults.map((item) => (
                <View key={`${item.orderId}-${item.ok ? "ok" : "error"}`} style={styles.resultCard}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultTitle}>Orden #{item.orderId}</Text>

                    <View style={[styles.resultBadge, item.ok ? styles.resultBadgeOk : styles.resultBadgeError]}>
                      <Text style={[styles.resultBadgeText, { color: item.ok ? FIORI.ok : FIORI.danger }]}>
                        {item.ok ? "LISTA" : "REVISAR"}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.previewOrderText}>{item.msg}</Text>

                  {item.ok && (
                    <>
                      <Text style={styles.previewOrderText}>
                        Tipo: {item.tipo || "—"} / Cobertura: {item.cobertura || "—"}
                      </Text>

                      <Text style={styles.previewOrderText}>
                        Operaciones: {item.operaciones || 0} · Consumibles: {item.consumibles || 0}
                      </Text>
                    </>
                  )}
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setShowValidationModal(false)}>
                <Text style={styles.modalSecondaryBtnText}>Cerrar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalActionBtn,
                  validationResults.some((r) => !r.ok) && { backgroundColor: "#9AA5B1" },
                ]}
                disabled={validationResults.some((r) => !r.ok)}
                onPress={continueToSignatureAfterValidation}
              >
                <Ionicons name="arrow-forward-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.modalActionBtnText}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPreviewModal} transparent animationType="slide" onRequestClose={() => setShowPreviewModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "92%" }]}>
            <Text style={styles.modalTitle}>Datos del cliente</Text>

            <Text style={styles.modalSub}>
              Captura los datos que aparecerán en los PDFs y en el envío a SAP.
            </Text>

            <ScrollView style={{ marginTop: 12, maxHeight: 560 }} showsVerticalScrollIndicator={false}>
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Información del cliente</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Correo del cliente</Text>

                  <TextInput
                    value={clienteEmail}
                    onChangeText={setClienteEmail}
                    placeholder="correo@ejemplo.com"
                    placeholderTextColor={FIORI.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    style={[
                      styles.formInput,
                      !!clienteEmail && !isValidEmail(clienteEmail) && styles.inputError,
                    ]}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nombre del cliente</Text>

                  <TextInput
                    value={clienteNombre}
                    onChangeText={setClienteNombre}
                    placeholder="Nombre y apellidos"
                    placeholderTextColor={FIORI.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    style={styles.formInput}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Cargo del cliente</Text>

                  <TextInput
                    value={clienteCargo}
                    onChangeText={setClienteCargo}
                    placeholder="Ej. Administrador"
                    placeholderTextColor={FIORI.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    style={styles.formInput}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Comentarios del cliente</Text>

                  <TextInput
                    value={comentarioCliente}
                    onChangeText={setComentarioCliente}
                    placeholder="Comentario..."
                    placeholderTextColor={FIORI.textMuted}
                    multiline
                    style={[styles.formInput, styles.textAreaInput]}
                  />
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Firma</Text>

                <View style={styles.signatureStatusBox}>
                  <Ionicons
                    name={firmaDataUrl ? "checkmark-circle" : "create-outline"}
                    size={22}
                    color={firmaDataUrl ? FIORI.ok : FIORI.warn}
                  />

                  <View style={{ flex: 1 }}>
                    <Text style={styles.signatureStatusTitle}>
                      {firmaDataUrl ? "Firma capturada" : "Firma pendiente"}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setShowPreviewModal(false)}>
                <Text style={styles.modalSecondaryBtnText}>Cerrar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSecondaryBtn}
                onPress={() => {
                  setShowPreviewModal(false);
                  setShowFirmaModal(true);
                }}
              >
                <Ionicons name="create-outline" size={18} color={FIORI.ink} style={{ marginRight: 6 }} />
                <Text style={styles.modalSecondaryBtnText}>Firmar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalActionBtn, !canSend && { backgroundColor: "#9AA5B1" }]}
                disabled={!canSend}
                onPress={() => {
                  setShowPreviewModal(false);
                  sendSelectedOrders();
                }}
              >
                <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.modalActionBtnText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showFirmaModal} transparent animationType="slide" onRequestClose={() => setShowFirmaModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>Firma del cliente</Text>

            <Text style={styles.modalSub}>
              Órdenes a firmar: <Text style={{ fontWeight: "900" }}>{firmaForOrderIds.length || selectedIds.length}</Text>
            </Text>

            <View style={styles.signatureWrap}>
              <Signature
                ref={signatureRef}
                onOK={onSignatureOK}
                onEmpty={onSignatureEmpty}
                autoClear={false}
                descriptionText="Firma dentro del recuadro"
                webStyle={`
                  .m-signature-pad { box-shadow: none; border: none; }
                  .m-signature-pad--body { border: 1px solid #DDE6F2; border-radius: 12px; }
                  .m-signature-pad--footer { display: none; margin: 0px; }
                  body,html { width: 100%; height: 100%; }
                `}
              />
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => signatureRef.current?.clearSignature?.()}>
                <Ionicons name="trash-outline" size={18} color={FIORI.ink} style={{ marginRight: 6 }} />
                <Text style={styles.modalSecondaryBtnText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSecondaryBtn}
                onPress={() => {
                  setShowFirmaModal(false);
                  setShowPreviewModal(true);
                }}
              >
                <Text style={styles.modalSecondaryBtnText}>Volver</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalActionBtn} onPress={() => signatureRef.current?.readSignature?.()}>
                <Ionicons name="checkmark-done-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.modalActionBtnText}>Guardar firma</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showFailedPdfsModal} transparent animationType="slide" onRequestClose={() => setShowFailedPdfsModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>PDFs pendientes / no enviados</Text>

            <Text style={styles.modalSub}>
              Solo se muestran PDFs pendientes generados hoy.
            </Text>

            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {failedPdfs.length === 0 ? (
                <View style={styles.emptyMiniBox}>
                  <Ionicons name="checkmark-circle-outline" size={30} color={FIORI.ok} />
                  <Text style={styles.emptyMiniTitle}>No hay PDFs pendientes de hoy.</Text>
                </View>
              ) : (
                failedPdfs.map((item) => (
                  <View key={item.id} style={styles.resultCard}>
                    <View style={styles.resultHeader}>
                      <Text style={styles.resultTitle}>Orden #{item.orderId}</Text>

                      <View style={[styles.resultBadge, styles.resultBadgeError]}>
                        <Text style={[styles.resultBadgeText, { color: FIORI.danger }]}>
                          PENDIENTE
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.previewOrderText}>Archivo: {item.fileName}</Text>
                    <Text style={styles.previewOrderText}>Cliente: {item.clienteNombre || "—"}</Text>
                    <Text style={styles.previewOrderText}>Motivo: {item.reason || "No se pudo enviar a SAP"}</Text>

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity style={styles.miniPrimaryBtn} onPress={() => sharePdfItem(item)}>
                        <Ionicons name="share-social-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
                        <Text style={styles.miniPrimaryBtnText}>Compartir</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.miniDangerBtn}
                        onPress={() => {
                          Alert.alert(
                            "Eliminar PDF",
                            `¿Deseas eliminar el PDF de la orden ${item.orderId}?`,
                            [
                              {
                                text: "Cancelar",
                                style: "cancel",
                              },
                              {
                                text: "Eliminar",
                                style: "destructive",
                                onPress: async () => {
                                  await deletePdfItem(item, PENDING_PDFS_INDEX_KEY);
                                  await loadFailedPdfs();
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <Ionicons name="trash-outline" size={16} color={FIORI.danger} style={{ marginRight: 5 }} />
                        <Text style={styles.miniDangerBtnText}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalActionBtn} onPress={() => setShowFailedPdfsModal(false)}>
                <Text style={styles.modalActionBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSentPdfsModal} transparent animationType="slide" onRequestClose={() => setShowSentPdfsModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>PDFs enviados / generados</Text>

            <Text style={styles.modalSub}>
              Solo se muestran PDFs enviados o generados hoy.
            </Text>

            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {sentPdfs.length === 0 ? (
                <View style={styles.emptyMiniBox}>
                  <Ionicons name="document-outline" size={30} color={FIORI.textMuted} />
                  <Text style={styles.emptyMiniTitle}>No hay PDFs enviados de hoy.</Text>
                </View>
              ) : (
                sentPdfs.map((item) => (
                  <View key={item.id} style={styles.resultCard}>
                    <View style={styles.resultHeader}>
                      <Text style={styles.resultTitle}>Orden #{item.orderId}</Text>

                      <View style={[styles.resultBadge, styles.resultBadgeOk]}>
                        <Text style={[styles.resultBadgeText, { color: FIORI.ok }]}>
                          DISPONIBLE
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.previewOrderText}>Archivo: {item.fileName}</Text>
                    <Text style={styles.previewOrderText}>Cliente: {item.clienteNombre || "—"}</Text>

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity style={styles.miniPrimaryBtn} onPress={() => sharePdfItem(item)}>
                        <Ionicons name="share-social-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
                        <Text style={styles.miniPrimaryBtnText}>Compartir</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.miniDangerBtn}
                        onPress={() => {
                          Alert.alert(
                            "Eliminar PDF",
                            `¿Deseas eliminar el PDF de la orden ${item.orderId}?`,
                            [
                              {
                                text: "Cancelar",
                                style: "cancel",
                              },
                              {
                                text: "Eliminar",
                                style: "destructive",
                                onPress: async () => {
                                  await deletePdfItem(item, SENT_PDFS_INDEX_KEY);
                                  await loadSentPdfs();
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <Ionicons name="trash-outline" size={16} color={FIORI.danger} style={{ marginRight: 5 }} />
                        <Text style={styles.miniDangerBtnText}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalActionBtn} onPress={() => setShowSentPdfsModal(false)}>
                <Text style={styles.modalActionBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSendSummaryModal} transparent animationType="slide" onRequestClose={() => setShowSendSummaryModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>
              {lastSendSummary.some((r) => !r.ok) ? "Envío con detalles" : "Envío completado"}
            </Text>

            <Text style={styles.modalSub}>
              Correctas: {lastSendSummary.filter((r) => r.ok).length} · Con error: {lastSendSummary.filter((r) => !r.ok).length}
            </Text>

            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {lastSendSummary.map((item) => (
                <View key={`${item.orderId}-${item.ok ? "ok" : "fail"}`} style={styles.resultCard}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultTitle}>Orden #{item.orderId}</Text>

                    <View style={[styles.resultBadge, item.ok ? styles.resultBadgeOk : styles.resultBadgeError]}>
                      <Text style={[styles.resultBadgeText, { color: item.ok ? FIORI.ok : FIORI.danger }]}>
                        {item.ok ? "ENVIADA" : "NO ENVIADA"}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.previewOrderText}>{item.msg}</Text>

                  {!!item.fileName && (
                    <Text style={styles.previewOrderText}>PDF: {item.fileName}</Text>
                  )}

                  {!!item.uri && (
                    <TouchableOpacity style={styles.miniPrimaryBtn} onPress={() => sharePdfItem(item)}>
                      <Ionicons name="share-social-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
                      <Text style={styles.miniPrimaryBtnText}>Compartir PDF</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalActionBtn} onPress={() => setShowSendSummaryModal(false)}>
                <Text style={styles.modalActionBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sending} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.blockBackdrop}>
          <View style={styles.blockCard}>
            <ActivityIndicator size="large" color={FIORI.accent} />

            <Text style={styles.blockTitle}>
              Enviando a SAP… ({sendProgress.done}/{sendProgress.total})
            </Text>

            <Text style={styles.blockSub}>
              Orden actual: <Text style={{ fontWeight: "900" }}>{sendProgress.current || "—"}</Text>
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
  },

  topPanel: {
    backgroundColor: FIORI.cardBg,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: FIORI.border,
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  searchBox: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: FIORI.ink,
    paddingVertical: Platform.OS === "ios" ? 10 : 7,
  },

  selectBtn: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  selectBtnActive: {
    backgroundColor: FIORI.accent,
  },

  selectBtnCancel: {
    backgroundColor: FIORI.danger,
  },

  selectBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },

  filtersScroll: {
    gap: 8,
    paddingTop: 10,
    paddingRight: 12,
  },

  chip: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: FIORI.cardBg,
  },

  chipActive: {
    backgroundColor: FIORI.accent,
    borderColor: FIORI.accent,
  },

  chipText: {
    color: FIORI.ink,
    fontWeight: "700",
    fontSize: 12,
  },

  chipTextActive: {
    color: "#fff",
  },

  clearChip: {
    borderWidth: 1,
    borderColor: FIORI.border,
    backgroundColor: FIORI.neutralBtn,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  clearChipText: {
    color: FIORI.ink,
    fontWeight: "700",
    fontSize: 12,
  },

  reloadChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: FIORI.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  reloadChipText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },

  loadingWrap: {
    paddingTop: 28,
    alignItems: "center",
  },

  loadingText: {
    marginTop: 10,
    color: FIORI.textMuted,
    fontWeight: "700",
  },

  emptyBox: {
    marginTop: 28,
    alignItems: "center",
    padding: 20,
  },

  emptyTitle: {
    marginTop: 8,
    color: FIORI.ink,
    fontSize: 16,
    fontWeight: "900",
  },

  emptySub: {
    marginTop: 4,
    color: FIORI.textMuted,
    textAlign: "center",
    fontSize: 13,
  },

  compactCard: {
    backgroundColor: FIORI.cardBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderLeftWidth: 4,
    borderLeftColor: FIORI.warn,
  },

  compactCardSelected: {
    borderColor: FIORI.accent,
    backgroundColor: "#F8FBFF",
  },

  compactCardValidated: {
    borderLeftColor: FIORI.ok,
  },

  compactCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },

  compactCardTitleWrap: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  compactOrderTitle: {
    color: FIORI.ink,
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },

  compactInfoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 4,
    marginLeft: 20,
  },

  compactInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  compactInfoText: {
    color: FIORI.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },

  statusDotPending: {
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: FIORI.warn,
  },

  cbBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: FIORI.warn,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  cbBoxChecked: {
    backgroundColor: FIORI.warn,
  },

  wizardBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: FIORI.cardBg,
    borderTopWidth: 1,
    borderTopColor: FIORI.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 24 : 14,
  },

  wizardHeaderCompact: {
    marginBottom: 8,
  },

  wizardHeaderTextBox: {
    width: "100%",
  },

  wizardTitle: {
    color: FIORI.ink,
    fontSize: 15,
    fontWeight: "900",
  },

  wizardSub: {
    color: FIORI.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "700",
  },

  wizardTinyInfo: {
    color: FIORI.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "700",
  },

  pdfActionsFullRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  pdfActionBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 8,
  },

  pdfActionText: {
    color: FIORI.ink,
    fontSize: 12,
    fontWeight: "900",
  },

  wizardStepsRow: {
    flexDirection: "row",
    gap: 8,
  },

  stepButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  stepButtonActive: {
    backgroundColor: FIORI.accent,
  },

  stepButtonSuccess: {
    backgroundColor: FIORI.successDark,
  },

  stepButtonDisabled: {
    backgroundColor: "#9AA5B1",
  },

  stepButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },

  wizardStatusBox: {
    marginTop: 9,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  wizardStatusText: {
    color: FIORI.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: FIORI.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  modalCardLarge: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: FIORI.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: FIORI.ink,
  },

  modalHeaderBtn: {
    fontSize: 24,
    fontWeight: "900",
    color: FIORI.accent,
    paddingHorizontal: 12,
  },

  modalTitle: {
    color: FIORI.ink,
    fontSize: 18,
    fontWeight: "900",
  },

  modalSub: {
    marginTop: 6,
    color: FIORI.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },

  modalActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 14,
  },

  modalActionBtn: {
    backgroundColor: FIORI.accent,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  modalActionBtnText: {
    color: "#fff",
    fontWeight: "900",
  },

  modalSecondaryBtn: {
    backgroundColor: FIORI.cardSubtle,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
    flexDirection: "row",
    alignItems: "center",
  },

  modalSecondaryBtnText: {
    color: FIORI.ink,
    fontWeight: "900",
  },

  modalPrimaryBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    backgroundColor: FIORI.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  modalPrimaryBtnText: {
    color: "#fff",
    fontWeight: "900",
  },

  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },

  monthCell: {
    width: "31.5%",
    backgroundColor: FIORI.cardSubtle,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  monthCellActive: {
    backgroundColor: FIORI.accent,
    borderColor: FIORI.accent,
  },

  monthCellText: {
    color: FIORI.ink,
    fontWeight: "700",
  },

  monthCellTextActive: {
    color: "#fff",
  },

  yearItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  yearItemActive: {
    backgroundColor: FIORI.accent,
    borderColor: FIORI.accent,
  },

  yearItemText: {
    fontSize: 16,
    color: FIORI.ink,
    fontWeight: "700",
  },

  yearItemTextActive: {
    color: "#fff",
  },

  resultCard: {
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },

  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },

  resultTitle: {
    color: FIORI.ink,
    fontSize: 15,
    fontWeight: "900",
    flex: 1,
  },

  resultBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },

  resultBadgeOk: {
    backgroundColor: "#EAF8F0",
    borderColor: "#BDE8D0",
  },

  resultBadgeError: {
    backgroundColor: "#FFF0F0",
    borderColor: "#F5C2C2",
  },

  resultBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },

  previewOrderText: {
    color: FIORI.textMuted,
    fontSize: 13,
    marginTop: 4,
    fontWeight: "700",
  },

  formSection: {
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  formSectionTitle: {
    color: FIORI.ink,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 10,
  },

  inputGroup: {
    marginBottom: 12,
  },

  inputLabel: {
    color: FIORI.textMuted,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
  },

  formInput: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 11 : 8,
    fontSize: 14,
    color: FIORI.ink,
  },

  inputError: {
    borderColor: FIORI.danger,
  },

  textAreaInput: {
    minHeight: 92,
    textAlignVertical: "top",
    paddingTop: 10,
  },

  signatureStatusBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },

  signatureStatusTitle: {
    color: FIORI.ink,
    fontSize: 14,
    fontWeight: "900",
  },

  signatureWrap: {
    height: 300,
    marginTop: 14,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  cardActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  },

  miniPrimaryBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: FIORI.accent,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },

  miniPrimaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },

  miniDangerBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#FFF0F0",
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F5C2C2",
  },

  miniDangerBtnText: {
    color: FIORI.danger,
    fontWeight: "900",
    fontSize: 12,
  },

  emptyMiniBox: {
    alignItems: "center",
    paddingVertical: 28,
  },

  emptyMiniTitle: {
    marginTop: 8,
    color: FIORI.textMuted,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },

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
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
  },

  blockTitle: {
    marginTop: 12,
    color: FIORI.ink,
    fontWeight: "900",
  },

  blockSub: {
    marginTop: 6,
    color: FIORI.textMuted,
    textAlign: "center",
    fontSize: 12,
  },
});