// app/supervisor/no_mantenimiento/index.js  (o la ruta donde tengas esta vista)
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
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

const parseSapDate = (v) => {
  // "/Date(1768262400000)/"
  if (!v) return null;
  const m = String(v).match(/\/Date\((\d+)\)\//);
  if (!m) return null;
  const ms = Number(m[1]);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
};

const safeStr = (v) => (v == null ? '' : String(v));

// ✅ No mantenimiento: Userstatus contiene códigos y TODOS están entre 0001..0011
function isNoMantenimientoByUserstatus(userstatusRaw) {
  const s = safeStr(userstatusRaw).trim();
  if (!s) return false;

  const codes = s.match(/\b\d{4}\b/g) || [];
  if (codes.length === 0) return false;

  return codes.every((c) => {
    const n = Number(c);
    return n >= 1 && n <= 11;
  });
}

export default function NoMantenimientoIndex() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const params = useLocalSearchParams();
  const { refresh } = params;

  // Si ya lo manejas con AuthContext, cámbialo ahí.
  const correo = safeStr(params?.correo) || 'miguel.hernandez@tellus-technologies.com';

  const fetchLista = useCallback(async () => {
    try {
      setLoading(true);

      // ✅ MISMA URL base que tu ejemplo correcto: TODO 2026
      const from = '2026-01-01T00:00:00';
      const to = '2026-12-31T23:59:59';

      const filter =
        `StartDate ge datetime'${from}' and ` +
        `FinishDate le datetime'${to}' and ` +
        `Userstatus eq '${correo}'`;

      const url =
        `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet` +
        `?$filter=${encodeURIComponent(filter)}` +
        `&$format=json`;

      console.log('[NO_MANTTO] ODATA URL =>', `${api.defaults.baseURL}${url}`);

      const { data } = await api.get(url);
      const results = Array.isArray(data?.d?.results) ? data.d.results : [];

      // Debug útil (puedes quitarlo luego)
      console.log('[NO_MANTTO] TOTAL RESULTS:', results.length);
      console.log('[NO_MANTTO] SAMPLE USERSTATUS:', results?.[0]?.Userstatus);

      // ✅ FILTRO CORRECTO: por Userstatus (0001..0011)
      const filtradas = results.filter((it) => {
        const us = it?.Userstatus || it?.UserStatus || '';
        return isNoMantenimientoByUserstatus(us);
      });

      // ✅ búsqueda local (orden/equipo/texto/userstatus)
      const s = q.trim().toLowerCase();
      const buscadas = !s
        ? filtradas
        : filtradas.filter((it) => {
            const order =
              safeStr(it?.Orderid || it?.OrderId || it?.OrderID).toLowerCase();
            const equip = safeStr(it?.Equipment || it?.Equipo).toLowerCase();
            const text = safeStr(it?.ShortText || it?.Description || it?.Descripcion).toLowerCase();
            const us = safeStr(it?.Userstatus || it?.UserStatus).toLowerCase();

            return (
              order.includes(s) ||
              equip.includes(s) ||
              text.includes(s) ||
              us.includes(s)
            );
          });

      setRows(buscadas);
    } catch (e) {
      console.error('Error lista no mantenimiento (ODATA):', e?.response?.data || e.message);
      setRows([]);
      Alert.alert('Error', 'No se pudo cargar la lista (OData). Revisa la consola.');
    } finally {
      setLoading(false);
    }
  }, [q, correo]);

  useEffect(() => {
    fetchLista();
  }, [fetchLista]);

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
    const orderId = safeStr(item?.Orderid || item?.OrderId || item?.OrderID);

    router.push({
      pathname: '/supervisor/no_mantenimiento/detalles',
      params: {
        id: orderId,
        correo,
      },
    });
  };

  const renderItem = ({ item }) => {
    const orderId = safeStr(item?.Orderid || item?.OrderId || item?.OrderID);
    const startDate = parseSapDate(item?.StartDate);
    const finishDate = parseSapDate(item?.FinishDate);

    const userstatus = safeStr(item?.Userstatus || item?.UserStatus || '—');

    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetalle(item)} activeOpacity={0.75}>
        <View style={styles.rowBetween}>
          <Text style={styles.title}>Orden {orderId || '—'}</Text>

          <View style={[styles.pill, styles.pillPending]}>
            <Text style={styles.pillText}>No mantenimiento</Text>
          </View>
        </View>

        <Text style={styles.line}>
          <Text style={styles.label}>Equipo: </Text>
          {safeStr(item?.Equipment || item?.Equipo || '—')}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Texto: </Text>
          {safeStr(item?.ShortText || item?.Description || item?.Descripcion || '—')}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Userstatus: </Text>
          {userstatus}
        </Text>

        <Text style={[styles.line, { marginTop: 6, fontSize: 12 }]}>
          <Text style={styles.label}>Inicio: </Text>
          {startDate ? startDate.toLocaleString() : '—'}
          {'  ·  '}
          <Text style={styles.label}>Fin: </Text>
          {finishDate ? finishDate.toLocaleString() : '—'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Órdenes No mantenimiento (0001–0011)" />

      <View style={styles.content}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.text} style={{ marginRight: 6 }} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por orden, equipo, texto o userstatus…"
            placeholderTextColor="#8A96A3"
            style={styles.searchInput}
            onSubmitEditing={fetchLista}
            returnKeyType="search"
            autoCapitalize="none"
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
            keyExtractor={(it) => safeStr(it?.Orderid || it?.OrderId || it?.OrderID)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 90 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
            ListEmptyComponent={
              <Text style={{ color: COLORS.text, textAlign: 'center', marginTop: 20 }}>
                No hay órdenes con Userstatus únicamente entre 0001–0011.
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
  pillText: { fontSize: 11, fontWeight: '900', color: COLORS.title },
});
