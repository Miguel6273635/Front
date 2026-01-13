// app/ordenes/[id]/index.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  FlatList,
  ScrollView,
  TextInput,
} from 'react-native';
import Header from '../../../../src/components/Header';
import api from '../../../../src/services/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { useLocalSearchParams, router } from 'expo-router';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Signature from 'react-native-signature-canvas';

/* ====================== Paleta SAP Fiori (Horizon) ====================== */
const FIORI = {
  pageBg: '#F7F7F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F7FA',
  border: '#DDE6F2',
  borderSoft: '#E8EEF7',
  text: '#0B1F3B',
  textMuted: '#63718B',
  brand: '#0A6ED1',
  brandSoft: '#E3F2FD',
  ok: '#2FBF71',
  warn: '#F5A623',
  err: '#E74C3C',
  pause: '#26a5e0ff',
};

/* ====================== Helpers generales ====================== */
// ✅ Soporta ISO y SAP OData "/Date(1700000000000)/"
function parseSapDateToMs(val) {
  if (!val) return null;

  if (typeof val === 'string' && val.includes('/Date(')) {
    const ms = Number(val.replace('/Date(', '').replace(')/', ''));
    return Number.isFinite(ms) ? ms : null;
  }

  const t = new Date(val).getTime();
  return Number.isFinite(t) ? t : null;
}

function fmtDMY(val) {
  const ms = parseSapDateToMs(val);
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString();
}

// (lo sigues usando para timers y marcas de tiempo)
function toMs(val) {
  return parseSapDateToMs(val);
}

