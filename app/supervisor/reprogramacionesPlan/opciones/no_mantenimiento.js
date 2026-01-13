// app/supervisor/reprogramacionesPlan/opciones/no_mantenimiento/no-mantenimiento.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  Platform,
  StatusBar,
  Alert,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../../src/components/Header';
import api from '../../../../src/services/api';
import { useAuth } from '../../../../src/context/AuthContext';

/* ====================== Locale ES ====================== */
LocaleConfig.locales.es = {
  monthNames: [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
  ],
  monthNamesShort: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
  dayNames: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
  dayNamesShort: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
  today: 'Hoy',
};
LocaleConfig.defaultLocale = 'es';

/* ====================== Colores ====================== */
const COLORS = {
  pageBg: '#F7F7F7',
  cardBg: '#FFFFFF',
  border: '#E4E9F0',
  textPrimary: '#0B1F3B',
  textSub: '#6A7381',
  accent: '#0A6ED1',
};

/* ====================== Helpers ====================== */
const pad2 = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function ymdToDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function buildRangeMarkedDates(startYmd, endYmd) {
  const marked = {};
  if (!startYmd || !endYmd) return marked;

  const s = ymdToDate(startYmd);
  const e = ymdToDate(endYmd);
  if (e < s) return marked;

  let cur = new Date(s);
  while (cur <= e) {
    const key = toYMD(cur);
    marked[key] = {
      color: COLORS.accent,
      textColor: '#FFFFFF',
      startingDay: key === startYmd,
      endingDay: key === endYmd,
    };
    cur.setDate(cur.getDate() + 1);
  }
  return marked;
}

function safeStr(v) {
  return v == null ? '' : String(v);
}

