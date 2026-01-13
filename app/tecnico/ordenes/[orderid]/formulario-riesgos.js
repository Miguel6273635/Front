// app/tecnico/ordenes/[orderid]/formulario-riesgos.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Platform,
} from "react-native";
import Header from "../../../../src/components/Header";
import { useLocalSearchParams, router } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { Dropdown } from "react-native-element-dropdown";
import Signature from "react-native-signature-canvas";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";

import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking } from "react-native";

import {
  AREAS_TRABAJO,
  RIESGOS_POSIBLES,
} from "../../../../src/constants/catalogosRiesgos";
import { subirPdfOrden } from "../../../../src/services/riesgosSap";
import { buildTbmkyHtml } from "../../../../src/services/tbmkyPdfTemplate";

// ===== Paleta Fiori / Horizon =====
const FIORI = {
  pageBg: "#F5F7FB",
  cardBg: "#FFFFFF",
  cardSoft: "#F8FAFF",
  border: "#D0D7E2",
  borderStrong: "#BCC5D6",
  ink: "#0B1F3B",
  text: "#1F2933",
  textMuted: "#6B7280",
  accent: "#0A6ED1",
  accentSoft: "#E3F2FD",
  danger: "#E74C3C",
  warning: "#F59E0B",
  success: "#16A34A",
};

// ===== Listas locales (síntomas y EPP) =====
const sintomasIniciales = [
  "Dolor de cabeza",
  "Vértigo, zumbidos en la oreja",
  "Manos o pies temblorosos",
  "Fiebre",
  "Somnolencia",
  "Indigestión/diarrea",
];

const EPP_LIST = [
  "UNIFORME",
  "CASCO",
  "BARBIQUEJO",
  "LAMPARA",
  "POLVO",
  "LENTES",
  "BOTAS",
  "TAPONES",
  "SIST. ANTICAIDAS",
  "SOLDAR",
  "ANTICORTE",
  "NYLON",
  "NITRILO",
  "CARNAZA",
  "FAJA",
  "MOSQUETON",
  "BLOCK STOP",
  "L. VIDA VERTICAL",
];

const EPP_ICONS_MDI = {
  UNIFORME: "tshirt-crew-outline",
  CASCO: "account-hard-hat",
  BARBIQUEJO: "face-mask",
  LAMPARA: "alarm-light-outline",
  POLVO: "face-mask-outline",
  LENTES: "safety-goggles",
  BOTAS: "shoe-print",
  TAPONES: "ear-hearing",
  "SIST. ANTICAIDAS": "run-fast",
  SOLDAR: "racing-helmet",
  ANTICORTE: "hand-back-right-outline",
  NYLON: "hand-clap",
  NITRILO: "beaker-outline",
  CARNAZA: "hand-back-left-outline",
  FAJA: "human-handsdown",
  MOSQUETON: "link",
  "BLOCK STOP": "stop-circle-outline",
  "L. VIDA VERTICAL": "tune-vertical",
};
const getMdiIconName = (key) => EPP_ICONS_MDI[key] || "help-circle-outline";

const EQUIPOS = [
  { id: "elevadores", label: "Elevadores", icon: "elevator-passenger" },
  { id: "escaleras", label: "Escaleras", icon: "ladder" },
  { id: "oficinas", label: "Oficinas", icon: "office-building" },
  { id: "almacen", label: "Almacén / C. Herramientas", icon: "warehouse" },
];

