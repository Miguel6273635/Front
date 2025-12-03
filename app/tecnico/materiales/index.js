import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import api from '../../../src/services/api';
import { useAuth } from '../../../src/context/AuthContext';
import { router } from 'expo-router';

export default function ListaOrdenesMateriales() {
  const { token } = useAuth();
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrdenes = async () => {
    try {
      const res = await api.get('/ordenes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrdenes(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error al cargar órdenes:', error?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdenes();
  }, []);

  const renderItem = ({ item }) => {
    const color =
      item.estatus === 'pendiente' ? '#d32f2f' :
      item.estatus === 'en_proceso' ? '#fbc02d' : '#388e3c';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/ordenes/${item.Orderid}`)} // <-- ruta correcta
      >
        <View style={styles.row}>
          <Text style={styles.title}>#{item.Orderid} • {item.order_type}</Text>
          <View style={[styles.dot, { backgroundColor: color }]} />
        </View>
        <Text style={styles.label}>Equipo: {item.equipment}</Text>
        <Text style={styles.label}>Inicio: {item.start_date ? new Date(item.start_date).toLocaleDateString() : '-'}</Text>
        <Text style={styles.label}>Fin: {item.finish_date ? new Date(item.finish_date).toLocaleDateString() : '-'}</Text>
        <Text style={styles.label}>Estatus: {item.estatus || '—'}</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => router.push(`/materiales/${item.Orderid}`)}
            style={styles.btn}
          >
            <Text style={styles.btnText}>Ver materiales</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
      <Header title="Órdenes (Materiales)" />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#a10000" />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(item) => item.Orderid?.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#777' }}>No hay órdenes disponibles.</Text>
            </View>
          }
        />
      )}
      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: 'bold', fontSize: 16, color: '#a10000' },
  label: { fontSize: 14, color: '#444', marginTop: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, marginLeft: 10 },
  actions: { marginTop: 10, alignItems: 'flex-end' },
  btn: {
    backgroundColor: '#a10000',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: 'bold' },
});
