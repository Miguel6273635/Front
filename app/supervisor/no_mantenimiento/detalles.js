import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable,
  Modal, FlatList, TextInput, Alert
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

export default function DetallesNoMantenimiento() {
  const { id } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [carta, setCarta] = useState(null);

  const [modal, setModal] = useState(false);
  const [loadingCausas, setLoadingCausas] = useState(false);
  const [saving, setSaving] = useState(false);

  const [causas, setCausas] = useState([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null); // {clave, causa, responsable}

  const causaAsignada = carta?.causa_clave !== null && carta?.causa_clave !== undefined;

  const fetchDetalle = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/carta-no-mantenimiento/supervisor/detalle/${id}`);
      setCarta(data?.data || null);
    } catch (e) {
      console.error('Error detalle:', e?.response?.data || e.message);
      setCarta(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchCausas = async () => {
    try {
      setLoadingCausas(true);
      const { data } = await api.get('/carta-no-mantenimiento/causas');
      setCausas(data?.data || []);
    } catch (e) {
      console.error('Error causas:', e?.response?.data || e.message);
      setCausas([]);
      Alert.alert('Error', 'No se pudo cargar el catálogo de causas.');
    } finally {
      setLoadingCausas(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetalle();
  }, [id]);

  const openModal = async () => {
    if (causaAsignada) return;
    setSelected(null);
    setQ('');
    setModal(true);
    await fetchCausas();
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return causas;
    return causas.filter((c) => String(c?.causa || '').toLowerCase().includes(s));
  }, [q, causas]);

  const asignar = async () => {
    if (!selected?.clave) {
        Alert.alert('Falta selección', 'Selecciona una causa.');
        return;
    }

    try {
        setSaving(true);

        const resp = await api.post('/carta-no-mantenimiento/supervisor/asignar-causa', {
        cartaId: Number(id),
        causaClave: String(selected.clave),
        });

        if (!resp?.data?.ok) throw new Error(resp?.data?.error || 'No se pudo asignar');

        setModal(false);

        // ✅ redirigir al index y pedir refresh
        router.replace({
        pathname: '/supervisor/no_mantenimiento',
        params: { refresh: String(Date.now()) },
        });

    } catch (e) {
        const msg =
        e?.response?.data?.error ||
        e?.message ||
        'No se pudo asignar la causa.';
        Alert.alert('Error', msg);
    } finally {
        setSaving(false);
    }
  };


  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle No mantenimiento" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={{ marginTop: 8, color: COLORS.text }}>Cargando…</Text>
        </View>
        
      </View>
    );
  }

  if (!carta) {
    return (
      <View style={styles.container}>
        <Header title="Detalle No mantenimiento" />
        <View style={styles.center}>
          <Text style={{ color: COLORS.text }}>No se encontró la carta.</Text>
        </View>
       
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title={`Orden ${carta.orderid}`} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.h}>Datos</Text>
          <Text style={styles.line}><Text style={styles.b}>Equipo: </Text>{carta.equipment || '—'}</Text>
          <Text style={styles.line}><Text style={styles.b}>Cliente: </Text>{carta.razon_social || '—'}</Text>
          <Text style={styles.line}><Text style={styles.b}>Dirección: </Text>{carta.direccion || '—'}</Text>
          <Text style={styles.line}><Text style={styles.b}>Mecánico: </Text>{carta.mecanico_nombre || '—'}</Text>
          <Text style={styles.line}><Text style={styles.b}>Mes afecto: </Text>{carta.mes_afecto || '—'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h}>Descripción concreta</Text>
          <Text style={[styles.line, { marginTop: 8 }]}>{carta.descripcion_concreta || '—'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h}>Causa asignada</Text>

          <Text style={[styles.line, { marginTop: 8 }]}>
            {causaAsignada ? (carta.causa_texto || String(carta.causa_clave)) : 'No se ha asignado causa'}
          </Text>

          <Pressable
            onPress={openModal}
            disabled={causaAsignada}
            style={({ pressed }) => [
              styles.btn,
              causaAsignada && { opacity: 0.55 },
              pressed && !causaAsignada && { transform: [{ scale: 0.99 }], opacity: 0.95 },
            ]}
          >
            <Ionicons name="list-outline" size={18} color="#FFF" />
            <Text style={styles.btnText}>
              {causaAsignada ? 'Causa ya asignada' : 'Asignar causa'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* MODAL */}
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecciona causa</Text>
              <Pressable onPress={() => setModal(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.title} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={COLORS.text} style={{ marginRight: 6 }} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Buscar…"
                placeholderTextColor="#8A96A3"
                style={{ flex: 1, color: COLORS.title }}
              />
            </View>

            {loadingCausas ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={{ marginTop: 8, color: COLORS.text }}>Cargando…</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(it) => String(it.clave)}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const active = String(selected?.clave) === String(item.clave);
                  return (
                    <Pressable
                      onPress={() => setSelected(item)} // selección única
                      style={[styles.option, active && styles.optionActive]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '900', color: COLORS.title }}>
                          {item.causa}
                        </Text>
                        <Text style={{ marginTop: 2, color: COLORS.text, fontSize: 11 }}>
                          Clave: {item.clave} · {item.responsable}
                        </Text>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={18} color="#9AA5B1" />
                      )}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ color: COLORS.text, textAlign: 'center', marginTop: 10 }}>
                    No hay resultados.
                  </Text>
                }
              />
            )}

            <View style={styles.modalFooter}>
              <Pressable style={styles.btnGhost} onPress={() => setModal(false)} disabled={saving}>
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[styles.btnSave, (!selected || saving) && { opacity: 0.6 }]}
                disabled={!selected || saving}
                onPress={asignar}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.btnSaveText}>Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

     
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backText: { color: COLORS.accent, fontWeight: '900' },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  h: { fontSize: 15, fontWeight: '900', color: COLORS.title },
  line: { color: COLORS.text, marginTop: 6, fontSize: 13 },
  b: { color: COLORS.title, fontWeight: '900' },

  btn: {
    marginTop: 12,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: { color: '#FFF', fontWeight: '900' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 15, fontWeight: '900', color: COLORS.title },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  optionActive: { borderColor: COLORS.accent, backgroundColor: '#F2F8FF' },

  modalFooter: { marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { color: COLORS.title, fontWeight: '900' },
  btnSave: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.accent, minWidth: 110, alignItems: 'center' },
  btnSaveText: { color: '#FFF', fontWeight: '900' },
});
