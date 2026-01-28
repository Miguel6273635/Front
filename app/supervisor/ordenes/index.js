// app/supervisor/ordenes/index.js
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../src/components/Header";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

import { isOnline } from "../../../src/offline/net";
import { fetchOrdenesSupervisor } from "../../../src/services/ordenesSupervisor";
import {
  fetchOrdenDetalleSupervisor,
  fetchOperacionesSupervisor,
} from "../../../src/services/operacionesSupervisor";

import api from "../../../src/services/api";

/* ====================== Helpers de fecha UI ====================== */
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

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

/* ====================== Paleta simple ====================== */
const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  muted: "#63718B",
};

/* ======================
   ✅ Parse SAP /Date(…)/ -> ms (soporta offset /Date(ms-0600)/)
   ====================== */
function sapDateToMs(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;

  const s = String(value);
  // /Date(1768176000000)/  o  /Date(1768176000000-0600)/
  const m = s.match(/\/Date\((\-?\d+)([+-]\d{4})?\)\//);
  if (!m) return null;

  const ms = Number(m[1]);
  const off = m[2]; // ej "-0600"

  if (!off) return ms;

  const sign = off.startsWith("-") ? -1 : 1;
  const hh = parseInt(off.slice(1, 3), 10);
  const mm = parseInt(off.slice(3, 5), 10);
  const offsetMinutes = sign * (hh * 60 + mm);

  // Ajuste para representar el instante en UTC real
  return ms - offsetMinutes * 60 * 1000;
}

/* ======================
   ✅ Formato estable (UTC) — evita que en teléfono se vaya a día anterior
   ====================== */
function formatSapMsAsDMY(ms) {
  if (ms === null || ms === undefined) return "—";
  const d = new Date(ms);

  // IMPORTANTE: usar getters UTC
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/* =========================
   ✅ Catálogo de estatus
   ========================= */
async function fetchStatusCatalogMap() {
  const url =
    "/api/odata/ZSD_CATALOGOS_SRV/StatusWorkOrderSet?$filter=" +
    encodeURIComponent("Stsma eq 'CS000001'") +
    "&$format=json";

  const res = await api.get(url);
  const results = res?.data?.d?.results || [];
  const map = {};
  for (const r of results) {
    const code = String(r?.Status1 || "").trim();
    const label = String(r?.Status2 || "").trim();
    if (code) map[code] = label || code;
  }
  return map;
}

/* =========================
   ✅ Reglas Userstatus
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
  const n = parseInt(code, 10);
  return !Number.isNaN(n) && n >= 1 && n <= 11;
}

const PRIORITY = ["0500", "0400", "0300", "0200", "0100"];

function resolveUserstatus(rawUserstatus, catalogMap = {}) {
  const code = normalizeCode(rawUserstatus);

  if (!code) {
    return { code: "", label: "Sin empezar", type: "start", color: "#6A7381" };
  }

  for (const p of PRIORITY) {
    if (code === p) {
      if (p === "0100") return { code: p, label: "PENDIENTE", type: "pendiente", color: "#D64545" };
      if (p === "0200") return { code: p, label: "PROCESO", type: "proceso", color: "#D49C00" };
      if (p === "0300") return { code: p, label: "FINALIZADA", type: "final", color: "#27AE60" };
      if (p === "0400") return { code: p, label: "PENDIENTE DE FIRMA", type: "firma", color: "#2D9CDB" };
      if (p === "0500") return { code: p, label: "FINALIZADA C/PENDIENTES", type: "final_pend", color: "#2D9CDB" };
    }
  }

  if (code === "0012") {
    return { code, label: catalogMap?.["0012"] || "Sin empezar", type: "start", color: "#6A7381" };
  }

  if (isNoManttoCode(code)) {
    const cause = catalogMap?.[code] || `No mantenimiento (${code})`;
    return { code, label: cause, type: "no_mantto", color: "#9E9E9E" };
  }

  return { code, label: catalogMap?.[code] || `Estatus ${code}`, type: "unknown", color: "#6A7381" };
}

/* =========================
   ✅ Detectar si item viene SAP crudo o ya normalizado
   ========================= */
function isSapRaw(item) {
  return item && (item.Orderid || item.Equipment || item.StartDate || item.Userstatus);
}

function mapOrdenSapToUi(o) {
  return {
    orderid: String(o?.Orderid ?? ""),
    equipment: String(o?.Equipment ?? ""),
    nombre_orden: String(o?.ShortText ?? ""),
    // ✅ AQUÍ: parseamos de una vez el SAP raw
    startdate: sapDateToMs(o?.StartDate),
    finishdate: sapDateToMs(o?.FinishDate),
    userstatus: String(o?.Userstatus ?? ""),
    _raw: o,
  };
}

/* =========================
   ✅ Normalizar un item "sea como sea"
   (cubre: SAP raw, cache, y cualquier mezcla)
   ========================= */
function normalizeOrdenItem(item) {
  if (!item) return null;

  // Caso: ya viene normalizado (cache / app)
  if (item.orderid || item.equipment || item.userstatus || item.startdate || item.finishdate) {
    const startMs =
      typeof item.startdate === "number"
        ? item.startdate
        : sapDateToMs(item.startdate ?? item.StartDate);
    const finishMs =
      typeof item.finishdate === "number"
        ? item.finishdate
        : sapDateToMs(item.finishdate ?? item.FinishDate);

    return {
      ...item,
      orderid: String(item.orderid ?? item.Orderid ?? ""),
      equipment: String(item.equipment ?? item.Equipment ?? ""),
      nombre_orden: String(item.nombre_orden ?? item.ShortText ?? ""),
      userstatus: String(item.userstatus ?? item.Userstatus ?? ""),
      startdate: startMs,
      finishdate: finishMs,
    };
  }

  // Caso: SAP raw directo
  if (isSapRaw(item)) return mapOrdenSapToUi(item);

  return null;
}

/* =========================
   ✅ Prefetch de detalles/ops
   ========================= */
const PREFETCH_LIMIT = 25;
const PREFETCH_CONCURRENCY = 3;

async function prefetchDetallesDeOrdenes(orderIds = []) {
  const online = await isOnline();
  if (!online) return;

  const unique = Array.from(new Set(orderIds.map((x) => String(x))));
  const ids = unique.slice(0, PREFETCH_LIMIT);

  let i = 0;
  const worker = async () => {
    while (i < ids.length) {
      const idx = i++;
      const id = ids[idx];
      try {
        await fetchOrdenDetalleSupervisor(id);
        await fetchOperacionesSupervisor(id);
      } catch (e) {}
    }
  };

  const workers = Array.from({ length: PREFETCH_CONCURRENCY }, () => worker());
  await Promise.all(workers);
}

export default function ListaOrdenesSupervisor() {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dateMode, setDateMode] = useState("day");

  const [dayRef, setDayRef] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);

  const [weekStart, setWeekStart] = useState(null);
  const [weekEnd, setWeekEnd] = useState(null);
  const [showWeekStartPicker, setShowWeekStartPicker] = useState(false);
  const [showWeekEndPicker, setShowWeekEndPicker] = useState(false);

  const now = new Date();
  const [monthYear, setMonthYear] = useState({ month: now.getMonth(), year: now.getFullYear() });
  const [yearOnly, setYearOnly] = useState(now.getFullYear());

  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const [statusCatalog, setStatusCatalog] = useState({});
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const { start, end } = useMemo(() => {
    if (dateMode === "day") {
      const s = atStartOfDay(dayRef);
      return { start: s, end: s };
    }
    if (dateMode === "weekRange") {
      const today = new Date();
      return {
        start: weekStart ? atStartOfDay(weekStart) : atStartOfDay(today),
        end: weekEnd ? atEndOfDay(weekEnd) : atEndOfDay(today),
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

  /* =========================
     ✅ Cargar catálogo (si hay internet)
     ========================= */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const online = await isOnline();
        if (!online) return;
        setLoadingCatalog(true);
        const map = await fetchStatusCatalogMap();
        if (mounted) setStatusCatalog(map || {});
      } catch (e) {
        console.log("[CATALOGO STATUS ERROR]", e?.message || e);
      } finally {
        if (mounted) setLoadingCatalog(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* =========================
     ✅ Prefetch inicial (para offline rápido)
     ========================= */
  const didPrefetchRef = useRef(false);
  useEffect(() => {
    if (didPrefetchRef.current) return;
    didPrefetchRef.current = true;

    (async () => {
      try {
        const t = new Date();
        const s = new Date(t);
        const e = new Date(t);
        s.setDate(s.getDate() - 7);
        e.setDate(e.getDate() + 7);
        await fetchOrdenesSupervisor(ymd(s), ymd(e), "range");
      } catch {}
    })();
  }, []);

  /* =========================
     ✅ Cargar lista
     ========================= */
  const lastPrefetchKeyRef = useRef("");
  const cargar = useCallback(async () => {
    try {
      setLoading(true);

      const sStr = ymd(start);
      const eStr = ymd(end);
      const modeParam = dateMode === "day" ? "eq" : "range";

      const data = await fetchOrdenesSupervisor(sStr, eStr, modeParam);

      let arr = [];
      if (Array.isArray(data)) arr = data;
      else if (Array.isArray(data?.d?.results)) arr = data.d.results;
      else if (Array.isArray(data?.results)) arr = data.results;

      const normalized = arr.map(normalizeOrdenItem).filter(Boolean);
      setOrdenes(normalized);

      const online = await isOnline();
      if (online && normalized.length) {
        const prefetchKey = `${sStr}|${eStr}|${modeParam}|${normalized.length}`;
        if (lastPrefetchKeyRef.current !== prefetchKey) {
          lastPrefetchKeyRef.current = prefetchKey;
          const ids = normalized.map((x) => x?.orderid).filter(Boolean);
          prefetchDetallesDeOrdenes(ids);
        }
      }
    } catch (error) {
      console.error("Error al cargar órdenes supervisor:", error?.message || error);
      setOrdenes([]);
    } finally {
      setLoading(false);
    }
  }, [start, end, dateMode]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const onRefresh = () => cargar();

  const renderItem = ({ item }) => {
    const st = resolveUserstatus(item?.userstatus ?? item?.Userstatus, statusCatalog);
    const color = st.color;

    const icon =
      st.type === "pendiente" ? "time-outline" :
      st.type === "proceso" ? "refresh-outline" :
      st.type === "firma" ? "pencil-outline" :
      st.type === "final_pend" ? "alert-circle-outline" :
      st.type === "final" ? "checkmark-circle-outline" :
      st.type === "no_mantto" ? "close-circle-outline" :
      "ellipse-outline";

    // ✅ AQUÍ ES DONDE SE ARREGLA LO DE "VACÍO":
    // usamos el campo normalizado (number) y si no, parseamos el raw.
    const startMs =
      typeof item?.startdate === "number"
        ? item.startdate
        : sapDateToMs(item?.StartDate ?? item?.startdate);

    const finishMs =
      typeof item?.finishdate === "number"
        ? item.finishdate
        : sapDateToMs(item?.FinishDate ?? item?.finishdate);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/supervisor/ordenes/${item.orderid}`)}
        activeOpacity={0.88}
      >
        <View style={[styles.sideBar, { backgroundColor: color }]} />

        <View style={styles.cardBody}>
          <View style={styles.topRow}>
            <View style={styles.titleWrap}>
              <View style={styles.avatar}>
                <Ionicons name="document-text-outline" size={20} color={COLORS.title} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  #{item.orderid} — {item.nombre_orden || "Orden"}
                </Text>
                <Text style={styles.subTitle} numberOfLines={1}>
                  Equipo: {item.equipment || "—"}
                </Text>
              </View>
            </View>

            <View style={[styles.statusPill, { backgroundColor: color + "25", borderColor: color }]}>
              <Ionicons name={icon} size={14} style={{ marginRight: 4 }} color={color} />
              <Text style={styles.statusText} numberOfLines={2}>
                {st.label}{st.code ? ` (${st.code})` : ""}
              </Text>
            </View>
          </View>

          {/* ✅ FECHAS (UTC estable: NO se recorre al día anterior) */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.text} />
              <Text style={styles.metaText}>Inicio: {formatSapMsAsDMY(startMs)}</Text>
            </View>

            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.text} />
              <Text style={styles.metaText}>Fin: {formatSapMsAsDMY(finishMs)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Órdenes del Supervisor" />

      <View style={styles.filtersWrap}>
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, dateMode === "all" && styles.chipActive]}
            onPress={() => { setDateMode("all"); setShowMonthPicker(false); setShowYearPicker(false); }}
          >
            <Text style={[styles.chipText, dateMode === "all" && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "day" && styles.chipActive]}
            onPress={() => { setDateMode("day"); setShowDayPicker(true); setShowMonthPicker(false); setShowYearPicker(false); }}
          >
            <Text style={[styles.chipText, dateMode === "day" && styles.chipTextActive]}>Día</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "weekRange" && styles.chipActive]}
            onPress={() => { setDateMode("weekRange"); setShowWeekStartPicker(true); setShowMonthPicker(false); setShowYearPicker(false); }}
          >
            <Text style={[styles.chipText, dateMode === "weekRange" && styles.chipTextActive]}>Semana (rango)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "month" && styles.chipActive]}
            onPress={() => {
              setDateMode("month");
              setShowMonthPicker(true);
              setShowYearPicker(false);
            }}
          >
            <Text style={[styles.chipText, dateMode === "month" && styles.chipTextActive]}>Mes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "year" && styles.chipActive]}
            onPress={() => {
              setDateMode("year");
              setShowYearPicker(true);
              setShowMonthPicker(false);
            }}
          >
            <Text style={[styles.chipText, dateMode === "year" && styles.chipTextActive]}>Año</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.85}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.refreshBtnText}>Recargar</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.activeRangeText}>
          {activeRangeText}
          {loadingCatalog ? " · cargando catálogo…" : ""}
        </Text>

        {showDayPicker && (
          <DateTimePicker
            value={dayRef ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android" && e.type !== "set") { setShowDayPicker(false); return; }
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
              if (Platform.OS === "android" && e.type !== "set") { setShowWeekStartPicker(false); return; }
              if (date) { setWeekStart(date); if (Platform.OS !== "ios") setShowWeekEndPicker(true); }
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
              if (Platform.OS === "android" && e.type !== "set") { setShowWeekEndPicker(false); return; }
              if (date) setWeekEnd(date);
              setShowWeekEndPicker(Platform.OS === "ios");
            }}
          />
        )}

        {dateMode === "weekRange" && (
          <View style={styles.rangeButtonsRow}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => setShowWeekStartPicker(true)}>
              <Text style={styles.smallBtnText}>Inicio: {weekStart ? weekStart.toLocaleDateString() : "—"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallBtn} onPress={() => setShowWeekEndPicker(true)}>
              <Text style={styles.smallBtnText}>Fin: {weekEnd ? weekEnd.toLocaleDateString() : "—"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal
        visible={showMonthPicker && dateMode === "month"}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthPicker(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setShowMonthPicker(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.pickerRow}>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setMonthYear((s) => ({ ...s, year: s.year - 1 }))}
              >
                <Text style={styles.pickerBtnText}>‹</Text>
              </TouchableOpacity>

              <Text style={styles.pickerTitle}>{monthYear.year}</Text>

              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setMonthYear((s) => ({ ...s, year: s.year + 1 }))}
              >
                <Text style={styles.pickerBtnText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.monthGrid}>
              {MONTHS.map((m, idx) => {
                const active = idx === monthYear.month;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthCell, active && styles.monthCellActive]}
                    onPress={() => {
                      setMonthYear({ month: idx, year: monthYear.year });
                      setShowMonthPicker(false);
                    }}
                  >
                    <Text style={[styles.monthCellText, active && styles.monthCellTextActive]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showYearPicker && dateMode === "year"}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearPicker(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setShowYearPicker(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.yearRow}>
              <TouchableOpacity style={styles.yearNav} onPress={() => setYearOnly((y) => y - 1)}>
                <Text style={styles.yearNavText}>−</Text>
              </TouchableOpacity>

              <Text style={styles.pickerTitle}>{yearOnly}</Text>

              <TouchableOpacity style={styles.yearNav} onPress={() => setYearOnly((y) => y + 1)}>
                <Text style={styles.yearNavText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.doneBtn]}
              onPress={() => setShowYearPicker(false)}
              activeOpacity={0.9}
            >
              <Text style={styles.doneBtnText}>Listo</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Text style={styles.pageSubtitle}>{loading ? "Cargando..." : `${ordenes.length} órdenes`}</Text>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(it) => String(it.orderid)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No hay órdenes en este rango.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },

  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: COLORS.cardBg,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.cardBg },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { color: COLORS.title, fontWeight: "600" },
  chipTextActive: { color: "#fff" },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  refreshBtnText: { color: "#fff", fontWeight: "800" },

  activeRangeText: { marginTop: 8, color: COLORS.muted, fontSize: 12 },

  rangeButtonsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: "#F5F7FA", borderWidth: 1, borderColor: COLORS.border, flex: 1 },
  smallBtnText: { color: COLORS.title, fontWeight: "600", textAlign: "center" },

  pageSubtitle: { paddingHorizontal: 16, paddingVertical: 6, fontSize: 13, color: COLORS.text },

  listContent: { paddingHorizontal: 12, paddingBottom: 80 },

  card: { flexDirection: "row", marginBottom: 12, backgroundColor: COLORS.cardBg, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, elevation: 1 },
  sideBar: { width: 6, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  cardBody: { flex: 1, padding: 12 },
  topRow: { flexDirection: "row", justifyContent: "space-between" },
  titleWrap: { flexDirection: "row", flex: 1 },
  avatar: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#EFF4F9", alignItems: "center", justifyContent: "center", marginRight: 10 },
  title: { fontSize: 15, fontWeight: "600", color: COLORS.title },
  subTitle: { fontSize: 12, color: "#7A8794" },
  statusPill: { flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10, maxWidth: 200 },
  statusText: { fontSize: 11, fontWeight: "600", flexShrink: 1 },

  metaRow: { flexDirection: "row", marginTop: 10, gap: 16, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, color: COLORS.text },

  emptyText: { textAlign: "center", marginTop: 24, color: COLORS.text },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 18,
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  pickerBtn: { width: 40, height: 34, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  pickerBtnText: { fontSize: 18, fontWeight: "900", color: COLORS.accent },
  pickerTitle: { fontSize: 16, fontWeight: "800", color: COLORS.title },

  monthGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  monthCell: { width: "31.5%", backgroundColor: "#FFFFFF", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  monthCellActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  monthCellText: { color: COLORS.title, fontWeight: "700" },
  monthCellTextActive: { color: "#fff" },

  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  yearNav: { width: 44, height: 36, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  yearNavText: { fontSize: 18, fontWeight: "900", color: COLORS.accent },

  doneBtn: {
    marginTop: 10,
    backgroundColor: COLORS.accent,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  doneBtnText: { color: "#fff", fontWeight: "900" },
});
