// app/supervisor/no_mantenimiento/detalles.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Modal,
  FlatList,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

import Header from "../../../src/components/Header";
import api from "../../../src/services/api";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  disabled: "#B7C2CF",
};

const pad2 = (n) => String(n).padStart(2, "0");

const parseSapDate = (v) => {
  if (!v) return null;
  const m = String(v).match(/\/Date\((\d+)\)\//);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
};

const formatDateTime = (d) => {
  if (!(d instanceof Date)) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
};

const isNoMantCode = (code) => {
  const s = String(code || "").trim();
  if (!/^\d{4}$/.test(s)) return false;
  const n = Number(s);
  return n >= 1 && n <= 11;
};

// ✅ SAP RESCHEDULE pide YYYYMMDD (no hora)
const toYYYYMMDD = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
};

// ====== ODATA PATHS CORRECTOS ======
const WORKORDER_DETAIL_PATH = "/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet";
const STATUS_CATALOGO_PATH = "/api/odata/ZSD_CATALOGOS_SRV/StatusWorkOrderSet";

// (ya lo tienes funcionando)
const CHANGE_STATUS_PATH = "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet";

// ✅ RESCHEDULE
const RESCHEDULE_PATH = "/api/odata/ZCS_RESCHEDULE_WORKORDER_SRV/WorkOrderHeaderSet";

