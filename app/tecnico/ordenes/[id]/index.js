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
  AppState,
  Modal,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { useLocalSearchParams, router } from "expo-router";
import {
  loadOrdenTecnicoDetail,
  saveOrdenTecnicoDetail,
} from "../../../../src/offline/ordenesTecnicoCache";
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

// ✅ Cola offline SAP
import { processSapQueue, upsertSapQueueItem } from "../../../../src/offline/sapQueue";

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
/* ✅ FIN local (para mostrar hora fin cuando ya finaliza) */
const ORDER_FINISH_KEY = (orderId) => `orderFinish:${orderId}`;

/* ====================== ✅ Pendiente de firma (persistir checks) ====================== */
const PENDING_SIGN_KEY = (orderId) => `pendingSign:${orderId}`;

/* ===== Estado local de operaciones (SIN BD) ===== */
const OPSTATE_KEY = (orderId) => `opState:${orderId}`;

/* ====================== Utils tiempo ====================== */
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

async function clearOrderStart(orderId) {
  try {
    await AsyncStorage.removeItem(ORDER_START_KEY(orderId));
  } catch {}
}

async function loadOrderFinish(orderId) {
  try {
    const raw = await AsyncStorage.getItem(ORDER_FINISH_KEY(orderId));
    const v = raw ? Number(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

async function saveOrderFinish(orderId, ms) {
  try {
    await AsyncStorage.setItem(ORDER_FINISH_KEY(orderId), String(ms));
  } catch {}
}

async function clearOrderFinish(orderId) {
  try {
    await AsyncStorage.removeItem(ORDER_FINISH_KEY(orderId));
  } catch {}
}

async function loadPendingSign(orderId) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SIGN_KEY(orderId));
    return raw ? JSON.parse(raw) : null; // { checkedMap, savedAt }
  } catch {
    return null;
  }
}

async function savePendingSign(orderId, payload) {
  try {
    await AsyncStorage.setItem(PENDING_SIGN_KEY(orderId), JSON.stringify(payload));
  } catch {}
}

async function clearPendingSign(orderId) {
  try {
    await AsyncStorage.removeItem(PENDING_SIGN_KEY(orderId));
  } catch {}
}

