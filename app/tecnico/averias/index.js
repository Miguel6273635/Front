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

// Usa api.js
import api, { API_URL } from "../../../src/services/api";

// Paleta Fiori
const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  cardSubtle: "#F5F7FA",
  border: "#DDE6F2",
  borderMuted: "#CFD8E3",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
  neutralBtn: "#ECEFF5",
};

export const STATUS_COLORS = {
  pendiente: "#f59e0b",
  en_proceso: "#3b82f6",
  completado: "#10b981",
  cancelado: "#ef4444",
};

// ===== Helpers de fecha =====

// Formatear fecha DD/MM/YYYY
function formatDate(isoOrMillis) {
  if (!isoOrMillis && isoOrMillis !== 0) return "—";
  const d = new Date(isoOrMillis);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Parsear /Date(1764547200000)/ → Date JS
const sapDateToJs = (sapDate) => {
  if (!sapDate) return null;
  const match = /Date\((\d+)\)/.exec(sapDate);
  if (!match) return null;
  const ms = parseInt(match[1], 10);
  return new Date(ms);
};

// Utilidades de rango
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

// Pill visual de estado
const StatusPill = ({ status }) => {
  const st = (status || "pendiente").toLowerCase();
  return (
    <View
      style={[styles.pill, { backgroundColor: STATUS_COLORS[st] || "#6b7280" }]}
    >
      <Text style={styles.pillText}>{st}</Text>
    </View>
  );
};

export default function AveriaIndex() {
  const { user } = useAuth();
  const [avisos, setAvisos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Filtros de fecha
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
  const [monthYear, setMonthYear] = useState({
    month: now.getMonth(),
    year: now.getFullYear(),
  });
  const [showMonthModal, setShowMonthModal] = useState(false);

  // Año
  const [yearOnly, setYearOnly] = useState(now.getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);

  // ===== Ventana de fecha activa (MISMA IDEA QUE ÓRDENES) =====
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

  // Texto del rango (igual estilo que órdenes)
  const activeRangeText = useMemo(() => {
    if (dateMode === "all") return "Últimos 90 días";
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

  const clearFilters = () => {
    setDateMode("day");
    setDayRef(new Date());
    setWeekStart(null);
    setWeekEnd(null);
    setMonthYear({ month: now.getMonth(), year: now.getFullYear() });
    setYearOnly(now.getFullYear());
  };

  // ======== Cargar avisos desde tu backend (OData) ========
  const fetchAvisosForRange = useCallback(async () => {
    try {
      setErrorMsg("");
      setLoading(true);

      if (!start || !end) {
        setAvisos([]);
        return;
      }

      const userEmail = user?.correo || user?.email;
      if (!userEmail) {
        setErrorMsg("No se encontró el correo del usuario logueado.");
        setAvisos([]);
        return;
      }

      const fromStr = start.toISOString().slice(0, 10);
      const toStr = end.toISOString().slice(0, 10);

      const debugUrl = `${API_URL}/sap/notificaciones?from=${fromStr}&to=${toStr}&user=${encodeURIComponent(
        userEmail
      )}`;
      console.log("[App Avisos] URL:", debugUrl);

      const resp = await api.get("/sap/notificaciones", {
        params: {
          from: fromStr,
          to: toStr,
          user: userEmail,
        },
      });

      const json = resp.data;
      if (!json.ok) {
        throw new Error(json.message || "Error en backend mitsu_backend");
      }

      const results = Array.isArray(json.data) ? json.data : [];

      const lista = results.map((n) => {
        const notifDate =
          sapDateToJs(n.NotifDate) || sapDateToJs(n.Strmlfndate);

        return {
          id: n.NotifNo,
          raw: n,
          razon_social: n.CustNo || n.DocNumber || "—",
          tipo_de_equipo: n.Equipment || "—",
          fecha: notifDate ? notifDate.toISOString() : null,
          ubicacion: n.FunctLoc || n.LocAcc || "—",
          status: "pendiente",
          numero_notificacion: n.NotifNo,
          equipo: n.Equipment,
          prioridad: n.Priotype,
        };
      });

      setAvisos(lista);
    } catch (err) {
      console.error("Error cargando avisos desde backend:", err);
      setErrorMsg(
        "No se pudieron cargar los avisos de avería desde SAP. Intenta nuevamente."
      );
      setAvisos([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [start, end, user]);

  useEffect(() => {
    fetchAvisosForRange();
  }, [fetchAvisosForRange]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAvisosForRange();
  };

  // Picker de años (scroll)
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

  // Tarjeta
  const renderItem = ({ item }) => {
    const idNotif = item.id;
    const tipoEquipo = item.tipo_de_equipo || "—";
    const fecha = item.fecha || null;
    const ubicacion = item.ubicacion || "—";
    const status = item.status || "pendiente";

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (!idNotif) {
            Alert.alert("Aviso", "No se encontró número de notificación.");
            return;
          }
          router.push(`/tecnico/averias/${idNotif}/detalles`);
        }}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardId}>Notif: {idNotif}</Text>
          <StatusPill status={status} />
        </View>

        <Text style={styles.cardTitle}>Equipo: {tipoEquipo}</Text>
        <Text style={styles.cardSub}>Fecha notif: {formatDate(fecha)}</Text>
        <Text style={styles.cardSub}>Ubicación: {ubicacion}</Text>
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
        </View>

        <Text style={styles.activeRangeText}>{activeRangeText}</Text>

        {/* Pickers de fechas: Día */}
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

        {/* Pickers de fechas: Semana */}
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

      {/* Modales Mes / Año */}
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

      {/* Lista */}
      <View style={styles.content}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={FIORI.accent} />
            <Text style={{ marginTop: 10 }}>Cargando avisos...</Text>
          </View>
        ) : (
          <FlatList
            data={avisos}
            keyExtractor={(item, index) =>
              item.id?.toString() || `notif-${index}`
            }
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <Text style={{ textAlign: "center", marginTop: 40 }}>
                No hay avisos con los filtros actuales.
              </Text>
            }
            ListFooterComponent={
              <View
                style={{
                  alignItems: "center",
                  marginTop: 16,
                  marginBottom: 32,
                }}
              >
                <TouchableOpacity
                  style={styles.refreshBtn}
                  onPress={fetchAvisosForRange}
                >
                  <Text style={styles.refreshBtnText}>Recargar</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>

    
    </View>
  );
}

// ======== ESTILOS ========
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },
  content: { flex: 1 },

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
      android: { elevation: 1 },
    }),
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
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
  chipText: { color: FIORI.ink, fontWeight: "600" },
  chipTextActive: { color: "#fff" },

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
  smallBtnText: { color: FIORI.ink, fontWeight: "600" },

  // Cards
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardId: { fontWeight: "bold", fontSize: 14, color: "#111827" },
  cardTitle: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  cardSub: { marginTop: 2, color: "#6b7280" },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  errorBox: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: { color: "#991b1b", fontWeight: "600" },
  errorRetry: {
    marginTop: 2,
    color: "#b91c1c",
    fontSize: 12,
    textDecorationLine: "underline",
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
  modalHeaderTitle: { fontSize: 18, fontWeight: "700", color: FIORI.ink },
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

  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  refreshBtn: {
    backgroundColor: FIORI.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  refreshBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
});
