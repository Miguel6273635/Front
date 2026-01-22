// app/ordenes/[id]/index.js
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  FlatList,
} from 'react-native';

import Header from '../../../../src/components/Header';
import api from '../../../../src/services/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { useLocalSearchParams, router } from 'expo-router';

import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// ✅ Secciones (segmentación)
import EncabezadoDetalleOrden from './secciones/EncabezadoDetalleOrden';
import ModalesDetalleOrden from './secciones/ModalesDetalleOrden';
import { ListaOperacionesAgrupadas } from './secciones/ListaOperacionesDetalle';
import PieDetalleOrden from './secciones/PieDetalleOrden';

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

/* ====================== ✅ Dirección igual que rutas-asignadas ====================== */
function mapDireccionLikeBackend(addr) {
  if (!addr) return { cliente: '', direccion: '' };

  const Name1 = addr.Name1 ?? '';
  const Name2 = addr.Name2 ?? '';
  const Street = addr.Street ?? addr.StreetName ?? '';
  const HouseNum1 = addr.HouseNum1 ?? '';
  const StrSuppl3 = addr.StrSuppl3 ?? '';
  const Location = addr.Location ?? '';
  const City1 = addr.City1 ?? '';
  const Region = addr.Region ?? '';
  const PostCode1 = addr.PostCode1 ?? '';
  const Country = addr.Country ?? '';

  const cliente = [Name1, Name2].filter(Boolean).join(' ').trim();

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
    .join(', ');

  return { cliente, direccion };
}

// tu regla típica: si existe segunda dirección, usa esa; si no, la primera
function pickSecondAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results.length >= 2 ? results[1] : results[0];
}

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
        : st.estatus || sapEstatus || 'pendiente';

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

/* ====================== Helpers batch ====================== */
const padOp4 = (v) => String(v || '').trim().padStart(4, '0');

function pickEarliestResumeMsForGroup(orderId, opsDelGrupo, state) {
  const now = Date.now();
  let earliest = null;

  for (const op of opsDelGrupo || []) {
    const opId = op.id || opKey(orderId, op);
    const cur = state?.[opId] || {};
    const resumeISO = cur.last_resume_at || cur.started_at || null;
    const resumeMs = resumeISO ? new Date(resumeISO).getTime() : null;

    if (Number.isFinite(resumeMs)) {
      earliest = earliest == null ? resumeMs : Math.min(earliest, resumeMs);
    }
  }

  // fallback: no hay starts
  return earliest == null ? now - 1000 : earliest;
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

  // ✅ selección de grupo (ITEM) para batch
  const [selectedGroup, setSelectedGroup] = useState(null);
  // { categoria, item, opsDelGrupo }

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

  // modal motivo pausa
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseMotivo, setPauseMotivo] = useState('');
  const [sendingPause, setSendingPause] = useState(false);

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
   *  ✅ OBTENER ORDEN + ✅ DIRECCIÓN IGUAL QUE RUTAS + ✅ OPERACIONES + ✅ LOCAL STATE
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

      // ✅ 1.1) ✅ Dirección: traer /addresses y mapear igual que rutas-asignadas
      let direccionSap = '';
      let clienteSap = '';

      try {
        const resAddr = await api.get(`/api/ordenes/sap/${id}/addresses`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // soporta { results } o { d: { results } }
        const results = resAddr?.data?.results || resAddr?.data?.d?.results || [];

        const chosen = pickSecondAddress(results);
        const mapped = mapDireccionLikeBackend(chosen);

        direccionSap = mapped.direccion || '';
        clienteSap = mapped.cliente || '';

        console.log('[ADDR] results length:', Array.isArray(results) ? results.length : 0);
        console.log('[ADDR] chosen:', chosen);
        console.log('[ADDR] mapped:', mapped);
      } catch (e) {
        console.warn('[ADDR] no se pudo cargar /addresses:', e?.response?.data || e?.message || e);
      }

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

      // ✅ 4.1) inyectar direccion/cliente ya mapeados
      const data = {
        ...baseOrden,
        direccion:
          direccionSap ||
          baseOrden?.direccion ||
          baseOrden?.address ||
          baseOrden?.partner_address ||
          '',
        cliente:
          clienteSap ||
          baseOrden?.cliente ||
          `${baseOrden?.Name1 ?? ''} ${baseOrden?.Name2 ?? ''}`.trim(),
        operaciones: opsMerged,
      };

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

          const limitMin =
            op.duracion_minutos ?? durationToMinutes(op.DurationNormal, op.DurationNormalUnit);
          if (!Number.isFinite(limitMin)) continue;

          const workedMs = Number(op.worked_ms || 0);
          const resumeAtMs =
            toMs(op.last_resume_at) ??
            (clientStartsRef.current[op.id] ?? toMs(op.Strttimcon));

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
      setSelectedGroup(null);
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

  // ✅ abrir/cerrar modal motivo pausa (individual)
  const openPauseModal = (op) => {
    setSelectedGroup(null);
    setSelectedOp(op);
    setPauseMotivo('');
    setShowPauseModal(true);
  };

  // ✅ abrir modal motivo pausa (ITEM/grupo)
  const pausarItem = ({ categoria, item, opsDelGrupo }) => {
    setSelectedOp(null);
    setSelectedGroup({ categoria, item, opsDelGrupo: opsDelGrupo || [] });
    setPauseMotivo('');
    setShowPauseModal(true);
  };

  const closePauseModal = () => {
    if (sendingPause) return;
    setShowPauseModal(false);
    setPauseMotivo('');
    setSelectedOp(null);
    setSelectedGroup(null);
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

    const msg =
      op.estatus === 'pausada'
        ? '¿Deseas reanudar esta actividad?'
        : '¿Deseas iniciar esta actividad?';

    Alert.alert(op.estatus === 'pausada' ? 'Reanudar operación' : 'Iniciar operación', msg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: op.estatus === 'pausada' ? 'Reanudar' : 'Iniciar',
        onPress: async () => {
          try {
            // Ping API (no BD)
            await api.put(
              `/api/operaciones/${opId}/iniciar`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            );

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
              operaciones: (prevOrden.operaciones || []).map((x) =>
                x.id === opId ? { ...x, ...st[opId] } : x
              ),
            }));

            Alert.alert(
              op.estatus === 'pausada' ? 'Operación reanudada' : 'Operación iniciada',
              'Se ha registrado el tiempo.'
            );
          } catch (error) {
            console.error('Error al iniciar/reanudar operación:', error?.response?.data || error);
            Alert.alert('Error', 'No se pudo iniciar/reanudar la operación');
          }
        },
      },
    ]);
  };


  // ✅ INICIAR / REANUDAR ITEM (GRUPO)
