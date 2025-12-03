// app/tecnico/ordenes/[orderid]/carta-no-mantenimiento.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Modal
} from 'react-native';
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';
import { useLocalSearchParams, router } from 'expo-router';
import {
  fetchDatosNoMantenimiento,
  fetchCausasNoMantenimiento,
  guardarCartaNoMantenimiento
} from '../../../../src/services/noMantenimiento';

function Row({ label, value }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}>
        <Text style={styles.readonlyText}>{String(value ?? '—')}</Text>
      </View>
    </View>
  );
}

function Chip({ active, children, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{children}</Text>
    </TouchableOpacity>
  );
}

/** Selección ÚNICA + vista completa en modal */
function SelectCausas({ options, selected, onSelect }) {
  const [showModal, setShowModal] = useState(false);
  const [q, setQ] = useState('');

  const filtered = options.filter(o => {
    const claveStr = String(o.clave).padStart(3, '0');
    const txt = (o.causa ?? '') + ' ' + (o.responsable ?? '') + ' ' + claveStr;
    return txt.toLowerCase().includes(q.trim().toLowerCase());
  });

  const preview = options.slice(0, 6); // mostramos pocas en tarjeta y abrimos modal para ver todas

  const handleTapChip = (clave) => {
    if (selected === clave) onSelect(null); // deseleccionar
    else onSelect(clave);                    // seleccionar única
  };

  return (
    <View>
      <Text style={styles.label}>Causa – selecciona sólo una</Text>

      {/* Chips (selección rápida por clave) */}
      <View style={styles.chipsWrap}>
        {options.map(opt => {
          const claveStr = String(opt.clave);
          const isOn = selected === claveStr;
          return (
            <Chip key={opt.clave} active={isOn} onPress={() => handleTapChip(claveStr)}>
              {String(opt.clave).padStart(3, '0')}
            </Chip>
          );
        })}
      </View>
      <Text style={styles.helper}>* Toca para activar/desactivar. Sólo puedes tener una causa seleccionada.</Text>

      {/* Detalle (preview corto) */}
      <View style={[styles.cardLight, { marginTop: 10 }]}>
        <Text style={{ fontWeight: '800', marginBottom: 6 }}>Detalle (vista previa)</Text>
        <View>
          {preview.map(opt => (
            <Text key={`pv-${opt.clave}`} style={{ marginBottom: 6 }}>
              <Text style={{ fontWeight: '800' }}>{String(opt.clave).padStart(3, '0')}</Text>{' '}
              <Text style={{ color: '#4b5563' }}>{opt.responsable}</Text>{' '}
              <Text>{opt.causa}</Text>
            </Text>
          ))}
          {options.length > preview.length && (
            <TouchableOpacity onPress={() => setShowModal(true)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Ver todas las causas</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* MODAL: listado completo con buscador y selección */}
      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ padding: 16, paddingTop: 20, borderBottomWidth: 1, borderColor: '#e5e7eb' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Todas las causas</Text>
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder="Buscar por clave, responsable o causa…"
              value={q}
              onChangeText={setQ}
              autoCorrect={false}
            />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {filtered.length === 0 && (
              <Text style={{ color: '#6b7280' }}>No hay resultados para “{q}”.</Text>
            )}

            {filtered.map(opt => {
              const claveStr = String(opt.clave);
              const isOn = selected === claveStr;
              return (
                <TouchableOpacity
                  key={`full-${opt.clave}`}
                  onPress={() => { onSelect(claveStr); setShowModal(false); }}
                  style={[styles.rowItem, isOn && styles.rowItemOn]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.radio, isOn && styles.radioOn]} />
                    <Text style={{ fontWeight: '800', marginLeft: 8 }}>
                      {String(opt.clave).padStart(3, '0')}
                    </Text>
                  </View>
                  <Text style={{ color: '#4b5563', marginTop: 4 }}>{opt.responsable}</Text>
                  <Text style={{ marginTop: 2 }}>{opt.causa}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#e5e7eb' }}>
            <TouchableOpacity onPress={() => setShowModal(false)} style={styles.outlineBtn}>
              <Text style={styles.outlineBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function CartaNoMantenimientoForm() {
  const { orderid } = useLocalSearchParams(); // ruta: /tecnico/ordenes/[orderid]/carta-no-mantenimiento
  const [loading, setLoading] = useState(true);
  const [datos, setDatos] = useState(null);
  const [causas, setCausas] = useState([]);

  // Campos editables:
  const [claveSeleccionada, setClaveSeleccionada] = useState(null); // '1' | null
  const [mesAfecto, setMesAfecto] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const fechaProgramadaDDMMYYYY = useMemo(() => {
    if (!datos?.StartDate) return '';
    const d = new Date(datos.StartDate);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, [datos]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [d, c] = await Promise.all([
          fetchDatosNoMantenimiento(String(orderid)),
          fetchCausasNoMantenimiento()
        ]);
        if (!alive) return;
        setDatos(d);
        setCausas(c);

        // Prellenar "mes afecto" con el mes del StartDate
        if (d?.StartDate) {
          const dt = new Date(d.StartDate);
          const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
          setMesAfecto(`${meses[dt.getMonth()]} ${dt.getFullYear()}`);
        }
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
    if (!claveSeleccionada) return Alert.alert('Falta información', 'Selecciona una causa.');
    if (!mesAfecto.trim()) return Alert.alert('Falta información', 'Captura el mes afectado.');
    if (!descripcion.trim()) return Alert.alert('Falta información', 'Captura la descripción concreta.');

    const payload = {
      orderid: datos.Orderid,
      equipment: datos.Equipment,
      fecha_programada: datos.StartDate, // ISO del backend
      razon_social: datos.razon_social,
      direccion: datos.direccion,
      mecanico: { nomina: datos.nomina, nombre: datos.nombre },
      causas_claves: [Number(claveSeleccionada)], // siempre arreglo de 1 elemento
      mes_afecto: mesAfecto,
      descripcion_concreta: descripcion
    };

    try {
      const res = await guardarCartaNoMantenimiento(payload);
      Alert.alert('Listo', `Carta guardada (id: ${res?.id ?? '—'}).`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo guardar la carta.');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!datos) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No hay datos para la orden.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Carta de no mantenimiento" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* AUTOLLENADO */}
        <Text style={styles.section}>Datos</Text>
        <View style={styles.card}>
          <Row label="MX"               value={datos.Orderid} />
          <Row label="Equipo No"        value={datos.Equipment} />
          <Row label="Fecha programada" value={fechaProgramadaDDMMYYYY} />
          <Row label="Razón social"     value={datos.razon_social} />
          <Row label="Dirección"        value={datos.direccion} />
          <Row label="Mecánico a cargo" value={`${datos.nomina ?? ''} - ${datos.nombre ?? ''}`} />
        </View>

        {/* CAUSAS */}
        <Text style={styles.section}>Causas</Text>
        <View style={styles.card}>
          <SelectCausas
            options={causas}
            selected={claveSeleccionada}
            onSelect={setClaveSeleccionada}
          />
        </View>

        {/* MES AFECTO */}
        <Text style={styles.section}>Afectación</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Afectó al mantenimiento correspondiente al del mes de:</Text>
          <TextInput
            style={styles.input}
            placeholder="EJ. SEPTIEMBRE 2025"
            value={mesAfecto}
            onChangeText={setMesAfecto}
            autoCapitalize="characters"
          />
        </View>

        {/* DESCRIPCIÓN */}
        <Text style={styles.section}>Descripción concreta de la causa</Text>
        <View style={styles.card}>
          <TextInput
            style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
            placeholder="Escribe la descripción..."
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />
        </View>

        <TouchableOpacity style={styles.primary} onPress={onGuardar}>
          <Text style={styles.primaryText}>Guardar</Text>
        </TouchableOpacity>
      </ScrollView>
      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, fontSize: 18, fontWeight: '800', color: '#1f2937' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 10,
    borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1
  },
  cardLight: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
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
  helper: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  primary: { marginTop: 20, backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  /* Modal list */
  rowItem: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    padding: 12, marginBottom: 10, backgroundColor: '#fff'
  },
  rowItemOn: {
    borderColor: '#111827',
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, elevation: 2
  },
  radio: {
    width: 18, height: 18, borderRadius: 999,
    borderWidth: 2, borderColor: '#9ca3af', backgroundColor: '#fff'
  },
  radioOn: { borderColor: '#111827', backgroundColor: '#111827' },

  outlineBtn: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', backgroundColor: '#fff'
  },
  outlineBtnText: { fontWeight: '800', color: '#111827' },

  secondaryBtn: {
    marginTop: 8, alignSelf: 'flex-start',
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: '#111827'
  },
  secondaryBtnText: { color: '#fff', fontWeight: '800' }
});
