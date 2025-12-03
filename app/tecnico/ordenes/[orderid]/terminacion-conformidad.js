// Reporte de terminación y conformidad de servicios realizados
// - 100% local (sin backend)
// - Fecha con DatePicker; Entrada/Salida con TimePicker
// - Listas dinámicas: Mecánicos, Refacciones
// - Borradores en AsyncStorage
// - onGuardarLocal(): imprime JSON resultante

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams } from 'expo-router';

// Ajusta a tu proyecto:
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';

function LabeledInput({ label, value, onChangeText, placeholder, multiline=false, editable=true, keyboardType="default" }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && { height: 120, textAlignVertical: 'top' },
          !editable && styles.readonly
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        editable={editable}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function ChipsYesNo({ label, value, onChange }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipsWrap}>
        {['Sí', 'No'].map(opt => {
          const active = value === opt;
          return (
            <TouchableOpacity key={opt} onPress={() => onChange(opt)} style={[styles.chip, active && styles.chipOn]}>
              <Text style={[styles.chipText, active && styles.chipTextOn]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Helpers
const pad2 = n => String(n).padStart(2, '0');
const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const formatDMY_Long = d => `${pad2(d.getDate())} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
const formatTimeHM = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const newMecanico = () => ({ nombre: '' });
const newRef = () => ({ cantidad: '', descripcion: '', codigoInterno: '' });

export default function TermConformidadForm() {
  const { orderid } = useLocalSearchParams();
  const draftKey = useMemo(() => `terminacion_conformidad:${orderid ?? 'local'}`, [orderid]);

  // ===== Fecha =====
  const [fecha, setFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ===== Mantenimiento correctivo efectuado en =====
  const [mx, setMx] = useState('');
  const [cotizacion, setCotizacion] = useState('');
  const [nombre, setNombre] = useState('');      // Razón social / Nombre
  const [direccion, setDireccion] = useState('');
  const [noElevador, setNoElevador] = useState('');

  // ===== Horario =====
  const [horaEntrada, setHoraEntrada] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [showEntradaPicker, setShowEntradaPicker] = useState(false);
  const [showSalidaPicker, setShowSalidaPicker] = useState(false);

  // ===== Mecánicos =====
  const [mecanicos, setMecanicos] = useState([newMecanico()]);
  const addMecanico = () => setMecanicos(p => [...p, newMecanico()]);
  const removeMecanico = (idx) => setMecanicos(p => p.filter((_, i) => i !== idx));
  const updateMecanico = (idx, val) => setMecanicos(p => p.map((m, i) => i === idx ? { nombre: val } : m));

  // ===== Chapas y llaves KABA =====
  const [deptoKaba, setDeptoKaba] = useState('');

  // ===== Descripción general del trabajo =====
  const [descripcionTrabajo, setDescripcionTrabajo] = useState('');

  // ===== Refacciones utilizadas =====
  const [refacciones, setRefacciones] = useState([newRef(), newRef()]);
  const addRef = () => setRefacciones(p => [...p, newRef()]);
  const removeRef = (idx) => setRefacciones(p => p.filter((_, i) => i !== idx));
  const updateRef = (idx, field, val) => setRefacciones(p => p.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  // ===== Notas =====
  const [notas, setNotas] = useState('');

  // ===== Conformidad cliente =====
  const [entregoRefUsadas, setEntregoRefUsadas] = useState('No'); // Sí | No
  const [nombreCliente, setNombreCliente] = useState('');
  const [puestoCliente, setPuestoCliente] = useState('');
  const [firmaCliente, setFirmaCliente] = useState('');

  // ===== Borradores =====
  const loadDraft = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(draftKey);
      if (!s) return;
      const d = JSON.parse(s);
      if (d.fecha) setFecha(new Date(d.fecha));
      setMx(d.mx ?? ''); setCotizacion(d.cotizacion ?? ''); setNombre(d.nombre ?? '');
      setDireccion(d.direccion ?? ''); setNoElevador(d.noElevador ?? '');
      setHoraEntrada(d.horaEntrada ?? ''); setHoraSalida(d.horaSalida ?? '');
      setMecanicos(Array.isArray(d.mecanicos) && d.mecanicos.length ? d.mecanicos : [newMecanico()]);
      setDeptoKaba(d.deptoKaba ?? '');
      setDescripcionTrabajo(d.descripcionTrabajo ?? '');
      setRefacciones(Array.isArray(d.refacciones) && d.refacciones.length ? d.refacciones : [newRef()]);
      setNotas(d.notas ?? '');
      setEntregoRefUsadas(d.entregoRefUsadas ?? 'No');
      setNombreCliente(d.nombreCliente ?? ''); setPuestoCliente(d.puestoCliente ?? ''); setFirmaCliente(d.firmaCliente ?? '');
      Alert.alert('Borrador cargado', 'Se cargaron los datos guardados localmente.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo cargar el borrador.');
    }
  }, [draftKey]);

  useEffect(() => { loadDraft(); }, []);

  const saveDraft = useCallback(async () => {
    const payload = {
      fecha: fecha.toISOString(),
      mx, cotizacion, nombre, direccion, noElevador,
      horaEntrada, horaSalida,
      mecanicos,
      deptoKaba,
      descripcionTrabajo,
      refacciones,
      notas,
      entregoRefUsadas,
      nombreCliente, puestoCliente, firmaCliente,
    };
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(payload));
      Alert.alert('Borrador guardado', 'Se guardó localmente en el dispositivo.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo guardar el borrador.');
    }
  }, [draftKey, fecha, mx, cotizacion, nombre, direccion, noElevador, horaEntrada, horaSalida, mecanicos, deptoKaba, descripcionTrabajo, refacciones, notas, entregoRefUsadas, nombreCliente, puestoCliente, firmaCliente]);

  // ===== Validación mínima =====
  const validar = () => {
    if (!mx.trim()) return 'Falta MX.';
    if (!nombre.trim()) return 'Falta Nombre/Razón social.';
    if (!direccion.trim()) return 'Falta Dirección.';
    if (!horaEntrada.trim()) return 'Falta Hora de entrada.';
    if (!horaSalida.trim()) return 'Falta Hora de salida.';
    if (!descripcionTrabajo.trim()) return 'Falta Descripción general del trabajo.';
    return null;
  };

  // ===== Date/Time Pickers =====
  const onChangeDate = (_e, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setFecha(selectedDate);
  };
  const onChangeTime = (setter, closer) => (_e, selectedDate) => {
    if (Platform.OS === 'android') closer(false);
    if (selectedDate) setter(formatTimeHM(selectedDate));
  };

  // ===== Guardar (simulado) =====
  const onGuardarLocal = () => {
    const err = validar();
    if (err) return Alert.alert('Validación', err);

    const mecanicosLimpios = mecanicos
      .map(m => (m?.nombre || '').trim())
      .filter(Boolean)
      .map(nombre => ({ nombre }));

    const output = {
      fecha: {
        iso: fecha.toISOString(),
        texto: formatDMY_Long(fecha), // "DD de mes de AAAA"
      },
      mantenimientoCorrectivoEn: {
        mx, cotizacion, nombre, direccion, noElevador,
      },
      horario: {
        entrada: horaEntrada, salida: horaSalida
      },
      mecanicos: mecanicosLimpios,
      chapasLlavesKaba: { noDepto: deptoKaba },
      descripcionGeneralTrabajo: descripcionTrabajo,
      refaccionesUtilizadas: refacciones.map(r => ({
        cantidad: r.cantidad,
        descripcion: r.descripcion,
        codigoInterno: r.codigoInterno
      })),
      notas,
      conformidadCliente: {
        refaccionesEntregadas: entregoRefUsadas, // "Sí" | "No"
        nombre: nombreCliente,
        puesto: puestoCliente,
        firma: firmaCliente
      }
    };

    console.log('TERMINACION_CONFORMIDAD_OUTPUT =>', JSON.stringify(output, null, 2));
    Alert.alert('Datos listos', 'Se generó el objeto local (revisa la consola).');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Terminación y conformidad de servicios" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {/* FECHA */}
        <Text style={styles.section}>Fecha</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Selecciona la fecha</Text>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.pickerBox}>
            <Text style={styles.pickerText}>{formatDMY_Long(fecha)}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={fecha}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeDate}
            />
          )}
        </View>

        {/* MANTENIMIENTO CORRECTIVO EFECTUADO EN */}
        <Text style={styles.section}>Mantenimiento correctivo efectuado en</Text>
        <View style={styles.card}>
          <LabeledInput label="MX" value={mx} onChangeText={setMx} placeholder="MX..." />
          <LabeledInput label="No. de cotización" value={cotizacion} onChangeText={setCotizacion} placeholder="CTZ-..." />
          <LabeledInput label="Nombre / Razón social" value={nombre} onChangeText={setNombre} placeholder="Cliente" />
          <LabeledInput label="Dirección" value={direccion} onChangeText={setDireccion} placeholder="Calle, No., Col., Ciudad..." />
          <LabeledInput label="No. Elevador" value={noElevador} onChangeText={setNoElevador} placeholder="1" keyboardType="numeric" />
        </View>

        {/* HORARIO */}
        <Text style={styles.section}>Horario</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Entrada</Text>
          <TouchableOpacity onPress={() => setShowEntradaPicker(true)} style={styles.pickerBox}>
            <Text style={styles.pickerText}>{horaEntrada || 'HH:MM'}</Text>
          </TouchableOpacity>
          {showEntradaPicker && (
            <DateTimePicker
              value={new Date()}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeTime(setHoraEntrada, setShowEntradaPicker)}
            />
          )}

          <Text style={[styles.label, { marginTop: 12 }]}>Salida</Text>
          <TouchableOpacity onPress={() => setShowSalidaPicker(true)} style={styles.pickerBox}>
            <Text style={styles.pickerText}>{horaSalida || 'HH:MM'}</Text>
          </TouchableOpacity>
          {showSalidaPicker && (
            <DateTimePicker
              value={new Date()}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeTime(setHoraSalida, setShowSalidaPicker)}
            />
          )}
        </View>

        {/* MECÁNICOS */}
        <Text style={styles.section}>Mecánicos</Text>
        <View style={styles.card}>
          {mecanicos.map((m, idx) => (
            <View key={idx} style={styles.rowCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.rowTitle}>Mecánico {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeMecanico(idx)}>
                  <Text style={styles.removeTxt}>Eliminar</Text>
                </TouchableOpacity>
              </View>
              <LabeledInput label="Nombre" value={m.nombre} onChangeText={v => updateMecanico(idx, v)} placeholder="Nombre del mecánico" />
            </View>
          ))}
          <TouchableOpacity style={styles.secondary} onPress={addMecanico}>
            <Text style={styles.secondaryText}>+ Agregar mecánico</Text>
          </TouchableOpacity>
        </View>

        {/* CHAPAS Y LLAVES KABA */}
        <Text style={styles.section}>Chapas y llaves KABA</Text>
        <View style={styles.card}>
          <LabeledInput label="No. Depto" value={deptoKaba} onChangeText={setDeptoKaba} placeholder="Depto..." />
        </View>

        {/* DESCRIPCIÓN GENERAL DEL TRABAJO */}
        <Text style={styles.section}>Descripción general del trabajo</Text>
        <View style={styles.card}>
          <LabeledInput label="Descripción" value={descripcionTrabajo} onChangeText={setDescripcionTrabajo} placeholder="Detalle del trabajo realizado..." multiline />
        </View>

        {/* REFACCIONES UTILIZADAS */}
        <Text style={styles.section}>Refacciones utilizadas</Text>
        <View style={styles.card}>
          {refacciones.map((r, idx) => (
            <View key={idx} style={styles.rowCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.rowTitle}>Línea {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeRef(idx)}>
                  <Text style={styles.removeTxt}>Eliminar</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.grid2}>
                <LabeledInput label="Cantidad" value={r.cantidad} onChangeText={v => updateRef(idx, 'cantidad', v)} placeholder="1" keyboardType="numeric" />
                <LabeledInput label="Código interno" value={r.codigoInterno} onChangeText={v => updateRef(idx, 'codigoInterno', v)} placeholder="200-..." />
              </View>
              <LabeledInput label="Descripción" value={r.descripcion} onChangeText={v => updateRef(idx, 'descripcion', v)} placeholder="Refacción..." />
            </View>
          ))}
          <TouchableOpacity style={styles.secondary} onPress={addRef}>
            <Text style={styles.secondaryText}>+ Agregar refacción</Text>
          </TouchableOpacity>
        </View>

        {/* NOTAS */}
        <Text style={styles.section}>Notas</Text>
        <View style={styles.card}>
          <LabeledInput label="Notas" value={notas} onChangeText={setNotas} placeholder="Observaciones..." multiline />
        </View>

        {/* CONFORMIDAD DEL CLIENTE */}
        <Text style={styles.section}>Conformidad del cliente</Text>
        <View style={styles.card}>
          <ChipsYesNo
            label="¿Las refacciones dañadas le fueron entregadas?"
            value={entregoRefUsadas}
            onChange={setEntregoRefUsadas}
          />
          <LabeledInput label="Nombre" value={nombreCliente} onChangeText={setNombreCliente} placeholder="Nombre del cliente" />
          <LabeledInput label="Puesto" value={puestoCliente} onChangeText={setPuestoCliente} placeholder="Puesto" />
          <LabeledInput label="Firma" value={firmaCliente} onChangeText={setFirmaCliente} placeholder="Firma (texto/ref.)" />
        </View>

        {/* ACCIONES */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <TouchableOpacity style={styles.secondary} onPress={saveDraft}>
            <Text style={styles.secondaryText}>Guardar borrador</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primary} onPress={onGuardarLocal}>
            <Text style={styles.primaryText}>Guardar (local)</Text>
          </TouchableOpacity>
        </View>
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
  label: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#fff', fontSize: 16, color: '#111827'
  },
  readonly: { backgroundColor: '#f3f4f6' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderWidth: 1, borderColor: '#c7cdd6', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { color: '#111827', fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  primary: { backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center', flex: 1 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  secondary: { backgroundColor: '#111827', padding: 16, borderRadius: 14, alignItems: 'center', flex: 1 },
  secondaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  grid2: { flexDirection: 'row', gap: 12 },
  rowCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#fafafa' },
  rowTitle: { fontWeight: '800', color: '#111827', marginBottom: 8 },
  removeTxt: { color: '#b91c1c', fontWeight: '700' },
  pickerBox: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#fff'
  },
  pickerText: { fontSize: 16, color: '#111827' },
});
