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
} from "react-native";
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
// Prefetch de detalles (para no entrar a cada orden)
import { prefetchOrdenesTecnicoDetalles } from "../../../src/offline/prefetchOrdenesTecnico";

import { useAuth } from "../../../src/context/AuthContext";
import Header from "../../../src/components/Header";
import api from "../../../src/services/api";

// ============================
// Guarda EQUIPO activo para geolocalización
// UbicacionContext leerá esta key:
//   activeEquipment:<correo> => equipment
// ============================
const ACTIVE_EQUIP_KEY = (userEmail) =>
  `activeEquipment:${String(userEmail || "anon")
    .toLowerCase()
    .trim()}`;
const TBMKY_STATUS_KEY = (orderId) =>
  `tbmky_status_${String(orderId || "").trim()}`;
// ===== Fiori Palette =====
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
  danger: "#EB5757",
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

/* =========================
   Reglas de Userstatus
   ========================= */
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
  "0100": {
    label: "PENDIENTE",
    type: "pendiente",
    color: "#D64545",
    lockActions: false,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0200": {
    label: "EN PROCESO",
    type: "proceso",
    color: "#D49C00",
    lockActions: false,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0300": {
    label: "FINALIZADA",
    type: "final",
    color: "#27AE60",
    lockActions: true,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0301": {
    label: "FINALIZADA SUPER",
    type: "final",
    color: "#025f29",
    lockActions: true,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0400": {
    label: "PENDIENTE DE FIRMA",
    type: "firma",
    color: "#2D9CDB",
    lockActions: false,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0600": {
    label: "Carta No Mantto",
    type: "no_mantto",
    color: "#b90909",
    lockActions: true,
    allowCheckin: false,
    isNoMantto: true,
  },
};

const PRIORITY = ["0600", "0400", "0300", "0200", "0100", "0301"];

function resolveUserstatus(
  rawUserstatus,
  _catalogMap = {},
  itemFromApi = null,
) {
  const rawCodes = extractCodes(rawUserstatus);
  const apiCode = normalizeCode(itemFromApi?.estatus_code);

  const codes = Array.from(
    new Set([...(rawCodes || []), ...(apiCode ? [apiCode] : [])]),
  );

  if (!codes.length) {
    return {
      code: "",
      label: "Sin empezar",
      type: "start",
      color: "#6A7381",
      lockActions: false,
      allowCheckin: true,
      isNoMantto: false,
      rawCodes: [],
    };
  }

  for (const p of PRIORITY) {
    if (codes.includes(p)) {
      return {
        code: p,
        ...STATUS_META[p],
        rawCodes: codes,
      };
    }
  }

  return {
    code: codes[0],
    label: `Estatus ${codes.join(", ")}`,
    type: "unknown",
    color: "#6A7381",
    lockActions: false,
    allowCheckin: false,
    isNoMantto: false,
    rawCodes: codes,
  };
}

/* =========================
   Search
   ========================= */
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

/* =========================
   CHECKIN OFFLINE QUEUE
   ========================= */
function makeQueueKey(userEmail) {
  const safe =
    String(userEmail || "anon")
      .toLowerCase()
      .trim() || "anon";

  return `checkin_queue_v1_${safe}`;
}

