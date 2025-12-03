import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import { router } from 'expo-router';
import { addAviso } from '../../../src/store/avisosStore';
import * as ImagePicker from 'expo-image-picker';
import { generarSolicitudPdf } from '../../../src/utils/solicitudCotizacionPdf';

const TIPOS_EQUIPO = ['Elevador', 'Escalera eléctrica', 'Andén', 'Montacargas'];
const UBICACIONES  = ['Cuarto de máquinas', 'Cubo', 'Cabina', 'Fosa'];
const CONTRATOS    = ['vigente', 'postventa', 'recuperacion'];

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

export default function CrearAviso() {
  // Datos auto (visibles)
  const hoy = new Date();
  const fechaForm = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`;

  const [cliente] = useState({
    fecha: fechaForm,
    razonSocial: 'Cliente de prueba S.A. de C.V.',
    mx: 'MX-000',
    cm: 'CM-000',
    direccion: 'Calle Falsa 123, CDMX',
    solicitante: 'Técnico Demo',
    email: 'tecnico.demo@empresa.com',
    contrato: 'vigente', // single-select abajo si lo quieres editable
    puesto: 'Técnico',
    telefono: '55-0000-0000',
    cobertura: 'CDMX'
  });

  // Equipo (single-select en tipo y ubicación)
  const [equipo, setEquipo] = useState({
    tipo: '',
    maquina: '',
    control: '',
    capacidad: '',
    velocidad: '',
    voltaje: '',
    pisosServicio: '',
    modelo: '',
    numeroEquipo: '',
    ubicacion: ''
  });

  // Reporte
  const [observaciones, setObservaciones] = useState('');
  const [funcionando, setFuncionando] = useState(null); // null | true | false

  // Partes (límite 10)
  const [partesElec, setPartesElec] = useState([{ concepto: '', partePlano: '', cantidad: '', analisisFalla: '' }]);
  const [partesMec,  setPartesMec ] = useState([{ concepto: '', partePlano: '', cantidad: '' }]);

  // Software
  const [cambiosSoftware, setCambiosSoftware]   = useState('');
  const [conceptoSoftware, setConceptoSoftware] = useState('');

  // Fotos
  const [fotos, setFotos] = useState([]);

  useEffect(() => {
    (async () => {
      await ImagePicker.requestCameraPermissionsAsync();
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    })();
  }, []);

  const addFilaElec = () => {
    if (partesElec.length >= 10) return Alert.alert('Límite', 'Máximo 10 registros electrónicos.');
    setPartesElec([...partesElec, { concepto: '', partePlano: '', cantidad: '', analisisFalla: '' }]);
  };
  const addFilaMec = () => {
    if (partesMec.length >= 10) return Alert.alert('Límite', 'Máximo 10 registros mecánicos.');
    setPartesMec([...partesMec, { concepto: '', partePlano: '', cantidad: '' }]);
  };

  const patchArray = (setter, arr, index, patch) => {
    const next = [...arr];
    next[index] = { ...next[index], ...patch };
    setter(next);
  };

  const pickFromCamera = async () => {
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) setFotos([...fotos, res.assets[0].uri]);
  };
  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true });
    if (!res.canceled) setFotos([...fotos, ...res.assets.map(a => a.uri)]);
  };

  const onSave = () => {
    if (!equipo.tipo) return Alert.alert('Falta información', 'Selecciona el tipo de equipo.');
    if (funcionando === null) return Alert.alert('Falta información', 'Indica si el equipo está funcionando.');
    if (!observaciones.trim()) return Alert.alert('Falta información', 'Captura las observaciones.');

    const payload = {
      cliente: {
        razonSocial: cliente.razonSocial, mx: cliente.mx, cm: cliente.cm, direccion: cliente.direccion,
        solicitante: cliente.solicitante, email: cliente.email, contrato: cliente.contrato,
        puesto: cliente.puesto, telefono: cliente.telefono, cobertura: cliente.cobertura
      },
      equipo,
      reporte: { observaciones, funcionando },
      partesElectronicas: partesElec.filter(p => p.concepto || p.partePlano || p.cantidad || p.analisisFalla),
      partesMecanicas:   partesMec.filter(p => p.concepto || p.partePlano || p.cantidad),
      software: { cambios: cambiosSoftware, concepto: conceptoSoftware },
      fotos
    };

    const id = addAviso(payload);
    Alert.alert('Listo', `Se creó el aviso ${id}.`, [{ text: 'OK', onPress: () => router.replace('/tecnico/avisos') }]);
  };

  const onPdf = async () => {
    try {
      if (!equipo.tipo) return Alert.alert('Falta información', 'Selecciona el tipo de equipo para el PDF.');
      await generarSolicitudPdf({
        fecha: cliente.fecha,
        cliente,
        equipo,
        reporte: { observaciones, funcionando },
        partesElectronicas: partesElec.filter(p => p.concepto || p.partePlano || p.cantidad || p.analisisFalla),
        partesMecanicas:   partesMec.filter(p => p.concepto || p.partePlano || p.cantidad),
        software: { cambios: cambiosSoftware, concepto: conceptoSoftware },
        fotos
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo generar el PDF.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Nuevo aviso de avería" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>

        {/* DATOS AUTO (visibles) */}
        <Text style={styles.section}>Datos del cliente </Text>
        <View style={styles.card}>
          <Row label="Fecha"        value={cliente.fecha} />
          <Row label="Razón social" value={cliente.razonSocial} />
          <View style={styles.row2}>
            <Row label="MX" value={cliente.mx} half />
            <Row label="CM" value={cliente.cm} half />
          </View>
          <Row label="Dirección"    value={cliente.direccion} />
          <View style={styles.row2}>
            <Row label="Solicitante" value={cliente.solicitante} half />
            <Row label="Puesto"      value={cliente.puesto} half />
          </View>
          <View style={styles.row2}>
            <Row label="Email"    value={cliente.email} half />
            <Row label="Teléfono" value={cliente.telefono} half />
          </View>
          <View style={styles.row2}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Contrato</Text>
              <RadioChips options={CONTRATOS} value={cliente.contrato} onChange={() => {}} />
              <Text style={styles.helper}>* En prueba lo dejamos fijo en “{cliente.contrato}”.</Text>
            </View>
            <Row label="Cobertura" value={cliente.cobertura} half />
          </View>
        </View>

        {/* EQUIPO */}
        <Text style={styles.section}>Datos del equipo</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Tipo de equipo</Text>
          <RadioChips options={TIPOS_EQUIPO} value={equipo.tipo} onChange={(v) => setEquipo({ ...equipo, tipo: v })} />

          <BigField label="Máquina" value={equipo.maquina} onChange={(v)=>setEquipo({ ...equipo, maquina:v })} />
          <BigField label="Control" value={equipo.control} onChange={(v)=>setEquipo({ ...equipo, control:v })} />
          <BigField label="Capacidad" value={equipo.capacidad} onChange={(v)=>setEquipo({ ...equipo, capacidad:v })} />
          <BigField label="Velocidad" value={equipo.velocidad} onChange={(v)=>setEquipo({ ...equipo, velocidad:v })} />
          <BigField label="Voltaje" value={equipo.voltaje} onChange={(v)=>setEquipo({ ...equipo, voltaje:v })} />
          <BigField label="Pisos de servicio" value={equipo.pisosServicio} onChange={(v)=>setEquipo({ ...equipo, pisosServicio:v })} />
          <BigField label="Modelo" value={equipo.modelo} onChange={(v)=>setEquipo({ ...equipo, modelo:v })} />
          <BigField label="No. de equipo" value={equipo.numeroEquipo} onChange={(v)=>setEquipo({ ...equipo, numeroEquipo:v })} />

          <Text style={styles.label}>Ubicación</Text>
          <RadioChips options={UBICACIONES} value={equipo.ubicacion} onChange={(v)=>setEquipo({ ...equipo, ubicacion:v })} />
        </View>

        {/* REPORTE */}
        <Text style={styles.section}>Reporte / Especificación de falla</Text>
        <View style={styles.card}>
          <BigField label="Observaciones" value={observaciones} onChange={setObservaciones} multiline />
          <Text style={styles.label}>¿Funcionando?</Text>
          <View style={styles.chipsWrap}>
            <TouchableOpacity style={[styles.chip, funcionando===true && styles.chipOn]} onPress={()=>setFuncionando(true)}>
              <Text style={[styles.chipText, funcionando===true && styles.chipTextOn]}>Sí</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, funcionando===false && styles.chipOn]} onPress={()=>setFuncionando(false)}>
              <Text style={[styles.chipText, funcionando===false && styles.chipTextOn]}>No</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PARTES ELECTRÓNICAS */}
        <Text style={styles.section}>Partes electrónicas y/o eléctricas</Text>
        {partesElec.map((p, i) => (
          <View key={`elec-${i}`} style={styles.card}>
            <BigField label="Concepto" value={p.concepto} onChange={(v)=>patchArray(setPartesElec, partesElec, i, { concepto:v })} />
            <BigField label="No. de parte - plano" value={p.partePlano} onChange={(v)=>patchArray(setPartesElec, partesElec, i, { partePlano:v })} />
            <BigField label="Cantidad" value={p.cantidad} onChange={(v)=>patchArray(setPartesElec, partesElec, i, { cantidad:v })} keyboardType="numeric" />
            <BigField label="¿Cómo determinó el cambio? (análisis de la falla)" value={p.analisisFalla} onChange={(v)=>patchArray(setPartesElec, partesElec, i, { analisisFalla:v })} multiline />
          </View>
        ))}
        <TouchableOpacity onPress={addFilaElec} style={styles.addBtn}><Text style={styles.addBtnText}>+ Agregar parte electrónica</Text></TouchableOpacity>

        {/* PARTES MECÁNICAS */}
        <Text style={styles.section}>Partes mecánicas y/o reparación mayor</Text>
        {partesMec.map((p, i) => (
          <View key={`mec-${i}`} style={styles.card}>
            <BigField label="Concepto" value={p.concepto} onChange={(v)=>patchArray(setPartesMec, partesMec, i, { concepto:v })} />
            <BigField label="No. de parte - plano" value={p.partePlano} onChange={(v)=>patchArray(setPartesMec, partesMec, i, { partePlano:v })} />
            <BigField label="Cantidad" value={p.cantidad} onChange={(v)=>patchArray(setPartesMec, partesMec, i, { cantidad:v })} keyboardType="numeric" />
          </View>
        ))}
        <TouchableOpacity onPress={addFilaMec} style={styles.addBtn}><Text style={styles.addBtnText}>+ Agregar parte mecánica</Text></TouchableOpacity>

        {/* SOFTWARE */}
        <Text style={styles.section}>Modificación de software</Text>
        <View style={styles.card}>
          <BigField label="Cambios que se requieren" value={cambiosSoftware} onChange={setCambiosSoftware} multiline />
          <BigField label="Concepto" value={conceptoSoftware} onChange={setConceptoSoftware} />
        </View>

        {/* FOTOS */}
        <Text style={styles.section}>Anexar fotografías</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity style={styles.outlineBtn} onPress={pickFromCamera}><Text style={styles.outlineBtnText}>Tomar foto</Text></TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={pickFromGallery}><Text style={styles.outlineBtnText}>Galería</Text></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          {fotos.map((uri, idx) => <Image key={idx} source={{ uri }} style={styles.photo} />)}
        </ScrollView>

        <TouchableOpacity style={styles.primary} onPress={onSave}>
          <Text style={styles.primaryText}>Guardar aviso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primary, { backgroundColor: '#0A84FF', marginTop: 12 }]} onPress={onPdf}>
          <Text style={styles.primaryText}>Generar PDF</Text>
        </TouchableOpacity>

      </ScrollView>
      <Footer />
    </View>
  );
}

function Row({ label, value, half = false }) {
  return (
    <View style={[{ marginBottom: 12 }, half && { flex: 1 }]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}><Text style={styles.readonlyText}>{String(value || '—')}</Text></View>
    </View>
  );
}

function BigField({ label, value, onChange, multiline=false, keyboardType='default' }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 120, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, fontSize: 18, fontWeight: '800', color: '#1f2937' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 10,
    borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1
  },
  row2: { flexDirection: 'row', gap: 12 },
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
  helper: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  addBtn: { alignSelf: 'flex-start', marginTop: 8 },
  addBtnText: { color: '#0A84FF', fontWeight: '800' },
  outlineBtn: { borderWidth: 1, borderColor: '#0A84FF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  outlineBtnText: { color: '#0A84FF', fontWeight: '800', fontSize: 14 },
  photo: { width: 130, height: 130, borderRadius: 12, marginRight: 10, backgroundColor: '#e5e7eb' },
  primary: { marginTop: 20, backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
