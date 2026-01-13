// app/tecnico/ordenes/[orderid]/mantto-freno-pm.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Image, Switch } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import Header from '../../../../src/components/Header';
import api from '../../../../src/services/api';

// —— UI utilitaria ——
const Section = ({ children }) => <Text style={styles.section}>{children}</Text>;
const Card = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;
const Label = ({ children, style }) => <Text style={[styles.label, style]}>{children}</Text>;
const Input = (props) => <TextInput {...props} style={[styles.input, props.style]} />;
const Readonly = ({ children }) => (<View style={styles.readonly}><Text style={styles.readonlyText}>{String(children ?? '—')}</Text></View>);
const Row2 = ({ children }) => <View style={styles.row2}>{children}</View>;
const Col = ({ children, min = 220 }) => <View style={[styles.col, { minWidth: min }]}>{children}</View>;
const Chips = ({ options, value, onChange }) => (
  <View style={styles.chipsWrap}>
    {options.map(opt => {
      const active = value === opt;
      return (
        <TouchableOpacity key={opt} style={[styles.chip, active && styles.chipOn]} onPress={() => onChange(opt)}>
          <Text style={[styles.chipText, active && styles.chipTextOn]}>{opt}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);
const YN    = ({ value, onChange }) => <Chips options={['Si','No']} value={value} onChange={onChange} />;
const BM    = ({ value, onChange }) => <Chips options={['Bien','Mal']} value={value} onChange={onChange} />;
const OkSeg = ({ value, onChange }) => <Chips options={['Ok','Necesita Seguimiento']} value={value} onChange={onChange} />;
const SiNoNa= ({ value, onChange }) => <Chips options={['Si','No','N/A']} value={value} onChange={onChange} />;
const Toggle = ({ value, onValueChange }) => <Switch value={!!value} onValueChange={onValueChange} />;

// —— Fotos —— (igual patrón que ya usas)
function PhotoItem({ uri, note, onChangeNote, onRemove }) {
  return (
    <View style={styles.photoItem}>
      <Image source={{ uri }} style={styles.photoImg} />
      <TextInput placeholder="Nota (opcional)" value={note} onChangeText={onChangeNote} style={styles.photoNote}/>
      <TouchableOpacity onPress={onRemove} style={styles.photoRemove}><Text style={styles.photoRemoveText}>Eliminar</Text></TouchableOpacity>
    </View>
  );
}
function PhotoBlock({ title, value, onChange }) {
  const pick = async (momento) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('Permiso', 'Se requiere permiso para la galería.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (result.canceled) return;
    const newUri = result.assets?.[0]?.uri; if (!newUri) return;
    const arr = [...(value?.[momento] || [])]; arr.push({ uri: newUri, note: '' });
    onChange({ ...(value || {}), [momento]: arr });
  };
  const removeAt = (momento, i) => { const arr = [...(value?.[momento] || [])]; arr.splice(i,1); onChange({ ...(value||{}), [momento]: arr }); };
  const setNoteAt= (momento, i, t) => { const arr = [...(value?.[momento] || [])]; arr[i] = { ...(arr[i] || {}), note: t }; onChange({ ...(value||{}), [momento]: arr }); };

  return (
    <Card>
      <Text style={styles.photoBlockTitle}>{title}</Text>
      <View style={styles.photoColumns}>
        {['antes','despues'].map(m => (
          <View key={m} style={styles.photoCol}>
            <View style={styles.photoColHeader}>
              <Text style={styles.photoColTitle}>{m === 'antes' ? 'Antes' : 'Después'}</Text>
              <TouchableOpacity onPress={() => pick(m)} style={styles.photoAdd}><Text style={styles.photoAddText}>+ Agregar</Text></TouchableOpacity>
            </View>
            <View style={styles.photoGrid}>
              {(value?.[m] || []).map((p, i) => (
                <PhotoItem key={`${m}-${i}-${p.uri}`} uri={p.uri} note={p.note} onChangeNote={(t)=>setNoteAt(m,i,t)} onRemove={()=>removeAt(m,i)} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function ManttoFrenoPmForm() {
  const { orderid } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auto, setAuto] = useState(null);

  // Encabezado documento (MX/Equipo/Técnico/Fecha/Horario/Control/Tipo Máquina PM-*, Velocidad, Capacidad) — del formato oficial
  const [mx, setMx] = useState('');
  const [fecha, setFecha] = useState('');
  const [horario, setHorario] = useState('');
  const [control, setControl] = useState('');
  const [tipoMaquinaSufijo, setTipoMaquinaSufijo] = useState(''); // PM-____
  const [velNominal, setVelNominal] = useState('');
  const [capacidadKg, setCapacidadKg] = useState('');
  const [reporteTipo, setReporteTipo] = useState('revision'); // 'revision'|'overhaul'

  // ===== 1) TORQUE ESTÁTICO =====
  const [torqueE_valor, setTorqueE_valor] = useState('');
  const [torqueE_a1, setTorqueE_a1] = useState(''); const [torqueE_d1, setTorqueE_d1] = useState('');
  const [torqueE_a2, setTorqueE_a2] = useState(''); const [torqueE_d2, setTorqueE_d2] = useState('');
  const [torqueE_a3, setTorqueE_a3] = useState(''); const [torqueE_d3, setTorqueE_d3] = useState('');
  const torqueE_prom_a = useMemo(()=>promedio([torqueE_a1,torqueE_a2,torqueE_a3]),[torqueE_a1,torqueE_a2,torqueE_a3]);
  const torqueE_prom_d = useMemo(()=>promedio([torqueE_d1,torqueE_d2,torqueE_d3]),[torqueE_d1,torqueE_d2,torqueE_d3]);
  const [torqueE_estado_a, setTorqueE_estado_a] = useState(null);
  const [torqueE_estado_d, setTorqueE_estado_d] = useState(null);
  const [torqueE_revisado, setTorqueE_revisado] = useState(null);
  const [torqueE_ajuste, setTorqueE_ajuste] = useState(null);
  const [torqueE_revSMA, setTorqueE_revSMA] = useState(null);

  // ===== 2) TORQUE DINÁMICO =====
  const [torqueD_valor, setTorqueD_valor] = useState('');
  const [torqueD_a1, setTorqueD_a1] = useState(''); const [torqueD_d1, setTorqueD_d1] = useState('');
  const [torqueD_a2, setTorqueD_a2] = useState(''); const [torqueD_d2, setTorqueD_d2] = useState('');
  const [torqueD_a3, setTorqueD_a3] = useState(''); const [torqueD_d3, setTorqueD_d3] = useState('');
  const torqueD_prom_a = useMemo(()=>promedio([torqueD_a1,torqueD_a2,torqueD_a3]),[torqueD_a1,torqueD_a2,torqueD_a3]);
  const torqueD_prom_d = useMemo(()=>promedio([torqueD_d1,torqueD_d2,torqueD_d3]),[torqueD_d1,torqueD_d2,torqueD_d3]);
  const [torqueD_estado_a, setTorqueD_estado_a] = useState(null);
  const [torqueD_estado_d, setTorqueD_estado_d] = useState(null);
  const [torqueD_revisado, setTorqueD_revisado] = useState(null);
  const [torqueD_ajuste, setTorqueD_ajuste] = useState(null);
  const [torqueD_revSMA, setTorqueD_revSMA] = useState(null);

  // ===== 3) TORNILLO DE AJUSTE DEL TORQUE (IZQ/DER) =====
  const [tornillo_izq_a, setTornillo_izq_a] = useState(null);
  const [tornillo_izq_d, setTornillo_izq_d] = useState(null);
  const [tornillo_der_a, setTornillo_der_a] = useState(null);
  const [tornillo_der_d, setTornillo_der_d] = useState(null);
  const [tornillo_revisado, setTornillo_revisado] = useState(null);
  const [tornillo_ajuste, setTornillo_ajuste] = useState(null);
  const [tornillo_revSMA, setTornillo_revSMA] = useState(null);

  // ===== 4) RECORRIDO DE BOBINA (IZQ/DER, mm) =====
  const [bobina_izq_a, setBobina_izq_a] = useState(''); const [bobina_izq_d, setBobina_izq_d] = useState('');
  const [bobina_der_a, setBobina_der_a] = useState(''); const [bobina_der_d, setBobina_der_d] = useState('');
  const [bobina_revisado, setBobina_revisado] = useState(null);
  const [bobina_ajuste, setBobina_ajuste] = useState(null);
  const [bobina_revSMA, setBobina_revSMA] = useState(null);

  // ===== 5) RECORRIDO DEL MICRO SWITCH (IZQ/DER) - Superior/Inferior Bien/Mal =====
  const [ms_izq_sup_a, setMs_izq_sup_a] = useState(null);
  const [ms_izq_inf_a, setMs_izq_inf_a] = useState(null);
  const [ms_izq_sup_d, setMs_izq_sup_d] = useState(null);
  const [ms_izq_inf_d, setMs_izq_inf_d] = useState(null);
  const [ms_der_sup_a, setMs_der_sup_a] = useState(null);
  const [ms_der_inf_a, setMs_der_inf_a] = useState(null);
  const [ms_der_sup_d, setMs_der_sup_d] = useState(null);
  const [ms_der_inf_d, setMs_der_inf_d] = useState(null);
  const [ms_revisado, setMs_revisado] = useState(null);
  const [ms_ajuste, setMs_ajuste] = useState(null);
  const [ms_revSMA, setMs_revSMA] = useState(null);

  // ===== 6) REVISAR FUNCIONAMIENTO DE MICRO SWITCH (IZQ Freno#1 / DER Freno#2) =====
  const [ms_func_izq_a, setMs_func_izq_a] = useState(null);
  const [ms_func_izq_d, setMs_func_izq_d] = useState(null);
  const [ms_func_der_a, setMs_func_der_a] = useState(null);
  const [ms_func_der_d, setMs_func_der_d] = useState(null);
  const [ms_func_revisado, setMs_func_revisado] = useState(null);
  const [ms_func_ajuste, setMs_func_ajuste] = useState(null);
  const [ms_func_revSMA, setMs_func_revSMA] = useState(null);

  // ===== 7) CONDICIONES DE TAMBOR (Lubricante/Plástico y Óxido) =====
  const [tambor_lub_a, setTambor_lub_a] = useState(null);
  const [tambor_lub_d, setTambor_lub_d] = useState(null);
  const [tambor_ox_a, setTambor_ox_a] = useState(null);
  const [tambor_ox_d, setTambor_ox_d] = useState(null);
  const [tambor_revisado, setTambor_revisado] = useState(null);
  const [tambor_ajuste, setTambor_ajuste] = useState(null);
  const [tambor_revSMA, setTambor_revSMA] = useState(null);

  // ===== 8) TUBO DE PLÁSTICO PARA DRENADO (Conexión Si/No; Depósito Si/No/N/A) =====
  const [tubo_conexion_a, setTubo_conexion_a] = useState(null);
  const [tubo_conexion_d, setTubo_conexion_d] = useState(null);
  const [tubo_deposito_a, setTubo_deposito_a] = useState(null); // Si/No/N/A
  const [tubo_deposito_d, setTubo_deposito_d] = useState(null);
  const [tubo_revisado, setTubo_revisado] = useState(null);
  const [tubo_ajuste, setTubo_ajuste] = useState(null);
  const [tubo_revSMA, setTubo_revSMA] = useState(null);

  // ===== 9) CONDICIÓN DE OPERACIÓN DEL FRENO – Prueba de funcionamiento (4 ruidos) =====
  const [ruido_zapata_tambor_a, setR1a] = useState(null);
  const [ruido_cubierta_cables_a, setR2a] = useState(null);
  const [ruido_cubiertas_polea_a, setR3a] = useState(null);
  const [ruido_excesivo_frenos_a, setR4a] = useState(null);
  const [ruido_zapata_tambor_d, setR1d] = useState(null);
  const [ruido_cubierta_cables_d, setR2d] = useState(null);
  const [ruido_cubiertas_polea_d, setR3d] = useState(null);
  const [ruido_excesivo_frenos_d, setR4d] = useState(null);
  const [op_revisado, setOp_revisado] = useState(null);
  const [op_revSMA, setOp_revSMA] = useState(null);

  // ===== 10) RESULTADO =====
  const [resultado, setResultado] = useState('bien'); // 'bien' | 'seguimiento'
  const [detalle, setDetalle] = useState('');

  // Firmas (texto/placeholder; la firma real suele ser canvas e imagen)
  const [firmaMecanico, setFirmaMecanico] = useState(false);
  const [firmaSupervisor, setFirmaSupervisor] = useState(false);
  const [firmaGerente, setFirmaGerente] = useState(false);

  // ===== Fotos 2ª página =====
  const [photos, setPhotos] = useState({
    vista_izquierda: {},
    vista_derecha: {},
    otro_1: {},
    otro_2: {}
  });
  const updPhoto = (k, v) => setPhotos(s => ({ ...s, [k]: v }));

  // Fecha por defecto
  useEffect(() => {
    const d = new Date();
    setFecha(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const res = await api.get(`/mantenimiento-freno-pm/datos/${orderid}`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      });
      if (res.status >= 400) throw new Error(res.data?.error || 'No se pudo cargar');
      const { auto: a, form } = res.data || {};
      setAuto(a || {});
      // Prefill encabezado
      setMx(String(orderid));
      // Si ya existe un formulario previo:
      if (form) {
        // Cargar aquí todos los setState desde form si lo deseas (por brevedad, omito)
      }
    } catch (e) {
      console.error('[PM load]', e);
      Alert.alert('Error', e.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [orderid]);

  useEffect(() => { load(); }, [load]);

  const onGuardar = async () => {
    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('token');

      const payload = buildPayload();
      const res = await api.post('/mantenimiento-freno-pm/guardar', payload, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      });
      if (res.status >= 400) throw new Error(res.data?.error || 'No se pudo guardar');

      // Subir fotos
      await uploadAllPhotos(String(orderid), photos, token);

      Alert.alert('Listo', 'Formulario y fotos guardados', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', e.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const buildPayload = () => ({
    orderid: String(orderid),
    encabezado: {
      mx, equipo: auto?.equipo || '', tecnico: auto?.tecnico_nombre || '', nomina: auto?.tecnico_nomina || '',
      fecha, horario, control, tipo_maquina: `PM-${tipoMaquinaSufijo || ''}`, velocidad_mmin: num(velNominal), capacidad_kg: num(capacidadKg),
      reporte_tipo: (reporteTipo === 'overhaul' ? 'overhaul' : 'revision')
    },
    torque_estatico: {
      valor: txt(torqueE_valor),
      datos_antes: [num(torqueE_a1), num(torqueE_a2), num(torqueE_a3)],
      datos_despues: [num(torqueE_d1), num(torqueE_d2), num(torqueE_d3)],
      promedio: { antes: num(torqueE_prom_a), despues: num(torqueE_prom_d) },
      estado: { antes: bm(torqueE_estado_a), despues: bm(torqueE_estado_d) },
      revisado: yn(torqueE_revisado), ajuste: yn(torqueE_ajuste), revision_sma: okseg(torqueE_revSMA)
    },
    torque_dinamico: {
      valor: txt(torqueD_valor),
      datos_antes: [num(torqueD_a1), num(torqueD_a2), num(torqueD_a3)],
      datos_despues: [num(torqueD_d1), num(torqueD_d2), num(torqueD_d3)],
      promedio: { antes: num(torqueD_prom_a), despues: num(torqueD_prom_d) },
      estado: { antes: bm(torqueD_estado_a), despues: bm(torqueD_estado_d) },
      revisado: yn(torqueD_revisado), ajuste: yn(torqueD_ajuste), revision_sma: okseg(torqueD_revSMA)
    },
    tornillo_ajuste: {
      izquierdo: { antes: bm(tornillo_izq_a), despues: bm(tornillo_izq_d) },
      derecho:   { antes: bm(tornillo_der_a), despues: bm(tornillo_der_d) },
      revisado: yn(tornillo_revisado), ajuste: yn(tornillo_ajuste), revision_sma: okseg(tornillo_revSMA)
    },
    recorrido_bobina: {
      izquierdo_mm: { antes: num(bobina_izq_a), despues: num(bobina_izq_d) },
      derecho_mm:   { antes: num(bobina_der_a), despues: num(bobina_der_d) },
      revisado: yn(bobina_revisado), ajuste: yn(bobina_ajuste), revision_sma: okseg(bobina_revSMA)
    },
    recorrido_micro_switch: {
      izquierdo: { superior: { antes: bm(ms_izq_sup_a), despues: bm(ms_izq_sup_d) }, inferior: { antes: bm(ms_izq_inf_a), despues: bm(ms_izq_inf_d) } },
      derecho:   { superior: { antes: bm(ms_der_sup_a), despues: bm(ms_der_sup_d) }, inferior: { antes: bm(ms_der_inf_a), despues: bm(ms_der_inf_d) } },
      revisado: yn(ms_revisado), ajuste: yn(ms_ajuste), revision_sma: okseg(ms_revSMA)
    },
    funcionamiento_micro_switch: {
      izquierdo_freno1: { antes: bm(ms_func_izq_a), despues: bm(ms_func_izq_d) },
      derecho_freno2:   { antes: bm(ms_func_der_a), despues: bm(ms_func_der_d) },
      revisado: yn(ms_func_revisado), ajuste: yn(ms_func_ajuste), revision_sma: okseg(ms_func_revSMA)
    },
    condiciones_tambor: {
      lubricante_plastico: { antes: yn(tambor_lub_a), despues: yn(tambor_lub_d) },
      oxido:               { antes: yn(tambor_ox_a),  despues: yn(tambor_ox_d)  },
      revisado: yn(tambor_revisado), ajuste: yn(tambor_ajuste), revision_sma: okseg(tambor_revSMA)
    },
    tubo_plastico_drenado: {
      conexion: { antes: yn(tubo_conexion_a), despues: yn(tubo_conexion_d) },
      deposito: { antes: sinoNa(tubo_deposito_a), despues: sinoNa(tubo_deposito_d) },
      revisado: yn(tubo_revisado), ajuste: yn(tubo_ajuste), revision_sma: okseg(tubo_revSMA)
    },
    prueba_funcionamiento: {
      ruido_zapata_tambor: { antes: bm(ruido_zapata_tambor_a), despues: bm(ruido_zapata_tambor_d) },
      ruido_cubierta_cables:{ antes: bm(ruido_cubierta_cables_a), despues: bm(ruido_cubierta_cables_d) },
      ruido_cubiertas_polea:{ antes: bm(ruido_cubiertas_polea_a), despues: bm(ruido_cubiertas_polea_d) },
      ruido_excesivo_frenos:{ antes: bm(ruido_excesivo_frenos_a), despues: bm(ruido_excesivo_frenos_d) },
      revisado: yn(op_revisado), revision_sma: yn(op_revSMA) // en formato original este último es Si/No
    },
    resultado: {
      tipo: (resultado === 'seguimiento' ? 'seguimiento' : 'bien'),
      detalle: txt(detalle)
    },
    firmas: {
      mecanico: !!firmaMecanico,
      supervisor: !!firmaSupervisor,
      gerente: !!firmaGerente
    },
    fotos_meta: Object.fromEntries(Object.entries(photos).map(([k,v]) => [k, { antes: v?.antes?.length||0, despues: v?.despues?.length||0 }]))
  });

  const uploadAllPhotos = async (orderidStr, photosObj, token) => {
    for (const [seccion, v] of Object.entries(photosObj)) {
      for (const momento of ['antes','despues']) {
        for (const item of (v?.[momento] || [])) {
          const form = new FormData();
          form.append('orderid', orderidStr);
          form.append('seccion', seccion);
          form.append('momento', momento);
          if (item.note) form.append('nota', item.note);
          const name = item.uri.split('/').pop() || `foto_${Date.now()}.jpg`;
          const ext = (name.split('.').pop() || 'jpg').toLowerCase();
          const type = ext === 'png' ? 'image/png' : 'image/jpeg';
          form.append('file', { uri: item.uri, name, type });
          const res = await api.post('/mantenimiento-freno-pm/fotos', form, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            validateStatus: () => true
          });
          if (res.status >= 400) console.warn('Foto falló', seccion, momento, res.status, res.data);
        }
      }
    }
  };

  if (loading) {
    return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}><ActivityIndicator size="large"/><Text style={{marginTop:8}}>Cargando…</Text></View>;
  }

  return (
    <View style={{ flex:1, backgroundColor:'#F5F7FB' }}>
      <Header title="Mantenimiento de freno (tipo PM)" />
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:180 }}>
        {/* Datos cliente/orden */}
        <Section>Datos del cliente/orden</Section>
        <Card>
          <Row2>
            <Col><Label>MX</Label><Input value={mx} onChangeText={setMx} /></Col>
            <Col><Label>No. Equipo</Label><Readonly>{auto?.equipo}</Readonly></Col>
          </Row2>
          <Row2>
            <Col><Label>Nombre del técnico</Label><Readonly>{auto?.tecnico_nombre}</Readonly></Col>
            <Col><Label>Fecha de inicio</Label><Readonly>{(auto?.start_date ?? '').toString()}</Readonly></Col>
          </Row2>
         
        </Card>

        {/* Encabezado del reporte (plantilla oficial) */}
        <Section>Datos del reporte</Section>
        <Card>
          <Row2>
            <Col><Label>FECHA</Label><Input value={fecha} onChangeText={setFecha} placeholder="DD/MM/AAAA" /></Col>
            <Col><Label>HORARIO</Label><Input value={horario} onChangeText={setHorario} placeholder="08:00–12:00" /></Col>
          </Row2>
          <Row2>
            <Col><Label>CONTROL</Label><Input value={control} onChangeText={setControl} /></Col>
            <Col><Label>TIPO DE MÁQUINA</Label>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                <Readonly>PM-</Readonly>
                <Input value={tipoMaquinaSufijo} onChangeText={setTipoMaquinaSufijo} placeholder="modelo" style={{flex:1}}/>
              </View>
            </Col>
          </Row2>
          <Row2>
            <Col><Label>VELOCIDAD NOMINAL [m/min]</Label><Input keyboardType="numeric" value={velNominal} onChangeText={setVelNominal} /></Col>
            <Col><Label>CAPACIDAD [kg]</Label><Input keyboardType="numeric" value={capacidadKg} onChangeText={setCapacidadKg} /></Col>
          </Row2>
          <Label style={{marginTop:10}}>REPORTE</Label>
          <Chips options={['revision','overhaul']} value={reporteTipo} onChange={setReporteTipo}/>
        </Card>

        {/* 1) Torque estático */}
        <Section>1) Torque estático</Section>
        <Card>
          <Row2><Col><Label>VALOR</Label><Input value={torqueE_valor} onChangeText={setTorqueE_valor} /></Col></Row2>
          <Label style={{marginTop:6}}>Datos</Label>
          <Row2>
            <Col><Label>Dato #1 (antes)</Label><Input keyboardType="numeric" value={torqueE_a1} onChangeText={setTorqueE_a1} /></Col>
            <Col><Label>Dato #1 (después)</Label><Input keyboardType="numeric" value={torqueE_d1} onChangeText={setTorqueE_d1} /></Col>
          </Row2>
          <Row2>
            <Col><Label>Dato #2 (antes)</Label><Input keyboardType="numeric" value={torqueE_a2} onChangeText={setTorqueE_a2} /></Col>
            <Col><Label>Dato #2 (después)</Label><Input keyboardType="numeric" value={torqueE_d2} onChangeText={setTorqueE_d2} /></Col>
          </Row2>
          <Row2>
            <Col><Label>Dato #3 (antes)</Label><Input keyboardType="numeric" value={torqueE_a3} onChangeText={setTorqueE_a3} /></Col>
            <Col><Label>Dato #3 (después)</Label><Input keyboardType="numeric" value={torqueE_d3} onChangeText={setTorqueE_d3} /></Col>
          </Row2>
          <Row2>
            <Col><Label>PROMEDIO (antes)</Label><Readonly>{isNum(torqueE_prom_a)?torqueE_prom_a:'—'}</Readonly></Col>
            <Col><Label>PROMEDIO (después)</Label><Readonly>{isNum(torqueE_prom_d)?torqueE_prom_d:'—'}</Readonly></Col>
          </Row2>
          <Row2>
            <Col><Label>ESTADO (antes)</Label><BM value={torqueE_estado_a} onChange={setTorqueE_estado_a}/></Col>
            <Col><Label>ESTADO (después)</Label><BM value={torqueE_estado_d} onChange={setTorqueE_estado_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>REVISADO</Label><YN value={torqueE_revisado} onChange={setTorqueE_revisado}/></Col>
            <Col><Label>AJUSTE</Label><YN value={torqueE_ajuste} onChange={setTorqueE_ajuste}/></Col>
          </Row2>
          <Label>REVISIÓN SMA</Label>
          <OkSeg value={torqueE_revSMA} onChange={setTorqueE_revSMA}/>
        </Card>

        {/* 2) Torque dinámico */}
        <Section>2) Torque dinámico</Section>
        <Card>
          <Row2><Col><Label>VALOR</Label><Input value={torqueD_valor} onChangeText={setTorqueD_valor} /></Col></Row2>
          <Label style={{marginTop:6}}>Datos</Label>
          <Row2>
            <Col><Label>Dato #1 (antes)</Label><Input keyboardType="numeric" value={torqueD_a1} onChangeText={setTorqueD_a1} /></Col>
            <Col><Label>Dato #1 (después)</Label><Input keyboardType="numeric" value={torqueD_d1} onChangeText={setTorqueD_d1} /></Col>
          </Row2>
          <Row2>
            <Col><Label>Dato #2 (antes)</Label><Input keyboardType="numeric" value={torqueD_a2} onChangeText={setTorqueD_a2} /></Col>
            <Col><Label>Dato #2 (después)</Label><Input keyboardType="numeric" value={torqueD_d2} onChangeText={setTorqueD_d2} /></Col>
          </Row2>
          <Row2>
            <Col><Label>Dato #3 (antes)</Label><Input keyboardType="numeric" value={torqueD_a3} onChangeText={setTorqueD_a3} /></Col>
            <Col><Label>Dato #3 (después)</Label><Input keyboardType="numeric" value={torqueD_d3} onChangeText={setTorqueD_d3} /></Col>
          </Row2>
          <Row2>
            <Col><Label>PROMEDIO (antes)</Label><Readonly>{isNum(torqueD_prom_a)?torqueD_prom_a:'—'}</Readonly></Col>
            <Col><Label>PROMEDIO (después)</Label><Readonly>{isNum(torqueD_prom_d)?torqueD_prom_d:'—'}</Readonly></Col>
          </Row2>
          <Row2>
            <Col><Label>ESTADO (antes)</Label><BM value={torqueD_estado_a} onChange={setTorqueD_estado_a}/></Col>
            <Col><Label>ESTADO (después)</Label><BM value={torqueD_estado_d} onChange={setTorqueD_estado_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>REVISADO</Label><YN value={torqueD_revisado} onChange={setTorqueD_revisado}/></Col>
            <Col><Label>AJUSTE</Label><YN value={torqueD_ajuste} onChange={setTorqueD_ajuste}/></Col>
          </Row2>
          <Label>REVISIÓN SMA</Label>
          <OkSeg value={torqueD_revSMA} onChange={setTorqueD_revSMA}/>
        </Card>

        {/* 3) Tornillo ajuste */}
        <Section>3) Tornillo de ajuste del torque</Section>
        <Card>
          <Row2>
            <Col><Label>Lado Izquierdo</Label><BM value={tornillo_izq_a} onChange={setTornillo_izq_a}/></Col>
            <Col><Label>(después)</Label><BM value={tornillo_izq_d} onChange={setTornillo_izq_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Lado Derecho</Label><BM value={tornillo_der_a} onChange={setTornillo_der_a}/></Col>
            <Col><Label>(después)</Label><BM value={tornillo_der_d} onChange={setTornillo_der_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Revisado</Label><YN value={tornillo_revisado} onChange={setTornillo_revisado}/></Col>
            <Col><Label>Ajuste</Label><YN value={tornillo_ajuste} onChange={setTornillo_ajuste}/></Col>
          </Row2>
          <Label>Revisión SMA</Label>
          <OkSeg value={tornillo_revSMA} onChange={setTornillo_revSMA}/>
        </Card>

        {/* 4) Recorrido de bobina */}
        <Section>4) Recorrido de bobina</Section>
        <Card>
          <Row2>
            <Col><Label>Izquierdo (antes) [mm]</Label><Input keyboardType="numeric" value={bobina_izq_a} onChangeText={setBobina_izq_a}/></Col>
            <Col><Label>Izquierdo (después) [mm]</Label><Input keyboardType="numeric" value={bobina_izq_d} onChangeText={setBobina_izq_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Derecho (antes) [mm]</Label><Input keyboardType="numeric" value={bobina_der_a} onChangeText={setBobina_der_a}/></Col>
            <Col><Label>Derecho (después) [mm]</Label><Input keyboardType="numeric" value={bobina_der_d} onChangeText={setBobina_der_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Revisado</Label><YN value={bobina_revisado} onChange={setBobina_revisado}/></Col>
            <Col><Label>Ajuste</Label><YN value={bobina_ajuste} onChange={setBobina_ajuste}/></Col>
          </Row2>
          <Label>Revisión SMA</Label>
          <OkSeg value={bobina_revSMA} onChange={setBobina_revSMA}/>
        </Card>

        {/* 5) Recorrido micro switch */}
        <Section>5) Recorrido del micro switch de freno</Section>
        <Card>
          <Label>Izquierdo</Label>
          <Row2>
            <Col><Label>Superior (antes)</Label><BM value={ms_izq_sup_a} onChange={setMs_izq_sup_a}/></Col>
            <Col><Label>Superior (después)</Label><BM value={ms_izq_sup_d} onChange={setMs_izq_sup_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Inferior (antes)</Label><BM value={ms_izq_inf_a} onChange={setMs_izq_inf_a}/></Col>
            <Col><Label>Inferior (después)</Label><BM value={ms_izq_inf_d} onChange={setMs_izq_inf_d}/></Col>
          </Row2>

          <Label style={{marginTop:10}}>Derecho</Label>
          <Row2>
            <Col><Label>Superior (antes)</Label><BM value={ms_der_sup_a} onChange={setMs_der_sup_a}/></Col>
            <Col><Label>Superior (después)</Label><BM value={ms_der_sup_d} onChange={setMs_der_sup_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Inferior (antes)</Label><BM value={ms_der_inf_a} onChange={setMs_der_inf_a}/></Col>
            <Col><Label>Inferior (después)</Label><BM value={ms_der_inf_d} onChange={setMs_der_inf_d}/></Col>
          </Row2>

          <Row2>
            <Col><Label>Revisado</Label><YN value={ms_revisado} onChange={setMs_revisado}/></Col>
            <Col><Label>Ajuste</Label><YN value={ms_ajuste} onChange={setMs_ajuste}/></Col>
          </Row2>
          <Label>Revisión SMA</Label>
          <OkSeg value={ms_revSMA} onChange={setMs_revSMA}/>
        </Card>

        {/* 6) Revisar funcionamiento micro switch */}
        <Section>6) Revisar funcionamiento de micro switch</Section>
        <Card>
          <Row2>
            <Col><Label>IZQ Freno #1 (antes)</Label><BM value={ms_func_izq_a} onChange={setMs_func_izq_a}/></Col>
            <Col><Label>IZQ Freno #1 (después)</Label><BM value={ms_func_izq_d} onChange={setMs_func_izq_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>DER Freno #2 (antes)</Label><BM value={ms_func_der_a} onChange={setMs_func_der_a}/></Col>
            <Col><Label>DER Freno #2 (después)</Label><BM value={ms_func_der_d} onChange={setMs_func_der_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Revisado</Label><YN value={ms_func_revisado} onChange={setMs_func_revisado}/></Col>
            <Col><Label>Ajuste</Label><YN value={ms_func_ajuste} onChange={setMs_func_ajuste}/></Col>
          </Row2>
          <Label>Revisión SMA</Label>
          <OkSeg value={ms_func_revSMA} onChange={setMs_func_revSMA}/>
        </Card>

        {/* 7) Condiciones de tambor */}
        <Section>7) Condiciones de tambor</Section>
        <Card>
          <Row2>
            <Col><Label>¿Existe lubricante/plástico? (antes)</Label><YN value={tambor_lub_a} onChange={setTambor_lub_a}/></Col>
            <Col><Label>(después)</Label><YN value={tambor_lub_d} onChange={setTambor_lub_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>¿Existe óxido? (antes)</Label><YN value={tambor_ox_a} onChange={setTambor_ox_a}/></Col>
            <Col><Label>(después)</Label><YN value={tambor_ox_d} onChange={setTambor_ox_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Revisado</Label><YN value={tambor_revisado} onChange={setTambor_revisado}/></Col>
            <Col><Label>Ajuste</Label><YN value={tambor_ajuste} onChange={setTambor_ajuste}/></Col>
          </Row2>
          <Label>Revisión SMA</Label>
          <OkSeg value={tambor_revSMA} onChange={setTambor_revSMA}/>
        </Card>

        {/* 8) Tubo plástico drenado */}
        <Section>8) Tubo de plástico para drenado</Section>
        <Card>
          <Row2>
            <Col><Label>Conexión (antes)</Label><YN value={tubo_conexion_a} onChange={setTubo_conexion_a}/></Col>
            <Col><Label>Conexión (después)</Label><YN value={tubo_conexion_d} onChange={setTubo_conexion_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Depósito (antes)</Label><SiNoNa value={tubo_deposito_a} onChange={setTubo_deposito_a}/></Col>
            <Col><Label>Depósito (después)</Label><SiNoNa value={tubo_deposito_d} onChange={setTubo_deposito_d}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Revisado</Label><YN value={tubo_revisado} onChange={setTubo_revisado}/></Col>
            <Col><Label>Ajuste</Label><YN value={tubo_ajuste} onChange={setTubo_ajuste}/></Col>
          </Row2>
          <Label>Revisión SMA</Label>
          <OkSeg value={tubo_revSMA} onChange={setTubo_revSMA}/>
        </Card>

        {/* 9) Prueba de funcionamiento */}
        <Section>9) Prueba de funcionamiento</Section>
        <Card>
          {[
            ['Ruido entre zapata y tambor', ruido_zapata_tambor_a, setR1a, ruido_zapata_tambor_d, setR1d],
            ['Ruido entre cubierta y cables', ruido_cubierta_cables_a, setR2a, ruido_cubierta_cables_d, setR2d],
            ['Ruido entre cubiertas y polea', ruido_cubiertas_polea_a, setR3a, ruido_cubiertas_polea_d, setR3d],
            ['Ruido excesivo en frenos', ruido_excesivo_frenos_a, setR4a, ruido_excesivo_frenos_d, setR4d]
          ].map(([label, va, sA, vd, sD]) => (
            <Row2 key={label}>
              <Col><Label>{label} (antes)</Label><BM value={va} onChange={sA}/></Col>
              <Col><Label>(después)</Label><BM value={vd} onChange={sD}/></Col>
            </Row2>
          ))}
          <Row2>
            <Col><Label>Revisado</Label><YN value={op_revisado} onChange={setOp_revisado}/></Col>
            <Col><Label>Revisión SMA</Label><YN value={op_revSMA} onChange={setOp_revSMA}/></Col>
          </Row2>
        </Card>

        {/* 10) Resultado */}
        <Section>10) Resultado de la revisión</Section>
        <Card>
          <Label>Selecciona:</Label>
          <Chips options={['bien','seguimiento']} value={resultado} onChange={setResultado}/>
          <Label style={{marginTop:10}}>Detalle (si requiere seguimiento)</Label>
          <Input value={detalle} onChangeText={setDetalle} placeholder="[DETALLE]" multiline/>
        </Card>

        {/* Firmas */}
        <Section>Firmas</Section>
        <Card>
          <Row2>
            <Col><Label>Mecánico — Firma y fecha</Label><Toggle value={firmaMecanico} onValueChange={setFirmaMecanico}/></Col>
            <Col><Label>Aprobación Supervisor — Firma y fecha</Label><Toggle value={firmaSupervisor} onValueChange={setFirmaSupervisor}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Aprobación Gerente — Firma y fecha</Label><Toggle value={firmaGerente} onValueChange={setFirmaGerente}/></Col>
          </Row2>
        </Card>

        {/* ===== 2ª página — Fotos ===== */}
        <Section>Fotos — Vista completa del freno</Section>
        <PhotoBlock title="Lado Izquierdo" value={photos.vista_izquierda} onChange={v => updPhoto('vista_izquierda', v)} />
        <PhotoBlock title="Lado Derecho" value={photos.vista_derecha} onChange={v => updPhoto('vista_derecha', v)} />
        <Section>Fotos — Otro</Section>
        <PhotoBlock title="OTRO (1)" value={photos.otro_1} onChange={v => updPhoto('otro_1', v)} />
        <PhotoBlock title="OTRO (2)" value={photos.otro_2} onChange={v => updPhoto('otro_2', v)} />

        <TouchableOpacity onPress={onGuardar} style={[styles.btn, styles.btnPrimary]}>
          <Text style={[styles.btnText, { color: '#fff' }]}>{saving ? 'Guardando…' : 'Guardar'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// —— helpers ——
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',','.')); return Number.isFinite(n) ? n : null;
};
const txt = (v) => (v == null || v === '' ? null : String(v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const promedio = (arr) => {
  const xs = arr.map(num).filter(isNum);
  if (!xs.length) return null;
  const s = xs.reduce((a,b)=>a+b,0); return Math.round((s/xs.length)*100)/100;
};
const yn    = (v) => v == null ? null : (v==='Si');
const bm    = (v) => v == null ? null : (v==='Bien' ? 'bien' : (v==='Mal' ? 'mal':null));
const okseg = (v) => v == null ? null : (v==='Ok' ? 'ok' : (v==='Necesita Seguimiento' ? 'seguimiento':null));
const sinoNa= (v) => v == null ? null : (v==='Si' ? 'si' : (v==='No' ? 'no' : (v==='N/A' ? 'na': null)));

const styles = StyleSheet.create({
  section:{ marginTop:18, fontSize:18, fontWeight:'800', color:'#1f2937' },
  card:{ backgroundColor:'#fff', borderRadius:14, padding:16, marginTop:10, borderWidth:1, borderColor:'#e5e7eb', shadowColor:'#000', shadowOpacity:0.03, shadowRadius:6, elevation:1 },
  label:{ fontSize:12, color:'#6b7280', marginBottom:6 },
  input:{ borderWidth:1, borderColor:'#d1d5db', borderRadius:12, paddingVertical:12, paddingHorizontal:14, backgroundColor:'#fff', fontSize:16, color:'#111827' },
  readonly:{ borderWidth:1, borderColor:'#e5e7eb', borderRadius:12, paddingVertical:12, paddingHorizontal:14, backgroundColor:'#f9fafb' },
  readonlyText:{ fontSize:16, color:'#111827' },
  row2:{ flexDirection:'row', gap:12, flexWrap:'wrap' },
  col:{ flexGrow:1, flexBasis:0, minWidth:220 },
  chipsWrap:{ flexDirection:'row', flexWrap:'wrap', gap:10 },
  chip:{ borderWidth:1, borderColor:'#c7cdd6', paddingVertical:10, paddingHorizontal:14, borderRadius:999, backgroundColor:'#fff' },
  chipOn:{ backgroundColor:'#111827', borderColor:'#111827' },
  chipText:{ color:'#111827', fontWeight:'700' },
  chipTextOn:{ color:'#fff' },
  btn:{ marginTop:20, padding:16, borderRadius:14, alignItems:'center' },
  btnPrimary:{ backgroundColor:'#2563eb' },
  btnText:{ fontWeight:'900', fontSize:16 },
  // Fotos
  photoBlockTitle:{ fontSize:16, fontWeight:'800', marginBottom:8, color:'#111827' },
  photoColumns:{ flexDirection:'row', gap:12, flexWrap:'wrap' },
  photoCol:{ flexGrow:1, flexBasis:0, minWidth:260 },
  photoColHeader:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  photoColTitle:{ fontWeight:'800', color:'#374151' },
  photoAdd:{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#0ea5e9', borderRadius:999 },
  photoAddText:{ color:'#fff', fontWeight:'800' },
  photoGrid:{ flexDirection:'row', flexWrap:'wrap', gap:10 },
  photoItem:{ width:150, borderWidth:1, borderColor:'#e5e7eb', borderRadius:12, overflow:'hidden', backgroundColor:'#fff' },
  photoImg:{ width:'100%', height:100, backgroundColor:'#f3f4f6' },
  photoNote:{ paddingHorizontal:8, paddingVertical:8, borderTopWidth:1, borderTopColor:'#eef2f7' },
  photoRemove:{ alignItems:'center', paddingVertical:8, borderTopWidth:1, borderTopColor:'#eef2f7', backgroundColor:'#fee2e2' },
  photoRemoveText:{ color:'#991b1b', fontWeight:'700' },
});
