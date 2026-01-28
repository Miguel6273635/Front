// app/supervisor/no_mantenimiento/detalles.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
import Signature from "react-native-signature-canvas";

import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";

import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import { useAuth } from "../../../src/context/AuthContext";

// ✅ tu template ya está en src/services
import { buildCartaNoMantenimientoHtml } from "../../../src/services/templates/noMantenimientoPdfTemplate";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  disabled: "#B7C2CF",
};

const safeStr = (v) => (v == null ? "" : String(v));
const pad2 = (n) => String(n).padStart(2, "0");

const parseSapDate = (v) => {
  if (!v) return null;
  const m = String(v).match(/\/Date\((\-?\d+)\)\//);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
};

const formatDateOnly = (d) => {
  if (!(d instanceof Date)) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
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

// ====== ODATA PATHS ======
const WORKORDER_DETAIL_PATH = "/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet";
const STATUS_CATALOGO_PATH = "/api/odata/ZSD_CATALOGOS_SRV/StatusWorkOrderSet";
const CHANGE_STATUS_PATH = "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet";
const RESCHEDULE_PATH = "/api/odata/ZCS_RESCHEDULE_WORKORDER_SRV/WorkOrderHeaderSet";

/* ===================== HELPERS SAP RETURNS (para evitar falso error) ===================== */
const pickSapReturns = (sapData) => {
  const arr =
    sapData?.ReturnSet?.results ||
    sapData?.Return?.results ||
    sapData?.ReturnSet ||
    sapData?.Return ||
    [];
  return Array.isArray(arr) ? arr : [];
};

const normalizeSapMsg = (r) => {
  const type = String(r?.Type || r?.type || "").toUpperCase();
  const msg =
    String(r?.Message || r?.message || r?.Text || r?.text || "").trim() ||
    JSON.stringify(r);
  return { type, msg };
};

const summarizeSapMessages = (returns) => {
  const msgs = (Array.isArray(returns) ? returns : []).map(normalizeSapMsg);
  const errors = msgs.filter((m) => m.type === "E" || m.type === "A");
  const warns = msgs.filter((m) => m.type === "W");
  const success = msgs.filter((m) => m.type === "S");
  const info = msgs.filter((m) => m.type === "I");
  return { msgs, errors, warns, success, info };
};

// Regla práctica: si hay S, no tratamos E como fatal (en estos servicios suele venir un E “no fatal”)
const isFatalSapReturn = (returns) => {
  const { errors, success } = summarizeSapMessages(returns);
  return errors.length > 0 && success.length === 0;
};

const formatSapMessages = (returns, max = 4) => {
  const { msgs } = summarizeSapMessages(returns);
  return msgs
    .slice(0, max)
    .map((m) => `• [${m.type}] ${m.msg}`)
    .join("\n");
};

export default function DetallesNoMantenimiento() {
  const params = useLocalSearchParams();
  const id = safeStr(params?.id).trim(); // OrderId

  const { user } = useAuth();
  const correo = useMemo(() => {
    return safeStr(user?.email || user?.correo || user?.upn || user?.username).trim();
  }, [user]);

  const nombreUsuario = useMemo(() => {
    return safeStr(user?.nombre || user?.name || correo).trim();
  }, [user, correo]);

  const signatureRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [wo, setWo] = useState(null);

  // catálogo status (0001..0011)
  const [modal, setModal] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const [statusOptions, setStatusOptions] = useState([]);
  const [q, setQ] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [statusEnviado, setStatusEnviado] = useState(false);

  // ✅ descripción concreta + mes afecto
  const [descripcionConcreta, setDescripcionConcreta] = useState("");
  const [mesAfecto, setMesAfecto] = useState("");

  // ✅ firma supervisor
  const [firmaModal, setFirmaModal] = useState(false);
  const [firmaBase64Png, setFirmaBase64Png] = useState("");
  const [firmaDibujada, setFirmaDibujada] = useState(false);

  // ✅ para evitar lag: bloquear scroll mientras firma
  const [isSigning, setIsSigning] = useState(false);

  // flags UI
  const [sendingPdf, setSendingPdf] = useState(false);

  // reprogramación
  const [savingReprog, setSavingReprog] = useState(false);
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

  // ========= DETALLE =========
  const fetchDetalle = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);

      const url = `${WORKORDER_DETAIL_PATH}('${encodeURIComponent(id)}')`;
      console.log("[NO_MANTTO DETALLE] ODATA URL =>", `${api.defaults.baseURL}${url}`);

      const { data } = await api.get(url, { params: { $format: "json" } });
      const d = data?.d || null;
      setWo(d);

      // Autollenar mes afecto con StartDate
      const sd = parseSapDate(d?.StartDate);
      if (sd && !mesAfecto) {
        const months = [
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
        setMesAfecto(months[sd.getMonth()]);
      }
    } catch (e) {
      console.error("Error detalle (WORKORDER ODATA):", e?.response?.data || e?.message);
      setWo(null);
      Alert.alert("Error", "No se pudo cargar el detalle (WorkOrderHeaderSet).");
    } finally {
      setLoading(false);
    }
  }, [id, mesAfecto]);

  // ========= CATÁLOGO STATUS =========
  const fetchStatusOptions = useCallback(async () => {
    try {
      setLoadingStatus(true);

      const { data } = await api.get(STATUS_CATALOGO_PATH, {
        params: { $filter: "Stsma eq 'CS000001'", $format: "json" },
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

  // UI helpers
  const filteredOptions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return statusOptions;
    return statusOptions.filter((o) => `${o.code} ${o.text}`.toLowerCase().includes(s));
  }, [q, statusOptions]);

  const openModal = async () => {
    setQ("");
    setModal(true);
    await fetchStatusOptions();
  };

  // ========= Generar + enviar PDF =========
  const generarYEnviarPdf = useCallback(async () => {
    if (!wo) return Alert.alert("Sin datos", "No hay datos de la orden.");
    if (!id) return Alert.alert("Sin orden", "Falta OrderId.");
    if (!selectedStatus?.code) return Alert.alert("Falta causa", "Selecciona una causa (0001–0011).");
    if (!firmaBase64Png) return Alert.alert("Falta firma", "Primero presiona “Guardar firma”.");
    if (!String(descripcionConcreta || "").trim()) {
      return Alert.alert("Falta descripción", "Describe la causa (texto obligatorio).");
    }

    try {
      setSendingPdf(true);

      const startDate = parseSapDate(wo?.StartDate);
      const finishDate = parseSapDate(wo?.FinishDate);

      const mx = safeStr(wo?.DocNumber || wo?.SalesOrd || wo?.SalesOrder || wo?.DocNum || "").trim();
      const equipo = safeStr(wo?.Equipment || "").trim();
      const fechaProgramada =
        startDate ? formatDateOnly(startDate) : finishDate ? formatDateOnly(finishDate) : "—";

      // Si tu wo NO trae razón social/dirección, luego lo conectamos a ToAddresses como TBMKY
      const razonSocial = safeStr(wo?.PartnerName || wo?.Name1 || wo?.RazonSocial || "").trim();
      const direccion = safeStr(wo?.PartnerAddress || wo?.Stras || wo?.Ort01 || wo?.Direccion || "").trim();

      const mecanico = safeStr(wo?.Technician || wo?.Mecanico || nombreUsuario).trim();
      const causaCode = String(selectedStatus.code).padStart(4, "0");

      const html = buildCartaNoMantenimientoHtml({
        orderId: id,
        causaCode,
        razonSocial: razonSocial || "—",
        direccion: direccion || "—",
        equipo: equipo || "—",
        fechaProgramada: fechaProgramada || "—",
        mx: mx || "—",
        mesAfecto: mesAfecto || "—",
        mecanico: mecanico || "—",
        descripcionConcreta: descripcionConcreta || "",
        firmaSupervisorBase64Png: firmaBase64Png,
      });

      // 1) HTML -> PDF
      const file = await Print.printToFileAsync({ html, base64: false });

      // 2) PDF -> base64
      const pdfBase64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!pdfBase64 || pdfBase64.length < 200) {
        throw new Error("No se pudo leer el PDF en base64.");
      }

      // 3) Enviar a SAP
      const fileName = `carta_no_mantenimiento_${id}.pdf`;

      const payload = {
        WorkOrderHeader: { Orderid: String(id) },
        Attachments: [
          {
            DocId: String(id),
            FileName: fileName,
            MimeType: "application/pdf", // ✅ FIX
            Base64: String(pdfBase64 || ""), // sin trim agresivo
          },
        ],
        Return: [],
      };

      console.log(
        "[NO_MANTTO][PDF] payload (sin base64):",
        JSON.stringify(
          {
            ...payload,
            Attachments: [{ ...payload.Attachments[0], Base64: `<<base64 ${pdfBase64.length}>>` }],
          },
          null,
          2
        )
      );

      const resp = await api.post(CHANGE_STATUS_PATH, payload);
      const sapData = resp?.data?.d || resp?.data;
      const returns = pickSapReturns(sapData);

      console.log("[NO_MANTTO][PDF] SAP returns:", JSON.stringify(returns, null, 2));

      if (isFatalSapReturn(returns)) {
        throw new Error(formatSapMessages(returns) || "SAP regresó error al adjuntar el PDF.");
      }

      const msg = formatSapMessages(returns, 4);
      Alert.alert("Listo", msg ? `PDF adjuntado.\n\n${msg}` : "PDF generado y adjuntado a SAP.");
      setFirmaModal(false);
    } catch (e) {
      console.error("[NO_MANTTO][PDF] ERROR:", e?.response?.data || e?.message);
      const serverMsg = e?.response?.data?.error?.message?.value || e?.response?.data?.error || "";
      Alert.alert("Error", serverMsg || e?.message || "No se pudo generar/enviar el PDF.");
    } finally {
      setSendingPdf(false);
    }
  }, [wo, id, selectedStatus, firmaBase64Png, descripcionConcreta, mesAfecto, nombreUsuario]);

  // ========= GUARDAR STATUS =========
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

      console.log("[NO_MANTTO][GUARDAR STATUS] payload:", JSON.stringify(changePayload, null, 2));
      const resp = await api.post(CHANGE_STATUS_PATH, changePayload);

      const sapData = resp?.data?.d || resp?.data;
      const returns = pickSapReturns(sapData);

      console.log("[NO_MANTTO][GUARDAR STATUS] SAP returns:", JSON.stringify(returns, null, 2));

      if (isFatalSapReturn(returns)) {
        throw new Error(formatSapMessages(returns) || "SAP regresó error al guardar status.");
      }

      setModal(false);
      setStatusEnviado(true);

      // abrir modal firma + limpiar campos
      setDescripcionConcreta("");
      setFirmaBase64Png("");
      setFirmaDibujada(false);

      try {
        signatureRef.current?.clearSignature?.();
      } catch {}

      setFirmaModal(true);
    } catch (e) {
      console.error("[NO_MANTTO][GUARDAR STATUS] ERROR:", e?.response?.data || e?.message);
      const serverMsg = e?.response?.data?.error?.message?.value || e?.response?.data?.error || "";
      Alert.alert("Error", serverMsg || e?.message || "No se pudo guardar el status.");
    } finally {
      setSavingStatus(false);
    }
  };

  // ========= REPROGRAMACIÓN =========
  const guardarReprogramacion = async () => {
    if (!statusEnviado) {
      Alert.alert("Aún no", "Primero selecciona y guarda un status (0001–0011).");
      return;
    }
    if (!correo) {
      Alert.alert("Sin correo", "No se detectó el correo del usuario loggeado.");
      return;
    }

    try {
      setSavingReprog(true);

      const FechaIni = toYYYYMMDD(fechaHora);
      const FechaFin = toYYYYMMDD(fechaHora);

      // 1) RESCHEDULE
      const payloadReschedule = {
        WorkOrderHeader: { Supervisor: correo },
        WorkOrderItemsSet: [{ OrderId: String(id), OrderItem: "", FechaIni, FechaFin }],
        ReturnSet: [],
      };

      console.log("[NO_MANTTO][REPROGRAMAR] payload RESCHEDULE:", JSON.stringify(payloadReschedule, null, 2));
      const respReschedule = await api.post(RESCHEDULE_PATH, payloadReschedule);

      {
        const sapData = respReschedule?.data?.d || respReschedule?.data;
        const returns = pickSapReturns(sapData);

        console.log("[NO_MANTTO][REPROGRAMAR] RESCHEDULE returns:", JSON.stringify(returns, null, 2));

        if (isFatalSapReturn(returns)) {
          throw new Error(formatSapMessages(returns) || "SAP regresó error al reprogramar (RESCHEDULE).");
        }
      }

      // 2) CHANGE WORKORDER
      const payloadChange = {
        OrderId: String(id),
        WorkOrderHeader: { Orderid: String(id) },
        WorkOrderUserStatusSet: [
          { UserStText: "0012", Langu: "ES", Inactive: "" },
          { UserStText: "0011", Langu: "ES", Inactive: "X" },
        ],
        Return: [],
      };

      console.log("[NO_MANTTO][REPROGRAMAR] payload CHANGE:", JSON.stringify(payloadChange, null, 2));
      const respChange = await api.post(CHANGE_STATUS_PATH, payloadChange);

      {
        const sapData = respChange?.data?.d || respChange?.data;
        const returns = pickSapReturns(sapData);

        console.log("[NO_MANTTO][REPROGRAMAR] CHANGE returns:", JSON.stringify(returns, null, 2));

        if (isFatalSapReturn(returns)) {
          throw new Error(formatSapMessages(returns) || "SAP regresó error al actualizar códigos (CHANGE_WORKORDER).");
        }
      }

      Alert.alert("Listo", "Reprogramación enviada (fechas + código 0012 y baja de 0011).");
      router.replace({ pathname: "/supervisor/no_mantenimiento", params: { refresh: String(Date.now()) } });
    } catch (e) {
      console.error("[NO_MANTTO][REPROGRAMAR] ERROR:", e?.response?.data || e?.message);
      const serverMsg = e?.response?.data?.error?.message?.value || e?.response?.data?.error || "";
      Alert.alert("Error", serverMsg || e?.message || "No se pudo guardar la reprogramación.");
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
            {id || "—"}
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

          <Text style={[styles.line, { fontSize: 12, marginTop: 8 }]}>
            <Text style={styles.b}>Usuario loggeado: </Text>
            {correo || "—"}
          </Text>
        </View>

        {/* ===== SELECCIÓN STATUS ===== */}
        <View style={styles.card}>
          <Text style={styles.h}>Motivo No mantenimiento (0001–0011)</Text>
          <Text style={[styles.line, { marginTop: 8 }]}>
            Selecciona un motivo y guárdalo. Luego firma y genera el PDF para adjuntar a SAP.
          </Text>

          <Pressable
            onPress={openModal}
            style={({ pressed }) => [styles.btn, pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 }]}
          >
            <Ionicons name="list-outline" size={18} color="#FFF" />
            <Text style={styles.btnText}>Elegir motivo</Text>
          </Pressable>

          <Text style={[styles.line, { marginTop: 10 }]}>
            <Text style={styles.b}>Seleccionado: </Text>
            {statusEnviado
              ? `${selectedStatus?.code || "—"} · ${selectedStatus?.text || ""}`
              : selectedStatus
              ? `${selectedStatus.code} · ${selectedStatus.text}`
              : "—"}
          </Text>
        </View>

        {/* ===== REPROGRAMACIÓN ===== */}
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
              <Ionicons name="calendar-outline" size={18} color={!statusEnviado ? COLORS.disabled : COLORS.accent} />
              <Text style={[styles.btnOutlineText, !statusEnviado && { color: COLORS.disabled }]}>Fecha</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowTimePicker(true)}
              style={[styles.btnOutline, { flex: 1 }, !statusEnviado && styles.btnOutlineDisabled]}
              disabled={!statusEnviado || savingReprog}
            >
              <Ionicons name="time-outline" size={18} color={!statusEnviado ? COLORS.disabled : COLORS.accent} />
              <Text style={[styles.btnOutlineText, !statusEnviado && { color: COLORS.disabled }]}>Hora</Text>
            </Pressable>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={fecha}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(event, selectedDate) => {
                if (Platform.OS !== "ios") setShowDatePicker(false);
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
                if (Platform.OS !== "ios") setShowTimePicker(false);
                if (selectedTime) setHora(selectedTime);
              }}
            />
          )}

          <Text style={[styles.line, { marginTop: 10 }]}>
            <Text style={styles.b}>Motivo:</Text>
          </Text>
          <TextInput
            value={motivoReprog}
            onChangeText={setMotivoReprog}
            placeholder="(Opcional)"
            placeholderTextColor="#8A96A3"
            style={[styles.textArea, { marginTop: 8, minHeight: 90 }, !statusEnviado && { opacity: 0.75 }]}
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

      {/* ===== MODAL STATUS ===== */}
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
                    <Pressable onPress={() => setSelectedStatus(item)} style={[styles.option, active && styles.optionActive]}>
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

            <Text style={{ marginTop: 10, color: COLORS.text, fontSize: 11.5 }}>*Solo códigos 0001–0011.</Text>
          </View>
        </View>
      </Modal>

      {/* ===== MODAL FIRMA ===== */}
      <Modal
        visible={firmaModal}
        transparent
        animationType="fade"
        onRequestClose={() => (sendingPdf ? null : setFirmaModal(false))}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: "90%" }]}>
            <ScrollView
              scrollEnabled={!isSigning}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Firma supervisor + descripción</Text>
                <Pressable onPress={() => (sendingPdf ? null : setFirmaModal(false))} hitSlop={10}>
                  <Ionicons name="close" size={22} color={sendingPdf ? "#AAA" : COLORS.title} />
                </Pressable>
              </View>

              <Text style={{ color: COLORS.text, fontSize: 12 }}>
                1) Firma dentro del recuadro{"\n"}
                2) Presiona <Text style={{ fontWeight: "900" }}>Guardar firma</Text>{"\n"}
                3) Luego “Generar PDF y enviar”.
              </Text>

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>Causa seleccionada:</Text>{" "}
                {selectedStatus?.code || "—"} · {selectedStatus?.text || ""}
              </Text>

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>Mes afecto:</Text>
              </Text>
              <TextInput
                value={mesAfecto}
                onChangeText={setMesAfecto}
                placeholder="Ej: Marzo"
                placeholderTextColor="#8A96A3"
                style={[styles.input, { marginTop: 6 }]}
                editable={!sendingPdf}
              />

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>Descripción concreta (obligatoria):</Text>
              </Text>
              <TextInput
                value={descripcionConcreta}
                onChangeText={setDescripcionConcreta}
                placeholder="Describe la causa…"
                placeholderTextColor="#8A96A3"
                style={[styles.textArea, { marginTop: 6, minHeight: 90 }]}
                editable={!sendingPdf}
                multiline
              />

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>Firma (supervisor):</Text>
              </Text>

              <View
                style={{
                  height: 220,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  overflow: "hidden",
                  marginTop: 8,
                  backgroundColor: "#FFF",
                }}
              >
                <Signature
                  ref={signatureRef}
                  onBegin={() => {
                    setIsSigning(true);
                    setFirmaDibujada(true);
                  }}
                  onEnd={() => {
                    setIsSigning(false);
                    setFirmaDibujada(true);
                  }}
                  onOK={(sig) => {
                    const s = String(sig || "");
                    const pure = s.includes("base64,") ? s.split("base64,")[1] : s;
                    const clean = String(pure || "");
                    setFirmaBase64Png(clean);
                    setFirmaDibujada(!!(clean && clean.length > 50));
                    Alert.alert("Listo", "Firma guardada ✅");
                  }}
                  onEmpty={() => {
                    setFirmaBase64Png("");
                    setFirmaDibujada(false);
                  }}
                  descriptionText=""
                  clearText="Limpiar"
                  confirmText="Guardar"
                  webStyle={`
                    * { -webkit-user-select:none; -webkit-touch-callout:none; }
                    html, body { height:100%; width:100%; margin:0; padding:0; background:#fff; overflow:hidden; }
                    .m-signature-pad { box-shadow:none; border:none; height:100%; width:100%; }
                    .m-signature-pad--body { border:none; height:100%; }
                    canvas { width:100% !important; height:100% !important; touch-action:none; }
                    .m-signature-pad--footer { display:none !important; }
                  `}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <Pressable
                  style={[styles.btnGhost, { flex: 1 }]}
                  disabled={sendingPdf}
                  onPress={() => {
                    try {
                      signatureRef.current?.clearSignature?.();
                    } catch {}
                    setFirmaBase64Png("");
                    setFirmaDibujada(false);
                  }}
                >
                  <Text style={styles.btnGhostText}>Limpiar</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.btnSave,
                    { flex: 1, minWidth: 0 },
                    (!firmaDibujada || sendingPdf) && { opacity: 0.6 },
                  ]}
                  disabled={!firmaDibujada || sendingPdf}
                  onPress={() => {
                    try {
                      signatureRef.current?.readSignature?.();
                    } catch {
                      Alert.alert("No disponible", "Tu firma no soporta readSignature().");
                    }
                  }}
                >
                  <Text style={styles.btnSaveText}>Guardar firma</Text>
                </Pressable>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.btnGhost, sendingPdf && { opacity: 0.6 }]}
                  onPress={() => setFirmaModal(false)}
                  disabled={sendingPdf}
                >
                  <Text style={styles.btnGhostText}>Cancelar</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.btnSave,
                    (sendingPdf || !String(descripcionConcreta || "").trim() || !firmaBase64Png) && { opacity: 0.6 },
                  ]}
                  disabled={sendingPdf || !String(descripcionConcreta || "").trim() || !firmaBase64Png}
                  onPress={generarYEnviarPdf}
                >
                  {sendingPdf ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.btnSaveText}>Generar PDF y enviar</Text>
                  )}
                </Pressable>
              </View>

              <Text style={{ marginTop: 8, color: COLORS.text, fontSize: 11.5 }}>
                *La firma se guarda con el botón “Guardar firma” (nativo).
              </Text>
            </ScrollView>
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
  cardDisabled: { opacity: 0.88 },

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
  btnOutlineDisabled: { borderColor: COLORS.border, backgroundColor: "#F6F7F9" },
  btnOutlineText: { color: COLORS.accent, fontWeight: "900" },

  textArea: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.title,
    backgroundColor: "#FFF",
    textAlignVertical: "top",
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.title,
    backgroundColor: "#FFF",
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
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { color: COLORS.title, fontWeight: "900" },
  btnSave: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSaveText: { color: "#FFF", fontWeight: "900" },
});
