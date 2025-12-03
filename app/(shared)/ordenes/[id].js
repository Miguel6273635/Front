// app/ordenes/[id]/index.js
import React, { useEffect, useState, useRef } from 'react';
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
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import api from '../../../src/services/api';
import { useAuth } from '../../../src/context/AuthContext';
import { useLocalSearchParams, router } from 'expo-router';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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
};

/* ====================== Helpers generales ====================== */
function toMs(val) {
  if (!val) return null;
  const t = new Date(val).getTime();
  return Number.isFinite(t) ? t : null;
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

/* ==== Persistencia de inicios (por operación) ==== */
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

/* ====== Helper para formatear valores en Row (incluida dirección) ====== */
function formatValueForRow(value) {
  if (value == null) return '—';

  const t = typeof value;

  if (t === 'string' || t === 'number' || t === 'boolean') {
    return String(value);
  }

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

    const posibleFull =
      full || direccion || value.fullAddress || value.addressString;

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

/* ====================== Componente ====================== */
export default function DetalleOrden() {
  const { id } = useLocalSearchParams();
  const { user, token } = useAuth();
  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);

  const [operacionesFueraTiempo, setOperacionesFueraTiempo] = useState({});
  const [soundObj, setSoundObj] = useState(null);
  const clientStartsRef = useRef({}); // { [opId]: ms }

  // Modal de componentes + consumo
  const [showCompModal, setShowCompModal] = useState(false);
  const [selectedOp, setSelectedOp] = useState(null);
  const [compList, setCompList] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [modalMode, setModalMode] = useState('view'); // 'view' | 'finalizar'
  const [consumioMaterial, setConsumioMaterial] = useState(false);
  const [cantidadesConsumidas, setCantidadesConsumidas] = useState({});
  const [finalizandoOp, setFinalizandoOp] = useState(false);

  // Modal para PDF de carta no mantenimiento
  const [showNoMantPdfModal, setShowNoMantPdfModal] = useState(false);
  const [noMantPdfUrl, setNoMantPdfUrl] = useState(null);       // URL visor
  const [noMantPdfRawUrl, setNoMantPdfRawUrl] = useState(null); // URL directa
  const [loadingNoMantPdf, setLoadingNoMantPdf] = useState(false);
  const [noMantError, setNoMantError] = useState(null);
  const [downloadingNoMantPdf, setDownloadingNoMantPdf] = useState(false);

  const obtenerOrden = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/ordenes/sap/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const base = res.data;

      // Asegura id compuesto en cada operación
      const opsWithId = (base?.operaciones || []).map((o) => {
        const ensuredId = o.id || opKey(base?.Orderid, o);
        return { ...o, id: ensuredId };
      });

      let data = { ...base, operaciones: opsWithId };

      // Overlay desde operations_local
      try {
        const ov = await api.get(`/operaciones/local/${base?.Orderid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const overlay = Array.isArray(ov.data) ? ov.data : [];
        if (overlay.length) {
          data = {
            ...data,
            operaciones: data.operaciones.map((o) => {
              const match = overlay.find(
                (x) =>
                  String(x.orderid) === String(base?.Orderid) &&
                  String(x.activity) === String(o.activity) &&
                  String(x.subactivity || '') === String(o.subactivity || '')
              );
              return match
                ? {
                    ...o,
                    estatus: match.estatus || o.estatus,
                    Strttimcon: match.started_at || o.Strttimcon,
                    Fintimcons: match.finished_at || o.Fintimcons,
                  }
                : o;
            }),
          };
        }
      } catch {
        /* overlay opcional */
      }

      setOrden(data);

      // Hidratar starts locales y marcar fuera de tiempo
      if (Array.isArray(data?.operaciones)) {
        const entries = await Promise.all(
          data.operaciones.map(async (o) => {
            const serverMs = toMs(o.Strttimcon);
            if (serverMs != null) {
              await saveStartMs(o.id, serverMs);
              return [o.id, serverMs];
            }
            const localMs = await loadStartMs(o.id);
            return [o.id, localMs];
          })
        );
        clientStartsRef.current = Object.fromEntries(
          entries.filter(([, ms]) => ms != null)
        );

        const now = Date.now();
        const fuera = {};
        for (const op of data.operaciones) {
          if (op.estatus !== 'en_proceso') continue;
          const limitMin =
            op.duracion_minutos ??
            durationToMinutes(op.DurationNormal, op.DurationNormalUnit);
          if (!Number.isFinite(limitMin)) continue;

          const startEff =
            clientStartsRef.current[op.id] ?? toMs(o.Strttimcon);
          if (!Number.isFinite(startEff)) continue;

          const elapsed = now - startEff;
          const limitMs = limitMin * 60 * 1000;
          if (elapsed >= limitMs) fuera[op.id] = true;
        }
        if (Object.keys(fuera).length)
          setOperacionesFueraTiempo((prev) => ({ ...prev, ...fuera }));
      }
    } catch (error) {
      console.error(
        'Error al obtener orden (SAP):',
        error?.response?.data || error
      );
      Alert.alert('Error', 'No se pudo cargar la orden desde SAP');
    } finally {
      setLoading(false);
    }
  };

  // Abrir modal de componentes (vista o finalización) trayendo de SAP
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
        `/operaciones/ordenes/${Orderid}/operaciones/${Activity}/componentes`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setCompList(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(
        'Error al obtener componentes:',
        error?.response?.data || error
      );
      Alert.alert(
        'Materiales',
        'No se pudieron obtener los materiales de esta operación.'
      );
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

  // Cuando el usuario quiere FINALIZAR, abrimos modal en modo 'finalizar'
  const solicitarFinalizarOperacion = async (op) => {
    await openComponentsModal(op, 'finalizar');
  };

  // Finalizar operación enviando materialConsumption
  const finalizarOperacionConMaterial = async () => {
    if (!selectedOp || !orden?.Orderid) return;

    const Orderid = orden.Orderid;
    const Activity = selectedOp.activity || selectedOp.Activity;
    const SubActivity =
      selectedOp.subactivity || selectedOp.SubActivity || '';

    const compositeId = `${Orderid}-${Activity}${
      SubActivity ? `-${SubActivity}` : ''
    }`;

    const materialConsumption = (compList || []).map((c) => {
      const qty = consumioMaterial
        ? Number(cantidadesConsumidas[c.ResItem] || 0)
        : 0;

      return {
        Material: c.Material,
        Cantidad: String(qty),
        Unidad: c.RequirementQuantityUnit,
        Centro: c.Plant,
        Almacen: c.StgeLoc || '',
      };
    });

    try {
      setFinalizandoOp(true);

      const body = {
        FintimconsISO: new Date().toISOString(),
        materialConsumption,
      };

      const res = await api.put(
        `/operaciones/${compositeId}/finalizar`,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Actualizar estado local de la orden
      setOrden((prev) => ({
        ...prev,
        operaciones: prev.operaciones.map((o) => {
          const sameById = (o.id || opKey(Orderid, o)) === compositeId;
          const sameByFields =
            String(o.activity) === String(Activity) &&
            String(o.subactivity || '') === String(SubActivity || '');

          if (!sameById && !sameByFields) return o;

          return {
            ...o,
            id: compositeId,
            estatus: 'finalizada',
            Fintimcons: res?.data?.operacion?.Fintimcons ?? o.Fintimcons,
          };
        }),
      }));

      // Limpiar timers locales
      delete clientStartsRef.current[compositeId];
      await removeStartMs(compositeId);

      const conf = res?.data?.confirmacion;
      if (conf?.ok) {
        const raw = conf?.raw || {};
        const numero =
          raw?.ConfNo ||
          raw?.Confirmation ||
          raw?.results?.[0]?.ConfNo ||
          '';
        const suffix = numero ? `\nNo. de confirmación: ${numero}` : '';
        Alert.alert(
          'Finalizada y confirmada',
          `La operación se finalizó y se creó la confirmación en SAP.${suffix}`
        );
      } else if (conf && conf.ok === false) {
        Alert.alert(
          'Finalizada (con aviso)',
          'La operación se finalizó, pero la confirmación en SAP no pudo crearse.\nRevisa conexión o vuelve a intentar desde el historial.'
        );
        console.warn('Confirmación SAP falló:', conf?.error);
      } else {
        Alert.alert('Finalizada', 'La operación se marcó como finalizada.');
      }

      closeComponentsModal();
    } catch (error) {
      console.error(
        'Error al finalizar operación:',
        error?.response?.data || error
      );
      Alert.alert('Error', 'No se pudo finalizar la operación');
    } finally {
      setFinalizandoOp(false);
    }
  };

  // Navegaciones a formularios (existentes)
  const go =
    (path) =>
    (e, Orderid) => {
      e?.stopPropagation?.();
      router.push(`/tecnico/ordenes/${Orderid}/${path}`);
    };
  const irACartaNoMantenimiento = go('carta-no-mantenimiento');
  const irAReportePendientes = go('reporte-pendientes');
  const irAReporteAveria = go('reporte-averia');
  const irAManttoElevador = go('reporte-mant-elevadores');
  const irAManttoEscalera = go('reporte-mant-escaleras');
  const irAManttoCables = go('mantto-cables');
  const irAManttoFrenoEmEh = go('mantto-freno-em-eh');
  const irAManttoFrenoPm = go('mantto-freno-pm');
  const irAManttoFrenoPmPmf = go('mantto-freno-pm-pmf');
  const irAutorizacionGastosEH = go('autorizacion-gastos-error-humano');
  const irAReporteEmergencia = go('reporte-emergencia');
  const irAReporteTerminacion = go('terminacion-conformidad');
  const irASolicitudPrestamoRefacciones = go('solicitud-prestamo-refacciones');
  const irARequisicionMateriales = go('requisicion-materiales');
  const irABitacoraMantenimiento = go('bitacora-mantto');

  // 👉 Navegación específica al AVISO DE AVERÍA (SAP)
  const irAAvisoAveria = (e) => {
    e?.stopPropagation?.();

    if (!orden?.Orderid) {
      console.log('[DETALLE-ORDEN] No hay Orderid al ir a aviso', orden);
      Alert.alert('Error', 'No se encontró el número de orden.');
      return;
    }

    const orderid = String(orden.Orderid).trim();
    console.log('[DETALLE-ORDEN] Navegando a aviso-averia con orderid =', orderid);

    router.push({
      pathname: '/tecnico/ordenes/[id]/aviso-averia',
      params: { id: orderid },
    });
  };

  // ===== PDF No mantenimiento =====
  const abrirModalNoMantPdf = async () => {
    if (!orden?.Orderid) return;

    setShowNoMantPdfModal(true);
    setLoadingNoMantPdf(true);
    setNoMantPdfUrl(null);
    setNoMantPdfRawUrl(null);
    setNoMantError(null);

    try {
      const res = await api.get(
        `/evidencias/orden/${orden.Orderid}/no-mantenimiento-pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // El backend devuelve { ok, pdf_url, file_name, mime_type }
      const { pdf_url } = res.data || {};

      if (!pdf_url) {
        throw new Error('Sin URL de PDF desde backend');
      }

      // api.baseURL normalmente es algo como: http://IP:5000/api
      const apiBase = api.defaults.baseURL || '';
      const serverRoot = apiBase.replace(/\/api\/?$/, ''); // -> http://IP:5000

      const rawUrl = `${serverRoot}${pdf_url}`; // URL directa al .pdf
      setNoMantPdfRawUrl(rawUrl);

      // URL para el visor (Google Docs Viewer)
      const viewerUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(
        rawUrl
      )}`;

      setNoMantPdfUrl(viewerUrl); // esta la ve el WebView
    } catch (error) {
      console.error(
        'Error al obtener PDF de no mantenimiento:',
        error?.response?.data || error
      );
      setNoMantError(
        'No se pudo cargar el PDF de la carta de no mantenimiento.'
      );
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
    if (!noMantPdfRawUrl) return;

    try {
      setDownloadingNoMantPdf(true);

      // Nombre de archivo local
      const filename =
        noMantPdfRawUrl.split('/').pop() ||
        `carta-no-mantto_${orden?.Orderid || ''}.pdf`;

      const localUri = FileSystem.documentDirectory + filename;

      // Descarga real al dispositivo
      const { uri } = await FileSystem.downloadAsync(
        noMantPdfRawUrl,
        localUri
      );

      // Si Sharing no está disponible, al menos avisamos que se descargó
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          'Descarga completa',
          'El PDF se guardó en la carpeta de documentos de la app.'
        );
        return;
      }

      // Abrir diálogo de compartir / guardar
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Compartir / guardar carta de no mantenimiento',
      });
    } catch (e) {
      console.error('Error al descargar PDF:', e);
      Alert.alert('Error', 'No se pudo descargar el PDF.');
    } finally {
      setDownloadingNoMantPdf(false);
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
        const { sound } = await Audio.Sound.createAsync(
          require('../../../assets/alert.mp3')
        );
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

  // ¿Hay alguna operación en proceso en esta orden?
  const anyOpInProcess = React.useMemo(
    () =>
      Array.isArray(orden?.operaciones) &&
      orden.operaciones.some((o) => o.estatus === 'en_proceso'),
    [orden]
  );

  const playAlertSound = async () => {
    try {
      await soundObj?.replayAsync?.();
    } catch {}
  };

  const iniciarOperacion = (op) => {
    const idCompuesto = op.id || opKey(orden?.Orderid, op);

    if (anyOpInProcess && op.estatus === 'pendiente') {
      Alert.alert(
        'No permitido',
        'Ya hay otra operación en proceso en esta orden. Finalízala antes de iniciar una nueva.'
      );
      return;
    }

    Alert.alert('Iniciar operación', '¿Deseas iniciar esta actividad?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Iniciar',
        onPress: async () => {
          try {
            const res = await api.put(
              `/operaciones/${idCompuesto}/iniciar`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            );

            const serverMs = toMs(res?.data?.operacion?.Strttimcon);
            clientStartsRef.current[idCompuesto] = serverMs ?? Date.now();
            await saveStartMs(idCompuesto, clientStartsRef.current[idCompuesto]);

            setOrden((prev) => ({
              ...prev,
              operaciones: prev.operaciones.map((o) =>
                o.id === op.id ||
                (o.activity === op.activity &&
                  String(o.subactivity || '') === String(op.subactivity || ''))
                  ? {
                      ...o,
                      id: idCompuesto,
                      estatus: 'en_proceso',
                      Strttimcon: res?.data?.operacion?.Strttimcon,
                    }
                  : o
              ),
            }));

            Alert.alert(
              'Operación iniciada',
              'Se ha registrado la hora de inicio.'
            );
          } catch (error) {
            console.error(
              'Error al iniciar operación:',
              error?.response?.data || error
            );

            const status = error?.response?.status;
            const data = error?.response?.data;

            if (status === 409) {
              const act = data?.en_proceso?.activity;
              Alert.alert(
                'Ya hay una operación en curso',
                act
                  ? `Finaliza primero la actividad ${act} antes de iniciar otra.`
                  : 'Finaliza primero la operación en proceso antes de iniciar otra.'
              );
            } else if (
              status === 400 &&
              typeof data?.error === 'string' &&
              data.error.includes('finalizada')
            ) {
              Alert.alert(
                'Operación ya finalizada',
                'Esta operación ya fue finalizada y no puede iniciarse de nuevo.'
              );
            } else {
              Alert.alert('Error', 'No se pudo iniciar la operación');
            }
          }
        },
      },
    ]);
  };

  // ================== Render ==================
  if (loading)
    return (
      <ActivityIndicator
        style={{ marginTop: 40 }}
        size="large"
        color={FIORI.brand}
      />
    );

  if (!orden) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de orden" />
        <Text style={styles.error}>No se pudo cargar la orden.</Text>
        <Footer />
      </View>
    );
  }

  // Detectar orden de "No mantenimiento"
  const rawStatus = (orden.estatus || '').toString().toLowerCase();
  const isNoMant =
    rawStatus.includes('no_mant') || rawStatus.includes('no mant');

  const estatusColor = isNoMant
    ? FIORI.textMuted
    : orden.estatus === 'pendiente'
    ? FIORI.err
    : orden.estatus === 'en_proceso'
    ? FIORI.warn
    : FIORI.ok;

  const direccionValor =
    orden.direccion || orden.address || orden.partner_address || null;

  return (
    <View style={styles.container}>
      <Header title="Detalle de orden" />

      {/* Contenido scrollable con footer fijo abajo */}
      <FlatList
        style={{ flex: 1 }}
        data={orden.operaciones || []}
        keyExtractor={(op, idx) =>
          String(op.id || opKey(orden.Orderid, op) || idx)
        }
        contentContainerStyle={[styles.content, { paddingBottom: 140 }]}
        ListHeaderComponent={
          <>
            <View style={styles.headerBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo}>
                  #{orden.Orderid} · {orden.order_type}
                </Text>
                <Text style={styles.subtituloMuted}>Estatus</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: estatusColor },
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {orden.estatus?.replace('_', ' ') ?? '—'}
                </Text>
              </View>
            </View>

            {/* Banner especial para órdenes de No mantenimiento */}
            {isNoMant && (
              <View style={styles.noMantBanner}>
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color={FIORI.text}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noMantTitle}>
                    Orden marcada como "No mantenimiento"
                  </Text>
                  <Text style={styles.noMantText}>
                    Consulta la carta de no mantenimiento en PDF. Las operaciones
                    se muestran solo para referencia y no se pueden iniciar.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.btnNoMantBanner}
                  onPress={abrirModalNoMantPdf}
                >
                  <Text style={styles.btnNoMantBannerText}>Ver PDF</Text>
                </TouchableOpacity>
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
              <Row
                label="Inicio"
                value={
                  orden.start_date
                    ? new Date(orden.start_date).toLocaleDateString()
                    : '—'
                }
              />
              <Row
                label="Fin"
                value={
                  orden.finish_date
                    ? new Date(orden.finish_date).toLocaleDateString()
                    : '—'
                }
              />
              <Row
                label="Técnico asignado"
                value={orden.tecnico_nombre ?? '—'}
              />
            </View>

            <Text style={[styles.sectionKicker]}>Operaciones asignadas</Text>
          </>
        }
        renderItem={({ item: op, index }) => {
          const limitMin =
            op.duracion_minutos ??
            durationToMinutes(op.DurationNormal, op.DurationNormalUnit);
          const serverStart = toMs(op.Strttimcon);
          const localStart =
            clientStartsRef.current[op.id || opKey(orden.Orderid, op)];
          const effectiveId = op.id || opKey(orden.Orderid, op);

          return (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => openComponentsModal(op, 'view')}
              style={[
                styles.operCard,
                operacionesFueraTiempo[effectiveId] && {
                  borderColor: FIORI.err,
                  borderWidth: 2,
                },
              ]}
            >
              <View style={styles.operHeader}>
                <Text style={styles.operTitle}>
                  #{index + 1} · {op.activity}
                </Text>
                {!!op.subactivity && (
                  <Text style={styles.operSub}>{op.subactivity}</Text>
                )}
              </View>

              {!!op.description && (
                <Text style={styles.operDesc}>{op.description}</Text>
              )}
              <Text style={styles.operMeta}>
                Tiempo asignado:{' '}
                <Text style={styles.operMetaBold}>
                  {limitMin ?? '—'} {Number.isFinite(limitMin) ? 'min' : ''}
                </Text>
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <Ionicons
                  name="pricetags-outline"
                  size={14}
                  color={FIORI.textMuted}
                />
                <Text
                  style={{ color: FIORI.textMuted, fontSize: 12 }}
                >{`Toca para ver materiales y cantidades`}</Text>
              </View>

              {/* Timer solo si NO es NoMant */}
              {op.estatus === 'en_proceso' && !isNoMant && (
                <TimerBadge
                  opId={effectiveId}
                  label={op.activity}
                  limitMin={limitMin}
                  startMs={serverStart ?? localStart}
                  onNeedStartLocal={() => {
                    if (!clientStartsRef.current[effectiveId]) {
                      clientStartsRef.current[effectiveId] = Date.now();
                      saveStartMs(
                        effectiveId,
                        clientStartsRef.current[effectiveId]
                      );
                    }
                  }}
                  onNearingEnd={() => {
                    playAlertSound();
                    Alert.alert(
                      '⏳ Queda poco tiempo',
                      'Falta menos de 1 minuto para terminar.',
                      [{ text: 'OK' }]
                    );
                  }}
                  onExpire={() => {
                    playAlertSound();
                    Alert.alert(
                      '⏱️ Tiempo agotado',
                      `La operación "${op.activity}" superó el tiempo asignado.`,
                      [
                        {
                          text: 'Finalizar',
                          onPress: () => solicitarFinalizarOperacion(op),
                        },
                        { text: 'Continuar', style: 'cancel' },
                      ]
                    );
                    setOperacionesFueraTiempo((prev) => ({
                      ...prev,
                      [effectiveId]: true,
                    }));
                  }}
                />
              )}

              {/* Botones de iniciar/finalizar ocultos si es NoMant */}
              {user?.rol_id === 3 && !isNoMant &&
                (() => {
                  const lockedByOtherOp =
                    anyOpInProcess && op.estatus === 'pendiente';

                  if (op.estatus === 'pendiente') {
                    if (lockedByOtherOp) {
                      return (
                        <Text style={styles.operLocked}>
                          Hay otra operación en curso. Finalízala antes de
                          iniciar esta.
                        </Text>
                      );
                    }
                    return (
                      <TouchableOpacity
                        style={styles.btnPrimary}
                        onPress={() => iniciarOperacion(op)}
                      >
                        <Ionicons
                          name="play-outline"
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.btnPrimaryText}>
                          Iniciar actividad
                        </Text>
                      </TouchableOpacity>
                    );
                  }

                  if (op.estatus === 'en_proceso') {
                    return (
                      <TouchableOpacity
                        style={[
                          styles.btnPrimary,
                          { backgroundColor: FIORI.ok },
                        ]}
                        onPress={() => solicitarFinalizarOperacion(op)}
                      >
                        <Ionicons
                          name="checkmark-done-outline"
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.btnPrimaryText}>
                          Finalizar actividad
                        </Text>
                      </TouchableOpacity>
                    );
                  }

                  return <Text style={styles.operDone}>Finalizada</Text>;
                })()}

              {/* Mensaje de solo lectura para NoMant */}
              {isNoMant && (
                <Text style={styles.operLocked}>
                  Esta operación se muestra solo como referencia debido a la
                  carta de no mantenimiento.
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          !isNoMant && (
            <>
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Acciones rápidas</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                >
                  <ActionChip
                    label="Carta no mant."
                    icon="document-text-outline"
                    onPress={(e) => irACartaNoMantenimiento(e, orden.Orderid)}
                  />
                  <ActionChip
                    label="Pendientes"
                    icon="clipboard-outline"
                    onPress={(e) => irAReportePendientes(e, orden.Orderid)}
                  />
                  <ActionChip
                    label="Avería"
                    icon="warning-outline"
                    onPress={(e) => irAReporteAveria(e, orden.Orderid)}
                  />
                  <ActionChip
                    label="Emergencia"
                    icon="alert-circle-outline"
                    onPress={(e) => irAReporteEmergencia(e, orden.Orderid)}
                  />
                </ScrollView>
              </View>

              <View style={styles.block}>
                <Text style={styles.blockTitle}>Formularios</Text>
                <View style={styles.grid}>
                  <FormCardFlat
                    title="Mantto elevador"
                    icon="construct-outline"
                    color="#5AAAF6"
                    onPress={(e) => irAManttoElevador(e, orden.Orderid)}
                  />
                  <FormCardFlat
                    title="Mantto escalera"
                    icon="build-outline"
                    color="#4C9FEF"
                    onPress={(e) => irAManttoEscalera(e, orden.Orderid)}
                  />
                  <FormCardFlat
                    title="Mantto cables"
                    icon="git-branch-outline"
                    color="#3DB6E8"
                    onPress={(e) => irAManttoCables(e, orden.Orderid)}
                  />
                  <FormCardFlat
                    title="Freno EM/EH"
                    icon="cog-outline"
                    color="#5E80A2"
                    onPress={(e) => irAManttoFrenoEmEh(e, orden.Orderid)}
                  />
                  <FormCardFlat
                    title="Freno PM"
                    icon="hammer-outline"
                    color="#3C8FBF"
                    onPress={(e) => irAManttoFrenoPm(e, orden.Orderid)}
                  />
                  <FormCardFlat
                    title="Freno PM-PMF"
                    icon="hardware-chip-outline"
                    color="#2F80ED"
                    onPress={(e) => irAManttoFrenoPmPmf(e, orden.Orderid)}
                  />
                  <FormCardFlat
                    title="Gastos error humano"
                    icon="cash-outline"
                    color="#4AB3C7"
                    onPress={(e) => irAutorizacionGastosEH(e, orden.Orderid)}
                  />
                  <FormCardFlat
                    title="Terminación/Conformidad"
                    icon="checkmark-done-outline"
                    color="#5F9EB4"
                    onPress={(e) => irAReporteTerminacion(e, orden.Orderid)}
                  />
                  <FormCardFlat
                    title="Préstamo refacciones"
                    icon="swap-horizontal-outline"
                    color="#3F7DCB"
                    onPress={(e) =>
                      irASolicitudPrestamoRefacciones(e, orden.Orderid)
                    }
                  />
                  <FormCardFlat
                    title="Requisición materiales"
                    icon="cube-outline"
                    color="#58C7E3"
                    onPress={(e) => irARequisicionMateriales(e, orden.Orderid)}
                  />
                  <FormCardFlat
                    title="Bitácora mantto"
                    icon="book-outline"
                    color="#61A8B3"
                    onPress={(e) => irABitacoraMantenimiento(e, orden.Orderid)}
                  />
                </View>
              </View>

              {/* Espacio final para que no quede pegado al footer fijo */}
              <View style={{ height: 16 }} />
            </>
          )
        }
      />

      {/* 👉 FAB flotante para crear AVISO DE AVERÍA (solo si NO es NoMant) */}
      {!isNoMant && (
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.9}
          onPress={(e) => irAAvisoAveria(e, orden.Orderid)}
        >
          <Ionicons name="warning-outline" size={20} color="#fff" />
          <Text style={styles.fabLabel}>Aviso de avería</Text>
        </TouchableOpacity>
      )}

      {/* Footer fijo abajo */}
      <Footer />

      {/* ===== Modal de materiales por operación + consumo ===== */}
      <Modal
        visible={showCompModal}
        animationType="slide"
        transparent
        onRequestClose={closeComponentsModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Materiales ·{' '}
                {selectedOp
                  ? `${selectedOp.activity}${
                      selectedOp.subactivity
                        ? ' / ' + selectedOp.subactivity
                        : ''
                    }`
                  : ''}
              </Text>
              <TouchableOpacity
                onPress={closeComponentsModal}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 380, paddingHorizontal: 12 }}
            >
              {loadingComponents ? (
                <Text
                  style={{
                    color: FIORI.textMuted,
                    marginTop: 12,
                  }}
                >
                  Cargando materiales…
                </Text>
              ) : !compList || compList.length === 0 ? (
                <Text
                  style={{
                    color: FIORI.textMuted,
                    marginTop: 12,
                  }}
                >
                  No hay materiales asignados a esta operación.
                </Text>
              ) : (
                compList.map((c) => (
                  <View
                    key={`${c.Orderid}-${c.Activity}-${c.ResItem}`}
                    style={styles.compRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.compTitle}>
                        {c.Material} - {c.MatlDesc}
                      </Text>
                      <Text style={styles.compSub}>
                        Asignado: {c.RequirementQuantity}{' '}
                        {c.RequirementQuantityUnit}
                      </Text>
                      <Text style={styles.compMeta}>
                        Centro: {c.Plant || '—'} · Almacén:{' '}
                        {c.StgeLoc || '—'}
                      </Text>
                    </View>

                    {modalMode === 'finalizar' && consumioMaterial && (
                      <View style={{ minWidth: 90, marginLeft: 8 }}>
                        <Text style={styles.compMeta}>Consumido:</Text>
                        <View style={styles.compQty}>
                          <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            value={cantidadesConsumidas[c.ResItem] ?? ''}
                            onChangeText={(txt) =>
                              setCantidadesConsumidas((prev) => ({
                                ...prev,
                                [c.ResItem]: txt,
                              }))
                            }
                            placeholder="0"
                          />
                          <Text style={styles.compQtyUnit}>
                            {c.RequirementQuantityUnit}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>

            {modalMode === 'finalizar' ? (
              <>
                <View style={styles.modalConsumeRow}>
                  <Text style={{ color: FIORI.text, fontWeight: '700' }}>
                    ¿Consumiste material?
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.timerPill,
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        backgroundColor: consumioMaterial
                          ? FIORI.brand
                          : FIORI.surfaceAlt,
                      },
                    ]}
                    onPress={() => setConsumioMaterial((v) => !v)}
                  >
                    <Text
                      style={{
                        color: consumioMaterial ? '#fff' : FIORI.text,
                        fontWeight: '800',
                      }}
                    >
                      {consumioMaterial ? 'Sí' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalFooterRow}>
                  <TouchableOpacity
                    style={[
                      styles.smallBtn,
                      { backgroundColor: FIORI.surfaceAlt },
                    ]}
                    onPress={closeComponentsModal}
                    disabled={finalizandoOp}
                  >
                    <Text style={styles.smallBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.smallBtn,
                      { backgroundColor: FIORI.brand },
                    ]}
                    onPress={finalizarOperacionConMaterial}
                    disabled={finalizandoOp}
                  >
                    <Text
                      style={[styles.smallBtnText, { color: '#fff' }]}
                    >
                      {finalizandoOp
                        ? 'Guardando…'
                        : 'Finalizar operación'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.modalFooter}>
                {/* Sin botón "Listo" aquí, solo se cierra con la X */}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ===== Modal PDF No mantenimiento ===== */}
      <Modal
        visible={showNoMantPdfModal}
        animationType="slide"
        transparent
        onRequestClose={cerrarModalNoMantPdf}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Carta de no mantenimiento (PDF)
              </Text>
              <TouchableOpacity
                onPress={cerrarModalNoMantPdf}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, padding: 12 }}>
              {loadingNoMantPdf ? (
                <View style={{ alignItems: 'center', marginTop: 20 }}>
                  <ActivityIndicator size="large" color={FIORI.brand} />
                  <Text
                    style={{
                      marginTop: 10,
                      color: FIORI.textMuted,
                    }}
                  >
                    Cargando PDF…
                  </Text>
                </View>
              ) : noMantError ? (
                <Text style={{ color: FIORI.err, marginTop: 10 }}>
                  {noMantError}
                </Text>
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
                style={[
                  styles.smallBtn,
                  { backgroundColor: FIORI.surfaceAlt },
                ]}
                onPress={cerrarModalNoMantPdf}
              >
                <Text style={styles.smallBtnText}>Cerrar</Text>
              </TouchableOpacity>

              {noMantPdfRawUrl && (
                <TouchableOpacity
                  style={[
                    styles.smallBtn,
                    { backgroundColor: FIORI.brand },
                  ]}
                  onPress={descargarNoMantPdf}
                  disabled={downloadingNoMantPdf}
                >
                  <Text
                    style={[styles.smallBtnText, { color: '#fff' }]}
                  >
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

const ActionChip = ({ label, icon, onPress }) => (
  <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.95}>
    <View style={styles.chipIcon}>
      <Ionicons name={icon} size={16} color={FIORI.brand} />
    </View>
    <Text style={styles.chipText}>{label}</Text>
  </TouchableOpacity>
);

const FormCardFlat = ({ title, icon, color, onPress }) => (
  <TouchableOpacity
    style={styles.cardWrap}
    onPress={onPress}
    activeOpacity={0.92}
  >
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

/** ================= Cronómetro por operación ================= */
const TimerBadge = ({
  opId,
  label,
  limitMin,
  startMs,
  onNeedStartLocal,
  onNearingEnd,
  onExpire,
}) => {
  const [now, setNow] = useState(Date.now());
  const nearingShownRef = useRef(false);
  const expiredShownRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (startMs == null) onNeedStartLocal?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs]);

  const effectiveStart = startMs ?? Date.now();
  const elapsedMs = now - effectiveStart;

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
        <Text style={styles.timerText}>
          {' '}
          Transcurrido: {fmtHMS(elapsedMs)}
        </Text>
      </View>
      {hasLimit && (
        <View
          style={[
            styles.timerPill,
            {
              backgroundColor:
                remainingMs === 0 ? '#FDECEA' : FIORI.brandSoft,
              borderColor: FIORI.border,
            },
          ]}
        >
          <Ionicons name="hourglass-outline" size={14} color={FIORI.text} />
          <Text style={styles.timerText}>
            {remainingMs === 0
              ? ' ¡Tiempo agotado!'
              : ` Restante: ${fmtHMS(remainingMs)}`}
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
  subtituloMuted: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
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
  noMantTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: FIORI.text,
    marginBottom: 4,
  },
  noMantText: {
    fontSize: 12,
    color: FIORI.textMuted,
  },
  btnNoMantBanner: {
    marginLeft: 10,
    backgroundColor: FIORI.brand,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  btnNoMantBannerText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },

  panel: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    marginBottom: 12,
    ...elev(0.4),
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: FIORI.text,
    marginBottom: 8,
  },

  row: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: FIORI.borderSoft,
  },
  rowLabel: { fontSize: 13, color: FIORI.textMuted, marginBottom: 2 },
  rowValue: { fontSize: 14, color: FIORI.text, fontWeight: '600' },

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
  operDone: {
    fontSize: 12,
    color: FIORI.ok,
    fontWeight: '800',
    marginTop: 8,
  },
  operLocked: {
    marginTop: 8,
    fontSize: 12,
    color: FIORI.textMuted,
    fontStyle: 'italic',
  },

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
  blockTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: FIORI.text,
    marginBottom: 8,
  },

  chipsRow: { paddingRight: 6 },
  chip: {
    backgroundColor: FIORI.surface,
    borderColor: FIORI.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    ...elev(0.2),
  },
  chipIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: FIORI.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  chipText: { color: FIORI.text, fontWeight: '800', fontSize: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  cardWrap: { width: '50%', paddingHorizontal: 6, marginBottom: 12 },
  card: {
    borderRadius: 14,
    minHeight: 96,
    padding: 14,
    justifyContent: 'space-between',
    ...elev(0.6),
  },
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
  cardTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
    lineHeight: 18,
  },

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

  error: {
    marginTop: 40,
    textAlign: 'center',
    fontSize: 16,
    color: FIORI.err,
  },

  // ===== FAB flotante
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 80, // por encima del Footer
    backgroundColor: FIORI.err,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...elev(0.8),
  },
  fabLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },

  // ===== Modal
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
  compQty: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 4,
  },
  compQtyUnit: {
    fontSize: 11,
    color: FIORI.textMuted,
    marginTop: 2,
    textAlign: 'right',
  },
  modalFooter: { padding: 12, alignItems: 'flex-end' },

  modalConsumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  modalFooterRow: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },

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
  smallBtnText: {
    color: FIORI.text,
    fontWeight: '700',
    fontSize: 13,
  },
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
