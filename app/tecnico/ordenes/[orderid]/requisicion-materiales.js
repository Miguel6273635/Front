// Requisición de materiales — 100% local (sin backend)
// - Fecha "EL DÍA" con DatePicker
// - Tabla de materiales dinámica (Código Dynamics, Código MRP, Descripción, Cantidad, U/M, Observaciones)
// - Incidencias (múltiple selección) + Causas (texto)
// - Pie de "Emitida por / Surtida por / Recibida por" con fecha + nombre/firma (DatePicker)
// - Borradores en AsyncStorage
// - onGuardarLocal(): imprime JSON resultante (simulado)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams } from 'expo-router';
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

function ChipsMulti({ label, options, values, onToggle }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipsWrap}>
        {options.map(opt => {
          const active = values.includes(opt);
          return (
            <TouchableOpacity key={opt} onPress={() => onToggle(opt)} style={[styles.chip, active && styles.chipOn]}>
              <Text style={[styles.chipText, active && styles.chipTextOn]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Helpers
const pad2 = (n) => String(n).padStart(2, '0');
const formatDMY = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;

const newLinea = () => ({
  codigoDynamics: '',
  codigoMRP: '',
  descripcion: '',
  cantidad: '',
  um: '',
  observaciones: '',
});

export default function RequisicionMaterialesForm() {
  const { orderid } = useLocalSearchParams();
  const draftKey = useMemo(() => `requisicion_materiales:${orderid ?? 'local'}`, [orderid]);

  // ===== Encabezado =====
  const [alAlmacen, setAlAlmacen] = useState('');
  const [entregarDepto, setEntregarDepto] = useState('');
  const [entregarSeccion, setEntregarSeccion] = useState('');
  const [entregarDia, setEntregarDia] = useState(new Date());
  const [showEntregarDiaPicker, setShowEntregarDiaPicker] = useState(false);

  const [mx, setMx] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [direccion, setDireccion] = useState('');

  // ===== Tabla de materiales =====
  const [lineas, setLineas] = useState([newLinea()]);
  const addLinea = () => setLineas(prev => [...prev, newLinea()]);
  const removeLinea = (idx) => setLineas(prev => prev.filter((_, i) => i !== idx));
  const updateLinea = (idx, field, val) =>
    setLineas(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  // ===== Incidencias + causas =====
  const INCIDENCIAS = ['Solicitud nueva', 'Reposición por daño', 'Reposición por extravío', 'Reposición por robo'];
  const [incidencias, setIncidencias] = useState([]);
  const toggleIncidencia = (opt) =>
    setIncidencias(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]);
  const [causas, setCausas] = useState('');

  // ===== Pie: emitida / surtida / recibida =====
  const [emitidaNombre, setEmitidaNombre] = useState('');
  const [emitidaFecha, setEmitidaFecha] = useState(new Date());
  const [emitidaShowDate, setEmitidaShowDate] = useState(false);

  const [surtidaNombre, setSurtidaNombre] = useState('');
  const [surtidaFecha, setSurtidaFecha] = useState(new Date());
  const [surtidaShowDate, setSurtidaShowDate] = useState(false);

  const [recibidaNombre, setRecibidaNombre] = useState('');
  const [recibidaFecha, setRecibidaFecha] = useState(new Date());
  const [recibidaShowDate, setRecibidaShowDate] = useState(false);

  // ===== Borradores =====
  const loadDraft = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(draftKey);
      if (!s) return;
      const d = JSON.parse(s);
      setAlAlmacen(d.alAlmacen ?? '');
      setEntregarDepto(d.entregarDepto ?? '');
      setEntregarSeccion(d.entregarSeccion ?? '');
      if (d.entregarDia) setEntregarDia(new Date(d.entregarDia));
      setMx(d.mx ?? '');
      setRazonSocial(d.razonSocial ?? '');
      setDireccion(d.direccion ?? '');
      setLineas(Array.isArray(d.lineas) && d.lineas.length ? d.lineas : [newLinea()]);
      setIncidencias(Array.isArray(d.incidencias) ? d.incidencias : []);
      setCausas(d.causas ?? '');
      setEmitidaNombre(d.emitidaNombre ?? '');
      if (d.emitidaFecha) setEmitidaFecha(new Date(d.emitidaFecha));
      setSurtidaNombre(d.surtidaNombre ?? '');
      if (d.surtidaFecha) setSurtidaFecha(new Date(d.surtidaFecha));
      setRecibidaNombre(d.recibidaNombre ?? '');
      if (d.recibidaFecha) setRecibidaFecha(new Date(d.recibidaFecha));
      Alert.alert('Borrador cargado', 'Se cargaron los datos guardados localmente.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo cargar el borrador.');
    }
  }, [draftKey]);

  useEffect(() => { loadDraft(); }, []);

  const saveDraft = useCallback(async () => {
    const payload = {
      alAlmacen,
      entregarDepto,
      entregarSeccion,
      entregarDia: entregarDia.toISOString(),
      mx, razonSocial, direccion,
      lineas,
      incidencias,
      causas,
      emitidaNombre, emitidaFecha: emitidaFecha.toISOString(),
      surtidaNombre, surtidaFecha: surtidaFecha.toISOString(),
      recibidaNombre, recibidaFecha: recibidaFecha.toISOString(),
    };
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(payload));
      Alert.alert('Borrador guardado', 'Se guardó localmente en el dispositivo.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo guardar el borrador.');
    }
  }, [draftKey, alAlmacen, entregarDepto, entregarSeccion, entregarDia, mx, razonSocial, direccion, lineas, incidencias, causas, emitidaNombre, emitidaFecha, surtidaNombre, surtidaFecha, recibidaNombre, recibidaFecha]);

  // ===== Validación mínima =====
  const validar = () => {
    if (!entregarDepto.trim()) return 'Falta "Depto" en ENTREGAR A.';
    if (!entregarSeccion.trim()) return 'Falta "Sección" en ENTREGAR A.';
    if (!mx.trim()) return 'Falta MX.';
    if (!razonSocial.trim() && !direccion.trim()) return 'Falta Dirección/Razón social.';
    if (!lineas.length || !lineas[0].descripcion.trim()) return 'Captura al menos una línea de material con Descripción.';
    return null;
  };

  // ===== Guardar (simulado) =====
  const onGuardarLocal = () => {
    const err = validar();
    if (err) return Alert.alert('Validación', err);

    const output = {
      encabezado: {
        alAlmacen,
        entregarA: {
          depto: entregarDepto,
          seccion: entregarSeccion,
          dia: { iso: entregarDia.toISOString(), dmy: formatDMY(entregarDia) },
        },
        mx,
        cliente: { razonSocial, direccion },
      },
      materiales: lineas.map(l => ({
        codigoDynamics: l.codigoDynamics,
        codigoMRP: l.codigoMRP,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        um: l.um,
        observaciones: l.observaciones,
      })),
      incidencias,
      causas,
      firmas: {
        emitidaPor: { nombreFirma: emitidaNombre, fecha: { iso: emitidaFecha.toISOString(), dmy: formatDMY(emitidaFecha) } },
        surtidaPor: { nombreFirma: surtidaNombre, fecha: { iso: surtidaFecha.toISOString(), dmy: formatDMY(surtidaFecha) } },
        recibidaPor: { nombreFirma: recibidaNombre, fecha: { iso: recibidaFecha.toISOString(), dmy: formatDMY(recibidaFecha) } },
      },
    };

    console.log('REQUISICION_MATERIALES_OUTPUT =>', JSON.stringify(output, null, 2));
    Alert.alert('Datos listos', 'Se generó el objeto local (revisa la consola).');
  };

  // ===== Handlers de DatePickers =====
  const onChangeEntregarDia = (_e, selectedDate) => {
    if (Platform.OS === 'android') setShowEntregarDiaPicker(false);
    if (selectedDate) setEntregarDia(selectedDate);
  };
  const onChangeAnyDate = (setter, closer) => (_e, selectedDate) => {
    if (Platform.OS === 'android') closer(false);
    if (selectedDate) setter(selectedDate);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Requisición de materiales" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {/* ENCABEZADO */}
        <Text style={styles.section}>Encabezado</Text>
        <View style={styles.card}>
          <LabeledInput label='AL ALMACÉN' value={alAlmacen} onChangeText={setAlAlmacen} placeholder='Nombre del almacén / referencia' />

          <Text style={[styles.label, { marginTop: 4 }]}>ENTREGAR A</Text>
          <View style={styles.grid2}>
            <LabeledInput label="Depto" value={entregarDepto} onChangeText={setEntregarDepto} placeholder="Mantenimiento" />
            <LabeledInput label="Sección" value={entregarSeccion} onChangeText={setEntregarSeccion} placeholder="..." />
          </View>

          <Text style={styles.label}>El día</Text>
          <TouchableOpacity onPress={() => setShowEntregarDiaPicker(true)} style={styles.pickerBox}>
            <Text style={styles.pickerText}>{formatDMY(entregarDia)}</Text>
          </TouchableOpacity>
          {showEntregarDiaPicker && (
            <DateTimePicker
              value={entregarDia}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeEntregarDia}
            />
          )}

          <LabeledInput label="MX" value={mx} onChangeText={setMx} placeholder="MX..." />
          <LabeledInput label="Razón social" value={razonSocial} onChangeText={setRazonSocial} placeholder="Cliente" />
          <LabeledInput label="Dirección" value={direccion} onChangeText={setDireccion} placeholder="Calle, No., Col., Ciudad..." />
        </View>

        {/* TABLA DE MATERIALES */}
        <Text style={styles.section}>Materiales solicitados</Text>
        <View style={styles.card}>
          {lineas.map((l, idx) => (
            <View key={idx} style={styles.rowCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.rowTitle}>Línea {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeLinea(idx)}>
                  <Text style={styles.removeTxt}>Eliminar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.grid2}>
                <LabeledInput label="Código Dynamics" value={l.codigoDynamics} onChangeText={v => updateLinea(idx, 'codigoDynamics', v)} placeholder="..." />
                <LabeledInput label="Código MRP" value={l.codigoMRP} onChangeText={v => updateLinea(idx, 'codigoMRP', v)} placeholder="..." />
              </View>
              <LabeledInput label="Descripción" value={l.descripcion} onChangeText={v => updateLinea(idx, 'descripcion', v)} placeholder="Descripción de la refacción/material..." />
              <View style={styles.grid3}>
                <LabeledInput label="Cantidad" value={l.cantidad} onChangeText={v => updateLinea(idx, 'cantidad', v)} placeholder="1" keyboardType="numeric" />
                <LabeledInput label="U/M" value={l.um} onChangeText={v => updateLinea(idx, 'um', v)} placeholder="PZA / JGO / M / ..." />
                <LabeledInput label="Observaciones" value={l.observaciones} onChangeText={v => updateLinea(idx, 'observaciones', v)} placeholder="Notas" />
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.secondary} onPress={addLinea}>
            <Text style={styles.secondaryText}>+ Agregar línea</Text>
          </TouchableOpacity>
        </View>

        {/* INCIDENCIAS Y CAUSAS */}
        <Text style={styles.section}>Incidencias y causas</Text>
        <View style={styles.card}>
          <ChipsMulti
            label="Incidencias"
            options={INCIDENCIAS}
            values={incidencias}
            onToggle={toggleIncidencia}
          />
          <LabeledInput label="Causas" value={causas} onChangeText={setCausas} placeholder="Describe las causas..." multiline />
        </View>

        {/* PIE DE FORMATO */}
        <Text style={styles.section}>Firmas</Text>
        <View style={styles.card}>
          <Text style={styles.subsection}>Emitida por</Text>
          <LabeledInput label="Nombre y firma" value={emitidaNombre} onChangeText={setEmitidaNombre} placeholder="Nombre / Firma" />
          <TouchableOpacity onPress={() => setEmitidaShowDate(true)} style={styles.pickerBox}>
            <Text style={styles.pickerText}>Fecha: {formatDMY(emitidaFecha)}</Text>
          </TouchableOpacity>
          {emitidaShowDate && (
            <DateTimePicker
              value={emitidaFecha}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeAnyDate(setEmitidaFecha, setEmitidaShowDate)}
            />
          )}

          <View style={{ height: 12 }} />

          <Text style={styles.subsection}>Surtida por</Text>
          <LabeledInput label="Nombre y firma" value={surtidaNombre} onChangeText={setSurtidaNombre} placeholder="Nombre / Firma" />
          <TouchableOpacity onPress={() => setSurtidaShowDate(true)} style={styles.pickerBox}>
            <Text style={styles.pickerText}>Fecha: {formatDMY(surtidaFecha)}</Text>
          </TouchableOpacity>
          {surtidaShowDate && (
            <DateTimePicker
              value={surtidaFecha}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeAnyDate(setSurtidaFecha, setSurtidaShowDate)}
            />
          )}

          <View style={{ height: 12 }} />

          <Text style={styles.subsection}>Recibida por</Text>
          <LabeledInput label="Nombre y firma" value={recibidaNombre} onChangeText={setRecibidaNombre} placeholder="Nombre / Firma" />
          <TouchableOpacity onPress={() => setRecibidaShowDate(true)} style={styles.pickerBox}>
            <Text style={styles.pickerText}>Fecha: {formatDMY(recibidaFecha)}</Text>
          </TouchableOpacity>
          {recibidaShowDate && (
            <DateTimePicker
              value={recibidaFecha}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeAnyDate(setRecibidaFecha, setRecibidaShowDate)}
            />
          )}
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
  subsection: { marginBottom: 6, fontSize: 14, fontWeight: '800', color: '#111827' },
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
  grid3: { flexDirection: 'row', gap: 12 },
  rowCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#fafafa' },
  rowTitle: { fontWeight: '800', color: '#111827', marginBottom: 8 },
  removeTxt: { color: '#b91c1c', fontWeight: '700' },
  pickerBox: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#fff'
  },
  pickerText: { fontSize: 16, color: '#111827' },
});
