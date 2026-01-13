// app/supervisor/averia/[averiaid]/detalles.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../../src/components/Header';
import api from '../../../../src/services/api'; // backend con token

const COLORS = {
  pageBg: '#F4F6F9',
  cardBg: '#FFFFFF',
  border: '#E4E9F0',
  title: '#0B1F3B',
  text: '#52616B',
  accent: '#0A6ED1',
  chipBg: '#EAF3FF',
  danger: '#E74C3C',
};

const parseSapDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('/Date(')) {
    const ms = parseInt(value.replace('/Date(', '').replace(')/', ''), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (value) => {
  const d = parseSapDate(value);
  if (!d) return '—';
  return d.toLocaleDateString();
};

export default function DetallesAveriaSupervisor() {
  const { averiaid } = useLocalSearchParams();

  const [header, setHeader] = useState(null);
  const [codigos, setCodigos] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ solo detalles desde tu backend
  const fetchDetalle = async () => {
    try {
      setLoading(true);

      const id = String(averiaid || '').trim();
      if (!id || id === 'undefined' || id === 'null') {
        setHeader(null);
        setCodigos(null);
        return;
      }

      const { data } = await api.get(`/sap/averias/detalle/${encodeURIComponent(id)}`);

      if (!data?.ok) {
        throw new Error(data?.error || 'No se pudo cargar el detalle');
      }

      setHeader(data.header || null);
      setCodigos(data.codigos || null);
    } catch (err) {
      console.error('Error al cargar detalle de avería:', err?.response?.data || err?.message || err);
      Alert.alert('Error', 'No se pudo cargar el detalle de la avería.');
      setHeader(null);
      setCodigos(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (averiaid) fetchDetalle();
  }, [averiaid]);

  const goBack = () => router.back();

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de avería" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Cargando detalle…</Text>
        </View>
      </View>
    );
  }

  if (!header) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de avería" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <Text style={{ color: COLORS.text, textAlign: 'center' }}>
            No se encontró información para el aviso #{averiaid}
          </Text>

          <Pressable
            onPress={fetchDetalle}
            style={({ pressed }) => [
              styles.btnSecondary,
              { marginTop: 14, alignSelf: 'center' },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.btnSecondaryText}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const notifNo = header.NotifNo;
  const notifType = header.NotifType;
  const shortText = header.ShortText;
  const reportedBy = header.Reportedby;
  const codeGroup = header.CodeGroup;
  const coding = header.Coding;
  const equipment = header.Equipment;
  const functLoc = header.FunctLoc;
  const notifDate = header.NotifDate;
  const desstDate = header.Desstdate;
  const createdOn = header.CreatedOn;

  return (
    <View style={styles.container}>
      <Header title={`Aviso ${notifNo || averiaid}`} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.backRow} onPress={goBack} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver a la lista</Text>
        </TouchableOpacity>

        {/* ===== Card: Overview ===== */}
        <View style={styles.cardHighlight}>
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Ionicons
                name="alert-circle-outline"
                size={14}
                color={COLORS.accent}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.chipText}>{notifType || 'Sin tipo'}</Text>
            </View>

            {equipment ? (
              <View style={styles.chip}>
                <Ionicons
                  name="hardware-chip-outline"
                  size={14}
                  color={COLORS.accent}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.chipText}>{equipment}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.mainTitle}>{shortText || 'Sin descripción'}</Text>

          {reportedBy ? (
            <Text style={styles.subtitle}>
              Reportado por{' '}
              <Text style={{ fontWeight: '700', color: COLORS.title }}>
                {reportedBy}
              </Text>
            </Text>
          ) : null}
        </View>

        {/* ===== Card: Datos generales ===== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos generales</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Número de aviso</Text>
              <Text style={styles.infoValue}>{notifNo || '—'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Tipo de aviso</Text>
              <Text style={styles.infoValue}>{notifType || '—'}</Text>
            </View>

            <View style={styles.infoItemFull}>
              <Text style={styles.infoLabel}>Ubicación funcional</Text>
              <Text style={styles.infoValue}>{functLoc || '—'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Fecha de notificación</Text>
              <Text style={styles.infoValue}>{formatDate(notifDate)}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Fecha deseada inicio</Text>
              <Text style={styles.infoValue}>{formatDate(desstDate)}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Creado el</Text>
              <Text style={styles.infoValue}>{formatDate(createdOn)}</Text>
            </View>
          </View>
        </View>

        {/* ===== Card: Códigos header ===== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Códigos del aviso</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItemFull}>
              <Text style={styles.infoLabel}>Grupo de código (CodeGroup)</Text>
              <Text style={styles.infoValue}>{codeGroup || '—'}</Text>
            </View>

            <View style={styles.infoItemFull}>
              <Text style={styles.infoLabel}>Código (Coding)</Text>
              <Text style={styles.infoValue}>{coding || '—'}</Text>
            </View>
          </View>
        </View>

        {/* ===== Card: Detalle daño / parte / causa ===== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Detalle de daño / parte</Text>

          {codigos?.Descript ? (
            <View style={styles.block}>
              <Text style={styles.infoLabel}>Descripción del ítem</Text>
              <Text style={styles.infoValue}>{codigos.Descript}</Text>
            </View>
          ) : null}

          <View style={styles.chipBlock}>
            <Text style={styles.infoLabel}>Daño</Text>
            <View style={styles.chipRowWrap}>
              <View style={styles.chip}><Text style={styles.chipText}>Tipo: {codigos?.DCatTyp || '—'}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Grupo: {codigos?.DCodegrp || '—'}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Código: {codigos?.DCode || '—'}</Text></View>
            </View>
          </View>

          <View style={styles.chipBlock}>
            <Text style={styles.infoLabel}>Parte dañada</Text>
            <View style={styles.chipRowWrap}>
              <View style={styles.chip}><Text style={styles.chipText}>Tipo: {codigos?.DlCatTyp || '—'}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Grupo: {codigos?.DlCodegrp || '—'}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Código: {codigos?.DlCode || '—'}</Text></View>
            </View>
          </View>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 16, paddingBottom: 24 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, color: COLORS.text, fontSize: 13 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingVertical: 4 },
  backText: { marginLeft: 4, color: COLORS.accent, fontWeight: '600', fontSize: 13 },

  cardHighlight: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  mainTitle: { fontSize: 16, fontWeight: '700', color: COLORS.title, marginBottom: 4 },
  subtitle: { fontSize: 13, color: COLORS.text },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8, gap: 6 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.chipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 11, color: COLORS.title },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.title, marginBottom: 10 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoItem: { width: '48%' },
  infoItemFull: { width: '100%' },
  infoLabel: { fontSize: 11, color: COLORS.text, opacity: 0.8, marginBottom: 2 },
  infoValue: { fontSize: 14, color: COLORS.title, fontWeight: '600' },
  block: { marginBottom: 10 },
  chipBlock: { marginTop: 6 },

  btnSecondary: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  btnSecondaryText: { color: COLORS.accent, fontWeight: '800', fontSize: 13 },
});