export default function FormularioRiesgosScreen() {
  // ✅ IMPORTANTE: por tu estructura, a veces viene como { id } y a veces como { orderid }
  const params = useLocalSearchParams();
  const orderid = String(params.orderid ?? params.id ?? "");

  const { user, ensureValidToken } = useAuth();


  const [paso, setPaso] = useState(1);

  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState(null);

  const [fecha, setFecha] = useState("");
  const [rutinaria, setRutinaria] = useState(false);

  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null);

  const [trabajadores, setTrabajadores] = useState([
    { nombre: "", cargo: "", nomina: "" },
    { nombre: "", cargo: "", nomina: "" },
  ]);

  const [centroTrabajo, setCentroTrabajo] = useState("");
  const [selectedArea, setSelectedArea] = useState(null);
  const [jefeInmediato, setJefeInmediato] = useState("");
  const [actividadDia, setActividadDia] = useState("");

  const [sintomas, setSintomas] = useState([]);
  const [eppSeleccionado, setEppSeleccionado] = useState({});
  const [herramientas, setHerramientas] = useState("");

  // ✅ Catálogos locales (no BD)
  const [riesgosBD] = useState(RIESGOS_POSIBLES);
  const [riesgosSeleccionadosIds, setRiesgosSeleccionadosIds] = useState([]);

  const [topSeleccionIds, setTopSeleccionIds] = useState([null, null, null]);
  const [riesgosTopText, setRiesgosTopText] = useState(["", "", ""]);
  const [causasTop, setCausasTop] = useState(["", "", ""]);
  const [medidasTop, setMedidasTop] = useState([
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
  ]);
  const [acciones, setAcciones] = useState(["", "", ""]);

  const [firmaTecnico, setFirmaTecnico] = useState(null);
  const [firmaSupervisor, setFirmaSupervisor] = useState(null);

  const [saving, setSaving] = useState(false);

  // PDF local
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfLocalUri, setPdfLocalUri] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const esRutinaria = (orderType) => ["Z1", "Z2", "Z3"].includes(orderType || "");
  const toBase64 = (data) => (data || "").replace(/^data:image\/\w+;base64,/, "");
  const toDataUrl = (b64) => `data:image/png;base64,${b64}`;
  const sanitize = (s) => (s || "").replace(/\s/g, "");

  const [modalFirma, setModalFirma] = useState({ open: false, tipo: null });
  const signatureCss = `
    .m-signature-pad { box-shadow: none; border: 0; }
    .m-signature-pad--body { border: 1px solid #e5e7eb; }
    .m-signature-pad--footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .m-signature-pad--footer .button { background: ${FIORI.accent}; color: #fff; border: 0; border-radius: 8px; padding: 8px 12px; }
    .m-signature-pad--footer .button.clear { background: #6b7280; }
  `;

  // Áreas locales
  const areaOptions = useMemo(
    () => AREAS_TRABAJO.map((a) => ({ label: a.label, value: a.id })),
    []
  );

  // ✅ Cargar SOLO SAP (BTP) — CORREGIDO (param + llaves)
  useEffect(() => {
    let alive = true;

    const loadAll = async () => {
      try {
        setLoading(true);

        console.log("[RIESGOS] params:", params);
        console.log("[RIESGOS] orderid:", orderid);

        if (!orderid) {
          Alert.alert("Error", "No se recibió orderid en la ruta.");
          return;
        }

        // ✅ OJO: tu backend está bajo /api/...
        const sapRes = await api.get(`/api/ordenes/sap/${orderid}`);
        const ord = sapRes?.data || null;

        console.log("[RIESGOS] sapRes.data:", ord);

        if (!alive) return;

        setOrden(ord);
        setCentroTrabajo("TLP1");

        const startIso =
          ord?.StartDate || ord?.start_date || ord?.Startdate || ord?.startDate;
        const startDate = startIso ? new Date(startIso) : new Date();
        theDateFormatter(setFecha, startDate);

        const ot = String(
          ord?.order_type || ord?.OrderType || ord?.orderType || ""
        ).trim();
        setRutinaria(esRutinaria(ot));

        setTrabajadores((prev) => {
          const copia = [...prev];
          copia[0] = {
            nombre:
              ord?.tecnico_nombre ||
              ord?.nombre ||
              user?.nombre ||
              user?.name ||
              "",
            cargo:
              ord?.tecnico_cargo || user?.puesto || user?.rol || "Técnico",
            nomina:
              ord?.tecnico_nomina ||
              ord?.nomina ||
              user?.nomina ||
              user?.no_nomina ||
              "",
          };
          return copia;
        });
      } catch (err) {
        console.error("Error cargando SAP:", err?.response?.data || err);
        Alert.alert("Error", "No se pudieron cargar los datos de SAP.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadAll();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderid]);

  // Toggles
  const toggleSintoma = (sintoma) => {
    setSintomas((prev) =>
      prev.includes(sintoma)
        ? prev.filter((s) => s !== sintoma)
        : [...prev, sintoma]
    );
  };

  const toggleEppCampo = (item, campo) => {
    setEppSeleccionado((prev) => {
      const actual = prev[item] || { M: false, A: false };
      return { ...prev, [item]: { ...actual, [campo]: !actual[campo] } };
    });
  };

  const toggleRiesgo = (id) => {
    setRiesgosSeleccionadosIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const opcionesTop1 = useMemo(
    () =>
      riesgosBD
        .filter((r) => riesgosSeleccionadosIds.includes(r.id))
        .map((r) => ({ label: r.riesgo, value: r.id })),
    [riesgosBD, riesgosSeleccionadosIds]
  );

  const opcionesTop2 = useMemo(() => {
    const usados = new Set([topSeleccionIds[0]].filter(Boolean));
    return riesgosBD
      .filter((r) => riesgosSeleccionadosIds.includes(r.id) && !usados.has(r.id))
      .map((r) => ({ label: r.riesgo, value: r.id }));
  }, [riesgosBD, riesgosSeleccionadosIds, topSeleccionIds]);

  const opcionesTop3 = useMemo(() => {
    const usados = new Set(
      [topSeleccionIds[0], topSeleccionIds[1]].filter(Boolean)
    );
    return riesgosBD
      .filter((r) => riesgosSeleccionadosIds.includes(r.id) && !usados.has(r.id))
      .map((r) => ({ label: r.riesgo, value: r.id }));
  }, [riesgosBD, riesgosSeleccionadosIds, topSeleccionIds]);

  useEffect(() => {
    setTopSeleccionIds((prev) =>
      prev.map((v) => (v && !riesgosSeleccionadosIds.includes(v) ? null : v))
    );
  }, [riesgosSeleccionadosIds]);

  const aplicarTop = () => {
    if (!topSeleccionIds[0] || !topSeleccionIds[1] || !topSeleccionIds[2]) {
      Alert.alert("TOP 3 incompleto", "Elige TOP 1, TOP 2 y TOP 3 (sin repetir).");
      return;
    }

    const nombres = topSeleccionIds.map(
      (id) => riesgosBD.find((x) => x.id === id)?.riesgo || ""
    );

    setCausasTop((prev) =>
      prev.map((c, i) => (riesgosTopText[i] !== nombres[i] ? "" : c))
    );
    setMedidasTop((prev) =>
      prev.map((fila, i) =>
        riesgosTopText[i] !== nombres[i] ? ["", "", ""] : fila
      )
    );
    setAcciones((prev) =>
      prev.map((a, i) => (riesgosTopText[i] !== nombres[i] ? "" : a))
    );

    setRiesgosTopText(nombres);
    Alert.alert("TOP 3 aplicado", "Los riesgos TOP se colocaron en los campos de abajo.");
  };

  const autollenarTopDesdeSeleccionados = () => {
    if (riesgosSeleccionadosIds.length < 3) {
      Alert.alert(
        "Selecciona riesgos",
        "Marca al menos 3 riesgos en 'Riesgos presentes'."
      );
      return;
    }
    setTopSeleccionIds([
      riesgosSeleccionadosIds[0],
      riesgosSeleccionadosIds[1],
      riesgosSeleccionadosIds[2],
    ]);
  };

  // -------------------------
  // ✅ PDF LOCAL: generar + base64 (FIX: intentamos base64 directo, y fallback a leer archivo)
  // -------------------------
  const generarPdfLocalYBase64 = async (payload) => {
    const html = buildTbmkyHtml(payload);
    const safeFecha = String(payload.fecha || "").replace(/[^0-9-]/g, "");
    const fileName = `TBMKY_${payload.orderid}_${safeFecha}.pdf`;

    // ✅ En Expo, Print puede devolver base64 directo.
    const { uri, base64 } = await Print.printToFileAsync({
      html,
      base64: true,
    });

    // Copiamos a documentDirectory para tenerlo estable
    const dest = `${FileSystem.documentDirectory}${fileName}`;
    let finalUri = uri;
    try {
      await FileSystem.copyAsync({ from: uri, to: dest });
      finalUri = dest;
    } catch {
      // si no deja copiar, usamos el uri original
    }

    // Si base64 viene vacío por alguna razón, hacemos fallback
    let finalBase64 = base64;
    if (!finalBase64) {
      finalBase64 = await leerPdfBase64(finalUri);
    }

    return { uri: finalUri, base64: finalBase64, fileName };
  };

  const leerPdfBase64 = async (localUri) => {
    // ✅ FIX: no dependemos de FileSystem.EncodingType.Base64
    const b64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: "base64",
    });
    return b64;
  };

  // -------------------------
  // PDF acciones (abrir/compartir)
  // -------------------------
  const openPdfModal = () => setShowPdfModal(true);
  const closePdfModal = () => setShowPdfModal(false);

  const abrirPdfEnVisor = async () => {
    try {
      if (!pdfLocalUri) return Alert.alert("Sin PDF", "Primero genera el PDF.");
      setDownloadingPdf(true);

      if (Platform.OS === "android") {
        const contentUri = await FileSystem.getContentUriAsync(pdfLocalUri);
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          flags: 1,
          type: "application/pdf",
        });
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare)
        await Sharing.shareAsync(pdfLocalUri, { mimeType: "application/pdf" });
      else await Linking.openURL(pdfLocalUri);
    } catch (e) {
      console.error(e);
      Alert.alert("No se pudo abrir", "Instala un visor de PDF (Adobe/Drive/etc).");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const compartirPdf = async () => {
    try {
      if (!pdfLocalUri) return Alert.alert("Sin PDF", "Primero genera el PDF.");
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare)
        return Alert.alert("No disponible", "Compartir no está disponible.");
      await Sharing.shareAsync(pdfLocalUri, { mimeType: "application/pdf" });
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo compartir el PDF.");
    }
  };

  // ✅ Cambiar estatus a EN PROCESO (0200) y quitar PENDIENTE (0100)
  /*const cambiarStatusEnProceso = async (orderId) => {
  const payloadSap = {
    OrderId: String(orderId),
    WorkOrderHeader: { Orderid: String(orderId) },
    WorkOrderUserStatusSet: [
      { UserStText: "0200", Langu: "ES", Inactive: "" },  // EN PROCESO
      { UserStText: "0100", Langu: "ES", Inactive: "X" }, // quitar PENDIENTE
    ],
    Return: [],
  };

  await api.post(
    `/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet?sap-client=400&sap-language=ES`,
    payloadSap,
    { headers: { "Content-Type": "application/json" } }
  );
};
*/

  // -------------------------
  // ✅ FINAL: Guardar + PDF + SAP
  // -------------------------
  const onGuardarYGenerarPdf = async () => {
    if (saving) return;

    if (!equipoSeleccionado)
      return Alert.alert("Falta información", "Selecciona el tipo de equipo.");
    if (!centroTrabajo.trim())
      return Alert.alert("Falta información", "Centro de trabajo vacío.");
    if (!selectedArea)
      return Alert.alert("Falta información", "Selecciona el área de trabajo.");

    // ✅ Validación mínima de TOP 3 (porque SAP luego rechaza docs incompletos)
    if (!riesgosTopText?.[0] || !riesgosTopText?.[1] || !riesgosTopText?.[2]) {
      return Alert.alert("TOP 3 incompleto", "Selecciona y aplica TOP 1, TOP 2 y TOP 3.");
    }

    // ✅ (opcional) exigir firma técnico
    if (!firmaTecnico) {
      return Alert.alert("Falta firma", "Captura la firma del técnico.");
    }

    try {
      setSaving(true);

      const selectedAreaLabel =
        areaOptions.find((a) => a.value === selectedArea)?.label || "";

      const payload = {
        orderid: orden?.Orderid || orden?.orderid || orderid,
        fecha,
        centroTrabajo: "TLP1",
        selectedAreaLabel,
        jefeInmediato,
        actividadDia,
        rutinaria,

        equipoId: equipoSeleccionado,
        equipoSeleccionado,

        trabajadores,
        sintomas,
        eppSeleccionado,

        herramientas,

        riesgosSeleccionadosIds,
        riesgosBD,

        riesgosTopText,
        causasTop,
        medidasTop,
        acciones,

        firmaTecnico,
        firmaSupervisor,

        // Extra por si tu template los usa:
        equipment: orden?.Equipment || orden?.equipment || "",
        razon_social: orden?.razon_social || orden?.partner_name || "",
        direccion: orden?.direccion || orden?.partner_address || "",
        order_type: orden?.order_type || orden?.OrderType || "",
      };

      // 1) Generar PDF (uri + base64)
      const { uri: localUri, base64: base64Pdf, fileName } =
        await generarPdfLocalYBase64(payload);

      setPdfLocalUri(localUri);

      console.log("[TBMKY] PDF uri:", localUri);
      console.log("[TBMKY] fileName:", fileName);
      console.log("[TBMKY] base64 length:", base64Pdf?.length || 0);

      if (!base64Pdf || String(base64Pdf).trim().length < 200) {
        throw new Error("Base64 del PDF vacío o demasiado corto.");
      }

      /// 2) Enviar PDF a SAP (y que el backend cambie estatus + adjunte)
      let respSubmit;
      try {
        const ok = await ensureValidToken?.();
        if (ok === false) throw new Error("Token inválido");

        respSubmit = await subirPdfOrden({
          orderId: payload.orderid,
          pdfBase64: String(base64Pdf).trim(),
          fileName,
        });
      } catch (sendErr) {
        console.log("[TBMKY] enviar submit error:", sendErr?.response?.data || sendErr);
        Alert.alert(
          "Guardado local",
          `Se generó el PDF, pero no se pudo enviar a SAP para la orden #${payload.orderid}. Intenta más tarde.`
        );
        return;
      }

      // ✅ Si el endpoint respondió ok, significa: status + attachment se intentaron
      if (!respSubmit?.ok) {
        console.log("[TBMKY] submit no-ok:", respSubmit);
        Alert.alert(
          "Guardado local",
          `Se generó el PDF, pero SAP no confirmó el envío para la orden #${payload.orderid}.`
        );
        return;
      }

      // ✅ LISTO: ya cambió a 0200 y adjuntó PDF (lo hace tu backend)
      Alert.alert(
        "Listo",
        `TBM/KY enviado a SAP ✅\nEstatus actualizado a EN PROCESO (0200) para la orden #${payload.orderid}.`,
        [
          { text: "Opciones de PDF", onPress: openPdfModal },
          { text: "Ir a órdenes", onPress: () => router.replace("/tecnico/ordenes") },
        ]
      );

    } catch (e) {
      console.error("TBMKY error:", e?.response?.data || e);
      Alert.alert("Error", "No se pudo completar el proceso (PDF/SAP/estatus).");
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: FIORI.pageBg }}>
        <Header title="Predicción de riesgos (TBM/KY)" />
        <ActivityIndicator
          style={{ marginTop: 40 }}
          size="large"
          color={FIORI.accent}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: FIORI.pageBg }}>
      <Header title="Predicción de riesgos (TBM/KY)" />

      {/* Stepper */}
      <View style={styles.stepper}>
        {[1, 2, 3, 4].map((n) => {
          const active = paso === n;
          const done = paso > n;
          return (
            <View key={n} style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  active && styles.stepCircleActive,
                  done && styles.stepCircleDone,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.stepCircleText,
                      (active || done) && styles.stepCircleTextActive,
                    ]}
                  >
                    {n}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  active && styles.stepLabelActive,
                  done && styles.stepLabelDone,
                ]}
              >
                Paso {n}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Encabezado */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.pill}>
              <Ionicons name="document-text-outline" size={14} color={FIORI.accent} />
              <Text style={styles.pillText}>Orden {orden?.Orderid || orderid}</Text>
            </View>

            <View style={[styles.badge, rutinaria ? styles.badgeOk : styles.badgeWarn]}>
              <Text style={styles.badgeText}>
                {rutinaria ? "RUTINARIA" : "NO RUTINARIA"}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 8, gap: 4 }}>
            <HeaderRow label="Fecha" value={fecha} />
            <HeaderRow label="Equipo SAP" value={orden?.Equipment || orden?.equipment || "—"} />
            <HeaderRow
              label="Razón social"
              value={orden?.razon_social || orden?.partner_name || "—"}
              multiline
            />
            <HeaderRow
              label="Dirección"
              value={orden?.direccion || orden?.partner_address || "—"}
              multiline
            />
            <HeaderRow label="Tipo orden" value={orden?.order_type || orden?.OrderType || "—"} />
          </View>

          {!!pdfLocalUri && (
            <TouchableOpacity
              style={[
                styles.smallBtn,
                { backgroundColor: FIORI.accent, marginTop: 10, alignSelf: "flex-start" },
              ]}
              onPress={openPdfModal}
            >
              <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                Opciones de PDF
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* PASO 1 */}
        {paso === 1 && (
          <View>
            <SectionTitle title="1. Identificación del área de trabajo" />

            <SectionSubTitle text="Tipo de equipo" />
            <View style={styles.equiposGrid}>
              {EQUIPOS.map((eq) => {
                const active = equipoSeleccionado === eq.id;
                return (
                  <TouchableOpacity
                    key={eq.id}
                    style={[styles.equipoTile, active && styles.equipoTileActive]}
                    onPress={() => setEquipoSeleccionado(eq.id)}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons
                      name={eq.icon}
                      size={24}
                      color={active ? "#fff" : FIORI.ink}
                    />
                    <Text style={[styles.equipoText, active && styles.equipoTextActive]}>
                      {eq.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <SectionSubTitle text="Técnico asignado (no editable)" />
            <View style={styles.card}>
              <LabeledInput label="Nombre" value={trabajadores[0].nombre} editable={false} />
              <LabeledInput label="Cargo" value={trabajadores[0].cargo || "Técnico"} editable={false} />
              <LabeledInput label="Nómina" value={trabajadores[0].nomina} editable={false} />
              <LabeledInput label="Fecha" value={fecha} editable={false} />
            </View>

            <SectionSubTitle text="Técnico 2 (opcional)" />
            <View style={styles.card}>
              <LabeledInput
                label="Nombre"
                value={trabajadores[1].nombre}
                onChangeText={(v) => {
                  const copia = [...trabajadores];
                  copia[1].nombre = v;
                  setTrabajadores(copia);
                }}
              />
              <LabeledInput
                label="Cargo"
                value={trabajadores[1].cargo}
                onChangeText={(v) => {
                  const copia = [...trabajadores];
                  copia[1].cargo = v;
                  setTrabajadores(copia);
                }}
              />
              <LabeledInput
                label="Nómina"
                value={trabajadores[1].nomina}
                onChangeText={(v) => {
                  const copia = [...trabajadores];
                  copia[1].nomina = v;
                  setTrabajadores(copia);
                }}
              />
            </View>

            <SectionSubTitle text="Datos del área" />
            <LabeledInput label="Centro de trabajo" value={centroTrabajo || "TLP1"} editable={false} />

            <Text style={styles.fieldLabel}>Área de trabajo</Text>
            <Dropdown
              style={styles.dropdown}
              data={areaOptions}
              labelField="label"
              valueField="value"
              placeholder="Seleccionar área..."
              value={selectedArea}
              onChange={(item) => setSelectedArea(item.value)}
            />

            <LabeledInput label="Jefe inmediato" value={jefeInmediato} onChangeText={setJefeInmediato} />
            <LabeledInput
              label="Actividad del día"
              value={actividadDia}
              onChangeText={setActividadDia}
              multiline
              height={80}
            />
          </View>
        )}

        {/* PASO 2 */}
        {paso === 2 && (
          <View>
            <SectionTitle title="2. Chequeo individual de salud y EPP" />

            <SectionSubTitle text="Chequeo individual de salud" />
            <View style={styles.card}>
              {sintomasIniciales.map((s) => (
                <TouchableOpacity key={s} style={styles.checkboxRow} onPress={() => toggleSintoma(s)}>
                  <Ionicons
                    name={sintomas.includes(s) ? "checkbox" : "square-outline"}
                    size={20}
                    color={FIORI.accent}
                  />
                  <Text style={styles.checkboxLabel}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <SectionSubTitle text="Equipo de protección personal (EPP)" />
            <View style={styles.eppGrid}>
              {EPP_LIST.map((epp) => {
                const iconName = getMdiIconName(epp);
                return (
                  <View key={epp} style={styles.eppItem}>
                    <View style={styles.eppHeader}>
                      <MaterialCommunityIcons
                        name={iconName}
                        size={18}
                        color={FIORI.ink}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.eppLabel}>{epp}</Text>
                    </View>

                    <View style={styles.eppButtons}>
                      <TouchableOpacity
                        style={[styles.eppBox, eppSeleccionado[epp]?.M && styles.eppBoxOnM]}
                        onPress={() => toggleEppCampo(epp, "M")}
                      >
                        <MaterialCommunityIcons
                          name={eppSeleccionado[epp]?.M ? "check-circle" : "circle-outline"}
                          size={16}
                          color={eppSeleccionado[epp]?.M ? "#fff" : FIORI.accent}
                        />
                        <Text style={[styles.eppBoxText, eppSeleccionado[epp]?.M && styles.eppBoxTextOn]}>
                          M
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.eppBox, eppSeleccionado[epp]?.A && styles.eppBoxOnA]}
                        onPress={() => toggleEppCampo(epp, "A")}
                      >
                        <MaterialCommunityIcons
                          name={eppSeleccionado[epp]?.A ? "check-circle" : "circle-outline"}
                          size={16}
                          color={eppSeleccionado[epp]?.A ? "#fff" : FIORI.warning}
                        />
                        <Text style={[styles.eppBoxText, eppSeleccionado[epp]?.A && styles.eppBoxTextOn]}>
                          A
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>

            <LabeledInput
              label="Herramientas especiales"
              value={herramientas}
              onChangeText={setHerramientas}
              multiline
              height={60}
            />
          </View>
        )}

        {/* PASO 3 */}
        {paso === 3 && (
          <View>
            <SectionTitle title="3. Análisis de riesgos" />

            <SectionSubTitle text="Round 1: Riesgos presentes" />
            <View style={styles.card}>
              {riesgosBD.map((r) => (
                <TouchableOpacity key={r.id} style={styles.checkboxRow} onPress={() => toggleRiesgo(r.id)}>
                  <Ionicons
                    name={riesgosSeleccionadosIds.includes(r.id) ? "checkbox" : "square-outline"}
                    size={20}
                    color={FIORI.accent}
                  />
                  <Text style={styles.checkboxLabel}>{r.riesgo}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <SectionSubTitle text="Round 2: Seleccionar TOP 3" />
            <View style={styles.card}>
              <View style={styles.topActionsRow}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: FIORI.borderStrong }]}
                  onPress={autollenarTopDesdeSeleccionados}
                >
                  <Text style={[styles.smallBtnText, { color: FIORI.ink }]}>
                    Autollenar primeros 3
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                  onPress={aplicarTop}
                >
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                    Aplicar TOP 3
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.miniLabel}>TOP 1</Text>
              <Dropdown
                style={styles.dropdown}
                data={opcionesTop1}
                labelField="label"
                valueField="value"
                placeholder="Elige riesgo TOP 1"
                value={topSeleccionIds[0]}
                onChange={(item) => setTopSeleccionIds([item.value, topSeleccionIds[1], topSeleccionIds[2]])}
              />

              <Text style={styles.miniLabel}>TOP 2</Text>
              <Dropdown
                style={styles.dropdown}
                data={opcionesTop2}
                labelField="label"
                valueField="value"
                placeholder="Elige riesgo TOP 2"
                value={topSeleccionIds[1]}
                onChange={(item) => setTopSeleccionIds([topSeleccionIds[0], item.value, topSeleccionIds[2]])}
              />

              <Text style={styles.miniLabel}>TOP 3</Text>
              <Dropdown
                style={styles.dropdown}
                data={opcionesTop3}
                labelField="label"
                valueField="value"
                placeholder="Elige riesgo TOP 3"
                value={topSeleccionIds[2]}
                onChange={(item) => setTopSeleccionIds([topSeleccionIds[0], topSeleccionIds[1], item.value])}
              />
            </View>

            <SectionSubTitle text="Round 3: Causas y medidas de control" />
            {riesgosTopText.map((r, i) => (
              <View key={i} style={styles.card}>
                <Text style={styles.cardTitle}>TOP {i + 1} — {r || "Sin seleccionar"}</Text>

                <LabeledInput
                  label="¿Por qué puede pasar?"
                  value={causasTop[i]}
                  onChangeText={(v) => {
                    const nuevo = [...causasTop];
                    nuevo[i] = v;
                    setCausasTop(nuevo);
                  }}
                  multiline
                />

                <Text style={styles.miniLabel}>Medidas de control</Text>
                {[0, 1, 2].map((idxM) => (
                  <TextInput
                    key={idxM}
                    placeholder={`Medida ${idxM + 1}`}
                    style={styles.input}
                    value={medidasTop[i][idxM]}
                    onChangeText={(v) => {
                      const m = medidasTop.map((fila) => [...fila]);
                      m[i][idxM] = v;
                      setMedidasTop(m);
                    }}
                  />
                ))}
              </View>
            ))}

            <SectionSubTitle text="Round 4: Acciones a realizar (1 por riesgo TOP)" />
            {acciones.map((a, i) => (
              <LabeledInput
                key={i}
                label={`Acción para TOP ${i + 1}`}
                value={acciones[i]}
                onChangeText={(v) => {
                  const nuevo = [...acciones];
                  nuevo[i] = v;
                  setAcciones(nuevo);
                }}
                multiline
              />
            ))}
          </View>
        )}

        {/* PASO 4 */}
        {paso === 4 && (
          <View>
            <SectionTitle title="4. Compromisos y firmas" />

            <SectionSubTitle text="Firma del técnico" />
            <View style={styles.card}>
              <View style={styles.firmaBox}>
                {firmaTecnico ? (
                  <Image
                    source={{ uri: toDataUrl(firmaTecnico) }}
                    style={styles.firmaPreview}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: FIORI.textMuted }}>Sin firma</Text>
                )}
              </View>

              <View style={styles.firmaBtnRow}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                  onPress={() => setModalFirma({ open: true, tipo: "tecnico" })}
                >
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>Firmar</Text>
                </TouchableOpacity>
                {firmaTecnico && (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: "#6b7280" }]}
                    onPress={() => setFirmaTecnico(null)}
                  >
                    <Text style={[styles.smallBtnText, { color: "#fff" }]}>Borrar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <SectionSubTitle text="Firma del supervisor" />
            <View style={styles.card}>
              <View style={styles.firmaBox}>
                {firmaSupervisor ? (
                  <Image
                    source={{ uri: toDataUrl(firmaSupervisor) }}
                    style={styles.firmaPreview}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: FIORI.textMuted }}>Sin firma</Text>
                )}
              </View>

              <View style={styles.firmaBtnRow}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                  onPress={() => setModalFirma({ open: true, tipo: "supervisor" })}
                >
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>Firmar</Text>
                </TouchableOpacity>
                {firmaSupervisor && (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: "#6b7280" }]}
                    onPress={() => setFirmaSupervisor(null)}
                  >
                    <Text style={[styles.smallBtnText, { color: "#fff" }]}>Borrar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Controles de paso */}
      <View style={styles.footerNav}>
        {paso > 1 && (
          <TouchableOpacity
            onPress={() => setPaso(paso - 1)}
            style={[styles.navBtn, styles.navBtnSecondary]}
          >
            <Text style={[styles.navBtnTextSecondary]}>Atrás</Text>
          </TouchableOpacity>
        )}

        {paso < 4 && (
          <TouchableOpacity
            onPress={() => setPaso(paso + 1)}
            style={[styles.navBtn, styles.navBtnPrimary]}
          >
            <Text style={styles.navBtnTextPrimary}>Siguiente</Text>
          </TouchableOpacity>
        )}

        {paso === 4 && (
          <TouchableOpacity
            onPress={onGuardarYGenerarPdf}
            style={[styles.navBtn, styles.navBtnPrimaryStrong, saving && { opacity: 0.7 }]}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.navBtnTextPrimary}>Guardar y enviar a SAP</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Modal de firma */}
      <Modal
        visible={modalFirma.open}
        animationType="slide"
        onRequestClose={() => setModalFirma({ open: false, tipo: null })}
      >
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>
              {modalFirma.tipo === "tecnico" ? "Firma del técnico" : "Firma del supervisor"}
            </Text>
            <TouchableOpacity onPress={() => setModalFirma({ open: false, tipo: null })}>
              <Ionicons name="close" size={22} color={FIORI.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <Signature
              onOK={(val) => {
                const cleanB64 = sanitize(toBase64(val));
                if (modalFirma.tipo === "tecnico") setFirmaTecnico(cleanB64);
                else setFirmaSupervisor(cleanB64);
                setModalFirma({ open: false, tipo: null });
              }}
              onEmpty={() => Alert.alert("Sin trazo", "Dibuja tu firma dentro del recuadro.")}
              descriptionText="Firme dentro del recuadro"
              clearText="Limpiar"
              confirmText="Guardar"
              autoClear={false}
              imageType="image/png"
              webStyle={signatureCss}
            />
          </View>

          <View style={styles.modalFooter}>
            <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>
              Guarda para insertar la firma en el documento y en el PDF.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Modal PDF */}
      <Modal
        visible={showPdfModal}
        animationType="fade"
        transparent
        onRequestClose={closePdfModal}
      >
        <View style={styles.pdfModalBackdrop}>
          <View style={styles.pdfModalCard}>
            <View style={styles.pdfModalHeader}>
              <Text style={styles.pdfModalTitle}>PDF — Formulario de riesgos</Text>
              <TouchableOpacity style={styles.pdfCloseBtn} onPress={closePdfModal}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 14 }}>
              {!!pdfLocalUri && (
                <Text style={{ fontSize: 12, color: FIORI.textMuted }}>
                  Archivo: {pdfLocalUri.split("/").pop()}
                </Text>
              )}

              <View style={{ marginTop: 14, gap: 10 }}>
                <TouchableOpacity
                  style={[styles.bigActionBtn, { backgroundColor: FIORI.accent }]}
                  onPress={abrirPdfEnVisor}
                  disabled={downloadingPdf}
                >
                  <Ionicons name="eye-outline" size={18} color="#fff" />
                  <Text style={[styles.bigActionText, { color: "#fff" }]}>
                    {downloadingPdf ? "Preparando…" : "Abrir en visor"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.bigActionBtn, { backgroundColor: "#111827" }]}
                  onPress={compartirPdf}
                  disabled={downloadingPdf}
                >
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                  <Text style={[styles.bigActionText, { color: "#fff" }]}>
                    {downloadingPdf ? "Preparando…" : "Compartir"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.bigActionBtn, { backgroundColor: "#F3F4F6" }]}
                  onPress={closePdfModal}
                >
                  <Ionicons name="close-circle-outline" size={18} color={FIORI.ink} />
                  <Text style={[styles.bigActionText, { color: FIORI.ink }]}>Cerrar</Text>
                </TouchableOpacity>
              </View>

              {!!pdfLocalUri && (
                <Text style={{ fontSize: 11, color: FIORI.textMuted, marginTop: 10 }}>
                  Ruta local: {pdfLocalUri}
                </Text>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// util: formato YYYY-MM-DD
function theDateFormatter(setFecha, dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  setFecha(`${yyyy}-${mm}-${dd}`);
}

/* ==== Componentes pequeños ==== */
function HeaderRow({ label, value, multiline }) {
  return (
    <View style={{ flexDirection: "row", alignItems: multiline ? "flex-start" : "center" }}>
      <Text style={{ fontSize: 12, color: FIORI.textMuted, width: 90 }}>{label}:</Text>
      <Text style={{ flex: 1, fontSize: 13, color: FIORI.text }} numberOfLines={multiline ? 3 : 1}>
        {value || "—"}
      </Text>
    </View>
  );
}
function SectionTitle({ title }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <View style={styles.sectionTitleBar} />
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );
}
function SectionSubTitle({ text }) {
  return <Text style={styles.sectionSubTitle}>{text}</Text>;
}
function LabeledInput({ label, value, onChangeText, multiline = false, height, editable = true }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          !editable && styles.inputDisabled,
          multiline && { height: height || 80, textAlignVertical: "top" },
        ]}
        value={String(value ?? "")}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
      />
    </View>
  );
}