export default function DetallesNoMantenimiento() {
  const params = useLocalSearchParams();
  const id = String(params?.id || ""); // OrderId
  const correo = String(params?.correo || "miguel.hernandez@tellus-technologies.com");

  const [loading, setLoading] = useState(true);
  const [wo, setWo] = useState(null);

  // ====== catálogo status (0001..0011) ======
  const [modal, setModal] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const [statusOptions, setStatusOptions] = useState([]);
  const [q, setQ] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [statusEnviado, setStatusEnviado] = useState(false);

  // ====== reprogramación ======
  const [savingReprog, setSavingReprog] = useState(false);

  // NOTA: lo de “motivo” lo dejo en estado/UI tal cual, pero NO se valida ni se manda.
  const [motivoReprog, setMotivoReprog] = useState("");

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [fecha, setFecha] = useState(new Date());
  const [hora, setHora] = useState(new Date());

  const fechaHora = useMemo(() => {
    const d = new Date(fecha);
    d.setHours(hora.getHours());
    d.setMinutes(hora.getMinutes());
    d.setSeconds(0);
    d.setMilliseconds(0);
    return d;
  }, [fecha, hora]);

  // ========= DETALLE (WORKORDER) =========
  const fetchDetalle = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);

      const url = `${WORKORDER_DETAIL_PATH}('${encodeURIComponent(id)}')`;
      console.log("[NO_MANTTO DETALLE] ODATA URL =>", `${api.defaults.baseURL}${url}`);

      const { data } = await api.get(url, { params: { $format: "json" } });
      setWo(data?.d || null);
    } catch (e) {
      console.error("Error detalle (WORKORDER ODATA):", e?.response?.data || e?.message);
      setWo(null);
      Alert.alert("Error", "No se pudo cargar el detalle (WorkOrderHeaderSet).");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // ========= CATÁLOGO STATUS (ZSD_CATALOGOS_SRV) =========
  const fetchStatusOptions = useCallback(async () => {
    try {
      setLoadingStatus(true);

      console.log(
        "[STATUS CATALOGO] URL =>",
        `${api.defaults.baseURL}${STATUS_CATALOGO_PATH}?$filter=${encodeURIComponent("Stsma eq 'CS000001'")}`
      );

      const { data } = await api.get(STATUS_CATALOGO_PATH, {
        params: {
          $filter: "Stsma eq 'CS000001'",
          $format: "json",
        },
      });

      const results = Array.isArray(data?.d?.results) ? data.d.results : [];

      const mapped = results
        .map((r) => ({
          code: String(r?.Status1 || "").trim(),
          text: String(r?.Status2 || "").trim(),
          estat: String(r?.Estat || "").trim(),
          stsma: String(r?.Stsma || "").trim(),
        }))
        .filter((x) => isNoMantCode(x.code))
        .sort((a, b) => Number(a.code) - Number(b.code));

      setStatusOptions(mapped);
    } catch (e) {
      console.error("Error catálogo StatusWorkOrderSet:", e?.response?.data || e?.message);
      setStatusOptions([]);
      Alert.alert("Error", "No se pudo cargar el catálogo de status (ZSD_CATALOGOS_SRV).");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchDetalle();
  }, [fetchDetalle]);

  // ========= UI helpers =========
  const filteredOptions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return statusOptions;
    return statusOptions.filter((o) => `${o.code} ${o.text}`.toLowerCase().includes(s));
  }, [q, statusOptions]);

  const openModal = async () => {
    setQ("");
    setSelectedStatus(null);
    setModal(true);
    await fetchStatusOptions();
  };

  // ========= GUARDAR STATUS (0001..0011) =========
  const guardarStatus = async () => {
    if (!selectedStatus?.code) {
      Alert.alert("Falta selección", "Selecciona un status (0001–0011).");
      return;
    }

    try {
      setSavingStatus(true);

      const changePayload = {
        OrderId: String(id),
        WorkOrderHeader: { Orderid: String(id) },
        WorkOrderUserStatusSet: [{ UserStText: String(selectedStatus.code), Langu: "ES", Inactive: "" }],
        Return: [],
      };

      console.log("[NO_MANTTO][GUARDAR STATUS] url:", CHANGE_STATUS_PATH);
      console.log("[NO_MANTTO][GUARDAR STATUS] payload:", JSON.stringify(changePayload, null, 2));

      const resp = await api.post(CHANGE_STATUS_PATH, changePayload);

      const sapData = resp?.data?.d || resp?.data;
      const returns =
        sapData?.ReturnSet?.results || sapData?.Return?.results || sapData?.ReturnSet || sapData?.Return || [];

      const hasError =
        Array.isArray(returns) &&
        returns.some((r) => String(r?.Type || r?.type || "").toUpperCase() === "E");

      if (hasError) {
        console.log("[NO_MANTTO][GUARDAR STATUS] SAP returns:", JSON.stringify(returns, null, 2));
        throw new Error("SAP regresó error al guardar status.");
      }

      setModal(false);
      setStatusEnviado(true);

      Alert.alert("Listo", `Se guardó el status ${selectedStatus.code}. Ya puedes reprogramar.`);
    } catch (e) {
      console.error("[NO_MANTTO][GUARDAR STATUS] ERROR:", e?.response?.data || e?.message);
      Alert.alert("Error", e?.response?.data?.error || e?.message || "No se pudo guardar el status.");
    } finally {
      setSavingStatus(false);
    }
  };

  // ========= REPROGRAMACIÓN (solo habilitar si statusEnviado) =========
  // ✅ ÚNICO AJUSTE PEDIDO: además de RESCHEDULE, mandar también CHANGE_WORKORDER con:
  // - 0012 activo (reprogramación)
  // - 0011 inactivo (X) para quitar el no mantenimiento original
  const guardarReprogramacion = async () => {
    if (!statusEnviado) {
      Alert.alert("Aún no", "Primero selecciona y guarda un status (0001–0011).");
      return;
    }

    try {
      setSavingReprog(true);

      const FechaIni = toYYYYMMDD(fechaHora);
      const FechaFin = toYYYYMMDD(fechaHora);

      // 1) RESCHEDULE (fechas)
      const payloadReschedule = {
        WorkOrderHeader: { Supervisor: correo },
        WorkOrderItemsSet: [{ OrderId: String(id), OrderItem: "", FechaIni, FechaFin }],
        ReturnSet: [],
      };

      console.log("[NO_MANTTO][REPROGRAMAR] url:", `${api.defaults.baseURL}${RESCHEDULE_PATH}`);
      console.log("[NO_MANTTO][REPROGRAMAR] payload RESCHEDULE:", JSON.stringify(payloadReschedule, null, 2));

      const respReschedule = await api.post(RESCHEDULE_PATH, payloadReschedule);

      // Validación simple de retorno
      {
        const sapData = respReschedule?.data?.d || respReschedule?.data;
        const returns =
          sapData?.ReturnSet?.results || sapData?.Return?.results || sapData?.ReturnSet || sapData?.Return || [];
        const hasError =
          Array.isArray(returns) &&
          returns.some((r) => String(r?.Type || r?.type || "").toUpperCase() === "E");
        if (hasError) {
          console.log("[NO_MANTTO][REPROGRAMAR] RESCHEDULE returns:", JSON.stringify(returns, null, 2));
          throw new Error("SAP regresó error al reprogramar (RESCHEDULE).");
        }
      }

      // 2) CHANGE WORKORDER (códigos)
      const payloadChange = {
        OrderId: String(id),
        WorkOrderHeader: {
          Orderid: String(id),
        },
        WorkOrderUserStatusSet: [
          {
            UserStText: "0012", // ✅ clave reprogramación
            Langu: "ES",
            Inactive: "",
          },
          {
            UserStText: "0011", // ✅ quitar código original de no mantenimiento
            Langu: "ES",
            Inactive: "X",
          },
        ],
        Return: [],
      };

      console.log("[NO_MANTTO][REPROGRAMAR] url CHANGE:", `${api.defaults.baseURL}${CHANGE_STATUS_PATH}`);
      console.log("[NO_MANTTO][REPROGRAMAR] payload CHANGE:", JSON.stringify(payloadChange, null, 2));

      const respChange = await api.post(CHANGE_STATUS_PATH, payloadChange);

      // Validación simple de retorno
      {
        const sapData = respChange?.data?.d || respChange?.data;
        const returns =
          sapData?.ReturnSet?.results || sapData?.Return?.results || sapData?.ReturnSet || sapData?.Return || [];
        const hasError =
          Array.isArray(returns) &&
          returns.some((r) => String(r?.Type || r?.type || "").toUpperCase() === "E");
        if (hasError) {
          console.log("[NO_MANTTO][REPROGRAMAR] CHANGE returns:", JSON.stringify(returns, null, 2));
          throw new Error("SAP regresó error al actualizar códigos (CHANGE_WORKORDER).");
        }
      }

      Alert.alert("Listo", "Reprogramación enviada (fechas + código 0012 y baja de 0011).");

      router.replace({
        pathname: "/supervisor/no_mantenimiento",
        params: { refresh: String(Date.now()), correo },
      });
    } catch (e) {
      console.error("[NO_MANTTO][REPROGRAMAR] ERROR:", e?.response?.data || e?.message);
      Alert.alert(
        "Error",
        e?.response?.data?.error || e?.message || "No se pudo guardar la reprogramación."
      );
    } finally {
      setSavingReprog(false);
    }
  };

  // ========= RENDER =========
  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle No mantenimiento" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={{ marginTop: 8, color: COLORS.text }}>Cargando…</Text>
        </View>
      </View>
    );
  }

  if (!wo) {
    return (
      <View style={styles.container}>
        <Header title="Detalle No mantenimiento" />
        <View style={styles.center}>
          <Text style={{ color: COLORS.text }}>No se encontró la orden.</Text>
          <Pressable onPress={fetchDetalle} style={[styles.btn, { marginTop: 12 }]}>
            <Ionicons name="refresh" size={18} color="#FFF" />
            <Text style={styles.btnText}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const startDate = parseSapDate(wo?.StartDate);
  const finishDate = parseSapDate(wo?.FinishDate);

  return (
    <View style={styles.container}>
      <Header title={`Orden ${id}`} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.h}>Datos</Text>
          <Text style={styles.line}>
            <Text style={styles.b}>OrderId: </Text>
            {id}
          </Text>
          <Text style={styles.line}>
            <Text style={styles.b}>Equipo: </Text>
            {wo?.Equipment || "—"}
          </Text>
          <Text style={styles.line}>
            <Text style={styles.b}>Texto: </Text>
            {wo?.ShortText || "—"}
          </Text>
          <Text style={styles.line}>
            <Text style={styles.b}>Userstatus: </Text>
            {wo?.Userstatus || "—"}
          </Text>
          <Text style={[styles.line, { fontSize: 12, marginTop: 8 }]}>
            <Text style={styles.b}>StartDate: </Text>
            {startDate ? startDate.toLocaleString() : "—"}
            {"  ·  "}
            <Text style={styles.b}>FinishDate: </Text>
            {finishDate ? finishDate.toLocaleString() : "—"}
          </Text>
        </View>

        {/* ===== SELECCIÓN STATUS (0001..0011) ===== */}
        <View style={styles.card}>
          <Text style={styles.h}>Motivo No mantenimiento (0001–0011)</Text>
          <Text style={[styles.line, { marginTop: 8 }]}>
            Selecciona un motivo del catálogo (ZSD_CATALOGOS_SRV) y guárdalo.
          </Text>

          <Pressable
            onPress={openModal}
            style={({ pressed }) => [
              styles.btn,
              pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 },
            ]}
          >
            <Ionicons name="list-outline" size={18} color="#FFF" />
            <Text style={styles.btnText}>Elegir motivo</Text>
          </Pressable>

          <Text style={[styles.line, { marginTop: 10 }]}>
            <Text style={styles.b}>Seleccionado: </Text>
            {statusEnviado
              ? `${selectedStatus?.code || "—"} · ${selectedStatus?.text || ""}`
              : "— (aún no guardado)"}
          </Text>

          {!statusEnviado && (
            <Text style={[styles.line, { marginTop: 6, fontSize: 12, color: COLORS.text }]}>
              *La reprogramación estará deshabilitada hasta guardar un status 0001–0011.
            </Text>
          )}
        </View>

        {/* ===== REPROGRAMACIÓN (DESHABILITADA HASTA statusEnviado) ===== */}
        <View style={[styles.card, !statusEnviado && styles.cardDisabled]}>
          <Text style={styles.h}>Reprogramación</Text>

          <Text style={[styles.line, { marginTop: 8 }]}>
            <Text style={styles.b}>Nueva fecha/hora: </Text>
            {formatDateTime(fechaHora)}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[styles.btnOutline, { flex: 1 }, !statusEnviado && styles.btnOutlineDisabled]}
              disabled={!statusEnviado || savingReprog}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={!statusEnviado ? COLORS.disabled : COLORS.accent}
              />
              <Text style={[styles.btnOutlineText, !statusEnviado && { color: COLORS.disabled }]}>
                Fecha
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowTimePicker(true)}
              style={[styles.btnOutline, { flex: 1 }, !statusEnviado && styles.btnOutlineDisabled]}
              disabled={!statusEnviado || savingReprog}
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={!statusEnviado ? COLORS.disabled : COLORS.accent}
              />
              <Text style={[styles.btnOutlineText, !statusEnviado && { color: COLORS.disabled }]}>
                Hora
              </Text>
            </Pressable>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={fecha}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(event, selectedDate) => {
                setShowDatePicker(Platform.OS === "ios");
                if (selectedDate) setFecha(selectedDate);
              }}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={hora}
              mode="time"
              is24Hour
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(event, selectedTime) => {
                setShowTimePicker(Platform.OS === "ios");
                if (selectedTime) setHora(selectedTime);
              }}
            />
          )}

          {/* UI de motivo se queda, pero NO se valida ni se manda */}
          <Text style={[styles.line, { marginTop: 10 }]}>
            <Text style={styles.b}>Motivo:</Text>
          </Text>
          <TextInput
            value={motivoReprog}
            onChangeText={setMotivoReprog}
            placeholder="(Opcional)"
            placeholderTextColor="#8A96A3"
            style={[styles.textArea, !statusEnviado && { opacity: 0.75 }]}
            editable={statusEnviado && !savingReprog}
            multiline
          />

          <Pressable
            onPress={guardarReprogramacion}
            disabled={!statusEnviado || savingReprog}
            style={({ pressed }) => [
              styles.btn,
              (!statusEnviado || savingReprog) && { opacity: 0.6 },
              pressed && statusEnviado && { transform: [{ scale: 0.99 }], opacity: 0.95 },
            ]}
          >
            {savingReprog ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="repeat-outline" size={18} color="#FFF" />
                <Text style={styles.btnText}>Guardar reprogramación</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* ===== MODAL STATUS OPTIONS ===== */}
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecciona motivo (0001–0011)</Text>
              <Pressable onPress={() => setModal(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.title} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={COLORS.text} style={{ marginRight: 6 }} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Buscar por código o texto…"
                placeholderTextColor="#8A96A3"
                style={{ flex: 1, color: COLORS.title }}
              />
            </View>

            {loadingStatus ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={{ marginTop: 8, color: COLORS.text }}>Cargando…</Text>
              </View>
            ) : (
              <FlatList
                data={filteredOptions}
                keyExtractor={(it) => `${it.code}-${it.estat}`}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const active = String(selectedStatus?.code) === String(item.code);
                  return (
                    <Pressable
                      onPress={() => setSelectedStatus(item)}
                      style={[styles.option, active && styles.optionActive]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "900", color: COLORS.title }}>
                          {item.code} · {item.text}
                        </Text>
                        <Text style={{ marginTop: 2, color: COLORS.text, fontSize: 11 }}>
                          Stsma: {item.stsma} · Estat: {item.estat}
                        </Text>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={18} color="#9AA5B1" />
                      )}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ color: COLORS.text, textAlign: "center", marginTop: 10 }}>
                    No hay resultados (0001–0011).
                  </Text>
                }
              />
            )}

            <View style={styles.modalFooter}>
              <Pressable style={styles.btnGhost} onPress={() => setModal(false)} disabled={savingStatus}>
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[styles.btnSave, (!selectedStatus || savingStatus) && { opacity: 0.6 }]}
                disabled={!selectedStatus || savingStatus}
                onPress={guardarStatus}
              >
                {savingStatus ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.btnSaveText}>Guardar</Text>
                )}
              </Pressable>
            </View>

            <Text style={{ marginTop: 10, color: COLORS.text, fontSize: 11.5 }}>
              *Se listan únicamente códigos 0001–0011 desde StatusWorkOrderSet (Stsma='CS000001').
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  backRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backText: { color: COLORS.accent, fontWeight: "900" },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardDisabled: {
    opacity: 0.88,
  },

  h: { fontSize: 15, fontWeight: "900", color: COLORS.title },
  line: { color: COLORS.text, marginTop: 6, fontSize: 13 },
  b: { color: COLORS.title, fontWeight: "900" },

  btn: {
    marginTop: 12,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnText: { color: "#FFF", fontWeight: "900" },

  btnOutline: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F2F8FF",
  },
  btnOutlineDisabled: {
    borderColor: COLORS.border,
    backgroundColor: "#F6F7F9",
  },
  btnOutlineText: { color: COLORS.accent, fontWeight: "900" },

  textArea: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
    color: COLORS.title,
    backgroundColor: "#FFF",
    textAlignVertical: "top",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 15, fontWeight: "900", color: COLORS.title },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  optionActive: { borderColor: COLORS.accent, backgroundColor: "#F2F8FF" },

  modalFooter: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGhostText: { color: COLORS.title, fontWeight: "900" },
  btnSave: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    minWidth: 110,
    alignItems: "center",
  },
  btnSaveText: { color: "#FFF", fontWeight: "900" },
});
