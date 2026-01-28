// app/tecnico/ordenes/index.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
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
import { router } from "expo-router"; // ✅ IMPORTANTE (arregla "Property 'router' doesn't exist")
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { useAuth } from "../../../src/context/AuthContext";
import Header from "../../../src/components/Header";
import api from "../../../src/services/api";

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
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfYear = (y) => new Date(y, 0, 1, 0, 0, 0, 0);
const endOfYear = (y) => new Date(y, 11, 31, 23, 59, 59, 999);

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
   ✅ Reglas de Userstatus
   ========================= */
function normalizeCode(code) {
  if (code === null || code === undefined) return "";
  const s = String(code).trim();
  if (!s) return "";
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;
  return String(n).padStart(4, "0");
}

function isNoManttoCode(code) {
  if (!code) return false;
  const n = parseInt(code, 10);
  return !Number.isNaN(n) && n >= 1 && n <= 11;
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

function allAreNoMantto(codes) {
  if (!codes.length) return false;
  return codes.every((c) => isNoManttoCode(c));
}

const PRIORITY = ["0500", "0400", "0300", "0200", "0100"];

function resolveUserstatus(rawUserstatus, catalogMap = {}, itemFromApi = null) {
  const rawCodes = extractCodes(rawUserstatus);
  const apiCode = normalizeCode(itemFromApi?.estatus_code);

  const codes = Array.from(new Set([...(rawCodes || []), ...(apiCode ? [apiCode] : [])]));

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
      if (p === "0100")
        return { code: p, label: "PENDIENTE", type: "pendiente", color: "#D64545", lockActions: false, allowCheckin: false, isNoMantto: false, rawCodes: codes };
      if (p === "0200")
        return { code: p, label: "PROCESO", type: "proceso", color: "#D49C00", lockActions: false, allowCheckin: false, isNoMantto: false, rawCodes: codes };
      if (p === "0300")
        return { code: p, label: "FINALIZADA", type: "final", color: "#27AE60", lockActions: true, allowCheckin: false, isNoMantto: false, rawCodes: codes };
      if (p === "0400")
        return { code: p, label: "PENDIENTE DE FIRMA", type: "firma", color: "#2D9CDB", lockActions: false, allowCheckin: false, isNoMantto: false, rawCodes: codes };
      if (p === "0500")
        return { code: p, label: "FINALIZADA C/PENDIENTES", type: "final_pend", color: "#2D9CDB", lockActions: true, allowCheckin: false, isNoMantto: false, rawCodes: codes };
    }
  }

  if (codes.includes("0012")) {
    return { code: "0012", label: "Sin empezar", type: "start", color: "#6A7381", lockActions: false, allowCheckin: true, isNoMantto: false, rawCodes: codes };
  }

  if (allAreNoMantto(codes)) {
    const main = codes[0];
    const cause = catalogMap?.[main] || `No mantenimiento (${main})`;
    return { code: main, label: cause, type: "no_mantto", color: "#9E9E9E", lockActions: true, allowCheckin: false, isNoMantto: true, rawCodes: codes };
  }

  return { code: codes[0], label: `Estatus ${codes.join(", ")}`, type: "unknown", color: "#6A7381", lockActions: false, allowCheckin: false, isNoMantto: false, rawCodes: codes };
}

