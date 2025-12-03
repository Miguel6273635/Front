import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Header from '../../../../../src/components/Header';
import Footer from '../../../../../src/components/Footer';

export default function SelectorMantenimiento() {
  const { orderId } = useLocalSearchParams();
  const go = (tipo) => router.push({ pathname: `/tecnico/ordenes/${orderId}/mantenimiento/form`, params: { tipo } });

  return (
    <View style={{ flex: 1, backgroundColor: '#F7F7F9' }}>
      <Header title={`Mantenimiento #${orderId}`} />
      <View style={styles.body}>
        <Text style={styles.h1}>¿Qué equipo vas a registrar?</Text>
        <TouchableOpacity style={styles.btn} onPress={() => go('elevador')}>
          <Text style={styles.btnText}>Elevador</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#a10000' }]} onPress={() => go('escalera')}>
          <Text style={styles.btnText}>Escalera eléctrica</Text>
        </TouchableOpacity>
      </View>
      <Footer />
    </View>
  );
}
const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  h1: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  btn: { backgroundColor: '#0A84FF', padding: 16, borderRadius: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '900' }
});
