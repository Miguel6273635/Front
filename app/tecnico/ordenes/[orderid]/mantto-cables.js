// app/tecnico/ordenes/[orderid]/mantto-cables.js
// Formulario de mantenimiento de cables - diseño tipo wizard moderno
// Sin validaciones bloqueantes para permitir vista previa PDF.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildManttoCablesHtml } from "../../../../src/services/templates/mantto_cables/buildManttoCablesHtml";

const THEME = {
  bg: "#EEF3F8",
  card: "#FFFFFF",
  cardSoft: "#F8FAFC",
  text: "#0F172A",
  muted: "#64748B",
  muted2: "#94A3B8",
  border: "#DDE6F0",
  blue: "#0B2E6D",
  blue2: "#1D4ED8",
  blueSoft: "#EAF1FF",
  green: "#16A34A",
  greenSoft: "#DCFCE7",
  yellow: "#F59E0B",
  yellowSoft: "#FEF3C7",
  red: "#DC2626",
  redSoft: "#FEE2E2",
};

const STEPS = [
  { key: "general", title: "General", short: "Datos" },
  { key: "diametros", title: "Diámetros", short: "Cables" },
  { key: "rupturas", title: "Rupturas", short: "Alambres" },
  { key: "hallazgos", title: "Hallazgos", short: "Revisión" },
  { key: "resultado", title: "Resultado", short: "Final" },
];

function safeStr(v) {
  return String(v ?? "").trim();
}

function fmtSapDate(val) {
  if (!val) return "—";

  if (typeof val === "string" && val.startsWith("/Date(")) {
    const ms = parseInt(val.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return fmtDate(new Date(ms));
  }

  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return safeStr(val) || "—";
  return fmtDate(d);
}

function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

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

function createDefaultForm(orderid = "") {
  return {
    orderid,
    created_by: null,
    tipo_reporte: "overhaul",
    cantidad_cables: 8,
    diametro_estandar_mm: "",
    tiempo_uso_cables: "",
    fecha: "",
    hora_inicio: "",
    hora_fin: "",

    seccion_diametros: Array.from({ length: 8 }, (_, i) => ({
      cable_no: i + 1,
      diametro_mm: "",
      parte_desgaste_mm: "",
      parte_intacta_mm: "",
      desgaste_pct: null,
      peor: false,
    })),

    seccion_rupturas: Array.from({ length: 8 }, (_, i) => ({
      cable_no: i + 1,
      hay: false,
      rupturas_por_paso: "",
      posicion_cabina: "",
      cambio: false,
    })),

    seccion_longitud: {
      encontrado: false,
      cable_no: "",
      posicion_cabina: "",
      longitud_mm: "",
    },

    seccion_oxido: {
      encontrado: false,
      alcance: "no",
      cable_no: "",
      posicion_cabina: "",
    },

    seccion_tension: {
      estado: "bien",
    },

    seccion_deformaciones: {
      encontrado: false,
      cable_no: "",
      posicion_cabina: "",
      problema: "",
    },

    seccion_terminales: {
      estado: "sin_anomalias",
    },

    resultado_total: {
      bien: true,
      cambio_inmediato: false,
      programar_cambio: false,
      tipos_problema: [],
      detalle: "",
    },
  };
}

const Label = ({ children, style }) => (
  <Text style={[styles.label, style]}>{children}</Text>
);

const Input = ({ style, ...props }) => (
  <TextInput
    {...props}
    placeholderTextColor={THEME.muted2}
    style={[styles.input, style]}
  />
);

const Toggle = ({ value, onValueChange }) => (
  <Switch
    value={!!value}
    onValueChange={onValueChange}
    trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
    thumbColor={value ? THEME.blue : "#FFFFFF"}
  />
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
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.chip, active && activeStyle]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
};

const InfoItem = ({ label, value }) => (
  <View style={styles.infoItem}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={2}>
      {String(value || "—")}
    </Text>
  </View>
);

