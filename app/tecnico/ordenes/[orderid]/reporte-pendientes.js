// app/tecnico/ordenes/[orderid]/reporte-pendientes.js
// Reporte de pendientes — diseño moderno tipo wizard
// Sin validaciones bloqueantes para visualizar PDF aunque falten datos.

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import Header from "../../../../src/components/Header";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildReportePendientesHtml } from "../../../../src/services/templates/reporte_pendientes/buildReportePendientesHtml";

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
  dark: "#111827",
};

const STEPS = [
  { key: "general", title: "General", short: "Orden" },
  { key: "pendiente", title: "Pendiente", short: "Problema" },
  { key: "seguimiento", title: "Seguimiento", short: "Supervisor" },
  { key: "solucion", title: "Solución", short: "Cierre" },
];

const pad2 = (n) => String(n).padStart(2, "0");

function formatDateDMY(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function parseDMYToDate(value) {
  const [dd, mm, yyyy] = String(value || "")
    .split("/")
    .map((x) => Number(x));

  if (!dd || !mm || !yyyy) return new Date();
  return new Date(yyyy, mm - 1, dd);
}

function safe(v) {
  return String(v ?? "").trim();
}

function getUserName(user) {
  return safe(
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

function mapDireccion(addr) {
  if (!addr) return { razonSocial: "", direccion: "", telefono: "" };

  const razonSocial = [addr.Name1, addr.Name2].filter(Boolean).join(" ").trim();

  const direccion = [
    `${addr.Street ?? ""} ${addr.HouseNum1 ?? ""}`.trim(),
    addr.StrSuppl3,
    addr.Location,
    addr.City1,
    addr.Region,
    addr.PostCode1,
    addr.Country,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    razonSocial,
    direccion,
    telefono: safe(addr.TelNumber || addr.TelNumber1 || addr.PhoneNumber || ""),
  };
}

const Label = ({ children, style }) => (
  <Text style={[styles.label, style]}>{children}</Text>
);

function Input({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  icon,
  keyboardType = "default",
  editable = true,
}) {
  return (
    <View style={styles.inputBlock}>
      <Label>{label}</Label>

      <View
        style={[
          styles.inputWrap,
          multiline && styles.inputWrapMultiline,
          !editable && styles.readonlyWrap,
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
          value={String(value ?? "")}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={UI.muted2}
          keyboardType={keyboardType}
          editable={editable}
          multiline={multiline}
          style={[styles.input, multiline && styles.textArea]}
        />
      </View>
    </View>
  );
}

function Chip({ active, children, onPress, tone = "blue" }) {
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
}

function RadioChips({ options, value, onChange }) {
  return (
    <View style={styles.chipsWrap}>
      {options.map((opt) => (
        <Chip
          key={opt}
          active={value === opt}
          onPress={() => onChange(opt)}
          tone={opt === "Elevador" ? "blue" : "green"}
        >
          {opt}
        </Chip>
      ))}
    </View>
  );
}

function DateButton({ label, value, onPress }) {
  return (
    <View style={styles.inputBlock}>
      <Label>{label}</Label>

      <TouchableOpacity style={styles.dateBtn} onPress={onPress} activeOpacity={0.9}>
        <View style={styles.dateLeft}>
          <Ionicons name="calendar-outline" size={17} color={UI.blue} />
          <Text style={[styles.dateBtnText, !value && { color: UI.muted2 }]}>
            {value || "DD/MM/AAAA"}
          </Text>
        </View>

        <Ionicons name="chevron-down-outline" size={18} color={UI.muted} />
      </TouchableOpacity>
    </View>
  );
}

function SectionBox({ icon, title, subtitle, children }) {
  return (
    <View style={styles.sectionBox}>
      <View style={styles.sectionTop}>
        <View style={styles.sectionIcon}>
          <Ionicons
            name={icon || "document-text-outline"}
            size={18}
            color={UI.blue}
          />
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

export default function ReportePendientesForm() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();

  const safeOrderId = safe(orderid || "SIN_ORDEN");
  const fechaHoy = useMemo(() => formatDateDMY(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);

  const [mx, setMx] = useState("");
  const [folioPreventivo, setFolioPreventivo] = useState(safeOrderId || "SIN_ORDEN");
  const [numeroEquipo, setNumeroEquipo] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipoEquipo, setTipoEquipo] = useState("");

  const [fechaReporte, setFechaReporte] = useState(fechaHoy);
  const [mecanicoReporta, setMecanicoReporta] = useState(getUserName(user));
  const [fechaEnteradoSMA, setFechaEnteradoSMA] = useState("");
  const [firmaSelloSMA, setFirmaSelloSMA] = useState("");
  const [descripcionProblema, setDescripcionProblema] = useState("");

  const [seguimientoSupervisor, setSeguimientoSupervisor] = useState("");
  const [fechaSolucion, setFechaSolucion] = useState("");
  const [fechaEnteradoMec, setFechaEnteradoMec] = useState("");
  const [auxiliar, setAuxiliar] = useState("");
  const [firmaMec, setFirmaMec] = useState("");
  const [procedimiento, setProcedimiento] = useState("");
  const [solucionProblema, setSolucionProblema] = useState("");

  const [dateTarget, setDateTarget] = useState(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    const name = getUserName(user);
    if (!mecanicoReporta && name) setMecanicoReporta(name);
  }, [user, mecanicoReporta]);

  useEffect(() => {
    let alive = true;

    async function cargarDatosOrden() {
      const orderId = safe(orderid);

      if (!orderId || orderId === "[orderid]") {
        if (!alive) return;

        setFolioPreventivo("SIN_ORDEN");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const resOrden = await api.get(`/api/ordenes/sap/${orderId}`);
        const orden = resOrden?.data || {};

        let razon = safe(
          orden.razon_social ||
            orden.cliente ||
            `${orden.Name1 ?? ""} ${orden.Name2 ?? ""}`
        );

        let dir = safe(orden.direccion || orden.address || orden.partner_address || "");
        let tel = safe(orden.TelNumber || orden.telefono || orden.phone || "");

        try {
          const resAddr = await api.get(
            `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')/ToAddresses`
          );

          const results = resAddr?.data?.d?.results || resAddr?.data?.results || [];
          const chosen = results?.[1] || results?.[0] || null;
          const mapped = mapDireccion(chosen);

          if (mapped.razonSocial) razon = mapped.razonSocial;
          if (mapped.direccion) dir = mapped.direccion;
          if (mapped.telefono) tel = mapped.telefono;
        } catch (e) {
          console.log("[PENDIENTES] Dirección no disponible:", e?.message);
        }

        const rawTipo = safe(
          orden.tipo_equipo ||
            orden.EquipmentType ||
            orden.equipment_type ||
            orden.DescripcionEquipo ||
            orden.description ||
            ""
        ).toLowerCase();

        if (!alive) return;

        setFolioPreventivo(safe(orden.Orderid || orden.OrderId || orderId));
        setNumeroEquipo(safe(orden.Equipment || orden.equipment || ""));
        setRazonSocial(razon);
        setDireccion(dir);
        setTelefono(tel);

        if (rawTipo.includes("escal")) setTipoEquipo("Escalera");
        else if (rawTipo.includes("elev")) setTipoEquipo("Elevador");
      } catch (e) {
        console.log("[PENDIENTES] Error cargando orden:", e?.response?.data || e);

        if (alive) {
          setFolioPreventivo(orderId || "SIN_ORDEN");
          Alert.alert(
            "Aviso",
            "No se pudieron traer los datos de la orden. Puedes capturarlos manualmente y generar el PDF."
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    cargarDatosOrden();

    return () => {
      alive = false;
    };
  }, [orderid]);

  const buildPayload = useCallback(
    () => ({
      mx: safe(mx),
      folioPreventivo: safe(folioPreventivo || safeOrderId || "SIN_ORDEN"),
      numeroEquipo: safe(numeroEquipo),
      razonSocial: safe(razonSocial),
      direccion: safe(direccion),
      telefono: safe(telefono),
      tipoEquipo: safe(tipoEquipo),
      fechaReporte: safe(fechaReporte),
      mecanicoReporta: safe(mecanicoReporta),
      fechaEnteradoSMA: safe(fechaEnteradoSMA),
      firmaSelloSMA: safe(firmaSelloSMA),
      descripcionProblema: safe(descripcionProblema),
      seguimientoSupervisor: safe(seguimientoSupervisor),
      fechaSolucion: safe(fechaSolucion),
      fechaEnteradoMec: safe(fechaEnteradoMec),
      auxiliar: safe(auxiliar),
      firmaMec: safe(firmaMec),
      procedimiento: safe(procedimiento),
      solucionProblema: safe(solucionProblema),
    }),
    [
      mx,
      folioPreventivo,
      safeOrderId,
      numeroEquipo,
      razonSocial,
      direccion,
      telefono,
      tipoEquipo,
      fechaReporte,
      mecanicoReporta,
      fechaEnteradoSMA,
      firmaSelloSMA,
      descripcionProblema,
      seguimientoSupervisor,
      fechaSolucion,
      fechaEnteradoMec,
      auxiliar,
      firmaMec,
      procedimiento,
      solucionProblema,
    ]
  );

  const getDateValue = (target) => {
    if (target === "fechaReporte") return fechaReporte;
    if (target === "fechaEnteradoSMA") return fechaEnteradoSMA;
    if (target === "fechaSolucion") return fechaSolucion;
    if (target === "fechaEnteradoMec") return fechaEnteradoMec;
    return "";
  };

  const setDateValue = (target, value) => {
    if (target === "fechaReporte") setFechaReporte(value);
    if (target === "fechaEnteradoSMA") setFechaEnteradoSMA(value);
    if (target === "fechaSolucion") setFechaSolucion(value);
    if (target === "fechaEnteradoMec") setFechaEnteradoMec(value);
  };

  const onChangeDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setDateTarget(null);
    if (!selectedDate || !dateTarget) return;
    setDateValue(dateTarget, formatDateDMY(selectedDate));
  };

  const generarPdfLocal = async () => {
    const payload = buildPayload();
    const html = buildReportePendientesHtml(payload);

    const result = await Print.printToFileAsync({
      html,
      base64: false,
    });

    setPreviewHtml(html);
    setPdfUri(result.uri);

    return {
      html,
      uri: result.uri,
    };
  };

  const generarPreviewPdf = async () => {
    try {
      setGeneratingPdf(true);
      setPreviewHtml("");
      setPdfUri(null);
      setShowPreview(true);

      await generarPdfLocal();
    } catch (e) {
      console.log("[REPORTE PENDIENTES PDF] error:", e);
      setShowPreview(false);
      Alert.alert("Error", "No se pudo generar la vista previa del PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const abrirPdf = async () => {
    try {
      setGeneratingPdf(true);

      let uri = pdfUri;

      if (!uri) {
        const result = await generarPdfLocal();
        uri = result.uri;
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
        dialogTitle: "Abrir / compartir reporte de pendientes",
      });
    } catch (e) {
      console.log("[PENDIENTES] abrirPdf error:", e);
      Alert.alert("Error", "No se pudo abrir o compartir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const filledCount = useMemo(() => {
    const values = [
      mx,
      folioPreventivo,
      numeroEquipo,
      razonSocial,
      direccion,
      telefono,
      tipoEquipo,
      fechaReporte,
      mecanicoReporta,
      fechaEnteradoSMA,
      firmaSelloSMA,
      descripcionProblema,
      seguimientoSupervisor,
      fechaSolucion,
      fechaEnteradoMec,
      auxiliar,
      firmaMec,
      procedimiento,
      solucionProblema,
    ];

    return values.filter((v) => !!safe(v)).length;
  }, [
    mx,
    folioPreventivo,
    numeroEquipo,
    razonSocial,
    direccion,
    telefono,
    tipoEquipo,
    fechaReporte,
    mecanicoReporta,
    fechaEnteradoSMA,
    firmaSelloSMA,
    descripcionProblema,
    seguimientoSupervisor,
    fechaSolucion,
    fechaEnteradoMec,
    auxiliar,
    firmaMec,
    procedimiento,
    solucionProblema,
  ]);

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
        subtitle="Datos principales de la orden y del equipo."
      >
        <View style={styles.infoGrid}>
          <InfoItem label="Folio" value={folioPreventivo || safeOrderId || "SIN_ORDEN"} />
          <InfoItem label="Equipo" value={numeroEquipo} />
          <InfoItem label="Tipo equipo" value={tipoEquipo} />
          <InfoItem label="Mecánico" value={mecanicoReporta} />
        </View>
      </SectionBox>

      <SectionBox
        icon="business-outline"
        title="Datos principales"
        subtitle="Se precargan desde la orden, pero puedes corregirlos."
      >
        <FieldRow>
          <Field small>
            <Input
              label="MX"
              value={mx}
              onChangeText={setMx}
              placeholder="MX..."
              icon="barcode-outline"
            />
          </Field>

          <Field>
            <Input
              label="No. folio mantto preventivo"
              value={folioPreventivo}
              onChangeText={setFolioPreventivo}
              placeholder="Folio"
              icon="document-text-outline"
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field>
            <Input
              label="No. de equipo"
              value={numeroEquipo}
              onChangeText={setNumeroEquipo}
              placeholder="Equipo"
              icon="construct-outline"
            />
          </Field>

          <Field>
            <Input
              label="Teléfono"
              value={telefono}
              onChangeText={setTelefono}
              placeholder="Teléfono"
              icon="call-outline"
              keyboardType="phone-pad"
            />
          </Field>
        </FieldRow>

        <Input
          label="Razón social"
          value={razonSocial}
          onChangeText={setRazonSocial}
          placeholder="Cliente / empresa"
          icon="business-outline"
        />

        <Input
          label="Dirección"
          value={direccion}
          onChangeText={setDireccion}
          placeholder="Dirección completa"
          icon="location-outline"
          multiline
        />

        <Label>Tipo de equipo</Label>

        <RadioChips
          options={["Escalera", "Elevador"]}
          value={tipoEquipo}
          onChange={setTipoEquipo}
        />
      </SectionBox>
    </>
  );

  const renderPendiente = () => (
    <>
      <SectionBox
        icon="calendar-outline"
        title="Datos del pendiente"
        subtitle="Fecha, mecánico, SMA y descripción del problema."
      >
        <DateButton
          label="Fecha de reporte"
          value={fechaReporte}
          onPress={() => setDateTarget("fechaReporte")}
        />

        <Input
          label="Mecánico que reporta"
          value={mecanicoReporta}
          onChangeText={setMecanicoReporta}
          placeholder="Nombre del mecánico"
          icon="person-circle-outline"
        />

        <DateButton
          label="Fecha de enterado SMA"
          value={fechaEnteradoSMA}
          onPress={() => setDateTarget("fechaEnteradoSMA")}
        />

        <Input
          label="Firma y sello SMA"
          value={firmaSelloSMA}
          onChangeText={setFirmaSelloSMA}
          placeholder="Texto o referencia"
          icon="create-outline"
        />
      </SectionBox>

      <SectionBox
        icon="alert-circle-outline"
        title="Descripción del problema / pendiente"
        subtitle="Describe qué se encontró o qué queda pendiente."
      >
        <Input
          label="Descripción"
          value={descripcionProblema}
          onChangeText={setDescripcionProblema}
          placeholder="Describe el problema o pendiente..."
          multiline
          icon="alert-circle-outline"
        />
      </SectionBox>
    </>
  );

  const renderSeguimiento = () => (
    <>
      <SectionBox
        icon="briefcase-outline"
        title="Seguimiento del supervisor"
        subtitle="Responsable, comentarios y fechas de seguimiento."
      >
        <Input
          label="Seguimiento del supervisor"
          value={seguimientoSupervisor}
          onChangeText={setSeguimientoSupervisor}
          placeholder="Seguimiento / responsable / comentario"
          icon="person-outline"
          multiline
        />

        <FieldRow>
          <Field>
            <DateButton
              label="Fecha de solución"
              value={fechaSolucion}
              onPress={() => setDateTarget("fechaSolucion")}
            />
          </Field>

          <Field>
            <DateButton
              label="Fecha de enterado MEC"
              value={fechaEnteradoMec}
              onPress={() => setDateTarget("fechaEnteradoMec")}
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field>
            <Input
              label="Auxiliar"
              value={auxiliar}
              onChangeText={setAuxiliar}
              placeholder="Nombre del auxiliar"
              icon="people-outline"
            />
          </Field>

          <Field>
            <Input
              label="Firma MEC"
              value={firmaMec}
              onChangeText={setFirmaMec}
              placeholder="Firma / referencia"
              icon="create-outline"
            />
          </Field>
        </FieldRow>
      </SectionBox>
    </>
  );

  const renderSolucion = () => (
    <>
      <SectionBox
        icon="hammer-outline"
        title="Procedimiento"
        subtitle="Describe el procedimiento realizado para atender el pendiente."
      >
        <Input
          label="Procedimiento"
          value={procedimiento}
          onChangeText={setProcedimiento}
          placeholder="Describe el procedimiento..."
          multiline
          icon="hammer-outline"
        />
      </SectionBox>

      <SectionBox
        icon="checkmark-done-outline"
        title="Solución del problema"
        subtitle="Describe la solución o el cierre del pendiente."
      >
        <Input
          label="Solución del problema / fecha de solución"
          value={solucionProblema}
          onChangeText={setSolucionProblema}
          placeholder="Describe la solución..."
          multiline
          icon="checkmark-done-outline"
        />
      </SectionBox>
    </>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderPendiente();
    if (activeStep === 2) return renderSeguimiento();
    return renderSolucion();
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={UI.blue} />
        <Text style={styles.loadingText}>Cargando datos de la orden…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Reporte de pendientes" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="clipboard-outline" size={25} color="#fff" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>Formato técnico</Text>
              <Text style={styles.heroTitle}>Reporte de pendientes</Text>
              <Text style={styles.heroSub}>
                Captura el pendiente, seguimiento y solución. Puedes visualizar
                el PDF aunque todavía falten datos.
              </Text>
            </View>

            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>PDF libre</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatBox label="Campos" value={filledCount} />
            <StatBox label="Paso" value={`${activeStep + 1}/${STEPS.length}`} tone="green" />
            <StatBox
              label="Folio"
              value={folioPreventivo ? "OK" : "—"}
              tone={folioPreventivo ? "blue" : "yellow"}
            />
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

        {dateTarget && (
          <DateTimePicker
            value={parseDMYToDate(getDateValue(dateTarget))}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeDate}
          />
        )}

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

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.bg,
  },

  loadingText: {
    marginTop: 10,
    color: UI.muted,
    fontWeight: "800",
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

  readonlyWrap: {
    backgroundColor: "#EEF3F8",
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
    marginBottom: 4,
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

  dateBtn: {
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

  dateLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  dateBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: UI.text,
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
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 26 : 14,
    backgroundColor: "rgba(238,243,248,0.97)",
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },

  previewBtn: {
    flex: 1.35,
    backgroundColor: UI.blue,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    flexDirection: "row",
    gap: 7,
  },

  previewBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  shareBtn: {
    flex: 0.85,
    backgroundColor: UI.dark,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    flexDirection: "row",
    gap: 7,
  },

  shareBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
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