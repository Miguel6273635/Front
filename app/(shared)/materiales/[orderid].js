import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert } from 'react-native';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import api from '../../../src/services/api';
import { useAuth } from '../../../src/context/AuthContext';
import { useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function DetalleMateriales() {
  const { token } = useAuth();
  const { orderid } = useLocalSearchParams();

  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMateriales = async () => {
    try {
      const res = await api.get(`/ordenes/${orderid}/materiales`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // res.data: [{ id, activity, subactivity, description, materiales: [...] }, ...]
      setOps(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error al cargar materiales:', error?.message);
      Alert.alert('Error', 'No se pudieron cargar los materiales.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMateriales();
  }, [orderid]);

  const generarPDF = async () => {
    try {
      const response = await api.get(`/ordenes/${orderid}/materiales/html`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { uri } = await Print.printToFileAsync({ html: response.data });
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error('Error al generar PDF:', error?.message);
      Alert.alert('Error', 'No se pudo generar el PDF.');
    }
  };

  const renderMaterial = (mat, idx) => (
    <View key={idx} style={styles.matCard}>
      <Text style={styles.matRow}><Text style={styles.bold}>Nombre:</Text> {mat.nombre}</Text>
      {!!mat.codigo && <Text style={styles.matRow}><Text style={styles.bold}>Código:</Text> {mat.codigo}</Text>}
      <Text style={styles.matRow}><Text style={styles.bold}>Unidad:</Text> {mat.unidad || '-'}</Text>
      <Text style={styles.matRow}><Text style={styles.bold}>Cantidad:</Text> {mat.cantidad}</Text>
      {!!mat.comentarios && <Text style={styles.matRow}><Text style={styles.bold}>Comentarios:</Text> {mat.comentarios}</Text>}
      
    </View>
  );

  const renderOperacion = ({ item, index }) => (
    <View style={styles.opCard}>
      <Text style={styles.opTitle}>#{index + 1} • {item.activity} {item.subactivity ? `· ${item.subactivity}` : ''}</Text>
      {!!item.description && <Text style={styles.opDesc}>{item.description}</Text>}

      <Text style={styles.subheader}>Materiales</Text>
      {item.materiales?.length > 0 ? (
        item.materiales.map(renderMaterial)
      ) : (
        <Text style={{ color: '#666' }}>Sin materiales</Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
      <Header title={`Materiales — Orden ${orderid}`} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#a10000" />
      ) : (
        <FlatList
          data={ops}
          keyExtractor={(item) => item.id?.toString()}
          renderItem={renderOperacion}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#777' }}>Esta orden no tiene operaciones con materiales.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.pdfBtn} onPress={generarPDF}>
        <Text style={styles.pdfText}>📄 Generar PDF</Text>
      </TouchableOpacity>

      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  opCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  opTitle: { fontWeight: 'bold', fontSize: 16, color: '#a10000' },
  opDesc: { color: '#333', marginTop: 6 },
  subheader: { marginTop: 10, marginBottom: 6, fontWeight: '700', color: '#222' },

  matCard: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 8,
    padding: 10, marginBottom: 8, backgroundColor: '#fafafa',
  },
  matRow: { color: '#444', marginVertical: 2 },
  bold: { fontWeight: '700', color: '#222' },

  pdfBtn: {
    position: 'absolute', bottom: 80, right: 16,
    backgroundColor: '#a10000', paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 10, elevation: 2,
  },
  pdfText: { color: '#fff', fontWeight: 'bold' },
});
