// Reporte de emergencia — con Date/Time Picker (Expo / React Native)
// - 100% local (sin backend)
// - Fecha elegible con calendario
// - Horas (entrada/salida/llamada) con time picker
// - Listas dinámicas (mecánicos, refacciones)
// - Borradores en AsyncStorage
// - onGuardarLocal() imprime el JSON final

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, router } from 'expo-router';

// Ajusta estos imports a tu app:
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

// ---------- Helpers de formato ----------
const pad2 = (n) => String(n).padStart(2, '0');
const formatDateDMY = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
const formatTimeHM = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const newMecanico = () => ({ nombre: '' });
const newRefaccion = () => ({ cantidad: '', descripcion: '', cargoCliente: 'No', codigoInterno: '' });

export default function ReporteEmergenciaForm() {
  const { orderid } = useLocalSearchParams();
  const draftKey = useMemo(() => `reporte_emergencia:${orderid ?? 'local'}`, [orderid]);

  // ===== Fecha (un solo Date con calendario) =====
  const [fecha, setFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ===== Servicio de emergencia efectuado en =====
  const [mx, setMx] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [direccion, setDireccion] = useState('');

  // ===== Horas (time picker) =====
  const [horaEntrada, setHoraEntrada] = useState(''); // "HH:MM"
  const [horaSalida, setHoraSalida] = useState('');
  const [horaLlamada, setHoraLlamada] = useState('');

  const [showEntradaPicker, setShowEntradaPicker] = useState(false);
  const [showSalidaPicker, setShowSalidaPicker] = useState(false);
  const [showLlamadaPicker, setShowLlamadaPicker] = useState(false);

  // ===== Mecánicos =====
  const [mecanicos, setMecanicos] = useState([newMecanico()]);
  const addMecanico = () => setMecanicos(prev => [...prev, newMecanico()]);
  const removeMecanico = (idx) => setMecanicos(prev => prev.filter((_, i) => i !== idx));
  const updateMecanico = (idx, val) => setMecanicos(prev => prev.map((m, i) => i === idx ? { nombre: val } : m));

  // ===== Supervisor / CT =====
  const [supervisor, setSupervisor] = useState('');
  const [ct, setCt] = useState('');

  // ===== Bloques largos =====
  const [reporte, setReporte] = useState('');
  const [estadoEquipo, setEstadoEquipo] = useState('');
  const [analisisFalla, setAnalisisFalla] = useState('');
  const [formasCorreccion, setFormasCorreccion] = useState('');
  const [notas, setNotas] = useState('');

  // ===== Refacciones =====
  const [refacciones, setRefacciones] = useState([newRefaccion(), newRefaccion()]);
  const addRef = () => setRefacciones(prev => [...prev, newRefaccion()]);
  const removeRef = (idx) => setRefacciones(prev => prev.filter((_, i) => i !== idx));
  const updateRef = (idx, field, val) => setRefacciones(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  // ===== Confirmación cliente =====
  const [entregoRefUsadas, setEntregoRefUsadas] = useState('No');
  const [firmaCliente, setFirmaCliente] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [puestoCliente, setPuestoCliente] = useState('');

  // ===== Cargar borrador al abrir =====
  const loadDraft = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(draftKey);
      if (!s) return;
      const d = JSON.parse(s);
      if (d.fecha) setFecha(new Date(d.fecha));
      setMx(d.mx ?? ''); setRazonSocial(d.razonSocial ?? ''); setDireccion(d.direccion ?? '');
      setHoraEntrada(d.horaEntrada ?? ''); setHoraSalida(d.horaSalida ?? ''); setHoraLlamada(d.horaLlamada ?? '');
      setMecanicos(Array.isArray(d.mecanicos) && d.mecanicos.length ? d.mecanicos : [newMecanico()]);
      setSupervisor(d.supervisor ?? ''); setCt(d.ct ?? '');
      setReporte(d.reporte ?? ''); setEstadoEquipo(d.estadoEquipo ?? ''); setAnalisisFalla(d.analisisFalla ?? '');
      setFormasCorreccion(d.formasCorreccion ?? ''); setNotas(d.notas ?? '');
      setRefacciones(Array.isArray(d.refacciones) && d.refacciones.length ? d.refacciones : [newRefaccion()]);
      setEntregoRefUsadas(d.entregoRefUsadas ?? 'No');
      setFirmaCliente(d.firmaCliente ?? ''); setNombreCliente(d.nombreCliente ?? ''); setPuestoCliente(d.puestoCliente ?? '');
      Alert.alert('Borrador cargado', 'Se cargaron los datos guardados localmente.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo cargar el borrador.');
    }
  }, [draftKey]);

  useEffect(() => { loadDraft(); }, []);

  // ===== Guardar borrador =====
  const saveDraft = useCallback(async () => {
    const payload = {
      fecha: fecha.toISOString(),
      mx, razonSocial, direccion,
      horaEntrada, horaSalida, horaLlamada,
      mecanicos,
      supervisor, ct,
      reporte, estadoEquipo, analisisFalla, formasCorreccion, notas,
      refacciones,
      entregoRefUsadas,
      firmaCliente, nombreCliente, puestoCliente,
    };
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(payload));
      Alert.alert('Borrador guardado', 'Se guardó localmente en el dispositivo.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo guardar el borrador.');
    }
  }, [draftKey, fecha, mx, razonSocial, direccion, horaEntrada, horaSalida, horaLlamada, mecanicos, supervisor, ct,
      reporte, estadoEquipo, analisisFalla, formasCorreccion, notas, refacciones, entregoRefUsadas, firmaCliente, nombreCliente, puestoCliente]);

  // ===== Validación mínima =====
  const validar = () => {
    if (!mx.trim()) return 'Falta MX.';
    if (!razonSocial.trim()) return 'Falta Razón social.';
    if (!direccion.trim()) return 'Falta Dirección.';
    if (!horaEntrada.trim()) return 'Falta Hora de entrada.';
    if (!horaSalida.trim()) return 'Falta Hora de salida.';
    if (!reporte.trim()) return 'Falta el campo Reporte.';
    return null;
  };

  // ===== Handlers Date/Time pickers =====
  const onChangeDate = (_e, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setFecha(selectedDate);
  };

  const openTime = (which) => {
    if (which === 'entrada') setShowEntradaPicker(true);
    if (which === 'salida') setShowSalidaPicker(true);
    if (which === 'llamada') setShowLlamadaPicker(true);
  };

  const onChangeTime = (setter, setShow) => (_e, selectedDate) => {
    if (Platform.OS === 'android') setShow(false);
    if (selectedDate) setter(formatTimeHM(selectedDate));
  };

  // ===== Guardar (simulado) =====
  const onGuardarLocal = () => {
    const err = validar();
    if (err) return Alert.alert('Validación', err);

    const mecLimpios = mecanicos
      .map(m => (m?.nombre || '').trim())
      .filter(Boolean)
      .map(nombre => ({ nombre }));

    const output = {
      fecha: {
        iso: fecha.toISOString(),
        dmy: formatDateDMY(fecha),
      },
      servicio: { mx, razonSocial, direccion },
      mecanicoSupervisor: { entrada: horaEntrada, salida: horaSalida },
      mecanicos: mecLimpios,
      horaLlamada,
      supervisor,
      ct,
      reporte,
      estadoEquipo,
      analisisFalla,
      formasCorreccion,
      notas,
      refacciones: refacciones.map(r => ({
        cantidad: r.cantidad,
        descripcion: r.descripcion,
        cargoCliente: r.cargoCliente, // "Sí" | "No"
        codigoInterno: r.codigoInterno
      })),
      confirmacionCliente: {
        entregoRefUsadas,
        firma: firmaCliente,
        nombre: nombreCliente,
        puesto: puestoCliente
      }
    };

    console.log('REPORTE_EMERGENCIA_OUTPUT =>', JSON.stringify(output, null, 2));
    Alert.alert('Datos listos', 'Se generó el objeto local (revisa la consola).');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Reporte de emergencia" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {/* FECHA */}
        <Text style={styles.section}>Fecha</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Selecciona la fecha</Text>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.pickerBox}>
            <Text style={styles.pickerText}>{formatDateDMY(fecha)}</Text>
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

        {/* SERVICIO DE EMERGENCIA EFECTUADO EN */}
        <Text style={styles.section}>Servicio de emergencia efectuado en</Text>
        <View style={styles.card}>
          <LabeledInput label="MX" value={mx} onChangeText={setMx} placeholder="MX..." />
          <LabeledInput label="Razón social" value={razonSocial} onChangeText={setRazonSocial} placeholder="Empresa / Cliente" />
          <LabeledInput label="Dirección" value={direccion} onChangeText={setDireccion} placeholder="Calle, No., Col., Ciudad..." />
        </View>

        {/* MECÁNICO/SUPERVISOR: ENTRADA / SALIDA */}
        <Text style={styles.section}>Mecánico/Supervisor</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Entrada</Text>
          <TouchableOpacity onPress={() => openTime('entrada')} style={styles.pickerBox}>
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
          <TouchableOpacity onPress={() => openTime('salida')} style={styles.pickerBox}>
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

        {/* MECÁNICOS (lista) */}
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

        {/* HORA DE LLAMADA / SUPERVISOR / CT */}
        <Text style={styles.section}>Datos adicionales</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Hora de llamada</Text>
          <TouchableOpacity onPress={() => openTime('llamada')} style={styles.pickerBox}>
            <Text style={styles.pickerText}>{horaLlamada || 'HH:MM'}</Text>
          </TouchableOpacity>
          {showLlamadaPicker && (
            <DateTimePicker
              value={new Date()}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeTime(setHoraLlamada, setShowLlamadaPicker)}
            />
          )}
          <LabeledInput label="Supervisor" value={supervisor} onChangeText={setSupervisor} placeholder="Nombre del supervisor" />
          <LabeledInput label="CT" value={ct} onChangeText={setCt} placeholder="Código / clave" />
        </View>

        {/* BLOQUES LARGOS */}
        <Text style={styles.section}>Reporte</Text>
        <View style={styles.card}>
          <LabeledInput label="Detalle del reporte" value={reporte} onChangeText={setReporte} placeholder="Descripción..." multiline />
        </View>

        <Text style={styles.section}>Estado de equipo</Text>
        <View style={styles.card}>
          <LabeledInput label="Estado" value={estadoEquipo} onChangeText={setEstadoEquipo} placeholder="Operando / Detenido / ..." multiline />
        </View>

        <Text style={styles.section}>Análisis de falla</Text>
        <View style={styles.card}>
          <LabeledInput label="Análisis" value={analisisFalla} onChangeText={setAnalisisFalla} placeholder="Causa raíz..." multiline />
        </View>

        <Text style={styles.section}>Formas de corrección</Text>
        <View style={styles.card}>
          <LabeledInput label="Corrección" value={formasCorreccion} onChangeText={setFormasCorreccion} placeholder="Acciones tomadas..." multiline />
        </View>

        <Text style={styles.section}>Notas</Text>
        <View style={styles.card}>
          <LabeledInput label="Notas" value={notas} onChangeText={setNotas} placeholder="Observaciones..." multiline />
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

              <ChipsYesNo
                label="¿Con cargo al cliente?"
                value={r.cargoCliente}
                onChange={(opt) => updateRef(idx, 'cargoCliente', opt)}
              />
            </View>
          ))}

          <TouchableOpacity style={styles.secondary} onPress={addRef}>
            <Text style={styles.secondaryText}>+ Agregar refacción</Text>
          </TouchableOpacity>
        </View>

        {/* CONFIRMACIÓN CLIENTE */}
        <Text style={styles.section}>Confirmación del cliente</Text>
        <View style={styles.card}>
          <ChipsYesNo
            label="¿Le fueron entregadas las refacciones utilizadas o dañadas?"
            value={entregoRefUsadas}
            onChange={setEntregoRefUsadas}
          />
          <LabeledInput label="Firma" value={firmaCliente} onChangeText={setFirmaCliente} placeholder="Firma (texto / referencia)" />
          <LabeledInput label="Nombre" value={nombreCliente} onChangeText={setNombreCliente} placeholder="Nombre del cliente" />
          <LabeledInput label="Puesto" value={puestoCliente} onChangeText={setPuestoCliente} placeholder="Puesto" />
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
