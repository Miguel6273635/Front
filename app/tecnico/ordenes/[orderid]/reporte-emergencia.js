// app/tecnico/ordenes/[orderid]/reporte-emergencia.js
// Reporte de emergencia — diseño moderno tipo wizard
// Sin validaciones bloqueantes para poder visualizar PDF aunque falten datos.

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import Header from "../../../../src/components/Header";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildReporteEmergenciaHtml } from "../../../../src/services/templates/reporte_emergencia/buildReporteEmergenciaHtml";

const UI = {
  bg: "#EEF3F8",
  card: "#FFFFFF",
  cardSoft: "#F8FAFC",
  border: "#DDE6F0",
  borderDark: "#CBD5E1",
  text: "#0F172A",
  muted: "#64748B",
  muted2: "#94A3B8",
  blue: "#0B2E6D",
  blue2: "#2563EB",
  blueSoft: "#EAF1FF",
  green: "#16A34A",
  greenSoft: "#DCFCE7",
  yellow: "#F59E0B",
  yellowSoft: "#FEF3C7",
  red: "#DC2626",
  redSoft: "#FEE2E2",
};

const STEPS = [
  { key: "general", title: "General", short: "Cliente" },
  { key: "tiempos", title: "Tiempos", short: "Horarios" },
  { key: "servicio", title: "Servicio", short: "Reporte" },
  { key: "refacciones", title: "Refacciones", short: "Piezas" },
  { key: "cliente", title: "Cliente", short: "Firma" },
];

const pad2 = (n) => String(n).padStart(2, "0");

const formatDateDMY = (d) =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

const formatTimeHM = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const safeStr = (v) => String(v ?? "").trim();

const newMecanico = (nombre = "", principal = false) => ({
  nombre,
  principal,
});

const newRefaccion = () => ({
  cantidad: "",
  descripcion: "",
  cargoCliente: "No",
  codigoInterno: "",
});

function getUserName(user) {
  return safeStr(
    user?.nombre ||
      user?.name ||
      user?.fullName ||
      user?.displayName ||
      user?.username ||
      user?.correo ||
      user?.email ||
      ""
  );
}

const Label = ({ children, style }) => (
  <Text style={[styles.label, style]}>{children}</Text>
);

const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  editable = true,
  keyboardType = "default",
  icon,
}) => (
  <View style={styles.inputBlock}>
    <Label>{label}</Label>

    <View
      style={[
        styles.inputWrap,
        multiline && styles.inputWrapMultiline,
        !editable && styles.readonly,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={17}
          color={UI.muted}
          style={{ marginTop: multiline ? 12 : 0 }}
        />
      ) : null}

      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={String(value ?? "")}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={UI.muted2}
        multiline={multiline}
        editable={editable}
        keyboardType={keyboardType}
      />
    </View>
  </View>
);

const Chip = ({ active, children, onPress, tone = "blue" }) => {
  const activeStyle =
    tone === "green"
      ? styles.chipGreen
      : tone === "yellow"
      ? styles.chipYellow
      : tone === "red"
      ? styles.chipRed
      : styles.chipBlue;

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={[styles.chip, active && activeStyle]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
};

function ChipsYesNo({ label, value, onChange }) {
  return (
    <View style={styles.inputBlock}>
      <Label>{label}</Label>

      <View style={styles.chipsWrap}>
        {["Sí", "No"].map((opt) => (
          <Chip
            key={opt}
            active={value === opt}
            tone={opt === "Sí" ? "green" : "blue"}
            onPress={() => onChange(opt)}
          >
            {opt}
          </Chip>
        ))}
      </View>
    </View>
  );
}

function PickerButton({
  label,
  value,
  placeholder,
  onPress,
  icon = "time-outline",
}) {
  return (
    <View style={styles.inputBlock}>
      <Label>{label}</Label>

      <TouchableOpacity
        onPress={onPress}
        style={styles.pickerBox}
        activeOpacity={0.9}
      >
        <View style={styles.pickerLeft}>
          <Ionicons name={icon} size={17} color={UI.blue} />
          <Text style={[styles.pickerText, !value && { color: UI.muted2 }]}>
            {value || placeholder}
          </Text>
        </View>

        <Ionicons name="chevron-down-outline" size={18} color={UI.muted} />
      </TouchableOpacity>
    </View>
  );
}

function SectionBox({ title, subtitle, icon, children }) {
  return (
    <View style={styles.sectionBox}>
      <View style={styles.sectionTop}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon || "document-text-outline"} size={18} color={UI.blue} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
      </View>

      {children}
    </View>
  );
}