function fmtHMS(ms) {
  if (!Number.isFinite(ms)) return '00:00:00';
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function durationToMinutes(normal, unit) {
  if (normal == null || unit == null) return null;
  const u = String(unit).toUpperCase();
  if (u.startsWith('H')) return Number(normal) * 60;
  if (u.startsWith('M')) return Number(normal);
  return null;
}

const opKey = (orderId, op) =>
  `${orderId}-${op.activity || op.Activity || ''}${
    op.subactivity || op.SubActivity ? `-${op.subactivity || op.SubActivity}` : ''
  }`;

/* ==== Persistencia de inicios (fallback) ==== */
const START_KEY = (opId) => `opStart:${opId}`;
async function saveStartMs(opId, ms) {
  try {
    await AsyncStorage.setItem(START_KEY(opId), String(ms));
  } catch {}
}
async function loadStartMs(opId) {
  try {
    const v = await AsyncStorage.getItem(START_KEY(opId));
    const n = v ? Number(v) : null;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
async function removeStartMs(opId) {
  try {
    await AsyncStorage.removeItem(START_KEY(opId));
  } catch {}
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
async function saveOpState(orderId, state) {
  try {
    await AsyncStorage.setItem(OPSTATE_KEY(orderId), JSON.stringify(state || {}));
  } catch {}
}
function mergeOpsWithLocalState(orderId, ops, state) {
  return (ops || []).map((o) => {
    const id = o.id || opKey(orderId, o);
    const st = state?.[id] || {};

    // ✅ SAP/back-end manda ya estatus (ej. "finalizada" cuando trae FINA)
    const sapEstatus = (o.estatus || 'pendiente').toLowerCase();

    // ✅ Regla: si SAP dice "finalizada", NO dejar que el local lo cambie jamás
    const estatusFinal =
      sapEstatus === 'finalizada'
        ? 'finalizada'
        : (st.estatus || sapEstatus || 'pendiente');

    return {
      ...o,
      id,
      estatus: estatusFinal,

      // Mantén tus timers/local-state igual que antes
      worked_ms: st.worked_ms ?? o.worked_ms ?? 0,
      last_resume_at: st.last_resume_at ?? o.last_resume_at ?? null,
      Strttimcon: st.started_at ?? o.Strttimcon ?? null,
      Fintimcons: st.finished_at ?? o.Fintimcons ?? null,
      paused_at: st.paused_at ?? o.paused_at ?? null,
      pause_motivo: st.pause_motivo ?? o.pause_motivo ?? null, // opcional
    };
  });
}



/* ====== Helper para formatear valores en Row (incluida dirección) ====== */
function formatValueForRow(value) {
  if (value == null) return '—';

  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return String(value);

  if (t === 'object') {
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
    if (posibleFull && typeof posibleFull === 'string') return posibleFull;

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

    if (partes.length) return partes.join(', ');

    try {
      return JSON.stringify(value);
    } catch {
      return '—';
    }
  }

  try {
    return String(value);
  } catch {
    return '—';
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
    const Activity = op.Activity || op.activity || op.Vornr || '';
    const SubActivity = op.SubActivity || op.subactivity || op.Uvorn || '';
    const Description = op.Description || op.description || op.Ltxa1 || '';

    return {
      ...op,
      activity: String(Activity || ''),
      subactivity: String(SubActivity || ''),
      description: String(Description || ''),
      Activity: String(Activity || ''),
      SubActivity: String(SubActivity || ''),
      Description: String(Description || ''),
    };
  });
}

/* ====================== Componente ====================== */
export default function DetalleOrden() {
  const { id } = useLocalSearchParams();
  const { user, token } = useAuth();

  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);

  const [operacionesFueraTiempo, setOperacionesFueraTiempo] = useState({});
  const [soundObj, setSoundObj] = useState(null);

  // fallback local (si no llega last_resume_at / worked_ms)
  const clientStartsRef = useRef({}); // { [opId]: ms }
  const signatureRef = useRef(null);

  // modal de componentes + consumo
  const [showCompModal, setShowCompModal] = useState(false);
  const [selectedOp, setSelectedOp] = useState(null);
  const [compList, setCompList] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [modalMode, setModalMode] = useState('view'); // 'view' | 'finalizar'
  const [consumioMaterial, setConsumioMaterial] = useState(false);
  const [cantidadesConsumidas, setCantidadesConsumidas] = useState({});
  const [finalizandoOp, setFinalizandoOp] = useState(false);

  // modal materiales orden
  const [showAllMaterialsModal, setShowAllMaterialsModal] = useState(false);

  // modal PDF no mantenimiento
  const [showNoMantPdfModal, setShowNoMantPdfModal] = useState(false);
  const [noMantPdfUrl, setNoMantPdfUrl] = useState(null);
  const [noMantPdfRawUrl, setNoMantPdfRawUrl] = useState(null);
  const [loadingNoMantPdf, setLoadingNoMantPdf] = useState(false);
  const [noMantError, setNoMantError] = useState(null);
  const [downloadingNoMantPdf, setDownloadingNoMantPdf] = useState(false);

  // finalizar orden
  const [finishingOrder, setFinishingOrder] = useState(false);

  // firma final
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);

  // ✅ NUEVO: modal motivo pausa
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseMotivo, setPauseMotivo] = useState('');

  // ===== estatus orden / bloqueo (incluye checkin) =====
  const statusCode = String(orden?.estatus_code || orden?.userstatus || '').trim(); // "0100", "0200", etc.
  const statusTipo = String(orden?.estatus_tipo || '').toUpperCase(); // "NO_MANTENIMIENTO", "NORMAL", etc.

  // ✅ NO mantenimiento (usa el tipo del backend)
  const isNoMant = statusTipo === 'NO_MANTENIMIENTO';

  const isOrderSinEmpezar = !statusCode; // sin código
  const isOrderPendiente0100 = statusCode === '0100';

  // ✅ final: usa el flag del backend si viene, si no usa códigos
  const isOrderFinished = !!orden?.isFinal || ['0300', '0400', '0500'].includes(statusCode);

  // ✅ checkinDone: si está 0100 o 0200 ya puedes operar
  const checkinDone =
    !!orden?.checkin_done ||
    !!orden?.checkin ||
    !!orden?.checked_in ||
    statusCode === '0200';

  // 🔒 bloqueo final
  const isOpsLocked =
    isNoMant || isOrderSinEmpezar || isOrderPendiente0100 || isOrderFinished || !checkinDone;

  /** ============================================================
   *  ✅ OBTENER ORDEN + ✅ OPERACIONES + ✅ MEZCLA CON ESTADO LOCAL
   *  ============================================================ */
  const obtenerOrden = async () => {
    try {
      setLoading(true);

      // ✅ 1) detalle orden
      const resOrden = await api.get(`/api/ordenes/sap/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const baseOrden = resOrden.data || {};
      console.log('[DETALLE ORDEN]', baseOrden);

      // ✅ 2) operaciones SAP (endpoint bonito)
      let ops = [];
      try {
        const resOps = await api.get(`/api/operaciones/sap/${String(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('[OPS]', resOps.data);
        ops = normalizeOpsFromBackend(resOps.data);
      } catch (e) {
        console.warn('No se pudieron cargar operaciones (nuevo endpoint):', e?.response?.data || e);
        ops = normalizeOpsFromBackend(baseOrden?.operaciones || []);
      }

      // ✅ 3) asegurar id compuesto
      const orderIdReal = String(baseOrden?.Orderid || baseOrden?.OrderId || id);
      const opsWithId = ops.map((o) => ({ ...o, id: o.id || opKey(orderIdReal, o) }));

      // ✅ 4) cargar estado local (AsyncStorage) y mezclar
      const localState = await loadOpState(orderIdReal);
      const opsMerged = mergeOpsWithLocalState(orderIdReal, opsWithId, localState);

      const data = { ...baseOrden, operaciones: opsMerged };
      setOrden(data);

      // ✅ 5) hidratar starts locales (fallback)
      if (Array.isArray(data?.operaciones)) {
        const entries = await Promise.all(
          data.operaciones.map(async (o) => {
            const resumeMs = toMs(o.last_resume_at);
            if (resumeMs != null) {
              clientStartsRef.current[o.id] = resumeMs;
              await saveStartMs(o.id, resumeMs);
              return [o.id, resumeMs];
            }

            const serverMs = toMs(o.Strttimcon);
            if (serverMs != null) {
              await saveStartMs(o.id, serverMs);
              return [o.id, serverMs];
            }

            const localMs = await loadStartMs(o.id);
            return [o.id, localMs];
          })
        );

        clientStartsRef.current = Object.fromEntries(entries.filter(([, ms]) => ms != null));

        // ✅ 6) marcado fuera de tiempo
        const now = Date.now();
        const fuera = {};

        for (const op of data.operaciones) {
          if (op.estatus !== 'en_proceso') continue;

          const limitMin = op.duracion_minutos ?? durationToMinutes(op.DurationNormal, op.DurationNormalUnit);
          if (!Number.isFinite(limitMin)) continue;

          const workedMs = Number(op.worked_ms || 0);
          const resumeAtMs =
            toMs(op.last_resume_at) ?? (clientStartsRef.current[op.id] ?? toMs(op.Strttimcon));

          const tramoMs = resumeAtMs ? Math.max(0, now - resumeAtMs) : 0;
          const elapsed = workedMs + tramoMs;

          const limitMs = limitMin * 60 * 1000;
          if (elapsed >= limitMs) fuera[op.id] = true;
        }

        if (Object.keys(fuera).length) {
          setOperacionesFueraTiempo((prev) => ({ ...prev, ...fuera }));
        }
      }
    } catch (error) {
      console.error('Error al obtener orden (SAP):', error?.response?.data || error);
      Alert.alert('Error', 'No se pudo cargar la orden desde SAP');
    } finally {
      setLoading(false);
    }
  };

  // Abrir modal de componentes
  const openComponentsModal = async (op, mode = 'view') => {
    try {
      setSelectedOp(op);
      setModalMode(mode);
      setConsumioMaterial(false);
      setCantidadesConsumidas({});
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
      console.error('Error al obtener componentes:', error?.response?.data || error);
      Alert.alert('Materiales', 'No se pudieron obtener los materiales de esta operación.');
    } finally {
      setLoadingComponents(false);
    }
  };

  const closeComponentsModal = () => {
    setShowCompModal(false);
    setSelectedOp(null);
    setCompList([]);
    setConsumioMaterial(false);
    setCantidadesConsumidas({});
  };

  const solicitarFinalizarOperacion = async (op) => {
    await openComponentsModal(op, 'finalizar');
  };

  const playAlertSound = async () => {
    try {
      await soundObj?.replayAsync?.();
    } catch {}
  };

  // ✅ NUEVO: abrir/cerrar modal motivo pausa
  const openPauseModal = (op) => {
    setSelectedOp(op);
    setPauseMotivo('');
    setShowPauseModal(true);
  };
  const closePauseModal = () => {
    setShowPauseModal(false);
    setPauseMotivo('');
  };

  // ======= Iniciar / Reanudar (SIN BD) =======
  const iniciarOperacion = (op) => {
    const orderId = String(orden?.Orderid || id);
    const opId = op.id || opKey(orderId, op);

    if (isOpsLocked) {
      Alert.alert(
        'No permitido',
        !checkinDone
          ? 'Primero debes hacer Check-in para habilitar iniciar/pausar/finalizar operaciones.'
          : isNoMant
          ? 'Esta orden es de no mantenimiento. Las operaciones solo se muestran como referencia.'
          : isOrderFinished
          ? 'La orden ya está finalizada. Las operaciones solo se muestran como referencia.'
          : 'La orden está bloqueada por estatus.'
      );
      return;
    }

    const msg = op.estatus === 'pausada' ? '¿Deseas reanudar esta actividad?' : '¿Deseas iniciar esta actividad?';

    Alert.alert(op.estatus === 'pausada' ? 'Reanudar operación' : 'Iniciar operación', msg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: op.estatus === 'pausada' ? 'Reanudar' : 'Iniciar',
        onPress: async () => {
          try {
            // Ping API (no BD)
            await api.put(`/api/operaciones/${opId}/iniciar`, {}, { headers: { Authorization: `Bearer ${token}` } });

            const nowISO = new Date().toISOString();
            const startMs = Date.now();

            // fallback local start
            clientStartsRef.current[opId] = startMs;
            await saveStartMs(opId, startMs);

            // guardar estado local
            const st = await loadOpState(orderId);
            const prev = st[opId] || {};

            st[opId] = {
              ...prev,
              estatus: 'en_proceso',
              started_at: prev.started_at || nowISO,
              last_resume_at: nowISO,
              worked_ms: Number(prev.worked_ms || 0),
              finished_at: null,
              paused_at: null,
            };

            await saveOpState(orderId, st);

            // refrescar UI local sin volver a SAP
            setOrden((prevOrden) => ({
              ...prevOrden,
              operaciones: (prevOrden.operaciones || []).map((x) => (x.id === opId ? { ...x, ...st[opId] } : x)),
            }));

            Alert.alert(op.estatus === 'pausada' ? 'Operación reanudada' : 'Operación iniciada', 'Se ha registrado el tiempo.');
          } catch (error) {
            console.error('Error al iniciar/reanudar operación:', error?.response?.data || error);
            Alert.alert('Error', 'No se pudo iniciar/reanudar la operación');
          }
        },
      },
    ]);
  };

  // ✅ NUEVO: confirmar pausa con motivo (manda ConfText)
  const confirmarPausaConMotivo = async () => {
    if (!orden?.Orderid) return;
    if (!selectedOp) return;

    const motivo = String(pauseMotivo || '').trim();
    if (!motivo) {
      Alert.alert('Falta motivo', 'Escribe el motivo de la pausa.');
      return;
    }

    const orderId = String(orden?.Orderid || id);
    const op = selectedOp;
    const opId = op.id || opKey(orderId, op);

    Alert.alert('Pausar operación', '¿Confirmas pausar esta actividad con el motivo capturado?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Pausar',
        onPress: async () => {
          try {
            const st = await loadOpState(orderId);
            const cur = st[opId] || {};

            const nowISO = new Date().toISOString();
            const segStartISO = cur.last_resume_at || cur.started_at || nowISO;

            const segStartMs = new Date(segStartISO).getTime();
            const segEndMs = Date.now();
            const segWorkedMs = Math.max(0, segEndMs - segStartMs);

            // ✅ API manda confirm parcial a SAP + motivo
            const resp = await api.put(
              `/api/operaciones/${opId}/pausar`,
              { segStartISO, segEndISO: nowISO, ConfText: motivo },
              { headers: { Authorization: `Bearer ${token}` } }
            );

            const nextWorked = Number(cur.worked_ms || 0) + segWorkedMs;

            st[opId] = {
              ...cur,
              estatus: 'pausada',
              worked_ms: nextWorked,
              last_resume_at: null,
              paused_at: nowISO,
              pause_motivo: motivo,
            };

            await saveOpState(orderId, st);

            // UI
            setOrden((prevOrden) => ({
              ...prevOrden,
              operaciones: (prevOrden.operaciones || []).map((x) => (x.id === opId ? { ...x, ...st[opId] } : x)),
            }));

            closePauseModal();

            Alert.alert(
              'Pausada',
              resp?.data?.confirmacion?.ok ? 'Se pausó y se confirmó en SAP.' : 'Se pausó, pero SAP no confirmó (revisar conexión).'
            );
          } catch (error) {
            console.error('Error al pausar operación:', error?.response?.data || error);
            Alert.alert('Error', 'No se pudo pausar la operación');
          }
        },
      },
    ]);
  };

  // ======= Finalizar operación (con materiales) =======
  const finalizarOperacionConMaterial = async () => {
    if (!selectedOp || !orden?.Orderid) return;

    const orderId = String(orden.Orderid);
    const opId = selectedOp.id || opKey(orderId, selectedOp);

    const materialConsumption = (compList || []).map((c) => {
      const qty = consumioMaterial ? Number(cantidadesConsumidas[c.ResItem] || 0) : 0;
      return {
        Material: c.Material,
        Cantidad: String(qty),
        Unidad: c.RequirementQuantityUnitIso || c.RequirementQuantityUnit || c.Unit || '',
        Centro: c.Plant,
        Almacen: c.StgeLoc || '',
      };
    });

    try {
      setFinalizandoOp(true);

      const st = await loadOpState(orderId);
      const cur = st[opId] || {};

      const finishedISO = new Date().toISOString();

      // si estaba en proceso, sumamos tramo actual
      const lastResumeISO = cur.last_resume_at;
      const extraMs = lastResumeISO ? Math.max(0, Date.now() - new Date(lastResumeISO).getTime()) : 0;

      const workedMsTotal = Number(cur.worked_ms || 0) + extraMs;
      const startedISO = cur.started_at || cur.last_resume_at || finishedISO;

      const res = await api.put(
        `/api/operaciones/${opId}/finalizar`,
        { startedISO, finishedISO, workedMsTotal, materialConsumption },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // guardar estado final
      st[opId] = {
        ...cur,
        estatus: 'finalizada',
        worked_ms: workedMsTotal,
        last_resume_at: null,
        finished_at: finishedISO,
        paused_at: null,
      };
      await saveOpState(orderId, st);

      // UI
      setOrden((prevOrden) => ({
        ...prevOrden,
        operaciones: (prevOrden.operaciones || []).map((x) => (x.id === opId ? { ...x, ...st[opId] } : x)),
      }));

      // limpiar fallback start
      delete clientStartsRef.current[opId];
      await removeStartMs(opId);

      const conf = res?.data?.confirmacion;
      if (conf?.ok) {
        Alert.alert('Finalizada y confirmada', 'Se creó la confirmación en SAP.');
      } else if (conf && conf.ok === false) {
        Alert.alert('Finalizada (con aviso)', 'Se finalizó, pero SAP no confirmó. Reintenta.');
        console.warn('Confirmación SAP falló:', conf?.error);
      } else {
        Alert.alert('Finalizada', 'La operación se marcó como finalizada.');
      }

      closeComponentsModal();
    } catch (error) {
      console.error('Error al finalizar operación:', error?.response?.data || error);
      Alert.alert('Error', 'No se pudo finalizar la operación');
    } finally {
      setFinalizandoOp(false);
    }
  };

  // ===== Navegaciones a formularios =====
  const buildPrefillParams = () => {
    const cliente = `${orden?.Name1 ?? ''} ${orden?.Name2 ?? ''}`.trim();
    const direccion = orden?.direccion || orden?.address || orden?.partner_address || '';

    return {
      orderid: String(orden?.Orderid ?? id ?? ''),
      equipment: String(orden?.equipment ?? orden?.Equipment ?? ''),
      tecnico_nombre: String(orden?.tecnico_nombre ?? user?.nombre ?? user?.email ?? ''),
      Name1: String(orden?.Name1 ?? ''),
      Name2: String(orden?.Name2 ?? ''),
      cliente,
      direccion: typeof direccion === 'string' ? direccion : JSON.stringify(direccion),
    };
  };

  const irAManttoElevador = (e) => {
    e?.stopPropagation?.();
    const p = buildPrefillParams();
    router.push({ pathname: '/tecnico/ordenes/[orderid]/reporte-mant-elevadores', params: p });
  };

  const irAManttoEscalera = (e) => {
    e?.stopPropagation?.();
    const p = buildPrefillParams();
    router.push({ pathname: '/tecnico/ordenes/[orderid]/reporte-mant-escaleras', params: p });
  };

  const irAAvisoAveria = (e) => {
    e?.stopPropagation?.();
    if (!orden?.Orderid) {
      Alert.alert('Error', 'No se encontró el número de orden.');
      return;
    }
    const orderid = String(orden.Orderid).trim();
    router.push({ pathname: '/tecnico/ordenes/[id]/aviso-averia', params: { id: orderid } });
  };

  // ===== PDF No mantenimiento (igual) =====
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
      if (!pdf_url) throw new Error('Sin URL de PDF desde backend');

      const apiBase = api.defaults.baseURL || '';
      const serverRoot = apiBase.replace(/\/api\/?$/, '');

      const rawUrl = pdf_url.startsWith('http') ? pdf_url : `${serverRoot}${pdf_url}`;
      setNoMantPdfRawUrl(rawUrl);

      const viewerUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(rawUrl)}`;
      setNoMantPdfUrl(viewerUrl);
    } catch (error) {
      console.error('Error al obtener PDF no mantto:', error?.response?.data || error);
      setNoMantError('No se pudo cargar el PDF de la carta de no mantenimiento.');
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
      Alert.alert('Sin archivo', 'No se encontró la URL del PDF para descargar.');
      return;
    }

    try {
      setDownloadingNoMantPdf(true);

      const filename = noMantPdfRawUrl.split('/').pop() || `carta-no-mantto_${orden?.Orderid || ''}.pdf`;
      const localUri = FileSystem.documentDirectory + filename;

      const { uri } = await FileSystem.downloadAsync(noMantPdfRawUrl, localUri);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Descarga completa', 'El PDF se guardó en la carpeta de documentos de la app.');
        return;
      }

      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir / guardar carta de no mantenimiento' });
    } catch (e) {
      console.error('Error al descargar PDF:', e);
      Alert.alert('Error', 'No se pudo descargar el PDF. Verifica acceso a la URL del servidor.');
    } finally {
      setDownloadingNoMantPdf(false);
    }
  };

  // ===== Finalizar orden (firma) =====
  const handleFinalizarOrden = () => {
    if (!orden?.Orderid) return;

    const ops = Array.isArray(orden.operaciones) ? orden.operaciones : [];
    const hayEnProceso = ops.some((o) => o.estatus === 'en_proceso');
    if (hayEnProceso) {
      Alert.alert('No se puede finalizar', 'Hay operaciones en proceso. Finaliza o pausa esas actividades antes de cerrar la orden.');
      return;
    }

    const total = ops.length;
    const finalizadas = ops.filter((o) => o.estatus === 'finalizada').length;
    const pendientes = total - finalizadas;

    const mensajePend =
      pendientes > 0
        ? `Hay ${pendientes} operación(es) pendientes.\n\nLa orden se marcará como "finalizada con pendientes".`
        : 'Todas las operaciones están finalizadas. La orden se marcará como "finalizada".';

    Alert.alert(
      'Firma del cliente',
      `Antes de finalizar la orden, el cliente debe firmar.\n\n${mensajePend}\n\n¿Deseas capturar la firma ahora?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, capturar firma',
          onPress: () => {
            setSignatureData(null);
            setShowSignModal(true);
          },
        },
      ]
    );
  };

  const confirmarFinalizarConFirma = async () => {
    if (!orden?.Orderid) return;

    if (!signatureData) {
      Alert.alert('Falta firma', 'Pida al cliente que firme y toque "Listo" dentro del recuadro.');
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
        console.warn('No se pudo guardar la firma (continuo):', e?.response?.data || e);
      }

      // ✅ SIN BD: solo marcamos localmente estatus final
      const ops = Array.isArray(orden.operaciones) ? orden.operaciones : [];
      const totalOps = ops.length;
      const finalizadas = ops.filter((o) => o.estatus === 'finalizada').length;
      const pendientes = totalOps - finalizadas;

      const nuevoStatus = pendientes > 0 ? 'finalizada_con_pendientes' : 'finalizada';

      setOrden((prev) => ({ ...prev, estatus: nuevoStatus }));
      setShowSignModal(false);

      Alert.alert(
        'Orden finalizada',
        pendientes > 0 ? 'La orden se marcó como finalizada con pendientes.' : 'La orden se marcó como finalizada.'
      );

      router.replace('/tecnico/ordenes');
    } catch (error) {
      console.error('Error al finalizar orden con firma:', error?.response?.data || error);
      Alert.alert('Error', 'No se pudo finalizar la orden. Intenta de nuevo.');
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // ✅ Ajusta ruta de assets (evita warning)
        const { sound } = await Audio.Sound.createAsync(require('../../../../assets/alert.mp3'));
        if (mounted) setSoundObj(sound);
      } catch (e) {
        console.warn('No se pudo cargar el sonido de alerta:', e);
      }
    })();
    return () => {
      mounted = false;
      soundObj?.unloadAsync?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyOpInProcess = useMemo(
    () => Array.isArray(orden?.operaciones) && orden.operaciones.some((o) => o.estatus === 'en_proceso'),
    [orden]
  );

  // ================== Render ==================
  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={FIORI.brand} />;
  }

  if (!orden) {
    return (
      <View style={styles.container}>
        <Header title={`Orden ${id || ''}`} />
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
    : statusCode === '0100'
    ? FIORI.err
    : statusCode === '0200'
    ? FIORI.warn
    : FIORI.ok;

  const direccionValor = orden.direccion || orden.address || orden.partner_address || null;
  const hasComponents = Array.isArray(compList) && compList.length > 0;
  const allMaterials = Array.isArray(orden.componentes) ? orden.componentes : [];

  return (
    <View style={styles.container}>
      <Header title={`Orden ${orden?.Orderid || id || ''}`} />

      <FlatList
        style={{ flex: 1 }}
        data={orden.operaciones || []}
        keyExtractor={(op, idx) => String(op.id || opKey(orden.Orderid, op) || idx)}
        contentContainerStyle={[styles.content, { paddingBottom: 140 }]}
        ListHeaderComponent={
          <>
            <View style={styles.headerBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo}>
                  #{orden.Orderid} · {orden.order_type}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: estatusColor }]}>
                <Text style={styles.statusBadgeText}>{orden?.estatus_label || orden?.estatus_code || '—'}</Text>
              </View>
            </View>

            {isNoMant && (
              <View style={styles.noMantBanner}>
                <Ionicons name="document-text-outline" size={22} color={FIORI.text} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noMantTitle}>Orden marcada como "No mantenimiento"</Text>
                  <Text style={styles.noMantText}>
                    Consulta la carta de no mantenimiento en PDF. Las operaciones se muestran solo para referencia y no
                    se pueden iniciar.
                  </Text>
                </View>
                <TouchableOpacity style={styles.btnNoMantBanner} onPress={abrirModalNoMantPdf}>
                  <Text style={styles.btnNoMantBannerText}>Ver PDF</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isNoMant && !checkinDone && !isOrderFinished && (
              <View style={styles.noMantBanner}>
                <Ionicons name="lock-closed-outline" size={22} color={FIORI.text} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noMantTitle}>Operaciones bloqueadas</Text>
                  <Text style={styles.noMantText}>
                    Primero debes hacer Check-in para habilitar iniciar/pausar/finalizar operaciones.
                  </Text>
                </View>
              </View>
            )}

            {isOrderFinished && !isNoMant && (
              <View style={styles.noMantBanner}>
                <Ionicons name="checkmark-done-outline" size={22} color={FIORI.text} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noMantTitle}>Orden finalizada</Text>
                  <Text style={styles.noMantText}>
                    Las operaciones se muestran solo como referencia y ya no se pueden modificar.
                  </Text>
                </View>
              </View>
            )}

            {orden.partners?.length > 0 && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Datos del solicitante</Text>
                {orden.partners.map((p, idx) => (
                  <Text key={idx} style={styles.value}>
                    <Text style={styles.labelInline}>Rol: </Text>
                    {p.role}{' '}
                    <Text style={styles.labelInline}>· Partner: </Text>
                    {p.partner}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Datos de la orden</Text>
              <Row label="Equipo" value={orden.equipment} />
              <Row label="Dirección" value={direccionValor} />
              <Row label="Inicio" value={fmtDMY(orden.start_date)} />
              <Row label="Fin" value={fmtDMY(orden.finish_date)} />

              {allMaterials.length > 0 && (
                <TouchableOpacity
                  style={styles.btnSeeMaterials}
                  onPress={() => setShowAllMaterialsModal(true)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="cube-outline" size={16} color="#fff" />
                  <Text style={styles.btnSeeMaterialsText}>Ver materiales asignados</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.sectionKicker]}>Operaciones asignadas</Text>
          </>
        }
        renderItem={({ item: op, index }) => {
          const limitMin = op.duracion_minutos ?? durationToMinutes(op.DurationNormal, op.DurationNormalUnit);
          const effectiveId = op.id || opKey(orden.Orderid, op);

          const workedMs = Number(op.worked_ms || 0);
          const resumeAtMs = toMs(op.last_resume_at) ?? (clientStartsRef.current[effectiveId] ?? toMs(op.Strttimcon));

          const isOpFinalizada = op.estatus === 'finalizada';
          const actionsDisabled = isOpsLocked || isOpFinalizada;

          return (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => openComponentsModal(op, 'view')}
              style={[
                styles.operCard,
                operacionesFueraTiempo[effectiveId] && { borderColor: FIORI.err, borderWidth: 2 },
                actionsDisabled && { opacity: 0.85 },
              ]}
            >
              <View style={styles.operHeader}>
                <Text style={styles.operTitle}>
                  #{index + 1} · {op.activity}
                </Text>
                {!!op.subactivity && <Text style={styles.operSub}>{op.subactivity}</Text>}
              </View>

              {!!op.description && <Text style={styles.operDesc}>{op.description}</Text>}

              <Text style={styles.operMeta}>
                Tiempo asignado:{' '}
                <Text style={styles.operMetaBold}>
                  {limitMin ?? '—'} {Number.isFinite(limitMin) ? 'min' : ''}
                </Text>
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Ionicons name="pricetags-outline" size={14} color={FIORI.textMuted} />
                <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>{`Toca para ver materiales y cantidades`}</Text>
              </View>

              {/* ✅ Timer solo si EN PROCESO y NO bloqueado */}
              {op.estatus === 'en_proceso' && !actionsDisabled && (
                <TimerBadge
                  opId={effectiveId}
                  label={op.activity}
                  limitMin={limitMin}
                  workedMs={workedMs}
                  resumeAtMs={resumeAtMs}
                  onNeedStartLocal={() => {
                    if (!clientStartsRef.current[effectiveId]) {
                      clientStartsRef.current[effectiveId] = Date.now();
                      saveStartMs(effectiveId, clientStartsRef.current[effectiveId]);
                    }
                  }}
                  onNearingEnd={() => {
                    playAlertSound();
                    Alert.alert('⏳ Queda poco tiempo', 'Falta menos de 1 minuto para terminar.', [{ text: 'OK' }]);
                  }}
                  onExpire={() => {
                    playAlertSound();
                    Alert.alert('⏱️ Tiempo agotado', `La operación "${op.activity}" superó el tiempo asignado.`, [
                      { text: 'Finalizar', onPress: () => solicitarFinalizarOperacion(op) },
                      { text: 'Continuar', style: 'cancel' },
                    ]);
                    setOperacionesFueraTiempo((prev) => ({ ...prev, [effectiveId]: true }));
                  }}
                />
              )}

              {/* ===== Acciones técnico (deshabilitadas si locked) ===== */}
              {user?.rol_id === 3 &&
                (() => {
                  if (actionsDisabled) {
                    return (
                      <View
                        style={[
                          styles.btnPrimary,
                          { backgroundColor: FIORI.surfaceAlt, borderWidth: 1, borderColor: FIORI.border },
                        ]}
                      >
                        <Ionicons
                          name={isOpFinalizada ? "checkmark-done-outline" : "lock-closed-outline"}
                          size={16}
                          color={FIORI.textMuted}
                        />
                        <Text style={[styles.btnPrimaryText, { color: FIORI.textMuted }]}>
                          {isOpFinalizada ? "Operación finalizada" : "Operación bloqueada"}
                        </Text>
                      </View>
                    );
                  }


                  if (op.estatus === 'pendiente') {
                    return (
                      <TouchableOpacity style={styles.btnPrimary} onPress={() => iniciarOperacion(op)}>
                        <Ionicons name="play-outline" size={16} color="#fff" />
                        <Text style={styles.btnPrimaryText}>Iniciar actividad</Text>
                      </TouchableOpacity>
                    );
                  }

                  if (op.estatus === 'pausada') {
                    return (
                      <TouchableOpacity style={styles.btnPrimary} onPress={() => iniciarOperacion(op)}>
                        <Ionicons name="play-outline" size={16} color="#fff" />
                        <Text style={styles.btnPrimaryText}>Reanudar</Text>
                      </TouchableOpacity>
                    );
                  }

                  if (op.estatus === 'en_proceso') {
                    return (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        {/* ✅ CAMBIO: ahora abre modal de motivo */}
                        <TouchableOpacity
                          style={[styles.btnPrimary, { backgroundColor: FIORI.pause, flex: 1 }]}
                          onPress={() => openPauseModal(op)}
                        >
                          <Ionicons name="pause-circle-outline" size={16} color="#fff" />
                          <Text style={styles.btnPrimaryText}>Pausar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.btnPrimary, { backgroundColor: FIORI.ok, flex: 1 }]}
                          onPress={() => solicitarFinalizarOperacion(op)}
                        >
                          <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
                          <Text style={styles.btnPrimaryText}>Finalizar</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  return <Text style={styles.operDone}>Finalizada</Text>;
                })()}

              {!isNoMant && (isOrderSinEmpezar || isOrderPendiente0100) && (
                <Text style={styles.operLocked}>
                  Las operaciones están bloqueadas mientras la orden esté en estatus pendiente (0100).
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          !isNoMant && (
            <>
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Mantenimiento</Text>
                <View style={styles.grid}>
                  <FormCardFlat
                    title="Mantto elevador"
                    icon="construct-outline"
                    color="#5AAAF6"
                    onPress={irAManttoElevador}
                  />
                  <FormCardFlat
                    title="Mantto escalera"
                    icon="build-outline"
                    color="#4C9FEF"
                    onPress={irAManttoEscalera}
                  />
                </View>
              </View>

              {user?.rol_id === 3 && (
                <View style={{ marginTop: 4, marginBottom: 24 }}>
                  <TouchableOpacity
                    style={[styles.btnFinishOrder, finishingOrder && { opacity: 0.7 }]}
                    activeOpacity={0.9}
                    onPress={handleFinalizarOrden}
                    disabled={finishingOrder}
                  >
                    <Ionicons name="flag-outline" size={18} color="#fff" />
                    <Text style={styles.btnFinishOrderText}>
                      {finishingOrder ? 'Preparando firma…' : 'Finalizar orden'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )
        }
      />

      {!isOpsLocked && (
        <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={(e) => irAAvisoAveria(e)}>
          <Ionicons name="warning-outline" size={20} color="#000000ff" />
          <Text style={styles.fabLabel}>Avería</Text>
        </TouchableOpacity>
      )}

      {/* ===== Modal TODOS materiales ===== */}
      <Modal
        visible={showAllMaterialsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAllMaterialsModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Materiales asignados a la orden</Text>
              <TouchableOpacity onPress={() => setShowAllMaterialsModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420, paddingHorizontal: 12, paddingVertical: 8 }}>
              {!allMaterials || allMaterials.length === 0 ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 8 }}>
                  Esta orden no tiene materiales asignados desde SAP.
                </Text>
              ) : (
                allMaterials.map((m, idx) => {
                  const desc = m.MatlDesc || m.ShortText || m.Material || 'Sin descripción';
                  const qty = m.RequirementQuantity ?? m.Quantity ?? '—';
                  const unit = m.RequirementQuantityUnitIso || m.RequirementQuantityUnit || m.Unit || '';
                  return (
                    <View key={m.id || `${m.activity}-${m.Item}-${idx}`} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.compTitle}>{desc}</Text>
                        <Text style={styles.compSub}>
                          Cantidad: {qty} {unit}
                        </Text>
                        <Text style={styles.compMeta}>
                          Operación: {m.activity || '—'} · Item: {m.Item || '—'}
                        </Text>
                        <Text style={styles.compMeta}>
                          Centro: {m.Plant || '—'} · Almacén: {m.StorageLocation || '—'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== Modal materiales por operación + consumo ===== */}
      <Modal visible={showCompModal} animationType="slide" transparent onRequestClose={closeComponentsModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Materiales ·{' '}
                {selectedOp ? `${selectedOp.activity}${selectedOp.subactivity ? ' / ' + selectedOp.subactivity : ''}` : ''}
              </Text>
              <TouchableOpacity onPress={closeComponentsModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380, paddingHorizontal: 12 }}>
              {loadingComponents ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 12 }}>Cargando materiales…</Text>
              ) : !compList || compList.length === 0 ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 12 }}>No hay materiales asignados a esta operación.</Text>
              ) : (
                compList.map((c) => {
                  const desc = c.MatlDesc || c.ShortText || c.Material || 'Sin descripción';
                  const qtyAsignada = c.RequirementQuantity ?? c.Quantity ?? '—';
                  const unit = c.RequirementQuantityUnitIso || c.RequirementQuantityUnit || c.Unit || '';

                  return (
                    <View key={`${c.Orderid}-${c.Activity}-${c.ResItem}`} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.compTitle}>{desc || 'Sin descripción'}</Text>
                        <Text style={styles.compSub}>
                          Cantidad asignada: {qtyAsignada} {unit}
                        </Text>
                      </View>

                      {modalMode === 'finalizar' && hasComponents && consumioMaterial && (
                        <View style={styles.compQtyWrapper}>
                          <Text style={styles.compMeta}>Consumido:</Text>
                          <View style={styles.compQty}>
                            <TextInput
                              style={styles.inputQty}
                              keyboardType="numeric"
                              value={cantidadesConsumidas[c.ResItem] ?? ''}
                              onChangeText={(txt) => setCantidadesConsumidas((prev) => ({ ...prev, [c.ResItem]: txt }))}
                              placeholder="0"
                            />
                            <Text style={styles.compQtyUnit}>{unit}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>

            {modalMode === 'finalizar' ? (
              <>
                {hasComponents ? (
                  <View style={styles.modalConsumeRow}>
                    <Text style={{ color: FIORI.text, fontWeight: '700' }}>¿Se consumió material asignado?</Text>
                    <View style={styles.toggleRow}>
                      <TouchableOpacity
                        style={[styles.toggleBtn, consumioMaterial && styles.toggleBtnActive]}
                        onPress={() => setConsumioMaterial(true)}
                      >
                        <Text style={[styles.toggleBtnText, consumioMaterial && styles.toggleBtnTextActive]}>Sí</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.toggleBtn, !consumioMaterial && styles.toggleBtnActive]}
                        onPress={() => setConsumioMaterial(false)}
                      >
                        <Text style={[styles.toggleBtnText, !consumioMaterial && styles.toggleBtnTextActive]}>No</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.modalConsumeRow}>
                    <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>
                      Esta operación no tiene materiales asignados. Solo se marcará como finalizada.
                    </Text>
                  </View>
                )}

                <View style={styles.modalFooterRow}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                    onPress={closeComponentsModal}
                    disabled={finalizandoOp}
                  >
                    <Text style={styles.smallBtnText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: FIORI.brand }]}
                    onPress={finalizarOperacionConMaterial}
                    disabled={finalizandoOp}
                  >
                    <Text style={[styles.smallBtnText, { color: '#fff' }]}>
                      {finalizandoOp ? 'Guardando…' : 'Finalizar operación'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.modalFooter} />
            )}
          </View>
        </View>
      </Modal>

      {/* ✅ NUEVO: Modal motivo de pausa */}
      <Modal visible={showPauseModal} animationType="slide" transparent onRequestClose={closePauseModal}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Motivo de pausa</Text>
              <TouchableOpacity onPress={closePauseModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 14 }}>
              <Text style={{ color: FIORI.text, fontWeight: '800', marginBottom: 8 }}>
                Escribe el motivo:
              </Text>

              <TextInput
                value={pauseMotivo}
                onChangeText={setPauseMotivo}
                placeholder="Ej. Esperando refacción / Cliente no autoriza / Falta acceso…"
                placeholderTextColor={FIORI.textMuted}
                multiline
                style={{
                  minHeight: 90,
                  borderWidth: 1,
                  borderColor: FIORI.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: FIORI.surfaceAlt,
                  color: FIORI.text,
                  textAlignVertical: 'top',
                }}
              />

              <View style={[styles.modalFooterRow, { paddingLeft: 0, paddingRight: 0 }]}>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]} onPress={closePauseModal}>
                  <Text style={styles.smallBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: FIORI.pause, borderColor: FIORI.pause }]}
                  onPress={confirmarPausaConMotivo}
                >
                  <Ionicons name="pause-circle-outline" size={16} color="#fff" />
                  <Text style={[styles.smallBtnText, { color: '#fff' }]}>Pausar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal firma cliente ===== */}
      <Modal visible={showSignModal} animationType="slide" transparent onRequestClose={() => setShowSignModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Firma del cliente</Text>
              <TouchableOpacity onPress={() => setShowSignModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 12 }}>
              <Text style={{ color: FIORI.text, fontSize: 13, marginBottom: 8, fontWeight: '600' }}>
                Pida al cliente que firme dentro del recuadro. Esta firma se usará como evidencia de finalización.
              </Text>

              <View
                style={{
                  height: 320,
                  borderWidth: 1,
                  borderColor: FIORI.border,
                  borderRadius: 12,
                  backgroundColor: '#fff',
                }}
              >
                <Signature
                  ref={signatureRef}
                  onOK={(sig) => setSignatureData(sig)}
                  onClear={() => setSignatureData(null)}
                  descriptionText="Firme aquí"
                  clearText="Limpiar"
                  confirmText="Listo"
                  webStyle={`
                    .m-signature-pad { box-shadow: none; border: none; height: 100%; }
                    .m-signature-pad--body { border: 0; height: 75%; }
                    .m-signature-pad--footer {
                      height: 25%;
                      display: flex !important;
                      justify-content: space-between;
                      align-items: center;
                      padding: 8px 12px;
                    }
                    .m-signature-pad--footer .button { font-size: 12px; padding: 6px 10px; border-radius: 6px; }
                    .m-signature-pad--footer .button.save { background-color: #0A6ED1; color: #fff; }
                    .m-signature-pad--footer .button.clear { background-color: #EEEEEE; color: #333; }
                  `}
                />
              </View>

              <Text style={{ marginTop: 8, fontSize: 11, color: FIORI.textMuted }}>
                Puede usar "Limpiar" dentro del recuadro para borrar y volver a firmar.
              </Text>
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={() => setShowSignModal(false)}
                disabled={savingSignature}
              >
                <Text style={styles.smallBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnFinishOrder, savingSignature && { opacity: 0.7 }]}
                activeOpacity={0.9}
                onPress={confirmarFinalizarConFirma}
                disabled={savingSignature}
              >
                <Ionicons name="flag-outline" size={18} color="#fff" />
                <Text style={styles.btnFinishOrderText}>{savingSignature ? 'Guardando…' : 'Finalizar orden'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal PDF no mantenimiento ===== */}
      <Modal visible={showNoMantPdfModal} animationType="slide" transparent onRequestClose={cerrarModalNoMantPdf}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Carta de no mantenimiento (PDF)</Text>
              <TouchableOpacity onPress={cerrarModalNoMantPdf} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, padding: 12 }}>
              {loadingNoMantPdf ? (
                <View style={{ alignItems: 'center', marginTop: 20 }}>
                  <ActivityIndicator size="large" color={FIORI.brand} />
                  <Text style={{ marginTop: 10, color: FIORI.textMuted }}>Cargando PDF…</Text>
                </View>
              ) : noMantError ? (
                <Text style={{ color: FIORI.err, marginTop: 10 }}>{noMantError}</Text>
              ) : noMantPdfUrl ? (
                <View style={{ flex: 1, height: 420 }}>
                  <WebView source={{ uri: noMantPdfUrl }} style={{ flex: 1 }} />
                </View>
              ) : (
                <Text style={{ color: FIORI.textMuted, marginTop: 10 }}>
                  No se encontró el archivo PDF de la carta de no mantenimiento.
                </Text>
              )}
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={cerrarModalNoMantPdf}
              >
                <Text style={styles.smallBtnText}>Cerrar</Text>
              </TouchableOpacity>

              {noMantPdfRawUrl && (
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: FIORI.brand }]}
                  onPress={descargarNoMantPdf}
                  disabled={downloadingNoMantPdf}
                >
                  <Text style={[styles.smallBtnText, { color: '#fff' }]}>
                    {downloadingNoMantPdf ? 'Descargando…' : 'Descargar'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ====== Subcomponentes UI ====== */
const Row = ({ label, value }) => {
  const text = formatValueForRow(value);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{text}</Text>
    </View>
  );
};

