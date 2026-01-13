// Solicitud de préstamo de refacciones — 100% local (sin backend)
// - Fecha y fechas de devolución con DatePicker
// - Lista dinámica de refacciones
// - Guardado/carga de borrador en AsyncStorage
// - onGuardarLocal(): imprime el JSON final (simulado)

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams } from 'expo-router';

// Ajusta estos imports a tu app:
import Header from '../../../../src/components/Header';

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

function Chips({ label, options, value, onChange }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
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
    </View>
  );
}

// Helpers
const pad2 = (n) => String(n).padStart(2,'0');
const formatDMY = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;

const newRef = () => ({
  codigo: '',
  cantidad: '',
  nombreRef: '',
  fechaDevolucionISO: null, // editable
  fechaRealISO: null,       // lectura (almacén)
});

export default function SolicitudPrestamoRefaccionesForm() {
  const { orderid } = useLocalSearchParams();
  const draftKey = useMemo(() => `solicitud_prestamo_refacciones:${orderid ?? 'local'}`, [orderid]);

  // ===== Fecha =====
  const [fecha, setFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ===== Encabezado / datos generales =====
  const [departamento, setDepartamento] = useState('Mantenimiento'); // por defecto
  const [equipoMx, setEquipoMx] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [direccion, setDireccion] = useState('');

  // ===== Estado del equipo =====
  const [estadoEquipo, setEstadoEquipo] = useState('Detenido'); // "Detenido" | "Operando con deficiencias"

  // ===== Solicitante =====
  const [solicitante, setSolicitante] = useState(''); // "Nómina-Nombre"
  const [puesto, setPuesto] = useState('');

  // ===== Refacciones (tabla dinámica) =====
  const [refacciones, setRefacciones] = useState([newRef()]);
  const [showRowDatePicker, setShowRowDatePicker] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(null);

  const addRow = () => setRefacciones(p => [...p, newRef()]);
  const removeRow = (idx) => setRefacciones(p => p.filter((_, i) => i !== idx));
  const updateRow = (idx, field, val) =>
    setRefacciones(p => p.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const openFechaDevolucion = (idx) => {
    setActiveRowIndex(idx);
    setShowRowDatePicker(true);
  };
  const onChangeRowDate = (_e, selectedDate) => {
    if (Platform.OS === 'android') setShowRowDatePicker(false);
    if (selectedDate && activeRowIndex !== null) {
      setRefacciones(p => p.map((r, i) =>
        i === activeRowIndex ? { ...r, fechaDevolucionISO: selectedDate.toISOString() } : r
      ));
    }
  };

  // ===== Motivo de la solicitud =====
  const [motivo, setMotivo] = useState('');

  // ===== Firmas =====
  const [firmaSolicitante, setFirmaSolicitante] = useState('');
  const [firmaJefatura, setFirmaJefatura] = useState('');
  const [firmaAutorizacion, setFirmaAutorizacion] = useState('');

  // ===== Borradores =====
  const loadDraft = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(draftKey);
      if (!s) return;
      const d = JSON.parse(s);
      if (d.fecha) setFecha(new Date(d.fecha));
      setDepartamento(d.departamento ?? 'Mantenimiento');
      setEquipoMx(d.equipoMx ?? '');
      setRazonSocial(d.razonSocial ?? '');
      setDireccion(d.direccion ?? '');
      setEstadoEquipo(d.estadoEquipo ?? 'Detenido');
      setSolicitante(d.solicitante ?? '');
      setPuesto(d.puesto ?? '');
      setRefacciones(Array.isArray(d.refacciones) && d.refacciones.length ? d.refacciones : [newRef()]);
      setMotivo(d.motivo ?? '');
      setFirmaSolicitante(d.firmaSolicitante ?? '');
      setFirmaJefatura(d.firmaJefatura ?? '');
      setFirmaAutorizacion(d.firmaAutorizacion ?? '');
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
      departamento, equipoMx, razonSocial, direccion,
      estadoEquipo,
      solicitante, puesto,
      refacciones,
      motivo,
      firmaSolicitante, firmaJefatura, firmaAutorizacion,
    };
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(payload));
      Alert.alert('Borrador guardado', 'Se guardó localmente en el dispositivo.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo guardar el borrador.');
    }
  }, [draftKey, fecha, departamento, equipoMx, razonSocial, direccion, estadoEquipo, solicitante, puesto, refacciones, motivo, firmaSolicitante, firmaJefatura, firmaAutorizacion]);

  // ===== Validación mínima =====
  const validar = () => {
    if (!departamento.trim()) return 'Falta Departamento.';
    if (!equipoMx.trim()) return 'Falta Equipo/MX-No.';
    if (!razonSocial.trim()) return 'Falta Razón social.';
    if (!direccion.trim()) return 'Falta Dirección.';
    if (!solicitante.trim()) return 'Falta Solicitante.';
    if (!puesto.trim()) return 'Falta Puesto.';
    if (!motivo.trim()) return 'Falta Motivo de la solicitud.';
    return null;
  };

  // ===== Date principal =====
  const onChangeDate = (_e, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setFecha(selectedDate);
  };

  // ===== Guardar (simulado) =====
  const onGuardarLocal = () => {
    const err = validar();
    if (err) return Alert.alert('Validación', err);

    const output = {
      fecha: { iso: fecha.toISOString(), dmy: formatDMY(fecha) },
      departamento,
      equipo: { mxNo: equipoMx },
      cliente: { razonSocial, direccion },
      estadoEquipo, // "Detenido" | "Operando con deficiencias"
      solicitante: { nominaNombre: solicitante, puesto },
      refacciones: refacciones.map(r => ({
        codigo: r.codigo,
        cantidad: r.cantidad,
        nombreRef: r.nombreRef,
        fechaDevolucionISO: r.fechaDevolucionISO,
        fechaDevolucionDMY: r.fechaDevolucionISO ? formatDMY(new Date(r.fechaDevolucionISO)) : '',
        fechaRealISO: r.fechaRealISO, // reservado para almacén
      })),
      motivo,
      firmas: {
        solicitante: firmaSolicitante,
        jefatura: firmaJefatura,
        autorizacionDireccionSubdirGerencia: firmaAutorizacion,
      },
      notaAlmacen: 'La columna "Fecha REAL" es de llenado exclusivo por almacén.',
    };

    console.log('SOLICITUD_PRESTAMO_REFACCIONES_OUTPUT =>', JSON.stringify(output, null, 2));
    Alert.alert('Datos listos', 'Se generó el objeto local (revisa la consola).');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Solicitud de préstamo de refacciones" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {/* FECHA */}
        <Text style={styles.section}>Fecha</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Selecciona la fecha</Text>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.pickerBox}>
            <Text style={styles.pickerText}>{formatDMY(fecha)}</Text>
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

        {/* DATOS GENERALES */}
        <Text style={styles.section}>Datos generales</Text>
        <View style={styles.card}>
          <LabeledInput label="Departamento" value={departamento} onChangeText={setDepartamento} placeholder="Mantenimiento" />
          <LabeledInput label="Equipo/s (MX-No)" value={equipoMx} onChangeText={setEquipoMx} placeholder="14JA448-07" />
          <LabeledInput label="Razón social" value={razonSocial} onChangeText={setRazonSocial} placeholder="Cliente / Empresa" />
          <LabeledInput label="Dirección" value={direccion} onChangeText={setDireccion} placeholder="Calle, No., Col., Ciudad..." />
          <Chips
            label="Estado del equipo"
            options={['Detenido', 'Operando con deficiencias']}
            value={estadoEquipo}
            onChange={setEstadoEquipo}
          />
        </View>

        {/* SOLICITANTE */}
        <Text style={styles.section}>Solicitante</Text>
        <View style={styles.card}>
          <LabeledInput label="Nómina - Nombre" value={solicitante} onChangeText={setSolicitante} placeholder="00000 - Nombre Apellido" />
          <LabeledInput label="Puesto" value={puesto} onChangeText={setPuesto} placeholder="Jefatura / Técnico / ..." />
        </View>

        {/* REFACCIONES */}
        <Text style={styles.section}>Refacciones solicitadas</Text>
        <View style={styles.card}>
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>
              *La columna “Fecha REAL” es de llenado exclusivo por almacén.
            </Text>
          </View>

          {refacciones.map((r, idx) => (
            <View key={idx} style={styles.rowCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.rowTitle}>Línea {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeRow(idx)}>
                  <Text style={styles.removeTxt}>Eliminar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.grid2}>
                <LabeledInput label="Código" value={r.codigo} onChangeText={v => updateRow(idx, 'codigo', v)} placeholder="KCD-1161 B" />
                <LabeledInput label="Cantidad" value={r.cantidad} onChangeText={v => updateRow(idx, 'cantidad', v)} placeholder="1 PZA" keyboardType="default" />
              </View>

              <LabeledInput label="Nombre de refacción" value={r.nombreRef} onChangeText={v => updateRow(idx, 'nombreRef', v)} placeholder="Refacción..." />

              <Text style={styles.label}>Fecha de devolución</Text>
              <TouchableOpacity onPress={() => openFechaDevolucion(idx)} style={styles.pickerBox}>
                <Text style={styles.pickerText}>
                  {r.fechaDevolucionISO ? formatDMY(new Date(r.fechaDevolucionISO)) : 'DD/MM/AAAA'}
                </Text>
              </TouchableOpacity>

              {/* Fecha REAL (almacén) — solo lectura */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.label}>Fecha REAL (almacén)</Text>
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyText}>
                    {r.fechaRealISO ? formatDMY(new Date(r.fechaRealISO)) : '—'}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {showRowDatePicker && (
            <DateTimePicker
              value={new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeRowDate}
            />
          )}

          <TouchableOpacity style={styles.secondary} onPress={addRow}>
            <Text style={styles.secondaryText}>+ Agregar refacción</Text>
          </TouchableOpacity>
        </View>

        {/* MOTIVO */}
        <Text style={styles.section}>Motivo de la solicitud</Text>
        <View style={styles.card}>
          <LabeledInput label="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Describe el motivo..." multiline />
        </View>

        {/* COMPROMISO (texto informativo) */}
        <Text style={styles.section}>Compromiso</Text>
        <View style={styles.card}>
          <Text style={{ fontSize: 12, color: '#111827' }}>
            El solicitante se compromete a cerrar el préstamo de las refacciones en un lapso no mayor a 30 días hábiles
            con los siguientes documentos: memorándum de devolución (No Aviso/Reserva/Diario), salida original de almacén
            y pieza(s) en buen estado.
          </Text>
        </View>

        {/* FIRMAS */}
        <Text style={styles.section}>Firmas</Text>
        <View style={styles.card}>
          <LabeledInput label="Firma y sello del solicitante" value={firmaSolicitante} onChangeText={setFirmaSolicitante} placeholder="Firma / Nombre / Sello" />
          <LabeledInput label="Firma y sello de jefatura" value={firmaJefatura} onChangeText={setFirmaJefatura} placeholder="Firma / Nombre / Sello" />
          <LabeledInput label="Autorización (Dirección/Subdirección/Gerencia)" value={firmaAutorizacion} onChangeText={setFirmaAutorizacion} placeholder="Firma / Nombre / Sello" />
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
  readonlyBox: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#f9fafb' },
  readonlyText: { fontSize: 16, color: '#111827' },
});
