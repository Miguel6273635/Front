// app/tecnico/ordenes/index.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  Modal,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../../src/context/AuthContext';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import { router } from 'expo-router';
import api from '../../../src/services/api';

// ===== Fiori Palette =====
const FIORI = {
  pageBg: '#F7F7F7',
  cardBg: '#FFFFFF',
  cardSubtle: '#F5F7FA',
  border: '#DDE6F2',
  borderMuted: '#CFD8E3',
  ink: '#0B1F3B',
  textMuted: '#63718B',
  accent: '#0A6ED1',
  accentSoft: '#E3F2FD',
  neutralBtn: '#ECEFF5',
  danger: '#EB5757',
};

// ===== Fechas util =====
const atStartOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const atEndOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
const endOfMonth   = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23,59,59,999);
const startOfYear  = (y) => new Date(y, 0, 1, 0,0,0,0);
const endOfYear    = (y) => new Date(y, 11, 31, 23,59,59,999);

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};

// ===== Parser robusto para SAP OData v2 (/Date(ms)/) o ISO =====
const parseSapDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('/Date(')) {
    const ms = parseInt(value.replace('/Date(', '').replace(')/', ''), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

// ===== Helpers en UTC para evitar desfases por zona horaria =====
const getUtcYmd = (d) => {
  if (!d) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatDateDMY = (value) => {
  const d = parseSapDate(value);
  if (!d) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const matchesQuery = (item, q) => {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  const fields = [
    item?.Orderid?.toString() ?? '',
    item?.order_type ?? '',
    item?.equipment ?? '',
    item?.estatus ?? '',
    item?.partner_name ?? '',
    item?.partner_address ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return fields.includes(needle);
};

// Ahora comparamos por fecha (YYYY-MM-DD en UTC), no por timestamp crudo
const isWithin = (date, start, end) => {
  if (!date) return false;

  const dStr = getUtcYmd(date);
  const sStr = start ? getUtcYmd(start) : null;
  const eStr = end ? getUtcYmd(end) : null;

  if (sStr && dStr < sStr) return false;
  if (eStr && dStr > eStr) return false;
  return true;
};

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

export default function ListaOrdenesTecnico() {
  const { token, user } = useAuth?.() ?? { token: null, user: null };

  // Datos
  const [allOrdenes, setAllOrdenes] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [query, setQuery] = useState('');
  const [dateMode, setDateMode] = useState('day'); // 'all' | 'day' | 'weekRange' | 'month' | 'year'

  // Día
  const [dayRef, setDayRef] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);

  // Semana (rango)
  const [weekStart, setWeekStart] = useState(null);
  const [weekEnd, setWeekEnd] = useState(null);
  const [showWeekStartPicker, setShowWeekStartPicker] = useState(false);
  const [showWeekEndPicker, setShowWeekEndPicker] = useState(false);

  // Mes específico
  const now = new Date();
  const [monthYear, setMonthYear] = useState({ month: now.getMonth(), year: now.getFullYear() });
  const [showMonthModal, setShowMonthModal] = useState(false);

  // Año específico
  const [yearOnly, setYearOnly] = useState(now.getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);

  // Modal de evidencia
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinOrderId, setCheckinOrderId] = useState(null);
  const [checkinImageUri, setCheckinImageUri] = useState(null);
  const [isSending, setIsSending] = useState(false);

  // mapa de órdenes que ya tienen check-in
  const [checkinsHechos, setCheckinsHechos] = useState({});

  // ===== Ventana de fecha activa (para consultar SAP) =====
  const { start, end } = useMemo(() => {
    if (dateMode === 'day') {
      const s = atStartOfDay(dayRef);
      return { start: s, end: s };
    }
    if (dateMode === 'weekRange') {
      return {
        start: weekStart ? atStartOfDay(weekStart) : atStartOfDay(new Date()),
        end: weekEnd ? atEndOfDay(weekEnd) : atEndOfDay(new Date())
      };
    }
    if (dateMode === 'month') {
      const ref = new Date(monthYear.year, monthYear.month, 1);
      return { start: startOfMonth(ref), end: endOfMonth(ref) };
    }
    if (dateMode === 'year') {
      return { start: startOfYear(yearOnly), end: endOfYear(yearOnly) };
    }
    // 'all' -> últimos 90 días
    const e = new Date();
    const s = new Date(); s.setDate(s.getDate() - 90);
    return { start: atStartOfDay(s), end: atEndOfDay(e) };
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  // ====== Cargar órdenes desde SAP (vía backend proxy) ======
  const fetchOrdenes = async () => {
    try {
      setLoading(true);

      const sStr = ymd(start);
      const eStr = ymd(end);
      console.log('[FETCH_ORDENES] mode =', dateMode, '| start =', start, '| end =', end);
      console.log('[FETCH_ORDENES] ymd(start)=', sStr, 'ymd(end)=', eStr);

      const params = new URLSearchParams({
        start: sStr,
        end:   eStr,
        mode:  dateMode === 'day' ? 'eq' : 'range',
      });

      const userEmail =
        user?.correo || user?.email || user?.username || null;
      if (userEmail) params.set('user', userEmail);

      const res = await api.get(`/ordenes/sap/list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = Array.isArray(res.data) ? res.data : [];
      setAllOrdenes(data);

      const map = {};
      data.forEach((o) => {
        if (o.has_checkin || o.estatus === 'en_proceso') map[o.Orderid] = true;
      });
      setCheckinsHechos(map);
    } catch (error) {
      console.error('Error al cargar órdenes (SAP):', error?.response?.data || error);
      const serverMsg = error?.response?.data?.error || 'No se pudieron cargar las órdenes desde SAP';
      Alert.alert('Error', serverMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  // Aplicar filtros de texto y rango a lo ya recibido
  useEffect(() => {
    const filtered = (allOrdenes || []).filter((item) => {
      const okQuery = matchesQuery(item, query);
      if (!okQuery) return false;

      if (dateMode === 'all') return true;

      const sd = parseSapDate(item?.start_date);
      if (!sd) return false;
      return isWithin(sd, start, end);
    });

    setOrdenes(filtered);
  }, [allOrdenes, query, dateMode, start, end]);

  // Navegación
  const irADetalles = (orderId) => router.push(`/ordenes/${orderId}/`);

  const irAFormularioRiesgos = (e, orderId) => {
    e?.stopPropagation?.();
    router.push(`/tecnico/ordenes/${orderId}/formulario-riesgos`);
  };

  // 👇 NUEVO: ir a Carta de No Mantenimiento
  const irACartaNoMantenimiento = (orderId) => {
    router.push(`/tecnico/ordenes/${orderId}/carta-no-mantenimiento`);
  };

  // abrir modal de check-in
  const abrirModalCheckin = (e, orderId) => {
    e?.stopPropagation?.();
    setCheckinOrderId(orderId);
    setCheckinImageUri(null);
    setShowCheckinModal(true);
  };

  // galería
  const pickImageFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitas dar acceso a la galería para subir la evidencia.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) {
      setCheckinImageUri(result.assets[0].uri);
    }
  };

  // cámara
  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitas dar acceso a la cámara para tomar la evidencia.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      setCheckinImageUri(result.assets[0].uri);
    }
  };

  // confirmar check-in (subir evidencia)
  const confirmarCheckin = async () => {
    if (!checkinImageUri) {
      Alert.alert('Evidencia requerida', 'Primero selecciona o toma una foto.');
      return;
    }

    try {
      setIsSending(true);

      const formData = new FormData();
      formData.append('file', {
        uri: checkinImageUri,
        name: 'checkin.jpg',
        type: 'image/jpeg',
      });

      const res = await api.post(
        `/evidencias/${checkinOrderId}/checkin`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const json = res.data;
      if (json?.ok) {
        setCheckinsHechos((prev) => ({ ...prev, [checkinOrderId]: true }));
        setAllOrdenes((prev) =>
          prev.map((o) =>
            o.Orderid === checkinOrderId
              ? { ...o, estatus: json.estatus || 'en_proceso', has_checkin: true }
              : o
          )
        );
        setOrdenes((prev) =>
          prev.map((o) =>
            o.Orderid === checkinOrderId
              ? { ...o, estatus: json.estatus || 'en_proceso', has_checkin: true }
              : o
          )
        );

        Alert.alert('Check-in', `Evidencia registrada para la orden #${checkinOrderId}`);
        setShowCheckinModal(false);
      } else {
        Alert.alert('Error', 'No se pudo registrar el check-in.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'No se pudo registrar el check-in.');
    } finally {
      setIsSending(false);
    }
  };

  const clearFilters = () => {
    setQuery('');
    setDateMode('day');
    setDayRef(new Date());
    setWeekStart(null);
    setWeekEnd(null);
    setMonthYear({ month: now.getMonth(), year: now.getFullYear() });
    setYearOnly(now.getFullYear());
  };

  // Cards
  const renderItem = ({ item }) => {
    const estatusColor =
      item.estatus === 'pendiente' ? '#D64545' :
      item.estatus === 'en_proceso' ? '#D49C00' :
      '#2E7D32';

    const startLabel = formatDateDMY(item.start_date);
    const finishLabel = formatDateDMY(item.finish_date);

    const hasCheckin = !!checkinsHechos[item.Orderid] || item.estatus === 'en_proceso';

    // 👉 NUEVO: detectar No mantenimiento
    const estatusLower = String(item.estatus || '').toLowerCase();
    const isNoMantto =
      estatusLower.includes('no mant') || estatusLower.includes('no_mant');

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.card, { borderLeftWidth: 4, borderLeftColor: estatusColor }]}
        onPress={() => irADetalles(item.Orderid)}
      >
        {/* menú de 3 puntos SOLO si no es No mantenimiento */}
        {hasCheckin && !isNoMantto && (
          <TouchableOpacity
            style={styles.cardMenu}
            onPress={(e) => {
              e?.stopPropagation?.();
              irACartaNoMantenimiento(item.Orderid);
            }}
          >
            <Text style={styles.cardMenuDots}>⋮</Text>
          </TouchableOpacity>
        )}

        <View style={styles.cardContent}>
          <View style={[styles.statusDot, { backgroundColor: estatusColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>#{item.Orderid} - {item.order_type}</Text>
            <Text style={styles.label}>Equipo: {item.equipment}</Text>
            <Text style={styles.label}>Inicio: {startLabel}</Text>
            <Text style={styles.label}>Fin: {finishLabel}</Text>
            <Text style={styles.label}>Estatus: {item.estatus ?? '—'}</Text>
          </View>
        </View>

        <View style={{ flexDirection:'row', gap:10, justifyContent:'flex-end', marginTop:12 }}>
          {isNoMantto ? (
            <Text style={{ color: FIORI.textMuted, fontSize: 12, fontStyle: 'italic' }}>
              Orden marcada como NO MANTENIMIENTO.
            </Text>
          ) : !hasCheckin ? (
            <TouchableOpacity
              style={[styles.boton, { backgroundColor: FIORI.accent }]}
              onPress={(e)=>abrirModalCheckin(e, item.Orderid)}
            >
              <Text style={styles.botonTexto}>Check-in</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.boton, { backgroundColor: FIORI.neutralBtn }]}
              onPress={(e) => irAFormularioRiesgos(e, item.Orderid)}
            >
              <Text style={[styles.botonTexto, { color: FIORI.ink }]}>TBM/KY</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Texto del rango activo
  const activeRangeText = useMemo(() => {
    if (dateMode === 'all') return 'Últimos 90 días';
    if (dateMode === 'day')   return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
    if (dateMode === 'weekRange') {
      const a = weekStart ? atStartOfDay(weekStart).toLocaleDateString() : '—';
      const b = weekEnd ? atEndOfDay(weekEnd).toLocaleDateString() : '—';
      return `Semana (rango): ${a} → ${b}`;
    }
    if (dateMode === 'month') return `Mes: ${MONTHS[monthYear.month]} ${monthYear.year}`;
    if (dateMode === 'year')  return `Año: ${yearOnly}`;
    return '';
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const YearPickerContent = ({ selectedYear, onSelect, from=2020, to=(now.getFullYear()+2) }) => {
    const years = [];
    for (let y = to; y >= from; y--) years.push(y);
    return (
      <ScrollView style={{ maxHeight: 320 }}>
        {years.map((y) => (
          <TouchableOpacity
            key={y}
            style={[styles.yearItem, selectedYear === y && styles.yearItemActive]}
            onPress={() => onSelect(y)}
          >
            <Text style={[styles.yearItemText, selectedYear === y && styles.yearItemTextActive]}>
              {y}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Órdenes asignadas" />

      {/* ======= Barra de filtros ======= */}
      <View style={styles.filtersWrap}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por #, tipo, equipo, estatus…"
            placeholderTextColor={FIORI.textMuted}
            returnKeyType="search"
          />
        </View>

        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, dateMode === 'all' && styles.chipActive]}
            onPress={() => setDateMode('all')}
          >
            <Text style={[styles.chipText, dateMode === 'all' && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === 'day' && styles.chipActive]}
            onPress={() => { setDateMode('day'); setShowDayPicker(true); }}
          >
            <Text style={[styles.chipText, dateMode === 'day' && styles.chipTextActive]}>Día</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === 'weekRange' && styles.chipActive]}
            onPress={() => { setDateMode('weekRange'); setShowWeekStartPicker(true); }}
          >
            <Text style={[styles.chipText, dateMode === 'weekRange' && styles.chipTextActive]}>
              Semana (rango)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === 'month' && styles.chipActive]}
            onPress={() => { setDateMode('month'); setShowMonthModal(true); }}
          >
            <Text style={[styles.chipText, dateMode === 'month' && styles.chipTextActive]}>Mes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === 'year' && styles.chipActive]}
            onPress={() => { setDateMode('year'); setShowYearModal(true); }}
          >
            <Text style={[styles.chipText, dateMode === 'year' && styles.chipTextActive]}>Año</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.clearBtn} onPress={clearFilters} activeOpacity={0.85}>
            <Text style={styles.clearBtnText}>Limpiar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchOrdenes} activeOpacity={0.85}>
            <Text style={styles.refreshBtnText}>Recargar</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.activeRangeText}>{activeRangeText}</Text>

        {showDayPicker && (
          <DateTimePicker
            value={dayRef ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(e, date) => {
              if (Platform.OS === 'android' && e.type !== 'set') {
                setShowDayPicker(false);
                return;
              }
              if (date) setDayRef(date);
              setShowDayPicker(Platform.OS === 'ios');
            }}
          />
        )}

        {showWeekStartPicker && (
          <DateTimePicker
            value={weekStart ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(e, date) => {
              if (Platform.OS === 'android' && e.type !== 'set') {
                setShowWeekStartPicker(false);
                return;
              }
              if (date) {
                setWeekStart(date);
                if (Platform.OS !== 'ios') setShowWeekEndPicker(true);
              }
              setShowWeekStartPicker(Platform.OS === 'ios');
            }}
          />
        )}

        {showWeekEndPicker && (
          <DateTimePicker
            value={weekEnd ?? (weekStart ?? new Date())}
            mode="date"
            minimumDate={weekStart ?? undefined}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(e, date) => {
              if (Platform.OS === 'android' && e.type !== 'set') {
                setShowWeekEndPicker(false);
                return;
              }
              if (date) setWeekEnd(date);
              setShowWeekEndPicker(Platform.OS === 'ios');
            }}
          />
        )}

        {dateMode === 'weekRange' && (
          <View style={styles.rangeButtonsRow}>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]}
              onPress={() => setShowWeekStartPicker(true)}
            >
              <Text style={styles.smallBtnText}>
                Inicio: {weekStart ? weekStart.toLocaleDateString() : '—'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]}
              onPress={() => setShowWeekEndPicker(true)}
            >
              <Text style={styles.smallBtnText}>
                Fin: {weekEnd ? weekEnd.toLocaleDateString() : '—'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {/* ======= Fin barra de filtros ======= */}

      {/* ======= Modal Mes ======= */}
      <Modal
        visible={showMonthModal}
        transparent
        animationType="fade"
        onRequestClose={()=>setShowMonthModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setMonthYear((s)=>({ ...s, year: s.year - 1 }))}>
                <Text style={styles.modalHeaderBtn}>{'‹'}</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>{monthYear.year}</Text>
              <TouchableOpacity onPress={() => setMonthYear((s)=>({ ...s, year: s.year + 1 }))}>
                <Text style={styles.modalHeaderBtn}>{'›'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.monthGrid}>
              {MONTHS.map((m, idx) => {
                const active = idx === monthYear.month && dateMode === 'month';
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthCell, active && styles.monthCellActive]}
                    onPress={() => {
                      setMonthYear({ month: idx, year: monthYear.year });
                      setShowMonthModal(false);
                    }}
                  >
                    <Text style={[styles.monthCellText, active && styles.monthCellTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.modalClose} onPress={() => setShowMonthModal(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ======= Modal Año ======= */}
      <Modal
        visible={showYearModal}
        transparent
        animationType="fade"
        onRequestClose={()=>setShowYearModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalHeaderTitle, { marginBottom: 8 }]}>Selecciona un año</Text>
            <YearPickerContent
              selectedYear={yearOnly}
              onSelect={(y) => { setYearOnly(y); setShowYearModal(false); }}
              from={now.getFullYear() - 10}
              to={now.getFullYear() + 2}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowYearModal(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de evidencia de check-in */}
      <Modal
        visible={showCheckinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCheckinModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 480 }]}>
            <Text style={styles.modalHeaderTitle}>
              Evidencia de llegada #{checkinOrderId ?? ''}
            </Text>
            <Text style={{ color: FIORI.textMuted, marginBottom: 10 }}>
              Toma una foto o selecciona de tu galería antes de iniciar el servicio.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <TouchableOpacity
                style={[styles.smallBtn, { flex: 1, backgroundColor: FIORI.accent }]}
                onPress={pickFromCamera}
              >
                <Text style={[styles.smallBtnText, { color: '#fff', textAlign: 'center' }]}>
                  Tomar foto
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallBtn, { flex: 1, backgroundColor: FIORI.cardSubtle }]}
                onPress={pickImageFromGallery}
              >
                <Text style={[styles.smallBtnText, { textAlign: 'center' }]}>
                  Galería
                </Text>
              </TouchableOpacity>
            </View>

            {checkinImageUri ? (
              <Image
                source={{ uri: checkinImageUri }}
                style={{ width: '100%', height: 220, borderRadius: 10, marginBottom: 10 }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: FIORI.border,
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  height: 160,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                  backgroundColor: FIORI.cardSubtle,
                }}
              >
                <Text style={{ color: FIORI.textMuted }}>Sin foto seleccionada</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.neutralBtn }]}
                onPress={() => setShowCheckinModal(false)}
                disabled={isSending}
              >
                <Text style={styles.smallBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                onPress={confirmarCheckin}
                disabled={isSending}
              >
                <Text style={[styles.smallBtnText, { color: '#fff' }]}>
                  {isSending ? 'Guardando...' : 'Registrar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={FIORI.accent} />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(item) => item.Orderid?.toString?.() ?? String(Math.random())}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingTop: 6 }}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 24, color: FIORI.textMuted }}>
              No hay órdenes con los filtros actuales.
            </Text>
          }
        />
      )}

      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },

  // ---- Filtros ----
  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: FIORI.cardBg,
    borderBottomColor: FIORI.border,
    borderBottomWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: FIORI.cardSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: FIORI.ink,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  clearBtn: {
    backgroundColor: FIORI.neutralBtn,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  clearBtnText: { color: FIORI.ink, fontWeight: '600' },
  refreshBtn: {
    backgroundColor: FIORI.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  refreshBtnText: { color: '#fff', fontWeight: '700' },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: FIORI.cardBg,
  },
  chipActive: {
    backgroundColor: FIORI.accent,
    borderColor: FIORI.accent,
  },
  chipText: { color: FIORI.ink, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  activeRangeText: {
    marginTop: 8,
    color: FIORI.textMuted,
    fontSize: 12,
  },
  rangeButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  smallBtnText: { color: FIORI.ink, fontWeight: '600' },

  // ---- Cards ----
  card: {
    backgroundColor: FIORI.cardBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: FIORI.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    position: 'relative', // necesario para el botón flotante
  },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  title: { fontWeight: '700', fontSize: 16, color: FIORI.ink, marginBottom: 2 },
  label: { fontSize: 14, color: FIORI.textMuted },

  // botón principal en la parte baja
  boton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  botonTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ---- Botón de 3 puntos ----
  cardMenu: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  cardMenuDots: {
    fontSize: 18,
    fontWeight: '700',
    color: FIORI.textMuted,
  },

  // ---- Modales ----
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: FIORI.cardBg, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: FIORI.border,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalHeaderTitle: { fontSize: 18, fontWeight: '700', color: FIORI.ink },
  modalHeaderBtn: { fontSize: 22, fontWeight: '900', color: FIORI.accent, paddingHorizontal: 12 },

  monthGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between',
  },
  monthCell: {
    width: '31.5%', backgroundColor: FIORI.cardSubtle, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginBottom: 8,
    borderWidth: 1, borderColor: FIORI.border,
  },
  monthCellActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  monthCellText: { color: FIORI.ink, fontWeight: '600' },
  monthCellTextActive: { color: '#fff' },

  modalClose: {
    marginTop: 10, alignSelf: 'flex-end',
    backgroundColor: FIORI.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  modalCloseText: { color: '#fff', fontWeight: '700' },

  yearItem: {
    paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 8, marginBottom: 6, backgroundColor: FIORI.cardSubtle,
    borderWidth: 1, borderColor: FIORI.border,
  },
  yearItemActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  yearItemText: { fontSize: 16, color: FIORI.ink, fontWeight: '600' },
  yearItemTextActive: { color: '#fff' },
});
