// app/tecnico/ordenes/[orderid]/autorizacion-gastos-error-humano.js
// Autorización de gastos por error humano — diseño moderno tipo wizard
// Sin validaciones bloqueantes para visualizar PDF aunque falten datos.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import Header from "../../../../src/components/Header";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { buildAutorizacionGastosHtml } from "../../../../src/services/templates/autorizacion_gastos_error_humano/buildAutorizacionGastosHtml";

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
  { key: "general", title: "General", short: "Equipo" },
  { key: "problema", title: "Problema", short: "Causa" },
  { key: "costos", title: "Costos", short: "Refacciones" },
  { key: "resultado", title: "Resultado", short: "Cierre" },
  { key: "firmas", title: "Firmas", short: "Vo.Bo." },
];

const pad2 = (n) => String(n).padStart(2, "0");

function safe(v) {
  return String(v ?? "").trim();
}

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

const newRefaccion = () => ({
  codigo: "",
  nombre: "",
  horasHombre: "",
  costoManoObra: "",
  costoMateriales: "",
  costoTransporte: "",
  costoTotal: "",
});

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
          style={[styles.input, multiline && styles.textArea]}
          value={String(value ?? "")}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={UI.muted2}
          multiline={multiline}
          keyboardType={keyboardType}
          editable={editable}
        />
      </View>
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
    <View
      style={[
        styles.field,
        small && styles.fieldSmall,
        wide && styles.fieldWide,
      ]}
    >
      {children}
    </View>
  );
}

