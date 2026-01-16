import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../src/components/Header";
import { router } from "expo-router";
import { fetchOrdenesSupervisor } from "../../../src/services/ordenesSupervisor";
import DateTimePicker from "@react-native-community/datetimepicker";

import { isOnline } from "../../../src/offline/net";
import {
  fetchOrdenDetalleSupervisor,
  fetchOperacionesSupervisor,
  // fetchComponentesPorOperacion, // 👈 lo dejamos opcional por performance
} from "../../../src/services/operacionesSupervisor";

/* ====================== Helpers de fecha ====================== */
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
};

// ✅ límite para no saturar el teléfono
const PREFETCH_LIMIT = 25; // ajusta 10-40 según rendimiento
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

        // Si luego quieres componentes, lo ideal es hacerlo bajo demanda
        // porque puede ser MUCHO. Si insistes, primero obtén ops y solo 1-2 acts.
        // const ops = await fetchOperacionesSupervisor(id);
        // const acts = Array.from(new Set((ops || []).map(o => String(o.Activity || "").padStart(4,"0")))).slice(0, 2);
        // for (const act of acts) await fetchComponentesPorOperacion(id, act);

        console.log("[PREFETCH DETALLE OK]", id);
      } catch (e) {
        console.log("[PREFETCH DETALLE FAIL]", id, e?.message || e);
      }
    }
  };

  // pequeño pool de concurrencia
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

  // ✅ Prefetch automático al entrar (solo 1 vez): -7 / +7 lista
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

        const sStr = ymd(s);
        const eStr = ymd(e);

        await fetchOrdenesSupervisor(sStr, eStr, "range");
        console.log("[PREFETCH LISTA OK]", sStr, eStr);
      } catch (err) {
        console.log("[PREFETCH LISTA ERROR]", err?.message || err);
      }
    })();
  }, []);

  // ✅ Cargar órdenes (según filtros) + prefetch de detalles cuando haya red
  const lastPrefetchKeyRef = useRef("");
  const cargar = async () => {
    try {
      setLoading(true);
      const sStr = ymd(start);
      const eStr = ymd(end);
      const modeParam = dateMode === "day" ? "eq" : "range";

      const data = await fetchOrdenesSupervisor(sStr, eStr, modeParam);
      const arr = Array.isArray(data) ? data : [];
      setOrdenes(arr);

      // ✅ si hay red: precarga detalles/ops de lo que acabas de traer
      const online = await isOnline();
      if (online && arr.length) {
        const prefetchKey = `${sStr}|${eStr}|${modeParam}|${arr.length}`;
        if (lastPrefetchKeyRef.current !== prefetchKey) {
          lastPrefetchKeyRef.current = prefetchKey;

          const ids = arr.map((x) => x?.orderid).filter(Boolean);
          prefetchDetallesDeOrdenes(ids);
        }
      }
    } catch (error) {
      console.error("Error al cargar órdenes supervisor:", error);
      setOrdenes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const renderItem = ({ item }) => {
    const status = item.estatus || "pendiente";

    const color =
      status === "pendiente" ? "#E76565" :
      status === "en_proceso" ? "#F5C044" :
      status === "finalizada_con_pendientes" ? "#F39C12" :
      "#6FCF97";

    const icon =
      status === "pendiente" ? "time-outline" :
      status === "en_proceso" ? "refresh-outline" :
      "checkmark-circle-outline";

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/supervisor/ordenes/${item.orderid}`)}
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
              <Ionicons name={icon} size={14} style={{ marginRight: 4 }} />
              <Text style={styles.statusText}>{String(status).replace(/_/g, " ")}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.text} />
              <Text style={styles.metaText}>
                {item.startdate ? new Date(item.startdate).toLocaleDateString() : "—"}
              </Text>
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
        {/* chips */}
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, dateMode === "all" && styles.chipActive]}
            onPress={() => setDateMode("all")}
          >
            <Text style={[styles.chipText, dateMode === "all" && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "day" && styles.chipActive]}
            onPress={() => { setDateMode("day"); setShowDayPicker(true); }}
          >
            <Text style={[styles.chipText, dateMode === "day" && styles.chipTextActive]}>Día</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "weekRange" && styles.chipActive]}
            onPress={() => { setDateMode("weekRange"); setShowWeekStartPicker(true); }}
          >
            <Text style={[styles.chipText, dateMode === "weekRange" && styles.chipTextActive]}>
              Semana (rango)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "month" && styles.chipActive]}
            onPress={() => { setDateMode("month"); setShowMonthPicker((v) => !v); setShowYearPicker(false); }}
          >
            <Text style={[styles.chipText, dateMode === "month" && styles.chipTextActive]}>Mes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "year" && styles.chipActive]}
            onPress={() => { setDateMode("year"); setShowYearPicker((v) => !v); setShowMonthPicker(false); }}
          >
            <Text style={[styles.chipText, dateMode === "year" && styles.chipTextActive]}>Año</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.activeRangeText}>{activeRangeText}</Text>

        {/* Pickers */}
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

        {showMonthPicker && dateMode === "month" && (
          <View style={styles.pickerBox}>
            <View style={styles.pickerRow}>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setMonthYear((s) => ({ ...s, year: s.year - 1 }))}>
                <Text style={styles.pickerBtnText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>{monthYear.year}</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setMonthYear((s) => ({ ...s, year: s.year + 1 }))}>
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
                    onPress={() => setMonthYear({ month: idx, year: monthYear.year })}
                  >
                    <Text style={[styles.monthCellText, active && styles.monthCellTextActive]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {showYearPicker && dateMode === "year" && (
          <View style={styles.pickerBox}>
            <View style={styles.yearRow}>
              <TouchableOpacity style={styles.yearNav} onPress={() => setYearOnly((y) => y - 1)}>
                <Text style={styles.yearNavText}>−</Text>
              </TouchableOpacity>

              <Text style={styles.pickerTitle}>{yearOnly}</Text>

              <TouchableOpacity style={styles.yearNav} onPress={() => setYearOnly((y) => y + 1)}>
                <Text style={styles.yearNavText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

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

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.cardBg },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { color: COLORS.title, fontWeight: "600" },
  chipTextActive: { color: "#fff" },

  activeRangeText: { marginTop: 8, color: "#63718B", fontSize: 12 },

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
  statusPill: { flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10 },
  statusText: { fontSize: 11, fontWeight: "600" },

  metaRow: { flexDirection: "row", marginTop: 10, gap: 16 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, color: COLORS.text },

  emptyText: { textAlign: "center", marginTop: 24, color: COLORS.text },

  pickerBox: { marginTop: 10, backgroundColor: "#F5F7FA", borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 10 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  pickerBtn: { width: 40, height: 34, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  pickerBtnText: { fontSize: 18, fontWeight: "900", color: COLORS.accent },
  pickerTitle: { fontSize: 16, fontWeight: "800", color: COLORS.title },

  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  monthCell: { width: "31.5%", backgroundColor: "#FFFFFF", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  monthCellActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  monthCellText: { color: COLORS.title, fontWeight: "700" },
  monthCellTextActive: { color: "#fff" },

  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  yearNav: { width: 44, height: 36, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  yearNavText: { fontSize: 18, fontWeight: "900", color: COLORS.accent },
});
