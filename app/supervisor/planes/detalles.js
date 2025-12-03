import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import api from '../../../src/services/api';
import { useAuth } from '../../../src/context/AuthContext';

// ---- Locale ES para el calendario ----
LocaleConfig.locales.es = {
  monthNames: [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ],
  monthNamesShort: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
  dayNames: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
  dayNamesShort: ['Do','Lu','Ma','Mi','Ju','Vi','Sa'],
  today: 'Hoy',
};
LocaleConfig.defaultLocale = 'es';

const BG = '#F4F6F9';
const SAP_BLUE = '#0A6ED1';
const SAP_BORDER = '#E4E9F0';
const SAP_TEXT = '#0B1F3B';
const SAP_SUB = '#6A7381';
const W = Dimensions.get('window').width;

// util: YYYY-MM-DD
const ymd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export default function DetallePlanSupervisor() {
  const { id } = useLocalSearchParams();
  const { user, token } = useAuth();

  const [detalles, setDetalles] = useState([]);
  const [vista, setVista] = useState('lista');
  const [mesVisible, setMesVisible] = useState(new Date().getMonth() + 1);
  const [anioVisible, setAnioVisible] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetalles = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/planes/${id}/detalles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDetalles(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error('Error al cargar detalles del plan:', error?.message);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchDetalles();
  }, [id, token]);

  // Fechas marcadas en el calendario (multi-dot)
  const markedDates = useMemo(() => {
    const marks = {};
    detalles.forEach((row, idx) => {
      const key = ymd(row.fecha_actividad);
      marks[key] = marks[key] || { dots: [] };
      marks[key].dots.push({ key: `k${idx}`, color: SAP_BLUE });
    });
    return marks;
  }, [detalles]);

  // Lista filtrada del mes visible
  const actividadesMes = useMemo(() => {
    return detalles
      .filter((d) => {
        const dt = new Date(d.fecha_actividad);
        return dt.getMonth() + 1 === mesVisible && dt.getFullYear() === anioVisible;
      })
      .sort((a, b) => new Date(a.fecha_actividad) - new Date(b.fecha_actividad));
  }, [detalles, mesVisible, anioVisible]);

  const generarPDF = async () => {
    try {
      const { data: htmlContent } = await api.get(
        `/planes/generar-pdf?year=${anioVisible}&month=${mesVisible}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error('Error al generar PDF:', error?.message);
      Alert.alert('Error', 'No se pudo generar el PDF');
    }
  };

  const Tabs = () => (
    <View style={styles.tabs}>
      <TouchableOpacity
        style={[styles.tab, vista === 'lista' && styles.activeTab]}
        onPress={() => setVista('lista')}
      >
        <Ionicons
          name="list-outline"
          size={15}
          color={vista === 'lista' ? SAP_BLUE : SAP_SUB}
          style={{ marginRight: 4 }}
        />
        <Text style={[styles.tabText, vista === 'lista' && styles.activeTabText]}>Lista</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, vista === 'calendario' && styles.activeTab]}
        onPress={() => setVista('calendario')}
      >
        <Ionicons
          name="calendar-outline"
          size={15}
          color={vista === 'calendario' ? SAP_BLUE : SAP_SUB}
          style={{ marginRight: 4 }}
        />
        <Text style={[styles.tabText, vista === 'calendario' && styles.activeTabText]}>
          Calendario
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderLista = () => (
    <FlatList
      data={detalles}
      keyExtractor={(item) => item.id?.toString()}
      contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      renderItem={({ item }) => (
        <View style={styles.listCard}>
          <View style={styles.listBar} />
          <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 8 }}>
            <View style={styles.itemHeader}>
              <View style={styles.badge}>
                <Ionicons name="calendar-outline" size={14} color={SAP_BLUE} />
                <Text style={styles.badgeText}>
                  {new Date(item.fecha_actividad).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.tech}>{item.tecnico_nombre || 'Sin asignar'}</Text>
            </View>
            <Text style={styles.desc} numberOfLines={3}>
              {item.descripcion}
            </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={18} color={SAP_SUB} />
          <Text style={{ color: SAP_SUB, marginLeft: 6 }}>
            {loading ? 'Cargando…' : 'No hay actividades en este plan.'}
          </Text>
        </View>
      }
    />
  );

  const renderCalendario = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.calendarBox}>
        <Calendar
          style={{ width: W - 32, alignSelf: 'center', borderRadius: 14 }}
          initialDate={`${anioVisible}-${String(mesVisible).padStart(2, '0')}-01`}
          onMonthChange={(m) => {
            if (m?.year && m?.month) {
              setAnioVisible(m.year);
              setMesVisible(m.month);
            }
          }}
          markingType="multi-dot"
          markedDates={markedDates}
          theme={{
            calendarBackground: '#fff',
            textSectionTitleColor: '#9CA3AF',
            dayTextColor: SAP_TEXT,
            monthTextColor: SAP_TEXT,
            arrowColor: SAP_BLUE,
            todayTextColor: SAP_BLUE,
            selectedDayBackgroundColor: SAP_BLUE,
            dotColor: SAP_BLUE,
          }}
        />
      </View>

      {/* Resumen del mes visible */}
      <View style={styles.monthPanel}>
        <View style={styles.monthHeader}>
          <View>
            <Text style={styles.monthTitle}>
              Actividades de {mesVisible}/{anioVisible}
            </Text>
            <Text style={styles.monthSubtitle}>
              {actividadesMes.length} actividades programadas
            </Text>
          </View>
          {(user?.rol_id === 1 || user?.rol_id === 2) && (
            <TouchableOpacity onPress={generarPDF} style={styles.btnPDF}>
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.btnPDFText}>PDF</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={actividadesMes}
          keyExtractor={(item) => `m-${item.id}`}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={{ paddingVertical: 12 }}
          renderItem={({ item }) => (
            <View style={styles.monthItem}>
              <View style={styles.monthDate}>
                <Ionicons name="calendar-outline" size={13} color={SAP_BLUE} />
                <Text style={styles.monthItemDate}>
                  {new Date(item.fecha_actividad).toLocaleDateString()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.monthItemDesc} numberOfLines={2}>
                  {item.descripcion}
                </Text>
                <Text style={styles.monthItemTech}>
                  {item.tecnico_nombre ? item.tecnico_nombre : 'Sin asignar'}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ color: SAP_SUB, textAlign: 'center', paddingVertical: 8 }}>
              No hay actividades este mes.
            </Text>
          }
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Header title="Detalle del plan" />

      {/* Object header Fiori */}
      <View style={styles.summary}>
        <View style={styles.summaryIcon}>
          <Ionicons name="clipboard-outline" size={20} color={SAP_BLUE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryTitle}>Plan #{id}</Text>
          <Text style={styles.summarySub}>
            {loading ? 'Cargando actividades…' : `${detalles.length} actividades programadas`}
          </Text>
        </View>
      </View>

      <Tabs />

      <View style={{ flex: 1 }}>{vista === 'lista' ? renderLista() : renderCalendario()}</View>

      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SAP_BORDER,
    gap: 10,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E6F1FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: { color: SAP_TEXT, fontWeight: '700', fontSize: 15 },
  summarySub: { color: SAP_SUB, fontSize: 12 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: SAP_BORDER,
    marginBottom: 10,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: '#E6F1FC',
  },
  tabText: {
    color: SAP_SUB,
    fontWeight: '600',
    fontSize: 13,
  },
  activeTabText: {
    color: SAP_BLUE,
  },

  // LISTA
  listCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SAP_BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.015,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    minHeight: 76,
  },
  listBar: {
    width: 5,
    backgroundColor: '#CFE3FA',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EAF2FB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { color: SAP_BLUE, fontWeight: '600', fontSize: 11.5 },
  tech: { color: SAP_SUB, fontWeight: '600', fontSize: 12 },
  desc: { color: SAP_TEXT, marginTop: 6, fontSize: 13 },

  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },

  // CALENDARIO
  calendarBox: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SAP_BORDER,
    paddingVertical: 6,
  },

  monthPanel: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SAP_BORDER,
    padding: 10,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  monthTitle: { color: SAP_TEXT, fontWeight: '700', fontSize: 14 },
  monthSubtitle: { color: SAP_SUB, fontSize: 11.5, marginTop: 2 },
  btnPDF: {
    backgroundColor: SAP_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  btnPDFText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  monthItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F3F7FC',
    borderRadius: 12,
    padding: 10,
  },
  monthDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 110,
  },
  monthItemDate: { color: SAP_BLUE, fontWeight: '700', fontSize: 12.5 },
  monthItemDesc: { color: SAP_TEXT, fontSize: 13 },
  monthItemTech: { color: SAP_SUB, marginTop: 2, fontSize: 12 },
});
