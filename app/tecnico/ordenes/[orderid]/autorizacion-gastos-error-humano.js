// Autorización de gastos por error humano — Frontend (Expo Router + React Native)
// - 100% local: sin backend
// - Fecha de emisión autollenada (solo lectura)
// - Tabla dinámica de refacciones con sumas y total general
// - Guardado/carga de borrador en AsyncStorage
// - Estilo compacto, similar a tus formularios previos

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';
import { useLocalSearchParams, router } from 'expo-router';

function LabeledInput({ label, value, onChangeText, placeholder, multiline, editable = true, keyboardType="default" }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 120, textAlignVertical: 'top' }, !editable && styles.readonly]}
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

const newRow = () => ({
  noRef: '',
  codigo: '',
  nombre: '',
  horasHombre: '',
  costoManoObra: '',
  costoMateriales: '',
  costoTransporte: '',
});

const moneyToNumber = (s) => {
  if (s === null || s === undefined) return 0;
  const n = String(s).replace(/[^\d.-]/g, '');
  const v = parseFloat(n);
  return isNaN(v) ? 0 : v;
};

const numberToMoney = (n) => {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n || 0);
  } catch {
    return `$ ${Number(n || 0).toFixed(2)}`;
  }
};

export default function AutorizacionGastosErrorHumano() {
  const { orderid } = useLocalSearchParams(); // opcional; lo usamos para clave del borrador si existe
  const draftKey = useMemo(() => `aut_gastos_error_humano:${orderid ?? 'local'}`, [orderid]);

  // ===== Encabezado (según formato) =====
  const [mx, setMx] = useState('');
  const [direccion, setDireccion] = useState('');
  const [noEquipo, setNoEquipo] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [tipoControl, setTipoControl] = useState('');
  const [fechaEntregaEquipo, setFechaEntregaEquipo] = useState('');
  const [fechaAcontecimientos, setFechaAcontecimientos] = useState('');

  // Autollenado — Fecha de emisión (solo lectura)
  const fechaEmision = useMemo(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, []);

  // ===== Textos largos =====
  const [descripcionProblema, setDescripcionProblema] = useState('');
  const [accionInmediata, setAccionInmediata] = useState('');
  const [resultadoFinal, setResultadoFinal] = useState('');
  const [contramedida, setContramedida] = useState('');

  // ===== Tabla de refacciones =====
  const [rows, setRows] = useState([newRow(), newRow()]);
  const addRow = () => setRows(r => [...r, newRow()]);
  const removeRow = (idx) => setRows(r => r.filter((_, i) => i !== idx));
  const updateRow = (idx, field, val) =>
    setRows(r => r.map((row, i) => i === idx ? { ...row, [field]: val } : row));

  const rowTotal = (row) => {
    const mo = moneyToNumber(row.costoManoObra);
    const mat = moneyToNumber(row.costoMateriales);
    const tr = moneyToNumber(row.costoTransporte);
    return mo + mat + tr;
  };
  const totalGeneral = rows.reduce((acc, r) => acc + rowTotal(r), 0);

  // ===== Firmas / VoBo =====
  const [emitio, setEmitio] = useState('');
  const [voboMantto, setVoboMantto] = useState('');
  const [voboFinanzas, setVoboFinanzas] = useState('');
  const [enteradoDirector, setEnteradoDirector] = useState('');

  // ===== Borrador (guardar/cargar) =====
  const saveDraft = useCallback(async () => {
    const payload = {
      mx, direccion, noEquipo, razonSocial, tipoControl, fechaEntregaEquipo, fechaAcontecimientos,
      fechaEmision,
      descripcionProblema, accionInmediata, resultadoFinal, contramedida,
      rows,
      emitio, voboMantto, voboFinanzas, enteradoDirector,
    };
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(payload));
      Alert.alert('Borrador guardado', 'Se guardó localmente en el dispositivo.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo guardar el borrador.');
    }
  }, [draftKey, mx, direccion, noEquipo, razonSocial, tipoControl, fechaEntregaEquipo, fechaAcontecimientos,
      fechaEmision, descripcionProblema, accionInmediata, resultadoFinal, contramedida,
      rows, emitio, voboMantto, voboFinanzas, enteradoDirector]);

  const loadDraft = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(draftKey);
      if (!s) return;
      const d = JSON.parse(s);
      setMx(d.mx ?? '');
      setDireccion(d.direccion ?? '');
      setNoEquipo(d.noEquipo ?? '');
      setRazonSocial(d.razonSocial ?? '');
      setTipoControl(d.tipoControl ?? '');
      setFechaEntregaEquipo(d.fechaEntregaEquipo ?? '');
      setFechaAcontecimientos(d.fechaAcontecimientos ?? '');
      setDescripcionProblema(d.descripcionProblema ?? '');
      setAccionInmediata(d.accionInmediata ?? '');
      setResultadoFinal(d.resultadoFinal ?? '');
      setContramedida(d.contramedida ?? '');
      setRows(Array.isArray(d.rows) && d.rows.length ? d.rows : [newRow()]);
      setEmitio(d.emitio ?? '');
      setVoboMantto(d.voboMantto ?? '');
      setVoboFinanzas(d.voboFinanzas ?? '');
      setEnteradoDirector(d.enteradoDirector ?? '');
      Alert.alert('Borrador cargado', 'Se cargaron los datos guardados localmente.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo cargar el borrador.');
    }
  }, [draftKey]);

  useEffect(() => { loadDraft(); }, []); // intenta cargar un borrador al abrir

  const validar = () => {
    if (!mx.trim()) return 'Falta MX.';
    if (!direccion.trim()) return 'Falta Dirección.';
    if (!noEquipo.trim()) return 'Falta No. equipo.';
    if (!razonSocial.trim()) return 'Falta Razón social.';
    if (!tipoControl.trim()) return 'Falta Tipo de control.';
    if (!descripcionProblema.trim()) return 'Falta Descripción del problema.';
    if (!accionInmediata.trim()) return 'Falta Acción inmediata.';
    // filas: opcional, pero si llenan costos, acepta vacíos
    return null;
  };

  const onEnviarLocal = () => {
    const err = validar();
    if (err) return Alert.alert('Validación', err);
    const output = {
      encabezado: {
        mx, direccion, noEquipo, razonSocial, tipoControl,
        fechaEntregaEquipo, fechaAcontecimientos, fechaEmision
      },
      descripcionProblema,
      accionInmediata,
      refacciones: rows.map(r => ({
        noRef: r.noRef,
        codigo: r.codigo,
        nombre: r.nombre,
        horasHombre: r.horasHombre,
        costoManoObra: moneyToNumber(r.costoManoObra),
        costoMateriales: moneyToNumber(r.costoMateriales),
        costoTransporte: moneyToNumber(r.costoTransporte),
        costoTotal: rowTotal(r),
      })),
      totalGeneral: totalGeneral,
      resultadoFinal,
      contramedida,
      firmas: {
        emitio,
        vistoBuenoMantenimiento: voboMantto,
        vistoBuenoFinanzas: voboFinanzas,
        enteradoDirectorGeneral: enteradoDirector,
      }
    };
    // Aquí podrías enviar a tu backend cuando lo tengas:
    // await api.post('/api/aut-gastos-error-humano', output)
    Alert.alert('Datos listos', 'Se generó el objeto local. (Simulado)\nRevisa la consola.');
    console.log('FORM OUTPUT =>', JSON.stringify(output, null, 2));
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Autorización de gastos (error humano)" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {/* ENCABEZADO */}
        <Text style={styles.section}>Encabezado</Text>
        <View style={styles.card}>
          <LabeledInput label="MX" value={mx} onChangeText={setMx} placeholder="MX01..." />
          <LabeledInput label="Dirección" value={direccion} onChangeText={setDireccion} placeholder="Calle, No., Col., Ciudad..." />
          <LabeledInput label="No. equipo" value={noEquipo} onChangeText={setNoEquipo} placeholder="1" keyboardType="numeric" />
          <LabeledInput label="Razón social" value={razonSocial} onChangeText={setRazonSocial} placeholder="Empresa / Cliente" />
          <LabeledInput label="Tipo de control" value={tipoControl} onChangeText={setTipoControl} placeholder="VFEL / etc." />
          <LabeledInput label="Fecha de entrega del equipo" value={fechaEntregaEquipo} onChangeText={setFechaEntregaEquipo} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" />
          <LabeledInput label="Fecha de acontecimientos" value={fechaAcontecimientos} onChangeText={setFechaAcontecimientos} placeholder="sep-24 / DD/MM/AAAA" />
          <LabeledInput label="Fecha de emisión" value={fechaEmision} onChangeText={() => {}} editable={false} placeholder="" />
        </View>

        {/* DESCRIPCIÓN DEL PROBLEMA */}
        <Text style={styles.section}>Descripción del problema</Text>
        <View style={styles.card}>
          <LabeledInput label="Describe el problema" value={descripcionProblema} onChangeText={setDescripcionProblema} placeholder="Detalle..." multiline />
        </View>

        {/* ACCIÓN INMEDIATA */}
        <Text style={styles.section}>Acción inmediata</Text>
        <View style={styles.card}>
          <LabeledInput label="Acción inmediata" value={accionInmediata} onChangeText={setAccionInmediata} placeholder="Qué se hizo de inmediato..." multiline />
        </View>

        {/* TABLA DE REFACCIONES */}
        <Text style={styles.section}>Refacciones / Costos</Text>
        <View style={styles.card}>
          {rows.map((row, idx) => (
            <View key={idx} style={styles.rowCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.rowTitle}>Línea {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeRow(idx)}>
                  <Text style={styles.removeTxt}>Eliminar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.grid2}>
                <LabeledInput label="No REF" value={row.noRef} onChangeText={v => updateRow(idx, 'noRef', v)} placeholder="1" />
                <LabeledInput label="Código de refacción" value={row.codigo} onChangeText={v => updateRow(idx, 'codigo', v)} placeholder="200-..." />
              </View>

              <LabeledInput label="Nombre de refacción" value={row.nombre} onChangeText={v => updateRow(idx, 'nombre', v)} placeholder="Tarjeta electrónica ..." />

              <View style={styles.grid3}>
                <LabeledInput label="Horas hombre" value={row.horasHombre} onChangeText={v => updateRow(idx, 'horasHombre', v)} placeholder="2" keyboardType="numeric" />
                <LabeledInput label="Costo mano de obra" value={row.costoManoObra} onChangeText={v => updateRow(idx, 'costoManoObra', v)} placeholder="$ 0.00" keyboardType="numbers-and-punctuation" />
                <LabeledInput label="Costo materiales" value={row.costoMateriales} onChangeText={v => updateRow(idx, 'costoMateriales', v)} placeholder="$ 0.00" keyboardType="numbers-and-punctuation" />
              </View>

              <View style={styles.grid2}>
                <LabeledInput label="Costo transporte" value={row.costoTransporte} onChangeText={v => updateRow(idx, 'costoTransporte', v)} placeholder="$ 0.00" keyboardType="numbers-and-punctuation" />
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.label}>Costo total de reparación</Text>
                  <View style={styles.readonlyBox}>
                    <Text style={styles.readonlyText}>{numberToMoney(rowTotal(row))}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity onPress={addRow} style={styles.secondary}>
            <Text style={styles.secondaryText}>+ Agregar línea</Text>
          </TouchableOpacity>

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total general</Text>
            <Text style={styles.totalValue}>{numberToMoney(totalGeneral)}</Text>
          </View>
        </View>

        {/* RESULTADO / CONTRAMEDIDA */}
        <Text style={styles.section}>Resultado final y contramedida</Text>
        <View style={styles.card}>
          <LabeledInput label="Resultado final" value={resultadoFinal} onChangeText={setResultadoFinal} placeholder="Ej.: Se requiere el reemplazo de..." multiline />
          <LabeledInput label="Contramedida preventiva/correctiva" value={contramedida} onChangeText={setContramedida} placeholder="Ej.: Se informará al personal..." multiline />
        </View>

        {/* FIRMAS */}
        <Text style={styles.section}>Firmas / VoBo</Text>
        <View style={styles.card}>
          <LabeledInput label="Emitió" value={emitio} onChangeText={setEmitio} placeholder="Nombre / firma" />
          <LabeledInput label="Visto bueno — Director/Subdirector/Gerente de Mantenimiento" value={voboMantto} onChangeText={setVoboMantto} placeholder="Nombre / firma" />
          <LabeledInput label="Visto bueno — Director de Finanzas" value={voboFinanzas} onChangeText={setVoboFinanzas} placeholder="Nombre / firma" />
          <LabeledInput label="Enterado — Director General" value={enteradoDirector} onChangeText={setEnteradoDirector} placeholder="Nombre / firma" />
        </View>

        {/* Acciones */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <TouchableOpacity style={styles.secondary} onPress={saveDraft}>
            <Text style={styles.secondaryText}>Guardar borrador</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primary} onPress={onEnviarLocal}>
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
  grid2: { flexDirection: 'row', gap: 12 },
  grid3: { flexDirection: 'row', gap: 12 },
  rowCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#fafafa' },
  rowTitle: { fontWeight: '800', color: '#111827', marginBottom: 8 },
  removeTxt: { color: '#b91c1c', fontWeight: '700' },
  readonlyBox: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#f9fafb' },
  readonlyText: { fontSize: 16, color: '#111827' },
  primary: { backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center', flex: 1 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  secondary: { backgroundColor: '#111827', padding: 16, borderRadius: 14, alignItems: 'center', flex: 1 },
  secondaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  totalBox: { marginTop: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f1f5f9', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 16, fontWeight: '800', color: '#111827' },
  totalValue: { fontSize: 16, fontWeight: '900', color: '#111827' },
});