async function loadOpState(orderId) {
  try {
    const raw = await AsyncStorage.getItem(OPSTATE_KEY(orderId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveOpState(orderId, state) {
  try {
    await AsyncStorage.setItem(OPSTATE_KEY(orderId), JSON.stringify(state || {}));
  } catch {}
}

/* ====================== Helpers generales ====================== */
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

/* ====== SAP helpers para fechas/horas y prorrateo (FINAL 0300 + CONFIRMATIONS) ====== */
function msToMinutesRounded(ms) {
  const min = Math.round(ms / 60000);
  return Math.max(1, min);
}

function sapDateFromMs(ms) {
  const d = new Date(ms);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return `/Date(${midnight})/`;
}

function sapTimePTFromMs(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  return `PT${h}H${m}M${s}S`;
}

function prorateMinutes(totalMin, n) {
  const base = Math.floor(totalMin / n);
  const rem = totalMin % n;
  const arr = Array(n).fill(base);
  for (let i = 0; i < rem; i++) arr[i] += 1;
  return arr;
}

function buildSequentialWindows(startMs, mins) {
  let cursor = startMs;
  return mins.map((m) => {
    const end = cursor + m * 60000;
    const win = { start: cursor, end };
    cursor = end;
    return win;
  });
}

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

function mergeOpsWithLocalState(orderId, ops, state) {
  return (ops || []).map((o) => {
    const id = o.id || opKey(orderId, o);
    const st = state?.[id] || {};

    const sapEstatus = (o.estatus || "pendiente").toLowerCase();

    const estatusFinal =
      sapEstatus === "finalizada" ? "finalizada" : st.estatus || sapEstatus || "pendiente";

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
  const wasOnlineRef = useRef(false);

  // ✅ modo finalizar (checkboxes en operaciones)
  const [finalizeMode, setFinalizeMode] = useState(false);
  // ✅ checks seleccionados (vive en el padre)
  const [checkedMap, setCheckedMap] = useState({});

  // ===== iniciar orden + contador (SOLO LOCAL) =====
  const [startingOrder, setStartingOrder] = useState(false);
  const [orderStartedAtMs, setOrderStartedAtMs] = useState(null);
  const [orderFinishedAtMs, setOrderFinishedAtMs] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    let mounted = true;

    (async () => {
      const orderIdGuess = String(id || "").trim();
      if (!orderIdGuess) return;

      const savedStart = await loadOrderStart(orderIdGuess);
      const savedFinish = await loadOrderFinish(orderIdGuess);

      if (mounted) {
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }
        if (savedFinish) setOrderFinishedAtMs(savedFinish);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNowTick(Date.now());
    });
    return () => sub.remove();
  }, []);

  // 🔁 Procesar cola SAP cuando regresa el internet
  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (state) => {
      const online = !!(state?.isConnected && state?.isInternetReachable !== false);

      if (online && !wasOnlineRef.current) {
        wasOnlineRef.current = true;
        try {
          console.log("📡 Conexión restaurada, procesando cola SAP…");
          await processSapQueue();
        } catch (e) {
          console.warn("Error procesando cola SAP:", e?.message || e);
        }
      }

      if (!online) wasOnlineRef.current = false;
    });

    return () => unsub();
  }, []);

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

  // finalizar orden (firma) -> modal de firma
  const [finishingOrder, setFinishingOrder] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [savingPending0400, setSavingPending0400] = useState(false);

  // ===== estatus orden / bloqueo =====
  const statusCode = String(orden?.estatus_code || orden?.userstatus || "").trim();
  const statusTipo = String(orden?.estatus_tipo || "").toUpperCase();
  const isNoMant = statusTipo === "NO_MANTENIMIENTO";
  const isOrderSinEmpezar = !statusCode;
  const isOrderPendiente0100 = statusCode === "0100";

  // 🔴 OJO: 0400 NO es "finalizada real", es PENDIENTE DE FIRMA
  const isOrderFinishedReal = !!orden?.isFinal || ["0300", "0500"].includes(statusCode);

  const estatusTxt = String(orden?.estatus_label || orden?.estatus || orden?.status || "")
    .trim()
    .toUpperCase();

  const isOrderEnProceso =
    estatusTxt === "EN_PROCESO" || estatusTxt === "EN PROCESO" || statusCode === "0200";

  useEffect(() => {
    if (!orderStartedAtMs) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [orderStartedAtMs]);

  const checkinDone =
    !!orden?.checkin_done || !!orden?.checkin || !!orden?.checked_in || statusCode === "0200";

  // ✅ Operaciones bloqueadas si:
  // - no mantenimiento, sin empezar, 0100, finalizada real, o sin checkin
  const isOpsLocked =
    isNoMant || isOrderSinEmpezar || isOrderPendiente0100 || isOrderFinishedReal || !checkinDone;

  const canStartTimer = isOrderEnProceso && !isNoMant && !isOrderFinishedReal && !!checkinDone;

  /* ====================== Helpers Offline (UI + cache + opstate + queue) ====================== */
  const updateLocalOpsAsFinalizadas = async (orderId, selectedOpIds) => {
    // 1) OPSTATE (para que pinte FIN / color aunque no venga de SAP)
    const current = await loadOpState(orderId);
    const next = { ...(current || {}) };

    for (const opId of selectedOpIds) {
      next[opId] = {
        ...(next[opId] || {}),
        estatus: "finalizada",
        finished_at: next[opId]?.finished_at ?? Date.now(),
      };
    }

    await saveOpState(orderId, next);

    // 2) UI en memoria
    setOrden((prev) => {
      const ops = Array.isArray(prev?.operaciones) ? prev.operaciones : [];
      const ops2 = ops.map((o) => {
        const oid = String(o?.id ?? "");
        if (selectedOpIds.includes(oid)) return { ...o, estatus: "finalizada" };
        return o;
      });
      return { ...(prev || {}), operaciones: ops2 };
    });

    // 3) Cache de detalle (para que al abrir offline se vea igual)
    try {
      const cached = await loadOrdenTecnicoDetail(orderId);
      const base = cached?.data || orden || {};
      const ops = Array.isArray(base?.operaciones) ? base.operaciones : [];
      const ops2 = ops.map((o) => {
        const oid = String(o?.id ?? "");
        if (selectedOpIds.includes(oid)) return { ...o, estatus: "finalizada" };
        return o;
      });
      await saveOrdenTecnicoDetail(orderId, { ...(base || {}), operaciones: ops2 });
    } catch {}
  };

  const updateLocalOrderAsFinalizada0300 = async (orderId, finishMs) => {
    // 1) FIN local para UI
    await saveOrderFinish(orderId, finishMs);
    setOrderFinishedAtMs(finishMs);

    // 2) Para que NO se pueda modificar más en esta pantalla
    setOrden((prev) => ({
      ...(prev || {}),
      estatus_code: "0300",
      userstatus: "0300",
      estatus_label: "FINALIZADA",
      isFinal: true,
    }));

    // 3) Cache del detalle
    try {
      const cached = await loadOrdenTecnicoDetail(orderId);
      const base = cached?.data || orden || {};
      await saveOrdenTecnicoDetail(orderId, {
        ...(base || {}),
        estatus_code: "0300",
        userstatus: "0300",
        estatus_label: "FINALIZADA",
        isFinal: true,
      });
    } catch {}
  };

  const enqueueSap = async ({ type, orderId, endpoint, payload }) => {
    // ✅ Evita tu error: si el export no existe, falla con mensaje claro
    if (typeof upsertSapQueueItem !== "function") {
      throw new Error(
        "upsertSapQueueItem no existe en src/offline/sapQueue.js. Asegúrate de exportarla."
      );
    }
    await upsertSapQueueItem({
      type,
      orderId,
      endpoint,
      payload,
    });
  };

  const obtenerOrden = async () => {
    const orderIdParam = String(id || "").trim();

    try {
      setLoading(true);

      const cached = await loadOrdenTecnicoDetail(orderIdParam);
      if (cached?.data) {
        setOrden(cached.data);
        const cachedOrderId = String(cached?.data?.Orderid || orderIdParam).trim();

        const savedStartCached = await loadOrderStart(cachedOrderId);
        if (savedStartCached) {
          setOrderStartedAtMs(savedStartCached);
          setNowTick(Date.now());
        }

        const savedFinishCached = await loadOrderFinish(cachedOrderId);
        if (savedFinishCached) setOrderFinishedAtMs(savedFinishCached);

        // ✅ rehidratar checks desde cache local si existe
        const pendingCached = await loadPendingSign(cachedOrderId);
        if (pendingCached?.checkedMap) setCheckedMap(pendingCached.checkedMap);
      }

      const net = await NetInfo.fetch();
      const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);

      if (!isOnline) {
        if (!cached?.data) {
          Alert.alert("Sin conexión", "No hay internet y no hay detalle guardado aún para esta orden.");
        }
        return;
      }

      const resOrden = await api.get(`/api/ordenes/sap/${orderIdParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const baseOrden = resOrden.data || {};

      // Dirección
      let direccionSap = "";
      let clienteSap = "";
      try {
        const resAddr = await api.get(`/api/ordenes/sap/${orderIdParam}/addresses`, {
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

      // Operaciones
      let ops = [];
      try {
        const resOps = await api.get(`/api/operaciones/sap/${String(orderIdParam)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        ops = normalizeOpsFromBackend(resOps.data);
      } catch (e) {
        console.warn("No se pudieron cargar operaciones (nuevo endpoint):", e?.response?.data || e);
        ops = normalizeOpsFromBackend(baseOrden?.operaciones || []);
      }

      const orderIdReal = String(baseOrden?.Orderid || baseOrden?.OrderId || orderIdParam).trim();
      const opsWithId = ops.map((o) => ({ ...o, id: o.id || opKey(orderIdReal, o) }));

      const localState = await loadOpState(orderIdReal);
      const opsMerged = mergeOpsWithLocalState(orderIdReal, opsWithId, localState);

            // Correo (ToPartners -> tomar el RE)
      let clienteEmail = "";
      try {
        const resPartners = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdParam}')/ToPartners`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const results =
          resPartners?.data?.d?.results ||
          resPartners?.data?.results ||
          resPartners?.data?.d?.ToPartners?.results ||
          [];

        const re = (results || []).find((p) => String(p?.PartnRoleOld || "").trim() === "RE");

        clienteEmail = String(re?.Mail1 || re?.Mail2 || "").trim();
      } catch (e) {
        console.warn("[MAIL] no se pudo cargar ToPartners:", e?.response?.data || e?.message || e);
      }

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
        cliente_email: clienteEmail || baseOrden?.cliente_email || "",
          operaciones: opsMerged,
      };

      setOrden(data);
      await saveOrdenTecnicoDetail(orderIdReal, data);

      // ✅ Si cambió el id (param vs real), migra timer/pendingSign/finish
      if (orderIdParam && orderIdParam !== orderIdReal) {
        // start
        const oldStart = await loadOrderStart(orderIdParam);
        const realStart = await loadOrderStart(orderIdReal);
        if (oldStart && !realStart) {
          await saveOrderStart(orderIdReal, oldStart);
          await clearOrderStart(orderIdParam);
          setOrderStartedAtMs(oldStart);
          setNowTick(Date.now());
        }

        // finish
        const oldFinish = await loadOrderFinish(orderIdParam);
        const realFinish = await loadOrderFinish(orderIdReal);
        if (oldFinish && !realFinish) {
          await saveOrderFinish(orderIdReal, oldFinish);
          await clearOrderFinish(orderIdParam);
          setOrderFinishedAtMs(oldFinish);
        }

        // pending sign
        const oldPending = await loadPendingSign(orderIdParam);
        const realPending = await loadPendingSign(orderIdReal);
        if (oldPending && !realPending) {
          await savePendingSign(orderIdReal, oldPending);
          await clearPendingSign(orderIdParam);
        }
      }

      // ✅ Rehidratar checks si está en 0400 o existe guardado local
      try {
        const sc = String(data?.estatus_code || data?.userstatus || "").trim();
        const isPending0400 = sc === "0400";

        const pending = await loadPendingSign(orderIdReal);
        if (pending?.checkedMap) {
          setCheckedMap(pending.checkedMap || {});
          if (isPending0400) setFinalizeMode(true);
        }
      } catch {}

      // Cronómetro (tu lógica + limpieza)
      const estatusTxtLocal = String(data?.estatus_label || data?.estatus || data?.status || "")
        .trim()
        .toUpperCase();
      const statusCodeLocal = String(data?.estatus_code || data?.userstatus || "").trim();

      const isEnProcesoLocal =
        estatusTxtLocal === "EN_PROCESO" || estatusTxtLocal === "EN PROCESO" || statusCodeLocal === "0200";

      const isFinalLocal = ["0300", "0500"].includes(statusCodeLocal) || !!data?.isFinal;

      if (isEnProcesoLocal) {
        const savedStart = await loadOrderStart(orderIdReal);
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }
      } else {
        setOrderStartedAtMs(null);
        await clearOrderStart(orderIdReal);
      }

      // ✅ Si ya está final, intenta traer finish local (para mostrar hora fin)
      if (isFinalLocal) {
        const savedFinish = await loadOrderFinish(orderIdReal);
        if (savedFinish) setOrderFinishedAtMs(savedFinish);
      }
    } catch (error) {
      console.error("Error al obtener orden (SAP):", error?.response?.data || error);

      const cached2 = await loadOrdenTecnicoDetail(orderIdParam);
      if (cached2?.data) {
        setOrden(cached2.data);

        const cachedOrderId = String(cached2?.data?.Orderid || orderIdParam).trim();
        const savedStart = await loadOrderStart(cachedOrderId);
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }

        const savedFinish = await loadOrderFinish(cachedOrderId);
        if (savedFinish) setOrderFinishedAtMs(savedFinish);

        const pending = await loadPendingSign(cachedOrderId);
        if (pending?.checkedMap) setCheckedMap(pending.checkedMap);
      } else {
        Alert.alert("Error", "No se pudo cargar la orden desde SAP");
      }
    } finally {
      setLoading(false);
    }
  };

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

  const irAAvisoAveria = (e) => {
    e?.stopPropagation?.();
    if (!orden?.Orderid) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }
    const orderid = String(orden.Orderid).trim();
    router.push({
      pathname: "/tecnico/ordenes/[id]/aviso-averia",
      params: { id: orderid },
    });
  };

  const iniciarOrden = async () => {
    if (!orden?.Orderid) return;

    const estatusTxtNow = String(orden?.estatus_label || orden?.estatus || orden?.status || "")
      .trim()
      .toUpperCase();

    const puedeIniciarPorEstatus =
      estatusTxtNow === "EN_PROCESO" || estatusTxtNow === "EN PROCESO" || statusCode === "0200";

    if (!puedeIniciarPorEstatus) {
      Alert.alert(
        "No disponible",
        'El cronómetro solo se puede iniciar cuando la orden está en "EN_PROCESO" (o código 0200).'
      );
      return;
    }

    if (!checkinDone) {
      Alert.alert("Check-in requerido", "Primero debes hacer Check-in para iniciar el cronómetro.");
      return;
    }

    if (isNoMant || isOrderFinishedReal) {
      Alert.alert("No disponible", "La orden no permite iniciar cronómetro en este estado.");
      return;
    }

    if (orderStartedAtMs) return;

    const orderId = String(orden.Orderid).trim();

    Alert.alert("Iniciar orden", "¿Deseas iniciar el cronómetro de la orden?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sí, iniciar",
        onPress: async () => {
          try {
            setStartingOrder(true);

            // ✅ si había fin guardado, lo limpiamos porque vuelve a correr
            await clearOrderFinish(orderId);
            setOrderFinishedAtMs(null);

            const startMs = Date.now();
            await saveOrderStart(orderId, startMs);
            setOrderStartedAtMs(startMs);
            setNowTick(Date.now());

            Alert.alert("Listo", "Cronómetro iniciado.");
          } catch (e) {
            console.error("Error al iniciar cronómetro:", e);
            Alert.alert("Error", "No se pudo iniciar el cronómetro.");
          } finally {
            setStartingOrder(false);
          }
        },
      },
    ]);
  };

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

  // ✅ Finalizar orden: solo activa finalizeMode
  const handleFinalizarOrden = (e) => {
    e?.stopPropagation?.();

    const orderid = String(orden?.Orderid ?? id ?? "").trim();
    if (!orderid) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    setFinalizeMode(true);
  };

  // ✅ Guardar checks como pendiente de firma (0400)
  const guardarPendienteDeFirma = async () => {
    const orderId = String(orden?.Orderid || id || "").trim();
    if (!orderId) return;

    const selectedIds = Object.keys(checkedMap || {});
    if (!selectedIds.length) {
      Alert.alert("Sin selección", "Marca al menos una operación realizada antes de guardar.");
      return;
    }

    try {
      setSavingPending0400(true);

      // 1) Guardar checks local
      await savePendingSign(orderId, { checkedMap, savedAt: Date.now() });

      // 2) Payload SAP 0400 (quita 0200)
      const payload0400 = {
        OrderId: orderId,
        WorkOrderHeader: { Orderid: orderId },
        WorkOrderUserStatusSet: [
          { UserStText: "0400", Langu: "ES", Inactive: "" },
          { UserStText: "0200", Langu: "ES", Inactive: "X" },
        ],
        Return: [],
      };

      const net = await NetInfo.fetch();
      const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);

      if (!isOnline) {
        // ✅ Encolar para cuando haya red
        await enqueueSap({
          type: "STATUS",
          orderId,
          endpoint: "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
          payload: payload0400,
        });

        // ✅ UI local (para que se vea 0400 aunque no haya red)
        setOrden((prev) => ({
          ...(prev || {}),
          estatus_code: "0400",
          userstatus: "0400",
          estatus_label: prev?.estatus_label || "PENDIENTE DE FIRMA",
        }));
        try {
          const cached = await loadOrdenTecnicoDetail(orderId);
          const base = cached?.data || orden || {};
          await saveOrdenTecnicoDetail(orderId, {
            ...(base || {}),
            estatus_code: "0400",
            userstatus: "0400",
            estatus_label: base?.estatus_label || "PENDIENTE DE FIRMA",
          });
        } catch {}

        Alert.alert(
          "Guardado (sin internet)",
          "Se guardaron los checks como pendiente de firma. Cuando vuelva el internet se enviará el estatus 0400."
        );
      } else {
        await api.post(`/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet`, payload0400, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setOrden((prev) => ({
          ...(prev || {}),
          estatus_code: "0400",
          userstatus: "0400",
          estatus_label: prev?.estatus_label || "PENDIENTE DE FIRMA",
        }));

        Alert.alert("Listo", "Se guardó como pendiente de firma (0400).");
      }

      setFinalizeMode(false);
    } catch (e) {
      console.error("Error guardando pendiente de firma:", e?.response?.data || e);
      Alert.alert("Error", "No se pudo guardar como pendiente de firma.");
    } finally {
      setSavingPending0400(false);
    }
  };

  // ✅ Abrir firma cliente (y guardar progreso antes)
  const abrirFirmaCliente = async () => {
    const orderId = String(orden?.Orderid || id || "").trim();
    if (!orderId) return;

    const selectedIds = Object.keys(checkedMap || {});
    if (!selectedIds.length) {
      Alert.alert("Sin selección", "Marca al menos una operación realizada antes de solicitar firma.");
      return;
    }

    await savePendingSign(orderId, { checkedMap, savedAt: Date.now() });
    setShowSignModal(true);
  };

  // ✅ Finalizar con firma (0300 + confirmations)
  const confirmarFinalizarConFirma = async () => {
    if (!orden?.Orderid) return;

    const orderId = String(orden.Orderid).trim();

    if (!signatureData) {
      Alert.alert("Falta firma", 'Pida al cliente que firme y toque "Listo" dentro del recuadro.');
      return;
    }

    const selectedIds = Object.keys(checkedMap || {});
    if (!selectedIds.length) {
      Alert.alert("Sin selección", "Marca al menos una operación realizada antes de finalizar.");
      return;
    }

    if (!orderStartedAtMs) {
      Alert.alert(
        "Sin cronómetro",
        "No se detectó el inicio del cronómetro. Inicia la orden para poder prorratear tiempos."
      );
      return;
    }

    const finishMs = Date.now();
    const totalMs = Math.max(0, finishMs - orderStartedAtMs);
    const totalMin = msToMinutesRounded(totalMs);

    // 2) Obtener operaciones seleccionadas desde orden.operaciones
    const opsAll = Array.isArray(orden?.operaciones) ? orden.operaciones : [];

    // ✅ seleccionar y luego DEDUP por Activity+SubActivity
    const selectedOpsRaw = selectedIds
      .map((idKey) => opsAll.find((op) => String(op.id) === String(idKey)))
      .filter(Boolean);

    const uniqByOp = (ops) => {
      const map = new Map();
      for (const op of ops) {
        const act = String(op.activity || op.Activity || "").trim();
        const sub = String(op.subactivity || op.SubActivity || "").trim();
        const key = `${act}__${sub}`;
        if (!map.has(key)) map.set(key, op);
      }
      return Array.from(map.values());
    };

    const selectedOps = uniqByOp(selectedOpsRaw);

    if (!selectedOps.length) {
      Alert.alert("Error", "No se encontraron las operaciones seleccionadas en la orden.");
      return;
    }

    try {
      setSavingSignature(true);
      setFinishingOrder(true);

      // 3) Prorrateo (minutos por operación) y ventanas consecutivas
      const n = selectedOps.length;
      const minsArr = prorateMinutes(totalMin, n);
      const windows = buildSequentialWindows(orderStartedAtMs, minsArr);

      // 4) Payload estatus 0300 (quita 0200 y 0400)
      const statusPayload0300 = {
        OrderId: orderId,
        WorkOrderHeader: { Orderid: orderId },
        WorkOrderUserStatusSet: [
          { UserStText: "0300", Langu: "ES", Inactive: "" },
          { UserStText: "0200", Langu: "ES", Inactive: "X" },
          { UserStText: "0400", Langu: "ES", Inactive: "X" },
        ],
        Return: [],
      };

      // 5) Payload confirmations
      const confirmationPayload = {
        Order: "S1",
        ConfirmationOrderSet: selectedOps.map((op, idx) => {
          const actRaw = String(op.activity || op.Activity || "").trim();
          const subRaw = String(op.subactivity || op.SubActivity || "").trim();

          const Operation = actRaw.padStart(4, "0");
          const SubActivity = subRaw ? subRaw.padStart(4, "0") : "";

          const w = windows[idx];

          const row = {
            ConfNo: "",
            Orderid: orderId,
            Operation,
            PostgDate: sapDateFromMs(finishMs),

            ActWork: String(minsArr[idx]),
            UnWork: "min",

            ExecStartDate: sapDateFromMs(w.start),
            ExecFinDate: sapDateFromMs(w.end),

            ExecStartTime: sapTimePTFromMs(w.start),
            ExecFinTime: sapTimePTFromMs(w.end),

            FinConf: "X",
          };

          if (SubActivity) row.SubActivity = SubActivity;
          return row;
        }),
        Return: [],
      };

      const net = await NetInfo.fetch();
      const isOnline = !!(net?.isConnected && net?.isInternetReachable !== false);

      if (!isOnline) {
        // ✅ 1) UI inmediata: cambiar orden a 0300 y pintar operaciones finalizadas
        await updateLocalOpsAsFinalizadas(orderId, selectedIds);
        await updateLocalOrderAsFinalizada0300(orderId, finishMs);

        // ✅ 2) Encolar TODO para cuando vuelva red:
        // 2.1) Firma (backend propio)
        await enqueueSap({
          type: "SIGNATURE",
          orderId,
          endpoint: `/evidencias/orden/${orderId}/firma-final`,
          payload: { imagen_base64: signatureData },
        });

        // 2.2) Status 0300 (SAP OData)
        await enqueueSap({
          type: "STATUS",
          orderId,
          endpoint: "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
          payload: statusPayload0300,
        });

        // 2.3) Confirmations (SAP OData)
        await enqueueSap({
          type: "CONFIRMATIONS",
          orderId,
          endpoint: "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
          payload: confirmationPayload,
        });

        // ✅ 3) Limpieza local (cronómetro / pending / UI)
        await clearOrderStart(orderId);
        setOrderStartedAtMs(null);

        await clearPendingSign(orderId);
        setCheckedMap({});
        setFinalizeMode(false);
        setShowSignModal(false);

        Alert.alert(
          "Finalizado (offline)",
          "Se marcó la orden como 0300 localmente y se pintaron las operaciones. Cuando vuelva internet se enviará firma + estatus 0300 + confirmaciones."
        );

        router.replace("/tecnico/ordenes");
        return;
      }

      // ===== ONLINE =====
      // 1) Firma
      try {
        await api.post(
          `/evidencias/orden/${orderId}/firma-final`,
          { imagen_base64: signatureData },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (e) {
        console.warn("No se pudo guardar la firma (continuo):", e?.response?.data || e);
      }

      // 2) Status 0300
      await api.post(`/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet`, statusPayload0300, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 3) Confirmations
      await api.post(`/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet`, confirmationPayload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // ✅ UI/cache local (igual que offline, pero ya “real”)
      await updateLocalOpsAsFinalizadas(orderId, selectedIds);
      await updateLocalOrderAsFinalizada0300(orderId, finishMs);

      await clearOrderStart(orderId);
      setOrderStartedAtMs(null);

      await clearPendingSign(orderId);
      setCheckedMap({});
      setFinalizeMode(false);
      setShowSignModal(false);

      Alert.alert("Orden finalizada", "Se cambió el estatus a 0300 y se enviaron confirmaciones.");
      router.replace("/tecnico/ordenes");
    } catch (error) {
      console.error("Error al finalizar (0300 + confirmaciones):", error?.response?.data || error);
      Alert.alert("Error", "No se pudo finalizar la orden o enviar confirmaciones. Intenta de nuevo.");
    } finally {
      setSavingSignature(false);
      setFinishingOrder(false);
    }
  };

  useEffect(() => {
    obtenerOrden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================== Render ================== */
  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={`Orden ${id || ""}`} />

        {canStartTimer && !orderStartedAtMs ? (
          <View style={styles.topActionBar}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.startOrderBtn, startingOrder && { opacity: 0.7 }]}
              onPress={iniciarOrden}
              disabled={startingOrder}
            >
              <Ionicons name="play-circle-outline" size={18} color="#fff" />
              <Text style={styles.startOrderBtnText}>{startingOrder ? "Iniciando..." : "Iniciar orden"}</Text>
            </TouchableOpacity>
          </View>
        ) : isOrderEnProceso && orderStartedAtMs ? (
          <View style={styles.topActionBar}>
            <View style={styles.timerPill}>
              <Ionicons name="time-outline" size={16} color={FIORI.text} />
              <Text style={styles.timerText}>{msToHMS(nowTick - orderStartedAtMs)}</Text>
            </View>
          </View>
        ) : null}

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={FIORI.brand} />
          <Text style={{ marginTop: 10, color: FIORI.textMuted, fontWeight: "700" }}>Cargando orden…</Text>
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
    : isOrderFinishedReal
    ? FIORI.ok
    : !statusCode
    ? FIORI.err
    : statusCode === "0100"
    ? FIORI.err
    : statusCode === "0200"
    ? FIORI.warn
    : statusCode === "0400"
    ? FIORI.warn
    : FIORI.ok;

  const direccionValor = orden.direccion || orden.address || orden.partner_address || null;
  const allMaterials = Array.isArray(orden.componentes) ? orden.componentes : [];
  const hasSelectedOps = Object.keys(checkedMap || {}).length > 0;

  return (
    <View style={styles.container}>
      <Header title={`Orden ${orden?.Orderid || id || ""}`} />

      {canStartTimer && !orderStartedAtMs ? (
        <View style={styles.topActionBar}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.startOrderBtn, startingOrder && { opacity: 0.7 }]}
            onPress={iniciarOrden}
            disabled={startingOrder}
          >
            <Ionicons name="play-circle-outline" size={18} color="#fff" />
            <Text style={styles.startOrderBtnText}>{startingOrder ? "Iniciando..." : "Iniciar orden"}</Text>
          </TouchableOpacity>
        </View>
      ) : isOrderEnProceso && orderStartedAtMs ? (
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
            isOrderFinished={isOrderFinishedReal}
            direccionValor={direccionValor}
            allMaterialsLen={allMaterials.length}
            fmtDMY={fmtDMY}
            formatValueForRow={formatValueForRow}
            onAbrirPdfNoMant={abrirModalNoMantPdf}
            onVerMaterialesOrden={() => setShowAllMaterialsModal(true)}
            orderStartedAtMs={orderStartedAtMs}
            orderFinishedAtMs={orderFinishedAtMs}
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
              finalizeMode={finalizeMode}
              onRequestCancelFinalize={() => setFinalizeMode(false)}
              checkedMap={checkedMap}
              setCheckedMap={setCheckedMap}
              orderId={String(orden?.Orderid || id || "").trim()}   // ✅ NUEVO
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
            statusCode={statusCode}
            finalizeMode={finalizeMode}
            onCancelarFinalizacion={() => setFinalizeMode(false)}
            onFinalizarOrden={handleFinalizarOrden}
            onAgregarFirma={abrirFirmaCliente}
            onGuardarPendiente={guardarPendienteDeFirma}
            hasSelectedOps={hasSelectedOps}
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
        showAllMaterialsModal={showAllMaterialsModal}
        setShowAllMaterialsModal={setShowAllMaterialsModal}
        showCompModal={showCompModal}
        closeComponentsModal={closeComponentsModal}
        selectedOp={selectedOp}
        loadingComponents={loadingComponents}
        compList={compList}
        showSignModal={showSignModal}
        setShowSignModal={setShowSignModal}
        signatureRef={signatureRef}
        signatureData={signatureData}
        setSignatureData={setSignatureData}
        savingSignature={savingSignature}
        confirmarFinalizarConFirma={confirmarFinalizarConFirma}
        showNoMantPdfModal={showNoMantPdfModal}
        cerrarModalNoMantPdf={cerrarModalNoMantPdf}
        loadingNoMantPdf={loadingNoMantPdf}
        noMantError={noMantError}
        noMantPdfUrl={noMantPdfUrl}
        noMantPdfRawUrl={noMantPdfRawUrl}
        descargarNoMantPdf={descargarNoMantPdf}
        downloadingNoMantPdf={downloadingNoMantPdf}
      />

      {/* ✅ Overlay bloqueante cuando guardas 0400 */}
      <Modal visible={savingPending0400} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.blockBackdrop}>
          <View style={styles.blockCard}>
            <ActivityIndicator size="large" color={FIORI.brand} />
            <Text style={styles.blockTitle}>Guardando pendiente de firma…</Text>
            <Text style={styles.blockSub}>No cierres la pantalla ni toques botones.</Text>
          </View>
        </View>
      </Modal>
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

  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
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

  grupoCard: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 12,
    ...elev(0.4),
  },
  grupoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  grupoTitle: { fontSize: 14, fontWeight: "900", color: FIORI.text },

  operCardSmall: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    padding: 10,
  },
  badgeSmall: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  badgeSmallText: { fontSize: 11, fontWeight: "900", color: FIORI.text },
  operTitleSmall: { fontSize: 13, fontWeight: "900", color: FIORI.text },
  operDescSmall: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },

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

  topActionBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
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
  startOrderBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
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
  timerText: { color: FIORI.text, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },

  btnFinishOrder: {
    backgroundColor: "#0B8457",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...elev(0.7),
  },
  btnFinishOrderText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  /* ====== Modales (los usa ModalesDetalleOrden) ====== */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
      default: {},
    }),
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: FIORI.brand,
  },
  modalTitle: { fontSize: 14, fontWeight: "900", color: "#fff", flex: 1 },
  modalCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  compRow: {
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    backgroundColor: FIORI.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  compTitle: { fontWeight: "900", color: FIORI.text, marginBottom: 4 },
  compSub: { color: FIORI.textMuted, fontWeight: "700", marginBottom: 6 },
  compMeta: { color: FIORI.textMuted, fontSize: 12 },
  modalFooterRow: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E8EEF7",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
  },
  smallBtnText: { fontWeight: "900", color: FIORI.text, fontSize: 13 },

  /* ✅ Overlay bloqueante */
  blockBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  blockCard: {
    width: "92%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  blockTitle: { marginTop: 10, fontWeight: "900", color: FIORI.text },
  blockSub: { marginTop: 6, color: FIORI.textMuted, textAlign: "center", fontSize: 12 },
});

function elev(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 8 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });
}
