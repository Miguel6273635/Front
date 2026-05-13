import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
  Pressable,
  Modal,
  ScrollView,
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

import {
  loadOrdenTecnicoDetail,
  loadOrdenesTecnicoList,
  saveOrdenesTecnicoList,
  buildOfflineWindow,
  filterOrdenesByWindow,
} from "../../../src/offline/ordenesTecnicoCache";

import {
  getLocalStatusPatch,
  applyStatusPatchToOrdenes,
} from "../../../src/offline/ordenesTecnicoLocalPatch";

import { upsertSapQueueItem } from "../../../src/offline/sapQueue";
import { buildMantenimientoHtml } from "../../../src/services/templates/buildMantenimientoHtml";

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
};

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const safeStr = (v) => (v == null ? "" : String(v));

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

const startOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfYear = (y) => new Date(y, 0, 1, 0, 0, 0, 0);
const endOfYear = (y) => new Date(y, 11, 31, 23, 59, 59, 999);

const formatLocalYmd = (d) => {
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const parseSapDate = (value) => {
  if (!value) return null;
  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = parseInt(value.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const getUtcYmd = (d) => {
  if (!d) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

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

function isPending0400(item) {
  const rawStatusText = [
    item?.userstatus,
    item?.Userstatus,
    item?.estatus_label,
    item?.status_text,
    item?.user_status,
    item?.system_status,
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  const codes = new Set([
    ...extractCodes(item?.userstatus),
    ...extractCodes(item?.Userstatus),
    ...extractCodes(item?.estatus_code),
    ...extractCodes(item?.estatusCode),
    ...extractCodes(item?.status_code),
  ]);

  return (
    codes.has("0400") ||
    rawStatusText.includes("pendiente de firma") ||
    rawStatusText.includes("pendiente firma")
  );
}

const matchesQuery = (item, q) => {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  const fields = [
    item?.Orderid?.toString?.() ?? "",
    item?.order_type ?? "",
    item?.equipment ?? "",
    item?.partner_name ?? "",
    item?.partner_address ?? "",
    item?.userstatus ?? "",
    item?.estatus_label ?? "",
    item?.estatus_code ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

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

const PENDING_SIGN_KEY = (orderId) => `pendingSign:${orderId}`;

async function loadPendingSign(orderId) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SIGN_KEY(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadPending0400FromOffline(userEmail) {
  try {
    const cached = await loadOrdenesTecnicoList(userEmail);
    let data = Array.isArray(cached?.data) ? cached.data : [];

    const patchMap = await getLocalStatusPatch(userEmail);
    data = applyStatusPatchToOrdenes(data, patchMap);

    return data.filter((it) => isPending0400(it));
  } catch {
    return [];
  }
}

const safeTrim = (v) => String(v ?? "").trim();

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
    .map((x) => safeTrim(x))
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  if (raw.includes("escal")) return "escalera";
  return "elevador";
}

function normalizeOpsForPdf(ops = []) {
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

async function fetchOrdenFullForPdf({ apiClient, token, orderId }) {
  try {
    const cached = await loadOrdenTecnicoDetail(orderId);
    if (cached?.data?.Orderid) {
      const ops = normalizeOpsForPdf(cached?.data?.operaciones || []);
      return { ...cached.data, operaciones: ops };
    }
  } catch {}

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const resOrden = await apiClient.get(`/api/ordenes/sap/${orderId}`, {
    headers,
  });
  const baseOrden = resOrden?.data || {};

  let ops = [];
  try {
    const resOps = await apiClient.get(`/api/operaciones/sap/${orderId}`, {
      headers,
    });
    const rawOps =
      resOps?.data?.d?.results ||
      resOps?.data?.results ||
      resOps?.data?.operaciones ||
      resOps?.data ||
      [];
    ops = Array.isArray(rawOps) ? rawOps : [];
  } catch {
    ops = Array.isArray(baseOrden?.operaciones) ? baseOrden.operaciones : [];
  }

  ops = normalizeOpsForPdf(ops);

  let direccionSap = "";
  let clienteSap = "";
  try {
    const resAddr = await apiClient.get(
      `/api/ordenes/sap/${orderId}/addresses`,
      { headers },
    );
    const results = resAddr?.data?.results || resAddr?.data?.d?.results || [];
    const chosen = pickSecondAddress(results);
    const mapped = mapDireccionLikeBackend(chosen);
    direccionSap = mapped.direccion || "";
    clienteSap = mapped.cliente || "";
  } catch {}

  return {
    ...baseOrden,
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

function isValidEmail(email) {
  const s = String(email || "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function PendienteFirmaIndex() {
  const { user, ensureValidToken, token } = useAuth();

  const userEmail = safeStr(
    user?.correo || user?.email || user?.upn || user?.username,
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

  const signatureRef = useRef(null);

  const selectedIds = useMemo(
    () => Object.keys(selectedMap).filter((k) => !!selectedMap[k]),
    [selectedMap],
  );

  const { start, end } = useMemo(() => {
    if (dateMode === "day") {
      const s = atStartOfDay(dayRef);
      return { start: s, end: s };
    }

    if (dateMode === "weekRange") {
      return {
        start: weekStart ? atStartOfDay(weekStart) : atStartOfDay(new Date()),
        end: weekEnd ? atEndOfDay(weekEnd) : atEndOfDay(new Date()),
      };
    }

    if (dateMode === "month") {
      const ref = new Date(monthYear.year, monthYear.month, 1);
      return { start: startOfMonth(ref), end: endOfMonth(ref) };
    }

    if (dateMode === "year") {
      return { start: startOfYear(yearOnly), end: endOfYear(yearOnly) };
    }

    const e = atEndOfDay(new Date());
    const s = new Date();
    s.setDate(s.getDate() - 365);
    return { start: atStartOfDay(s), end: e };
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

    if (
      dateMode === "weekRange" ||
      dateMode === "month" ||
      dateMode === "year"
    ) {
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

  const fetchOrdenes0400 = useCallback(
    async ({ isRefresh = false } = {}) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        if (!userEmail) {
          Alert.alert(
            "Sin usuario",
            "No se detectó el correo/usuario del técnico.",
          );
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
        const online = !!(
          net?.isConnected && net?.isInternetReachable !== false
        );
        setIsOnline(online);

        if (!online) {
          const offlineRows = await loadPending0400FromOffline(userEmail);
          if (!offlineRows.length) {
            Alert.alert(
              "Sin conexión",
              "No hay internet y no se encontró una lista offline de órdenes pendientes de firma.",
            );
          } else {
            setAllOrdenes(offlineRows);
          }
          return;
        }

        const ok = await ensureValidToken();
        if (!ok) return;

        const req = getSapRequestRange();

        console.log("[PENDIENTE FIRMA] Request SAP range:", {
          dateMode,
          start: req.startStr,
          end: req.endStr,
          user: userEmail,
        });

        const params = new URLSearchParams({
          start: req.startStr,
          end: req.endStr,
          mode: "range",
          user: userEmail,
        });

        const res = await api.get(`/api/ordenes/sap/list?${params.toString()}`);
        const data = Array.isArray(res.data) ? res.data : [];

        const offlineWin = buildOfflineWindow(new Date());
        const offlineOnly = filterOrdenesByWindow(
          data,
          offlineWin.start,
          offlineWin.end,
        );
        await saveOrdenesTecnicoList(userEmail, offlineOnly, offlineWin);

        const only0400 = data.filter((it) => isPending0400(it));
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
        console.error(
          "fetchOrdenes0400 ERROR:",
          e?.response?.data || e?.message || e,
        );

        const offlineRows = await loadPending0400FromOffline(userEmail);
        if (offlineRows.length) {
          setAllOrdenes(offlineRows);
          Alert.alert(
            "Modo offline",
            "No se pudo actualizar desde SAP, se muestran las órdenes guardadas localmente.",
          );
        } else {
          const serverMsg =
            e?.response?.data?.detail ||
            e?.response?.data?.error ||
            "No se pudieron cargar las órdenes pendientes de firma.";
          Alert.alert("Error", serverMsg);
          setAllOrdenes([]);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      ensureValidToken,
      userEmail,
      dateMode,
      dayRef,
      start,
      end,
      getSapRequestRange,
    ],
  );

  useEffect(() => {
    fetchOrdenes0400();
  }, [fetchOrdenes0400]);

  useFocusEffect(
    useCallback(() => {
      fetchOrdenes0400({ isRefresh: true });
    }, [fetchOrdenes0400]),
  );

  useEffect(() => {
    const filtered = (allOrdenes || []).filter((item) => {
      const okQuery = matchesQuery(item, query);
      if (!okQuery) return false;

      const sd = parseSapDate(item?.start_date);
      if (!sd) return false;

      return isWithin(sd, start, end);
    });

    setRows(filtered);
  }, [allOrdenes, query, start, end]);

  const openDetalle = (orderId) => {
    const id = String(orderId);
    router.push(`/tecnico/ordenes/${id}`);
  };

  const toggleSelect = (orderId) => {
    const id = String(orderId);
    setSelectedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearSelection = () => setSelectedMap({});

  const selectAllVisible = () => {
    const next = {};
    for (const it of rows) {
      const id = String(it?.Orderid);
      if (id) next[id] = true;
    }
    setSelectedMap(next);
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
    setMonthYear({ month: now.getMonth(), year: now.getFullYear() });
    setYearOnly(now.getFullYear());
  };

  const startFirmaFlow = () => {
    if (selectedIds.length === 0) {
      Alert.alert(
        "Selecciona órdenes",
        "Selecciona al menos una orden para firmar.",
      );
      return;
    }

    setFirmaDataUrl(null);
    setFirmaForOrderIds(selectedIds);
    setClienteEmail("");
    setClienteNombre("");
    setClienteCargo("");
    setComentarioCliente("");
    setShowFirmaModal(true);
  };

  const onSignatureOK = (sig) => {
    setFirmaDataUrl(sig);
    setShowFirmaModal(false);

    Alert.alert(
      "Firma capturada ✅",
      `Firma lista para ${firmaForOrderIds.length} orden(es).\n\nAhora puedes presionar "Enviar órdenes".`,
    );
  };

  const onSignatureEmpty = () => {
    Alert.alert("Firma vacía", "El cliente no firmó. Intenta de nuevo.");
  };

  const sendSelectedOrders = async () => {
    if (!firmaDataUrl) {
      Alert.alert("Falta firma", "Primero captura la firma del cliente.");
      return;
    }

    const email = String(clienteEmail || "").trim();
    const nombre = String(clienteNombre || "").trim();
    const cargo = String(clienteCargo || "").trim();
    const comentario = String(comentarioCliente || "").trim();

    if (!email) {
      Alert.alert("Falta correo", "Primero captura el correo del cliente.");
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert(
        "Correo inválido",
        "Escribe un correo válido (ej: nombre@dominio.com).",
      );
      return;
    }
    if (!nombre) {
      Alert.alert("Falta nombre", "Escribe el nombre del cliente.");
      return;
    }
    if (!cargo) {
      Alert.alert("Falta cargo", "Escribe el cargo del cliente.");
      return;
    }
    if (!comentario) {
      Alert.alert("Falta comentario", "Escribe el comentario del cliente.");
      return;
    }

    if (!selectedIds.length) {
      Alert.alert("Sin selección", "Selecciona al menos una orden.");
      return;
    }

    const net = await NetInfo.fetch();
    const online = !!(net?.isConnected && net?.isInternetReachable !== false);

    if (online) {
      const ok = await ensureValidToken();
      if (!ok) return;
    }

    Alert.alert(
      "Confirmar envío",
      online
        ? `Se enviarán ${selectedIds.length} orden(es) a SAP:\n- PDF de mantenimiento\n- Cambio de estatus a FINALIZADA\n\n¿Deseas continuar?`
        : `No hay internet.\n\nSe guardarán ${selectedIds.length} orden(es) localmente con:\n- PDF de mantenimiento\n- Cambio de estatus a FINALIZADA\n\nY se enviarán automáticamente cuando vuelva la red.\n\n¿Deseas continuar?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, continuar",
          style: "default",
          onPress: async () => {
            setSending(true);
            setSendResults([]);
            setSendProgress({
              done: 0,
              total: selectedIds.length,
              current: "",
            });

            const results = [];

            try {
              for (let i = 0; i < selectedIds.length; i++) {
                const orderId = String(selectedIds[i]).trim();
                setSendProgress({
                  done: i,
                  total: selectedIds.length,
                  current: orderId,
                });

                try {
                  const pending = await loadPendingSign(orderId);
                  const checkedMap = pending?.checkedMap || null;

                  if (!checkedMap || !Object.keys(checkedMap).length) {
                    throw new Error(
                      "No hay operaciones guardadas (pendingSign) para esta orden. Entra al detalle y marca/guarda primero.",
                    );
                  }

                  const ordenFull = await fetchOrdenFullForPdf({
                    apiClient: api,
                    token,
                    orderId,
                  });

                  const tipo = detectTipoMantenimiento(ordenFull);

                  const consumibles = Array.isArray(pending?.consumibles)
                    ? pending.consumibles
                    : [];
                  const notaTecnico = String(pending?.notaTecnico || "").trim();

                  const startedMs = Number.isFinite(pending?.orderStartedAtMs)
                    ? pending.orderStartedAtMs
                    : null;

                  const finishedMs = Number.isFinite(pending?.orderFinishedAtMs)
                    ? pending.orderFinishedAtMs
                    : null;

                  const elapsedMs = Number.isFinite(pending?.orderElapsedMs)
                    ? pending.orderElapsedMs
                    : Number.isFinite(startedMs) && Number.isFinite(finishedMs)
                      ? Math.max(0, finishedMs - startedMs)
                      : null;

                  const tecnicoNombreFinal = String(
                    user?.nombre ||
                      user?.name ||
                      user?.fullName ||
                      user?.displayName ||
                      user?.username ||
                      "",
                  ).trim();

                  const coberturaTipoFinal = String(
                    ordenFull?.cobertura_tipo || ordenFull?.coberturaTipo || "",
                  ).trim();

                  const html = await buildMantenimientoHtml({
                    tipo,
                    orden: ordenFull,
                    operaciones: Array.isArray(ordenFull?.operaciones)
                      ? ordenFull.operaciones
                      : [],
                    checkedMap,
                    signatureData: firmaDataUrl,

                    clienteEmail: email,
                    clienteNombre: nombre,
                    clienteCargo: cargo,

                    avisoCliente: comentario,
                    notaTecnico,

                    tecnicoNombre: tecnicoNombreFinal,

                    coberturaTipo: coberturaTipoFinal,
                    consumibles,

                    startMs: startedMs,
                    finishMs: finishedMs,
                    elapsedMs,
                  });

                  const { uri } = await Print.printToFileAsync({ html });
                  const pdfBase64 = await FileSystem.readAsStringAsync(uri, {
                    encoding: FileSystem.EncodingType.Base64,
                  });

                  const fileName =
                    tipo === "escalera"
                      ? "mantenimiento_escaleras.pdf"
                      : "mantenimiento_elevadores.pdf";

                  const payloadAttachment = {
                    WorkOrderHeader: { Orderid: orderId },
                    Attachments: [
                      {
                        DocId: orderId,
                        FileName: fileName,
                        MimeType: "pdf",
                        Base64: pdfBase64,
                      },
                    ],
                    Return: [],
                  };

                  const payloadStatus0300 = {
                    OrderId: orderId,
                    WorkOrderHeader: {
                      Orderid: orderId,
                      FunctLoc: email,
                    },
                    WorkOrderUserStatusSet: [
                      { UserStText: "0300", Langu: "ES", Inactive: " " },
                      { UserStText: "0400", Langu: "ES", Inactive: "X" },
                    ],
                    Return: [],
                  };

                  logSapPayload(
                    "=== SAP PAYLOAD (ATTACHMENT) ===",
                    payloadAttachment,
                    {
                      stripBase64: true,
                    },
                  );
                  logSapPayload(
                    "=== SAP PAYLOAD (STATUS 0300 / remove 0400) ===",
                    payloadStatus0300,
                  );

                  const workOrderEndpoint = `/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet`;

                  if (!online) {
                    await upsertSapQueueItem({
                      type: "PENDIENTE_FIRMA_0300",
                      orderId,
                      endpoint: workOrderEndpoint,
                      method: "POST",
                      dedupeKey: `PENDIENTE_FIRMA_0300:${orderId}`,
                      payload: {
                        attachmentEndpoint: workOrderEndpoint,
                        attachmentPayload: payloadAttachment,
                        statusEndpoint: workOrderEndpoint,
                        statusPayload: payloadStatus0300,
                      },
                    });

                    results.push({
                      orderId,
                      ok: true,
                      msg: "Guardado offline. Se enviará cuando vuelva la red.",
                    });
                  } else {
                    await api.post(workOrderEndpoint, payloadAttachment, {
                      headers: token
                        ? { Authorization: `Bearer ${token}` }
                        : undefined,
                    });

                    await api.post(workOrderEndpoint, payloadStatus0300, {
                      headers: token
                        ? { Authorization: `Bearer ${token}` }
                        : undefined,
                    });

                    results.push({
                      orderId,
                      ok: true,
                      msg: "Enviado OK (PDF + 0300).",
                    });
                  }
                } catch (err) {
                  const msg =
                    err?.response?.data?.detail ||
                    err?.response?.data?.error ||
                    err?.message ||
                    "Error desconocido";
                  console.warn(`[SEND ${orderId}]`, err?.response?.data || err);
                  results.push({ orderId, ok: false, msg });
                }

                setSendResults([...results]);
                setSendProgress({
                  done: i + 1,
                  total: selectedIds.length,
                  current: orderId,
                });
              }

              const okSet = new Set(
                results.filter((r) => r.ok).map((r) => r.orderId),
              );
              if (okSet.size) {
                setAllOrdenes((prev) =>
                  (prev || []).filter((it) => !okSet.has(String(it?.Orderid))),
                );
                setSelectedMap((prev) => {
                  const next = { ...(prev || {}) };
                  for (const id of okSet) delete next[id];
                  return next;
                });
              }

              const okCount = results.filter((r) => r.ok).length;
              const failCount = results.length - okCount;

              Alert.alert(
                "Envío terminado",
                online
                  ? `Correctas: ${okCount}\nCon error: ${failCount}\n\nRevisa la consola para ver los JSON enviados.`
                  : `Guardadas/encoladas: ${okCount}\nCon error: ${failCount}\n\nSe enviarán automáticamente cuando vuelva la red.`,
              );

              if (failCount === 0) {
                setSelectMode(false);
                clearSelection();
                resetFirmaFields();
              }
            } finally {
              setSending(false);
              setSendProgress((p) => ({ ...p, current: "" }));
            }
          },
        },
      ],
    );
  };

  const activeRangeText = useMemo(() => {
    if (dateMode === "all") return "Últimos 365 días";
    if (dateMode === "day")
      return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
    if (dateMode === "weekRange") {
      const a = weekStart ? atStartOfDay(weekStart).toLocaleDateString() : "—";
      const b = weekEnd ? atEndOfDay(weekEnd).toLocaleDateString() : "—";
      return `Semana (rango): ${a} → ${b}`;
    }
    if (dateMode === "month")
      return `Mes: ${MONTHS[monthYear.month]} ${monthYear.year}`;
    if (dateMode === "year") return `Año: ${yearOnly}`;
    return "";
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const YearPickerContent = ({
    selectedYear,
    onSelect,
    from = 2020,
    to = now.getFullYear() + 2,
  }) => {
    const years = [];
    for (let y = to; y >= from; y--) years.push(y);

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
    const orderId = String(item?.Orderid ?? "");
    const startLabel = formatDateDMY(item.start_date);
    const finishLabel = formatDateDMY(item.finish_date);
    const checked = !!selectedMap[orderId];

    return (
      <Pressable
        style={[
          styles.card,
          { borderLeftWidth: 4, borderLeftColor: FIORI.warn },
        ]}
        onPress={() => {
          if (selectMode) toggleSelect(orderId);
          else openDetalle(orderId);
        }}
      >
        <View style={styles.cardTopRow}>
          {selectMode ? (
            <CheckBox checked={checked} onPress={() => toggleSelect(orderId)} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: FIORI.warn }]} />
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              #{orderId} - {safeStr(item.order_type || "")}
            </Text>
            <Text style={styles.label}>
              Equipo: {safeStr(item.equipment || "—")}
            </Text>
            <Text style={styles.label}>Inicio: {startLabel}</Text>
            <Text style={styles.label}>Fin: {finishLabel}</Text>
            <Text style={styles.label}>Estatus: PENDIENTE DE FIRMA</Text>
          </View>
        </View>

        <View style={{ alignItems: "flex-end", marginTop: 10 }}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Requiere firma</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Pendiente de firma" />

      <View style={styles.filtersWrap}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por #, tipo, equipo, cliente…"
            placeholderTextColor={FIORI.textMuted}
            returnKeyType="search"
          />

          <TouchableOpacity
            style={[
              styles.actionBtn,
              selectMode ? styles.actionBtnDanger : styles.actionBtnPrimary,
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
              style={{ marginRight: 6 }}
            />
            <Text style={styles.actionBtnText}>
              {selectMode ? "Cancelar" : "Seleccionar"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, dateMode === "all" && styles.chipActive]}
            onPress={() => setDateMode("all")}
          >
            <Text
              style={[
                styles.chipText,
                dateMode === "all" && styles.chipTextActive,
              ]}
            >
              Todas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "day" && styles.chipActive]}
            onPress={() => {
              setDateMode("day");
              setShowDayPicker(true);
            }}
          >
            <Text
              style={[
                styles.chipText,
                dateMode === "day" && styles.chipTextActive,
              ]}
            >
              Día
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "weekRange" && styles.chipActive]}
            onPress={() => {
              setDateMode("weekRange");
              setShowWeekStartPicker(true);
            }}
          >
            <Text
              style={[
                styles.chipText,
                dateMode === "weekRange" && styles.chipTextActive,
              ]}
            >
              Semana
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "month" && styles.chipActive]}
            onPress={() => {
              setDateMode("month");
              setShowMonthModal(true);
            }}
          >
            <Text
              style={[
                styles.chipText,
                dateMode === "month" && styles.chipTextActive,
              ]}
            >
              Mes
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "year" && styles.chipActive]}
            onPress={() => {
              setDateMode("year");
              setShowYearModal(true);
            }}
          >
            <Text
              style={[
                styles.chipText,
                dateMode === "year" && styles.chipTextActive,
              ]}
            >
              Año
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.clearBtn}
            onPress={clearFilters}
            activeOpacity={0.85}
          >
            <Text style={styles.clearBtnText}>Limpiar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => fetchOrdenes0400({ isRefresh: true })}
            activeOpacity={0.85}
          >
            <Text style={styles.refreshBtnText}>Recargar</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.activeRangeText}>
          {activeRangeText} · {isOnline ? "Online" : "Offline"}
        </Text>

        <Text style={styles.hint}>
          Mostrando solo órdenes con estatus{" "}
          <Text style={{ fontWeight: "900" }}>Pendiente de firma</Text>.
          {selectMode ? (
            <>
              {" "}
              · Seleccionadas:{" "}
              <Text style={{ fontWeight: "900" }}>{selectedIds.length}</Text>
            </>
          ) : null}
          {selectMode && firmaDataUrl ? (
            <>
              {" "}
              ·{" "}
              <Text style={{ fontWeight: "900", color: FIORI.ok }}>
                Firma lista ✅
              </Text>
            </>
          ) : null}
          {selectMode && clienteEmail ? (
            <>
              {" "}
              · <Text style={{ fontWeight: "900" }}>{clienteEmail}</Text>
            </>
          ) : null}
        </Text>

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

        {dateMode === "weekRange" && (
          <View style={styles.rangeButtonsRow}>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]}
              onPress={() => setShowWeekStartPicker(true)}
            >
              <Text style={styles.smallBtnText}>
                Inicio: {weekStart ? weekStart.toLocaleDateString() : "—"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]}
              onPress={() => setShowWeekEndPicker(true)}
            >
              <Text style={styles.smallBtnText}>
                Fin: {weekEnd ? weekEnd.toLocaleDateString() : "—"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal
        visible={showMonthModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() =>
                  setMonthYear((s) => ({ ...s, year: s.year - 1 }))
                }
              >
                <Text style={styles.modalHeaderBtn}>{"‹"}</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>{monthYear.year}</Text>
              <TouchableOpacity
                onPress={() =>
                  setMonthYear((s) => ({ ...s, year: s.year + 1 }))
                }
              >
                <Text style={styles.modalHeaderBtn}>{"›"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.monthGrid}>
              {MONTHS.map((m, idx) => {
                const active = idx === monthYear.month && dateMode === "month";
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthCell, active && styles.monthCellActive]}
                    onPress={() => {
                      setMonthYear({ month: idx, year: monthYear.year });
                      setShowMonthModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.monthCellText,
                        active && styles.monthCellTextActive,
                      ]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowMonthModal(false)}
            >
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showYearModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalHeaderTitle, { marginBottom: 8 }]}>
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
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowYearModal(false)}
            >
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading && allOrdenes.length === 0 ? (
        <View style={{ paddingTop: 28, alignItems: "center" }}>
          <ActivityIndicator size="large" color={FIORI.accent} />
          <Text style={{ marginTop: 10, color: FIORI.textMuted }}>
            Cargando…
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, idx) => String(item?.Orderid ?? `row-${idx}`)}
          renderItem={renderItem}
          contentContainerStyle={{
            padding: 20,
            paddingTop: 10,
            paddingBottom: selectMode ? 190 : 90,
          }}
          refreshing={refreshing}
          onRefresh={() => fetchOrdenes0400({ isRefresh: true })}
          ListEmptyComponent={
            <Text
              style={{
                textAlign: "center",
                marginTop: 24,
                color: FIORI.textMuted,
              }}
            >
              No hay órdenes pendientes de firma con los filtros actuales.
            </Text>
          }
        />
      )}

      {selectMode ? (
        <View style={styles.bottomBar}>
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <TouchableOpacity
              style={[
                styles.bottomBtn,
                {
                  backgroundColor: FIORI.cardSubtle,
                  borderWidth: 1,
                  borderColor: FIORI.border,
                },
              ]}
              onPress={selectAllVisible}
              activeOpacity={0.85}
              disabled={sending}
            >
              <Ionicons
                name="list"
                size={18}
                color={FIORI.ink}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.bottomBtnText, { color: FIORI.ink }]}>
                Seleccionar todo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.bottomBtn,
                {
                  backgroundColor: selectedIds.length
                    ? FIORI.accent
                    : "#9AA5B1",
                },
              ]}
              onPress={startFirmaFlow}
              activeOpacity={0.85}
              disabled={!selectedIds.length || sending}
            >
              <Ionicons
                name="create-outline"
                size={18}
                color="#fff"
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.bottomBtnText, { color: "#fff" }]}>
                Agregar firma del cliente
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.bottomBtn,
                {
                  backgroundColor:
                    selectedIds.length &&
                    firmaDataUrl &&
                    isValidEmail(clienteEmail) &&
                    clienteNombre.trim() &&
                    clienteCargo.trim() &&
                    comentarioCliente.trim() &&
                    !sending
                      ? "#0B8457"
                      : "#9AA5B1",
                },
              ]}
              onPress={sendSelectedOrders}
              activeOpacity={0.85}
              disabled={
                !selectedIds.length ||
                !firmaDataUrl ||
                !isValidEmail(clienteEmail) ||
                !clienteNombre.trim() ||
                !clienteCargo.trim() ||
                !comentarioCliente.trim() ||
                sending
              }
            >
              <Ionicons
                name="cloud-upload-outline"
                size={18}
                color="#fff"
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.bottomBtnText, { color: "#fff" }]}>
                {sending ? "Enviando…" : "Enviar órdenes"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={{ marginTop: 8, color: FIORI.textMuted, fontSize: 12 }}>
            Seleccionadas:{" "}
            <Text style={{ fontWeight: "900" }}>{selectedIds.length}</Text>
            {firmaDataUrl ? (
              <>
                {" "}
                ·{" "}
                <Text style={{ fontWeight: "900", color: FIORI.ok }}>
                  Firma lista ✅
                </Text>
              </>
            ) : null}
            {clienteEmail ? (
              <>
                {" "}
                · Correo:{" "}
                <Text
                  style={{
                    fontWeight: "900",
                    color: isValidEmail(clienteEmail)
                      ? FIORI.ink
                      : FIORI.danger,
                  }}
                >
                  {clienteEmail}
                </Text>
              </>
            ) : (
              <>
                {" "}
                · Correo:{" "}
                <Text style={{ fontWeight: "900", color: FIORI.danger }}>
                  pendiente
                </Text>
              </>
            )}
          </Text>
        </View>
      ) : null}

      <Modal
        visible={showFirmaModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFirmaModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 520 }]}>
            <Text style={styles.modalTitle}>Firma del cliente</Text>
            <Text style={styles.modalSub}>
              Órdenes a firmar:{" "}
              <Text style={{ fontWeight: "900" }}>
                {firmaForOrderIds.length}
              </Text>
            </Text>

            <View style={{ marginTop: 12 }}>
              <Text
                style={{
                  color: FIORI.textMuted,
                  marginBottom: 6,
                  fontWeight: "700",
                }}
              >
                Correo del cliente (obligatorio)
              </Text>
              <TextInput
                value={clienteEmail}
                onChangeText={setClienteEmail}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={FIORI.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.emailInput}
              />
              {!!clienteEmail && !isValidEmail(clienteEmail) ? (
                <Text
                  style={{
                    marginTop: 6,
                    color: FIORI.danger,
                    fontSize: 12,
                    fontWeight: "800",
                  }}
                >
                  Escribe un correo válido.
                </Text>
              ) : null}
            </View>

            <View style={{ marginTop: 12 }}>
              <Text
                style={{
                  color: FIORI.textMuted,
                  marginBottom: 6,
                  fontWeight: "700",
                }}
              >
                Nombre del cliente (obligatorio)
              </Text>
              <TextInput
                value={clienteNombre}
                onChangeText={setClienteNombre}
                placeholder="Nombre y apellidos"
                placeholderTextColor={FIORI.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                style={styles.emailInput}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text
                style={{
                  color: FIORI.textMuted,
                  marginBottom: 6,
                  fontWeight: "700",
                }}
              >
                Cargo del cliente (obligatorio)
              </Text>
              <TextInput
                value={clienteCargo}
                onChangeText={setClienteCargo}
                placeholder="Ej. Administrador / Seguridad / Mantenimiento"
                placeholderTextColor={FIORI.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                style={styles.emailInput}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text
                style={{
                  color: FIORI.textMuted,
                  marginBottom: 6,
                  fontWeight: "700",
                }}
              >
                Comentarios del cliente (obligatorio)
              </Text>
              <TextInput
                value={comentarioCliente}
                onChangeText={setComentarioCliente}
                placeholder="Comentario del cliente para insertar en todos los PDFs"
                placeholderTextColor={FIORI.textMuted}
                multiline
                style={[
                  styles.emailInput,
                  {
                    minHeight: 90,
                    textAlignVertical: "top",
                    paddingTop: 10,
                  },
                ]}
              />
            </View>

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

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  {
                    backgroundColor: FIORI.cardSubtle,
                    borderWidth: 1,
                    borderColor: FIORI.border,
                  },
                ]}
                onPress={() => signatureRef.current?.clearSignature?.()}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={FIORI.ink}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.smallBtnText, { color: FIORI.ink }]}>
                  Limpiar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                onPress={() => {
                  const email = String(clienteEmail || "").trim();
                  const nombre = String(clienteNombre || "").trim();
                  const cargo = String(clienteCargo || "").trim();
                  const comentario = String(comentarioCliente || "").trim();

                  if (!email) {
                    Alert.alert(
                      "Falta correo",
                      "Escribe el correo del cliente antes de guardar la firma.",
                    );
                    return;
                  }
                  if (!isValidEmail(email)) {
                    Alert.alert(
                      "Correo inválido",
                      "Escribe un correo válido (ej: nombre@dominio.com).",
                    );
                    return;
                  }
                  if (!nombre) {
                    Alert.alert(
                      "Falta nombre",
                      "Escribe el nombre del cliente.",
                    );
                    return;
                  }
                  if (!cargo) {
                    Alert.alert("Falta cargo", "Escribe el cargo del cliente.");
                    return;
                  }
                  if (!comentario) {
                    Alert.alert(
                      "Falta comentario",
                      "Escribe el comentario del cliente.",
                    );
                    return;
                  }

                  signatureRef.current?.readSignature?.();
                }}
              >
                <Ionicons
                  name="checkmark-done-outline"
                  size={18}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                  Guardar firma
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  {
                    backgroundColor: FIORI.cardSubtle,
                    borderWidth: 1,
                    borderColor: FIORI.border,
                  },
                ]}
                onPress={() => setShowFirmaModal(false)}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={FIORI.ink}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.smallBtnText, { color: FIORI.ink }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={sending}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.blockBackdrop}>
          <View style={styles.blockCard}>
            <ActivityIndicator size="large" color={FIORI.accent} />
            <Text style={styles.blockTitle}>
              Enviando a SAP… ({sendProgress.done}/{sendProgress.total})
            </Text>
            <Text style={styles.blockSub}>
              Orden actual:{" "}
              <Text style={{ fontWeight: "900" }}>
                {sendProgress.current || "—"}
              </Text>
            </Text>

            {!!sendResults?.length && (
              <View style={{ marginTop: 10, width: "100%" }}>
                {sendResults.slice(-3).map((r) => (
                  <Text
                    key={`${r.orderId}-${r.ok ? "ok" : "fail"}`}
                    style={{
                      fontSize: 12,
                      color: r.ok ? FIORI.ok : FIORI.danger,
                      marginTop: 4,
                    }}
                  >
                    {r.ok ? "✅" : "❌"} {r.orderId}: {r.msg}
                  </Text>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },

  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: FIORI.cardBg,
    borderBottomColor: FIORI.border,
    borderBottomWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.03,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 1 },
    }),
  },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: {
    flex: 1,
    backgroundColor: FIORI.cardSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    color: FIORI.ink,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  actionBtnPrimary: { backgroundColor: FIORI.accent },
  actionBtnDanger: { backgroundColor: FIORI.danger },
  actionBtnText: { color: "#fff", fontWeight: "900" },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: FIORI.cardBg,
  },
  chipActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  chipText: { color: FIORI.ink, fontWeight: "600" },
  chipTextActive: { color: "#fff" },

  clearBtn: {
    backgroundColor: FIORI.neutralBtn,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  clearBtnText: { color: FIORI.ink, fontWeight: "600" },

  refreshBtn: {
    backgroundColor: FIORI.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  refreshBtnText: { color: "#fff", fontWeight: "700" },

  activeRangeText: { marginTop: 8, color: FIORI.textMuted, fontSize: 12 },
  hint: { marginTop: 10, color: FIORI.textMuted, fontSize: 12 },

  rangeButtonsRow: { flexDirection: "row", gap: 10, marginTop: 10 },

  card: {
    backgroundColor: FIORI.cardBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: FIORI.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },

  cardTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },

  title: { fontWeight: "900", fontSize: 16, color: FIORI.ink, marginBottom: 2 },
  label: { fontSize: 14, color: FIORI.textMuted },

  pill: {
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#CFE2FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: { fontSize: 12, fontWeight: "900", color: FIORI.ink },

  cbBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: FIORI.warn,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cbBoxChecked: { backgroundColor: FIORI.warn },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: FIORI.cardBg,
    borderTopWidth: 1,
    borderTopColor: FIORI.border,
  },
  bottomBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  bottomBtnText: { fontWeight: "900" },

  emailInput: {
    backgroundColor: FIORI.cardSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    color: FIORI.ink,
    borderWidth: 1,
    borderColor: FIORI.border,
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
    borderRadius: 14,
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
  modalHeaderTitle: { fontSize: 18, fontWeight: "700", color: FIORI.ink },
  modalHeaderBtn: {
    fontSize: 22,
    fontWeight: "900",
    color: FIORI.accent,
    paddingHorizontal: 12,
  },

  modalTitle: { fontSize: 18, fontWeight: "900", color: FIORI.ink },
  modalSub: { marginTop: 6, color: FIORI.textMuted },

  signatureWrap: {
    height: 260,
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
  },

  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  smallBtnText: { color: FIORI.ink, fontWeight: "600" },

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
  monthCellActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  monthCellText: { color: FIORI.ink, fontWeight: "600" },
  monthCellTextActive: { color: "#fff" },

  modalClose: {
    marginTop: 10,
    alignSelf: "flex-end",
    backgroundColor: FIORI.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalCloseText: { color: "#fff", fontWeight: "700" },

  yearItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  yearItemActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  yearItemText: { fontSize: 16, color: FIORI.ink, fontWeight: "600" },
  yearItemTextActive: { color: "#fff" },

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
  blockTitle: { marginTop: 10, fontWeight: "900", color: FIORI.ink },
  blockSub: {
    marginTop: 6,
    color: FIORI.textMuted,
    textAlign: "center",
    fontSize: 12,
  },
});