const FormCardFlat = ({ title, icon, color, onPress }) => (
  <TouchableOpacity style={styles.cardWrap} onPress={onPress} activeOpacity={0.92}>
    <View style={[styles.card, { backgroundColor: color }]}>
      <View style={styles.cardTop}>
        <View style={styles.iconBadge}>
          <Ionicons name={icon} size={18} color="#fff" />
        </View>
      </View>
      <Text numberOfLines={2} style={styles.cardTitle}>
        {title}
      </Text>
    </View>
  </TouchableOpacity>
);

/** ================= Cronómetro por operación (PAUSAS OK) ================= */
const TimerBadge = ({ opId, label, limitMin, workedMs = 0, resumeAtMs, onNeedStartLocal, onNearingEnd, onExpire }) => {
  const [now, setNow] = useState(Date.now());
  const nearingShownRef = useRef(false);
  const expiredShownRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (resumeAtMs == null) onNeedStartLocal?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAtMs]);

  const tramoMs = resumeAtMs ? Math.max(0, now - resumeAtMs) : 0;
  const elapsedMs = (Number.isFinite(workedMs) ? workedMs : 0) + tramoMs;

  const hasLimit = Number.isFinite(limitMin);
  const limitMs = hasLimit ? limitMin * 60 * 1000 : null;
  const remainingMs = hasLimit ? Math.max(0, limitMs - elapsedMs) : null;

  useEffect(() => {
    if (!hasLimit) return;

    if (remainingMs > 0 && remainingMs <= 60000 && !nearingShownRef.current) {
      nearingShownRef.current = true;
      onNearingEnd?.();
    }
    if (remainingMs === 0 && !expiredShownRef.current) {
      expiredShownRef.current = true;
      onExpire?.();
    }
  }, [hasLimit, remainingMs, onNearingEnd, onExpire]);

  return (
    <View style={styles.timerRow}>
      <View style={styles.timerPill}>
        <Ionicons name="time-outline" size={14} color={FIORI.text} />
        <Text style={styles.timerText}> Transcurrido: {fmtHMS(elapsedMs)}</Text>
      </View>

      {hasLimit && (
        <View
          style={[
            styles.timerPill,
            { backgroundColor: remainingMs === 0 ? '#FDECEA' : FIORI.brandSoft, borderColor: FIORI.border },
          ]}
        >
          <Ionicons name="hourglass-outline" size={14} color={FIORI.text} />
          <Text style={styles.timerText}>
            {remainingMs === 0 ? ' ¡Tiempo agotado!' : ` Restante: ${fmtHMS(remainingMs)}`}
          </Text>
        </View>
      )}
    </View>
  );
};

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titulo: { fontSize: 18, fontWeight: '800', color: FIORI.text },

  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8 },
  statusBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  noMantBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    backgroundColor: FIORI.surfaceAlt,
    marginBottom: 12,
    ...elev(0.3),
  },
  noMantTitle: { fontSize: 14, fontWeight: '800', color: FIORI.text, marginBottom: 4 },
  noMantText: { fontSize: 12, color: FIORI.textMuted },
  btnNoMantBanner: { marginLeft: 10, backgroundColor: FIORI.brand, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  btnNoMantBannerText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  panel: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    marginBottom: 12,
    ...elev(0.4),
  },
  panelTitle: { fontSize: 14, fontWeight: '800', color: FIORI.text, marginBottom: 8 },

  row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: FIORI.borderSoft },
  rowLabel: { fontSize: 13, color: FIORI.textMuted, marginBottom: 2 },
  rowValue: { fontSize: 14, color: FIORI.text, fontWeight: '600' },

  btnSeeMaterials: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: FIORI.brand,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnSeeMaterialsText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  labelInline: { fontWeight: '700', color: FIORI.text },
  value: { color: FIORI.text, marginBottom: 4 },

  sectionKicker: { fontSize: 13, color: FIORI.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6, marginBottom: 8, paddingHorizontal: 4 },

  operCard: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    marginBottom: 12,
    ...elev(0.6),
  },
  operHeader: { borderBottomWidth: 1, borderBottomColor: FIORI.borderSoft, paddingBottom: 6, marginBottom: 8 },
  operTitle: { fontSize: 15, fontWeight: '800', color: FIORI.text },
  operSub: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },
  operDesc: { fontSize: 13, color: FIORI.text, marginBottom: 6 },
  operMeta: { fontSize: 12, color: FIORI.textMuted, marginBottom: 8 },
  operMetaBold: { color: FIORI.text, fontWeight: '800' },

  operDone: { fontSize: 12, color: FIORI.ok, fontWeight: '800', marginTop: 8 },
  operLocked: { marginTop: 8, fontSize: 12, color: FIORI.textMuted, fontStyle: 'italic' },

  btnPrimary: {
    backgroundColor: FIORI.brand,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexDirection: 'row',
    marginTop: 8,
    ...elev(0.4),
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },

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

  timerRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: FIORI.surfaceAlt,
    borderWidth: 1,
    borderColor: FIORI.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  timerText: { color: FIORI.text, fontWeight: '800', fontSize: 12 },

  error: { marginTop: 40, textAlign: 'center', fontSize: 16, color: FIORI.err },

  fab: {
    position: 'absolute',
    right: 16,
    bottom: 80,
    backgroundColor: FIORI.warn,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...elev(0.8),
  },
  fabLabel: { color: '#000000ff', fontWeight: '800', fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    overflow: 'hidden',
    ...elev(0.8),
  },
  modalHeader: { backgroundColor: FIORI.brand, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  modalTitle: { color: '#fff', fontWeight: '900', fontSize: 15, flex: 1 },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },

  compRow: { borderBottomWidth: 1, borderBottomColor: FIORI.borderSoft, paddingVertical: 10, flexDirection: 'row', gap: 10 },
  compTitle: { fontSize: 14, fontWeight: '800', color: FIORI.text },
  compSub: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },
  compMeta: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },

  compQtyWrapper: { minWidth: 120, marginLeft: 8 },
  compQty: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  inputQty: {
    flex: 1,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    textAlign: 'right',
    backgroundColor: FIORI.surfaceAlt,
  },
  compQtyUnit: { fontSize: 11, color: FIORI.textMuted, marginTop: 2, textAlign: 'right' },

  modalFooter: { padding: 12, alignItems: 'flex-end' },

  modalConsumeRow: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4, flexDirection: 'column', gap: 8 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: FIORI.border,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FIORI.surfaceAlt,
  },
  toggleBtnActive: { backgroundColor: FIORI.brand, borderColor: FIORI.brand },
  toggleBtnText: { fontSize: 13, color: FIORI.textMuted, fontWeight: '600' },
  toggleBtnTextActive: { color: '#fff', fontWeight: '700' },

  modalFooterRow: { padding: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: FIORI.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallBtnText: { color: FIORI.text, fontWeight: '700', fontSize: 13 },
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
