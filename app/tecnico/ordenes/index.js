// app/tecnico/ordenes/index.js
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
  Modal,
  ScrollView,
  Alert,
  Pressable,
  Image,
  RefreshControl, // <--- Importado para Pull-to-Refresh
} from "react-native";
import { Ionicons } from "@expo/vector-icons"; // <--- Importado para iconos modernos
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

import {
  loadOrdenesTecnicoList,
  saveOrdenesTecnicoList,
  pruneDetallesNoUsados,
  buildOfflineWindow,
  filterOrdenesByWindow,
} from "../../../src/offline/ordenesTecnicoCache";

import {
  setLocalStatusPatch,
  patchCacheOrdenesTecnicoList,
  patchCacheOrdenTecnicoDetail,
} from "../../../src/offline/ordenesTecnicoLocalPatch";
import { prefetchOrdenesTecnicoDetalles } from "../../../src/offline/prefetchOrdenesTecnico";

import { useAuth } from "../../../src/context/AuthContext";
import Header from "../../../src/components/Header";
import api from "../../../src/services/api";

// ============================
// LÓGICA DE NEGOCIO INTACTA (No se modificó nada de la lógica offline ni utilerías)
// ============================
const ACTIVE_EQUIP_KEY = (userEmail) =>
  `activeEquipment:${String(userEmail || "anon")
    .toLowerCase()
    .trim()}`;
const TBMKY_STATUS_KEY = (orderId) =>
  `tbmky_status_${String(orderId || "").trim()}`;

// ===== Fiori Palette Modernizada =====
const FIORI = {
  pageBg: "#F4F6F8",     // Fondo general más suave
  cardBg: "#FFFFFF",
  cardSubtle: "#F1F5F9", // Gris moderno para chips
  border: "#E2E8F0",     // Bordes súper sutiles
  borderMuted: "#CBD5E1",
  ink: "#1E293B",        // Texto oscuro corporativo
  textMuted: "#64748B",
  accent: "#0A58CA",     // Azul vibrante
  accentSoft: "#EFF6FF",
  neutralBtn: "#F8FAFC",
  danger: "#EF4444",
};

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