export default function AutorizacionGastosErrorHumanoForm() {
  const fechaHoy = useMemo(() => formatDateDMY(new Date()), []);

  const [activeStep, setActiveStep] = useState(0);

  const [mx, setMx] = useState("");
  const [direccion, setDireccion] = useState("");
  const [fechaEmision, setFechaEmision] = useState(fechaHoy);
  const [noEquipo, setNoEquipo] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [tipoControl, setTipoControl] = useState("");
  const [fechaEntregaEquipo, setFechaEntregaEquipo] = useState("");
  const [fechaAcontecimientos, setFechaAcontecimientos] = useState("");

  const [descripcionProblema, setDescripcionProblema] = useState("");
  const [accionInmediata, setAccionInmediata] = useState("");
  const [resultadoFinal, setResultadoFinal] = useState("");

  const [refacciones, setRefacciones] = useState([
    newRefaccion(),
    newRefaccion(),
  ]);

  const [emitio, setEmitio] = useState("");
  const [voboMantenimiento, setVoboMantenimiento] = useState("");
  const [voboFinanzas, setVoboFinanzas] = useState("");
  const [enteradoDirector, setEnteradoDirector] = useState("");

  const [dateTarget, setDateTarget] = useState(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const setDateValue = (target, value) => {
    if (target === "fechaEmision") setFechaEmision(value);
    if (target === "fechaEntregaEquipo") setFechaEntregaEquipo(value);
    if (target === "fechaAcontecimientos") setFechaAcontecimientos(value);
  };

  const getDateValue = (target) => {
    if (target === "fechaEmision") return fechaEmision;
    if (target === "fechaEntregaEquipo") return fechaEntregaEquipo;
    if (target === "fechaAcontecimientos") return fechaAcontecimientos;
    return "";
  };

  const onChangeDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setDateTarget(null);
    if (!selectedDate || !dateTarget) return;
    setDateValue(dateTarget, formatDateDMY(selectedDate));
  };

  const addRefaccion = () => {
    setRefacciones((prev) => [...prev, newRefaccion()]);
  };

  const removeRefaccion = (idx) => {
    setRefacciones((prev) => {
      if (prev.length <= 1) return [newRefaccion()];
      return prev.filter((_, i) => i !== idx);
    });
  };

  const updateRefaccion = (idx, field, value) => {
    setRefacciones((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  };

  const buildPayload = () => ({
    mx: safe(mx),
    direccion: safe(direccion),
    fechaEmision: safe(fechaEmision),
    noEquipo: safe(noEquipo),
    razonSocial: safe(razonSocial),
    tipoControl: safe(tipoControl),
    fechaEntregaEquipo: safe(fechaEntregaEquipo),
    fechaAcontecimientos: safe(fechaAcontecimientos),
    descripcionProblema: safe(descripcionProblema),
    accionInmediata: safe(accionInmediata),
    refacciones: refacciones.map((r) => ({
      codigo: safe(r.codigo),
      nombre: safe(r.nombre),
      horasHombre: safe(r.horasHombre),
      costoManoObra: safe(r.costoManoObra),
      costoMateriales: safe(r.costoMateriales),
      costoTransporte: safe(r.costoTransporte),
      costoTotal: safe(r.costoTotal),
    })),
    resultadoFinal: safe(resultadoFinal),
    emitio: safe(emitio),
    voboMantenimiento: safe(voboMantenimiento),
    voboFinanzas: safe(voboFinanzas),
    enteradoDirector: safe(enteradoDirector),
  });

  const generarPdfLocal = async () => {
    const html = buildAutorizacionGastosHtml(buildPayload());

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
      console.log("[AUTORIZACION GASTOS PDF] error:", e);
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
        dialogTitle: "Abrir / compartir autorización de gastos",
      });
    } catch (e) {
      console.log("[AUTORIZACION GASTOS] abrirPdf error:", e);
      Alert.alert("Error", "No se pudo abrir o compartir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const filledCount = useMemo(() => {
    const values = [
      mx,
      direccion,
      fechaEmision,
      noEquipo,
      razonSocial,
      tipoControl,
      fechaEntregaEquipo,
      fechaAcontecimientos,
      descripcionProblema,
      accionInmediata,
      resultadoFinal,
      emitio,
      voboMantenimiento,
      voboFinanzas,
      enteradoDirector,
    ];

    return values.filter((v) => !!safe(v)).length;
  }, [
    mx,
    direccion,
    fechaEmision,
    noEquipo,
    razonSocial,
    tipoControl,
    fechaEntregaEquipo,
    fechaAcontecimientos,
    descripcionProblema,
    accionInmediata,
    resultadoFinal,
    emitio,
    voboMantenimiento,
    voboFinanzas,
    enteradoDirector,
  ]);

  const refCount = useMemo(() => {
    return refacciones.filter(
      (r) =>
        safe(r.codigo) ||
        safe(r.nombre) ||
        safe(r.horasHombre) ||
        safe(r.costoManoObra) ||
        safe(r.costoMateriales) ||
        safe(r.costoTransporte) ||
        safe(r.costoTotal)
    ).length;
  }, [refacciones]);

  const totalEstimado = useMemo(() => {
    return refacciones.reduce((acc, r) => {
      const raw = String(r.costoTotal || "")
        .replace("$", "")
        .replace(",", "")
        .trim();

      const n = Number(raw);
      return acc + (Number.isNaN(n) ? 0 : n);
    }, 0);
  }, [refacciones]);

  const goNext = () => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0));

  const renderProgress = () => (
    <View style={styles.progressCard}>
      <Text style={styles.progressTitle}>Avance del formulario</Text>

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
        icon="cash-outline"
        title="Resumen de autorización"
        subtitle="Datos principales del documento."
      >
        <View style={styles.infoGrid}>
          <InfoItem label="MX" value={mx} />
          <InfoItem label="Equipo" value={noEquipo} />
          <InfoItem label="Fecha emisión" value={fechaEmision} />
          <InfoItem label="PDF" value="Libre / sin validación" />
        </View>
      </SectionBox>

      <SectionBox
        icon="information-circle-outline"
        title="Datos principales"
        subtitle="Información base del equipo y cliente."
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
              label="No. equipo"
              value={noEquipo}
              onChangeText={setNoEquipo}
              placeholder="No. equipo"
              icon="construct-outline"
            />
          </Field>
        </FieldRow>

        <Input
          label="Razón social"
          value={razonSocial}
          onChangeText={setRazonSocial}
          placeholder="Razón social"
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

        <Input
          label="Tipo de control"
          value={tipoControl}
          onChangeText={setTipoControl}
          placeholder="Tipo de control"
          icon="settings-outline"
        />

        <FieldRow>
          <Field>
            <DateButton
              label="Fecha de emisión"
              value={fechaEmision}
              onPress={() => setDateTarget("fechaEmision")}
            />
          </Field>

          <Field>
            <DateButton
              label="Fecha de entrega del equipo"
              value={fechaEntregaEquipo}
              onPress={() => setDateTarget("fechaEntregaEquipo")}
            />
          </Field>
        </FieldRow>

        <DateButton
          label="Fecha de acontecimientos"
          value={fechaAcontecimientos}
          onPress={() => setDateTarget("fechaAcontecimientos")}
        />
      </SectionBox>
    </>
  );

  const renderProblema = () => (
    <>
      <SectionBox
        icon="alert-circle-outline"
        title="Descripción del problema"
        subtitle="Describe qué ocurrió y por qué se genera la autorización."
      >
        <Input
          label="Descripción"
          value={descripcionProblema}
          onChangeText={setDescripcionProblema}
          placeholder="Describe el problema..."
          multiline
          icon="alert-circle-outline"
        />
      </SectionBox>

      <SectionBox
        icon="flash-outline"
        title="Acción inmediata"
        subtitle="Acciones realizadas para contener o atender el problema."
      >
        <Input
          label="Acción inmediata"
          value={accionInmediata}
          onChangeText={setAccionInmediata}
          placeholder="Describe la acción inmediata..."
          multiline
          icon="flash-outline"
        />
      </SectionBox>
    </>
  );

  const renderCostos = () => (
    <SectionBox
      icon="cube-outline"
      title="Refacciones y costos"
      subtitle="Captura materiales, mano de obra, transporte y costo total."
    >
      <View style={styles.costSummary}>
        <View>
          <Text style={styles.costTitle}>Resumen de costos</Text>
          <Text style={styles.costHint}>
            El total es solo una referencia visual.
          </Text>
        </View>

        <View style={styles.costPill}>
          <Text style={styles.costPillText}>
            ${totalEstimado.toLocaleString("es-MX")}
          </Text>
        </View>
      </View>

      {refacciones.map((r, idx) => (
        <View key={`refaccion-${idx}`} style={styles.rowCard}>
          <View style={styles.rowHeader}>
            <View>
              <Text style={styles.rowTitle}>Refacción {idx + 1}</Text>
              <Text style={styles.rowSub}>Material, horas y costos</Text>
            </View>

            <TouchableOpacity onPress={() => removeRefaccion(idx)}>
              <Text style={styles.removeTxt}>Eliminar</Text>
            </TouchableOpacity>
          </View>

          <FieldRow>
            <Field>
              <Input
                label="Código de refacción"
                value={r.codigo}
                onChangeText={(v) => updateRefaccion(idx, "codigo", v)}
                placeholder="Código"
                icon="barcode-outline"
              />
            </Field>

            <Field>
              <Input
                label="Nombre de refacción"
                value={r.nombre}
                onChangeText={(v) => updateRefaccion(idx, "nombre", v)}
                placeholder="Nombre"
                icon="cube-outline"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field small>
              <Input
                label="Horas hombre"
                value={r.horasHombre}
                onChangeText={(v) => updateRefaccion(idx, "horasHombre", v)}
                placeholder="Horas"
                icon="time-outline"
                keyboardType="numeric"
              />
            </Field>

            <Field small>
              <Input
                label="Mano de obra"
                value={r.costoManoObra}
                onChangeText={(v) => updateRefaccion(idx, "costoManoObra", v)}
                placeholder="$"
                icon="cash-outline"
                keyboardType="numeric"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field small>
              <Input
                label="Materiales"
                value={r.costoMateriales}
                onChangeText={(v) => updateRefaccion(idx, "costoMateriales", v)}
                placeholder="$"
                icon="cash-outline"
                keyboardType="numeric"
              />
            </Field>

            <Field small>
              <Input
                label="Transporte"
                value={r.costoTransporte}
                onChangeText={(v) => updateRefaccion(idx, "costoTransporte", v)}
                placeholder="$"
                icon="car-outline"
                keyboardType="numeric"
              />
            </Field>

            <Field small>
              <Input
                label="Costo total"
                value={r.costoTotal}
                onChangeText={(v) => updateRefaccion(idx, "costoTotal", v)}
                placeholder="$"
                icon="calculator-outline"
                keyboardType="numeric"
              />
            </Field>
          </FieldRow>
        </View>
      ))}

      <TouchableOpacity style={styles.secondary} onPress={addRefaccion}>
        <Ionicons name="add-circle-outline" size={18} color="#fff" />
        <Text style={styles.secondaryText}>Agregar refacción</Text>
      </TouchableOpacity>
    </SectionBox>
  );

  const renderResultado = () => (
    <SectionBox
      icon="checkmark-done-outline"
      title="Resultado final y contramedida"
      subtitle="Conclusión del caso y acciones para evitar recurrencia."
    >
      <Input
        label="Resultado final y contramedida"
        value={resultadoFinal}
        onChangeText={setResultadoFinal}
        placeholder="Resultado final..."
        multiline
        icon="checkmark-done-outline"
      />
    </SectionBox>
  );

  const renderFirmas = () => (
    <SectionBox
      icon="create-outline"
      title="Firmas y vistos buenos"
      subtitle="Responsables de emisión, mantenimiento, finanzas y dirección."
    >
      <Input
        label="Emitió"
        value={emitio}
        onChangeText={setEmitio}
        placeholder="Nombre"
        icon="person-outline"
      />

      <Input
        label="Vo.Bo. mantenimiento"
        value={voboMantenimiento}
        onChangeText={setVoboMantenimiento}
        placeholder="Nombre"
        icon="person-outline"
      />

      <Input
        label="Vo.Bo. finanzas"
        value={voboFinanzas}
        onChangeText={setVoboFinanzas}
        placeholder="Nombre"
        icon="person-outline"
      />

      <Input
        label="Enterado director general"
        value={enteradoDirector}
        onChangeText={setEnteradoDirector}
        placeholder="Nombre"
        icon="person-outline"
      />
    </SectionBox>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderProblema();
    if (activeStep === 2) return renderCostos();
    if (activeStep === 3) return renderResultado();
    return renderFirmas();
  };

  return (
    <View style={styles.container}>
      <Header title="Autorización de gastos" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="cash-outline" size={25} color="#fff" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>Formato administrativo</Text>
              <Text style={styles.heroTitle}>Autorización de gastos</Text>
              <Text style={styles.heroSub}>
                Captura el gasto por error humano, costos y vistos buenos.
                Puedes visualizar el PDF aunque falten datos.
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

  costSummary: {
    backgroundColor: UI.blueSoft,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  costTitle: {
    color: UI.blue,
    fontWeight: "900",
    fontSize: 14,
  },

  costHint: {
    color: UI.muted,
    fontWeight: "700",
    fontSize: 11,
    marginTop: 2,
  },

  costPill: {
    backgroundColor: UI.blue,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  costPillText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
  },

  secondary: {
    backgroundColor: UI.dark,
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