const StatBox = ({ label, value, tone = "blue" }) => {
  const boxStyle =
    tone === "green"
      ? styles.statGreen
      : tone === "yellow"
      ? styles.statYellow
      : tone === "red"
      ? styles.statRed
      : styles.statBlue;

  return (
    <View style={[styles.statBox, boxStyle]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

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

function SectionBox({ title, subtitle, children }) {
  return (
    <View style={styles.sectionBox}>
      <View style={styles.sectionTop}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function CableCard({ row, onChange }) {
  const updateLocal = (patch) => {
    const next = { ...(row || {}), ...patch };

    const desg = Number(next.parte_desgaste_mm);
    const intc = Number(next.parte_intacta_mm);

    if (!Number.isNaN(desg) && !Number.isNaN(intc) && intc > 0) {
      next.desgaste_pct = Math.round((desg / intc) * 1000) / 10;
    } else {
      next.desgaste_pct = null;
    }

    onChange(next);
  };

  return (
    <View style={[styles.cableCard, row?.peor && styles.cableCardWorst]}>
      <View style={styles.cableTop}>
        <View style={styles.cableNumber}>
          <Text style={styles.cableNumberText}>{row.cable_no}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.cableTitle}>Cable {row.cable_no}</Text>
          <Text style={styles.cableHint}>Medición y desgaste</Text>
        </View>

        <View style={[styles.percentPill, row?.peor && styles.percentWorst]}>
          <Text style={styles.percentText}>
            {row?.desgaste_pct != null ? `${row.desgaste_pct}%` : "—"}
          </Text>
        </View>
      </View>

      <FieldRow>
        <Field small>
          <Label>Ø medido</Label>
          <Input
            keyboardType="numeric"
            value={String(row?.diametro_mm ?? "")}
            onChangeText={(t) =>
              updateLocal({ diametro_mm: t.replace(",", ".") })
            }
            placeholder="0.00"
          />
        </Field>

        <Field small>
          <Label>Desgaste</Label>
          <Input
            keyboardType="numeric"
            value={String(row?.parte_desgaste_mm ?? "")}
            onChangeText={(t) =>
              updateLocal({ parte_desgaste_mm: t.replace(",", ".") })
            }
            placeholder="0.00"
          />
        </Field>

        <Field small>
          <Label>Intacta</Label>
          <Input
            keyboardType="numeric"
            value={String(row?.parte_intacta_mm ?? "")}
            onChangeText={(t) =>
              updateLocal({ parte_intacta_mm: t.replace(",", ".") })
            }
            placeholder="0.00"
          />
        </Field>
      </FieldRow>

      <View style={styles.cardToggleRow}>
        <View>
          <Text style={styles.toggleTitle}>Peor cable</Text>
          <Text style={styles.toggleHint}>Marcar para resaltarlo en el reporte.</Text>
        </View>

        <Toggle
          value={!!row?.peor}
          onValueChange={(v) => updateLocal({ peor: v })}
        />
      </View>
    </View>
  );
}

export default function ManttoCablesScreen() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [orden, setOrden] = useState(null);
  const [auto, setAuto] = useState({
    orden: "",
    cliente: "",
    equipo: "",
    tecnico_nombre: "",
    start_date: "",
  });

  const [form, setForm] = useState(() => createDefaultForm(""));
  const [activeStep, setActiveStep] = useState(0);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const update = (patch) => {
    setPdfUri(null);
    setForm((s) => ({ ...s, ...patch }));
  };

  const updateArrayItem = (key, idx, patch) => {
    setPdfUri(null);
    setForm((s) => {
      const arr = [...(s[key] || [])];
      arr[idx] = { ...(arr[idx] || {}), ...patch };
      return { ...s, [key]: arr };
    });
  };

  const mapOrdenToAuto = useCallback(
    (data, oid) => ({
      orden: safeStr(data?.Orderid || data?.OrderId || oid),
      cliente: safeStr(
        data?.cliente ||
          data?.Client ||
          data?.Name1 ||
          data?.nombre_cliente ||
          data?.customer ||
          ""
      ),
      equipo: safeStr(
        data?.equipment || data?.Equipment || data?.equipo || data?.Equnr || ""
      ),
      tecnico_nombre: getUserName(user),
      start_date: safeStr(data?.start_date || data?.StartDate || data?.fecha || ""),
    }),
    [user]
  );

  const cargarOrden = useCallback(async () => {
    const oid = safeStr(orderid);

    if (!oid || oid === "[orderid]") {
      setLoading(false);
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    try {
      setLoading(true);

      const resOrden = await api.get(`/api/ordenes/sap/${oid}`);
      const dataOrden = resOrden?.data || {};
      let clienteFromAddress = "";

      try {
        const resAddr = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${oid}')/ToAddresses`
        );

        const results =
          resAddr?.data?.d?.results || resAddr?.data?.results || [];

        clienteFromAddress = safeStr(results?.[0]?.Name1);
      } catch (addrError) {
        console.log(
          "[ManttoCables] No se pudo cargar ToAddresses:",
          addrError?.response?.data || addrError?.message || addrError
        );
      }

      const data = {
        ...dataOrden,
        cliente: clienteFromAddress || dataOrden?.cliente || dataOrden?.Name1 || "",
      };

      const autoData = mapOrdenToAuto(data, oid);

      setOrden(data);
      setAuto(autoData);

      setForm((s) => ({
        ...s,
        orderid: autoData.orden || oid,
        created_by: user?.id ?? s.created_by,
        fecha: s.fecha || fmtSapDate(autoData.start_date),
      }));
    } catch (e) {
      console.log("[ManttoCables] cargarOrden error:", e?.response?.data || e);

      const oid = safeStr(orderid);

      setOrden({ Orderid: oid });
      setAuto({
        orden: oid,
        cliente: "",
        equipo: "",
        tecnico_nombre: getUserName(user),
        start_date: "",
      });

      setForm((s) => ({
        ...s,
        orderid: oid,
        created_by: user?.id ?? s.created_by,
      }));

      Alert.alert(
        "Aviso",
        "No se pudieron cargar todos los datos de la orden. Puedes llenar el formulario y generar el PDF."
      );
    } finally {
      setLoading(false);
    }
  }, [orderid, user, mapOrdenToAuto]);

  useEffect(() => {
    cargarOrden();
  }, [cargarOrden]);

  const activeCableCount = Number(form.cantidad_cables || 8);

  const stats = useMemo(() => {
    const diametros = (form.seccion_diametros || []).slice(0, activeCableCount);
    const rupturas = (form.seccion_rupturas || []).slice(0, activeCableCount);

    const medidos = diametros.filter(
      (x) =>
        safeStr(x.diametro_mm) ||
        safeStr(x.parte_desgaste_mm) ||
        safeStr(x.parte_intacta_mm)
    ).length;

    const peor = diametros.filter((x) => x.peor).length;
    const conRuptura = rupturas.filter((x) => x.hay).length;

    return { medidos, peor, conRuptura };
  }, [form, activeCableCount]);

  function buildHtmlActual() {
    return buildManttoCablesHtml({
      orden: {
        ...(orden || {}),
        Orderid: auto?.orden || form?.orderid,
        cliente: auto?.cliente,
        equipment: auto?.equipo,
        tecnico_nombre: auto?.tecnico_nombre,
        start_date: auto?.start_date || form?.fecha,
      },
      form,
      user,
    });
  }

  const abrirPreviewPdf = async () => {
    try {
      const html = buildHtmlActual();
      setPreviewHtml(html);
      setPreviewVisible(true);
    } catch (e) {
      console.log("[ManttoCables] preview error:", e);
      Alert.alert("Error", "No se pudo generar la vista previa del PDF.");
    }
  };

  const generarPdf = async () => {
    try {
      setGeneratingPdf(true);

      const html = buildHtmlActual();

      const result = await Print.printToFileAsync({
        html,
        base64: false,
      });

      const cleanOrder = safeStr(auto?.orden || form?.orderid || "orden").replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );

      const fileName = `mantto_cables_${cleanOrder}.pdf`;
      const targetUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.copyAsync({
        from: result.uri,
        to: targetUri,
      });

      setPdfUri(targetUri);
      return targetUri;
    } finally {
      setGeneratingPdf(false);
    }
  };

  const compartirPdf = async () => {
    try {
      const uri = pdfUri || (await generarPdf());

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "PDF generado",
          "El PDF se generó, pero este dispositivo no permite compartir archivos."
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Compartir mantenimiento de cables",
      });
    } catch (e) {
      console.log("[ManttoCables] compartir error:", e);
      Alert.alert("Error", "No se pudo generar o compartir el PDF.");
    }
  };

  const save = async () => {
    try {
      setSaving(true);

      const payload = {
        ...form,
        orderid: form.orderid || auto.orden,
        diametro_estandar_mm: form.diametro_estandar_mm
          ? Number(form.diametro_estandar_mm)
          : null,
        cantidad_cables: form.cantidad_cables ? Number(form.cantidad_cables) : 8,
        seccion_diametros: (form.seccion_diametros || []).map((r) => ({
          ...r,
          diametro_mm:
            r.diametro_mm !== null && r.diametro_mm !== ""
              ? Number(r.diametro_mm)
              : null,
          parte_desgaste_mm:
            r.parte_desgaste_mm !== null && r.parte_desgaste_mm !== ""
              ? Number(r.parte_desgaste_mm)
              : null,
          parte_intacta_mm:
            r.parte_intacta_mm !== null && r.parte_intacta_mm !== ""
              ? Number(r.parte_intacta_mm)
              : null,
          desgaste_pct:
            r.desgaste_pct !== null && r.desgaste_pct !== ""
              ? Number(r.desgaste_pct)
              : null,
        })),
      };

      console.log("[ManttoCables] payload borrador:", payload);
      Alert.alert("Guardado", "El formulario quedó listo para generar PDF.");
    } catch (e) {
      console.log("[ManttoCables] save error:", e);
      Alert.alert("Error", "No se pudo guardar el formulario.");
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setActiveStep((s) => Math.max(s - 1, 0));
  };

  const renderProgress = () => (
    <View style={styles.progressCard}>
      <Text style={styles.progressTitle}>Progreso del formulario</Text>

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
              activeOpacity={0.85}
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

  const renderGeneralStep = () => (
    <>
      <SectionBox
        title="Datos de la orden"
        subtitle="Información automática que se usará en el PDF."
      >
        <View style={styles.infoGrid}>
          <InfoItem label="Orden" value={auto?.orden || form?.orderid} />
          <InfoItem label="Cliente" value={auto?.cliente} />
          <InfoItem label="Equipo" value={auto?.equipo} />
          <InfoItem label="Técnico" value={auto?.tecnico_nombre} />
          <InfoItem label="Fecha orden" value={fmtSapDate(auto?.start_date)} />
        </View>
      </SectionBox>

      <SectionBox
        title="Configuración del reporte"
        subtitle="Datos generales del mantenimiento."
      >
        <Label>Tipo de reporte</Label>

        <View style={styles.chipsWrap}>
          <Chip
            active={form.tipo_reporte === "overhaul"}
            onPress={() => update({ tipo_reporte: "overhaul" })}
          >
            Overhaul
          </Chip>

          <Chip
            active={form.tipo_reporte === "ajuste_reparacion_sustitucion"}
            onPress={() =>
              update({ tipo_reporte: "ajuste_reparacion_sustitucion" })
            }
          >
            Ajuste / reparación / sustitución
          </Chip>
        </View>

        <FieldRow>
          <Field>
            <Label>Fecha del reporte</Label>
            <Input
              value={String(form.fecha ?? "")}
              onChangeText={(t) => update({ fecha: t })}
              placeholder="DD/MM/AAAA"
            />
          </Field>

          <Field small>
            <Label>Hora inicio</Label>
            <Input
              value={String(form.hora_inicio ?? "")}
              onChangeText={(t) => update({ hora_inicio: t })}
              placeholder="08:00"
            />
          </Field>

          <Field small>
            <Label>Hora fin</Label>
            <Input
              value={String(form.hora_fin ?? "")}
              onChangeText={(t) => update({ hora_fin: t })}
              placeholder="10:30"
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field small>
            <Label>Cantidad cables</Label>
            <Input
              keyboardType="numeric"
              value={String(form.cantidad_cables ?? 8)}
              onChangeText={(t) => update({ cantidad_cables: Number(t || 8) })}
              placeholder="8"
            />
          </Field>

          <Field small>
            <Label>Ø estándar mm</Label>
            <Input
              keyboardType="numeric"
              value={String(form.diametro_estandar_mm ?? "")}
              onChangeText={(t) =>
                update({ diametro_estandar_mm: t.replace(",", ".") })
              }
              placeholder="0.00"
            />
          </Field>

          <Field>
            <Label>Tiempo de uso</Label>
            <Input
              value={String(form.tiempo_uso_cables ?? "")}
              onChangeText={(t) => update({ tiempo_uso_cables: t })}
              placeholder="Ej. 2 años / 18 meses"
            />
          </Field>
        </FieldRow>
      </SectionBox>
    </>
  );

  const renderDiametrosStep = () => (
    <SectionBox
      title="Diámetros y desgaste por cable"
      subtitle="Captura las mediciones individuales. Puedes dejar campos vacíos y aun así ver el PDF."
    >
      <View style={styles.cablesWrap}>
        {(form.seccion_diametros || [])
          .slice(0, activeCableCount || 8)
          .map((row, idx) => (
            <CableCard
              key={`diametro-${row.cable_no}`}
              row={row}
              onChange={(patch) =>
                updateArrayItem("seccion_diametros", idx, patch)
              }
            />
          ))}
      </View>
    </SectionBox>
  );

  const renderRupturasStep = () => (
    <SectionBox
      title="Ruptura de alambres"
      subtitle="Activa solamente los cables donde se encontró ruptura."
    >
      {(form.seccion_rupturas || [])
        .slice(0, activeCableCount || 8)
        .map((r, idx) => (
          <View key={`ruptura-${r.cable_no}`} style={styles.ruptureCard}>
            <View style={styles.ruptureTop}>
              <View style={styles.cableNumberSmall}>
                <Text style={styles.cableNumberText}>{r.cable_no}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.ruptureTitle}>Cable {r.cable_no}</Text>
                <Text style={styles.ruptureHint}>Rupturas visibles por paso</Text>
              </View>

              <View style={styles.switchWrap}>
                <Text style={styles.switchText}>{r.hay ? "Sí" : "No"}</Text>
                <Toggle
                  value={r.hay}
                  onValueChange={(v) =>
                    updateArrayItem("seccion_rupturas", idx, { hay: v })
                  }
                />
              </View>
            </View>

            {r.hay && (
              <FieldRow>
                <Field small>
                  <Label>Rupturas</Label>
                  <Input
                    keyboardType="numeric"
                    value={String(r.rupturas_por_paso ?? "")}
                    onChangeText={(t) =>
                      updateArrayItem("seccion_rupturas", idx, {
                        rupturas_por_paso: t,
                      })
                    }
                    placeholder="0"
                  />
                </Field>

                <Field>
                  <Label>Posición en cabina</Label>
                  <Input
                    value={String(r.posicion_cabina ?? "")}
                    onChangeText={(t) =>
                      updateArrayItem("seccion_rupturas", idx, {
                        posicion_cabina: t,
                      })
                    }
                    placeholder="Ej. izquierda 2"
                  />
                </Field>

                <Field small>
                  <Label>Cambio</Label>
                  <View style={styles.inlineToggleBox}>
                    <Text style={styles.switchText}>{r.cambio ? "Sí" : "No"}</Text>
                    <Toggle
                      value={!!r.cambio}
                      onValueChange={(v) =>
                        updateArrayItem("seccion_rupturas", idx, {
                          cambio: v,
                        })
                      }
                    />
                  </View>
                </Field>
              </FieldRow>
            )}
          </View>
        ))}
    </SectionBox>
  );

  const renderHallazgosStep = () => (
    <>
      <SectionBox
        title="Longitud de desgaste"
        subtitle="Registra ubicación y longitud si aplica."
      >
        <View style={styles.questionCard}>
          <View>
            <Text style={styles.questionTitle}>¿Se detectó longitud de desgaste?</Text>
            <Text style={styles.questionHint}>Activa para capturar detalles.</Text>
          </View>

          <Toggle
            value={form.seccion_longitud?.encontrado}
            onValueChange={(v) =>
              update({
                seccion_longitud: {
                  ...(form.seccion_longitud || {}),
                  encontrado: v,
                },
              })
            }
          />
        </View>

        {form.seccion_longitud?.encontrado && (
          <FieldRow>
            <Field small>
              <Label>Cable #</Label>
              <Input
                keyboardType="numeric"
                value={String(form.seccion_longitud?.cable_no ?? "")}
                onChangeText={(t) =>
                  update({
                    seccion_longitud: {
                      ...(form.seccion_longitud || {}),
                      cable_no: t,
                    },
                  })
                }
                placeholder="1"
              />
            </Field>

            <Field>
              <Label>Posición cabina</Label>
              <Input
                value={String(form.seccion_longitud?.posicion_cabina ?? "")}
                onChangeText={(t) =>
                  update({
                    seccion_longitud: {
                      ...(form.seccion_longitud || {}),
                      posicion_cabina: t,
                    },
                  })
                }
                placeholder="Ej. derecha 1"
              />
            </Field>

            <Field small>
              <Label>Longitud mm</Label>
              <Input
                keyboardType="numeric"
                value={String(form.seccion_longitud?.longitud_mm ?? "")}
                onChangeText={(t) =>
                  update({
                    seccion_longitud: {
                      ...(form.seccion_longitud || {}),
                      longitud_mm: t.replace(",", "."),
                    },
                  })
                }
                placeholder="0"
              />
            </Field>
          </FieldRow>
        )}
      </SectionBox>

      <SectionBox title="Óxido" subtitle="Indica alcance y ubicación.">
        <View style={styles.questionCard}>
          <View>
            <Text style={styles.questionTitle}>¿Se detectó óxido?</Text>
            <Text style={styles.questionHint}>Activa si hay evidencia visual.</Text>
          </View>

          <Toggle
            value={form.seccion_oxido?.encontrado}
            onValueChange={(v) =>
              update({
                seccion_oxido: {
                  ...(form.seccion_oxido || {}),
                  encontrado: v,
                },
              })
            }
          />
        </View>

        {form.seccion_oxido?.encontrado && (
          <>
            <Label>Alcance</Label>

            <View style={styles.chipsWrap}>
              {[
                ["completo", "Recorrido completo"],
                ["parcial", "Parte del recorrido"],
                ["no", "No se encontró"],
              ].map(([value, label]) => (
                <Chip
                  key={value}
                  active={form.seccion_oxido?.alcance === value}
                  onPress={() =>
                    update({
                      seccion_oxido: {
                        ...(form.seccion_oxido || {}),
                        alcance: value,
                      },
                    })
                  }
                >
                  {label}
                </Chip>
              ))}
            </View>

            <FieldRow>
              <Field small>
                <Label>Cable #</Label>
                <Input
                  keyboardType="numeric"
                  value={String(form.seccion_oxido?.cable_no ?? "")}
                  onChangeText={(t) =>
                    update({
                      seccion_oxido: {
                        ...(form.seccion_oxido || {}),
                        cable_no: t,
                      },
                    })
                  }
                  placeholder="1"
                />
              </Field>

              <Field>
                <Label>Posición cabina</Label>
                <Input
                  value={String(form.seccion_oxido?.posicion_cabina ?? "")}
                  onChangeText={(t) =>
                    update({
                      seccion_oxido: {
                        ...(form.seccion_oxido || {}),
                        posicion_cabina: t,
                      },
                    })
                  }
                  placeholder="Ej. centro"
                />
              </Field>
            </FieldRow>
          </>
        )}
      </SectionBox>

      <SectionBox
        title="Tensión de cables"
        subtitle="Selecciona el estado observado."
      >
        <View style={styles.chipsWrap}>
          {[
            ["bien", "La tensión se encuentra bien", "green"],
            ["pendiente_corregir", "Mal, pendiente de corregir", "red"],
            ["corregido", "Mal, pero se corrige", "yellow"],
          ].map(([value, label, tone]) => (
            <Chip
              key={value}
              tone={tone}
              active={form.seccion_tension?.estado === value}
              onPress={() => update({ seccion_tension: { estado: value } })}
            >
              {label}
            </Chip>
          ))}
        </View>
      </SectionBox>

      <SectionBox
        title="Dobleces o deformaciones"
        subtitle="Registra el problema si se detecta."
      >
        <View style={styles.questionCard}>
          <View>
            <Text style={styles.questionTitle}>¿Se detectó problema?</Text>
            <Text style={styles.questionHint}>Activa para capturar detalle.</Text>
          </View>

          <Toggle
            value={form.seccion_deformaciones?.encontrado}
            onValueChange={(v) =>
              update({
                seccion_deformaciones: {
                  ...(form.seccion_deformaciones || {}),
                  encontrado: v,
                },
              })
            }
          />
        </View>

        {form.seccion_deformaciones?.encontrado && (
          <FieldRow>
            <Field small>
              <Label>Cable #</Label>
              <Input
                keyboardType="numeric"
                value={String(form.seccion_deformaciones?.cable_no ?? "")}
                onChangeText={(t) =>
                  update({
                    seccion_deformaciones: {
                      ...(form.seccion_deformaciones || {}),
                      cable_no: t,
                    },
                  })
                }
                placeholder="1"
              />
            </Field>

            <Field>
              <Label>Posición cabina</Label>
              <Input
                value={String(form.seccion_deformaciones?.posicion_cabina ?? "")}
                onChangeText={(t) =>
                  update({
                    seccion_deformaciones: {
                      ...(form.seccion_deformaciones || {}),
                      posicion_cabina: t,
                    },
                  })
                }
                placeholder="Ej. atrás"
              />
            </Field>

            <Field wide>
              <Label>Problema</Label>
              <Input
                value={String(form.seccion_deformaciones?.problema ?? "")}
                onChangeText={(t) =>
                  update({
                    seccion_deformaciones: {
                      ...(form.seccion_deformaciones || {}),
                      problema: t,
                    },
                  })
                }
                placeholder="Describe el problema"
              />
            </Field>
          </FieldRow>
        )}
      </SectionBox>

      <SectionBox
        title="Terminales de los cables"
        subtitle="Selecciona la condición de terminales."
      >
        <View style={styles.chipsWrap}>
          {[
            ["grietas", "Presenta grietas / daños", "red"],
            ["grasa", "Grasa negra en Metal Babbit", "yellow"],
            ["sin_anomalias", "Sin anomalías", "green"],
          ].map(([value, label, tone]) => (
            <Chip
              key={value}
              tone={tone}
              active={form.seccion_terminales?.estado === value}
              onPress={() => update({ seccion_terminales: { estado: value } })}
            >
              {label}
            </Chip>
          ))}
        </View>
      </SectionBox>
    </>
  );

  const renderResultadoStep = () => (
    <SectionBox
      title="Resultado total"
      subtitle="Define el dictamen final y agrega observaciones."
    >
      <Label>Dictamen</Label>

      <View style={styles.chipsWrap}>
        <Chip
          tone="green"
          active={!!form.resultado_total?.bien}
          onPress={() =>
            update({
              resultado_total: {
                ...(form.resultado_total || {}),
                bien: !form.resultado_total?.bien,
              },
            })
          }
        >
          Bien
        </Chip>

        <Chip
          tone="red"
          active={!!form.resultado_total?.cambio_inmediato}
          onPress={() =>
            update({
              resultado_total: {
                ...(form.resultado_total || {}),
                cambio_inmediato: !form.resultado_total?.cambio_inmediato,
              },
            })
          }
        >
          Cambio inmediato
        </Chip>

        <Chip
          tone="yellow"
          active={!!form.resultado_total?.programar_cambio}
          onPress={() =>
            update({
              resultado_total: {
                ...(form.resultado_total || {}),
                programar_cambio: !form.resultado_total?.programar_cambio,
              },
            })
          }
        >
          Programar cambio
        </Chip>
      </View>

      <Label style={{ marginTop: 18 }}>Tipos de problema</Label>

      <View style={styles.chipsWrap}>
        {[
          "diametro",
          "tension",
          "rupturas",
          "dobleces",
          "desgaste",
          "terminales",
          "oxido",
          "otros",
        ].map((opt) => {
          const active = form.resultado_total?.tipos_problema?.includes(opt);

          return (
            <Chip
              key={opt}
              active={active}
              onPress={() => {
                const cur = new Set(form.resultado_total?.tipos_problema || []);
                if (active) cur.delete(opt);
                else cur.add(opt);

                update({
                  resultado_total: {
                    ...(form.resultado_total || {}),
                    tipos_problema: Array.from(cur),
                  },
                });
              }}
            >
              {opt}
            </Chip>
          );
        })}
      </View>

      <Label style={{ marginTop: 18 }}>Detalle / observaciones</Label>

      <Input
        multiline
        style={styles.textArea}
        placeholder="Notas, observaciones, acciones realizadas..."
        value={String(form.resultado_total?.detalle ?? "")}
        onChangeText={(t) =>
          update({
            resultado_total: {
              ...(form.resultado_total || {}),
              detalle: t,
            },
          })
        }
      />

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={save}
        disabled={saving || generatingPdf}
        activeOpacity={0.9}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveBtnText}>Guardar formulario</Text>
        )}
      </TouchableOpacity>
    </SectionBox>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneralStep();
    if (activeStep === 1) return renderDiametrosStep();
    if (activeStep === 2) return renderRupturasStep();
    if (activeStep === 3) return renderHallazgosStep();
    return renderResultadoStep();
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={THEME.blue} />
        <Text style={styles.loadingTitle}>Cargando formulario</Text>
        <Text style={styles.loadingText}>Preparando datos de la orden…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Mantenimiento de cables" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>Formato técnico</Text>
              <Text style={styles.heroTitle}>Mantenimiento de cables</Text>
              <Text style={styles.heroText}>
                Llena el reporte por pasos. Puedes previsualizar el PDF aunque
                falten campos.
              </Text>
            </View>

            <View style={styles.pdfBadge}>
              <Text style={styles.pdfBadgeText}>Sin validación</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatBox label="Cables" value={activeCableCount || 8} />
            <StatBox label="Medidos" value={stats.medidos} tone="green" />
            <StatBox label="Rupturas" value={stats.conRuptura} tone="yellow" />
            <StatBox label="Peor cable" value={stats.peor} tone="red" />
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
            activeOpacity={0.85}
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
            activeOpacity={0.85}
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
          onPress={abrirPreviewPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          <Text style={styles.previewBtnText}>Vista previa</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={compartirPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.shareBtnText}>Compartir PDF</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={previewVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View>
                <Text style={styles.previewKicker}>Documento</Text>
                <Text style={styles.previewTitle}>Vista previa PDF</Text>
              </View>

              <TouchableOpacity
                style={styles.previewClose}
                onPress={() => setPreviewVisible(false)}
              >
                <Text style={styles.previewCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <WebView
              originWhitelist={["*"]}
              source={{ html: previewHtml }}
              style={styles.webview}
            />

            <View style={styles.previewFooter}>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={compartirPdf}
                disabled={generatingPdf}
                activeOpacity={0.9}
              >
                {generatingPdf ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.shareBtnText}>Compartir PDF</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  loadingScreen: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingTitle: {
    marginTop: 14,
    fontSize: 18,
    color: THEME.text,
    fontWeight: "900",
  },

  loadingText: {
    marginTop: 4,
    fontSize: 13,
    color: THEME.muted,
    fontWeight: "700",
  },

  content: {
    padding: 16,
    paddingBottom: 120,
  },

  hero: {
    backgroundColor: THEME.blue,
    borderRadius: 28,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },

  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
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
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 30,
  },

  heroText: {
    color: "#DBEAFE",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 8,
  },

  pdfBadge: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  pdfBadgeText: {
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
    minWidth: 72,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: "center",
  },

  statBlue: {
    backgroundColor: "rgba(255,255,255,0.13)",
  },

  statGreen: {
    backgroundColor: "rgba(22,163,74,0.26)",
  },

  statYellow: {
    backgroundColor: "rgba(245,158,11,0.26)",
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
    marginTop: 14,
    backgroundColor: THEME.card,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },

  progressTitle: {
    color: THEME.text,
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
    backgroundColor: THEME.cardSoft,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 130,
  },

  stepItemActive: {
    backgroundColor: THEME.blueSoft,
    borderColor: "#93C5FD",
  },

  stepItemDone: {
    backgroundColor: THEME.greenSoft,
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
    backgroundColor: THEME.blue,
  },

  stepNumberDone: {
    backgroundColor: THEME.green,
  },

  stepNumberText: {
    color: THEME.muted,
    fontSize: 12,
    fontWeight: "900",
  },

  stepNumberTextActive: {
    color: "#FFFFFF",
  },

  stepName: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: "900",
  },

  stepNameActive: {
    color: THEME.blue,
  },

  stepNameDone: {
    color: THEME.green,
  },

  stepShort: {
    color: THEME.muted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 1,
  },

  activeStepHeader: {
    marginTop: 16,
    marginBottom: 8,
  },

  activeStepSmall: {
    color: THEME.blue2,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  activeStepTitle: {
    color: THEME.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 2,
  },

  sectionBox: {
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },

  sectionTop: {
    marginBottom: 14,
  },

  sectionTitle: {
    color: THEME.text,
    fontSize: 17,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: THEME.muted,
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
    backgroundColor: THEME.cardSoft,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },

  infoLabel: {
    color: THEME.muted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 5,
  },

  infoValue: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },

  label: {
    color: THEME.muted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    minHeight: 45,
    color: THEME.text,
    fontSize: 14,
    fontWeight: "800",
  },

  textArea: {
    minHeight: 125,
    paddingTop: 12,
    textAlignVertical: "top",
  },

  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 11,
    marginTop: 12,
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
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },

  chipBlue: {
    backgroundColor: THEME.blue,
    borderColor: THEME.blue,
  },

  chipGreen: {
    backgroundColor: THEME.green,
    borderColor: THEME.green,
  },

  chipYellow: {
    backgroundColor: THEME.yellow,
    borderColor: THEME.yellow,
  },

  chipRed: {
    backgroundColor: THEME.red,
    borderColor: THEME.red,
  },

  chipText: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: "900",
  },

  chipTextActive: {
    color: "#FFFFFF",
  },

  cablesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  cableCard: {
    flexGrow: 1,
    flexBasis: "48%",
    minWidth: 270,
    backgroundColor: THEME.cardSoft,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 20,
    padding: 13,
  },

  cableCardWorst: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FBBF24",
  },

  cableTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  cableNumber: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: THEME.blue,
    alignItems: "center",
    justifyContent: "center",
  },

  cableNumberSmall: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: THEME.blue,
    alignItems: "center",
    justifyContent: "center",
  },

  cableNumberText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
  },

  cableTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "900",
  },

  cableHint: {
    color: THEME.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },

  percentPill: {
    minWidth: 58,
    alignItems: "center",
    backgroundColor: THEME.blueSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  percentWorst: {
    backgroundColor: THEME.yellowSoft,
  },

  percentText: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: "900",
  },

  cardToggleRow: {
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },

  toggleTitle: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: "900",
  },

  toggleHint: {
    color: THEME.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },

  ruptureCard: {
    backgroundColor: THEME.cardSoft,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 20,
    padding: 13,
    marginBottom: 10,
  },

  ruptureTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  ruptureTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "900",
  },

  ruptureHint: {
    color: THEME.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },

  switchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  switchText: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: "900",
  },

  inlineToggleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 45,
  },

  questionCard: {
    backgroundColor: THEME.cardSoft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },

  questionTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "900",
  },

  questionHint: {
    color: THEME.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  saveBtn: {
    backgroundColor: THEME.text,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    marginTop: 18,
  },

  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
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
    borderColor: THEME.blue,
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 14,
  },

  navBtnPrimary: {
    flex: 1,
    backgroundColor: THEME.blue,
    borderWidth: 1,
    borderColor: THEME.blue,
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 14,
  },

  navBtnDisabled: {
    opacity: 0.45,
  },

  navBtnText: {
    color: THEME.blue,
    fontSize: 14,
    fontWeight: "900",
  },

  navBtnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  navBtnTextDisabled: {
    color: THEME.muted,
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
    borderTopColor: THEME.border,
  },

  previewBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: THEME.blue,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },

  previewBtnText: {
    color: THEME.blue,
    fontSize: 14,
    fontWeight: "900",
  },

  shareBtn: {
    flex: 1,
    backgroundColor: THEME.blue,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
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

  previewCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    overflow: "hidden",
  },

  previewHeader: {
    backgroundColor: THEME.blue,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  previewKicker: {
    color: "#BFDBFE",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  previewTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 1,
  },

  previewClose: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
  },

  previewCloseText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  previewFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
});