// app/tecnico/averias/index.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import Header from "../../../src/components/Header";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAuth } from "../../../src/context/AuthContext";
import api from "../../../src/services/api";

// Paleta Fiori
const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  cardSubtle: "#F5F7FA",
  border: "#DDE6F2",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
};

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

// ===== Helpers =====

// OData datetime: YYYY-MM-DDTHH:mm:ss (sin Z, como tu ejemplo)
const toOdataDateTime = (d, endOfDay = false) => {
  const date = new Date(d);
  if (endOfDay) date.setHours(23, 59, 59, 0);
  else date.setHours(0, 0, 0, 0);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
};

// SAP /Date(…)/ a Date o ISO
const sapDateToDate = (val) => {
  if (!val) return null;
  const s = String(val);
  const m = s.match(/\/Date\((\d+)\)\//);
  if (m?.[1]) {
    const ms = Number(m[1]);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (value) => {
  const d = sapDateToDate(value) || (value ? new Date(value) : null);
  if (!d || Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// rangos
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

export default function AveriaIndexTecnico() {
  const { user, token } = useAuth();

  const [avisos, setAvisos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Filtros
  const [dateMode, setDateMode] = useState("day"); // 'all' | 'day' | 'weekRange' | 'month' | 'year'

  // Día
  const [dayRef, setDayRef] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);

  // Semana (rango)
  const [weekStart, setWeekStart] = useState(null);
  const [weekEnd, setWeekEnd] = useState(null);
  const [showWeekStartPicker, setShowWeekStartPicker] = useState(false);
  const [showWeekEndPicker, setShowWeekEndPicker] = useState(false);

  // Mes
  const now = new Date();
  const [monthYear, setMonthYear] = useState({ month: now.getMonth(), year: now.getFullYear() });
  const [showMonthModal, setShowMonthModal] = useState(false);

  // Año
  const [yearOnly, setYearOnly] = useState(now.getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);

  const getCorreo = () =>
    user?.email ||
    user?.correo ||
    user?.preferred_username ||
    user?.upn ||
    user?.username ||
    "";

  // ===== ventana activa =====
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
    // 'all' -> últimos 90 días
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

  // ======== FETCH ODATA (LA URL QUE PEDISTE) ========
  const fetchAvisosForRange = useCallback(async () => {
    try {
      setErrorMsg("");
      setLoading(true);

      const correo = getCorreo();
      if (!correo) {
        setAvisos([]);
        setErrorMsg("No se encontró el correo del usuario logueado.");
        return;
      }

      const createdFrom = toOdataDateTime(start, false);
      const notifTo = toOdataDateTime(end, true);

      // ✅ filter EXACTO como tu ejemplo:
      // CreatedOn ge datetime'...' and NotifDate le datetime'...' and Userstatus eq 'correo'
      const filter = `CreatedOn ge datetime'${createdFrom}' and NotifDate le datetime'${notifTo}' and Userstatus eq '${correo}'`;

      const res = await api.get(
        `/api/odata/ZCS_GET_NOTIFICATION_SRV/NotificationHeaderSet`,
        {
          params: { $filter: filter, $format: "json" },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );

      const raw = res?.data;
      const results =
        raw?.d?.results ??
        raw?.value ??
        (Array.isArray(raw?.d) ? raw.d : null) ??
        (Array.isArray(raw) ? raw : []);

      const mapped = (Array.isArray(results) ? results : []).map((it) => {
        return {
          id: it?.NotifNo,
          NotifNo: it?.NotifNo,
          ShortText: it?.ShortText || "",
          Equipment: it?.Equipment || "",
          FunctLoc: it?.FunctLoc || "",
          CustNo: it?.CustNo || "",
          Priority: it?.Priority || it?.Priotype || "",
          NotifDate: it?.NotifDate || null,
          CreatedOn: it?.CreatedOn || null,
          raw: it,
        };
      });

      // ordena por fecha notif desc
      mapped.sort((a, b) => {
        const da = sapDateToDate(a.NotifDate)?.getTime() ?? 0;
        const db = sapDateToDate(b.NotifDate)?.getTime() ?? 0;
        return db - da;
      });

      setAvisos(mapped);
    } catch (err) {
      console.error("Error cargando avisos OData:", err?.response?.data || err);
      setErrorMsg("No se pudieron cargar los avisos desde SAP. Intenta nuevamente.");
      setAvisos([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [start, end, token, user]);

  useEffect(() => {
    fetchAvisosForRange();
  }, [fetchAvisosForRange]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAvisosForRange();
  };

  // Picker de años
  const YearPickerContent = ({ selectedYear, onSelect, from = 2020, to = now.getFullYear() + 2 }) => {
    const years = [];
    for (let y = to; y >= from; y--) years.push(y);
    return (
      <ScrollView style={{ maxHeight: 320 }}>
        {years.map((y) => (
          <TouchableOpacity
            key={y}
            style={[styles.yearItem, selectedYear === y && styles.yearItemActive]}
            onPress={() => onSelect(y)}
          >
            <Text style={[styles.yearItemText, selectedYear === y && styles.yearItemTextActive]}>
              {y}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderItem = ({ item }) => {
    const notifNo = item?.NotifNo || item?.id;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => {
          if (!notifNo) {
            Alert.alert("Aviso", "No se encontró número de notificación.");
            return;
          }
          router.push(`/tecnico/averias/${notifNo}/detalles`);
        }}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardId}>Notif: {notifNo}</Text>
          {!!item?.Priority && <Text style={styles.prio}>Prio: {item.Priority}</Text>}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.ShortText || "Sin descripción"}
        </Text>

        <Text style={styles.cardSub}>Equipo: {item.Equipment || "—"}</Text>
        <Text style={styles.cardSub}>Fecha notif: {formatDate(item.NotifDate)}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          Ubicación: {item.FunctLoc || "—"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Avisos de avería" />

      {/* Filtros */}
      <View style={styles.filtersWrap}>
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, dateMode === "all" && styles.chipActive]}
            onPress={() => setDateMode("all")}
          >
            <Text style={[styles.chipText, dateMode === "all" && styles.chipTextActive]}>
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
            <Text style={[styles.chipText, dateMode === "day" && styles.chipTextActive]}>
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
            <Text style={[styles.chipText, dateMode === "weekRange" && styles.chipTextActive]}>
              Semana (rango)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "month" && styles.chipActive]}
            onPress={() => {
              setDateMode("month");
              setShowMonthModal(true);
            }}
          >
            <Text style={[styles.chipText, dateMode === "month" && styles.chipTextActive]}>
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
            <Text style={[styles.chipText, dateMode === "year" && styles.chipTextActive]}>
              Año
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.activeRangeText}>{activeRangeText}</Text>

        {!!errorMsg && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={fetchAvisosForRange}>
              <Text style={styles.errorRetry}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Día */}
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

        {/* Semana */}
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
            value={weekEnd ?? weekStart ?? new Date()}
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
                    <Text style={[styles.monthCellText, active && styles.monthCellTextActive]}>
                      {m}
                    </Text>
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
      <Modal
        visible={showYearModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearModal(false)}
      >
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

      {/* Lista */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={FIORI.accent} />
            <Text style={{ marginTop: 10 }}>Cargando avisos...</Text>
          </View>
        ) : (
          <FlatList
            data={avisos}
            keyExtractor={(item, index) => item?.NotifNo?.toString() || `notif-${index}`}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <Text style={{ textAlign: "center", marginTop: 40, color: FIORI.textMuted }}>
                No hay avisos con los filtros actuales.
              </Text>
            }
          />
        )}
      </View>
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
  },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
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

  errorBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FCE0E0",
  },
  errorText: { color: "#7a0000", fontWeight: "700" },
  errorRetry: { marginTop: 4, color: FIORI.accent, fontWeight: "800" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardId: { fontWeight: "bold", fontSize: 14, color: "#111827" },
  prio: { fontSize: 12, color: "#6b7280", fontWeight: "700" },
  cardTitle: { marginTop: 6, fontSize: 15, fontWeight: "700", color: "#111827" },
  cardSub: { marginTop: 2, color: "#6b7280" },

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

  centerContent: { flex: 1, alignItems: "center", justifyContent: "center" },
});
