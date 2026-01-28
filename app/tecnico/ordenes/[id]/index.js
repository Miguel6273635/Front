// app/ordenes/[id]/index.js
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  FlatList,
} from "react-native";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { useLocalSearchParams, router } from "expo-router";

import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

// ✅ Secciones (segmentación)
import EncabezadoDetalleOrden from "./secciones/EncabezadoDetalleOrden";
import ModalesDetalleOrden from "./secciones/ModalesDetalleOrden";
import { ListaOperacionesAgrupadas } from "./secciones/ListaOperacionesDetalle";
import PieDetalleOrden from "./secciones/PieDetalleOrden";

/* ====================== Paleta SAP Fiori (Horizon) ====================== */
const FIORI = {
  pageBg: "#F7F7F7",
  surface: "#FFFFFF",
  surfaceAlt: "#F5F7FA",
  border: "#DDE6F2",
  borderSoft: "#E8EEF7",
  text: "#0B1F3B",
  textMuted: "#63718B",
  brand: "#0A6ED1",
  brandSoft: "#E3F2FD",
  ok: "#2FBF71",
  warn: "#F5A623",
  err: "#E74C3C",
  pause: "#26a5e0ff",
};


/* ====================== Orden iniciada (contador) ====================== */
const ORDER_START_KEY = (orderId) => `orderStart:${orderId}`;

// ⚠️ CAMBIA ESTA URL por tu endpoint REAL
const ORDER_STATUS_URL = () => `/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet`;


function msToHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