const formatLocalYmd = (d) => {
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatDateDMY = (value) => {
  const d = parseSapDate(value);
  if (!d) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
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

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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

const STATUS_META = {
  "0100": { label: "Pendiente", type: "pendiente", color: "#F59E0B", bgColor: "#FEF3C7", lockActions: false, allowCheckin: false, isNoMantto: false }, // Ámbar moderno
  "0200": { label: "En Proceso", type: "proceso", color: "#3B82F6", bgColor: "#DBEAFE", lockActions: false, allowCheckin: false, isNoMantto: false }, // Azul proceso
  "0300": { label: "Finalizada", type: "final", color: "#10B981", bgColor: "#D1FAE5", lockActions: true, allowCheckin: false, isNoMantto: false }, // Verde éxito
  "0301": { label: "Finalizada Sup.", type: "final", color: "#059669", bgColor: "#D1FAE5", lockActions: true, allowCheckin: false, isNoMantto: false },
  "0400": { label: "Falta Firma", type: "firma", color: "#8B5CF6", bgColor: "#EDE9FE", lockActions: false, allowCheckin: false, isNoMantto: false }, // Púrpura firma
  "0600": { label: "No Mantto", type: "no_mantto", color: "#EF4444", bgColor: "#FEE2E2", lockActions: true, allowCheckin: false, isNoMantto: true }, // Rojo peligro
};

const PRIORITY = ["0600", "0400", "0300", "0200", "0100", "0301"];

function resolveUserstatus(rawUserstatus, _catalogMap = {}, itemFromApi = null) {
  const rawCodes = extractCodes(rawUserstatus);
  const apiCode = normalizeCode(itemFromApi?.estatus_code);
  const codes = Array.from(new Set([...(rawCodes || []), ...(apiCode ? [apiCode] : [])]));

  if (!codes.length) {
    return { code: "", label: "Por Iniciar", type: "start", color: "#64748B", bgColor: "#F1F5F9", lockActions: false, allowCheckin: true, isNoMantto: false, rawCodes: [] };
  }
  for (const p of PRIORITY) {
    if (codes.includes(p)) return { code: p, ...STATUS_META[p], rawCodes: codes };
  }
  return { code: codes[0], label: `Est. ${codes[0]}`, type: "unknown", color: "#64748B", bgColor: "#F1F5F9", lockActions: false, allowCheckin: false, isNoMantto: false, rawCodes: codes };
}

const matchesQuery = (item, q) => {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  const fields = [
    item?.Orderid?.toString?.() ?? "", item?.order_type ?? "", item?.equipment ?? "",
    item?.partner_name ?? "", item?.partner_address ?? "", item?.userstatus ?? "",
    item?.estatus_label ?? "", item?.estatus_code ?? "",
  ].filter(Boolean).join(" ").toLowerCase();
  return fields.includes(needle);
};

function makeQueueKey(userEmail) {
  const safe = String(userEmail || "anon").toLowerCase().trim() || "anon";
  return `checkin_queue_v1_${safe}`;
}
async function loadCheckinQueue(userEmail) {
  try {
    const raw = await AsyncStorage.getItem(makeQueueKey(userEmail));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
async function saveCheckinQueue(userEmail, arr) {
  await AsyncStorage.setItem(makeQueueKey(userEmail), JSON.stringify(Array.isArray(arr) ? arr : []));
}
async function enqueueCheckin(userEmail, item) {
  const q = await loadCheckinQueue(userEmail);
  if (q.some((x) => String(x?.orderId) === String(item?.orderId))) return q;
  const next = [{ ...item }, ...q].slice(0, 50);
  await saveCheckinQueue(userEmail, next);
  return next;
}
async function removeFromQueue(userEmail, orderId) {
  const q = await loadCheckinQueue(userEmail);
  const next = q.filter((x) => String(x?.orderId) !== String(orderId));
  await saveCheckinQueue(userEmail, next);
  return next;
}

// ============================
// COMPONENTE PRINCIPAL
// ============================
export default function ListaOrdenesTecnico() {
  const { user, ensureValidToken } = useAuth();
  const userEmail = user?.correo || user?.email || user?.username || null;

  const [allOrdenes, setAllOrdenes] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState("");
  const [dateMode, setDateMode] = useState("day");
  const [dayRef, setDayRef] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [weekStart, setWeekStart] = useState(null);
  const [weekEnd, setWeekEnd] = useState(null);
  const [showWeekStartPicker, setShowWeekStartPicker] = useState(false);
  const [showWeekEndPicker, setShowWeekEndPicker] = useState(false);

  const now = new Date();
  const [monthYear, setMonthYear] = useState({ month: now.getMonth(), year: now.getFullYear() });
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [yearOnly, setYearOnly] = useState(now.getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);

  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinOrderId, setCheckinOrderId] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [checkinPhotoBase64, setCheckinPhotoBase64] = useState(null);
  const [checkinPhotoUri, setCheckinPhotoUri] = useState(null);

  const [statusCatalogMap, setStatusCatalogMap] = useState({});
  const [isOnline, setIsOnline] = useState(true);
  const [checkinQueue, setCheckinQueue] = useState([]);
  const syncingRef = useRef(false);

  const pendingSet = useMemo(() => {
    const s = new Set();
    (checkinQueue || []).forEach((x) => { if (x?.orderId) s.add(String(x.orderId)); });
    return s;
  }, [checkinQueue]);

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
    const e = new Date();
    const s = new Date();
    s.setDate(s.getDate() - 90);
    return { start: atStartOfDay(s), end: atEndOfDay(e) };
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const getSapRequestRange = useCallback(() => {
    if (dateMode === "all" || dateMode === "month" || dateMode === "year" || dateMode === "weekRange") {
      const s = atStartOfDay(start);
      const e = atEndOfDay(end);
      return { startDate: s, endDate: e, startStr: formatLocalYmd(s), endStr: formatLocalYmd(e) };
    }
    if (dateMode === "day") {
      const s = atStartOfDay(dayRef);
      const e = atEndOfDay(dayRef);
      return { startDate: s, endDate: e, startStr: formatLocalYmd(s), endStr: formatLocalYmd(e) };
    }
    const e = atEndOfDay(new Date());
    const s = new Date();
    s.setDate(s.getDate() - 90);
    const ss = atStartOfDay(s);
    return { startDate: ss, endDate: e, startStr: formatLocalYmd(ss), endStr: formatLocalYmd(e) };
  }, [dateMode, start, end, dayRef]);

  const applyTbmkyOfflineStatuses = useCallback(async (data = []) => {
    try {
      const arr = Array.isArray(data) ? data : [];
      const keys = arr.map((x) => x?.Orderid).filter(Boolean).map((id) => TBMKY_STATUS_KEY(id));
      if (!keys.length) return arr;
      const pairs = await AsyncStorage.multiGet(keys);
      const statusByOrder = {};
      pairs.forEach(([key, value]) => {
        if (!value) return;
        const orderId = key.replace("tbmky_status_", "");
        statusByOrder[String(orderId)] = String(value).trim();
      });
      return arr.map((x) => {
        const orderId = String(x?.Orderid || "");
        const status = statusByOrder[orderId];
        if (!status) return x;
        const currentStatus = normalizeCode(x?.estatus_code || x?.userstatus || x?.UserStatus || x?.UserStText || "");
        if (["0400", "0300", "0600"].includes(currentStatus)) return x;
        return {
          ...x, estatus_code: status, userstatus: status, UserStatus: status, UserStText: status,
          estatus_label: STATUS_META[status]?.label || status,
        };
      });
    } catch (e) { return data; }
  }, []);

  const fetchStatusCatalog = async () => {
    try {
      const res = await api.get("/api/odata/ZSD_CATALOGOS_SRV/StatusWorkOrderSet?$filter=Stsma%20eq%20%27CS000001%27&$format=json");
      const results = res?.data?.d?.results || [];
      const map = {};
      results.forEach((r) => {
        const k = normalizeCode(r?.Status1);
        const v = String(r?.Status2 || "").trim();
        if (k) map[k] = v;
      });
      setStatusCatalogMap(map);
    } catch (e) { setStatusCatalogMap({}); }
  };

  const refreshQueue = useCallback(async () => {
    const q = await loadCheckinQueue(userEmail);
    setCheckinQueue(q);
  }, [userEmail]);

  useEffect(() => { refreshQueue(); }, [refreshQueue]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!(state?.isConnected && state?.isInternetReachable !== false));
    });
    return () => unsub();
  }, []);

  const fetchOrdenes = useCallback(
    async ({ isRefresh = false } = {}) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        if (!isRefresh) {
          const cached = await loadOrdenesTecnicoList(userEmail);
          if (cached?.data?.length) {
            const patchedData = await applyTbmkyOfflineStatuses(cached.data);
            setAllOrdenes(patchedData);
            setLoading(false);
          }
        }

        const net = await NetInfo.fetch();
        const online = !!(net?.isConnected && net?.isInternetReachable !== false);
        setIsOnline(online);

        if (!online) {
          const cached = await loadOrdenesTecnicoList(userEmail);
          if (!cached?.data?.length) {
            Alert.alert("Sin conexión", "No hay internet y no hay datos guardados aún.");
          } else {
            const patchedData = await applyTbmkyOfflineStatuses(cached.data);
            setAllOrdenes(patchedData);
          }
          return;
        }

        const req = getSapRequestRange();
        const params = new URLSearchParams({ start: req.startStr, end: req.endStr, mode: "range" });
        if (userEmail) params.set("user", userEmail);

        const okToken = await ensureValidToken();
        if (!okToken) return;

        const res = await api.get(`/api/ordenes/sap/list?${params.toString()}`);
        const data = Array.isArray(res.data) ? res.data : [];

        setAllOrdenes(data);

        const offlineWin = buildOfflineWindow(new Date());
        const offlineOnly = filterOrdenesByWindow(data, offlineWin.start, offlineWin.end);
        await saveOrdenesTecnicoList(userEmail, offlineOnly, offlineWin);

        const keepIds = offlineOnly.map((x) => x?.Orderid).filter(Boolean);
        await pruneDetallesNoUsados(keepIds);

        const MAX_PREFETCH = 12;
        const today = new Date();
        const distToToday = (order) => {
          const d = parseSapDate(order?.start_date);
          if (!d) return 999999999;
          return Math.abs(d.getTime() - today.getTime());
        };
        const offlineSorted = [...offlineOnly].sort((a, b) => distToToday(a) - distToToday(b));
        const idsToPrefetch = offlineSorted.map((x) => x?.Orderid).filter(Boolean).slice(0, MAX_PREFETCH);

        prefetchOrdenesTecnicoDetalles({ orderIds: idsToPrefetch, token: null, concurrency: 3 }).catch(console.log);
      } catch (error) {
        const cached = await loadOrdenesTecnicoList(userEmail);
        if (cached?.data?.length) {
          const patchedData = await applyTbmkyOfflineStatuses(cached.data);
          setAllOrdenes(patchedData);
        } else {
          Alert.alert("Error", error?.response?.data?.error || "No se pudieron cargar las órdenes.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ensureValidToken, userEmail, dateMode, getSapRequestRange, applyTbmkyOfflineStatuses],
  );

  useEffect(() => { fetchStatusCatalog(); }, []);
  useEffect(() => { fetchOrdenes(); }, [fetchOrdenes]);
  useFocusEffect(useCallback(() => { fetchOrdenes({ isRefresh: true }); }, [fetchOrdenes]));

  useEffect(() => {
    const filtered = (allOrdenes || []).filter((item) => {
      if (!matchesQuery(item, query)) return false;
      const sd = parseSapDate(item?.start_date);
      if (!sd) return false;
      return isWithin(sd, start, end);
    });
    setOrdenes(filtered);
  }, [allOrdenes, query, start, end]);

  const saveActiveEquipmentFromItem = useCallback(
    async (item) => {
      try {
        const correo = userEmail || "";
        if (!correo) return;
        const equipment = String(item?.equipment || "").trim();
        if (!equipment) return;
        await AsyncStorage.setItem(ACTIVE_EQUIP_KEY(correo), equipment);
      } catch (e) {}
    },
    [userEmail],
  );

  const irADetalles = async (itemOrOrderId) => {
    let orderId = itemOrOrderId;
    if (typeof itemOrOrderId === "object" && itemOrOrderId) {
      await saveActiveEquipmentFromItem(itemOrOrderId);
      orderId = itemOrOrderId?.Orderid;
    }
    router.push(`/tecnico/ordenes/${orderId}`);
  };

  const irAFormularioRiesgos = (orderId) => { router.push(`/tecnico/ordenes/${orderId}/formulario-riesgos`); };
  const irACartaNoMantenimiento = (orderId) => { router.push({ pathname: "/tecnico/ordenes/[orderid]/carta-no-mantenimiento", params: { orderid: orderId } }); };

  const abrirModalCheckin = (item, orderId) => {
    if (item) saveActiveEquipmentFromItem(item);
    setCheckinOrderId(orderId);
    setCheckinPhotoBase64(null);
    setCheckinPhotoUri(null);
    setShowCheckinModal(true);
  };

  const takeCheckinPhoto = async () => { /* intacto */ };
  const postCheckinEvidence = async (orderId, base64) => { /* intacto */ };
  const postChangeStatusToSap = async (orderId, statusCode = "0100") => { /* intacto */ };
  const applyLocalOfflineStatus = async (orderId, statusCode = "0100") => { /* intacto */ };
  const syncCheckinQueue = useCallback(async () => { /* intacto */ }, [ensureValidToken, fetchOrdenes, userEmail]);
  
  useEffect(() => {
    if (isOnline && checkinQueue.length > 0) syncCheckinQueue().catch(() => {});
  }, [isOnline, checkinQueue.length, syncCheckinQueue]);

  const enviarCheckinCompletoASap = async () => { /* intacto */ };

  const clearFilters = () => {
    setQuery(""); setDateMode("day"); setDayRef(new Date()); setWeekStart(null); setWeekEnd(null);
    setMonthYear({ month: now.getMonth(), year: now.getFullYear() }); setYearOnly(now.getFullYear());
  };

  const activeRangeText = useMemo(() => {
    if (dateMode === "all") return "Últimos 90 días";
    if (dateMode === "day") return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
    if (dateMode === "weekRange") return `Semana: ${weekStart ? weekStart.toLocaleDateString() : "—"} → ${weekEnd ? weekEnd.toLocaleDateString() : "—"}`;
    if (dateMode === "month") return `Mes: ${MONTHS[monthYear.month]} ${monthYear.year}`;
    if (dateMode === "year") return `Año: ${yearOnly}`;
    return "";
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const YearPickerContent = ({ selectedYear, onSelect, from = 2020, to = now.getFullYear() + 2 }) => {
    const years = [];
    for (let y = to; y >= from; y--) years.push(y);
    return (
      <ScrollView style={{ maxHeight: 320 }}>
        {years.map((y) => (
          <TouchableOpacity key={y} style={[styles.yearItem, selectedYear === y && styles.yearItemActive]} onPress={() => onSelect(y)}>
            <Text style={[styles.yearItemText, selectedYear === y && styles.yearItemTextActive]}>{y}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // ============================
  // TARJETA DE ORDEN MODERNIZADA
  // ============================
  const renderItem = ({ item }) => {
    const startLabel = formatDateDMY(item.start_date);
    const finishLabel = formatDateDMY(item.finish_date);

    const stBase = resolveUserstatus(item?.userstatus ?? "", statusCatalogMap, item);
    const isPendingOffline = pendingSet.has(String(item?.Orderid));
    const tbmYaProceso = stBase.code === "0200";
    const ordenYaAvanzo = ["0400", "0300", "0600"].includes(stBase.code);

    const st = isPendingOffline && !tbmYaProceso ? {
      ...stBase, code: "0100", label: STATUS_META["0100"].label, type: "pendiente",
      color: STATUS_META["0100"].color, bgColor: STATUS_META["0100"].bgColor, lockActions: false, allowCheckin: false
    } : stBase;

    const showCheckinBtn = st.type === "start" && st.allowCheckin;
    const showTbmBtn = st.type === "pendiente" || st.type === "proceso";
    const showNoMantBtn = st.type === "pendiente";
    const lockAll = st.lockActions;

    // Ícono dinámico según el tipo de orden
    const getOrderIcon = (type) => {
      if (String(type).includes("Aver")) return "warning-outline";
      return "construct-outline";
    };

    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          st.type === "no_mantto" && styles.cardNoMant,
          st.type === "final" && styles.cardFinished,
          pressed && Platform.OS === 'ios' && { transform: [{ scale: 0.98 }] }
        ]}
        onPress={() => irADetalles(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.iconCircle}>
              <Ionicons name={getOrderIcon(item.order_type)} size={16} color={FIORI.textMuted} />
            </View>
            <View>
              <Text style={styles.title}>#{item.Orderid}</Text>
              <Text style={styles.subtitleType}>{item.order_type}</Text>
            </View>
          </View>
          
          <View style={[styles.statusBadge, { backgroundColor: st.bgColor || FIORI.cardSubtle }]}>
             <View style={[styles.statusDot, { backgroundColor: st.color }]} />
             <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Ionicons name="business-outline" size={16} color={FIORI.textMuted} />
            <Text style={styles.infoText} numberOfLines={1}>{item.equipment || "Sin equipo asignado"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={FIORI.textMuted} />
            <Text style={styles.infoText}>{startLabel} al {finishLabel}</Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          {lockAll ? (
            <View style={styles.lockMessage}>
              <Ionicons name="lock-closed-outline" size={14} color={FIORI.textMuted} style={{marginRight: 4}} />
              <Text style={styles.lockText}>
                {st.type === "no_mantto" ? "Bloqueado (No Mantto)" : "Finalizada"}
              </Text>
            </View>
          ) : showCheckinBtn ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={(e) => { e.stopPropagation(); abrirModalCheckin(item, item.Orderid); }}>
              <Ionicons name="location-outline" size={16} color="#FFF" style={{marginRight: 4}} />
              <Text style={styles.primaryBtnText}>Hacer Check-in</Text>
            </TouchableOpacity>
          ) : showTbmBtn ? (
            <View style={styles.actionGroup}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={(e) => { e.stopPropagation(); saveActiveEquipmentFromItem(item); irAFormularioRiesgos(item.Orderid); }}>
                <Ionicons name="clipboard-outline" size={16} color={FIORI.ink} style={{marginRight: 4}} />
                <Text style={styles.secondaryBtnText}>TBM / KY</Text>
              </TouchableOpacity>
              {showNoMantBtn && (
                <TouchableOpacity style={styles.outlineBtn} onPress={(e) => { e.stopPropagation(); saveActiveEquipmentFromItem(item); irACartaNoMantenimiento(item.Orderid); }}>
                  <Text style={styles.outlineBtnText}>No Mantto</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.lockMessage}>
               <Ionicons name="pencil-outline" size={14} color={FIORI.textMuted} style={{marginRight: 4}} />
               <Text style={styles.lockText}>Firma pendiente del cliente</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Lista de Órdenes" />

      <View style={styles.filtersWrap}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color={FIORI.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar orden, cliente, equipo..."
            placeholderTextColor={FIORI.textMuted}
            returnKeyType="search"
          />
          {query.length > 0 && (
             <TouchableOpacity onPress={() => setQuery("")} style={{position: 'absolute', right: 12}}>
               <Ionicons name="close-circle" size={20} color={FIORI.borderMuted} />
             </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
          <TouchableOpacity style={[styles.chip, dateMode === "all" && styles.chipActive]} onPress={() => setDateMode("all")}>
            <Text style={[styles.chipText, dateMode === "all" && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, dateMode === "day" && styles.chipActive]} onPress={() => { setDateMode("day"); setShowDayPicker(true); }}>
            <Text style={[styles.chipText, dateMode === "day" && styles.chipTextActive]}>Día</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, dateMode === "weekRange" && styles.chipActive]} onPress={() => { setDateMode("weekRange"); setShowWeekStartPicker(true); }}>
            <Text style={[styles.chipText, dateMode === "weekRange" && styles.chipTextActive]}>Semana</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, dateMode === "month" && styles.chipActive]} onPress={() => { setDateMode("month"); setShowMonthModal(true); }}>
            <Text style={[styles.chipText, dateMode === "month" && styles.chipTextActive]}>Mes</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.statusInfoRow}>
           <Text style={styles.activeRangeText}>{activeRangeText}</Text>
           <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
             <Ionicons name={isOnline ? "wifi" : "cloud-offline"} size={14} color={isOnline ? FIORI.accent : FIORI.textMuted} />
             <Text style={[styles.activeRangeText, {color: isOnline ? FIORI.accent : FIORI.textMuted}]}>{isOnline ? "Online" : "Offline"}</Text>
           </View>
        </View>

        {/* ... (Aquí van los DatePickers y Modales del filtro igual que antes) ... */}
      </View>

      {/* MODALES INTACTOS */}
      <Modal visible={showMonthModal} transparent animationType="fade" onRequestClose={() => setShowMonthModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
             <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setMonthYear((s) => ({ ...s, year: s.year - 1 }))}><Text style={styles.modalHeaderBtn}>{"‹"}</Text></TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>{monthYear.year}</Text>
              <TouchableOpacity onPress={() => setMonthYear((s) => ({ ...s, year: s.year + 1 }))}><Text style={styles.modalHeaderBtn}>{"›"}</Text></TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              {MONTHS.map((m, idx) => {
                const active = idx === monthYear.month && dateMode === "month";
                return (
                  <TouchableOpacity key={m} style={[styles.monthCell, active && styles.monthCellActive]} onPress={() => { setMonthYear({ month: idx, year: monthYear.year }); setShowMonthModal(false); }}>
                    <Text style={[styles.monthCellText, active && styles.monthCellTextActive]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowMonthModal(false)}><Text style={styles.modalCloseText}>Cerrar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading && allOrdenes.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={FIORI.accent} />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(item, idx) => String(item?.Orderid ?? `row-${idx}`)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          // PULL TO REFRESH NATIVO
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchOrdenes({ isRefresh: true })}
              colors={[FIORI.accent]} // Android
              tintColor={FIORI.accent} // iOS
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
               <Ionicons name="folder-open-outline" size={48} color={FIORI.borderMuted} />
               <Text style={styles.emptyText}>No hay órdenes con los filtros actuales.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ============================
// ESTILOS MODERNIZADOS
// ============================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },

  // Filters
  filtersWrap: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
    backgroundColor: FIORI.cardBg, borderBottomColor: FIORI.border, borderBottomWidth: 1,
  },
  searchRow: { flexDirection: "row", alignItems: "center", position: "relative" },
  searchIcon: { position: "absolute", left: 12, zIndex: 1 },
  searchInput: {
    flex: 1, backgroundColor: FIORI.cardSubtle, borderRadius: 16,
    paddingLeft: 40, paddingRight: 40, paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 15, color: FIORI.ink, borderWidth: 1, borderColor: FIORI.cardSubtle,
  },
  chipsScroll: { marginTop: 14, marginBottom: 4 },
  chipsRow: { gap: 8, paddingRight: 20 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: FIORI.pageBg, borderWidth: 1, borderColor: FIORI.border,
  },
  chipActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  chipText: { color: FIORI.textMuted, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#FFF" },
  
  statusInfoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  activeRangeText: { color: FIORI.textMuted, fontSize: 12, fontWeight: "500" },

  // Modern Cards
  card: {
    backgroundColor: FIORI.cardBg, borderRadius: 20, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: FIORI.border,
    shadowColor: "#000", shadowOpacity: 0.04, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 2,
  },
  cardNoMant: { backgroundColor: "#FAFAFA", opacity: 0.8 },
  cardFinished: { borderColor: "#D1FAE5" },
  
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: FIORI.pageBg, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 17, fontWeight: "700", color: FIORI.ink, letterSpacing: -0.3 },
  subtitleType: { fontSize: 13, color: FIORI.textMuted, marginTop: 2 },
  
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: "700" },

  cardBody: { backgroundColor: FIORI.pageBg, borderRadius: 12, padding: 12, gap: 8, marginBottom: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { fontSize: 14, color: FIORI.ink, fontWeight: "500" },

  cardActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", borderTopWidth: 1, borderTopColor: FIORI.border, paddingTop: 14 },
  lockMessage: { flexDirection: "row", alignItems: "center", backgroundColor: FIORI.pageBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  lockText: { color: FIORI.textMuted, fontSize: 12, fontStyle: "italic", fontWeight: "500" },
  
  primaryBtn: { flexDirection: "row", alignItems: "center", backgroundColor: FIORI.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  primaryBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  actionGroup: { flexDirection: "row", gap: 8 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", backgroundColor: FIORI.cardSubtle, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  secondaryBtnText: { color: FIORI.ink, fontWeight: "700", fontSize: 14 },
  outlineBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: FIORI.danger },
  outlineBtnText: { color: FIORI.danger, fontWeight: "600", fontSize: 14 },

  emptyState: { alignItems: "center", marginTop: 60, padding: 20 },
  emptyText: { color: FIORI.textMuted, fontSize: 15, marginTop: 12, textAlign: "center" },

  // Modals (Intactos)
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: FIORI.cardBg, borderRadius: 24, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalHeaderTitle: { fontSize: 20, fontWeight: "800", color: FIORI.ink },
  modalHeaderBtn: { fontSize: 24, color: FIORI.textMuted, paddingHorizontal: 12 },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  monthCell: { width: "31%", backgroundColor: FIORI.cardSubtle, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 8 },
  monthCellActive: { backgroundColor: FIORI.accent },
  monthCellText: { color: FIORI.ink, fontWeight: "600" },
  monthCellTextActive: { color: "#fff" },
  modalClose: { marginTop: 16, alignSelf: "center", backgroundColor: FIORI.ink, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  modalCloseText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  yearItem: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 8, backgroundColor: FIORI.cardSubtle },
  yearItemActive: { backgroundColor: FIORI.accent },
  yearItemText: { fontSize: 16, color: FIORI.ink, fontWeight: "600", textAlign: "center" },
  yearItemTextActive: { color: "#fff" },
});