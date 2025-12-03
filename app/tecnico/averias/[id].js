import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import { useLocalSearchParams } from 'expo-router';
import { getAviso, STATUS_COLORS } from '../../../src/store/avisosStore';

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value || '—'}</Text>
  </View>
);

export default function AveriaDetalles() {
  const { id } = useLocalSearchParams();
  const aviso = useMemo(() => getAviso(id), [id]);

  if (!aviso) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Aviso de avería" />
        <View style={{ padding: 16 }}><Text>No se encontró el aviso.</Text></View>
        <Footer />
      </View>
    );
  }

  const sColor = STATUS_COLORS[aviso.status] || '#999';

  return (
    <View style={{ flex: 1, backgroundColor: '#F7F7F9' }}>
      <Header title={`Detalle ${aviso.id}`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={styles.badgeWrap}>
          <Text style={[styles.badge, { backgroundColor: sColor }]}>{aviso.status}</Text>
        </View>

        <Text style={styles.section}>Datos del cliente</Text>
        <Row label="Fecha" value={new Date(aviso.fechaISO).toLocaleDateString()} />
        <Row label="Razón social" value={aviso.cliente?.razonSocial} />
        <Row label="MX" value={aviso.cliente?.mx} />
        <Row label="CM" value={aviso.cliente?.cm} />
        <Row label="Dirección" value={aviso.cliente?.direccion} />
        <Row label="Solicitante" value={aviso.cliente?.solicitante} />
        <Row label="Email" value={aviso.cliente?.email} />
        <Row label="Contrato" value={aviso.cliente?.contrato} />
        <Row label="Puesto" value={aviso.cliente?.puesto} />
        <Row label="Teléfono" value={aviso.cliente?.telefono} />
        <Row label="Cobertura" value={aviso.cliente?.cobertura} />

        <Text style={styles.section}>Datos del equipo</Text>
        <Row label="Tipo de equipo" value={(aviso.equipo?.tipo || []).join(', ')} />
        <Row label="Máquina" value={aviso.equipo?.maquina} />
        <Row label="Control" value={aviso.equipo?.control} />
        <Row label="Capacidad" value={aviso.equipo?.capacidad} />
        <Row label="Velocidad" value={aviso.equipo?.velocidad} />
        <Row label="Voltaje" value={aviso.equipo?.voltaje} />
        <Row label="Pisos de servicio" value={aviso.equipo?.pisosServicio} />
        <Row label="Modelo" value={aviso.equipo?.modelo} />
        <Row label="No. de equipo" value={aviso.equipo?.numeroEquipo} />
        <Row label="Ubicación" value={(aviso.equipo?.ubicacion || []).join(', ')} />

        <Text style={styles.section}>Reporte / Especificación de falla</Text>
        <Row label="Observaciones" value={aviso.reporte?.observaciones} />
        <Row label="¿Funcionando?" value={aviso.reporte?.funcionando ? 'Sí' : 'No'} />

        <Text style={styles.section}>Partes electrónicas y/o eléctricas</Text>
        {(aviso.partesElectronicas || []).length === 0 ? (
          <Text style={styles.empty}>Sin registros</Text>
        ) : (
          aviso.partesElectronicas.map((p, i) => (
            <View key={i} style={styles.block}>
              <Row label="Concepto" value={p.concepto} />
              <Row label="No. parte/plano" value={p.partePlano} />
              <Row label="Cantidad" value={String(p.cantidad)} />
              <Row label="Análisis de falla" value={p.analisisFalla} />
            </View>
          ))
        )}

        <Text style={styles.section}>Partes mecánicas y/o reparación mayor</Text>
        {(aviso.partesMecanicas || []).length === 0 ? (
          <Text style={styles.empty}>Sin registros</Text>
        ) : (
          aviso.partesMecanicas.map((p, i) => (
            <View key={i} style={styles.block}>
              <Row label="Concepto" value={p.concepto} />
              <Row label="No. parte/plano" value={p.partePlano} />
              <Row label="Cantidad" value={String(p.cantidad)} />
            </View>
          ))
        )}

        <Text style={styles.section}>Modificación de software</Text>
        <Row label="Cambios requeridos" value={aviso.software?.cambios} />
        <Row label="Concepto" value={aviso.software?.concepto} />

        <Text style={styles.section}>Fotografías</Text>
        {(aviso.fotos || []).length === 0 ? (
          <Text style={styles.empty}>Sin fotos</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {aviso.fotos.map((uri, idx) => (
              <Image key={idx} source={{ uri }} style={styles.photo} />
            ))}
          </ScrollView>
        )}
      </ScrollView>
      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, fontSize: 16, fontWeight: '700', color: '#111' },
  row: { marginTop: 8 },
  label: { fontSize: 12, color: '#666' },
  value: { fontSize: 14, color: '#222', marginTop: 2 },
  empty: { color: '#777', marginTop: 6 },
  block: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, marginTop: 8 },
  photo: { width: 140, height: 140, borderRadius: 10, marginRight: 10, backgroundColor: '#ddd' },
  badgeWrap: { alignItems: 'flex-start' },
  badge: { color: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontWeight: '700' }
});
