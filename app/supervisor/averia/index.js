// app/supervisor/averia/index.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Header from '../../../src/components/Header';
import { useAuth } from '../../../src/context/AuthContext';
import api from '../../../src/services/api';

const COLORS = {
  pageBg: '#F4F6F9',
  cardBg: '#FFFFFF',
  border: '#E4E9F0',
  title: '#0B1F3B',
  text: '#52616B',
  accent: '#0A6ED1',
  danger: '#E76565',
  warning: '#F5C044',
  success: '#6FCF97',
};

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// OData datetime: YYYY-MM-DDTHH:mm:ss (sin Z, tu ejemplo así lo usa)
const toOdataDateTime = (d, endOfDay = false) => {
  const date = new Date(d);
  if (endOfDay) {
    date.setHours(23, 59, 59, 0);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
};

const sapDateToISO = (val) => {
  if (!val) return null;
  if (typeof val === 'string' && val.startsWith('/Date(')) {
    const ms = parseInt(val.replace('/Date(', '').replace(')/', ''), 10);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
    return null;
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
};

export default function NotificacionesAveriaSupervisor() {
  const { token, user } = useAuth(); // user debe traer email/preferred_username
  const [averias, setAverias] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros de fecha
  const now = new Date();
  const [startDate, setStartDate] = useState(new Date(now.getFullYear(), 0, 1));
  const [endDate, setEndDate] = useState(new Date(now.getFullYear(), 11, 31));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [query, setQuery] = useState('');

  const getCorreo = () => {
    // intenta ser compatible con tus variantes
    return (
      user?.email ||
      user?.correo ||
      user?.preferred_username ||
      user?.upn ||
      user?.username ||
      ''
    );
  };

  const fetchAverias = async () => {
    try {
      setLoading(true);

      const correo = getCorreo();
      if (!correo) {
        setAverias([]);
        Alert.alert('Sin correo', 'No se pudo obtener el correo del usuario logueado.');
        return;
      }

      const createdFrom = toOdataDateTime(startDate, false);
      const notifTo = toOdataDateTime(endDate, true);

      // OData filter EXACTO como tu URL ejemplo
      const filter = `CreatedOn ge datetime'${createdFrom}' and NotifDate le datetime'${notifTo}' and Userstatus eq '${correo}'`;

      const res = await api.get(
        `/api/odata/ZCS_GET_NOTIFICATION_SRV/NotificationHeaderSet`,
        {
          params: {
            $filter: filter,
            $format: 'json',
          },
          // si tu interceptor ya mete token, esto es redundante, pero no estorba
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );

      // tu proxy OData puede devolver:
      // 1) { d: { results: [...] } }  (SAP v2)
      // 2) { value: [...] }          (v4 style)
      // 3) { d: [...] }              (si ya mapeaste)
      const raw = res?.data;
      const results =
        raw?.d?.results ??
        raw?.value ??
        (Array.isArray(raw?.d) ? raw.d : null) ??
        (Array.isArray(raw) ? raw : []);

      const mapped = (Array.isArray(results) ? results : []).map((it) => {
        const notifISO = sapDateToISO(it?.NotifDate);
        const createdISO = sapDateToISO(it?.CreatedOn);

        // estatus simple (igual que tu backend viejo)
        let estatus = 'pendiente';
        const sys = String(it?.SysStatus || '').toUpperCase();
        if (sys.includes('NOCO') || sys.includes('CERR')) estatus = 'cerrada';
        else if (sys.includes('PROC') || sys.includes('INPR')) estatus = 'en_proceso';

        return {
          NotifNo: it?.NotifNo,
          short_text: it?.ShortText || '',
          equipment: it?.Equipment || '',
          priority: it?.Priority || it?.Priotype || '',
          notif_date: notifISO,
          created_on: createdISO,
          cust_no: it?.CustNo || '',
          funct_loc: it?.FunctLoc || '',
          estatus,
        };
      });

      mapped.sort(
        (a, b) =>
          new Date(b.notif_date || 0).getTime() - new Date(a.notif_date || 0).getTime()
      );

      setAverias(mapped);
    } catch (error) {
      console.error('Error al cargar averías por OData:', error?.response?.data || error);
      Alert.alert('Error', 'No se pudieron cargar los avisos de avería.');
      setAverias([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAverias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return averias;
    return averias.filter((item) => {
      const text = [
        item?.NotifNo,
        item?.short_text,
        item?.equipment,
        item?.cust_no,
        item?.funct_loc,
        item?.estatus,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return text.includes(q);
    });
  }, [averias, query]);

  const renderItem = ({ item }) => {
    const estatusColor =
      item.estatus === 'pendiente'
        ? COLORS.danger
        : item.estatus === 'en_proceso'
        ? COLORS.warning
        : COLORS.success;

    const estatusIcon =
      item.estatus === 'pendiente'
        ? 'alert-circle-outline'
        : item.estatus === 'en_proceso'
        ? 'refresh-outline'
        : 'checkmark-circle-outline';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/supervisor/averia/${item.NotifNo}/detalles`)}
      >
        <View style={[styles.sideBar, { backgroundColor: estatusColor }]} />

        <View style={styles.cardBody}>
          <View style={styles.topRow}>
            <View style={styles.titleWrap}>
              <View style={styles.avatar}>
                <Ionicons name="warning-outline" size={20} color="#0B1F3B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  #{item.NotifNo} — {item.short_text || 'Sin descripción'}
                </Text>
                <Text style={styles.subTitle} numberOfLines={1}>
                  Equipo: {item.equipment || '—'}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: estatusColor + '20',
                  borderColor: estatusColor,
                },
              ]}
            >
              <Ionicons
                name={estatusIcon}
                size={14}
                color="#0B1F3B"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.statusText}>
                {item.estatus?.replace('_', ' ') || '—'}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color="#52616B" />
              <Text style={styles.metaText}>Notif.: {formatDate(item.notif_date)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={14} color="#52616B" />
              <Text style={styles.metaText}>Cliente: {item.cust_no || '—'}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="pin-outline" size={14} color="#52616B" />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.funct_loc || 'Sin ubicación funcional'}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const onChangeStart = (e, date) => {
    if (Platform.OS === 'android') setShowStartPicker(false);
    if (date) setStartDate(date);
  };

  const onChangeEnd = (e, date) => {
    if (Platform.OS === 'android') setShowEndPicker(false);
    if (date) setEndDate(date);
  };

  return (
    <View style={styles.container}>
      <Header title="Avisos de avería" />

      <View style={styles.pageHeader}>
        <View style={{ marginBottom: 8 }}>
          <Text style={styles.pageTitle}>Lista de averías</Text>
          <Text style={styles.pageSubtitle}>
            {loading ? 'Cargando...' : `${filtered.length} notificaciones de avería encontradas`}
          </Text>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por #, equipo, cliente, ubicación…"
          placeholderTextColor="#9AA5B1"
          value={query}
          onChangeText={setQuery}
        />

        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.text} />
            <Text style={styles.dateBtnText}>Desde: {startDate.toLocaleDateString()}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.text} />
            <Text style={styles.dateBtnText}>Hasta: {endDate.toLocaleDateString()}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.refreshBtn} onPress={fetchAverias}>
            <Ionicons name="refresh-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onChangeStart}
          />
        )}

        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onChangeEnd}
          />
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={COLORS.accent} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.NotifNo?.toString() ?? Math.random().toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 24, color: COLORS.text }}>
              No hay averías con los filtros actuales.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  pageHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  pageTitle: { fontSize: 18, fontWeight: '700', color: COLORS.title },
  pageSubtitle: { fontSize: 13, color: COLORS.text, marginTop: 3 },
  searchInput: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    backgroundColor: '#F8FAFC',
    fontSize: 14,
    color: COLORS.title,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  dateBtnText: { fontSize: 12, color: COLORS.text },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingHorizontal: 12, paddingBottom: 80 },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
    minHeight: 92,
  },
  sideBar: { width: 5, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  cardBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EFF4F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '600', color: COLORS.title },
  subTitle: { fontSize: 12.5, color: '#7A8794', marginTop: 1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
    color: COLORS.title,
  },
  metaRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { fontSize: 12, color: COLORS.text },
});
