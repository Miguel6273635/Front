// app/supervisor/reprogramacionesPlan/opciones/normal/reprogramar-orden.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  Platform,
  StatusBar,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Calendar, LocaleConfig } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../../src/components/Header";
import { useAuth } from "../../../../src/context/AuthContext";
import { SafeAreaView } from "react-native-safe-area-context";

// ✅ OFFLINE service (tú lo creas en: src/services/reprogramacionesSupervisor.js)
import {
  fetchReprogramacionesOrders,
  rescheduleWorkorders,
} from "../../../../src/services/reprogramacionesSupervisor";

/* ====================== Locale ES ====================== */
LocaleConfig.locales.es = {
  monthNames: [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
  ],
  monthNamesShort: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],
  dayNames: ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"],
  dayNamesShort: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],
  today: "Hoy",
};
LocaleConfig.defaultLocale = "es";

/* ====================== Colores ====================== */
const COLORS = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  textPrimary: "#0B1F3B",
  textSub: "#6A7381",
  accent: "#0A6ED1",
  danger: "#E76565",
  ok: "#1F8A5B",
  warn: "#B26A00",

  // estados sync
  pendingBg: "#FFF7EA",
  pendingBorder: "#F0D7A8",
  sentBg: "#ECFFF6",
  sentBorder: "#BFE7D5",
  errBg: "#FFEDED",
  errBorder: "#F3B4B4",
};

/* ====================== Helpers ====================== */
const pad2 = (n) => String(n).padStart(2, "0");
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const safeStr = (v) => (v == null ? "" : String(v));