async function loadOrderStart(orderId) {
  try {
    const raw = await AsyncStorage.getItem(ORDER_START_KEY(orderId));
    const v = raw ? Number(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

async function saveOrderStart(orderId, ms) {
  try {
    await AsyncStorage.setItem(ORDER_START_KEY(orderId), String(ms));
  } catch {}
}

/* ====================== Helpers generales ====================== */
// ✅ Soporta ISO y SAP OData "/Date(1700000000000)/"
function parseSapDateToMs(val) {
  if (!val) return null;

  if (typeof val === "string" && val.includes("/Date(")) {
    const ms = Number(val.replace("/Date(", "").replace(")/", ""));
    return Number.isFinite(ms) ? ms : null;
  }

  const t = new Date(val).getTime();
  return Number.isFinite(t) ? t : null;
}

function fmtDMY(val) {
  const ms = parseSapDateToMs(val);
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString();
}

const opKey = (orderId, op) =>
  `${orderId}-${op.activity || op.Activity || ""}${
    op.subactivity || op.SubActivity ? `-${op.subactivity || op.SubActivity}` : ""
  }`;

/* ====================== ✅ Dirección igual que rutas-asignadas ====================== */
function mapDireccionLikeBackend(addr) {
  if (!addr) return { cliente: "", direccion: "" };

  const Name1 = addr.Name1 ?? "";
  const Name2 = addr.Name2 ?? "";
  const Street = addr.Street ?? addr.StreetName ?? "";
  const HouseNum1 = addr.HouseNum1 ?? "";
  const StrSuppl3 = addr.StrSuppl3 ?? "";
  const Location = addr.Location ?? "";
  const City1 = addr.City1 ?? "";
  const Region = addr.Region ?? "";
  const PostCode1 = addr.PostCode1 ?? "";
  const Country = addr.Country ?? "";

  const cliente = [Name1, Name2].filter(Boolean).join(" ").trim();

  const direccion = [
    `${Street} ${HouseNum1}`.trim(),
    StrSuppl3,
    Location,
    City1,
    Region,
    PostCode1,
    Country,
  ]
    .filter((x) => x && String(x).trim().length > 0)
    .join(", ");

  return { cliente, direccion };
}

function pickSecondAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results.length >= 2 ? results[1] : results[0];
}

/* ===== Estado local de operaciones (SIN BD) ===== */
const OPSTATE_KEY = (orderId) => `opState:${orderId}`;
async function loadOpState(orderId) {
  try {
    const raw = await AsyncStorage.getItem(OPSTATE_KEY(orderId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function mergeOpsWithLocalState(orderId, ops, state) {
  return (ops || []).map((o) => {
    const id = o.id || opKey(orderId, o);
    const st = state?.[id] || {};

    const sapEstatus = (o.estatus || "pendiente").toLowerCase();

    const estatusFinal =
      sapEstatus === "finalizada"
        ? "finalizada"
        : st.estatus || sapEstatus || "pendiente";

    return {
      ...o,
      id,
      estatus: estatusFinal,
      worked_ms: st.worked_ms ?? o.worked_ms ?? 0,
      last_resume_at: st.last_resume_at ?? o.last_resume_at ?? null,
      Strttimcon: st.started_at ?? o.Strttimcon ?? null,
      Fintimcons: st.finished_at ?? o.Fintimcons ?? null,
      paused_at: st.paused_at ?? o.paused_at ?? null,
      pause_motivo: st.pause_motivo ?? o.pause_motivo ?? null,
    };
  });
}

/* ====== Helper para formatear valores en Row (incluida dirección) ====== */
function formatValueForRow(value) {
  if (value == null) return "—";

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return String(value);

  if (t === "object") {
    const {
      calle,
      street,
      colonia,
      neighborhood,
      municipio,
      city,
      estado,
      region,
      estado_provincia,
      cp,
      postalCode,
      zip,
      pais,
      country,
      full,
      direccion,
    } = value;

    const posibleFull = full || direccion || value.fullAddress || value.addressString;
    if (posibleFull && typeof posibleFull === "string") return posibleFull;

    const partes = [
      calle || street,
      colonia || neighborhood,
      municipio || city,
      estado || region || estado_provincia,
      cp || postalCode || zip,
      pais || country,
    ]
      .filter(Boolean)
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0);

    if (partes.length) return partes.join(", ");

    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }

  try {
    return String(value);
  } catch {
    return "—";
  }
}

/** ============================================================
 *  ✅ Normalizador de operaciones (del endpoint backend)
 *  backend devuelve: { Activity, SubActivity, Description, ... }
 *  aquí lo convertimos a: { activity, subactivity, description, ... }
 *  ============================================================ */
function normalizeOpsFromBackend(ops = []) {
  if (!Array.isArray(ops)) return [];
  return ops.map((op) => {
    const Activity = op.Activity || op.activity || op.Vornr || "";
    const SubActivity = op.SubActivity || op.subactivity || op.Uvorn || "";
    const Description = op.Description || op.description || op.Ltxa1 || "";
    const StandardTextKey = op.StandardTextKey || op.standardTextKey || "";

    return {
      ...op,
      activity: String(Activity || ""),
      subactivity: String(SubActivity || ""),
      description: String(Description || ""),
      Activity: String(Activity || ""),
      SubActivity: String(SubActivity || ""),
      Description: String(Description || ""),
      StandardTextKey: String(StandardTextKey || ""),
      standardTextKey: String(StandardTextKey || ""),
    };
  });
}

/* ====================== Componente ====================== */
export default function DetalleOrden() {
  const { id } = useLocalSearchParams();
  const { user, token } = useAuth();

  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);

  const [soundObj, setSoundObj] = useState(null);

  const signatureRef = useRef(null);

  // modal materiales por operación (SOLO VIEW)
  const [showCompModal, setShowCompModal] = useState(false);
  const [selectedOp, setSelectedOp] = useState(null);
  const [compList, setCompList] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(false);

  // modal materiales orden
  const [showAllMaterialsModal, setShowAllMaterialsModal] = useState(false);

  // modal PDF no mantenimiento
  const [showNoMantPdfModal, setShowNoMantPdfModal] = useState(false);
  const [noMantPdfUrl, setNoMantPdfUrl] = useState(null);
  const [noMantPdfRawUrl, setNoMantPdfRawUrl] = useState(null);
  const [loadingNoMantPdf, setLoadingNoMantPdf] = useState(false);
  const [noMantError, setNoMantError] = useState(null);
  const [downloadingNoMantPdf, setDownloadingNoMantPdf] = useState(false);

  // finalizar orden (firma)
  const [finishingOrder, setFinishingOrder] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);

  // ===== iniciar orden + contador =====
  const [startingOrder, setStartingOrder] = useState(false);
  const [orderStartedAtMs, setOrderStartedAtMs] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // ===== estatus orden / bloqueo =====
  const statusCode = String(orden?.estatus_code || orden?.userstatus || "").trim();
  const statusTipo = String(orden?.estatus_tipo || "").toUpperCase();
  const isNoMant = statusTipo === "NO_MANTENIMIENTO";
  const isOrderSinEmpezar = !statusCode;
  const isOrderPendiente0100 = statusCode === "0100";
  const isOrderFinished = !!orden?.isFinal || ["0300", "0400", "0500"].includes(statusCode);

  // Tick solo cuando ya está iniciada (0200) y tenemos startedAt
  useEffect(() => {
    if (!orderStartedAtMs) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [orderStartedAtMs]);

  const checkinDone =
    !!orden?.checkin_done ||
    !!orden?.checkin ||
    !!orden?.checked_in ||
    statusCode === "0200";

  const isOpsLocked =
    isNoMant || isOrderSinEmpezar || isOrderPendiente0100 || isOrderFinished || !checkinDone;

  /** ============================================================
   *  ✅ OBTENER ORDEN + ✅ DIRECCIÓN + ✅ OPERACIONES + ✅ LOCAL STATE
   *  ============================================================ */
  const obtenerOrden = async () => {
    try {
      setLoading(true);

      // 1) detalle orden
      const resOrden = await api.get(`/api/ordenes/sap/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const baseOrden = resOrden.data || {};

      // 1.1) Dirección igual que rutas-asignadas
      let direccionSap = "";
      let clienteSap = "";

      try {
        const resAddr = await api.get(`/api/ordenes/sap/${id}/addresses`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const results = resAddr?.data?.results || resAddr?.data?.d?.results || [];
        const chosen = pickSecondAddress(results);
        const mapped = mapDireccionLikeBackend(chosen);

        direccionSap = mapped.direccion || "";
        clienteSap = mapped.cliente || "";
      } catch (e) {
        console.warn("[ADDR] no se pudo cargar /addresses:", e?.response?.data || e?.message || e);
      }

      // 2) operaciones SAP (endpoint bonito)
      let ops = [];
      try {
        const resOps = await api.get(`/api/operaciones/sap/${String(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        ops = normalizeOpsFromBackend(resOps.data);
      } catch (e) {
        console.warn(
          "No se pudieron cargar operaciones (nuevo endpoint):",
          e?.response?.data || e
        );
        ops = normalizeOpsFromBackend(baseOrden?.operaciones || []);
      }

      // 3) asegurar id compuesto
      const orderIdReal = String(baseOrden?.Orderid || baseOrden?.OrderId || id);
      const opsWithId = ops.map((o) => ({ ...o, id: o.id || opKey(orderIdReal, o) }));

      // 4) cargar estado local y mezclar
      const localState = await loadOpState(orderIdReal);
      const opsMerged = mergeOpsWithLocalState(orderIdReal, opsWithId, localState);

      // 5) inyectar direccion/cliente
      const data = {
        ...baseOrden,
        direccion:
          direccionSap ||
          baseOrden?.direccion ||
          baseOrden?.address ||
          baseOrden?.partner_address ||
          "",
        cliente:
          clienteSap ||
          baseOrden?.cliente ||
          `${baseOrden?.Name1 ?? ""} ${baseOrden?.Name2 ?? ""}`.trim(),
        operaciones: opsMerged,
      };

      setOrden(data);

      // Si la orden está en 0200, cargamos el start local para el contador
      const finalStatus = String(data?.estatus_code || data?.userstatus || "").trim();
      if (finalStatus === "0200") {
        const savedStart = await loadOrderStart(orderIdReal);
        if (savedStart) setOrderStartedAtMs(savedStart);
      } else {
        setOrderStartedAtMs(null);
      }
    } catch (error) {
      console.error("Error al obtener orden (SAP):", error?.response?.data || error);
      Alert.alert("Error", "No se pudo cargar la orden desde SAP");
    } finally {
      setLoading(false);
    }
  };

  // Abrir modal de componentes (SOLO VIEW)
  const openComponentsModal = async (op) => {
    try {
      setSelectedOp(op);
      setCompList([]);
      setShowCompModal(true);
      setLoadingComponents(true);

      const Orderid = orden?.Orderid || id;
      const Activity = op.activity || op.Activity;

      const res = await api.get(
        `/api/operaciones/ordenes/${Orderid}/operaciones/${Activity}/componentes`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setCompList(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error al obtener componentes:", error?.response?.data || error);
      Alert.alert("Materiales", "No se pudieron obtener los materiales de esta operación.");
    } finally {
      setLoadingComponents(false);
    }
  };

  const closeComponentsModal = () => {
    setShowCompModal(false);
    setSelectedOp(null);
    setCompList([]);
  };

  // Sonido (lo dejas porque lo tienes)
  useEffect(() => {
    let mounted = true;
    let localSound = null;

    (async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(require("../../../../assets/alert.mp3"));
        localSound = sound;
        if (mounted) setSoundObj(sound);
      } catch (e) {
        console.warn("No se pudo cargar el sonido de alerta:", e);
      }
    })();

    return () => {
      mounted = false;
      try {
        localSound?.unloadAsync?.();
      } catch {}
    };
  }, []);

  // Navegación a aviso de avería
  const irAAvisoAveria = (e) => {
    e?.stopPropagation?.();
    if (!orden?.Orderid) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }
    const orderid = String(orden.Orderid).trim();
    router.push({ pathname: "/tecnico/ordenes/[id]/aviso-averia", params: { id: orderid } });
  };

  // ======= Iniciar orden (0100 -> 0200) + contador =======
  const iniciarOrden = async () => {
    if (!orden?.Orderid) return;

    const orderId = String(orden.Orderid).trim();

    Alert.alert("Iniciar orden", "¿Confirmas que deseas marcar la orden como INICIADA?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sí, iniciar",
        onPress: async () => {
          try {
            setStartingOrder(true);

            const payload = {
              OrderId: orderId,
              WorkOrderHeader: { Orderid: orderId },
              WorkOrderUserStatusSet: [
                { UserStText: "0200", Langu: "ES", Inactive: "" },
                { UserStText: "0100", Langu: "ES", Inactive: "X" },
              ],
              Return: [],
            };

            await api.post(ORDER_STATUS_URL(), payload, {
              headers: { Authorization: `Bearer ${token}` },
            });


            // Guardamos start local para el contador
            const startMs = Date.now();
            await saveOrderStart(orderId, startMs);
            setOrderStartedAtMs(startMs);

            // Actualizamos UI sin esperar recarga
            setOrden((prev) =>
              prev
                ? {
                    ...prev,
                    estatus_code: "0200",
                    userstatus: "0200",
                    estatus_label: prev?.estatus_label || "INICIADA",
                  }
                : prev
            );

            Alert.alert("Listo", "Orden marcada como iniciada (0200).");
          } catch (e) {
            console.error("Error al iniciar orden:", e?.response?.data || e);
            Alert.alert("Error", "No se pudo iniciar la orden. Revisa logs del backend/SAP.");
          } finally {
            setStartingOrder(false);
          }
        },
      },
    ]);
  };

  // PDF No mantenimiento (igual)
  const abrirModalNoMantPdf = async () => {
    if (!orden?.Orderid) return;

    setShowNoMantPdfModal(true);
    setLoadingNoMantPdf(true);
    setNoMantPdfUrl(null);
    setNoMantPdfRawUrl(null);
    setNoMantError(null);

    try {
      const res = await api.get(`/evidencias/orden/${orden.Orderid}/no-mantenimiento-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { pdf_url } = res.data || {};
      if (!pdf_url) throw new Error("Sin URL de PDF desde backend");

      const apiBase = api.defaults.baseURL || "";
      const serverRoot = apiBase.replace(/\/api\/?$/, "");

      const rawUrl = pdf_url.startsWith("http") ? pdf_url : `${serverRoot}${pdf_url}`;
      setNoMantPdfRawUrl(rawUrl);

      const viewerUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(rawUrl)}`;
      setNoMantPdfUrl(viewerUrl);
    } catch (error) {
      console.error("Error al obtener PDF no mantto:", error?.response?.data || error);
      setNoMantError("No se pudo cargar el PDF de la carta de no mantenimiento.");
    } finally {
      setLoadingNoMantPdf(false);
    }
  };

  const cerrarModalNoMantPdf = () => {
    setShowNoMantPdfModal(false);
    setNoMantPdfUrl(null);
    setNoMantPdfRawUrl(null);
    setNoMantError(null);
    setDownloadingNoMantPdf(false);
  };

  const descargarNoMantPdf = async () => {
    if (!noMantPdfRawUrl) {
      Alert.alert("Sin archivo", "No se encontró la URL del PDF para descargar.");
      return;
    }

    try {
      setDownloadingNoMantPdf(true);

      const filename = noMantPdfRawUrl.split("/").pop() || `carta-no-mantto_${orden?.Orderid || ""}.pdf`;
      const localUri = FileSystem.documentDirectory + filename;

      const { uri } = await FileSystem.downloadAsync(noMantPdfRawUrl, localUri);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Descarga completa", "El PDF se guardó en la carpeta de documentos de la app.");
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Compartir / guardar carta de no mantenimiento",
      });
    } catch (e) {
      console.error("Error al descargar PDF:", e);
      Alert.alert("Error", "No se pudo descargar el PDF. Verifica acceso a la URL del servidor.");
    } finally {
      setDownloadingNoMantPdf(false);
    }
  };

  // Finalizar orden (firma) — lo dejo porque tú lo tienes en tu flujo
  const handleFinalizarOrden = () => {
    if (!orden?.Orderid) return;

    Alert.alert("Firma del cliente", 'Antes de finalizar la orden, el cliente debe firmar.\n\n¿Deseas capturar la firma ahora?', [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sí, capturar firma",
        onPress: () => {
          setSignatureData(null);
          setShowSignModal(true);
        },
      },
    ]);
  };

  const confirmarFinalizarConFirma = async () => {
    if (!orden?.Orderid) return;

    if (!signatureData) {
      Alert.alert("Falta firma", 'Pida al cliente que firme y toque "Listo" dentro del recuadro.');
      return;
    }

    try {
      setSavingSignature(true);
      setFinishingOrder(true);

      try {
        await api.post(
          `/evidencias/orden/${orden.Orderid}/firma-final`,
          { imagen_base64: signatureData },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (e) {
        console.warn("No se pudo guardar la firma (continuo):", e?.response?.data || e);
      }

      setShowSignModal(false);

      Alert.alert("Orden finalizada", "La orden se marcó como finalizada.");
      router.replace("/tecnico/ordenes");
    } catch (error) {
      console.error("Error al finalizar orden con firma:", error?.response?.data || error);
      Alert.alert("Error", "No se pudo finalizar la orden. Intenta de nuevo.");
    } finally {
      setSavingSignature(false);
      setFinishingOrder(false);
    }
  };

  // ================== Efectos ==================
  useEffect(() => {
    obtenerOrden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================== Render ==================
  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={`Orden ${id || ""}`} />

        {/* ===== Barra superior: iniciar / contador (en loading) ===== */}
        {isOrderPendiente0100 ? (
          <View style={styles.topActionBar}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.startOrderBtn, startingOrder && { opacity: 0.7 }]}
              onPress={iniciarOrden}
              disabled={startingOrder}
            >
              <Ionicons name="play-circle-outline" size={18} color="#fff" />
              <Text style={styles.startOrderBtnText}>
                {startingOrder ? "Iniciando..." : "Iniciar orden"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : statusCode === "0200" && orderStartedAtMs ? (
          <View style={styles.topActionBar}>
            <View style={styles.timerPill}>
              <Ionicons name="time-outline" size={16} color={FIORI.text} />
              <Text style={styles.timerText}>{msToHMS(nowTick - orderStartedAtMs)}</Text>
            </View>
          </View>
        ) : null}

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={FIORI.brand} />
          <Text style={{ marginTop: 10, color: FIORI.textMuted, fontWeight: "700" }}>
            Cargando orden…
          </Text>
        </View>
      </View>
    );
  }

  if (!orden) {
    return (
      <View style={styles.container}>
        <Header title={`Orden ${id || ""}`} />
        <Text style={styles.error}>No se pudo cargar la orden.</Text>
      </View>
    );
  }

  const estatusColor = isNoMant
    ? FIORI.textMuted
    : isOrderFinished
    ? FIORI.ok
    : !statusCode
    ? FIORI.err
    : statusCode === "0100"
    ? FIORI.err
    : statusCode === "0200"
    ? FIORI.warn
    : FIORI.ok;

  const direccionValor = orden.direccion || orden.address || orden.partner_address || null;
  const allMaterials = Array.isArray(orden.componentes) ? orden.componentes : [];

  return (
    <View style={styles.container}>
      <Header title={`Orden ${orden?.Orderid || id || ""}`} />

      {/* ✅ AQUÍ ES DONDE FALTABA: Barra superior cuando YA CARGÓ */}
      {isOrderPendiente0100 ? (
        <View style={styles.topActionBar}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.startOrderBtn, startingOrder && { opacity: 0.7 }]}
            onPress={iniciarOrden}
            disabled={startingOrder}
          >
            <Ionicons name="play-circle-outline" size={18} color="#fff" />
            <Text style={styles.startOrderBtnText}>
              {startingOrder ? "Iniciando..." : "Iniciar orden"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : statusCode === "0200" && orderStartedAtMs ? (
        <View style={styles.topActionBar}>
          <View style={styles.timerPill}>
            <Ionicons name="time-outline" size={16} color={FIORI.text} />
            <Text style={styles.timerText}>{msToHMS(nowTick - orderStartedAtMs)}</Text>
          </View>
        </View>
      ) : null}

      <FlatList
        style={{ flex: 1 }}
        data={[{ _k: "single" }]}
        keyExtractor={(x) => x._k}
        contentContainerStyle={[styles.content, { paddingBottom: 140 }]}
        ListHeaderComponent={
          <EncabezadoDetalleOrden
            orden={orden}
            id={id}
            styles={styles}
            FIORI={FIORI}
            estatusColor={estatusColor}
            isNoMant={isNoMant}
            checkinDone={checkinDone}
            isOrderFinished={isOrderFinished}
            direccionValor={direccionValor}
            allMaterialsLen={allMaterials.length}
            fmtDMY={fmtDMY}
            formatValueForRow={formatValueForRow}
            onAbrirPdfNoMant={abrirModalNoMantPdf}
            onVerMaterialesOrden={() => setShowAllMaterialsModal(true)}
          />
        }
        renderItem={() => {
          const ops = Array.isArray(orden?.operaciones) ? orden.operaciones : [];
          return (
            <ListaOperacionesAgrupadas
              operaciones={ops}
              styles={styles}
              FIORI={FIORI}
              onOpenComponentsView={openComponentsModal}
            />
          );
        }}
        ListFooterComponent={
          <PieDetalleOrden
            styles={styles}
            FIORI={FIORI}
            isNoMant={isNoMant}
            userRolId={user?.rol_id}
            finishingOrder={finishingOrder}
            onIrManttoElevador={(e) => {
              e?.stopPropagation?.();
              const p = {
                orderid: String(orden?.Orderid ?? id ?? ""),
                equipment: String(orden?.equipment ?? orden?.Equipment ?? ""),
                tecnico_nombre: String(orden?.tecnico_nombre ?? user?.nombre ?? user?.email ?? ""),
                Name1: String(orden?.Name1 ?? ""),
                Name2: String(orden?.Name2 ?? ""),
                cliente: String(orden?.cliente ?? ""),
                direccion:
                  typeof direccionValor === "string" ? direccionValor : JSON.stringify(direccionValor),
              };
              router.push({ pathname: "/tecnico/ordenes/[orderid]/reporte-mant-elevadores", params: p });
            }}
            onIrManttoEscalera={() => {}}
            onFinalizarOrden={handleFinalizarOrden}
          />
        }
      />

      {!isOpsLocked && (
        <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={(e) => irAAvisoAveria(e)}>
          <Ionicons name="warning-outline" size={20} color="#000000ff" />
          <Text style={styles.fabLabel}>Avería</Text>
        </TouchableOpacity>
      )}

      <ModalesDetalleOrden
        styles={styles}
        FIORI={FIORI}
        orden={orden}
        allMaterials={allMaterials}
        // Todos materiales
        showAllMaterialsModal={showAllMaterialsModal}
        setShowAllMaterialsModal={setShowAllMaterialsModal}
        // Materiales por operación (solo view)
        showCompModal={showCompModal}
        closeComponentsModal={closeComponentsModal}
        selectedOp={selectedOp}
        loadingComponents={loadingComponents}
        compList={compList}
        // Firma
        showSignModal={showSignModal}
        setShowSignModal={setShowSignModal}
        signatureRef={signatureRef}
        signatureData={signatureData}
        setSignatureData={setSignatureData}
        savingSignature={savingSignature}
        confirmarFinalizarConFirma={confirmarFinalizarConFirma}
        // PDF no mantenimiento
        showNoMantPdfModal={showNoMantPdfModal}
        cerrarModalNoMantPdf={cerrarModalNoMantPdf}
        loadingNoMantPdf={loadingNoMantPdf}
        noMantError={noMantError}
        noMantPdfUrl={noMantPdfUrl}
        noMantPdfRawUrl={noMantPdfRawUrl}
        descargarNoMantPdf={descargarNoMantPdf}
        downloadingNoMantPdf={downloadingNoMantPdf}
      />
    </View>
  );
}

/* ====================== Estilos ====================== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },
  content: { padding: 16, paddingBottom: 28 },

  headerBox: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    ...elev(0.4),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  titulo: { fontSize: 18, fontWeight: "800", color: FIORI.text },

  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8 },
  statusBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  noMantBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    backgroundColor: FIORI.surfaceAlt,
    marginBottom: 12,
    ...elev(0.3),
  },
  noMantTitle: { fontSize: 14, fontWeight: "800", color: FIORI.text, marginBottom: 4 },
  noMantText: { fontSize: 12, color: FIORI.textMuted },
  btnNoMantBanner: {
    marginLeft: 10,
    backgroundColor: FIORI.brand,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  btnNoMantBannerText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  panel: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    marginBottom: 12,
    ...elev(0.4),
  },
  panelTitle: { fontSize: 14, fontWeight: "800", color: FIORI.text, marginBottom: 8 },

  row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: FIORI.borderSoft },
  rowLabel: { fontSize: 13, color: FIORI.textMuted, marginBottom: 2 },
  rowValue: { fontSize: 14, color: FIORI.text, fontWeight: "600" },

  btnSeeMaterials: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: FIORI.brand,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnSeeMaterialsText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  labelInline: { fontWeight: "700", color: FIORI.text },
  value: { color: FIORI.text, marginBottom: 4 },

  sectionKicker: {
    fontSize: 13,
    color: FIORI.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  // ✅ para ListaOperacionesAgrupadas (acordeones)
  grupoCard: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 12,
    ...elev(0.4),
  },
  grupoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  grupoTitle: { fontSize: 14, fontWeight: "900", color: FIORI.text },
  grupoMeta: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },
  grupoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: FIORI.border,
    backgroundColor: FIORI.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  grupoBadgeText: { fontWeight: "900", color: FIORI.text, fontSize: 12 },

  // ✅ operación compacta
  operCardSmall: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    padding: 10,
  },
  badgeSmall: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeSmallText: { fontSize: 11, fontWeight: "900", color: FIORI.text },
  operTitleSmall: { fontSize: 13, fontWeight: "900", color: FIORI.text },
  operDescSmall: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },
  operHintSmall: { fontSize: 12, color: FIORI.textMuted, fontWeight: "700" },

  error: { marginTop: 40, textAlign: "center", fontSize: 16, color: FIORI.err },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 80,
    backgroundColor: FIORI.warn,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...elev(0.8),
  },
  fabLabel: { color: "#000000ff", fontWeight: "800", fontSize: 13 },

  // ===== Botón iniciar / contador =====
  topActionBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  startOrderBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: FIORI.brand,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...elev(0.6),
  },
  startOrderBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  timerPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: FIORI.surface,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...elev(0.3),
  },
  timerText: {
    color: FIORI.text,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.3,
  },

  block: { marginTop: 6, marginBottom: 2 },
  blockTitle: { fontSize: 14, fontWeight: '800', color: FIORI.text, marginBottom: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  cardWrap: { width: '50%', paddingHorizontal: 6, marginBottom: 12 },
  card: { borderRadius: 14, minHeight: 96, padding: 14, justifyContent: 'space-between', ...elev(0.6) },
  cardTop: { flexDirection: 'row', justifyContent: 'flex-end' },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    ...elev(0.2),
  },
  cardTitle: { color: '#fff', fontWeight: '900', fontSize: 15, lineHeight: 18 },

  btnFinishOrder: {
    backgroundColor: '#0B8457',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...elev(0.7),
  },
  btnFinishOrderText: { color: '#fff', fontWeight: '900', fontSize: 15 },



});

function elev(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 8 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });
}
