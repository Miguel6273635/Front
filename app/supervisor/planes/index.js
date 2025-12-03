import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import api from '../../../src/services/api';
import { useAuth } from '../../../src/context/AuthContext';

const BG = '#F4F6F9';
const SAP_BLUE = '#0A6ED1';
const SAP_BORDER = '#E4E9F0';
const SAP_TEXT = '#0B1F3B';
const SAP_SUB = '#6A7381';

export default function PlanesSupervisor() {
  const { token } = useAuth();
  const [planes, setPlanes] = useState([]);
  const [filtros, setFiltros] = useState({
    cliente: '',
    contrato: '',
    fechaInicio: '',
    fechaFin: '',
  });
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/planes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPlanes(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error('Error al cargar planes:', error?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const limpiarFiltros = () => {
    setFiltros({ cliente: '', contrato: '', fechaInicio: '', fechaFin: '' });
  };

  const filtrados = useMemo(() => {
    let result = planes;
    const { cliente, contrato, fechaInicio, fechaFin } = filtros;

    if (cliente.trim()) {
      result = result.filter((p) =>
        (p.cliente || '').toLowerCase().includes(cliente.trim().toLowerCase())
      );
    }
    if (contrato.trim()) {
      result = result.filter((p) =>
        (p.contrato || '').toLowerCase().includes(contrato.trim().toLowerCase())
      );
    }
    if (fechaInicio) {
      const d = new Date(fechaInicio);
      result = result.filter((p) => new Date(p.fecha_inicio) >= d);
    }
    if (fechaFin) {
      const d = new Date(fechaFin);
      result = result.filter((p) => new Date(p.fecha_fin) <= d);
    }
    return result;
  }, [planes, filtros]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      style={styles.listItem}
      onPress={() => router.push(`/supervisor/planes/detalles?id=${item.id}`)}
    >
      {/* barra lateral */}
      <View style={styles.sideBar} />

      {/* contenido */}
      <View style={styles.itemBody}>
        <View style={styles.itemHeader}>
          <View style={styles.badge}>
            <Ionicons name="calendar-outline" size={14} color={SAP_BLUE} />
            <Text style={styles.badgeText}>
              {item.fecha_inicio
                ? new Date(item.fecha_inicio).toLocaleDateString()
                : '—'}{' '}
              –{' '}
              {item.fecha_fin ? new Date(item.fecha_fin).toLocaleDateString() : '—'}
            </Text>
          </View>
          {!!item.contrato && <Text style={styles.contract}>#{item.contrato}</Text>}
        </View>

        <Text numberOfLines={1} style={styles.title}>
          {item.cliente || 'Cliente sin nombre'}
        </Text>

        {!!item.descripcion && (
          <Text numberOfLines={2} style={styles.sub}>
            {item.descripcion}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Header title="Planes de mantenimiento" />

      {/* Encabezado tipo Fiori */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Planes</Text>
        <Text style={styles.pageSubtitle}>
          Filtra por cliente, contrato o rango de fechas
        </Text>
      </View>

      {/* Filtros */}
      <View style={styles.filtersBox}>
        <View style={styles.filtersRow}>
          <View style={[styles.inputRow, { flex: 1 }]}>
            <Ionicons name="person-outline" size={16} color={SAP_SUB} />
            <TextInput
              placeholder="Cliente"
              placeholderTextColor={SAP_SUB}
              style={styles.input}
              value={filtros.cliente}
              onChangeText={(t) => setFiltros((s) => ({ ...s, cliente: t }))}
            />
          </View>
          <View style={{ width: 10 }} />
          <View style={[styles.inputRow, { flex: 1 }]}>
            <Ionicons name="document-text-outline" size={16} color={SAP_SUB} />
            <TextInput
              placeholder="Contrato"
              placeholderTextColor={SAP_SUB}
              style={styles.input}
              value={filtros.contrato}
              onChangeText={(t) => setFiltros((s) => ({ ...s, contrato: t }))}
            />
          </View>
        </View>

        <View style={styles.filtersRow}>
          <View style={[styles.inputRow, { flex: 1 }]}>
            <Ionicons name="calendar-outline" size={16} color={SAP_SUB} />
            <TextInput
              placeholder="Inicio (YYYY-MM-DD)"
              placeholderTextColor={SAP_SUB}
              style={styles.input}
              value={filtros.fechaInicio}
              onChangeText={(t) => setFiltros((s) => ({ ...s, fechaInicio: t }))}
            />
          </View>
          <View style={{ width: 10 }} />
          <View style={[styles.inputRow, { flex: 1 }]}>
            <Ionicons name="calendar-outline" size={16} color={SAP_SUB} />
            <TextInput
              placeholder="Fin (YYYY-MM-DD)"
              placeholderTextColor={SAP_SUB}
              style={styles.input}
              value={filtros.fechaFin}
              onChangeText={(t) => setFiltros((s) => ({ ...s, fechaFin: t }))}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={limpiarFiltros}>
            <Ionicons name="close-outline" size={16} color={SAP_BLUE} />
            <Text style={styles.btnGhostText}>Limpiar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]}>
            <Ionicons name="funnel-outline" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>{loading ? 'Filtrando…' : 'Aplicar'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista */}
      <FlatList
        data={filtrados}
        keyExtractor={(item) => item.id?.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={18} color={SAP_SUB} />
            <Text style={{ color: SAP_SUB, marginLeft: 6 }}>
              {loading ? 'Cargando…' : 'Sin resultados'}
            </Text>
          </View>
        }
      />

      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: SAP_TEXT,
  },
  pageSubtitle: {
    fontSize: 12.5,
    color: SAP_SUB,
    marginTop: 2,
  },

  filtersBox: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SAP_BORDER,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.015,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: SAP_BORDER,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  input: { flex: 1, marginLeft: 6, color: SAP_TEXT, paddingVertical: 0, fontSize: 13.5 },

  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: SAP_BLUE },
  btnGhostText: { color: SAP_BLUE, fontWeight: '700', marginLeft: 4 },
  btnPrimary: { backgroundColor: SAP_BLUE },
  btnPrimaryText: { color: '#fff', fontWeight: '700', marginLeft: 4 },

  listItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SAP_BORDER,
    minHeight: 90,
    shadowColor: '#000',
    shadowOpacity: 0.015,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  sideBar: {
    width: 5,
    backgroundColor: '#CFE3FA',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  itemBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    gap: 6,
    backgroundColor: '#EAF2FB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    color: SAP_BLUE,
    fontWeight: '600',
    fontSize: 11.5,
  },
  contract: { color: SAP_SUB, fontWeight: '600', fontSize: 11.5 },

  title: {
    color: SAP_TEXT,
    fontWeight: '700',
    fontSize: 15,
    marginTop: 6,
  },
  sub: { color: SAP_SUB, marginTop: 4, fontSize: 12.5 },

  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
});
