// app/tecnico/ordenes/[orderid]/mantto-freno-pmf.js
import React, { useEffect, useMemo, useState, useCallback, use } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Switch } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';
import api from '../../../../src/services/api';

// —— UI utilitaria (mismo patrón que tu ejemplo) ——
const Section = ({ children }) => <Text style={styles.section}>{children}</Text>;
const Card    = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;
const Label   = ({ children, style }) => <Text style={[styles.label, style]}>{children}</Text>;
const Input   = (props) => <TextInput {...props} style={[styles.input, props.style]} />;
const Readonly= ({ children }) => (<View style={styles.readonly}><Text style={styles.readonlyText}>{String(children ?? '—')}</Text></View>);
const Row2    = ({ children }) => <View style={styles.row2}>{children}</View>;
const Col     = ({ children, min = 220 }) => <View style={[styles.col, { minWidth: min }]}>{children}</View>;
const Chips   = ({ options, value, onChange }) => (
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
const YN  = ({ value, onChange }) => <Chips options={['Si','No']} value={value} onChange={onChange} />;
const BM  = ({ value, onChange }) => <Chips options={['Bien','Mal']} value={value} onChange={onChange} />;

// —— Formulario principal ——
export default function ManttoFrenoPMFForm() {
  const { orderid } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]  = useState(false);
  const [auto, setAuto]      = useState(null); // datos auto-cargados (equipo, técnico, etc.)

  // ===== Encabezado del documento (según formato) =====
  const [cliente, setCliente]           = useState('');
  const [noEquipo, setNoEquipo]         = useState('');
  const [tecnicoNombre, setTecnicoNombre]= useState('');
  const [tecnicoNomina, setTecnicoNomina]= useState('');
  const [fecha, setFecha]               = useState('');      // DD/MM/AAAA
  const [horario, setHorario]           = useState('');      // 08:00–12:00
  const [control, setControl]           = useState('');
  const [tipoMT, setTipoMT]             = useState('');      // PM / PMF, etc.
  const [velNominal, setVelNominal]     = useState('');      // [m/min]
  const [capacidadKg, setCapacidadKg]   = useState('');      // [kg]

  // ===== REPORTE (inspección visual) — se registra implícitamente en payload =====

  // ===== CONDICIÓN DE OPERACIÓN DEL FRENO =====
  const [tornillo_ajuste_torque, setTornilloAjusteTorque] = useState(null); // Bien/Mal
  const [ruido_apertura_cierre, setRuidoAperturaCierre]   = useState(null); // Bien/Mal
  const [balatas_izq, setBalatasIzq]                      = useState(null); // Bien/Mal (aceite o grasa en balatas)
  const [balatas_der, setBalatasDer]                      = useState(null); // Bien/Mal

  // ===== CONDICIÓN DE TAMBOR =====
  const [tambor_aceite_grasa, setTamborAceiteGrasa]       = useState(null); // Bien/Mal
  const [tambor_oxido, setTamborOxido]                    = useState(null); // Bien/Mal

  // ===== TUBOS DE DRENADO =====
  const [tubo_transparente, setTuboTransparente]          = useState(null); // Bien/Mal
  const [tubo_negro, setTuboNegro]                        = useState(null); // Bien/Mal

  // ===== MICRO SWITCH =====
  const [ms_cond_fisica_izq, setMsCondFisicaIzq]          = useState(null); // Bien/Mal
  const [ms_cond_fisica_der, setMsCondFisicaDer]          = useState(null); // Bien/Mal
  const [ms_conexiones_izq, setMsConexionesIzq]           = useState(null); // Bien/Mal
  const [ms_conexiones_der, setMsConexionesDer]           = useState(null); // Bien/Mal

  // ===== CONDICIONES DE OPERACIÓN (prueba de funcionamiento) =====
  const [prueba_funcionamiento, setPruebaFuncionamiento]  = useState(null); // Bien/Mal

  // ===== OBSERVACIONES / RESULTADO =====
  const [observaciones, setObservaciones]                 = useState('');
  const [resultado, setResultado]                         = useState('bien'); // 'bien' | 'seguimiento'
  const [detalleSeguimiento, setDetalleSeguimiento]       = useState('');

  // ===== Firmas (switch para marcar que se firmó) =====
  const [firmaMecanico, setFirmaMecanico]   = useState(false);
  const [firmaSupervisor, setFirmaSupervisor]= useState(false);

  // ===== Prefill con fecha actual =====
  useEffect(() => {
    const d = new Date();
    setFecha(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);
  }, []);

  // ===== Carga inicial (opcional, como tu ejemplo) =====
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const res = await api.get(`/mantenimiento-freno-pm-pmf/datos/${orderid}`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      });
      if (res.status >= 400) throw new Error(res.data?.error || 'No se pudo cargar');

      const { auto: a, form } = res.data || {};
      setAuto(a || {});

      // Prefill desde “auto” (ajusta a tus claves reales)
      setCliente(a?.cliente || '');
      setNoEquipo(a?.equipo || '');
      setTecnicoNombre(a?.tecnico_nombre || '');
      setTecnicoNomina(a?.nomina || '');

      // Si ya existe un “form” guardado previamente, puedes hidratar aquí:
      if (form) {
        // (ejemplo) setResultado(form?.resultado?.tipo === 'seguimiento' ? 'seguimiento' : 'bien');
        // Carga selectiva si te interesa re-editar; lo dejo simple para no alargar.
      }
    } catch (e) {
      console.error('[PMF load]', e);
      Alert.alert('Error', e.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [orderid]);

  useEffect(() => { load(); }, [load]);

  // ===== Guardar =====
  const onGuardar = async () => {
    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('token');

      const payload = buildPayload();
      const res = await api.post('/registro-mantto-freno/guardar', payload, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      });
      if (res.status >= 400) throw new Error(res.data?.error || 'No se pudo guardar');

      Alert.alert('Listo', 'Formulario guardado', [{ text: 'OK', onPress: () => router.back() }]);
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
      cliente: txt(cliente),
      no_equipo: txt(noEquipo),
      tecnico: { nombre: txt(tecnicoNombre), nomina: txt(tecnicoNomina) },
      fecha: txt(fecha),
      horario: txt(horario),
      control: txt(control),
      tipo_mt: txt(tipoMT),                    // PM / PMF
      velocidad_mmin: num(velNominal),         // [m/min]
      capacidad_kg: num(capacidadKg),          // [kg]
      reporte: 'inspeccion_visual_freno'       // según el layout del formato
    },
    condiciones_operacion_freno: {
      tornillo_ajuste_torque: bm(tornillo_ajuste_torque), // 1
      ruido_apertura_cierre: bm(ruido_apertura_cierre),   // 2
      balatas: {
        izquierdo: bm(balatas_izq),                        // 3 IZQ
        derecho:   bm(balatas_der)                         // 3 DER
      }
    },
    condicion_tambor: {
      aceite_o_grasa: bm(tambor_aceite_grasa),
      oxido:          bm(tambor_oxido)
    },
    tubos_drenado: {
      transparente: bm(tubo_transparente),
      negro:        bm(tubo_negro)
    },
    micro_switch: {
      condicion_fisica: { izquierdo: bm(ms_cond_fisica_izq), derecho: bm(ms_cond_fisica_der) },
      conexiones:      { izquierdo: bm(ms_conexiones_izq),   derecho: bm(ms_conexiones_der)   }
    },
    prueba_funcionamiento: bm(prueba_funcionamiento),
    observaciones: txt(observaciones),
    resultado: {
      tipo: (resultado === 'seguimiento' ? 'seguimiento' : 'bien'),
      detalle: txt(detalleSeguimiento)
    },
    firmas: {
      mecanico_firma_y_fecha: !!firmaMecanico,
      supervisor_firma_y_fecha: !!firmaSupervisor
    }
  });

  if (loading) {
    return (
      <View style={{flex:1,justifyContent:'center',alignItems:'center'}}>
        <ActivityIndicator size="large"/><Text style={{marginTop:8}}>Cargando…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex:1, backgroundColor:'#F5F7FB' }}>
      <Header title="Registro de mantenimiento de freno (PM/PMF)" />
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:180 }}>
        {/* ENCABEZADO */}
        <Section>Datos del documento</Section>
        <Card>
          <Row2>
            <Col><Label>CLIENTE</Label><Input value={cliente} onChangeText={setCliente} placeholder="Cliente / Razón social" /></Col>
            <Col><Label>No. EQUIPO</Label><Input value={noEquipo} onChangeText={setNoEquipo} placeholder={auto?.equipo || '—'} /></Col>
          </Row2>
          <Row2>
            <Col>
              <Label>NOMBRE DEL TÉCNICO</Label>
              <Input value={tecnicoNombre} onChangeText={setTecnicoNombre} placeholder={auto?.tecnico_nombre || '—'} />
            </Col>
            <Col>
              <Label>No. NÓMINA</Label>
              <Input value={tecnicoNomina} onChangeText={setTecnicoNomina} placeholder={auto?.nomina || '—'}  />
            </Col>
          </Row2>
          <Row2>
            <Col><Label>FECHA</Label><Input value={fecha} onChangeText={setFecha} placeholder="DD/MM/AAAA" /></Col>
            <Col><Label>HORARIO</Label><Input value={horario} onChangeText={setHorario} placeholder="08:00–12:00" /></Col>
          </Row2>
          <Row2>
            <Col><Label>CONTROL</Label><Input value={control} onChangeText={setControl} /></Col>
            <Col><Label>TIPO DE MT</Label><Input value={tipoMT} onChangeText={setTipoMT} placeholder="PM / PMF" /></Col>
          </Row2>
          <Row2>
            <Col><Label>VELOCIDAD NOMINAL [m/min]</Label><Input keyboardType="numeric" value={velNominal} onChangeText={setVelNominal} /></Col>
            <Col><Label>CAPACIDAD [kg]</Label><Input keyboardType="numeric" value={capacidadKg} onChangeText={setCapacidadKg} /></Col>
          </Row2>
        </Card>

        {/* CONDICIÓN DE OPERACIÓN DEL FRENO */}
        <Section>Condición de operación del freno</Section>
        <Card>
          <Row2>
            <Col><Label>1) Revisión de tornillo de ajuste de torque</Label><BM value={tornillo_ajuste_torque} onChange={setTornilloAjusteTorque}/></Col>
            <Col><Label>2) Ruido a la apertura y cierre</Label><BM value={ruido_apertura_cierre} onChange={setRuidoAperturaCierre}/></Col>
          </Row2>
          <Row2>
            <Col><Label>3) Aceite o grasa en balatas (IZQ.)</Label><BM value={balatas_izq} onChange={setBalatasIzq}/></Col>
            <Col><Label>3) Aceite o grasa en balatas (DER.)</Label><BM value={balatas_der} onChange={setBalatasDer}/></Col>
          </Row2>
        </Card>

        {/* CONDICIÓN DE TAMBOR */}
        <Section>Condición de tambor</Section>
        <Card>
          <Row2>
            <Col><Label>¿Hay existencia de aceite o grasa?</Label><BM value={tambor_aceite_grasa} onChange={setTamborAceiteGrasa}/></Col>
            <Col><Label>Óxido</Label><BM value={tambor_oxido} onChange={setTamborOxido}/></Col>
          </Row2>
        </Card>

        {/* TUBOS DE DRENADO */}
        <Section>Tubos de drenado</Section>
        <Card>
          <Row2>
            <Col><Label>Tubo transparente</Label><BM value={tubo_transparente} onChange={setTuboTransparente}/></Col>
            <Col><Label>Tubo negro</Label><BM value={tubo_negro} onChange={setTuboNegro}/></Col>
          </Row2>
        </Card>

        {/* MICRO SWITCH */}
        <Section>Micro switch</Section>
        <Card>
          <Row2>
            <Col><Label>Condición física (IZQ.)</Label><BM value={ms_cond_fisica_izq} onChange={setMsCondFisicaIzq}/></Col>
            <Col><Label>Condición física (DER.)</Label><BM value={ms_cond_fisica_der} onChange={setMsCondFisicaDer}/></Col>
          </Row2>
          <Row2>
            <Col><Label>Conexiones (IZQ.)</Label><BM value={ms_conexiones_izq} onChange={setMsConexionesIzq}/></Col>
            <Col><Label>Conexiones (DER.)</Label><BM value={ms_conexiones_der} onChange={setMsConexionesDer}/></Col>
          </Row2>
        </Card>

        {/* PRUEBA DE FUNCIONAMIENTO */}
        <Section>Condiciones de operación del freno</Section>
        <Card>
          <Row2>
            <Col><Label>Prueba de funcionamiento</Label><BM value={prueba_funcionamiento} onChange={setPruebaFuncionamiento}/></Col>
          </Row2>
        </Card>

        {/* OBSERVACIONES */}
        <Section>Observaciones</Section>
        <Card>
          <Input value={observaciones} onChangeText={setObservaciones} placeholder="Escribe las observaciones..." multiline />
        </Card>

        {/* RESULTADO */}
        <Section>Resultado total del trabajo</Section>
        <Card>
          <Label>Selecciona</Label>
          <Chips options={['bien','seguimiento']} value={resultado} onChange={setResultado}/>
          <Label style={{marginTop:10}}>Detalle (si requiere seguimiento)</Label>
          <Input value={detalleSeguimiento} onChangeText={setDetalleSeguimiento} placeholder="[DETALLE]" multiline />
        </Card>

        {/* FIRMAS */}
        <Section>Firmas</Section>
        <Card>
          <Row2>
            <Col>
              <Label>Personal de mantenimiento que elaboró — Firma y fecha</Label>
              <Switch value={!!firmaMecanico} onValueChange={setFirmaMecanico}/>
            </Col>
            <Col>
              <Label>Aprobación del supervisor de mantenimiento — Firma y fecha</Label>
              <Switch value={!!firmaSupervisor} onValueChange={setFirmaSupervisor}/>
            </Col>
          </Row2>
        </Card>

        {/* ACCIÓN */}
        <TouchableOpacity onPress={onGuardar} style={[styles.btn, styles.btnPrimary]}>
          <Text style={[styles.btnText, { color: '#fff' }]}>{saving ? 'Guardando…' : 'Guardar'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <Footer />
    </View>
  );
}

// —— helpers ——
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',','.')); return Number.isFinite(n) ? n : null;
};
const txt = (v) => (v == null || v === '' ? null : String(v));
const bm  = (v) => v == null ? null : (v==='Bien' ? 'bien' : (v==='Mal' ? 'mal':null));

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
});