function ymdToSAP(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${y}${m}${d}`;
}
function ymdToDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// /Date(1768435200000)/ -> YYYY-MM-DD
function odataDateToYMD(value) {
  const s = safeStr(value);
  const match = s.match(/\/Date\((\d+)\)\//);
  if (!match) return "";
  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return toYMD(d);
}

/**
 * ✅ Regla de ocultamiento:
 * NO mostrar si Userstatus contiene códigos y TODOS están entre 0001..0011.
 * Mostrar si vacío o si hay algún código fuera del rango.
 */
function shouldHideByUserstatus(userstatusRaw) {
  const s = safeStr(userstatusRaw).trim();
  if (!s) return false;

  const codes = s.match(/\b\d{4}\b/g) || [];
  if (codes.length === 0) return false;

  const allInRange = codes.every((c) => {
    const n = Number(c);
    return n >= 1 && n <= 11;
  });

  return allInRange;
}

function getMonthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { startYmd: toYMD(start), endYmd: toYMD(end) };
}

function buildODataDayFilter({ ymd, email }) {
  return `StartDate ge datetime'${ymd}T00:00:00' and FinishDate le datetime'${ymd}T23:59:59' and Userstatus eq '${email}'`;
}

function buildODataRangeFilter({ startYmd, endYmd, email }) {
  return `StartDate ge datetime'${startYmd}T00:00:00' and FinishDate le datetime'${endYmd}T23:59:59' and Userstatus eq '${email}'`;
}

function buildRangeMarkedDates(startYmd, endYmd) {
  const marked = {};
  if (!startYmd) return marked;

  if (startYmd && !endYmd) {
    marked[startYmd] = {
      selected: true,
      selectedColor: COLORS.accent,
      selectedTextColor: "#fff",
    };
    return marked;
  }

  const s = ymdToDate(startYmd);
  const e = ymdToDate(endYmd);
  if (e < s) return marked;

  let cur = new Date(s);
  while (cur <= e) {
    const key = toYMD(cur);
    marked[key] = {
      color: COLORS.accent,
      textColor: "#FFFFFF",
      startingDay: key === startYmd,
      endingDay: key === endYmd,
    };
    cur.setDate(cur.getDate() + 1);
  }
  return marked;
}

function getSyncBadge(sync) {
  const state = sync?.state;
  if (!state) return null;

  if (state === "pending") {
    return { label: "PENDIENTE DE ENVIAR", bg: COLORS.pendingBg, border: COLORS.pendingBorder, color: COLORS.warn };
  }
  if (state === "sent") {
    return { label: "ENVIADO", bg: COLORS.sentBg, border: COLORS.sentBorder, color: COLORS.ok };
  }
  if (state === "error") {
    return { label: "ERROR", bg: COLORS.errBg, border: COLORS.errBorder, color: COLORS.danger };
  }
  return null;
}

export default function ReprogramarOrden() {
  const { user } = useAuth(); // token ya no lo necesitamos aquí; el service lo toma de AsyncStorage

  const supervisorEmail =
    safeStr(user?.email) ||
    safeStr(user?.correo) ||
    safeStr(user?.username) ||
    "supervisor1@mitsu.com";

  const today = new Date();
  const [anioVisible, setAnioVisible] = useState(today.getFullYear());
  const [mesVisible, setMesVisible] = useState(today.getMonth() + 1);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null); // filtro exacto por día
  const [query, setQuery] = useState("");

  // multiselect
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectedCount = selectedIds.size;
  const bulkMode = selectedCount > 0;

  // Modal reprogramar UNA (rango)
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pickStep, setPickStep] = useState("start"); // "start" | "end"
  const [tempStart, setTempStart] = useState("");
  const [tempEnd, setTempEnd] = useState("");
  const [saving, setSaving] = useState(false);

  // Modal reprogramar VARIAS (rango igual para todas)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState("start"); // "start" | "end"
  const [bulkStart, setBulkStart] = useState(""); // YYYY-MM-DD
  const [bulkEnd, setBulkEnd] = useState(""); // YYYY-MM-DD
  const [bulkSaving, setBulkSaving] = useState(false);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ✅ FETCH offline-friendly (cache first, network if available)
  const fetchOrders = useCallback(
    async ({ year, month, dayYmd }) => {
      try {
        setLoading(true);

        // Tu filtro OData (igual que antes) PERO lo construye el service si hay red.
        // Aquí solo le pasamos parámetros.
        const r = await fetchReprogramacionesOrders({
          year,
          month,
          dayYmd,
          supervisorEmail,
        });

        // r.orders ya puede traer _sync por orden
        const list = Array.isArray(r.orders) ? r.orders : [];

        // (opcional) si el backend devolviera cosas raras, reforzamos la regla de ocultamiento
        const cleaned = list
          .map((x) => {
            // Asegura shape
            const id = safeStr(x.id);
            const userstatusCodes = safeStr(x.userstatusCodes);
            const startDate =
              safeStr(x.startDate).includes("/Date(") ? odataDateToYMD(x.startDate) : safeStr(x.startDate);
            const finishDate =
              safeStr(x.finishDate).includes("/Date(") ? odataDateToYMD(x.finishDate) : safeStr(x.finishDate);

            return {
              ...x,
              id,
              equipo: safeStr(x.equipo),
              shortText: safeStr(x.shortText),
              startDate,
              finishDate,
              userstatusCodes,
            };
          })
          .filter((o) => o.id)
          .filter((o) => !shouldHideByUserstatus(o.userstatusCodes));

        setOrders(cleaned);
        clearSelection();

        if (!r.ok && r.from !== "cache") {
          Alert.alert("Error", "No se pudieron cargar las órdenes.");
        }
      } catch (error) {
        console.error("[REPROGRAMAR FETCH ERROR]", error?.message || error);
        Alert.alert("Error", "No se pudieron cargar las órdenes.");
        setOrders([]);
        clearSelection();
      } finally {
        setLoading(false);
      }
    },
    [supervisorEmail]
  );

  useEffect(() => {
    // ✅ ya no dependemos de token; si estás offline, el service regresa cache
    fetchOrders({ year: anioVisible, month: mesVisible, dayYmd: null });
  }, [anioVisible, mesVisible, fetchOrders]);

  const markedDates = useMemo(() => {
    const marks = {};
    orders.forEach((o) => {
      if (o.startDate) marks[o.startDate] = { ...(marks[o.startDate] || {}), marked: true, dotColor: COLORS.accent };
    });

    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] || {}),
        selected: true,
        selectedColor: COLORS.accent,
        selectedTextColor: "#FFFFFF",
      };
    }
    return marks;
  }, [orders, selectedDate]);

  const filteredOrders = useMemo(() => {
    let list = orders;

    if (selectedDate) list = list.filter((o) => o.startDate === selectedDate);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        (`${o.id} ${o.equipo} ${o.shortText} ${o.userstatusCodes} ${o._sync?.state || ""}`)
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [orders, selectedDate, query]);

  // ===== UNA orden (rango) =====
  function openEdit(order) {
    if (bulkMode) return;

    setEditing(order);

    const start = order.startDate || toYMD(new Date());
    setTempStart(start);
    setTempEnd("");
    setPickStep("start");
    setEditOpen(true);
  }

  function closeEdit() {
    if (saving) return;
    setEditOpen(false);
    setEditing(null);
    setPickStep("start");
    setTempStart("");
    setTempEnd("");
  }

  function onPickDate(ymd) {
    if (pickStep === "start") {
      setTempStart(ymd);
      setTempEnd("");
      setPickStep("end");
      return;
    }

    if (tempStart && ymdToDate(ymd) < ymdToDate(tempStart)) {
      Alert.alert("Fecha inválida", "La fecha fin no puede ser menor a la fecha inicio.");
      return;
    }
    setTempEnd(ymd);
  }

  function canSave() {
    return !!editing && !!tempStart && !!tempEnd && !saving;
  }

  async function saveEdit() {
    if (!editing) return;

    if (!tempStart || !tempEnd) {
      Alert.alert("Faltan fechas", "Selecciona fecha inicio y fecha fin.");
      return;
    }
    if (ymdToDate(tempEnd) < ymdToDate(tempStart)) {
      Alert.alert("Fecha inválida", "La fecha fin no puede ser menor a la fecha inicio.");
      return;
    }

    // ✅ payload igual al original (solo para log si quieres verlo)
    const payload = {
      WorkOrderHeader: { Supervisor: supervisorEmail },
      WorkOrderItemsSet: [
        {
          OrderId: safeStr(editing.id),
          OrderItem: "",
          FechaIni: ymdToSAP(tempStart),
          FechaFin: ymdToSAP(tempEnd),
        },
      ],
      ReturnSet: [],
    };

    try {
      setSaving(true);

      console.log("[REPROGRAMACION] payload:", JSON.stringify(payload, null, 2));

      // ✅ ahora: ONLINE -> manda a SAP | OFFLINE -> lo encola y guarda status
      const r = await rescheduleWorkorders({
        supervisorEmail,
        items: [{ orderId: safeStr(editing.id), startYmd: tempStart, endYmd: tempEnd }],
      });

      // ✅ UI optimista SIEMPRE
      setOrders((prev) =>
        prev.map((o) =>
          o.id === editing.id
            ? {
                ...o,
                startDate: tempStart,
                finishDate: tempEnd,
                _sync: {
                  ...(o._sync || {}),
                  state: r.mode === "offline" ? "pending" : "sent",
                  startYmd: tempStart,
                  endYmd: tempEnd,
                  updatedAt: Date.now(),
                  outboxId: r.outboxId || o?._sync?.outboxId,
                  lastError: "",
                },
              }
            : o
        )
      );

      closeEdit();

      if (r.mode === "offline") {
        Alert.alert(
          "Guardado offline",
          `Orden #${editing.id}\nSe enviará cuando haya internet.\nInicio: ${tempStart}\nFin: ${tempEnd}`
        );
      } else if (r.ok) {
        Alert.alert("Reprogramación lista", `Orden #${editing.id}\nInicio: ${tempStart}\nFin: ${tempEnd}`);
      } else {
        Alert.alert("Error", "No se pudo reprogramar.");
      }
    } catch (error) {
      console.error("[REPROGRAMACION ERROR]", error?.message || error);
      Alert.alert("Error", "No se pudo reprogramar (revisa logs).");
    } finally {
      setSaving(false);
    }
  }

  // ===== VARIAS órdenes (rango) =====
  function openBulk() {
    if (!bulkMode) return;

    const fallback = toYMD(new Date());
    const start = bulkStart || fallback;

    setBulkStep("start");
    setBulkStart(start);
    setBulkEnd(bulkEnd || "");
    setBulkOpen(true);
  }

  function closeBulk() {
    if (bulkSaving) return;
    setBulkOpen(false);
    setBulkStep("start");
    // ✅ NO limpiamos bulkStart/bulkEnd para recordar la última selección
  }

  function onPickBulkDate(ymd) {
    if (bulkStep === "start") {
      setBulkStart(ymd);
      setBulkEnd("");
      setBulkStep("end");
      return;
    }

    if (bulkStart && ymdToDate(ymd) < ymdToDate(bulkStart)) {
      Alert.alert("Fecha inválida", "La fecha fin no puede ser menor a la fecha inicio.");
      return;
    }
    setBulkEnd(ymd);
  }

  function canSaveBulk() {
    return bulkMode && !!bulkStart && !!bulkEnd && !bulkSaving;
  }

  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  async function saveBulk() {
    if (!bulkMode) return;

    if (!bulkStart || !bulkEnd) {
      Alert.alert("Faltan fechas", "Selecciona fecha inicio y fecha fin.");
      return;
    }
    if (ymdToDate(bulkEnd) < ymdToDate(bulkStart)) {
      Alert.alert("Fecha inválida", "La fecha fin no puede ser menor a la fecha inicio.");
      return;
    }

    const payload = {
      WorkOrderHeader: { Supervisor: supervisorEmail },
      WorkOrderItemsSet: selectedIdsArray.map((id) => ({
        OrderId: safeStr(id),
        OrderItem: "",
        FechaIni: ymdToSAP(bulkStart),
        FechaFin: ymdToSAP(bulkEnd),
      })),
      ReturnSet: [],
    };

    try {
      setBulkSaving(true);

      console.log("[REPROGRAMACION BULK] payload:", JSON.stringify(payload, null, 2));

      // ✅ ONLINE -> manda | OFFLINE -> encola
      const r = await rescheduleWorkorders({
        supervisorEmail,
        items: selectedIdsArray.map((id) => ({
          orderId: safeStr(id),
          startYmd: bulkStart,
          endYmd: bulkEnd,
        })),
      });

      // ✅ UI optimista
      setOrders((prev) =>
        prev.map((o) =>
          selectedIds.has(o.id)
            ? {
                ...o,
                startDate: bulkStart,
                finishDate: bulkEnd,
                _sync: {
                  ...(o._sync || {}),
                  state: r.mode === "offline" ? "pending" : "sent",
                  startYmd: bulkStart,
                  endYmd: bulkEnd,
                  updatedAt: Date.now(),
                  outboxId: r.outboxId || o?._sync?.outboxId,
                  lastError: "",
                },
              }
            : o
        )
      );

      const count = selectedIdsArray.length;
      clearSelection();
      setBulkOpen(false);

      if (r.mode === "offline") {
        Alert.alert(
          "Guardado offline",
          `Se guardaron ${count} órdenes.\nSe enviarán cuando haya internet.\nInicio: ${bulkStart}\nFin: ${bulkEnd}`
        );
      } else if (r.ok) {
        Alert.alert("Reprogramación lista", `Se reprogramaron ${count} órdenes.\nInicio: ${bulkStart}\nFin: ${bulkEnd}`);
      } else {
        Alert.alert("Error", "No se pudieron reprogramar las órdenes seleccionadas.");
      }
    } catch (error) {
      console.error("[REPROGRAMACION BULK ERROR]", error?.message || error);
      Alert.alert("Error", "No se pudieron reprogramar las órdenes seleccionadas.");
    } finally {
      setBulkSaving(false);
    }
  }

  const monthLabel = `${pad2(mesVisible)}/${anioVisible}`;

  const HeaderUI = (
    <View>
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="person-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Supervisor</Text>

          <Pressable
            onPress={() => fetchOrders({ year: anioVisible, month: mesVisible, dayYmd: null })}
            style={styles.refreshBtn}
          >
            <Ionicons name="refresh" size={16} color={COLORS.textSub} />
            <Text style={styles.refreshText}>Actualizar</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>{safeStr(supervisorEmail)}</Text>

        <Text style={styles.hint}>
          Mes visible: <Text style={styles.bold}>{monthLabel}</Text>
        </Text>

        <Text style={styles.hint}>
          *Se ocultan si Userstatus es únicamente códigos 0001..0011.
        </Text>
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="today-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Calendario</Text>

          {!!selectedDate && (
            <Pressable
              onPress={() => {
                setSelectedDate(null);
                fetchOrders({ year: anioVisible, month: mesVisible, dayYmd: null });
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>Ver mes</Text>
            </Pressable>
          )}
        </View>

        <Calendar
          current={`${anioVisible}-${pad2(mesVisible)}-01`}
          onMonthChange={(m) => {
            if (!m?.year || !m?.month) return;
            if (m.year === anioVisible && m.month === mesVisible) return;
            setAnioVisible(m.year);
            setMesVisible(m.month);
            setSelectedDate(null);
          }}
          markingType="simple"
          markedDates={markedDates}
          onDayPress={(day) => {
            const ymd = day.dateString;
            setSelectedDate(ymd);
            fetchOrders({ year: anioVisible, month: mesVisible, dayYmd: ymd });
          }}
          theme={{
            backgroundColor: "transparent",
            calendarBackground: "transparent",
            textSectionTitleColor: COLORS.textSub,
            dayTextColor: COLORS.textPrimary,
            monthTextColor: COLORS.textPrimary,
            arrowColor: COLORS.accent,
            todayTextColor: COLORS.accent,
          }}
        />

        <Text style={styles.hint}>
          {selectedDate
            ? `Mostrando solo órdenes del día: ${selectedDate}`
            : "Toca un día para filtrar/cargar por esa fecha."}
        </Text>
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="search-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Buscar orden</Text>

          {loading && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={{ color: COLORS.textSub, fontSize: 12 }}>Cargando…</Text>
            </View>
          )}
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.textSub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Busca por #orden, equipo, texto o códigos…"
            placeholderTextColor="#9AA5B1"
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={COLORS.textSub} />
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.count}>
        Mostrando <Text style={styles.bold}>{filteredOrders.length}</Text> órdenes
        {selectedDate ? ` del día ${selectedDate}` : ""}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <Header title="Reprogramar (Supervisor)" />

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={HeaderUI}
        contentContainerStyle={{
          paddingBottom: bulkMode ? 110 : 22,
        }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? "Cargando…" : "No hay resultados."}</Text>}
        renderItem={({ item }) => {
          const checked = selectedIds.has(item.id);
          const badge = getSyncBadge(item._sync);

          return (
            <View style={styles.orderRow}>
              <Pressable onPress={() => toggleSelect(item.id)} style={styles.checkWrap} hitSlop={10}>
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? COLORS.accent : COLORS.textSub}
                />
              </Pressable>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.orderId}>Orden #{item.id}</Text>

                  {!!badge && (
                    <View
                      style={[
                        styles.syncBadge,
                        { backgroundColor: badge.bg, borderColor: badge.border },
                      ]}
                    >
                      <Text style={[styles.syncBadgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.orderSub}>
                  {item.equipo ? item.equipo : "Equipo —"}
                  {item.shortText ? ` • ${item.shortText}` : ""}
                </Text>

                <Text style={styles.orderDates}>
                  Inicio: <Text style={styles.bold}>{item.startDate || "—"}</Text> · Fin:{" "}
                  <Text style={styles.bold}>{item.finishDate || "—"}</Text>
                </Text>

                {!!item.userstatusCodes && (
                  <Text style={styles.small}>Userstatus: {safeStr(item.userstatusCodes).trim() || "—"}</Text>
                )}

                {item._sync?.state === "error" && !!item._sync?.lastError && (
                  <Text style={[styles.small, { color: COLORS.danger }]}>
                    Error: {safeStr(item._sync.lastError)}
                  </Text>
                )}
              </View>

              {!bulkMode && (
                <Pressable style={styles.editBtn} onPress={() => openEdit(item)}>
                  <Ionicons name="calendar-outline" size={18} color="#fff" />
                  <Text style={styles.editBtnText}>Reprogramar</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      {bulkMode && (
        <View style={styles.bulkBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bulkTitle}>Seleccionadas: {selectedCount}</Text>
            <Text style={styles.bulkSub}>Asigna un rango a todas</Text>
          </View>

          <Pressable onPress={clearSelection} style={styles.bulkGhost}>
            <Text style={styles.bulkGhostText}>Limpiar</Text>
          </Pressable>

          <Pressable onPress={openBulk} style={styles.bulkPrimary}>
            <Ionicons name="calendar-outline" size={18} color="#fff" />
            <Text style={styles.bulkPrimaryText}>Reprogramar</Text>
          </Pressable>
        </View>
      )}

      {/* ===== Modal editar UNA (rango) ===== */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? `Orden #${editing.id}` : "Orden"}</Text>
              <Pressable onPress={closeEdit} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <View style={[styles.stepBanner, pickStep === "start" ? styles.stepBannerStart : styles.stepBannerEnd]}>
              <Ionicons
                name={pickStep === "start" ? "flag-outline" : "checkmark-circle-outline"}
                size={18}
                color={pickStep === "start" ? COLORS.warn : COLORS.ok}
              />
              <Text style={styles.stepBannerText}>
                {pickStep === "start" ? "Paso 1: Selecciona la FECHA DE INICIO" : "Paso 2: Selecciona la FECHA DE FIN"}
              </Text>
            </View>

            <View style={styles.pillsRow}>
              <View style={[styles.pill, pickStep === "start" && styles.pillActive]}>
                <Text style={styles.pillLabel}>Inicio</Text>
                <Text style={styles.pillValue}>{tempStart || "—"}</Text>
              </View>
              <View style={[styles.pill, pickStep === "end" && styles.pillActive]}>
                <Text style={styles.pillLabel}>Fin</Text>
                <Text style={styles.pillValue}>{tempEnd || "—"}</Text>
              </View>
            </View>

            <Calendar
              markingType={tempStart && tempEnd ? "period" : "simple"}
              markedDates={tempStart ? buildRangeMarkedDates(tempStart, tempEnd) : {}}
              onDayPress={(d) => onPickDate(d.dateString)}
              theme={{
                backgroundColor: "transparent",
                calendarBackground: "transparent",
                textSectionTitleColor: COLORS.textSub,
                dayTextColor: COLORS.textPrimary,
                monthTextColor: COLORS.textPrimary,
                arrowColor: COLORS.accent,
                todayTextColor: COLORS.accent,
              }}
            />

            <View style={styles.stepRow}>
              <Pressable
                onPress={() => {
                  setPickStep("start");
                  setTempStart(editing?.startDate || toYMD(new Date()));
                  setTempEnd("");
                }}
                style={[styles.stepBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
              >
                <Ionicons name="arrow-back" size={16} color={COLORS.textPrimary} />
                <Text style={styles.stepBtnText}>Elegir inicio</Text>
              </Pressable>

              {pickStep === "end" && (
                <Pressable
                  onPress={() => {
                    if (!tempStart) return;
                    setTempEnd(tempStart);
                  }}
                  style={[styles.stepBtn, saving && { opacity: 0.6 }]}
                  disabled={saving}
                >
                  <Ionicons name="swap-horizontal" size={16} color={COLORS.textPrimary} />
                  <Text style={styles.stepBtnText}>Fin = Inicio</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setPickStep("start");
                  setTempStart(editing?.startDate || toYMD(new Date()));
                  setTempEnd("");
                }}
                style={[styles.ghostBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
              >
                <Text style={styles.ghostBtnText}>Restaurar</Text>
              </Pressable>

              <Pressable
                onPress={saveEdit}
                style={[styles.primaryBtn, !canSave() && { opacity: 0.6 }]}
                disabled={!canSave()}
              >
                <Text style={styles.primaryBtnText}>{saving ? "Guardando…" : "Guardar"}</Text>
              </Pressable>
            </View>

            <Text style={styles.modalFooter}>
              *En POST NO se manda $format ni $expand. FechaIni/FechaFin van en YYYYMMDD. (Offline: se encola y se envía al volver red)
            </Text>
          </View>
        </View>
      </Modal>

      {/* ===== Modal BULK (rango a varias) ===== */}
      <Modal visible={bulkOpen} transparent animationType="fade" onRequestClose={closeBulk}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reprogramar {selectedCount} órdenes</Text>
              <Pressable onPress={closeBulk} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <View style={[styles.stepBanner, bulkStep === "start" ? styles.stepBannerStart : styles.stepBannerEnd]}>
              <Ionicons
                name={bulkStep === "start" ? "flag-outline" : "checkmark-circle-outline"}
                size={18}
                color={bulkStep === "start" ? COLORS.warn : COLORS.ok}
              />
              <Text style={styles.stepBannerText}>
                {bulkStep === "start"
                  ? "Paso 1: Selecciona la FECHA DE INICIO (para todas)"
                  : "Paso 2: Selecciona la FECHA DE FIN (para todas)"}
              </Text>
            </View>

            <View style={styles.pillsRow}>
              <View style={[styles.pill, bulkStep === "start" && styles.pillActive]}>
                <Text style={styles.pillLabel}>Inicio</Text>
                <Text style={styles.pillValue}>{bulkStart || "—"}</Text>
              </View>
              <View style={[styles.pill, bulkStep === "end" && styles.pillActive]}>
                <Text style={styles.pillLabel}>Fin</Text>
                <Text style={styles.pillValue}>{bulkEnd || "—"}</Text>
              </View>
            </View>

            <Calendar
              markingType={bulkStart && bulkEnd ? "period" : "simple"}
              markedDates={bulkStart ? buildRangeMarkedDates(bulkStart, bulkEnd) : {}}
              onDayPress={(d) => onPickBulkDate(d.dateString)}
              theme={{
                backgroundColor: "transparent",
                calendarBackground: "transparent",
                textSectionTitleColor: COLORS.textSub,
                dayTextColor: COLORS.textPrimary,
                monthTextColor: COLORS.textPrimary,
                arrowColor: COLORS.accent,
                todayTextColor: COLORS.accent,
              }}
            />

            <View style={styles.stepRow}>
              <Pressable
                onPress={() => {
                  setBulkStep("start");
                  setBulkStart(bulkStart || toYMD(new Date()));
                  setBulkEnd("");
                }}
                style={[styles.stepBtn, bulkSaving && { opacity: 0.6 }]}
                disabled={bulkSaving}
              >
                <Ionicons name="arrow-back" size={16} color={COLORS.textPrimary} />
                <Text style={styles.stepBtnText}>Elegir inicio</Text>
              </Pressable>

              {bulkStep === "end" && (
                <Pressable
                  onPress={() => {
                    if (!bulkStart) return;
                    setBulkEnd(bulkStart);
                  }}
                  style={[styles.stepBtn, bulkSaving && { opacity: 0.6 }]}
                  disabled={bulkSaving}
                >
                  <Ionicons name="swap-horizontal" size={16} color={COLORS.textPrimary} />
                  <Text style={styles.stepBtnText}>Fin = Inicio</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setBulkOpen(false)}
                style={[styles.ghostBtn, bulkSaving && { opacity: 0.6 }]}
                disabled={bulkSaving}
              >
                <Text style={styles.ghostBtnText}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={saveBulk}
                style={[styles.primaryBtn, (!canSaveBulk() || bulkSaving) && { opacity: 0.6 }]}
                disabled={!canSaveBulk() || bulkSaving}
              >
                <Text style={styles.primaryBtnText}>{bulkSaving ? "Guardando…" : "Guardar"}</Text>
              </Pressable>
            </View>

            <Text style={styles.modalFooter}>
              Inicio: <Text style={styles.bold}>{bulkStart || "—"}</Text> · Fin:{" "}
              <Text style={styles.bold}>{bulkEnd || "—"}</Text>
              {"\n"}
              *Offline: se guarda en cola y se envía al volver red.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ====================== Styles ====================== */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.pageBg },

  card: {
    backgroundColor: COLORS.cardBg,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 2 },
    }),
  },

  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, flex: 1 },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
  },
  refreshText: { fontSize: 12, fontWeight: "800", color: COLORS.textSub },

  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
  },
  clearBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.textSub },

  hint: { marginTop: 8, fontSize: 12, color: COLORS.textSub },
  bold: { fontWeight: "900", color: COLORS.textPrimary },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    backgroundColor: "#fff",
  },
  searchInput: { flex: 1, fontSize: 13.5, color: COLORS.textPrimary },

  count: { marginHorizontal: 16, marginTop: 10, color: COLORS.textSub, fontSize: 12.5 },
  empty: { paddingVertical: 18, paddingHorizontal: 16, color: COLORS.textSub, fontSize: 13 },

  orderRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fff",
  },
  checkWrap: { alignSelf: "center" },

  orderId: { fontSize: 14, fontWeight: "900", color: COLORS.textPrimary },
  orderSub: { marginTop: 2, fontSize: 12.5, color: COLORS.textSub },
  orderDates: { marginTop: 6, fontSize: 12.5, color: COLORS.textSub },
  small: { marginTop: 4, fontSize: 11.5, color: COLORS.textSub },

  syncBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  syncBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },

  editBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  editBtnText: { color: "#fff", fontWeight: "900", fontSize: 12.5 },

  bulkBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
    }),
  },
  bulkTitle: { fontWeight: "900", color: COLORS.textPrimary, fontSize: 13 },
  bulkSub: { marginTop: 2, color: COLORS.textSub, fontSize: 12 },

  bulkGhost: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
  },
  bulkGhostText: { fontWeight: "900", color: COLORS.textPrimary, fontSize: 12 },

  bulkPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  bulkPrimaryText: { fontWeight: "900", color: "#fff", fontSize: 12 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 15, fontWeight: "900", color: COLORS.textPrimary },

  stepBanner: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
  },
  stepBannerStart: { borderColor: "#F0D7A8", backgroundColor: "#FFF7EA" },
  stepBannerEnd: { borderColor: "#BFE7D5", backgroundColor: "#ECFFF6" },
  stepBannerText: { flex: 1, fontSize: 12.8, fontWeight: "900", color: COLORS.textPrimary },

  pillsRow: { flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 8 },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
  },
  pillActive: { borderColor: COLORS.accent },
  pillLabel: { fontSize: 11.5, color: COLORS.textSub, fontWeight: "800" },
  pillValue: { marginTop: 2, fontSize: 13, color: COLORS.textPrimary, fontWeight: "900" },

  stepRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  stepBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  stepBtnText: { fontSize: 12.5, fontWeight: "900", color: COLORS.textPrimary },

  modalActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  ghostBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  ghostBtnText: { fontSize: 13, fontWeight: "900", color: COLORS.textPrimary },

  primaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: COLORS.accent },
  primaryBtnText: { fontSize: 13, fontWeight: "900", color: "#fff" },

  modalFooter: { marginTop: 10, fontSize: 11.5, color: COLORS.textSub },
});