function InfoItem({ label, value }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value || "—"}
      </Text>
    </View>
  );
}

function StatBox({ label, value, tone = "blue" }) {
  const toneStyle =
    tone === "green"
      ? styles.statGreen
      : tone === "yellow"
      ? styles.statYellow
      : tone === "red"
      ? styles.statRed
      : styles.statBlue;

  return (
    <View style={[styles.statBox, toneStyle]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FieldRow({ children }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

function Field({ children, small = false, wide = false }) {
  return (
    <View style={[styles.field, small && styles.fieldSmall, wide && styles.fieldWide]}>
      {children}
    </View>
  );
}

export default function ReporteEmergenciaForm() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();

  const tecnicoPrincipal = getUserName(user);
  const safeOrderId = safeStr(orderid || "SIN_ORDEN");

  const draftKey = useMemo(
    () => `reporte_emergencia:${safeOrderId || "local"}`,
    [safeOrderId]
  );

  const [activeStep, setActiveStep] = useState(0);

  const [fecha, setFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [mx, setMx] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [direccion, setDireccion] = useState("");

  const [horaEntrada, setHoraEntrada] = useState("");
  const [horaSalida, setHoraSalida] = useState("");
  const [horaLlamada, setHoraLlamada] = useState("");

  const [showEntradaPicker, setShowEntradaPicker] = useState(false);
  const [showSalidaPicker, setShowSalidaPicker] = useState(false);
  const [showLlamadaPicker, setShowLlamadaPicker] = useState(false);

  const [mecanicos, setMecanicos] = useState([
    newMecanico(tecnicoPrincipal, true),
  ]);

  const [supervisor, setSupervisor] = useState("");
  const [ct, setCt] = useState("");

  const [reporte, setReporte] = useState("");
  const [estadoEquipo, setEstadoEquipo] = useState("");
  const [analisisFalla, setAnalisisFalla] = useState("");
  const [formasCorreccion, setFormasCorreccion] = useState("");
  const [notas, setNotas] = useState("");

  const [refacciones, setRefacciones] = useState([
    newRefaccion(),
    newRefaccion(),
  ]);

  const [entregoRefUsadas, setEntregoRefUsadas] = useState("No");
  const [firmaCliente, setFirmaCliente] = useState("");
  const [nombreCliente, setNombreCliente] = useState("");
  const [puestoCliente, setPuestoCliente] = useState("");

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (!tecnicoPrincipal) return;

    setMecanicos((prev) => {
      const arr = Array.isArray(prev) && prev.length ? prev : [];
      if (!arr.length) return [newMecanico(tecnicoPrincipal, true)];

      const first = arr[0] || {};
      if (first.principal && first.nombre) return arr;

      return [
        {
          ...first,
          nombre: first.nombre || tecnicoPrincipal,
          principal: true,
        },
        ...arr.slice(1),
      ];
    });
  }, [tecnicoPrincipal]);

  const buildPayload = useCallback(() => {
    const mecLimpios = mecanicos
      .map((m, idx) => ({
        nombre: safeStr(m?.nombre),
        principal: idx === 0 || !!m?.principal,
      }))
      .filter((m, idx) => m.nombre || idx === 0);

    return {
      orderid: safeOrderId || "SIN_ORDEN",
      numeroReporte: safeOrderId || "SIN_ORDEN",
      fechaIso: fecha?.toISOString?.() || new Date().toISOString(),
      fechaDMY: fecha ? formatDateDMY(fecha) : "",
      mx: safeStr(mx),
      razonSocial: safeStr(razonSocial),
      direccion: safeStr(direccion),
      horaEntrada: safeStr(horaEntrada),
      horaSalida: safeStr(horaSalida),
      horaLlamada: safeStr(horaLlamada),
      mecanicos: mecLimpios.length
        ? mecLimpios
        : [newMecanico(tecnicoPrincipal || "", true)],
      supervisor: safeStr(supervisor),
      ct: safeStr(ct),
      reporte: safeStr(reporte),
      estadoEquipo: safeStr(estadoEquipo),
      analisisFalla: safeStr(analisisFalla),
      formasCorreccion: safeStr(formasCorreccion),
      notas: safeStr(notas),
      refacciones: refacciones.map((r) => ({
        cantidad: safeStr(r.cantidad),
        descripcion: safeStr(r.descripcion),
        cargoCliente: r.cargoCliente || "No",
        codigoInterno: safeStr(r.codigoInterno),
      })),
      entregoRefUsadas: entregoRefUsadas || "No",
      firmaCliente: safeStr(firmaCliente),
      nombreCliente: safeStr(nombreCliente),
      puestoCliente: safeStr(puestoCliente),
    };
  }, [
    safeOrderId,
    fecha,
    mx,
    razonSocial,
    direccion,
    horaEntrada,
    horaSalida,
    horaLlamada,
    mecanicos,
    supervisor,
    ct,
    reporte,
    estadoEquipo,
    analisisFalla,
    formasCorreccion,
    notas,
    refacciones,
    entregoRefUsadas,
    firmaCliente,
    nombreCliente,
    puestoCliente,
    tecnicoPrincipal,
  ]);

  const loadDraft = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(draftKey);
      if (!s) return;

      const d = JSON.parse(s);

      if (d.fechaIso || d.fecha) {
        const nextDate = new Date(d.fechaIso || d.fecha);
        if (!Number.isNaN(nextDate.getTime())) setFecha(nextDate);
      }

      setMx(d.mx ?? "");
      setRazonSocial(d.razonSocial ?? "");
      setDireccion(d.direccion ?? "");

      setHoraEntrada(d.horaEntrada ?? "");
      setHoraSalida(d.horaSalida ?? "");
      setHoraLlamada(d.horaLlamada ?? "");

      const draftMecs =
        Array.isArray(d.mecanicos) && d.mecanicos.length
          ? d.mecanicos
          : [newMecanico(tecnicoPrincipal, true)];

      setMecanicos(
        draftMecs.map((m, idx) => ({
          nombre: safeStr(m?.nombre),
          principal: idx === 0,
        }))
      );

      setSupervisor(d.supervisor ?? "");
      setCt(d.ct ?? "");

      setReporte(d.reporte ?? "");
      setEstadoEquipo(d.estadoEquipo ?? "");
      setAnalisisFalla(d.analisisFalla ?? "");
      setFormasCorreccion(d.formasCorreccion ?? "");
      setNotas(d.notas ?? "");

      setRefacciones(
        Array.isArray(d.refacciones) && d.refacciones.length
          ? d.refacciones
          : [newRefaccion()]
      );

      setEntregoRefUsadas(d.entregoRefUsadas ?? "No");
      setFirmaCliente(d.firmaCliente ?? "");
      setNombreCliente(d.nombreCliente ?? "");
      setPuestoCliente(d.puestoCliente ?? "");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo cargar el borrador.");
    }
  }, [draftKey, tecnicoPrincipal]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const saveDraft = useCallback(async () => {
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(buildPayload()));
      Alert.alert("Borrador guardado", "Se guardó localmente.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo guardar el borrador.");
    }
  }, [draftKey, buildPayload]);

  const addMecanico = () =>
    setMecanicos((prev) => [...prev, newMecanico("", false)]);

  const removeMecanico = (idx) => {
    if (idx === 0) {
      Alert.alert(
        "No disponible",
        "El mecánico principal no se puede eliminar."
      );
      return;
    }

    setMecanicos((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateMecanico = (idx, val) => {
    setMecanicos((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, nombre: val } : m))
    );
  };

  const addRef = () => setRefacciones((prev) => [...prev, newRefaccion()]);

  const removeRef = (idx) =>
    setRefacciones((prev) => {
      if (prev.length <= 1) return [newRefaccion()];
      return prev.filter((_, i) => i !== idx);
    });

  const updateRef = (idx, field, val) =>
    setRefacciones((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r))
    );

  const onChangeDate = (_e, selectedDate) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selectedDate) setFecha(selectedDate);
  };

  const openTime = (which) => {
    if (which === "entrada") setShowEntradaPicker(true);
    if (which === "salida") setShowSalidaPicker(true);
    if (which === "llamada") setShowLlamadaPicker(true);
  };

  const onChangeTime = (setter, setShow) => (_e, selectedDate) => {
    if (Platform.OS === "android") setShow(false);
    if (selectedDate) setter(formatTimeHM(selectedDate));
  };

  const generarPreviewPdf = async () => {
    try {
      setGeneratingPdf(true);
      setPreviewHtml("");
      setPdfUri(null);
      setShowPreview(true);

      const payload = buildPayload();
      const html = buildReporteEmergenciaHtml(payload);

      setPreviewHtml(html);

      const result = await Print.printToFileAsync({
        html,
        base64: false,
      });

      setPdfUri(result.uri);
    } catch (e) {
      console.log("[REPORTE EMERGENCIA PDF] error:", e);
      setShowPreview(false);
      Alert.alert("Error", "No se pudo generar la vista previa del PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const abrirPdf = async () => {
    try {
      let uri = pdfUri;

      if (!uri) {
        setGeneratingPdf(true);
        const payload = buildPayload();
        const html = buildReporteEmergenciaHtml(payload);

        const result = await Print.printToFileAsync({
          html,
          base64: false,
        });

        uri = result.uri;
        setPdfUri(uri);
      }

      const canShare = await Sharing.isAvailableAsync();

      if (!canShare) {
        Alert.alert(
          "No disponible",
          "Este dispositivo no permite abrir/compartir archivos."
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Abrir / compartir reporte de emergencia",
      });
    } catch (e) {
      console.warn("No se pudo abrir PDF:", e?.message || e);
      Alert.alert("Error", "No se pudo abrir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const guardarLocal = async () => {
    const payload = buildPayload();

    console.log("REPORTE_EMERGENCIA_OUTPUT =>", JSON.stringify(payload, null, 2));

    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {}

    Alert.alert(
      "Datos guardados",
      "Se guardó localmente. No se aplicaron validaciones obligatorias."
    );
  };

  const filledCount = useMemo(() => {
    const values = [
      mx,
      razonSocial,
      direccion,
      horaEntrada,
      horaSalida,
      horaLlamada,
      supervisor,
      ct,
      reporte,
      estadoEquipo,
      analisisFalla,
      formasCorreccion,
      notas,
      nombreCliente,
      puestoCliente,
    ];

    return values.filter((v) => !!safeStr(v)).length;
  }, [
    mx,
    razonSocial,
    direccion,
    horaEntrada,
    horaSalida,
    horaLlamada,
    supervisor,
    ct,
    reporte,
    estadoEquipo,
    analisisFalla,
    formasCorreccion,
    notas,
    nombreCliente,
    puestoCliente,
  ]);

  const refCount = useMemo(() => {
    return refacciones.filter(
      (r) => safeStr(r.cantidad) || safeStr(r.descripcion) || safeStr(r.codigoInterno)
    ).length;
  }, [refacciones]);

  const goNext = () => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0));

  const renderProgress = () => (
    <View style={styles.progressCard}>
      <Text style={styles.progressTitle}>Avance del reporte</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stepsScroll}
      >
        {STEPS.map((step, index) => {
          const active = index === activeStep;
          const done = index < activeStep;

          return (
            <TouchableOpacity
              key={step.key}
              activeOpacity={0.86}
              onPress={() => setActiveStep(index)}
              style={[
                styles.stepItem,
                active && styles.stepItemActive,
                done && styles.stepItemDone,
              ]}
            >
              <View
                style={[
                  styles.stepNumber,
                  active && styles.stepNumberActive,
                  done && styles.stepNumberDone,
                ]}
              >
                <Text
                  style={[
                    styles.stepNumberText,
                    (active || done) && styles.stepNumberTextActive,
                  ]}
                >
                  {index + 1}
                </Text>
              </View>

              <View>
                <Text
                  style={[
                    styles.stepName,
                    active && styles.stepNameActive,
                    done && styles.stepNameDone,
                  ]}
                >
                  {step.title}
                </Text>
                <Text style={styles.stepShort}>{step.short}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderGeneral = () => (
    <>
      <SectionBox
        icon="document-text-outline"
        title="Resumen del reporte"
        subtitle="Datos principales del servicio de emergencia."
      >
        <View style={styles.infoGrid}>
          <InfoItem label="Número de reporte" value={safeOrderId || "SIN_ORDEN"} />
          <InfoItem label="Fecha" value={formatDateDMY(fecha)} />
          <InfoItem label="Técnico principal" value={tecnicoPrincipal} />
        </View>
      </SectionBox>

      <SectionBox
        icon="calendar-outline"
        title="Fecha del reporte"
        subtitle="Selecciona la fecha de atención."
      >
        <PickerButton
          label="Fecha"
          value={formatDateDMY(fecha)}
          placeholder="Selecciona fecha"
          icon="calendar-outline"
          onPress={() => setShowDatePicker(true)}
        />

        {showDatePicker && (
          <DateTimePicker
            value={fecha}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeDate}
          />
        )}
      </SectionBox>

      <SectionBox
        icon="business-outline"
        title="Servicio efectuado en"
        subtitle="Datos del cliente, ubicación o equipo."
      >
        <Input
          label="MX"
          value={mx}
          onChangeText={setMx}
          placeholder="MX..."
          icon="barcode-outline"
        />

        <Input
          label="Razón social"
          value={razonSocial}
          onChangeText={setRazonSocial}
          placeholder="Empresa / Cliente"
          icon="business-outline"
        />

        <Input
          label="Dirección"
          value={direccion}
          onChangeText={setDireccion}
          placeholder="Calle, No., Col., Ciudad..."
          icon="location-outline"
        />
      </SectionBox>
    </>
  );

  const renderTiempos = () => (
    <>
      <SectionBox
        icon="time-outline"
        title="Horarios del servicio"
        subtitle="Entrada, salida y hora de llamada."
      >
        <FieldRow>
          <Field>
            <PickerButton
              label="Entrada"
              value={horaEntrada}
              placeholder="HH:MM"
              onPress={() => openTime("entrada")}
            />
          </Field>

          <Field>
            <PickerButton
              label="Salida"
              value={horaSalida}
              placeholder="HH:MM"
              onPress={() => openTime("salida")}
            />
          </Field>

          <Field>
            <PickerButton
              label="Hora de llamada"
              value={horaLlamada}
              placeholder="HH:MM"
              onPress={() => openTime("llamada")}
            />
          </Field>
        </FieldRow>

        {showEntradaPicker && (
          <DateTimePicker
            value={new Date()}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeTime(setHoraEntrada, setShowEntradaPicker)}
          />
        )}

        {showSalidaPicker && (
          <DateTimePicker
            value={new Date()}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeTime(setHoraSalida, setShowSalidaPicker)}
          />
        )}

        {showLlamadaPicker && (
          <DateTimePicker
            value={new Date()}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeTime(setHoraLlamada, setShowLlamadaPicker)}
          />
        )}
      </SectionBox>

      <SectionBox
        icon="people-outline"
        title="Mecánicos"
        subtitle="El primer mecánico se toma automáticamente del usuario."
      >
        {mecanicos.map((m, idx) => {
          const isPrincipal = idx === 0 || !!m.principal;

          return (
            <View key={`mecanico-${idx}`} style={styles.rowCard}>
              <View style={styles.rowHeader}>
                <View>
                  <Text style={styles.rowTitle}>Mecánico {idx + 1}</Text>
                  {isPrincipal ? (
                    <Text style={styles.rowSub}>Principal automático</Text>
                  ) : (
                    <Text style={styles.rowSub}>Apoyo en servicio</Text>
                  )}
                </View>

                {!isPrincipal ? (
                  <TouchableOpacity onPress={() => removeMecanico(idx)}>
                    <Text style={styles.removeTxt}>Eliminar</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <Input
                label="Nombre"
                value={m.nombre}
                onChangeText={(v) => updateMecanico(idx, v)}
                placeholder="Nombre del mecánico"
                editable={!isPrincipal}
                icon="person-outline"
              />
            </View>
          );
        })}

        <TouchableOpacity style={styles.secondary} onPress={addMecanico}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.secondaryText}>Agregar mecánico</Text>
        </TouchableOpacity>
      </SectionBox>

      <SectionBox
        icon="reader-outline"
        title="Datos adicionales"
        subtitle="Supervisor y CT."
      >
        <Input
          label="Supervisor"
          value={supervisor}
          onChangeText={setSupervisor}
          placeholder="Nombre del supervisor"
          icon="person-circle-outline"
        />

        <Input
          label="CT"
          value={ct}
          onChangeText={setCt}
          placeholder="Código / clave"
          icon="keypad-outline"
        />
      </SectionBox>
    </>
  );

  const renderServicio = () => (
    <>
      <SectionBox
        icon="document-text-outline"
        title="Reporte"
        subtitle="Describe el motivo y detalle general del servicio."
      >
        <Input
          label="Detalle del reporte"
          value={reporte}
          onChangeText={setReporte}
          placeholder="Descripción general del reporte..."
          multiline
        />
      </SectionBox>

      <SectionBox
        icon="construct-outline"
        title="Estado de equipo"
        subtitle="Condiciones encontradas al llegar al sitio."
      >
        <Input
          label="Estado"
          value={estadoEquipo}
          onChangeText={setEstadoEquipo}
          placeholder="Operando / detenido / condiciones encontradas..."
          multiline
        />
      </SectionBox>

      <SectionBox
        icon="search-outline"
        title="Análisis de falla"
        subtitle="Diagnóstico o causa raíz identificada."
      >
        <Input
          label="Análisis"
          value={analisisFalla}
          onChangeText={setAnalisisFalla}
          placeholder="Causa raíz o diagnóstico..."
          multiline
        />
      </SectionBox>

      <SectionBox
        icon="hammer-outline"
        title="Formas de corrección"
        subtitle="Acciones realizadas durante el servicio."
      >
        <Input
          label="Corrección"
          value={formasCorreccion}
          onChangeText={setFormasCorreccion}
          placeholder="Acciones realizadas..."
          multiline
        />
      </SectionBox>

      <SectionBox
        icon="clipboard-outline"
        title="Notas"
        subtitle="Observaciones adicionales."
      >
        <Input
          label="Notas"
          value={notas}
          onChangeText={setNotas}
          placeholder="Observaciones adicionales..."
          multiline
        />
      </SectionBox>
    </>
  );

  const renderRefacciones = () => (
    <SectionBox
      icon="cube-outline"
      title="Refacciones utilizadas"
      subtitle="Agrega las piezas utilizadas durante el servicio."
    >
      {refacciones.map((r, idx) => (
        <View key={`refaccion-${idx}`} style={styles.rowCard}>
          <View style={styles.rowHeader}>
            <View>
              <Text style={styles.rowTitle}>Refacción {idx + 1}</Text>
              <Text style={styles.rowSub}>Pieza utilizada o dañada</Text>
            </View>

            <TouchableOpacity onPress={() => removeRef(idx)}>
              <Text style={styles.removeTxt}>Eliminar</Text>
            </TouchableOpacity>
          </View>

          <FieldRow>
            <Field small>
              <Input
                label="Cantidad"
                value={r.cantidad}
                onChangeText={(v) => updateRef(idx, "cantidad", v)}
                placeholder="1"
                keyboardType="numeric"
                icon="calculator-outline"
              />
            </Field>

            <Field>
              <Input
                label="Código interno"
                value={r.codigoInterno}
                onChangeText={(v) => updateRef(idx, "codigoInterno", v)}
                placeholder="200-..."
                icon="pricetag-outline"
              />
            </Field>
          </FieldRow>

          <Input
            label="Descripción"
            value={r.descripcion}
            onChangeText={(v) => updateRef(idx, "descripcion", v)}
            placeholder="Descripción de la refacción"
            icon="cube-outline"
          />

          <ChipsYesNo
            label="¿Con cargo al cliente?"
            value={r.cargoCliente}
            onChange={(opt) => updateRef(idx, "cargoCliente", opt)}
          />
        </View>
      ))}

      <TouchableOpacity style={styles.secondary} onPress={addRef}>
        <Ionicons name="add-circle-outline" size={18} color="#fff" />
        <Text style={styles.secondaryText}>Agregar refacción</Text>
      </TouchableOpacity>
    </SectionBox>
  );

  const renderCliente = () => (
    <>
      <SectionBox
        icon="checkmark-done-outline"
        title="Confirmación del cliente"
        subtitle="Entrega de refacciones y datos de quien recibe."
      >
        <ChipsYesNo
          label="¿Le fueron entregadas las refacciones utilizadas o dañadas?"
          value={entregoRefUsadas}
          onChange={setEntregoRefUsadas}
        />

        <Input
          label="Firma"
          value={firmaCliente}
          onChangeText={setFirmaCliente}
          placeholder="Firma / referencia"
          icon="create-outline"
        />

        <Input
          label="Nombre"
          value={nombreCliente}
          onChangeText={setNombreCliente}
          placeholder="Nombre del cliente"
          icon="person-outline"
        />

        <Input
          label="Puesto"
          value={puestoCliente}
          onChangeText={setPuestoCliente}
          placeholder="Puesto"
          icon="briefcase-outline"
        />
      </SectionBox>

      <SectionBox
        icon="save-outline"
        title="Guardar información"
        subtitle="Puedes guardar localmente sin validar campos obligatorios."
      >
        <TouchableOpacity style={styles.primaryDark} onPress={guardarLocal}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
          <Text style={styles.primaryDarkText}>Guardar local</Text>
        </TouchableOpacity>
      </SectionBox>
    </>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderTiempos();
    if (activeStep === 2) return renderServicio();
    if (activeStep === 3) return renderRefacciones();
    return renderCliente();
  };

  return (
    <View style={styles.container}>
      <Header title="Reporte de emergencia" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="alert-circle-outline" size={25} color="#fff" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>Formato técnico</Text>
              <Text style={styles.heroTitle}>Reporte de emergencia</Text>
              <Text style={styles.heroSub}>
                Captura manual del servicio. Puedes visualizar el PDF aunque
                todavía falten datos.
              </Text>
            </View>

            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>PDF libre</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatBox label="Campos" value={filledCount} />
            <StatBox label="Refacciones" value={refCount} tone="yellow" />
            <StatBox label="Paso" value={`${activeStep + 1}/${STEPS.length}`} tone="green" />
          </View>
        </View>

        {renderProgress()}

        <View style={styles.activeStepHeader}>
          <Text style={styles.activeStepSmall}>
            Paso {activeStep + 1} de {STEPS.length}
          </Text>
          <Text style={styles.activeStepTitle}>{STEPS[activeStep].title}</Text>
        </View>

        {renderStepContent()}

        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, activeStep === 0 && styles.navBtnDisabled]}
            onPress={goBack}
            disabled={activeStep === 0}
            activeOpacity={0.86}
          >
            <Text
              style={[
                styles.navBtnText,
                activeStep === 0 && styles.navBtnTextDisabled,
              ]}
            >
              Anterior
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navBtnPrimary,
              activeStep === STEPS.length - 1 && styles.navBtnDisabled,
            ]}
            onPress={goNext}
            disabled={activeStep === STEPS.length - 1}
            activeOpacity={0.86}
          >
            <Text
              style={[
                styles.navBtnPrimaryText,
                activeStep === STEPS.length - 1 && styles.navBtnTextDisabled,
              ]}
            >
              Siguiente
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.draftBtn}
          onPress={saveDraft}
          activeOpacity={0.9}
        >
          <Ionicons name="save-outline" size={18} color={UI.blue} />
          <Text style={styles.draftBtnText}>Borrador</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.previewBtn}
          onPress={generarPreviewPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="eye-outline" size={18} color="#fff" />
              <Text style={styles.previewBtnText}>Vista previa</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={abrirPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          <Ionicons name="share-social-outline" size={18} color="#fff" />
          <Text style={styles.shareBtnText}>PDF</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showPreview}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalKicker}>Documento</Text>
                <Text style={styles.modalTitle}>Vista previa del reporte</Text>
              </View>

              <TouchableOpacity
                onPress={() => setShowPreview(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.webWrap}>
              {generatingPdf || !previewHtml ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={UI.blue} />
                  <Text style={styles.loadingText}>Generando PDF…</Text>
                </View>
              ) : (
                <WebView
                  originWhitelist={["*"]}
                  source={{ html: previewHtml }}
                  style={styles.webview}
                />
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.footerLight}
                onPress={() => setShowPreview(false)}
              >
                <Text style={styles.footerLightText}>Cerrar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.footerPrimary} onPress={abrirPdf}>
                <Text style={styles.footerPrimaryText}>Abrir / compartir PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const elev = (multiplier = 1) =>
  Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 8 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.bg,
  },

  content: {
    padding: 16,
    paddingBottom: 126,
  },

  hero: {
    backgroundColor: UI.blue,
    borderRadius: 28,
    padding: 18,
    ...elev(0.9),
  },

  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroKicker: {
    color: "#BFDBFE",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 4,
  },

  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
  },

  heroSub: {
    color: "#DBEAFE",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 7,
  },

  heroBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  heroBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },

  statBox: {
    flexGrow: 1,
    minWidth: 82,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: "center",
  },

  statBlue: {
    backgroundColor: "rgba(255,255,255,0.13)",
  },

  statGreen: {
    backgroundColor: "rgba(22,163,74,0.28)",
  },

  statYellow: {
    backgroundColor: "rgba(245,158,11,0.28)",
  },

  statRed: {
    backgroundColor: "rgba(220,38,38,0.26)",
  },

  statValue: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
  },

  statLabel: {
    color: "#DBEAFE",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },

  progressCard: {
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 22,
    padding: 14,
    marginTop: 14,
  },

  progressTitle: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 10,
  },

  stepsScroll: {
    gap: 10,
    paddingRight: 10,
  },

  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minWidth: 130,
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  stepItemActive: {
    backgroundColor: UI.blueSoft,
    borderColor: "#93C5FD",
  },

  stepItemDone: {
    backgroundColor: UI.greenSoft,
    borderColor: "#86EFAC",
  },

  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },

  stepNumberActive: {
    backgroundColor: UI.blue,
  },

  stepNumberDone: {
    backgroundColor: UI.green,
  },

  stepNumberText: {
    color: UI.muted,
    fontSize: 12,
    fontWeight: "900",
  },

  stepNumberTextActive: {
    color: "#FFFFFF",
  },

  stepName: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "900",
  },

  stepNameActive: {
    color: UI.blue,
  },

  stepNameDone: {
    color: UI.green,
  },

  stepShort: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 1,
  },

  activeStepHeader: {
    marginTop: 16,
    marginBottom: 8,
  },

  activeStepSmall: {
    color: UI.blue2,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  activeStepTitle: {
    color: UI.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 2,
  },

  sectionBox: {
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 24,
    padding: 15,
    marginTop: 10,
    ...elev(0.35),
  },

  sectionTop: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 14,
  },

  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: UI.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionTitle: {
    color: UI.text,
    fontSize: 17,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: UI.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  infoItem: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 150,
    backgroundColor: UI.cardSoft,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: UI.border,
  },

  infoLabel: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 5,
  },

  infoValue: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },

  inputBlock: {
    marginBottom: 12,
  },

  label: {
    color: UI.muted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },

  inputWrap: {
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 15,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 45,
  },

  inputWrapMultiline: {
    alignItems: "flex-start",
  },

  input: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    fontSize: 14,
    fontWeight: "800",
    color: UI.text,
  },

  textArea: {
    height: 112,
    textAlignVertical: "top",
  },

  readonly: {
    backgroundColor: "#EEF3F8",
  },

  pickerBox: {
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 15,
    paddingVertical: 13,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 45,
  },

  pickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  pickerText: {
    fontSize: 14,
    fontWeight: "900",
    color: UI.text,
  },

  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 11,
  },

  field: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 170,
  },

  fieldSmall: {
    minWidth: 110,
  },

  fieldWide: {
    minWidth: 230,
  },

  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },

  chip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },

  chipBlue: {
    backgroundColor: UI.blue,
    borderColor: UI.blue,
  },

  chipGreen: {
    backgroundColor: UI.green,
    borderColor: UI.green,
  },

  chipYellow: {
    backgroundColor: UI.yellow,
    borderColor: UI.yellow,
  },

  chipRed: {
    backgroundColor: UI.red,
    borderColor: UI.red,
  },

  chipText: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "900",
  },

  chipTextActive: {
    color: "#FFFFFF",
  },

  rowCard: {
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 20,
    padding: 13,
    marginBottom: 12,
    backgroundColor: UI.cardSoft,
  },

  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  rowTitle: {
    fontWeight: "900",
    color: UI.text,
    fontSize: 14,
  },

  rowSub: {
    marginTop: 2,
    color: UI.muted,
    fontWeight: "800",
    fontSize: 11,
  },

  removeTxt: {
    color: UI.red,
    fontWeight: "900",
    fontSize: 12,
  },

  secondary: {
    backgroundColor: UI.text,
    padding: 14,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  secondaryText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },

  primaryDark: {
    backgroundColor: UI.text,
    padding: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  primaryDarkText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 14,
  },

  navRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },

  navBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.blue,
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 14,
  },

  navBtnPrimary: {
    flex: 1,
    backgroundColor: UI.blue,
    borderWidth: 1,
    borderColor: UI.blue,
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 14,
  },

  navBtnDisabled: {
    opacity: 0.45,
  },

  navBtnText: {
    color: UI.blue,
    fontSize: 14,
    fontWeight: "900",
  },

  navBtnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  navBtnTextDisabled: {
    color: UI.muted,
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 26 : 14,
    backgroundColor: "rgba(238,243,248,0.97)",
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },

  draftBtn: {
    flex: 0.9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.blue,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    flexDirection: "row",
    gap: 6,
  },

  draftBtnText: {
    color: UI.blue,
    fontSize: 13,
    fontWeight: "900",
  },

  previewBtn: {
    flex: 1.3,
    backgroundColor: UI.blue,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    flexDirection: "row",
    gap: 6,
  },

  previewBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  shareBtn: {
    flex: 0.8,
    backgroundColor: UI.text,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    flexDirection: "row",
    gap: 6,
  },

  shareBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.58)",
    padding: 12,
    justifyContent: "center",
  },

  modalCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    overflow: "hidden",
  },

  modalHeader: {
    backgroundColor: UI.blue,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalKicker: {
    color: "#BFDBFE",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  modalTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 1,
  },

  modalCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
  },

  webWrap: {
    flex: 1,
    padding: 10,
  },

  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 10,
    color: UI.muted,
    fontWeight: "800",
  },

  modalFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: UI.border,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },

  footerLight: {
    flex: 1,
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
    paddingVertical: 13,
    borderRadius: 15,
    alignItems: "center",
  },

  footerLightText: {
    fontWeight: "900",
    color: UI.text,
    fontSize: 13,
  },

  footerPrimary: {
    flex: 1,
    backgroundColor: UI.blue,
    paddingVertical: 13,
    borderRadius: 15,
    alignItems: "center",
  },

  footerPrimaryText: {
    fontWeight: "900",
    color: "#FFFFFF",
    fontSize: 13,
  },
});