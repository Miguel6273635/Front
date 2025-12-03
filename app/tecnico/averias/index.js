import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import { router } from 'expo-router';
import { listAvisos, STATUS_COLORS } from '../../../src/store/avisosStore';
import { Ionicons } from '@expo/vector-icons';

function formatDate(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const StatusPill = ({ status }) => (
  <View style={[styles.pill, { backgroundColor: STATUS_COLORS[status] || '#999' }]}>
    <Text style={styles.pillText}>{status}</Text>
  </View>
);

export default function AveriaIndex() {
  const [data, setData] = useState([]);

  useEffect(() => {
    setData(listAvisos());
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/tecnico/averias/${item.id}`)}>
      <View style={styles.cardTop}>
        <Text style={styles.cardId}>{item.id}</Text>
        <StatusPill status={item.status} />
      </View>
      <Text style={styles.cardTitle}>{item.cliente?.razonSocial || '—'}</Text>
      <Text style={styles.cardSub}>Fecha: {formatDate(item.fechaISO)}</Text>
      <Text style={styles.cardSub}>Ubicación: {item.cliente?.cobertura || '—'}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="Avisos de avería" />
      <View style={styles.content}>
        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 40 }}>No hay avisos aún.</Text>}
        />
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/tecnico/averias/crear')}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F9' },
  content: { flex: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee'
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardId: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  cardTitle: { marginTop: 6, fontSize: 16, fontWeight: '600', color: '#111' },
  cardSub: { marginTop: 2, color: '#666' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  fab: {
    position: 'absolute', right: 20, bottom: 90,
    backgroundColor: 'red', width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', elevation: 3
  }
});