// Backend no tiene /grupo/iniciar, así que hacemos iniciar por cada op (ping)
// y actualizamos localState para todas.
const iniciarItem = ({ categoria, item, opsDelGrupo }) => {
  const orderId = String(orden?.Orderid || id);
  const opsArr = Array.isArray(opsDelGrupo) ? opsDelGrupo : [];
  if (!opsArr.length) return;

  if (isOpsLocked) {
    Alert.alert('No permitido', 'La orden está bloqueada por estatus / check-in.');
    return;
  }

  const hayPausadas = opsArr.some((o) => String(o.estatus || '').toLowerCase() === 'pausada');
  const titulo = hayPausadas ? 'Reanudar ITEM' : 'Iniciar ITEM';
  const n = opsArr.length;

  Alert.alert(
    titulo,
    `¿Deseas ${hayPausadas ? 'reanudar' : 'iniciar'} TODAS las operaciones del ITEM ${item}? (${n} actividad(es))`,
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: hayPausadas ? 'Reanudar' : 'Iniciar',
        onPress: async () => {
          try {
            const st = await loadOpState(orderId);
            const nowMs = Date.now();
            const nowISO = new Date(nowMs).toISOString();

            // 1) Ping iniciar por cada operación (sin SAP, solo OK)
            // (Si alguna falla, igual seguimos con las demás)
            await Promise.allSettled(
              opsArr.map((op) => {
                const opId = op.id || opKey(orderId, op);
                return api.put(
                  `/api/operaciones/${opId}/iniciar`,
                  {},
                  { headers: { Authorization: `Bearer ${token}` } }
                );
              })
            );

            // 2) Local state: marcar TODAS en proceso
            for (const op of opsArr) {
              const opId = op.id || opKey(orderId, op);
              const prev = st[opId] || {};

              st[opId] = {
                ...prev,
                estatus: 'en_proceso',
                started_at: prev.started_at || nowISO,
                last_resume_at: nowISO,
                worked_ms: Number(prev.worked_ms || 0),
                finished_at: null,
                paused_at: null,
                pause_motivo: null,
              };

              // fallback local start
              clientStartsRef.current[opId] = nowMs;
              await saveStartMs(opId, nowMs);
            }

            await saveOpState(orderId, st);

            // 3) Refrescar UI sin recargar SAP
            setOrden((prevOrden) => ({
              ...prevOrden,
              operaciones: (prevOrden.operaciones || []).map((x) => {
                const xid = x.id || opKey(orderId, x);
                return st[xid] ? { ...x, ...st[xid] } : x;
              }),
            }));

            Alert.alert(
              hayPausadas ? 'ITEM reanudado' : 'ITEM iniciado',
              'Se registró el inicio en el dispositivo para todas las actividades del ITEM.'
            );
          } catch (e) {
            console.error('Error iniciar ITEM:', e?.response?.data || e);
            Alert.alert('Error', 'No se pudo iniciar/reanudar el ITEM.');
          }
        },
      },
    ]
  );
};

  // ✅ FINALIZAR ITEM (GRUPO) -> /api/operaciones/grupo/finalizar
  const finalizarGrupoAhora = async ({ categoria, item, opsDelGrupo }) => {
    const orderId = String(orden?.Orderid || id);
    const opsArr = Array.isArray(opsDelGrupo) ? opsDelGrupo : [];
    if (!opsArr.length) return;

    if (isOpsLocked) {
      Alert.alert('No permitido', 'La orden está bloqueada por estatus / check-in.');
      return;
    }

    try {
      setFinalizandoOp(true);

      const st = await loadOpState(orderId);

      const tzOffsetMin = new Date().getTimezoneOffset();
      const finishedMs = Date.now();
      const finishedISO = new Date(finishedMs).toISOString();

      // operations[]: puedes mandar compuestas; backend normaliza Activity
      const operations = opsArr.map((o) => o.id || opKey(orderId, o));

      // workedMsTotalByOp: { "0010": ms, ... }
      const workedMsTotalByOp = {};
      for (const op of opsArr) {
        const opId = op.id || opKey(orderId, op);
        const cur = st[opId] || {};

        const lastResumeISO = cur.last_resume_at;
        const extraMs = lastResumeISO
          ? Math.max(0, finishedMs - new Date(lastResumeISO).getTime())
          : 0;

        const totalMs = Number(cur.worked_ms || 0) + extraMs;

        const opNum = padOp4(op.activity || op.Activity || '');
        if (opNum) workedMsTotalByOp[opNum] = totalMs;
      }

      const startedMs = pickEarliestResumeMsForGroup(orderId, opsArr, st); // 👈 igual que pausa
      const startedISO = new Date(startedMs).toISOString();

      const payload = {
        orderId,
        operations,
        startedMs,
        finishedMs,
        startedISO,
        finishedISO,
        tzOffsetMin,
        workedMsTotalByOp,
        materialConsumptionByOp: {}, // luego lo conectas si quieres
      };


      console.log('[BATCH FINALIZAR ITEM] payload:', payload);

      const res = await api.put(`/api/operaciones/grupo/finalizar`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // marcar localmente finalizadas
      for (const op of opsArr) {
        const opId = op.id || opKey(orderId, op);
        const cur = st[opId] || {};
        st[opId] = {
          ...cur,
          estatus: 'finalizada',
          last_resume_at: null,
          finished_at: finishedISO,
          paused_at: null,
        };

        delete clientStartsRef.current[opId];
        await removeStartMs(opId);
      }

      await saveOpState(orderId, st);

      setOrden((prevOrden) => ({
        ...prevOrden,
        operaciones: (prevOrden.operaciones || []).map((x) => {
          const xid = x.id || opKey(orderId, x);
          return st[xid] ? { ...x, ...st[xid] } : x;
        }),
      }));

      const conf = res?.data?.confirmacion;
      Alert.alert(
        'ITEM finalizado',
        conf?.ok ? 'Se confirmó en SAP.' : 'Se finalizó, pero SAP no confirmó (revisar conexión).'
      );
    } catch (e) {
      console.error('Error finalizar ITEM:', e?.response?.data || e);
      Alert.alert('Error', 'No se pudo finalizar el ITEM.');
    } finally {
      setFinalizandoOp(false);
    }
  };

  const finalizarItem = ({ categoria, item, opsDelGrupo }) => {
    const n = Array.isArray(opsDelGrupo) ? opsDelGrupo.length : 0;
    Alert.alert(
      'Finalizar ITEM',
      `¿Deseas finalizar TODAS las operaciones del ITEM ${item}? (${n} actividad(es))`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: async () => finalizarGrupoAhora({ categoria, item, opsDelGrupo }),
        },
      ]
    );
  };

  // ✅ confirmar pausa con motivo (individual o ITEM batch)
  const confirmarPausaConMotivo = async () => {
    if (!orden?.Orderid) return;

    const motivo = String(pauseMotivo || '').trim();
    if (!motivo) {
      Alert.alert('Falta motivo', 'Escribe el motivo de la pausa.');
      return;
    }

    const orderId = String(orden?.Orderid || id);
    const tzOffsetMin = new Date().getTimezoneOffset();
    const nowMs = Date.now();
    const nowISO = new Date(nowMs).toISOString();

    // ======================
    // A) PAUSA ITEM (BATCH)
    // ======================
    if (selectedGroup?.opsDelGrupo?.length) {
      if (isOpsLocked) {
        Alert.alert('No permitido', 'La orden está bloqueada por estatus / check-in.');
        return;
      }

      const opsArr = selectedGroup.opsDelGrupo;

      Alert.alert('Pausar ITEM', '¿Confirmas pausar todas las actividades del ITEM con el motivo?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pausar',
          onPress: async () => {
            setSendingPause(true);
            try {
              const st = await loadOpState(orderId);

              // payload segment: usa el earliest last_resume_at del grupo (para SAP)
              const segStartMs = pickEarliestResumeMsForGroup(orderId, opsArr, st);
              const segEndMs = nowMs;

              const payload = {
                orderId,
                operations: opsArr.map((o) => o.id || opKey(orderId, o)),
                segStartMs,
                segEndMs,
                tzOffsetMin,
                ConfText: motivo,
              };

              console.log('[BATCH PAUSAR ITEM] payload:', payload);

              const resp = await api.put(`/api/operaciones/grupo/pausar`, payload, {
                headers: { Authorization: `Bearer ${token}` },
              });

              // ✅ local state por operación (cada una suma su tramo real)
              for (const op of opsArr) {
                const opId = op.id || opKey(orderId, op);
                const cur = st[opId] || {};

                const resumeISO = cur.last_resume_at || cur.started_at || nowISO;
                const resumeMs = new Date(resumeISO).getTime();
                const segWorkedMs = Number.isFinite(resumeMs) ? Math.max(0, nowMs - resumeMs) : 0;

                st[opId] = {
                  ...cur,
                  estatus: 'pausada',
                  worked_ms: Number(cur.worked_ms || 0) + segWorkedMs,
                  last_resume_at: null,
                  paused_at: nowISO,
                  pause_motivo: motivo,
                };

                delete clientStartsRef.current[opId];
                await removeStartMs(opId);
              }

              await saveOpState(orderId, st);

              setOrden((prevOrden) => ({
                ...prevOrden,
                operaciones: (prevOrden.operaciones || []).map((x) => {
                  const xid = x.id || opKey(orderId, x);
                  return st[xid] ? { ...x, ...st[xid] } : x;
                }),
              }));

              closePauseModal();

              Alert.alert(
                'ITEM pausado',
                resp?.data?.confirmacion?.ok
                  ? 'Se pausó y se confirmó en SAP.'
                  : 'Se pausó, pero SAP no confirmó (revisar conexión).'
              );
            } catch (error) {
              console.error('Error al pausar ITEM:', error?.response?.data || error);
              Alert.alert('Error', 'No se pudo pausar el ITEM');
            } finally {
              setSendingPause(false);
            }
          },
        },
      ]);

      return;
    }

    // ======================
    // B) PAUSA INDIVIDUAL
    // ======================
    if (!selectedOp) return;

    const op = selectedOp;
    const opId = op.id || opKey(orderId, op);

    if (isOpsLocked) {
      Alert.alert('No permitido', 'La orden está bloqueada por estatus / check-in.');
      return;
    }

    Alert.alert('Pausar operación', '¿Confirmas pausar esta actividad con el motivo capturado?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Pausar',
        onPress: async () => {
          setSendingPause(true);
          try {
            const st = await loadOpState(orderId);
            const cur = st[opId] || {};

            const segStartISO = cur.last_resume_at || cur.started_at || nowISO;
            const segStartMs = new Date(segStartISO).getTime();

            const segEndMs = nowMs;
            const segWorkedMs = Math.max(0, segEndMs - segStartMs);

            const resp = await api.put(
              `/api/operaciones/${opId}/pausar`,
              {
                segStartISO,
                segEndISO: nowISO,
                segStartMs,
                segEndMs,
                tzOffsetMin,
                ConfText: motivo,
              },
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

            setOrden((prevOrden) => ({
              ...prevOrden,
              operaciones: (prevOrden.operaciones || []).map((x) =>
                x.id === opId ? { ...x, ...st[opId] } : x
              ),
            }));

            closePauseModal();

            Alert.alert(
              'Pausada',
              resp?.data?.confirmacion?.ok
                ? 'Se pausó y se confirmó en SAP.'
                : 'Se pausó, pero SAP no confirmó (revisar conexión).'
            );
          } catch (error) {
            console.error('Error al pausar operación:', error?.response?.data || error);
            Alert.alert('Error', 'No se pudo pausar la operación');
          } finally {
            setSendingPause(false);
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

      // ✅ hora del DISPOSITIVO
      const tzOffsetMin = new Date().getTimezoneOffset();
      const finishedMs = Date.now();
      const finishedISO = new Date(finishedMs).toISOString();

      // started: usa lo guardado; si no hay nada, usa finished
      const startedISO = cur.started_at || cur.last_resume_at || finishedISO;
      const startedMs = new Date(startedISO).getTime();

      // si estaba en proceso, sumamos tramo actual
      const lastResumeISO = cur.last_resume_at;
      const extraMs = lastResumeISO
        ? Math.max(0, finishedMs - new Date(lastResumeISO).getTime())
        : 0;

      const workedMsTotal = Number(cur.worked_ms || 0) + extraMs;

      console.log('[TIME DEVICE]', {
        tzOffsetMin,
        finishedISO,
        finishedMs,
        local: new Date(finishedMs).toString(),
        startedISO,
        startedMs,
        workedMsTotal,
      });

      const res = await api.put(
        `/api/operaciones/${opId}/finalizar`,
        {
          startedISO,
          finishedISO,
          startedMs,
          finishedMs,
          tzOffsetMin,
          workedMsTotal,
          materialConsumption,
        },
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
        operaciones: (prevOrden.operaciones || []).map((x) =>
          x.id === opId ? { ...x, ...st[opId] } : x
        ),
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

      const filename =
        noMantPdfRawUrl.split('/').pop() || `carta-no-mantto_${orden?.Orderid || ''}.pdf`;
      const localUri = FileSystem.documentDirectory + filename;

      const { uri } = await FileSystem.downloadAsync(noMantPdfRawUrl, localUri);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Descarga completa', 'El PDF se guardó en la carpeta de documentos de la app.');
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Compartir / guardar carta de no mantenimiento',
      });
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
      Alert.alert(
        'No se puede finalizar',
        'Hay operaciones en proceso. Finaliza o pausa esas actividades antes de cerrar la orden.'
      );
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
        pendientes > 0
          ? 'La orden se marcó como finalizada con pendientes.'
          : 'La orden se marcó como finalizada.'
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
    let localSound = null;

    (async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(require('../../../../assets/alert.mp3'));
        localSound = sound;
        if (mounted) setSoundObj(sound);
      } catch (e) {
        console.warn('No se pudo cargar el sonido de alerta:', e);
      }
    })();

    return () => {
      mounted = false;
      try {
        localSound?.unloadAsync?.();
      } catch {}
    };
  }, []);

  // ================== Render ==================
  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={`Orden ${id || ''}`} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={FIORI.brand} />
          <Text style={{ marginTop: 10, color: FIORI.textMuted, fontWeight: '700' }}>
            Cargando orden…
          </Text>
        </View>
      </View>
    );
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
        data={[{ _k: 'single' }]} // 👈 un solo item para usar FlatList con header+footer
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
          // ✅ (opcional) ver en consola si ya llegan campos
          console.log(
            '[OPS AGRUPADAS] ejemplo:',
            (orden?.operaciones || [])[0]?.Usr00,
            (orden?.operaciones || [])[0]?.Usr01
          );

          // ✅ Pasamos workedMs/resumeAtMs calculados
          const ops = Array.isArray(orden?.operaciones) ? orden.operaciones : [];

          const workedMsMap = {};
          const resumeAtMsMap = {};

          for (const op of ops) {
            const effectiveId = op.id || opKey(orden.Orderid, op);

            const workedMs = Number(op.worked_ms || 0);
            const resumeAtMs =
              toMs(op.last_resume_at) ??
              (clientStartsRef.current[effectiveId] ?? toMs(op.Strttimcon));

            workedMsMap[effectiveId] = workedMs;
            resumeAtMsMap[effectiveId] = resumeAtMs;
          }

          return (
            <ListaOperacionesAgrupadas
              operaciones={ops}
              ordenId={orden?.Orderid || id}
              styles={styles}
              FIORI={FIORI}
              userRolId={user?.rol_id}
              isOpsLocked={isOpsLocked}
              isNoMant={isNoMant}
              isOrderSinEmpezar={isOrderSinEmpezar}
              isOrderPendiente0100={isOrderPendiente0100}
              operacionesFueraTiempo={operacionesFueraTiempo}
              workedMs={workedMsMap}
              resumeAtMs={resumeAtMsMap}
              clientStartsRef={clientStartsRef}
              saveStartMs={saveStartMs}
              onOpenComponentsView={(opX) => openComponentsModal(opX, 'view')}
              onIniciarOperacion={iniciarOperacion}
              onOpenPauseModal={openPauseModal}
              onSolicitarFinalizarOperacion={solicitarFinalizarOperacion}
              // ✅ NUEVO: acciones por ITEM (batch)
              onPausarItem={pausarItem}
              onFinalizarItem={finalizarItem}
              playAlertSound={playAlertSound}
              setOperacionesFueraTiempo={setOperacionesFueraTiempo}
              onIniciarItem={iniciarItem}
              // ✅ NUEVO: estados de carga para bloquear UI
              finalizandoOp={finalizandoOp}
              sendingPause={sendingPause}
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
            onIrManttoElevador={irAManttoElevador}
            onIrManttoEscalera={irAManttoEscalera}
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
        // Materiales por operación
        showCompModal={showCompModal}
        closeComponentsModal={closeComponentsModal}
        selectedOp={selectedOp}
        modalMode={modalMode}
        loadingComponents={loadingComponents}
        compList={compList}
        hasComponents={hasComponents}
        consumioMaterial={consumioMaterial}
        setConsumioMaterial={setConsumioMaterial}
        cantidadesConsumidas={cantidadesConsumidas}
        setCantidadesConsumidas={setCantidadesConsumidas}
        finalizandoOp={finalizandoOp}
        finalizarOperacionConMaterial={finalizarOperacionConMaterial}
        // Motivo pausa (individual o ITEM)
        showPauseModal={showPauseModal}
        closePauseModal={closePauseModal}
        pauseMotivo={pauseMotivo}
        setPauseMotivo={setPauseMotivo}
        sendingPause={sendingPause}
        confirmarPausaConMotivo={confirmarPausaConMotivo}
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
  btnNoMantBanner: {
    marginLeft: 10,
    backgroundColor: FIORI.brand,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
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

  sectionKicker: {
    fontSize: 13,
    color: FIORI.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  operCard: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    marginBottom: 12,
    ...elev(0.6),
  },
  operHeader: {
    borderBottomWidth: 1,
    borderBottomColor: FIORI.borderSoft,
    paddingBottom: 6,
    marginBottom: 8,
  },
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
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
  modalHeader: {
    backgroundColor: FIORI.brand,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: { color: '#fff', fontWeight: '900', fontSize: 15, flex: 1 },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  compRow: {
    borderBottomWidth: 1,
    borderBottomColor: FIORI.borderSoft,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 10,
  },
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

  modalConsumeRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    flexDirection: 'column',
    gap: 8,
  },
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
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallBtnText: { color: FIORI.text, fontWeight: '700', fontSize: 13 },

  chipTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 280,
  },
  chipTabText: {
    fontWeight: '800',
    fontSize: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grupoTitle: { fontSize: 14, fontWeight: '900', color: FIORI.text },
  grupoMeta: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },
  grupoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: FIORI.border,
    backgroundColor: FIORI.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  grupoBadgeText: { fontWeight: '900', color: FIORI.text, fontSize: 12 },

  itemCard: {
    backgroundColor: FIORI.surfaceAlt,
    borderRadius: 12,
    padding: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: { fontSize: 13, fontWeight: '900', color: FIORI.text },
  itemMeta: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },

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
  badgeSmallText: { fontSize: 11, fontWeight: '900', color: FIORI.text },
  operTitleSmall: { fontSize: 13, fontWeight: '900', color: FIORI.text },
  operDescSmall: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },
  operHintSmall: { fontSize: 12, color: FIORI.textMuted, fontWeight: '700' },
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
