// app/tecnico/ordenes/[orderid]/formulario-riesgos.js
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Keyboard,
  Animated,
  InputAccessoryView,
  KeyboardAvoidingView,
} from "react-native";
import Header from "../../../../src/components/Header";
import { useLocalSearchParams, router } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { Dropdown } from "react-native-element-dropdown";
import Signature from "react-native-signature-canvas";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";

import AsyncStorage from "@react-native-async-storage/async-storage";

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
import { buildTbmkyHtml } from "../../../../src/services/templates/tbmkyPdfTemplate";

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

export default function FormularioRiesgosScreen() {
  // ✅ por tu estructura, a veces viene como { id } y a veces como { orderid }
  const params = useLocalSearchParams();
  const orderid = String(params.orderid ?? params.id ?? "");

  const { user, ensureValidToken } = useAuth();

  // ✅ scroll a top en cada cambio de paso
  const scrollRef = useRef(null);
  const scrollToTop = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    });
  };

  // ✅ bloquear edición después de cerrar el modal PDF
  const [lockedAfterPdf, setLockedAfterPdf] = useState(false);

  // ✅ Razón social / Dirección (desde ToAddresses)
  const [razonSocial, setRazonSocial] = useState("");
  const [direccion, setDireccion] = useState("");

  // ✅ log de ToAddresses solo una vez (no spamear)
  const addrLogOnceRef = useRef(false);

  // ==========================
  // ✅ Draft autosave
  // ==========================
  const DRAFT_KEY = useMemo(() => `tbmky_draft_${orderid}`, [orderid]);
  const saveTimerRef = useRef(null);
  const didHydrateRef = useRef(false);

  const [paso, setPaso] = useState(1);

  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState(null);

  const [fecha, setFecha] = useState("");
  const [rutinaria, setRutinaria] = useState(false);

  // ✅ Equipo dinámico (según Eqart del equipo SAP)
  const [equipoSeleccionado, setEquipoSeleccionado] = useState("elevadores"); // "elevadores" | "escaleras"
  const [equipoLabel, setEquipoLabel] = useState("ELEVADORES"); // texto visible
  const [loadingEquipoTipo, setLoadingEquipoTipo] = useState(false);

  // ✅ Trabajadores SIN nómina
  const [trabajadores, setTrabajadores] = useState([
    { nombre: "", cargo: "" },
    { nombre: "", cargo: "" },
  ]);

  const [centroTrabajo, setCentroTrabajo] = useState("TLP1");
  const [selectedArea, setSelectedArea] = useState(null);
  const [jefeInmediato, setJefeInmediato] = useState("");
  const [actividadDia, setActividadDia] = useState("");

  const [sintomas, setSintomas] = useState([]);
  const [eppSeleccionado, setEppSeleccionado] = useState({});
  const [herramientas, setHerramientas] = useState("");

  // ✅ Catálogos locales
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

  // ✅ NUEVO: Cambio de condiciones (nuevo riesgo + medida)
  const [detectaNuevoRiesgo, setDetectaNuevoRiesgo] = useState(false);
  const [nuevosRiesgos, setNuevosRiesgos] = useState([
    { riesgo: "", medida: "" },
    { riesgo: "", medida: "" },
    { riesgo: "", medida: "" },
    { riesgo: "", medida: "" },
  ]);

  const setNuevoRiesgoCampo = (idx, campo, valor) => {
    if (lockedAfterPdf) return;
    setNuevosRiesgos((prev) => {
      const copy = prev.map((x) => ({ ...x }));
      if (!copy[idx]) copy[idx] = { riesgo: "", medida: "" };
      copy[idx][campo] = valor;
      return copy;
    });
  };

  // ✅ SOLO firma técnico
  const [firmaTecnico, setFirmaTecnico] = useState(null);

  const [saving, setSaving] = useState(false);

  // PDF local
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfLocalUri, setPdfLocalUri] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const esRutinaria = (orderType) => ["Z1", "Z2", "Z3"].includes(orderType || "");
  const toBase64 = (data) => (data || "").replace(/^data:image\/\w+;base64,/, "");
  const toDataUrl = (b64) => `data:image/png;base64,${b64}`;
  const sanitize = (s) => (s || "").replace(/\s/g, "");
  const EQUIPO_TIPO_URL_BASE =
    "https://my-node-api-pro-01.cfapps.us10-001.hana.ondemand.com";

  function mapEqartToTipo(eqartRaw) {
    const v = String(eqartRaw || "").toUpperCase().trim();

    // En tu ejemplo viene: "ELEVADOR"
    if (v.includes("ELEV")) return { tipo: "elevadores", label: "ELEVADORES" };

    // Por si SAP manda "ESCALERA" / "ESCALERA MECANICA" / "ESCALERA MECÁNICA"
    if (v.includes("ESCAL")) return { tipo: "escaleras", label: "ESCALERAS" };

    // fallback (si viene raro o vacío)
    return { tipo: "elevadores", label: "ELEVADORES" };
  }

  async function fetchTipoEquipoFromEquipment(equipmentMx) {
    const eq = String(equipmentMx || "").trim();
    if (!eq) return null;

    const url = `${EQUIPO_TIPO_URL_BASE}/api/odata/ZCS_GET_EQUIPMENT_SRV/EquipmentHeaderSet('${encodeURIComponent(
      eq,
    )}')?$format=json`;

    // 👇 usa fetch para evitar problemas de baseURL con tu axios `api`
    const r = await fetch(url);
    if (!r.ok) throw new Error(`EquipmentHeaderSet HTTP ${r.status}`);

    const j = await r.json();
    const eqart = j?.d?.Eqart;

    return { eqart, ...mapEqartToTipo(eqart) };
  }

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
    [],
  );

  // ==========================================================
  // ✅ MEJORA: “ver lo que escribes” + barra arriba del teclado
  // ==========================================================
  const ACCESSORY_ID = "TBMKY_ACCESSORY";
  const [activeField, setActiveField] = useState(null); // { key, label, i, j }

  const keyboardBottom = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      const h = e?.endCoordinates?.height || 0;
      Animated.timing(keyboardBottom, {
        toValue: h,
        duration: 180,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      Animated.timing(keyboardBottom, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardBottom]);

  const activeValue = useMemo(() => {
    if (!activeField?.key) return "";

    const safe = (v) => String(v ?? "");

    switch (activeField.key) {
      case "tec2_nombre":
        return safe(trabajadores?.[1]?.nombre);
      case "tec2_cargo":
        return safe(trabajadores?.[1]?.cargo);

      case "jefe":
        return safe(jefeInmediato);
      case "actividad":
        return safe(actividadDia);

      case "herramientas":
        return safe(herramientas);

      case "causa": {
        const i = activeField?.i ?? 0;
        return safe(causasTop?.[i]);
      }

      case "medida": {
        const i = activeField?.i ?? 0;
        const j = activeField?.j ?? 0;
        return safe(medidasTop?.[i]?.[j]);
      }

      case "accion": {
        const i = activeField?.i ?? 0;
        return safe(acciones?.[i]);
      }

      // ✅ NUEVO
      case "nuevo_riesgo": {
        const i = activeField?.i ?? 0;
        return safe(nuevosRiesgos?.[i]?.riesgo);
      }
      case "nuevo_medida": {
        const i = activeField?.i ?? 0;
        return safe(nuevosRiesgos?.[i]?.medida);
      }

      default:
        return "";
    }
  }, [
    activeField,
    trabajadores,
    jefeInmediato,
    actividadDia,
    herramientas,
    causasTop,
    medidasTop,
    acciones,
    nuevosRiesgos,
  ]);

  // mostrar el final si es largo, para que veas lo último que tecleas
  const kbPreviewValue = useMemo(() => {
    const t = String(activeValue ?? "");
    if (!t) return "";
    const MAX = 160;
    if (t.length <= MAX) return t;
    return "…" + t.slice(t.length - MAX);
  }, [activeValue]);

  // ==========================
  // ✅ 1) Hydrate draft
  // ==========================
  useEffect(() => {
    let alive = true;

    const hydrateDraft = async () => {
      try {
        if (!orderid) return;
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) return;

        const d = JSON.parse(raw);
        if (!alive || !d) return;

        if (typeof d.paso === "number") setPaso(d.paso);

        if (typeof d.fecha === "string") setFecha(d.fecha);
        if (typeof d.rutinaria === "boolean") setRutinaria(d.rutinaria);
        if (typeof d.equipoSeleccionado === "string")
          setEquipoSeleccionado(d.equipoSeleccionado);
        if (typeof d.equipoLabel === "string") setEquipoLabel(d.equipoLabel);

        if (Array.isArray(d.trabajadores)) {
          const t = d.trabajadores.map((x) => ({
            nombre: String(x?.nombre ?? ""),
            cargo: String(x?.cargo ?? ""),
          }));
          if (t.length >= 2) setTrabajadores([t[0], t[1]]);
        }

        if (typeof d.centroTrabajo === "string")
          setCentroTrabajo(d.centroTrabajo || "TLP1");
        if (d.selectedArea) setSelectedArea(d.selectedArea);
        if (typeof d.jefeInmediato === "string") setJefeInmediato(d.jefeInmediato);
        if (typeof d.actividadDia === "string") setActividadDia(d.actividadDia);

        if (Array.isArray(d.sintomas)) setSintomas(d.sintomas);
        if (d.eppSeleccionado && typeof d.eppSeleccionado === "object")
          setEppSeleccionado(d.eppSeleccionado);
        if (typeof d.herramientas === "string") setHerramientas(d.herramientas);

        if (Array.isArray(d.riesgosSeleccionadosIds))
          setRiesgosSeleccionadosIds(d.riesgosSeleccionadosIds);
        if (Array.isArray(d.topSeleccionIds)) setTopSeleccionIds(d.topSeleccionIds);
        if (Array.isArray(d.riesgosTopText)) setRiesgosTopText(d.riesgosTopText);
        if (Array.isArray(d.causasTop)) setCausasTop(d.causasTop);
        if (Array.isArray(d.medidasTop)) setMedidasTop(d.medidasTop);
        if (Array.isArray(d.acciones)) setAcciones(d.acciones);

        // ✅ NUEVO
        if (typeof d.detectaNuevoRiesgo === "boolean")
          setDetectaNuevoRiesgo(d.detectaNuevoRiesgo);

        if (Array.isArray(d.nuevosRiesgos)) {
          const arr = d.nuevosRiesgos.map((x) => ({
            riesgo: String(x?.riesgo ?? ""),
            medida: String(x?.medida ?? ""),
          }));
          if (arr.length) setNuevosRiesgos(arr);
        }

        if (typeof d.firmaTecnico === "string") setFirmaTecnico(d.firmaTecnico || null);

        if (typeof d.pdfLocalUri === "string") setPdfLocalUri(d.pdfLocalUri || null);
      } catch (e) {
        console.log("[TBMKY] hydrateDraft error:", e);
      } finally {
        didHydrateRef.current = true;
      }
    };

    hydrateDraft();

    return () => {
      alive = false;
    };
  }, [DRAFT_KEY, orderid]);

  // ==========================
  // ✅ 2) Cargar SAP + ToAddresses
  // ==========================
  useEffect(() => {
    let alive = true;

    const loadSap = async () => {
      try {
        setLoading(true);

        if (!orderid) {
          Alert.alert("Error", "No se recibió orderid en la ruta.");
          return;
        }

        const sapRes = await api.get(`/api/ordenes/sap/${orderid}`);
        const ord = sapRes?.data || null;

        if (!alive) return;

        setOrden(ord);
        setCentroTrabajo("TLP1");

        // ✅ Determinar tipo de equipo (ELEVADOR / ESCALERA) consultando EquipmentHeaderSet
        try {
          const equipmentMx = ord?.Equipment || ord?.equipment || ord?.EQUIPMENT || "";

          if (equipmentMx) {
            setLoadingEquipoTipo(true);

            const info = await fetchTipoEquipoFromEquipment(equipmentMx);

            if (info?.tipo) {
              setEquipoSeleccionado(info.tipo);
              setEquipoLabel(info.label);

              console.log("[TBMKY] Tipo equipo por Eqart:", {
                equipmentMx,
                eqart: info.eqart,
                tipo: info.tipo,
              });
            }
          } else {
            console.log("[TBMKY] Orden sin Equipment (MX...) para consultar tipo.");
          }
        } catch (e) {
          console.log("[TBMKY] Error consultando tipo de equipo:", e?.message || e);
        } finally {
          setLoadingEquipoTipo(false);
        }

        const startIso =
          ord?.StartDate || ord?.start_date || ord?.Startdate || ord?.startDate;
        const startDate = startIso ? new Date(startIso) : new Date();
        if (!fecha) theDateFormatter(setFecha, startDate);

        const ot = String(ord?.order_type || ord?.OrderType || ord?.orderType || "").trim();
        if (typeof rutinaria !== "boolean" || rutinaria === false) {
          setRutinaria(esRutinaria(ot));
        }

        setTrabajadores((prev) => {
          const copia = [...prev];
          const existing = copia[0]?.nombre?.trim?.();
          if (existing) return copia;

          copia[0] = {
            nombre: ord?.tecnico_nombre || ord?.nombre || user?.nombre || user?.name || "",
            cargo: ord?.tecnico_cargo || user?.puesto || user?.rol || "Técnico",
          };
          return copia;
        });

        // ✅ Traer Razón social / Dirección desde ToAddresses (2do nodo)
        try {
          const addrRes = await api.get(
            `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderid}')/ToAddresses?$format=json`,
          );

          const results = addrRes?.data?.d?.results || [];
          const node = results?.[1] || null; // 👈 segundo nodo

          if (node) {
            const rs = buildRazonSocial(node);
            const dir = buildDireccion(node);

            setRazonSocial(rs);
            setDireccion(dir);

            if (!addrLogOnceRef.current) {
              addrLogOnceRef.current = true;
              console.log("[TBMKY] ToAddresses OK (2do nodo):", {
                pickedIndex: 1,
                Name1: node?.Name1,
                Name4: node?.Name4,
                Street: node?.Street,
                HouseNum1: node?.HouseNum1,
                City1: node?.City1,
                PostCode1: node?.PostCode1,
              });
            }
          } else {
            if (!addrLogOnceRef.current) {
              addrLogOnceRef.current = true;
              console.log("[TBMKY] ToAddresses sin 2do nodo. results length =", results?.length || 0);
            }
          }
        } catch (e) {
          console.log("[TBMKY] ToAddresses error:", e?.response?.data || e);
        }
      } catch (err) {
        console.error("Error cargando SAP:", err?.response?.data || err);
        Alert.alert("Error", "No se pudieron cargar los datos de SAP.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadSap();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderid]);

  // ==========================
  // ✅ 3) Autosave draft
  // ==========================
  const draftPayload = useMemo(
    () => ({
      paso,
      fecha,
      rutinaria,

      // ✅ FIX: antes tenías equipoSeleccionado: "elevadores" (te pisaba el real)
      equipoSeleccionado,
      equipoLabel,

      trabajadores,
      centroTrabajo,
      selectedArea,
      jefeInmediato,
      actividadDia,
      sintomas,
      eppSeleccionado,
      herramientas,
      riesgosSeleccionadosIds,
      topSeleccionIds,
      riesgosTopText,
      causasTop,
      medidasTop,
      acciones,

      // ✅ NUEVO
      detectaNuevoRiesgo,
      nuevosRiesgos,

      firmaTecnico: firmaTecnico || "",
      pdfLocalUri: pdfLocalUri || "",
      updatedAt: Date.now(),
    }),
    [
      paso,
      fecha,
      rutinaria,
      equipoSeleccionado,
      equipoLabel,
      trabajadores,
      centroTrabajo,
      selectedArea,
      jefeInmediato,
      actividadDia,
      sintomas,
      eppSeleccionado,
      herramientas,
      riesgosSeleccionadosIds,
      topSeleccionIds,
      riesgosTopText,
      causasTop,
      medidasTop,
      acciones,
      detectaNuevoRiesgo,
      nuevosRiesgos,
      firmaTecnico,
      pdfLocalUri,
    ],
  );

  useEffect(() => {
    if (!orderid) return;
    if (!didHydrateRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftPayload));
      } catch (e) {
        console.log("[TBMKY] autosave error:", e);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [DRAFT_KEY, draftPayload, orderid]);

  const clearDraft = async () => {
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
      Alert.alert("Borrador", "Se eliminó el borrador de esta orden.");
    } catch (e) {
      Alert.alert("Error", "No se pudo borrar el borrador.");
    }
  };

  // Toggles
  const toggleSintoma = (sintoma) => {
    if (lockedAfterPdf) return;
    setSintomas((prev) =>
      prev.includes(sintoma)
        ? prev.filter((s) => s !== sintoma)
        : [...prev, sintoma],
    );
  };

  const toggleEppCampo = (item, campo) => {
    if (lockedAfterPdf) return;
    setEppSeleccionado((prev) => {
      const actual = prev[item] || { M: false, A: false };
      return { ...prev, [item]: { ...actual, [campo]: !actual[campo] } };
    });
  };

  const toggleRiesgo = (id) => {
    if (lockedAfterPdf) return;
    setRiesgosSeleccionadosIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const opcionesTop1 = useMemo(
    () =>
      riesgosBD
        .filter((r) => riesgosSeleccionadosIds.includes(r.id))
        .map((r) => ({ label: r.riesgo, value: r.id })),
    [riesgosBD, riesgosSeleccionadosIds],
  );

  const opcionesTop2 = useMemo(() => {
    const usados = new Set([topSeleccionIds[0]].filter(Boolean));
    return riesgosBD
      .filter((r) => riesgosSeleccionadosIds.includes(r.id) && !usados.has(r.id))
      .map((r) => ({ label: r.riesgo, value: r.id }));
  }, [riesgosBD, riesgosSeleccionadosIds, topSeleccionIds]);

  const opcionesTop3 = useMemo(() => {
    const usados = new Set([topSeleccionIds[0], topSeleccionIds[1]].filter(Boolean));
    return riesgosBD
      .filter((r) => riesgosSeleccionadosIds.includes(r.id) && !usados.has(r.id))
      .map((r) => ({ label: r.riesgo, value: r.id }));
  }, [riesgosBD, riesgosSeleccionadosIds, topSeleccionIds]);

  useEffect(() => {
    // si desmarcan riesgo, quita top si ya no existe
    setTopSeleccionIds((prev) =>
      prev.map((v) => (v && !riesgosSeleccionadosIds.includes(v) ? null : v)),
    );
  }, [riesgosSeleccionadosIds]);

  const aplicarTop = () => {
    if (lockedAfterPdf) return;

    if (!topSeleccionIds[0] || !topSeleccionIds[1] || !topSeleccionIds[2]) {
      Alert.alert("TOP 3 incompleto", "Elige TOP 1, TOP 2 y TOP 3 (sin repetir).");
      return;
    }

    const nombres = topSeleccionIds.map(
      (id) => riesgosBD.find((x) => x.id === id)?.riesgo || "",
    );

    // reset de campos si cambió el riesgo top
    setCausasTop((prev) =>
      prev.map((c, i) => (riesgosTopText[i] !== nombres[i] ? "" : c)),
    );
    setMedidasTop((prev) =>
      prev.map((fila, i) =>
        riesgosTopText[i] !== nombres[i] ? ["", "", ""] : fila,
      ),
    );
    setAcciones((prev) =>
      prev.map((a, i) => (riesgosTopText[i] !== nombres[i] ? "" : a)),
    );

    setRiesgosTopText(nombres);

    Alert.alert(
      "TOP 3 aplicado",
      "Listo ✅\n\nAhora abajo se autollenarán los bloques de TOP 1/2/3 para que captures causas, medidas y acciones.",
    );
  };

  const autollenarTopDesdeSeleccionados = () => {
    if (lockedAfterPdf) return;
    if (riesgosSeleccionadosIds.length < 3) {
      Alert.alert("Selecciona riesgos", "Marca al menos 3 riesgos en 'Riesgos presentes'.");
      return;
    }
    setTopSeleccionIds([
      riesgosSeleccionadosIds[0],
      riesgosSeleccionadosIds[1],
      riesgosSeleccionadosIds[2],
    ]);
  };

  // -------------------------
  // ✅ PDF LOCAL
  // -------------------------
  const leerPdfBase64 = async (localUri) => {
    const b64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: "base64",
    });
    return b64;
  };

  const generarPdfLocalYBase64 = async (payload) => {
    const html = buildTbmkyHtml(payload);
    const safeFecha = String(payload.fecha || "").replace(/[^0-9-]/g, "");
    const fileName = `TBMKY_${payload.orderid}_${safeFecha}.pdf`;

    const { uri, base64 } = await Print.printToFileAsync({
      html,
      base64: true,
    });

    const dest = `${FileSystem.documentDirectory}${fileName}`;
    let finalUri = uri;
    try {
      await FileSystem.copyAsync({ from: uri, to: dest });
      finalUri = dest;
    } catch {}

    let finalBase64 = base64;
    if (!finalBase64) finalBase64 = await leerPdfBase64(finalUri);

    return { uri: finalUri, base64: finalBase64, fileName };
  };

  // -------------------------
  // PDF acciones (abrir/compartir)
  // -------------------------
  const openPdfModal = () => setShowPdfModal(true);

  // ✅ al cerrar modal => mandar a index de órdenes y bloquear edición
  const closePdfModal = () => {
    setShowPdfModal(false);
    setLockedAfterPdf(true);
    router.replace("/tecnico/ordenes");
  };

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
      if (!canShare) return Alert.alert("No disponible", "Compartir no está disponible.");
      await Sharing.shareAsync(pdfLocalUri, { mimeType: "application/pdf" });
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo compartir el PDF.");
    }
  };

  // ==========================
  // ✅ Validaciones por paso
  // ==========================
  const paso1Ok = useMemo(() => {
    const t1ok = !!trabajadores?.[0]?.nombre?.trim();
    const areaOk = !!selectedArea;
    const jefeOk = !!jefeInmediato?.trim();
    const actOk = !!actividadDia?.trim();
    return t1ok && areaOk && jefeOk && actOk;
  }, [trabajadores, selectedArea, jefeInmediato, actividadDia]);

  const paso2Ok = useMemo(() => true, []);

  const topAplicadoOk = useMemo(
    () => !!riesgosTopText?.[0] && !!riesgosTopText?.[1] && !!riesgosTopText?.[2],
    [riesgosTopText],
  );

  const nuevosRiesgosOk = useMemo(() => {
    if (!detectaNuevoRiesgo) return true;
    return (nuevosRiesgos || []).some(
      (r) => String(r?.riesgo || "").trim() && String(r?.medida || "").trim(),
    );
  }, [detectaNuevoRiesgo, nuevosRiesgos]);

  const paso3Ok = useMemo(() => {
    const selOk = riesgosSeleccionadosIds.length >= 3;
    const accionesOk = acciones.every((a) => String(a || "").trim().length > 0);
    return selOk && topAplicadoOk && accionesOk && nuevosRiesgosOk;
  }, [riesgosSeleccionadosIds, topAplicadoOk, acciones, nuevosRiesgosOk]);

  const paso4Ok = useMemo(() => !!firmaTecnico, [firmaTecnico]);

  const canNext = useMemo(() => {
    if (paso === 1) return paso1Ok;
    if (paso === 2) return paso2Ok;
    if (paso === 3) return paso3Ok;
    return true;
  }, [paso, paso1Ok, paso2Ok, paso3Ok]);

  const canSubmit = useMemo(() => paso4Ok, [paso4Ok]);

  const goNext = () => {
    if (!canNext) {
      Alert.alert("Falta información", "Completa los campos requeridos para continuar.");
      return;
    }
    setPaso((p) => Math.min(4, p + 1));
  };

  const goPrev = () => setPaso((p) => Math.max(1, p - 1));

  // ✅ cada vez que cambie paso, manda arriba y limpia preview
  useEffect(() => {
    scrollToTop();
    setActiveField(null);
  }, [paso]);

  // -------------------------
  // ✅ FINAL: Guardar + PDF + SAP
  // -------------------------
  const onGuardarYGenerarPdf = async () => {
    if (saving) return;

    if (!canSubmit)
      return Alert.alert("Falta firma", "Captura la firma del técnico.");

    if (!selectedArea)
      return Alert.alert("Falta información", "Selecciona el área de trabajo.");
    if (!jefeInmediato.trim())
      return Alert.alert("Falta información", "Jefe inmediato vacío.");
    if (!actividadDia.trim())
      return Alert.alert("Falta información", "Actividad del día vacía.");

    if (!topAplicadoOk)
      return Alert.alert(
        "TOP 3 incompleto",
        "Selecciona y aplica TOP 1, TOP 2 y TOP 3.",
      );

    if (!acciones.every((a) => String(a || "").trim())) {
      return Alert.alert(
        "Acciones incompletas",
        "Escribe las 3 acciones (una por TOP).",
      );
    }

    if (!nuevosRiesgosOk) {
      return Alert.alert(
        "Nuevo riesgo incompleto",
        "Marcaste que detectaste un nuevo riesgo. Escribe al menos 1 riesgo y su medida de control.",
      );
    }

    try {
      setSaving(true);

      const selectedAreaLabel =
        areaOptions.find((a) => a.value === selectedArea)?.label || "";

      const payload = {
        orderid: orden?.Orderid || orden?.orderid || orderid,
        fecha,
        centroTrabajo: centroTrabajo || "TLP1",
        selectedAreaLabel,
        jefeInmediato,
        actividadDia,
        rutinaria,

        equipoId: equipoSeleccionado, // "elevadores" | "escaleras"
        equipoSeleccionado,
        equipoLabel,

        // ✅ SIN NÓMINA
        trabajadores: (trabajadores || []).map((t) => ({
          nombre: String(t?.nombre ?? ""),
          cargo: String(t?.cargo ?? ""),
        })),

        sintomas,
        eppSeleccionado,
        herramientas,

        riesgosSeleccionadosIds,
        riesgosBD,

        riesgosTopText,
        causasTop,
        medidasTop,
        acciones,

        // ✅ NUEVO (PDF template lo usará)
        detectaNuevoRiesgo,
        nuevosRiesgos: (nuevosRiesgos || []).map((x) => ({
          riesgo: String(x?.riesgo ?? ""),
          medida: String(x?.medida ?? ""),
        })),

        // ✅ SOLO técnico
        firmaTecnico,

        // Extra por si template los usa:
        equipment: orden?.Equipment || orden?.equipment || "",
        razon_social: razonSocial || orden?.razon_social || orden?.partner_name || "",
        direccion: direccion || orden?.direccion || orden?.partner_address || "",
        order_type: orden?.order_type || orden?.OrderType || "",
      };

      // 1) Generar PDF
      const { uri: localUri, base64: base64Pdf, fileName } =
        await generarPdfLocalYBase64(payload);
      setPdfLocalUri(localUri);

      if (!base64Pdf || String(base64Pdf).trim().length < 200) {
        throw new Error("Base64 del PDF vacío o demasiado corto.");
      }

      // 2) Enviar PDF a SAP
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
          `Se generó el PDF, pero no se pudo enviar a SAP para la orden #${payload.orderid}.`,
          [{ text: "OK" }],
        );
        return;
      }

      if (!respSubmit?.ok) {
        Alert.alert(
          "Guardado local",
          `Se generó el PDF, pero SAP no confirmó el envío para la orden #${payload.orderid}.`,
          [{ text: "OK" }],
        );
        return;
      }

      // ✅ borrar borrador
      try {
        await AsyncStorage.removeItem(DRAFT_KEY);
      } catch {}

      Alert.alert("Listo", `TBM/KY enviado a SAP ✅\nOrden #${payload.orderid}.`, [
        { text: "Opciones de PDF", onPress: openPdfModal },
      ]);
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
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={FIORI.accent} />
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* ✅ Encabezado SOLO en Paso 1 */}
          {paso === 1 && (
            <View style={styles.headerCard}>
              <View style={styles.headerRow}>
                <View style={styles.pill}>
                  <Ionicons name="document-text-outline" size={14} color={FIORI.accent} />
                  <Text style={styles.pillText}>Orden {orden?.Orderid || orderid}</Text>
                </View>

                <View style={[styles.badge, rutinaria ? styles.badgeOk : styles.badgeWarn]}>
                  <Text style={styles.badgeText}>{rutinaria ? "RUTINARIA" : "NO RUTINARIA"}</Text>
                </View>
              </View>

              <View style={{ marginTop: 8, gap: 4 }}>
                <HeaderRow label="Fecha" value={fecha} />
                <HeaderRow
                  label="Equipo"
                  value={loadingEquipoTipo ? "Consultando…" : equipoLabel || "—"}
                />

                <HeaderRow label="Equipo SAP" value={orden?.Equipment || orden?.equipment || "—"} />
                <HeaderRow
                  label="Razón social"
                  value={razonSocial || orden?.razon_social || orden?.partner_name || "—"}
                  multiline
                />
                <HeaderRow
                  label="Dirección"
                  value={direccion || orden?.direccion || orden?.partner_address || "—"}
                  multiline
                />
                <HeaderRow label="Tipo orden" value={orden?.order_type || orden?.OrderType || "—"} />
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                {!!pdfLocalUri && (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                    onPress={openPdfModal}
                    disabled={lockedAfterPdf}
                  >
                    <Text style={[styles.smallBtnText, { color: "#fff" }]}>Opciones de PDF</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: "#111827" }]}
                  onPress={clearDraft}
                  disabled={lockedAfterPdf}
                >
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>Borrar borrador</Text>
                </TouchableOpacity>
              </View>

              {!!lockedAfterPdf && (
                <Text style={{ marginTop: 8, fontSize: 12, color: FIORI.textMuted }}>
                  Este formulario ya se envió. Regresando a órdenes…
                </Text>
              )}
            </View>
          )}

          {/* PASO 1 */}
          {paso === 1 && (
            <View>
              <SectionTitle title="1. Identificación del área de trabajo" />

              <SectionSubTitle text="Tipo de equipo (fijo)" />
              <View style={[styles.fixedTile, { borderColor: FIORI.accent }]}>
                <MaterialCommunityIcons
                  name={equipoSeleccionado === "escaleras" ? "escalator" : "elevator-passenger"}
                  size={22}
                  color={FIORI.accent}
                />

                <Text style={{ fontWeight: "900", color: FIORI.ink }}>
                  {loadingEquipoTipo ? "Consultando…" : equipoLabel || "EQUIPO"}
                </Text>

                <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>
                  {loadingEquipoTipo ? "Leyendo tipo en SAP…" : "No editable"}
                </Text>
              </View>

              <SectionSubTitle text="Técnico asignado (no editable)" />
              <View style={styles.card}>
                <LabeledInput label="Nombre" value={trabajadores[0].nombre} editable={false} />
                <LabeledInput label="Cargo" value={trabajadores[0].cargo || "Técnico"} editable={false} />
                <LabeledInput label="Fecha" value={fecha} editable={false} />
              </View>

              <SectionSubTitle text="Técnico 2 (opcional)" />
              <View style={styles.card}>
                <LabeledInput
                  label="Nombre"
                  value={trabajadores[1].nombre}
                  onChangeText={(v) => {
                    if (lockedAfterPdf) return;
                    const copia = [...trabajadores];
                    copia[1].nombre = v;
                    setTrabajadores(copia);
                  }}
                  editable={!lockedAfterPdf}
                  onFocus={() => setActiveField({ key: "tec2_nombre", label: "Técnico 2 — Nombre" })}
                  onBlur={() => setActiveField(null)}
                  inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
                />
                <LabeledInput
                  label="Cargo"
                  value={trabajadores[1].cargo}
                  onChangeText={(v) => {
                    if (lockedAfterPdf) return;
                    const copia = [...trabajadores];
                    copia[1].cargo = v;
                    setTrabajadores(copia);
                  }}
                  editable={!lockedAfterPdf}
                  onFocus={() => setActiveField({ key: "tec2_cargo", label: "Técnico 2 — Cargo" })}
                  onBlur={() => setActiveField(null)}
                  inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
                />
              </View>

              <SectionSubTitle text="Datos del área (requerido)" />
              <LabeledInput label="Centro de trabajo" value={centroTrabajo || "TLP1"} editable={false} />

              <Text style={styles.fieldLabel}>Área de trabajo *</Text>
              <Dropdown
                style={styles.dropdown}
                data={areaOptions}
                labelField="label"
                valueField="value"
                placeholder="Seleccionar área..."
                value={selectedArea}
                onChange={(item) => !lockedAfterPdf && setSelectedArea(item.value)}
                disable={lockedAfterPdf}
              />

              {!!selectedArea && (
                <>
                  <LabeledInput
                    label="Jefe inmediato *"
                    value={jefeInmediato}
                    onChangeText={setJefeInmediato}
                    editable={!lockedAfterPdf}
                    onFocus={() => setActiveField({ key: "jefe", label: "Jefe inmediato" })}
                    onBlur={() => setActiveField(null)}
                    inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
                  />
                  <LabeledInput
                    label="Actividad del día *"
                    value={actividadDia}
                    onChangeText={setActividadDia}
                    multiline
                    height={80}
                    editable={!lockedAfterPdf}
                    onFocus={() => setActiveField({ key: "actividad", label: "Actividad del día" })}
                    onBlur={() => setActiveField(null)}
                    inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
                  />
                </>
              )}

              {!paso1Ok && (
                <Text style={{ color: FIORI.textMuted, fontSize: 12, marginTop: 6 }}>
                  Completa: Área, Jefe inmediato y Actividad del día para continuar.
                </Text>
              )}
            </View>
          )}

          {/* PASO 2 */}
          {paso === 2 && (
            <View>
              <SectionTitle title="2. Chequeo individual de salud y EPP" />

              <SectionSubTitle text="Chequeo individual de salud" />
              <View style={styles.card}>
                {sintomasIniciales.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={styles.checkboxRow}
                    onPress={() => toggleSintoma(s)}
                    disabled={lockedAfterPdf}
                  >
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
                          style={[
                            styles.eppBox,
                            eppSeleccionado[epp]?.M && styles.eppBoxOnM,
                          ]}
                          onPress={() => toggleEppCampo(epp, "M")}
                          disabled={lockedAfterPdf}
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
                          style={[
                            styles.eppBox,
                            eppSeleccionado[epp]?.A && styles.eppBoxOnA,
                          ]}
                          onPress={() => toggleEppCampo(epp, "A")}
                          disabled={lockedAfterPdf}
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
                editable={!lockedAfterPdf}
                onFocus={() => setActiveField({ key: "herramientas", label: "Herramientas especiales" })}
                onBlur={() => setActiveField(null)}
                inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
              />
            </View>
          )}

          {/* PASO 3 */}
          {paso === 3 && (
            <View>
              <SectionTitle title="3. Análisis de riesgos (guiado)" />

              {/* TAREA 1 */}
              <View style={styles.taskCard}>
                <Text style={styles.taskTitle}>Tarea 1 — Marca riesgos presentes (mínimo 3)</Text>
                <Text style={styles.taskHint}>
                  Selecciona todos los riesgos que apliquen. Cuando marques 3 o más, se habilita la selección de TOP 3.
                </Text>

                <View style={[styles.card, { marginBottom: 0 }]}>
                  {riesgosBD.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={styles.checkboxRow}
                      onPress={() => toggleRiesgo(r.id)}
                      disabled={lockedAfterPdf}
                    >
                      <Ionicons
                        name={riesgosSeleccionadosIds.includes(r.id) ? "checkbox" : "square-outline"}
                        size={20}
                        color={FIORI.accent}
                      />
                      <Text style={styles.checkboxLabel}>{r.riesgo}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* TAREA 2 */}
              {riesgosSeleccionadosIds.length >= 3 ? (
                <View style={styles.taskCard}>
                  <Text style={styles.taskTitle}>Tarea 2 — Elige TOP 1 / TOP 2 / TOP 3 (sin repetir)</Text>
                  <Text style={styles.taskHint}>
                    Al presionar <Text style={{ fontWeight: "900" }}>“Aplicar TOP 3”</Text>, se autollenarán abajo los bloques
                    para capturar causas, medidas y acciones.
                  </Text>

                  <View style={styles.card}>
                    <Text style={styles.miniLabel}>TOP 1</Text>
                    <Dropdown
                      style={styles.dropdown}
                      data={opcionesTop1}
                      labelField="label"
                      valueField="value"
                      placeholder="Elige riesgo TOP 1"
                      value={topSeleccionIds[0]}
                      onChange={(item) =>
                        !lockedAfterPdf &&
                        setTopSeleccionIds([item.value, topSeleccionIds[1], topSeleccionIds[2]])
                      }
                      disable={lockedAfterPdf}
                    />

                    <Text style={styles.miniLabel}>TOP 2</Text>
                    <Dropdown
                      style={styles.dropdown}
                      data={opcionesTop2}
                      labelField="label"
                      valueField="value"
                      placeholder="Elige riesgo TOP 2"
                      value={topSeleccionIds[1]}
                      onChange={(item) =>
                        !lockedAfterPdf &&
                        setTopSeleccionIds([topSeleccionIds[0], item.value, topSeleccionIds[2]])
                      }
                      disable={lockedAfterPdf}
                    />

                    <Text style={styles.miniLabel}>TOP 3</Text>
                    <Dropdown
                      style={styles.dropdown}
                      data={opcionesTop3}
                      labelField="label"
                      valueField="value"
                      placeholder="Elige riesgo TOP 3"
                      value={topSeleccionIds[2]}
                      onChange={(item) =>
                        !lockedAfterPdf &&
                        setTopSeleccionIds([topSeleccionIds[0], topSeleccionIds[1], item.value])
                      }
                      disable={lockedAfterPdf}
                    />

                    <View style={styles.topActionsRow}>
                      <TouchableOpacity
                        style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                        onPress={aplicarTop}
                        disabled={lockedAfterPdf}
                      >
                        <Text style={[styles.smallBtnText, { color: "#fff" }]}>Aplicar TOP 3</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>
                  Marca al menos 3 riesgos para habilitar la selección TOP 3.
                </Text>
              )}

              {/* TAREA 3 + 4 */}
              {topAplicadoOk ? (
                <>
                  <View style={styles.taskCard}>
                    <Text style={styles.taskTitle}>Tarea 3 — Causas y medidas de control (para cada TOP)</Text>
                    <Text style={styles.taskHint}>
                      Aquí se autollenaron los riesgos TOP. Ahora captura la causa y 3 medidas por cada uno.
                    </Text>

                    {riesgosTopText.map((r, i) => (
                      <View key={i} style={styles.card}>
                        <Text style={styles.cardTitle}>TOP {i + 1} — {r || "Sin seleccionar"}</Text>

                        <LabeledInput
                          label="¿Por qué puede pasar?"
                          value={causasTop[i]}
                          onChangeText={(v) => {
                            if (lockedAfterPdf) return;
                            const nuevo = [...causasTop];
                            nuevo[i] = v;
                            setCausasTop(nuevo);
                          }}
                          multiline
                          editable={!lockedAfterPdf}
                          onFocus={() => setActiveField({ key: "causa", i, label: `TOP ${i + 1} — Causa` })}
                          onBlur={() => setActiveField(null)}
                          inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
                        />

                        <Text style={styles.miniLabel}>Medidas de control</Text>
                        {[0, 1, 2].map((idxM) => (
                          <TextInput
                            key={idxM}
                            placeholder={`Medida ${idxM + 1}`}
                            style={styles.input}
                            value={medidasTop[i][idxM]}
                            onChangeText={(v) => {
                              if (lockedAfterPdf) return;
                              const m = medidasTop.map((fila) => [...fila]);
                              m[i][idxM] = v;
                              setMedidasTop(m);
                            }}
                            editable={!lockedAfterPdf}
                            onFocus={() =>
                              setActiveField({ key: "medida", i, j: idxM, label: `TOP ${i + 1} — Medida ${idxM + 1}` })
                            }
                            onBlur={() => setActiveField(null)}
                            inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
                            placeholderTextColor="#9CA3AF"
                          />
                        ))}
                      </View>
                    ))}
                  </View>

                  <View style={styles.taskCard}>
                    <Text style={styles.taskTitle}>Tarea 4 — Acciones a realizar (1 por TOP) *</Text>
                    <Text style={styles.taskHint}>
                      Escribe una acción concreta para cada TOP. Estas acciones se reflejan en el PDF.
                    </Text>

                    {acciones.map((a, i) => (
                      <LabeledInput
                        key={i}
                        label={`Acción para TOP ${i + 1} *`}
                        value={acciones[i]}
                        onChangeText={(v) => {
                          if (lockedAfterPdf) return;
                          const nuevo = [...acciones];
                          nuevo[i] = v;
                          setAcciones(nuevo);
                        }}
                        multiline
                        editable={!lockedAfterPdf}
                        onFocus={() => setActiveField({ key: "accion", i, label: `TOP ${i + 1} — Acción` })}
                        onBlur={() => setActiveField(null)}
                        inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
                      />
                    ))}
                  </View>

                  {/* ✅ NUEVO: Cambio de condiciones (nuevo riesgo) */}
                  <View style={styles.taskCard}>
                    <Text style={styles.taskTitle}>
                      Cambio de condiciones — Nuevo riesgo y medida de control
                    </Text>
                    <Text style={styles.taskHint}>
                      Si durante el trabajo detectas un riesgo no contemplado, descríbelo y define la medida de control.
                    </Text>

                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => !lockedAfterPdf && setDetectaNuevoRiesgo((v) => !v)}
                      disabled={lockedAfterPdf}
                    >
                      <Ionicons
                        name={detectaNuevoRiesgo ? "checkbox" : "square-outline"}
                        size={20}
                        color={FIORI.accent}
                      />
                      <Text style={styles.checkboxLabel}>Sí, detecté un nuevo riesgo</Text>
                    </TouchableOpacity>

                    {detectaNuevoRiesgo && (
                      <View style={[styles.card, { marginBottom: 0 }]}>
                        {nuevosRiesgos.map((row, idx) => (
                          <View key={idx} style={{ marginBottom: 10 }}>
                            <Text style={styles.miniLabel}>Renglón {idx + 1}</Text>

                            <TextInput
                              style={styles.input}
                              placeholder="Nuevo riesgo"
                              value={row.riesgo}
                              onChangeText={(v) => setNuevoRiesgoCampo(idx, "riesgo", v)}
                              editable={!lockedAfterPdf}
                              onFocus={() =>
                                setActiveField({
                                  key: "nuevo_riesgo",
                                  i: idx,
                                  label: `Nuevo riesgo — renglón ${idx + 1}`,
                                })
                              }
                              onBlur={() => setActiveField(null)}
                              inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
                              placeholderTextColor="#9CA3AF"
                            />

                            <TextInput
                              style={styles.input}
                              placeholder="Medida de control"
                              value={row.medida}
                              onChangeText={(v) => setNuevoRiesgoCampo(idx, "medida", v)}
                              editable={!lockedAfterPdf}
                              onFocus={() =>
                                setActiveField({
                                  key: "nuevo_medida",
                                  i: idx,
                                  label: `Medida de control — renglón ${idx + 1}`,
                                })
                              }
                              onBlur={() => setActiveField(null)}
                              inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
                              placeholderTextColor="#9CA3AF"
                            />
                          </View>
                        ))}

                        {!nuevosRiesgosOk && (
                          <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>
                            Escribe al menos 1 “Nuevo riesgo” y su “Medida de control”.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {!paso3Ok && (
                    <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>
                      Para continuar: selecciona ≥3 riesgos, aplica TOP 3, escribe las 3 acciones,
                      y si marcaste “nuevo riesgo”, llena al menos un renglón.
                    </Text>
                  )}
                </>
              ) : (
                riesgosSeleccionadosIds.length >= 3 && (
                  <Text style={{ color: FIORI.textMuted, fontSize: 12, marginTop: 6 }}>
                    Selecciona TOP 1/2/3 y presiona “Aplicar TOP 3” para habilitar las tareas 3 y 4.
                  </Text>
                )
              )}
            </View>
          )}

          {/* PASO 4 */}
          {paso === 4 && (
            <View>
              <SectionTitle title="4. Firma del técnico" />

              <SectionSubTitle text="Firma del técnico (obligatoria)" />
              <View style={styles.card}>
                <View style={styles.firmaBox}>
                  {firmaTecnico ? (
                    <Image source={{ uri: toDataUrl(firmaTecnico) }} style={styles.firmaPreview} resizeMode="contain" />
                  ) : (
                    <Text style={{ color: FIORI.textMuted }}>Sin firma</Text>
                  )}
                </View>

                <View style={styles.firmaBtnRow}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                    onPress={() => setModalFirma({ open: true, tipo: "tecnico" })}
                    disabled={lockedAfterPdf}
                  >
                    <Text style={[styles.smallBtnText, { color: "#fff" }]}>Firmar</Text>
                  </TouchableOpacity>
                  {firmaTecnico && (
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: "#6b7280" }]}
                      onPress={() => !lockedAfterPdf && setFirmaTecnico(null)}
                      disabled={lockedAfterPdf}
                    >
                      <Text style={[styles.smallBtnText, { color: "#fff" }]}>Borrar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {!paso4Ok && (
                <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>
                  Captura la firma del técnico para poder enviar.
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Controles de paso */}
      <View style={styles.footerNav}>
        {paso > 1 && (
          <TouchableOpacity
            onPress={goPrev}
            style={[styles.navBtn, styles.navBtnSecondary]}
            disabled={lockedAfterPdf}
          >
            <Text style={[styles.navBtnTextSecondary]}>Atrás</Text>
          </TouchableOpacity>
        )}

        {paso < 4 && (
          <TouchableOpacity
            onPress={goNext}
            style={[styles.navBtn, styles.navBtnPrimary, !canNext && { opacity: 0.5 }]}
            disabled={lockedAfterPdf}
          >
            <Text style={styles.navBtnTextPrimary}>Siguiente</Text>
          </TouchableOpacity>
        )}

        {paso === 4 && (
          <TouchableOpacity
            onPress={onGuardarYGenerarPdf}
            style={[
              styles.navBtn,
              styles.navBtnPrimaryStrong,
              (saving || !canSubmit || lockedAfterPdf) && { opacity: 0.6 },
            ]}
            disabled={saving || !canSubmit || lockedAfterPdf}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.navBtnTextPrimary}>Guardar y enviar a SAP</Text>}
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
            <Text style={styles.modalHeaderTitle}>Firma del técnico</Text>
            <TouchableOpacity onPress={() => setModalFirma({ open: false, tipo: null })}>
              <Ionicons name="close" size={22} color={FIORI.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <Signature
              onOK={(val) => {
                const cleanB64 = sanitize(toBase64(val));
                setFirmaTecnico(cleanB64);
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

      {/* ✅ Recuadro flotante arriba del teclado */}
      {Platform.OS === "android" && !!activeField?.key && (
        <Animated.View style={[styles.kbBar, { bottom: keyboardBottom }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kbBarTitle}>{activeField?.label}:</Text>
            <Text style={styles.kbBarValue} numberOfLines={4}>
              {kbPreviewValue || " "}
            </Text>
          </View>

          <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.kbBarBtn}>
            <Text style={styles.kbBarBtnText}>Listo</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={styles.kbBarIOS}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kbBarTitle}>{activeField?.label || "Escribiendo"}:</Text>
              <Text style={styles.kbBarValue} numberOfLines={4}>
                {kbPreviewValue || " "}
              </Text>
            </View>

            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.kbBarBtn}>
              <Text style={styles.kbBarBtnText}>Listo</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      {/* ✅ BLOQUEO TOTAL mientras saving=true (PDF/SAP) */}
      <Modal visible={saving} transparent animationType="fade">
        <View style={styles.blockerBackdrop}>
          <View style={styles.blockerCard}>
            <ActivityIndicator size="large" color={FIORI.accent} />
            <Text style={styles.blockerTitle}>Procesando…</Text>
            <Text style={styles.blockerText}>
              Generando PDF y enviando a SAP. No cierres la app.
            </Text>
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

/* ✅ Helpers ToAddresses */
function buildRazonSocial(a) {
  const parts = [a?.Name1, a?.Name2, a?.Name3, a?.Name4]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return parts.join(" ").trim();
}

function buildDireccion(a) {
  const street = [a?.Street, a?.HouseNum1]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");
  const supl = [a?.StrSuppl1, a?.StrSuppl2, a?.StrSuppl3]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");
  const loc = [a?.Location, a?.City2, a?.City1]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");
  const reg = [a?.Region, a?.PostCode1]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");
  return [street, supl, loc, reg]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");
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

function LabeledInput({
  label,
  value,
  onChangeText,
  multiline = false,
  height,
  editable = true,
  onFocus,
  onBlur,
  inputAccessoryViewID,
}) {
  const safeOnChange = typeof onChangeText === "function" ? onChangeText : () => {};
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
        onChangeText={safeOnChange}
        editable={editable}
        multiline={multiline}
        onFocus={onFocus}
        onBlur={onBlur}
        inputAccessoryViewID={inputAccessoryViewID}
        placeholderTextColor="#9CA3AF"
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
  stepCircleActive: {
    borderColor: FIORI.accent,
    backgroundColor: FIORI.accentSoft,
  },
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

  taskCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  taskTitle: { fontSize: 14, fontWeight: "900", color: FIORI.ink },
  taskHint: { fontSize: 12, color: FIORI.textMuted, marginTop: 6, marginBottom: 8, lineHeight: 16 },

  fixedTile: {
    backgroundColor: FIORI.cardBg,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 10,
  },

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
    marginBottom: 8,
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
  pdfModalCard: { width: "100%", maxWidth: 600, backgroundColor: "#fff", borderRadius: 12, overflow: "hidden" },
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
  bigActionBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
  bigActionText: { fontWeight: "800", fontSize: 13 },

  // ✅ Barra arriba del teclado (Android)
  kbBar: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: FIORI.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 9999,
    elevation: 20,
  },
  // ✅ Barra arriba del teclado (iOS - accessory)
  kbBarIOS: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: FIORI.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 9999,
  },
  kbBarTitle: { fontSize: 12, color: FIORI.textMuted, fontWeight: "700", marginBottom: 2 },
  kbBarValue: { fontSize: 14, color: FIORI.text, fontWeight: "700" },
  kbBarBtn: { backgroundColor: FIORI.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  kbBarBtnText: { color: "#fff", fontWeight: "900" },

  // ✅ blocker overlay
  blockerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  blockerCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  blockerTitle: { marginTop: 10, fontSize: 16, fontWeight: "900", color: FIORI.ink },
  blockerText: { marginTop: 6, fontSize: 12, color: FIORI.textMuted, textAlign: "center", lineHeight: 16 },
});
