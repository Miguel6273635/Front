import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import Header from '../../../../src/components/Header';
import { useLocalSearchParams, router } from 'expo-router';
import { fetchDatosReportePendientes, guardarReportePendientes } from '../../../../src/services/reportePendientes';

function Row({ label, value }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}><Text style={styles.readonlyText}>{String(value ?? '—')}</Text></View>
    </View>
  );
}

function RadioChips({ options, value, onChange }) {
  return (
    <View style={styles.chipsWrap}>
      {options.map(opt => {
        const active = value === opt;
        return (
          <TouchableOpacity key={opt} onPress={() => onChange(opt)} style={[styles.chip, active && styles.chipOn]}>
            <Text style={[styles.chipText, active && styles.chipTextOn]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ReportePendientesForm() {
  const { orderid } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [datos, setDatos] = useState(null);

  // ====== campos que llena el técnico ======
  const [mx, setMx] = useState('');
  const [tipoEquipo, setTipoEquipo] = useState(''); // 'Escalera' | 'Elevador'
  const [fechaReporte, setFechaReporte] = useState(''); // DD/MM/AAAA (prellenada)
  const [fechaEnteradoSMA, setFechaEnteradoSMA] = useState(''); // DD/MM/AAAA
  const [descripcion, setDescripcion] = useState('');
  const [firmaSello, setFirmaSello] = useState(''); // simple texto por ahora

  const fechaHoy = useMemo(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const d = await fetchDatosReportePendientes(String(orderid));
        if (!alive) return;
        setDatos(d);
        setFechaReporte(fechaHoy); // autollenar con fecha actual
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'No se pudieron cargar los datos.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [orderid]);

  const onGuardar = async () => {
    if (!datos) return;
    if (!mx.trim()) return Alert.alert('Falta información', 'Captura el MX.');
    if (!tipoEquipo) return Alert.alert('Falta información', 'Selecciona el tipo de equipo.');
    if (!fechaReporte.trim()) return Alert.alert('Falta información', 'Captura la fecha de reporte.');
    if (!fechaEnteradoSMA.trim()) return Alert.alert('Falta información', 'Captura la fecha de enterado SMA.');
    if (!descripcion.trim()) return Alert.alert('Falta información', 'Captura la descripción del problema / pendiente.');

    // normaliza fechas DD/MM/AAAA -> ISO (opcional); por simplicidad mando el string DD/MM/AAAA
    const payload = {
      orderid: datos.Orderid,                      // No. folio mantto preventivo
      mx,                                          // ingresado por técnico
      equipment: datos.Equipment,                  // No. de equipo
      razon_social: datos.razon_social,
      direccion: datos.direccion,
      telefono: datos.TelNumber,
      tipo_equipo: tipoEquipo,                     // Escalera|Elevador
      fecha_reporte: fechaReporte,                 // DD/MM/AAAA
      mecanico_reporta: datos.nombre,              // de DB
      fecha_enterado_sma: fechaEnteradoSMA,        // DD/MM/AAAA
      descripcion_problema: descripcion,
      firma_sello_sma: firmaSello
    };

    try {
      const res = await guardarReportePendientes(payload);
      Alert.alert('Listo', `Reporte guardado (id: ${res?.id ?? '—'}).`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo guardar el reporte.');
    }
  };

  if (loading) {
    return (
      <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!datos) {
    return (
      <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
        <Text>No hay datos para la orden.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Reporte de pendientes" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* AUTOLLENADO */}
        <Text style={styles.section}>Datos del cliente/orden</Text>
        <View style={styles.card}>
          <Row label="No. folio mantto preventivo" value={datos.Orderid} />
          <Row label="No. de equipo" value={datos.Equipment} />
          <Row label="Razón social" value={datos.razon_social} />
          <Row label="Dirección" value={datos.direccion} />
          <Row label="Teléfono" value={datos.TelNumber} />
        </View>

        {/* CAMPOS DEL TÉCNICO - PARTE SUPERIOR */}
        <Text style={styles.section}>Datos capturados por el técnico</Text>
        <View style={styles.card}>
          <Text style={styles.label}>MX</Text>
          <TextInput style={styles.input} value={mx} onChangeText={setMx} placeholder="MX..." />

          <Text style={[styles.label, { marginTop: 12 }]}>Tipo de equipo</Text>
          <RadioChips
            options={['Escalera', 'Elevador']}
            value={tipoEquipo}
            onChange={setTipoEquipo}
          />
        </View>

        {/* DATOS DEL PENDIENTE (MECÁNICO) */}
        <Text style={styles.section}>Datos del pendiente (mecánico)</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Fecha de reporte (Día/Mes/Año)</Text>
          <TextInput
            style={styles.input}
            value={fechaReporte}
            onChangeText={setFechaReporte}
            placeholder="DD/MM/AAAA"
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Mecánico que reporta</Text>
          <View style={styles.readonly}><Text style={styles.readonlyText}>{datos.nombre ?? '—'}</Text></View>

          <Text style={[styles.label, { marginTop: 12 }]}>Fecha de enterado SMA</Text>
          <TextInput
            style={styles.input}
            value={fechaEnteradoSMA}
            onChangeText={setFechaEnteradoSMA}
            placeholder="DD/MM/AAAA"
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Descripción del problema / pendiente</Text>
          <TextInput
            style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Describe el problema..."
            multiline
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Firma y sello SMA</Text>
          <TextInput
            style={styles.input}
            value={firmaSello}
            onChangeText={setFirmaSello}
            placeholder="(Opcional) Texto o referencia"
          />
        </View>

        <TouchableOpacity style={styles.primary} onPress={onGuardar}>
          <Text style={styles.primaryText}>Guardar reporte</Text>
        </TouchableOpacity>
      </ScrollView>
     
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, fontSize: 18, fontWeight: '800', color: '#1f2937' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 10,
    borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1
  },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  readonly: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#f9fafb' },
  readonlyText: { fontSize: 16, color: '#111827' },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#fff', fontSize: 16, color: '#111827'
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderWidth: 1, borderColor: '#c7cdd6', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { color: '#111827', fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  primary: { marginTop: 20, backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