/* ==== Estilos ==== */
const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 130 },

  stepper: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: FIORI.cardBg,
    borderBottomWidth: 1,
    borderColor: FIORI.border,
  },
  stepItem: { alignItems: "center", gap: 4 },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: FIORI.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FIORI.cardBg,
  },
  stepCircleActive: { borderColor: FIORI.accent, backgroundColor: FIORI.accentSoft },
  stepCircleDone: { borderColor: FIORI.accent, backgroundColor: FIORI.accent },
  stepCircleText: { fontSize: 12, color: FIORI.textMuted, fontWeight: "600" },
  stepCircleTextActive: { color: FIORI.accent },
  stepLabel: { fontSize: 11, color: FIORI.textMuted },
  stepLabelActive: { color: FIORI.accent, fontWeight: "700" },
  stepLabelDone: { color: FIORI.accent },

  headerCard: {
    backgroundColor: FIORI.cardBg,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: FIORI.accentSoft,
  },
  pillText: { marginLeft: 6, fontSize: 12, color: FIORI.accent, fontWeight: "600" },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeOk: { backgroundColor: "#E7F7ED" },
  badgeWarn: { backgroundColor: "#FDECEA" },
  badgeText: { fontSize: 11, fontWeight: "700", color: FIORI.text },

  sectionTitleWrap: { flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 8 },
  sectionTitleBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: FIORI.accent, marginRight: 8 },
  sectionTitleText: { fontSize: 16, fontWeight: "700", color: FIORI.ink },
  sectionSubTitle: { fontSize: 13, fontWeight: "600", color: FIORI.textMuted, marginTop: 10, marginBottom: 6 },

  fieldLabel: { fontSize: 12, color: FIORI.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: FIORI.cardBg,
    color: FIORI.text,
    fontSize: 14,
  },
  inputDisabled: { backgroundColor: FIORI.cardSoft, color: FIORI.textMuted },
  dropdown: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: FIORI.cardBg,
    marginBottom: 10,
  },
  card: {
    backgroundColor: FIORI.cardBg,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderColor: FIORI.border,
    borderWidth: 1,
  },
  cardTitle: { fontWeight: "700", color: FIORI.ink, marginBottom: 6, fontSize: 14 },

  checkboxRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  checkboxLabel: { marginLeft: 10, color: FIORI.text, fontSize: 13, flex: 1 },

  miniLabel: { fontSize: 12, color: FIORI.textMuted, marginTop: 8, marginBottom: 4, fontWeight: "600" },

  equiposGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 },
  equipoTile: {
    width: "48%",
    backgroundColor: FIORI.cardBg,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  equipoTileActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  equipoText: { color: FIORI.ink, fontWeight: "700", fontSize: 12, textAlign: "center" },
  equipoTextActive: { color: "#fff" },

  eppGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  eppItem: {
    width: "48%",
    backgroundColor: FIORI.cardSoft,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
  },
  eppHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  eppLabel: { fontWeight: "600", color: FIORI.text, fontSize: 12 },
  eppButtons: { flexDirection: "row", gap: 6, marginTop: 6 },
  eppBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: FIORI.borderStrong,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#fff",
  },
  eppBoxOnM: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  eppBoxOnA: { backgroundColor: FIORI.warning, borderColor: FIORI.warning },
  eppBoxText: { fontWeight: "800", color: FIORI.ink },
  eppBoxTextOn: { color: "#fff" },

  topActionsRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 10 },

  smallBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  smallBtnText: { fontSize: 12, fontWeight: "700" },

  firmaBox: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FIORI.cardSoft,
  },
  firmaPreview: { width: "100%", height: "100%" },
  firmaBtnRow: { flexDirection: "row", gap: 10, marginTop: 10 },

  footerNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderColor: FIORI.border,
    flexDirection: "row",
    gap: 10,
  },
  navBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  navBtnSecondary: { backgroundColor: FIORI.cardSoft, borderWidth: 1, borderColor: FIORI.border },
  navBtnPrimary: { backgroundColor: FIORI.accent },
  navBtnPrimaryStrong: { backgroundColor: FIORI.accent },
  navBtnTextSecondary: { color: FIORI.ink, fontWeight: "800" },
  navBtnTextPrimary: { color: "#fff", fontWeight: "800" },

  modalHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalHeaderTitle: { fontSize: 16, fontWeight: "700", color: FIORI.ink },
  modalFooter: { padding: 12, borderTopWidth: 1, borderColor: "#eee" },

  pdfModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  pdfModalCard: {
    width: "100%",
    maxWidth: 600,
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  pdfModalHeader: {
    backgroundColor: "#0A6ED1",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  pdfModalTitle: { flex: 1, color: "#fff", fontWeight: "800", fontSize: 15 },
  pdfCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  bigActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  bigActionText: { fontWeight: "800", fontSize: 13 },
});