export default function NoMantenimiento() {
  const { token, user } = useAuth();

  const supervisorEmail =
    safeStr(user?.email) ||
    safeStr(user?.correo) ||
    safeStr(user?.username) ||
    'supervisor@mitsu.com';

  const today = new Date();
  const [anioVisible, setAnioVisible] = useState(today.getFullYear());
  const [mesVisible, setMesVisible] = useState(today.getMonth() + 1);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null); // filtro exacto por StartDate
  const [query, setQuery] = useState('');

  // ✅ selección múltiple
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectedCount = selectedIds.size;
  const bulkMode = selectedCount > 0;

  // Modal editar UNA orden (rango paso a paso)
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pickStep, setPickStep] = useState('start'); // 'start' | 'end'
  const [tempStart, setTempStart] = useState('');
  const [tempEnd, setTempEnd] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal BULK (una fecha para muchas)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(toYMD(new Date()));
  const [bulkSaving, setBulkSaving] = useState(false);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ✅ GET: SOLO 0011 (No mantenimiento)
  const fetchOrders = async ({ year, month }) => {
    try {
      setLoading(true);

      const res = await api.get('/sap/reprogramaciones/ordenes-no-mant', {
        headers: { Authorization: `Bearer ${token}` },
        params: { year, month },
      });

      const list = Array.isArray(res.data?.results) ? res.data.results : [];
      const mapped = list
        .map((x) => ({
          id: safeStr(x.Orderid || x.OrderId || x.id),
          equipo: safeStr(x.Equipment || x.equipo || ''),
          shortText: safeStr(x.ShortText || x.descripcion || ''),
          startDate: safeStr(x.StartDate || x.startDate || ''),
          finishDate: safeStr(x.FinishDate || x.finishDate || x.StartDate || ''),
          userstatusCodes: safeStr(x.Userstatus || ''), // normalmente trae "0011" entre otros
        }))
        .filter((o) => o.id);

      setOrders(mapped);
      clearSelection();
    } catch (error) {
      console.error('Error al cargar órdenes NO MANT (SAP):', error?.response?.data || error?.message);
      Alert.alert('Error', error?.response?.data?.error || 'No se pudieron cargar las órdenes de SAP.');
      setOrders([]);
      clearSelection();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchOrders({ year: anioVisible, month: mesVisible });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, anioVisible, mesVisible]);

  const markedDates = useMemo(() => {
    const marks = {};
    orders.forEach((o) => {
      if (o.startDate) marks[o.startDate] = { ...(marks[o.startDate] || {}), marked: true, dotColor: COLORS.accent };
    });

    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] || {}),
        selected: true,
        selectedColor: COLORS.accent,
        selectedTextColor: '#FFFFFF',
      };
    }
    return marks;
  }, [orders, selectedDate]);

  // ✅ FILTRO: si selecciona día -> SOLO StartDate === selectedDate
  const filteredOrders = useMemo(() => {
    let list = orders;

    if (selectedDate) {
      list = list.filter((o) => o.startDate === selectedDate);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const haystack = `${o.id} ${o.equipo} ${o.shortText}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    return list;
  }, [orders, selectedDate, query]);

  function openEdit(order) {
    if (bulkMode) return;

    setEditing(order);

    const start = order.startDate || toYMD(new Date());
    setTempStart(start);
    setTempEnd(''); // 👈 fin vacío para paso 2
    setPickStep('start');
    setEditOpen(true);
  }

  function closeEdit() {
    if (saving) return;
    setEditOpen(false);
    setEditing(null);
    setPickStep('start');
    setTempStart('');
    setTempEnd('');
  }

  // ✅ Paso a paso: inicio -> fin
  function onPickDate(ymd) {
    if (pickStep === 'start') {
      setTempStart(ymd);
      setTempEnd('');
      setPickStep('end');
      return;
    }

    if (tempStart && ymdToDate(ymd) < ymdToDate(tempStart)) {
      Alert.alert('Fecha inválida', 'La fecha fin no puede ser menor a la fecha inicio.');
      return;
    }
    setTempEnd(ymd);
  }

  function canSave() {
    return !!editing && !!tempStart && !!tempEnd && !saving;
  }

  async function saveEdit() {
    if (!editing) return;

    if (!tempStart || !tempEnd) {
      Alert.alert('Faltan fechas', 'Selecciona fecha inicio y fecha fin.');
      return;
    }
    if (ymdToDate(tempEnd) < ymdToDate(tempStart)) {
      Alert.alert('Fecha inválida', 'La fecha fin no puede ser menor a la fecha inicio.');
      return;
    }

    try {
      setSaving(true);

      await api.post(
        '/sap/reprogramaciones/reagendar',
        {
          supervisor: supervisorEmail,
          // si tu backend usa esto para quitar 0011 y activar 0012, lo toma:
          newStatusCode: '0012',
          noMantCode: '0011',
          items: [{ OrderId: editing.id, fechaInicio: tempStart, fechaFin: tempEnd }],
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setOrders((prev) =>
        prev.map((o) => (o.id === editing.id ? { ...o, startDate: tempStart, finishDate: tempEnd } : o))
      );

      closeEdit();
      Alert.alert('Listo', 'Orden reprogramada.');
    } catch (error) {
      console.error('Error al reagendar (no mant):', error?.response?.data || error?.message);
      Alert.alert('Error', error?.response?.data?.error || 'No se pudo reprogramar en SAP.');
    } finally {
      setSaving(false);
    }
  }

  async function saveBulk() {
    if (selectedIds.size === 0) return;

    try {
      setBulkSaving(true);
      const orderIds = Array.from(selectedIds);

      await api.post(
        '/sap/reprogramaciones/reagendar',
        {
          supervisor: supervisorEmail,
          newStatusCode: '0012',
          noMantCode: '0011',
          fecha: bulkDate,
          orderIds,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setOrders((prev) =>
        prev.map((o) => (selectedIds.has(o.id) ? { ...o, startDate: bulkDate, finishDate: bulkDate } : o))
      );

      setBulkOpen(false);
      clearSelection();
      Alert.alert('Listo', `Se reprogramaron ${orderIds.length} órdenes.`);
    } catch (error) {
      console.error('Error bulk (no mant):', error?.response?.data || error?.message);
      Alert.alert('Error', error?.response?.data?.error || 'No se pudieron reprogramar las órdenes.');
    } finally {
      setBulkSaving(false);
    }
  }

  const monthLabel = `${pad2(mesVisible)}/${anioVisible}`;

  const HeaderUI = (
    <View>
      {/* info supervisor + refrescar */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="person-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Supervisor</Text>

          <Pressable onPress={() => fetchOrders({ year: anioVisible, month: mesVisible })} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={COLORS.textSub} />
            <Text style={styles.refreshText}>Actualizar</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>{safeStr(supervisorEmail)}</Text>

        <Text style={styles.hint}>
          Mes actual: <Text style={styles.bold}>{monthLabel}</Text>
        </Text>

        <Text style={styles.hint}>
          *Aquí aparecen <Text style={styles.bold}>SOLO</Text> órdenes con código <Text style={styles.bold}>0011</Text> (No mantenimiento).
        </Text>
      </View>

      {/* calendario */}
      <View style={[styles.card, { marginTop: 12 }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="today-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Calendario</Text>

          {!!selectedDate && (
            <Pressable onPress={() => setSelectedDate(null)} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Ver todas</Text>
            </Pressable>
          )}
        </View>

        <Calendar
          current={`${anioVisible}-${pad2(mesVisible)}-01`}
          onMonthChange={(m) => {
            if (!m?.year || !m?.month) return;
            if (m.year === anioVisible && m.month === mesVisible) return;
            setAnioVisible(m.year);
            setMesVisible(m.month);
            setSelectedDate(null);
          }}
          markingType="simple"
          markedDates={markedDates}
          onDayPress={(day) => setSelectedDate(day.dateString)}
          theme={{
            backgroundColor: 'transparent',
            calendarBackground: 'transparent',
            textSectionTitleColor: COLORS.textSub,
            dayTextColor: COLORS.textPrimary,
            monthTextColor: COLORS.textPrimary,
            arrowColor: COLORS.accent,
            todayTextColor: COLORS.accent,
          }}
        />

        <Text style={styles.hint}>
          {selectedDate
            ? `Filtro activo: solo órdenes que INICIAN el ${selectedDate}.`
            : 'Toca un día para filtrar SOLO por fecha de INICIO.'}
        </Text>
      </View>

      {/* buscador */}
      <View style={[styles.card, { marginTop: 12 }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="search-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Buscar / Seleccionar orden</Text>

          {loading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={{ color: COLORS.textSub, fontSize: 12 }}>Cargando…</Text>
            </View>
          )}
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.textSub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Busca por #orden, equipo o texto…"
            placeholderTextColor="#9AA5B1"
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={COLORS.textSub} />
            </Pressable>
          )}
        </View>
      </View>

      {/* contador */}
      <Text style={styles.count}>
        Mostrando <Text style={styles.bold}>{filteredOrders.length}</Text> órdenes
        {selectedDate ? ` del día ${selectedDate}` : ''}
      </Text>

      {/* ✅ barra bulk */}
      {selectedCount > 0 && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkText}>Seleccionadas: {selectedCount}</Text>

          <Pressable onPress={() => setBulkOpen(true)} style={styles.bulkBtn}>
            <Ionicons name="calendar-outline" size={16} color="#fff" />
            <Text style={styles.bulkBtnText}>Reprogramar</Text>
          </Pressable>

          <Pressable onPress={clearSelection} style={styles.bulkClear}>
            <Text style={styles.bulkClearText}>Limpiar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <Header title="No mantenimiento (0011)" />

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={HeaderUI}
        contentContainerStyle={{ paddingBottom: 22 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Cargando…' : 'No hay resultados.'}</Text>}
        renderItem={({ item }) => {
          const checked = selectedIds.has(item.id);

          return (
            <View style={styles.orderRow}>
              {/* checkbox */}
              <Pressable onPress={() => toggleSelect(item.id)} style={styles.checkWrap} hitSlop={10}>
                <Ionicons
                  name={checked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={checked ? COLORS.accent : COLORS.textSub}
                />
              </Pressable>

              <View style={{ flex: 1 }}>
                <Text style={styles.orderId}>Orden #{item.id}</Text>

                <Text style={styles.orderSub}>
                  {item.equipo ? item.equipo : 'Equipo —'}
                  {item.shortText ? ` • ${item.shortText}` : ''}
                </Text>

                <Text style={styles.orderDates}>
                  Inicio: <Text style={styles.bold}>{item.startDate || '—'}</Text> · Fin:{' '}
                  <Text style={styles.bold}>{item.finishDate || '—'}</Text>
                </Text>

                {!!item.userstatusCodes && <Text style={styles.small}>Códigos: {item.userstatusCodes}</Text>}
              </View>

              {/* Solo reprogramar individual si NO hay selección múltiple */}
              {!bulkMode && (
                <Pressable
                  onPress={() => openEdit(item)}
                  android_ripple={{ color: '#d7e3f3' }}
                  style={({ pressed }) => [
                    styles.editBtn,
                    pressed && Platform.OS === 'ios' ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Ionicons name="calendar-outline" size={18} color="#fff" />
                  <Text style={styles.editBtnText}>Reprogramar</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      {/* ===== Modal editar UNA orden (paso a paso: inicio -> fin) ===== */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? `Orden #${editing.id}` : 'Orden'}</Text>
              <Pressable onPress={closeEdit} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <Text style={styles.modalHint}>
              {pickStep === 'start'
                ? 'Paso 1: selecciona la fecha de INICIO'
                : 'Paso 2: selecciona la fecha de FIN'}
            </Text>

            <View style={styles.pillsRow}>
              <View style={[styles.pill, pickStep === 'start' && styles.pillActive]}>
                <Text style={styles.pillLabel}>Inicio</Text>
                <Text style={styles.pillValue}>{tempStart || '—'}</Text>
              </View>
              <View style={[styles.pill, pickStep === 'end' && styles.pillActive]}>
                <Text style={styles.pillLabel}>Fin</Text>
                <Text style={styles.pillValue}>{tempEnd || '—'}</Text>
              </View>
            </View>

            <Calendar
              markingType="period"
              markedDates={tempStart && tempEnd ? buildRangeMarkedDates(tempStart, tempEnd) : {}}
              onDayPress={(d) => onPickDate(d.dateString)}
              theme={{
                backgroundColor: 'transparent',
                calendarBackground: 'transparent',
                textSectionTitleColor: COLORS.textSub,
                dayTextColor: COLORS.textPrimary,
                monthTextColor: COLORS.textPrimary,
                arrowColor: COLORS.accent,
                todayTextColor: COLORS.accent,
              }}
            />

            <View style={styles.stepRow}>
              <Pressable
                onPress={() => {
                  setPickStep('start');
                  setTempStart(editing?.startDate || toYMD(new Date()));
                  setTempEnd('');
                }}
                style={[styles.stepBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
              >
                <Ionicons name="arrow-back" size={16} color={COLORS.textPrimary} />
                <Text style={styles.stepBtnText}>Volver a inicio</Text>
              </Pressable>

              {pickStep === 'end' && (
                <Pressable
                  onPress={() => {
                    if (!tempStart) return;
                    setTempEnd(tempStart);
                  }}
                  style={[styles.stepBtn, saving && { opacity: 0.6 }]}
                  disabled={saving}
                >
                  <Ionicons name="swap-horizontal" size={16} color={COLORS.textPrimary} />
                  <Text style={styles.stepBtnText}>Fin = Inicio</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setPickStep('start');
                  setTempStart(editing?.startDate || toYMD(new Date()));
                  setTempEnd('');
                }}
                style={[styles.ghostBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
              >
                <Text style={styles.ghostBtnText}>Restaurar</Text>
              </Pressable>

              <Pressable
                onPress={saveEdit}
                style={[styles.primaryBtn, (!canSave() ? { opacity: 0.6 } : null)]}
                disabled={!canSave()}
              >
                <Text style={styles.primaryBtnText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
              </Pressable>
            </View>

            <Text style={styles.modalFooter}>
              *Paso a paso: primero Inicio, luego Fin. (y si tu backend lo trae, quita 0011 y activa 0012).
            </Text>
          </View>
        </View>
      </Modal>

      {/* ===== Modal BULK ===== */}
      <Modal
        visible={bulkOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (bulkSaving) return;
          setBulkOpen(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reprogramar seleccionadas</Text>
              <Pressable
                onPress={() => {
                  if (bulkSaving) return;
                  setBulkOpen(false);
                }}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <Text style={styles.modalHint}>
              Se aplicará la misma fecha a <Text style={styles.bold}>{selectedCount}</Text> órdenes.
            </Text>

            <View style={styles.pillsRow}>
              <View style={styles.pill}>
                <Text style={styles.pillLabel}>Fecha</Text>
                <Text style={styles.pillValue}>{bulkDate}</Text>
              </View>
            </View>

            <Calendar
              current={bulkDate}
              markedDates={{
                [bulkDate]: { selected: true, selectedColor: COLORS.accent, selectedTextColor: '#fff' },
              }}
              onDayPress={(d) => setBulkDate(d.dateString)}
              theme={{
                backgroundColor: 'transparent',
                calendarBackground: 'transparent',
                textSectionTitleColor: COLORS.textSub,
                dayTextColor: COLORS.textPrimary,
                monthTextColor: COLORS.textPrimary,
                arrowColor: COLORS.accent,
                todayTextColor: COLORS.accent,
              }}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setBulkDate(toYMD(new Date()))}
                style={[styles.ghostBtn, bulkSaving && { opacity: 0.6 }]}
                disabled={bulkSaving}
              >
                <Text style={styles.ghostBtnText}>Hoy</Text>
              </Pressable>

              <Pressable
                onPress={saveBulk}
                style={[styles.primaryBtn, bulkSaving && { opacity: 0.7 }]}
                disabled={bulkSaving}
              >
                <Text style={styles.primaryBtnText}>{bulkSaving ? 'Guardando…' : 'Guardar'}</Text>
              </Pressable>
            </View>

            <Text style={styles.modalFooter}>*Esto manda RESCHEDULE + CHANGE_WORKORDER a todas.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ====================== Styles ====================== */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.pageBg },

  card: {
    backgroundColor: COLORS.cardBg,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 2 },
    }),
  },

  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, flex: 1 },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  refreshText: { fontSize: 12, fontWeight: '800', color: COLORS.textSub },

  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  clearBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textSub },

  hint: { marginTop: 8, fontSize: 12, color: COLORS.textSub },
  bold: { fontWeight: '900', color: COLORS.textPrimary },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    backgroundColor: '#fff',
  },
  searchInput: { flex: 1, fontSize: 13.5, color: COLORS.textPrimary },

  count: { marginHorizontal: 16, marginTop: 10, color: COLORS.textSub, fontSize: 12.5 },

  empty: { paddingVertical: 18, paddingHorizontal: 16, color: COLORS.textSub, fontSize: 13 },

  orderRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#fff',
  },

  checkWrap: { alignSelf: 'center' },

  orderId: { fontSize: 14, fontWeight: '900', color: COLORS.textPrimary },
  orderSub: { marginTop: 2, fontSize: 12.5, color: COLORS.textSub },
  orderDates: { marginTop: 6, fontSize: 12.5, color: COLORS.textSub },
  small: { marginTop: 4, fontSize: 11.5, color: COLORS.textSub },

  editBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  editBtnText: { color: '#fff', fontWeight: '900', fontSize: 12.5 },

  bulkBar: {
    marginHorizontal: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulkText: { flex: 1, fontSize: 12.5, color: COLORS.textPrimary, fontWeight: '800' },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  bulkBtnText: { color: '#fff', fontWeight: '900', fontSize: 12.5 },
  bulkClear: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bulkClearText: { color: COLORS.textSub, fontWeight: '900', fontSize: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 15, fontWeight: '900', color: COLORS.textPrimary },
  modalHint: { marginTop: 8, fontSize: 12.5, color: COLORS.textSub },

  pillsRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 8 },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  pillActive: { borderColor: COLORS.accent },

  pillLabel: { fontSize: 11.5, color: COLORS.textSub, fontWeight: '800' },
  pillValue: { marginTop: 2, fontSize: 13, color: COLORS.textPrimary, fontWeight: '900' },

  stepRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  stepBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  stepBtnText: { fontSize: 12.5, fontWeight: '900', color: COLORS.textPrimary },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  ghostBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  ghostBtnText: { fontSize: 13, fontWeight: '900', color: COLORS.textPrimary },

  primaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.accent },
  primaryBtnText: { fontSize: 13, fontWeight: '900', color: '#fff' },

  modalFooter: { marginTop: 10, fontSize: 11.5, color: COLORS.textSub },
});