/* =========================
   ✅ Search
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

export default function ListaOrdenesTecnico() {
  const { user, ensureValidToken } = useAuth();

  const [allOrdenes, setAllOrdenes] = useState([]);
  const [ordenes, setOrdenes] = useState([]);

  // ✅ loading: solo para 1ra carga o cuando cambian filtros (si aún no hay lista)
  const [loading, setLoading] = useState(true);

  // ✅ refreshing: para pull-to-refresh y botón Recargar sin “tirar” la lista
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

  // ✅ check-in modal + foto
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinOrderId, setCheckinOrderId] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [checkinPhotoBase64, setCheckinPhotoBase64] = useState(null);
  const [checkinPhotoUri, setCheckinPhotoUri] = useState(null);

  // ✅ catálogo status
  const [statusCatalogMap, setStatusCatalogMap] = useState({});

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

  const fetchStatusCatalog = async () => {
    try {
      const res = await api.get(
        "/api/odata/ZSD_CATALOGOS_SRV/StatusWorkOrderSet?$filter=Stsma%20eq%20%27CS000001%27&$format=json"
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
      console.log("Error catálogo estatus:", e?.response?.data || e?.message || e);
      setStatusCatalogMap({});
    }
  };

  // ✅ IMPORTANTE: NO debe causar doble carga
  const fetchOrdenes = useCallback(
    async ({ isRefresh = false } = {}) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        const ok = await ensureValidToken();
        if (!ok) return;

        const sStr = ymd(start);
        const eStr = ymd(end);

        const params = new URLSearchParams({
          start: sStr,
          end: eStr,
          mode: dateMode === "day" ? "eq" : "range",
        });

        const userEmail = user?.correo || user?.email || user?.username || null;
        if (userEmail) params.set("user", userEmail);

        const res = await api.get(`/api/ordenes/sap/list?${params.toString()}`);
        const data = Array.isArray(res.data) ? res.data : [];
        setAllOrdenes(data);
      } catch (error) {
        console.error("Error al cargar órdenes (SAP):", error?.response?.data || error);
        const serverMsg = error?.response?.data?.error || "No se pudieron cargar las órdenes desde SAP";
        Alert.alert("Error", serverMsg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ensureValidToken, start, end, dateMode, user]
  );

  // ✅ 1) catálogo una vez
  useEffect(() => {
    fetchStatusCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 2) órdenes solo cuando cambian filtros / 1ra carga (no al regresar de detalles)
  useEffect(() => {
    fetchOrdenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrdenes]);

  // ✅ 3) filtrar en memoria
  useEffect(() => {
    const filtered = (allOrdenes || []).filter((item) => {
      const okQuery = matchesQuery(item, query);
      if (!okQuery) return false;

      if (dateMode === "all") return true;

      const sd = parseSapDate(item?.start_date);
      if (!sd) return false;
      return isWithin(sd, start, end);
    });

    setOrdenes(filtered);
  }, [allOrdenes, query, dateMode, start, end]);

  const irADetalles = (orderId) => {
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

  const abrirModalCheckin = (_e, orderId) => {
    setCheckinOrderId(orderId);
    setCheckinPhotoBase64(null);
    setCheckinPhotoUri(null);
    setShowCheckinModal(true);
  };

  // ✅ cámara -> base64
  const takeCheckinPhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permiso requerido", "Necesitamos permiso de cámara para tomar la evidencia.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 1, // captura “normal”
        base64: false, // 👈 NO la pidas aquí
        allowsEditing: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert("Error", "No se pudo obtener la foto.");
        return;
      }

      // ✅ Convertir a JPEG + resize (esto elimina HEIC/PNG y baja peso)
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1280 } }], // ajusta si quieres 1024
        { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated?.base64) {
        Alert.alert("Error", "No se pudo convertir la imagen.");
        return;
      }

      setCheckinPhotoUri(manipulated.uri);
      setCheckinPhotoBase64(manipulated.base64);

      // (opcional) debug
      console.log("[CHECKIN] jpg base64 length:", manipulated.base64.length);
    } catch (e) {
      console.log("takeCheckinPhoto ERROR:", e);
      Alert.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  // ✅ 1) subir evidencia
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

    await api.post(`/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet?sap-client=400&sap-language=ES`, payload, {
      headers: { "Content-Type": "application/json" },
    });
  };

  // ✅ 2) cambiar estatus a 0100
  const postChangeStatusTo0100 = async (orderId) => {
    const payload = {
      OrderId: orderId,
      WorkOrderHeader: { Orderid: orderId },
      WorkOrderUserStatusSet: [
        {
          UserStText: "0100",
          Langu: "ES",
          Inactive: "",
        },
      ],
      Return: [],
    };

    await api.post(`/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet?sap-client=400&sap-language=ES`, payload, {
      headers: { "Content-Type": "application/json" },
    });
  };

  // ✅ enviar todo: evidencia + estatus
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

      const ok = await ensureValidToken();
      if (!ok) return;

      // 1) Evidencia
      await postCheckinEvidence(orderId, checkinPhotoBase64);

      // 2) Cambio de estatus a 0100
      await postChangeStatusTo0100(orderId);

      Alert.alert("Check-in", "Evidencia enviada y estatus actualizado a 0100 ✅");

      setShowCheckinModal(false);
      setCheckinPhotoBase64(null);
      setCheckinPhotoUri(null);

      // refresca lista sin tirar UI
      fetchOrdenes({ isRefresh: true });
    } catch (e) {
      console.log("enviarCheckinCompletoASap ERROR:", e?.response?.data || e?.message || e);
      Alert.alert("Error SAP", "No se pudo completar el check-in (foto/estatus). Revisa logs.");
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

    const st = resolveUserstatus(item?.userstatus ?? "", statusCatalogMap, item);

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
          st.type === "final_pend" && styles.cardFinishedPend,
        ]}
        onPress={() => irADetalles(item.Orderid)}
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

            <Text style={styles.label}>
              Estatus: {st.label} {st.code ? `(${st.code})` : ""}
            </Text>
          </View>
        </View>

        <View pointerEvents="box-none" style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
          {lockAll ? (
            <Text style={{ color: FIORI.textMuted, fontSize: 12, fontStyle: "italic" }}>
              {st.type === "no_mantto"
                ? "Orden NO MANTENIMIENTO. Acciones bloqueadas."
                : st.code === "0012"
                ? "Orden REPROGRAMACIÓN (se muestra como Sin empezar)."
                : "Orden bloqueada por estatus."}
            </Text>
          ) : showCheckinBtn ? (
            <TouchableOpacity
              style={[styles.boton, { backgroundColor: FIORI.accent }]}
              onPress={(e) => {
                e?.stopPropagation?.();
                abrirModalCheckin(null, item.Orderid);
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
                  irAFormularioRiesgos(item.Orderid);
                }}
              >
                <Text style={[styles.botonTexto, { color: FIORI.ink }]}>TBM/KY</Text>
              </TouchableOpacity>

              {showNoMantBtn && (
                <TouchableOpacity
                  style={[styles.boton, styles.botonSecundario]}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    irACartaNoMantenimiento(item.Orderid);
                  }}
                >
                  <Text style={[styles.botonTexto, { color: FIORI.accent }]}>No mantenimiento</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={{ color: FIORI.textMuted, fontSize: 12, fontStyle: "italic" }}>Acciones disponibles según flujo.</Text>
          )}
        </View>
      </Pressable>
    );
  };

  const activeRangeText = useMemo(() => {
    if (dateMode === "all") return "Últimos 90 días";
    if (dateMode === "day") return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
    if (dateMode === "weekRange") {
      const a = weekStart ? atStartOfDay(weekStart).toLocaleDateString() : "—";
      const b = weekEnd ? atEndOfDay(weekEnd).toLocaleDateString() : "—";
      return `Semana (rango): ${a} → ${b}`;
    }
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
          <TouchableOpacity style={[styles.chip, dateMode === "all" && styles.chipActive]} onPress={() => setDateMode("all")}>
            <Text style={[styles.chipText, dateMode === "all" && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "day" && styles.chipActive]}
            onPress={() => {
              setDateMode("day");
              setShowDayPicker(true);
            }}
          >
            <Text style={[styles.chipText, dateMode === "day" && styles.chipTextActive]}>Día</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "weekRange" && styles.chipActive]}
            onPress={() => {
              setDateMode("weekRange");
              setShowWeekStartPicker(true);
            }}
          >
            <Text style={[styles.chipText, dateMode === "weekRange" && styles.chipTextActive]}>Semana (rango)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "month" && styles.chipActive]}
            onPress={() => {
              setDateMode("month");
              setShowMonthModal(true);
            }}
          >
            <Text style={[styles.chipText, dateMode === "month" && styles.chipTextActive]}>Mes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "year" && styles.chipActive]}
            onPress={() => {
              setDateMode("year");
              setShowYearModal(true);
            }}
          >
            <Text style={[styles.chipText, dateMode === "year" && styles.chipTextActive]}>Año</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.clearBtn} onPress={clearFilters} activeOpacity={0.85}>
            <Text style={styles.clearBtnText}>Limpiar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchOrdenes({ isRefresh: true })} activeOpacity={0.85}>
            <Text style={styles.refreshBtnText}>Recargar</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.activeRangeText}>{activeRangeText}</Text>

        {showDayPicker && (
          <DateTimePicker
            value={dayRef ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android" && e.type !== "set") {
                setShowDayPicker(false);
                return;
              }
              if (date) setDayRef(date);
              setShowDayPicker(Platform.OS === "ios");
            }}
          />
        )}

        {showWeekStartPicker && (
          <DateTimePicker
            value={weekStart ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android" && e.type !== "set") {
                setShowWeekStartPicker(false);
                return;
              }
              if (date) {
                setWeekStart(date);
                if (Platform.OS !== "ios") setShowWeekEndPicker(true);
              }
              setShowWeekStartPicker(Platform.OS === "ios");
            }}
          />
        )}

        {showWeekEndPicker && (
          <DateTimePicker
            value={weekEnd ?? (weekStart ?? new Date())}
            mode="date"
            minimumDate={weekStart ?? undefined}
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android" && e.type !== "set") {
                setShowWeekEndPicker(false);
                return;
              }
              if (date) setWeekEnd(date);
              setShowWeekEndPicker(Platform.OS === "ios");
            }}
          />
        )}

        {dateMode === "weekRange" && (
          <View style={styles.rangeButtonsRow}>
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]} onPress={() => setShowWeekStartPicker(true)}>
              <Text style={styles.smallBtnText}>Inicio: {weekStart ? weekStart.toLocaleDateString() : "—"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]} onPress={() => setShowWeekEndPicker(true)}>
              <Text style={styles.smallBtnText}>Fin: {weekEnd ? weekEnd.toLocaleDateString() : "—"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Modal Mes */}
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
                    <Text style={[styles.monthCellText, active && styles.monthCellTextActive]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.modalClose} onPress={() => setShowMonthModal(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Año */}
      <Modal visible={showYearModal} transparent animationType="fade" onRequestClose={() => setShowYearModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalHeaderTitle, { marginBottom: 8 }]}>Selecciona un año</Text>
            <YearPickerContent
              selectedYear={yearOnly}
              onSelect={(y) => {
                setYearOnly(y);
                setShowYearModal(false);
              }}
              from={now.getFullYear() - 10}
              to={now.getFullYear() + 2}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowYearModal(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ✅ Modal Check-in */}
      <Modal visible={showCheckinModal} transparent animationType="slide" onRequestClose={() => setShowCheckinModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 480 }]}>
            <Text style={styles.modalHeaderTitle}>Check-in #{checkinOrderId ?? ""}</Text>

            <Text style={{ color: FIORI.textMuted, marginBottom: 10 }}>
              Toma una foto y al enviar se sube evidencia + se cambia estatus a 0100 (PENDIENTE).
            </Text>

            {checkinPhotoUri ? (
              <View style={{ marginBottom: 12 }}>
                <Image source={{ uri: checkinPhotoUri }} style={{ width: "100%", height: 180, borderRadius: 10, backgroundColor: "#EEE" }} resizeMode="cover" />
                <Text style={{ marginTop: 6, color: FIORI.textMuted, fontSize: 12 }}>Base64 listo ✅</Text>
              </View>
            ) : (
              <View style={{ padding: 12, borderWidth: 1, borderColor: FIORI.border, borderRadius: 10, marginBottom: 12 }}>
                <Text style={{ color: FIORI.textMuted }}>Aún no hay foto. Presiona “Tomar foto”.</Text>
              </View>
            )}

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: FIORI.neutralBtn }]} onPress={() => setShowCheckinModal(false)} disabled={isSending}>
                <Text style={styles.smallBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]} onPress={takeCheckinPhoto} disabled={isSending}>
                <Text style={styles.smallBtnText}>Tomar foto</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: FIORI.accent }]} onPress={enviarCheckinCompletoASap} disabled={isSending}>
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>{isSending ? "Enviando..." : "Enviar a SAP"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading && allOrdenes.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={FIORI.accent} />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(item, idx) => String(item?.Orderid ?? `row-${idx}`)} // ✅ estable
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingTop: 6 }}
          refreshing={refreshing}
          onRefresh={() => fetchOrdenes({ isRefresh: true })}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", marginTop: 24, color: FIORI.textMuted }}>
              No hay órdenes con los filtros actuales.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },

  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: FIORI.cardBg,
    borderBottomColor: FIORI.border,
    borderBottomWidth: 1,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
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
  clearBtnText: { color: FIORI.ink, fontWeight: "600" },
  refreshBtn: { backgroundColor: FIORI.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  refreshBtnText: { color: "#fff", fontWeight: "700" },

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
  activeRangeText: { marginTop: 8, color: FIORI.textMuted, fontSize: 12 },

  rangeButtonsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  smallBtnText: { color: FIORI.ink, fontWeight: "600" },

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
  cardNoMant: { backgroundColor: "#F0F0F0", borderColor: "#D0D0D0" },
  cardFinished: { backgroundColor: "#EAF7EF", borderColor: "#CFE9D8" },
  cardFinishedPend: { backgroundColor: "#EAF3FF", borderColor: "#CFE2FF" },

  cardContent: { flexDirection: "row", alignItems: "center" },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  title: { fontWeight: "700", fontSize: 16, color: FIORI.ink, marginBottom: 2 },
  label: { fontSize: 14, color: FIORI.textMuted },

  boton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: "flex-end" },
  botonTexto: { color: "#fff", fontWeight: "700", fontSize: 14 },
  botonSecundario: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: FIORI.accent },

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
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  modalHeaderTitle: { fontSize: 18, fontWeight: "700", color: FIORI.ink },
  modalHeaderBtn: { fontSize: 22, fontWeight: "900", color: FIORI.accent, paddingHorizontal: 12 },

  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
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
});
