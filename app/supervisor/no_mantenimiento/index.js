import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';

import Header from '../../../src/components/Header';
import api from '../../../src/services/api';

const COLORS = {
  pageBg: '#F4F6F9',
  cardBg: '#FFFFFF',
  border: '#E4E9F0',
  title: '#0B1F3B',
  text: '#52616B',
  accent: '#0A6ED1',
};

export default function NoMantenimientoIndex() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { refresh } = useLocalSearchParams();

  const fetchLista = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/carta-no-mantenimiento/supervisor/lista', {
        params: q.trim() ? { q: q.trim() } : {},
      });
      setRows(data?.data || []);
    } catch (e) {
      console.error('Error lista no mantenimiento:', e?.response?.data || e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  // ✅ Cargar al entrar la primera vez
  useEffect(() => {
    fetchLista();
  }, [fetchLista]);

  // ✅ Si vienes de detalles con refresh, recargar lista
  useEffect(() => {
    if (refresh) fetchLista();
  }, [refresh, fetchLista]);

  const onPullRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchLista();
    } finally {
      setRefreshing(false);
    }
  };

  const openDetalle = (item) => {
    router.push({
      pathname: '/supervisor/no_mantenimiento/detalles',
      params: { id: String(item.id) },
    });
  };

  const renderItem = ({ item }) => {
    const asignada = item?.causa_clave !== null && item?.causa_clave !== undefined;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openDetalle(item)}
        activeOpacity={0.75}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.title}>Orden {item.orderid}</Text>

          <View style={[styles.pill, asignada ? styles.pillOk : styles.pillPending]}>
            <Text style={styles.pillText}>{asignada ? 'Causa asignada' : 'Sin causa'}</Text>
          </View>
        </View>

        <Text style={styles.line}>
          <Text style={styles.label}>Equipo: </Text>
          {item.equipment || '—'}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Cliente: </Text>
          {item.razon_social || '—'}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Mecánico: </Text>
          {item.mecanico_nombre || '—'}
        </Text>

        {asignada ? (
          <Text style={[styles.line, { marginTop: 6 }]}>
            <Text style={styles.label}>Causa: </Text>
            {item.causa_texto || String(item.causa_clave)}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Órdenes No mantenimiento" />

      <View style={styles.content}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.text} style={{ marginRight: 6 }} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por orden, equipo, cliente…"
            placeholderTextColor="#8A96A3"
            style={styles.searchInput}
            onSubmitEditing={fetchLista}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={fetchLista} style={styles.searchBtn}>
            <Ionicons name="arrow-forward" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ paddingTop: 24, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={{ marginTop: 8, color: COLORS.text }}>Cargando…</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 90 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />
            }
            ListEmptyComponent={
              <Text style={{ color: COLORS.text, textAlign: 'center', marginTop: 20 }}>
                No hay órdenes de no mantenimiento.
              </Text>
            }
          />
        )}
      </View>

     
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  content: { flex: 1, padding: 14 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: COLORS.title, fontSize: 13 },
  searchBtn: { backgroundColor: COLORS.accent, padding: 8, borderRadius: 12, marginLeft: 8 },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '900', color: COLORS.title },
  line: { marginTop: 4, color: COLORS.text, fontSize: 13 },
  label: { fontWeight: '900', color: COLORS.title },

  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillPending: { backgroundColor: '#FFF3CD' },
  pillOk: { backgroundColor: '#EAF3FF' },
  pillText: { fontSize: 11, fontWeight: '900', color: COLORS.title },
});