async function loadCheckinQueue(userEmail) {
  try {
    const key = makeQueueKey(userEmail);
    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];

    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveCheckinQueue(userEmail, arr) {
  const key = makeQueueKey(userEmail);

  await AsyncStorage.setItem(
    key,
    JSON.stringify(Array.isArray(arr) ? arr : []),
  );
}

async function enqueueCheckin(userEmail, item) {
  const q = await loadCheckinQueue(userEmail);

  // evita duplicados por OrderId
  const exists = q.some((x) => String(x?.orderId) === String(item?.orderId));
  if (exists) return q;

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

  const [monthYear, setMonthYear] = useState({
    month: now.getMonth(),
    year: now.getFullYear(),
  });

  const [showMonthModal, setShowMonthModal] = useState(false);

  const [yearOnly, setYearOnly] = useState(now.getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);

  // check-in modal + foto
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinOrderId, setCheckinOrderId] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [checkinPhotoBase64, setCheckinPhotoBase64] = useState(null);
  const [checkinPhotoUri, setCheckinPhotoUri] = useState(null);

  // catálogo status
  const [statusCatalogMap, setStatusCatalogMap] = useState({});

  // estado red + cola
  const [isOnline, setIsOnline] = useState(true);
  const [checkinQueue, setCheckinQueue] = useState([]);
  const syncingRef = useRef(false);

  const pendingSet = useMemo(() => {
    const s = new Set();

    (checkinQueue || []).forEach((x) => {
      if (x?.orderId) s.add(String(x.orderId));
    });

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

    // "all" = últimos 90 días
    const e = new Date();
    const s = new Date();
    s.setDate(s.getDate() - 90);

    return { start: atStartOfDay(s), end: atEndOfDay(e) };
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  // define el rango REAL que le vas a pedir a SAP según el filtro
  const getSapRequestRange = useCallback(() => {
    if (
      dateMode === "all" ||
      dateMode === "month" ||
      dateMode === "year" ||
      dateMode === "weekRange"
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

    const e = atEndOfDay(new Date());
    const s = new Date();
    s.setDate(s.getDate() - 90);
    const ss = atStartOfDay(s);

    return {
      startDate: ss,
      endDate: e,
      startStr: formatLocalYmd(ss),
      endStr: formatLocalYmd(e),
    };
  }, [dateMode, start, end, dayRef]);
  const applyTbmkyOfflineStatuses = useCallback(async (data = []) => {
    try {
      const arr = Array.isArray(data) ? data : [];

      const keys = arr
        .map((x) => x?.Orderid)
        .filter(Boolean)
        .map((id) => TBMKY_STATUS_KEY(id));

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

        const currentStatus = normalizeCode(
          x?.estatus_code ||
            x?.userstatus ||
            x?.UserStatus ||
            x?.UserStText ||
            "",
        );

        // Si la orden ya avanzó a 0400, 0300 o 0600,
        // NO permitas que tbmky_status_ la regrese a 0200.
        if (["0400", "0300", "0600"].includes(currentStatus)) {
          return x;
        }

        return {
          ...x,
          estatus_code: status,
          userstatus: status,
          UserStatus: status,
          UserStText: status,
          estatus_label: STATUS_META[status]?.label || status,
        };
      });
    } catch (e) {
      console.log("[ORDENES][TBMKY_STATUS] error:", e?.message || e);
      return data;
    }
  }, []);
  const fetchStatusCatalog = async () => {
    try {
      const res = await api.get(
        "/api/odata/ZSD_CATALOGOS_SRV/StatusWorkOrderSet?$filter=Stsma%20eq%20%27CS000001%27&$format=json",
      );

      const results = res?.data?.d?.results || [];
      const map = {};

      results.forEach((r) => {
        const k = normalizeCode(r?.Status1);
        const v = String(r?.Status2 || "").trim();

        if (k) map[k] = v;
      });

      setStatusCatalogMap(map);
    } catch (e) {
      console.log(
        "Error catálogo estatus:",
        e?.response?.data || e?.message || e,
      );
      setStatusCatalogMap({});
    }
  };

  const refreshQueue = useCallback(async () => {
    const q = await loadCheckinQueue(userEmail);
    setCheckinQueue(q);
  }, [userEmail]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // escuchar red
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const onlineNow = !!(
        state?.isConnected && state?.isInternetReachable !== false
      );

      setIsOnline(onlineNow);
    });

    return () => unsub();
  }, []);

  /**
   * REGLA CLAVE:
   * - ONLINE: muestra TODO lo que regrese SAP según filtros
   * - OFFLINE CACHE: guarda SOLO ventana hoy±8 días
   */
  const fetchOrdenes = useCallback(
    async ({ isRefresh = false } = {}) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        // 0) Carga rápida desde cache SOLO si NO es refresh
        if (!isRefresh) {
          const cached = await loadOrdenesTecnicoList(userEmail);

          if (cached?.data?.length) {
            const patchedData = await applyTbmkyOfflineStatuses(cached.data);
            setAllOrdenes(patchedData);
            setLoading(false);
          }
        }

        // 1) ¿hay internet?
        const net = await NetInfo.fetch();
        const online = !!(
          net?.isConnected && net?.isInternetReachable !== false
        );

        setIsOnline(online);

        // 2) OFFLINE: usa cache
        if (!online) {
          const cached = await loadOrdenesTecnicoList(userEmail);

          if (!cached?.data?.length) {
            Alert.alert(
              "Sin conexión",
              "No hay internet y no hay datos guardados aún.",
            );
          } else {
            const patchedData = await applyTbmkyOfflineStatuses(cached.data);
            setAllOrdenes(patchedData);
          }

          return;
        }

        // 3) ONLINE: pide rango REAL según filtros
        const req = getSapRequestRange();

        console.log("[ORDENES] Request SAP range:", {
          dateMode,
          start: req.startStr,
          end: req.endStr,
          user: userEmail,
        });

        const params = new URLSearchParams({
          start: req.startStr,
          end: req.endStr,
          mode: "range",
        });

        if (userEmail) params.set("user", userEmail);

        const okToken = await ensureValidToken();
        if (!okToken) return;

        const res = await api.get(`/api/ordenes/sap/list?${params.toString()}`);
        const data = Array.isArray(res.data) ? res.data : [];

        // 4) UI: muestra TODO lo de SAP
        setAllOrdenes(data);

        // 5) OFFLINE CACHE: guarda SOLO ventana hoy±8
        const offlineWin = buildOfflineWindow(new Date());

        const offlineOnly = filterOrdenesByWindow(
          data,
          offlineWin.start,
          offlineWin.end,
        );

        await saveOrdenesTecnicoList(userEmail, offlineOnly, offlineWin);

        // 6) Limpieza: conserva detalles solo de órdenes en ventana
        const keepIds = offlineOnly.map((x) => x?.Orderid).filter(Boolean);
        await pruneDetallesNoUsados(keepIds);

        // 7) PREFETCH: SOLO ventana y poquitos
        const MAX_PREFETCH = 12;

        const today = new Date();

        const distToToday = (order) => {
          const d = parseSapDate(order?.start_date);
          if (!d) return 999999999;
          return Math.abs(d.getTime() - today.getTime());
        };

        const offlineSorted = [...offlineOnly].sort(
          (a, b) => distToToday(a) - distToToday(b),
        );

        const idsToPrefetch = offlineSorted
          .map((x) => x?.Orderid)
          .filter(Boolean)
          .slice(0, MAX_PREFETCH);

        prefetchOrdenesTecnicoDetalles({
          orderIds: idsToPrefetch,
          token: null,
          concurrency: 3,
        }).catch((e) =>
          console.log("prefetchOrdenesTecnicoDetalles ERROR:", e?.message || e),
        );
      } catch (error) {
        console.error(
          "Error al cargar órdenes (SAP):",
          error?.response?.data || error,
        );

        const cached = await loadOrdenesTecnicoList(userEmail);

        if (cached?.data?.length) {
          const patchedData = await applyTbmkyOfflineStatuses(cached.data);
          setAllOrdenes(patchedData);
        } else {
          const serverMsg =
            error?.response?.data?.error ||
            "No se pudieron cargar las órdenes desde SAP";

          Alert.alert("Error", serverMsg);
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
      getSapRequestRange,
      applyTbmkyOfflineStatuses,
    ],
  );

  // catálogo una vez
  useEffect(() => {
    fetchStatusCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // órdenes cada vez que cambie filtro
  useEffect(() => {
    fetchOrdenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrdenes]);

  useFocusEffect(
    useCallback(() => {
      fetchOrdenes({ isRefresh: true });
    }, [fetchOrdenes]),
  );

  // filtrar en memoria
  useEffect(() => {
    const filtered = (allOrdenes || []).filter((item) => {
      const okQuery = matchesQuery(item, query);
      if (!okQuery) return false;

      const sd = parseSapDate(item?.start_date);
      if (!sd) return false;

      return isWithin(sd, start, end);
    });

    setOrdenes(filtered);
  }, [allOrdenes, query, start, end]);

  // ===========================
  // GUARDAR EQUIPO ACTIVO
  // ===========================
  const saveActiveEquipmentFromItem = useCallback(
    async (item) => {
      try {
        const correo = userEmail || "";
        if (!correo) return;

        const equipment = String(item?.equipment || "").trim();
        if (!equipment) return;

        await AsyncStorage.setItem(ACTIVE_EQUIP_KEY(correo), equipment);

        console.log("[ORDENES] active equipment saved:", equipment);
      } catch (e) {
        console.log("[ORDENES] saveActiveEquipment error:", e?.message || e);
      }
    },
    [userEmail],
  );

  const irADetalles = async (itemOrOrderId) => {
    let orderId = itemOrOrderId;

    if (typeof itemOrOrderId === "object" && itemOrOrderId) {
      await saveActiveEquipmentFromItem(itemOrOrderId);
      orderId = itemOrOrderId?.Orderid;
    }

    const id = String(orderId);
    router.push(`/tecnico/ordenes/${id}`);
  };

  const irAFormularioRiesgos = (orderId) => {
    const id = String(orderId);
    router.push(`/tecnico/ordenes/${id}/formulario-riesgos`);
  };

  const irACartaNoMantenimiento = (orderId) => {
    const id = String(orderId);

    router.push({
      pathname: "/tecnico/ordenes/[orderid]/carta-no-mantenimiento",
      params: { orderid: id },
    });
  };

  const abrirModalCheckin = (item, orderId) => {
    if (item) saveActiveEquipmentFromItem(item);

    setCheckinOrderId(orderId);
    setCheckinPhotoBase64(null);
    setCheckinPhotoUri(null);
    setShowCheckinModal(true);
  };

  // cámara -> base64
  const takeCheckinPhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();

      if (!perm.granted) {
        Alert.alert(
          "Permiso requerido",
          "Necesitamos permiso de cámara para tomar la evidencia.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: false,
        allowsEditing: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];

      if (!asset?.uri) {
        Alert.alert("Error", "No se pudo obtener la foto.");
        return;
      }

      const MAX_BASE64_LENGTH = 4_000_000;

      const opcionesCompresion = [
        { width: 1280, compress: 0.7 },
        { width: 1180, compress: 0.65 },
        { width: 1080, compress: 0.6 },
        { width: 960, compress: 0.55 },
        { width: 850, compress: 0.5 },
        { width: 720, compress: 0.45 },
      ];

      let manipulated = null;

      for (const opcion of opcionesCompresion) {
        manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: opcion.width } }],
          {
            compress: opcion.compress,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );

        console.log("[CHECKIN][COMPRESION]", {
          width: opcion.width,
          compress: opcion.compress,
          base64Length: manipulated.base64?.length,
        });

        if (manipulated.base64?.length <= MAX_BASE64_LENGTH) {
          break;
        }
      }

      if (!manipulated?.base64) {
        Alert.alert("Error", "No se pudo convertir la imagen.");
        return;
      }

      if (manipulated.base64.length > MAX_BASE64_LENGTH) {
        Alert.alert(
          "Foto muy pesada",
          "No se pudo reducir a menos de 3 MB. Intenta tomar otra foto.",
        );
        return;
      }

      setCheckinPhotoUri(manipulated.uri);
      setCheckinPhotoBase64(manipulated.base64);

      console.log("[CHECKIN] FINAL base64 length:", manipulated.base64.length);
    } catch (e) {
      console.log("takeCheckinPhoto ERROR:", e);
      Alert.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  const postCheckinEvidence = async (orderId, base64) => {
    const payload = {
      WorkOrderHeader: { Orderid: orderId },
      Attachments: [
        {
          DocId: orderId,
          FileName: `CHECKIN_${orderId}.jpg`,
          MimeType: "image/jpeg",
          Base64: String(base64).trim(),
        },
      ],
      Return: [],
    };

    await api.post(
      `/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet?sap-client=400&sap-language=ES`,
      payload,
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const postChangeStatusToSap = async (orderId, statusCode = "0100") => {
    const finalStatus = normalizeCode(statusCode) || "0100";

    const payload = {
      OrderId: orderId,
      WorkOrderHeader: { Orderid: orderId },
      WorkOrderUserStatusSet: [
        {
          UserStText: finalStatus,
          Langu: "ES",
          Inactive: "",
        },
      ],
      Return: [],
    };

    console.log("[CHECKIN][STATUS][SAP]", {
      orderId,
      finalStatus,
      payload,
    });

    await api.post(
      `/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet?sap-client=400&sap-language=ES`,
      payload,
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const applyLocalOfflineStatus = async (orderId, statusCode = "0100") => {
    const finalStatus = normalizeCode(statusCode) || "0100";

    try {
      await setLocalStatusPatch(userEmail, orderId, finalStatus);
      await patchCacheOrdenesTecnicoList(userEmail, orderId, finalStatus);
      await patchCacheOrdenTecnicoDetail(orderId, finalStatus);

      setAllOrdenes((prev) =>
        (prev || []).map((x) =>
          String(x?.Orderid) === String(orderId)
            ? {
                ...x,
                estatus_code: finalStatus,
                userstatus: finalStatus,
                estatus_label: STATUS_META[finalStatus]?.label || finalStatus,
              }
            : x,
        ),
      );

      console.log("[CHECKIN][STATUS][LOCAL]", {
        orderId,
        finalStatus,
      });
    } catch (e) {
      console.log("[CHECKIN][STATUS][LOCAL] error:", e?.message || e);
    }
  };

  // Sync cola a SAP (foto + estatus)
  const syncCheckinQueue = useCallback(async () => {
    if (!userEmail) return;
    if (syncingRef.current) return;

    const net = await NetInfo.fetch();

    const online = !!(net?.isConnected && net?.isInternetReachable !== false);

    setIsOnline(online);

    if (!online) return;

    syncingRef.current = true;

    try {
      const q = await loadCheckinQueue(userEmail);
      if (!q.length) return;

      const ok = await ensureValidToken();
      if (!ok) return;

      const ordered = [...q].sort(
        (a, b) => (a?.createdAt || 0) - (b?.createdAt || 0),
      );

      for (const item of ordered) {
        const orderId = String(item?.orderId || "").trim();
        const b64 = String(item?.photoBase64 || "").trim();

        if (!orderId || !b64) {
          await removeFromQueue(userEmail, orderId);
          continue;
        }

        try {
          console.log("[CHECKIN][SYNC] Enviando:", {
            orderId,
            b64len: b64.length,
          });
          const statusToSend = normalizeCode(item?.statusCode) || "0100";

          await postCheckinEvidence(orderId, b64);
          await postChangeStatusToSap(orderId, statusToSend);
          await removeFromQueue(userEmail, orderId);
        } catch (e) {
          console.log(
            "[CHECKIN][SYNC] Error SAP:",
            orderId,
            e?.response?.data || e?.message || e,
          );
          break;
        }
      }

      const q2 = await loadCheckinQueue(userEmail);
      setCheckinQueue(q2);

      fetchOrdenes({ isRefresh: true });
    } finally {
      syncingRef.current = false;
    }
  }, [ensureValidToken, fetchOrdenes, userEmail]);

  // Auto-sync cuando regresa internet y hay cola
  useEffect(() => {
    if (isOnline && checkinQueue.length > 0) {
      syncCheckinQueue().catch(() => {});
    }
  }, [isOnline, checkinQueue.length, syncCheckinQueue]);

  const enviarCheckinCompletoASap = async () => {
    if (!checkinOrderId) {
      Alert.alert("Error", "No hay orden seleccionada.");
      return;
    }

    if (!checkinPhotoBase64) {
      Alert.alert("Falta evidencia", "Primero toma una foto.");
      return;
    }

    const orderId = String(checkinOrderId).trim();

    try {
      setIsSending(true);

      const net = await NetInfo.fetch();
      const online = !!(net?.isConnected && net?.isInternetReachable !== false);

      setIsOnline(online);

      if (!online) {
        const offlineStatus = "0100";

        await applyLocalOfflineStatus(orderId, offlineStatus);

        const nextQueue = await enqueueCheckin(userEmail, {
          orderId,
          photoBase64: String(checkinPhotoBase64).trim(),
          statusCode: offlineStatus,
          lastValidStatus: offlineStatus,
          createdAt: Date.now(),
        });

        setCheckinQueue(nextQueue);

        Alert.alert(
          "Check-in offline",
          "Sin internet. Se guardó el check-in en cola y se enviará automáticamente cuando regrese la conexión ✅",
        );

        setShowCheckinModal(false);
        setCheckinPhotoBase64(null);
        setCheckinPhotoUri(null);

        return;
      }

      const ok = await ensureValidToken();
      if (!ok) return;
      const onlineStatus = "0100";

      await postCheckinEvidence(orderId, checkinPhotoBase64);
      await postChangeStatusToSap(orderId, onlineStatus);
      await applyLocalOfflineStatus(orderId, onlineStatus);

      Alert.alert(
        "Check-in",
        "Evidencia enviada y estatus actualizado a PENDIENTE",
      );

      setShowCheckinModal(false);
      setCheckinPhotoBase64(null);
      setCheckinPhotoUri(null);

      fetchOrdenes({ isRefresh: true });
    } catch (e) {
      console.log(
        "enviarCheckinCompletoASap ERROR:",
        e?.response?.data || e?.message || e,
      );

      const net2 = await NetInfo.fetch();

      const online2 = !!(
        net2?.isConnected && net2?.isInternetReachable !== false
      );

      if (!online2) {
        const offlineStatus = "0100";

        await applyLocalOfflineStatus(orderId, offlineStatus);

        const nextQueue = await enqueueCheckin(userEmail, {
          orderId,
          photoBase64: String(checkinPhotoBase64).trim(),
          statusCode: offlineStatus,
          lastValidStatus: offlineStatus,
          createdAt: Date.now(),
        });

        setCheckinQueue(nextQueue);

        Alert.alert(
          "Check-in guardado",
          "Se cayó la conexión. Se guardó en cola y se enviará cuando regrese internet ✅",
        );

        setShowCheckinModal(false);
        setCheckinPhotoBase64(null);
        setCheckinPhotoUri(null);

        return;
      }

      Alert.alert(
        "Error SAP",
        "No se pudo completar el check-in (foto/estatus). Revisa logs.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setDateMode("day");
    setDayRef(new Date());
    setWeekStart(null);
    setWeekEnd(null);
    setMonthYear({ month: now.getMonth(), year: now.getFullYear() });
    setYearOnly(now.getFullYear());
  };

  const renderItem = ({ item }) => {
    const startLabel = formatDateDMY(item.start_date);
    const finishLabel = formatDateDMY(item.finish_date);

    const stBase = resolveUserstatus(
      item?.userstatus ?? "",
      statusCatalogMap,
      item,
    );

    const isPendingOffline = pendingSet.has(String(item?.Orderid));

    const tbmYaProceso = stBase.code === "0200";

    const st =
      isPendingOffline && !tbmYaProceso
        ? {
            ...stBase,
            code: "0100",
            label: STATUS_META["0100"]?.label || "PENDIENTE",
            type: "pendiente",
            color: STATUS_META["0100"]?.color || "#D64545",
            lockActions: false,
            allowCheckin: false,
          }
        : stBase;

    const showCheckinBtn = st.type === "start" && st.allowCheckin;
    const showTbmBtn = st.type === "pendiente" || st.type === "proceso";
    const showNoMantBtn = st.type === "pendiente";
    const lockAll = st.lockActions;

    return (
      <Pressable
        style={[
          styles.card,
          { borderLeftWidth: 4, borderLeftColor: st.color },
          st.type === "no_mantto" && styles.cardNoMant,
          st.type === "final" && styles.cardFinished,
        ]}
        onPress={() => irADetalles(item)}
      >
        <View style={styles.cardContent}>
          <View style={[styles.statusDot, { backgroundColor: st.color }]} />

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              #{item.Orderid} - {item.order_type}
            </Text>

            <Text style={styles.label}>Equipo: {item.equipment}</Text>
            <Text style={styles.label}>Inicio: {startLabel}</Text>
            <Text style={styles.label}>Fin: {finishLabel}</Text>

            <Text style={styles.label}>Estatus: {st.label}</Text>
          </View>
        </View>

        <View
          pointerEvents="box-none"
          style={{
            flexDirection: "row",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          {lockAll ? (
            <Text
              style={{
                color: FIORI.textMuted,
                fontSize: 12,
                fontStyle: "italic",
              }}
            >
              {st.type === "no_mantto"
                ? "Orden Carta No Mantto. Acciones bloqueadas."
                : "Orden bloqueada por estatus."}
            </Text>
          ) : showCheckinBtn ? (
            <TouchableOpacity
              style={[styles.boton, { backgroundColor: FIORI.accent }]}
              onPress={(e) => {
                e?.stopPropagation?.();
                abrirModalCheckin(item, item.Orderid);
              }}
            >
              <Text style={styles.botonTexto}>Check-in</Text>
            </TouchableOpacity>
          ) : showTbmBtn ? (
            <>
              <TouchableOpacity
                style={[styles.boton, { backgroundColor: FIORI.neutralBtn }]}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  saveActiveEquipmentFromItem(item);
                  irAFormularioRiesgos(item.Orderid);
                }}
              >
                <Text style={[styles.botonTexto, { color: FIORI.ink }]}>
                  TBM/KY
                </Text>
              </TouchableOpacity>

              {showNoMantBtn && (
                <TouchableOpacity
                  style={[styles.boton, styles.botonSecundario]}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    saveActiveEquipmentFromItem(item);
                    irACartaNoMantenimiento(item.Orderid);
                  }}
                >
                  <Text style={[styles.botonTexto, { color: FIORI.accent }]}>
                    Carta No Mantto
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text
              style={{
                color: FIORI.textMuted,
                fontSize: 12,
                fontStyle: "italic",
              }}
            >
              Se requiere la firma del cliente para finalizar.
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  const activeRangeText = useMemo(() => {
    if (dateMode === "all") return "Últimos 90 días";

    if (dateMode === "day") {
      return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
    }

    if (dateMode === "weekRange") {
      const a = weekStart ? atStartOfDay(weekStart).toLocaleDateString() : "—";
      const b = weekEnd ? atEndOfDay(weekEnd).toLocaleDateString() : "—";
      return `Semana (rango): ${a} → ${b}`;
    }

    if (dateMode === "month") {
      return `Mes: ${MONTHS[monthYear.month]} ${monthYear.year}`;
    }

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

  return (
    <View style={styles.container}>
      <Header title="Órdenes asignadas" />

      <View style={styles.filtersWrap}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por #, tipo, equipo, estatus…"
            placeholderTextColor={FIORI.textMuted}
            returnKeyType="search"
          />
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
            onPress={() => fetchOrdenes({ isRefresh: true })}
            activeOpacity={0.85}
          >
            <Text style={styles.refreshBtnText}>Recargar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.syncBtn,
              checkinQueue.length === 0 && { opacity: 0.55 },
            ]}
            onPress={async () => {
              await refreshQueue();
              await syncCheckinQueue();
            }}
            activeOpacity={0.85}
            disabled={checkinQueue.length === 0}
          >
            <Text style={styles.syncBtnText}>
              {isOnline ? "Sincronizar pendientes" : "Pendientes (sin red)"}{" "}
              {checkinQueue.length ? `(${checkinQueue.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.activeRangeText}>
          {activeRangeText} · {isOnline ? "Online" : "Offline"}
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

      {/* Modal Mes */}
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

      {/* Modal Año */}
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

      {/* Modal Check-in */}
      <Modal
        visible={showCheckinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCheckinModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 480 }]}>
            <Text style={styles.modalHeaderTitle}>
              Check-in #{checkinOrderId ?? ""}
            </Text>

            <Text style={{ color: FIORI.textMuted, marginBottom: 10 }}>
              Toma una foto de evidencia:
            </Text>

            {checkinPhotoUri ? (
              <View style={{ marginBottom: 12 }}>
                <Image
                  source={{ uri: checkinPhotoUri }}
                  style={{
                    width: "100%",
                    height: 180,
                    borderRadius: 10,
                    backgroundColor: "#EEE",
                  }}
                  resizeMode="cover"
                />

                <Text
                  style={{ marginTop: 6, color: FIORI.textMuted, fontSize: 12 }}
                >
                  Base64 listo ✅ ({checkinPhotoBase64?.length || 0})
                </Text>
              </View>
            ) : (
              <View
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderColor: FIORI.border,
                  borderRadius: 10,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: FIORI.textMuted }}>
                  Aún no hay foto. Presiona “Tomar foto”.
                </Text>
              </View>
            )}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.neutralBtn }]}
                onPress={() => setShowCheckinModal(false)}
                disabled={isSending}
              >
                <Text style={styles.smallBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]}
                onPress={takeCheckinPhoto}
                disabled={isSending}
              >
                <Text style={styles.smallBtnText}>Tomar foto</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                onPress={enviarCheckinCompletoASap}
                disabled={isSending}
              >
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                  {isSending
                    ? "Procesando..."
                    : isOnline
                      ? "Enviar a SAP"
                      : "Guardar offline"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading && allOrdenes.length === 0 ? (
        <ActivityIndicator
          style={{ marginTop: 40 }}
          size="large"
          color={FIORI.accent}
        />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(item, idx) => String(item?.Orderid ?? `row-${idx}`)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingTop: 6 }}
          refreshing={refreshing}
          onRefresh={() => fetchOrdenes({ isRefresh: true })}
          ListEmptyComponent={
            <Text
              style={{
                textAlign: "center",
                marginTop: 24,
                color: FIORI.textMuted,
              }}
            >
              No hay órdenes con los filtros actuales.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
  },

  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
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
      android: {
        elevation: 1,
      },
      default: {},
    }),
  },

  searchRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },

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

  clearBtn: {
    backgroundColor: FIORI.neutralBtn,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  clearBtnText: {
    color: FIORI.ink,
    fontWeight: "600",
  },

  refreshBtn: {
    backgroundColor: FIORI.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },

  refreshBtnText: {
    color: "#fff",
    fontWeight: "700",
  },

  syncBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },

  syncBtnText: {
    color: "#fff",
    fontWeight: "800",
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },

  chip: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: FIORI.cardBg,
  },

  chipActive: {
    backgroundColor: FIORI.accent,
    borderColor: FIORI.accent,
  },

  chipText: {
    color: FIORI.ink,
    fontWeight: "600",
  },

  chipTextActive: {
    color: "#fff",
  },

  activeRangeText: {
    marginTop: 8,
    color: FIORI.textMuted,
    fontSize: 12,
  },

  rangeButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },

  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  smallBtnText: {
    color: FIORI.ink,
    fontWeight: "600",
  },

  card: {
    backgroundColor: FIORI.cardBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: FIORI.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    position: "relative",
  },

  cardNoMant: {
    backgroundColor: "#F0F0F0",
    borderColor: "#D0D0D0",
  },

  cardFinished: {
    backgroundColor: "#EAF7EF",
    borderColor: "#CFE9D8",
  },

  cardContent: {
    flexDirection: "row",
    alignItems: "center",
  },

  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },

  title: {
    fontWeight: "700",
    fontSize: 16,
    color: FIORI.ink,
    marginBottom: 2,
  },

  label: {
    fontSize: 14,
    color: FIORI.textMuted,
  },

  boton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-end",
  },

  botonTexto: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  botonSecundario: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: FIORI.accent,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: FIORI.cardBg,
    borderRadius: 12,
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
    fontWeight: "700",
    color: FIORI.ink,
  },

  modalHeaderBtn: {
    fontSize: 22,
    fontWeight: "900",
    color: FIORI.accent,
    paddingHorizontal: 12,
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
    fontWeight: "600",
  },

  monthCellTextActive: {
    color: "#fff",
  },

  modalClose: {
    marginTop: 10,
    alignSelf: "flex-end",
    backgroundColor: FIORI.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },

  modalCloseText: {
    color: "#fff",
    fontWeight: "700",
  },

  yearItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
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
    fontWeight: "600",
  },

  yearItemTextActive: {
    color: "#fff",
  },
});
