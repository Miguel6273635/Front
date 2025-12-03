import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Header from '../../../../../src/components/Header';
import Footer from '../../../../../src/components/Footer';
import Signature from 'react-native-signature-canvas';
import { generarMantenimientoPdf } from '../../../../../src/utils/mantenimientoPdf';

// Pega aquí tu logo en base64 como data URL (temporal para pruebas)
const LOGO_DATA_URL = 'data:image/png;base64,AAAA...'; // <<<< REEMPLAZA por tu base64


export default function FormMantenimiento() {
  const { orderId, tipo } = useLocalSearchParams(); // 'elevador' | 'escalera'

  // ===== Prefill demo (cámbialo luego por datos reales de tu API) =====
  const now = new Date();
  const [contrato, setContrato] = useState('VIGENTE');
  const [folio, setFolio] = useState('CDMX 123456');
  const [cliente, setCliente] = useState('Cliente Demo S.A. de C.V.');
  const [tecnico, setTecnico] = useState('Técnico Demo');
  const [fecha, setFecha] = useState(now.toLocaleDateString());
  const [horaEntrada, setHoraEntrada] = useState('09:00');
  const [horaSalida, setHoraSalida] = useState('11:00');

  // Detalle, refacciones, cargo, código
  const [detalleTrabajo, setDetalleTrabajo] = useState('');
  const [refacciones, setRefacciones] = useState([{ cantidad: '', descripcion: '' }]);
  const addRef = () => setRefacciones((prev)=>[...prev,{ cantidad:'', descripcion:'' }]);
  const [cargoCliente, setCargoCliente] = useState(null); // 'SI' | 'NO'
  const [codigoInterno, setCodigoInterno] = useState('');

  // Firma + datos del cliente que firma
  const [firmaCliente, setFirmaCliente] = useState(null); // dataURL
  const [nombreCliente, setNombreCliente] = useState('');
  const [cargoDelCliente, setCargoDelCliente] = useState('');
  const refSig = useRef(null);

  // Checklist simple (lo dejamos como “OK/NO” por fila; si quieres tabla 1..6 la activamos después)
  const checklistElevador = [
    'COND. CUARTO DE MAQUINA','COND. FUNCIONAMIENTO TOTAL CUARTO DE MAQ.',
    'COND. FUNCIONAMIENTO DE CABINA','ILUMINACIÓN Y ACABADO DE CABINA',
    'LUZ DE EMERGENCIA','INTERLOCK','SW LIMITE'
  ];
  const checklistEscalera = [
    'PARTIDA DE TRABAJO','CONDICIONES DE TRABAJO','CONDICIONES DE MANEJO',
    'SW. OPERADOR','ACCION DE BOTON','ILUMINACIÓN Y ACABADO','CHEQUEO DE CORRIENTE'
  ];
  const base = tipo === 'elevador' ? checklistElevador : checklistEscalera;
  const [checks, setChecks] = useState(() => Object.fromEntries(base.map(k=>[k,false])));
  const toggle = (k)=> setChecks(s=>({ ...s, [k]: !s[k]}));

  const onPdf = async () => {
    try {
      const payload = {
        tipo: tipo || 'elevador',
        contrato,
        orden: String(orderId || ''),
        folio,                 // ej. "CDMX 123456"
        cliente,
        tecnico,
        fecha,
        horaEntrada,
        horaSalida,
        detalleTrabajo,
        refacciones: refacciones.filter(r => r.cantidad || r.descripcion),
        cargoCliente,          // 'SI' | 'NO'
        codigoInterno,

        // Checklist simple (marca última columna “OK”):
        checklist: Object.entries(checks).filter(([, ok]) => ok).map(([k]) => k),

        // Firma + nombre + cargo
        firmaCliente,          // viene de Signature => data:image/png;base64,...
        nombreCliente,
        cargoDelCliente,

        // LOGO:
        logoDataUrl: LOGO_DATA_URL,
      };

      await generarMantenimientoPdf(payload);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo generar el PDF.');
    }
  };


  return (
    <View style={{ flex: 1, backgroundColor: '#F7F7F9' }}>
      <Header title={`Mantenimiento (${tipo || 'equipo'})`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text style={st.section}>Datos</Text>
        <View style={st.card}>
          <Row l="Contrato" v={contrato} onChange={setContrato} />
          <Row l="No. Orden" v={String(orderId || '')} onChange={()=>{}} readonly />
          <Row l="No. de folio (CDMX ######)" v={folio} onChange={setFolio} />
          <Row l="Cliente" v={cliente} onChange={setCliente} />
          <Row l="Técnico" v={tecnico} onChange={setTecnico} />
          <Row l="Fecha" v={fecha} onChange={setFecha} />
          <View style={{ flexDirection:'row', gap:10 }}>
            <Row l="Hora entrada" v={horaEntrada} onChange={setHoraEntrada} half />
            <Row l="Hora salida" v={horaSalida} onChange={setHoraSalida} half />
          </View>
        </View>

        <Text style={st.section}>Checklist ({tipo==='elevador'?'Elevador':'Escalera'})</Text>
        <View style={st.card}>
          {base.map(item=>(
            <TouchableOpacity key={item} style={st.checkRow} onPress={()=>toggle(item)}>
              <View style={[st.checkbox, checks[item] && st.checkboxOn]} />
              <Text style={st.checkText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={st.section}>Detalle de trabajo</Text>
        <View style={st.card}>
          <TextInput
            style={[st.input,{ height:120, textAlignVertical:'top'}]}
            multiline placeholder="Describe el trabajo realizado…"
            value={detalleTrabajo} onChangeText={setDetalleTrabajo}
          />
        </View>

        <Text style={st.section}>Refacciones utilizadas</Text>
        <View style={st.card}>
          {refacciones.map((r, i)=>(
            <View key={i} style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
              <TextInput style={[st.input,{ width:70 }]} keyboardType="numeric"
                placeholder="Cant." value={r.cantidad}
                onChangeText={(v)=> setRefacciones(cur=>cur.map((x,idx)=>idx===i?{...x,cantidad:v}:x))}
              />
              <TextInput style={[st.input,{ flex:1 }]} placeholder="Descripción" value={r.descripcion}
                onChangeText={(v)=> setRefacciones(cur=>cur.map((x,idx)=>idx===i?{...x,descripcion:v}:x))}
              />
            </View>
          ))}
          <TouchableOpacity onPress={addRef}><Text style={{ color:'#0A84FF', fontWeight:'800' }}>+ Agregar</Text></TouchableOpacity>
        </View>

        <Text style={st.section}>Con cargo al cliente</Text>
        <View style={st.card}>
          <View style={{ flexDirection:'row', gap:10 }}>
            <Chip text="Sí" on={cargoCliente==='SI'} onPress={()=>setCargoCliente('SI')} />
            <Chip text="No" on={cargoCliente==='NO'} onPress={()=>setCargoCliente('NO')} />
          </View>
          <Text style={[st.label,{ marginTop:12 }]}>Código interno</Text>
          <TextInput style={st.input} value={codigoInterno} onChangeText={setCodigoInterno} placeholder="Código…" />
        </View>

        <Text style={st.section}>Firma del cliente</Text>
        <View style={st.card}>
          {firmaCliente
            ? <Image source={{ uri: firmaCliente }} style={{ width:'100%', height:140, borderRadius:8, backgroundColor:'#fafafa' }} />
            : <Text style={{ marginBottom:6, color:'#6b7280' }}>Firma dentro del recuadro y presiona “OK”.</Text>
          }
          <View style={{ height:200, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8, overflow:'hidden' }}>
            <Signature
              ref={refSig}
              onOK={(sig)=> setFirmaCliente(sig)}
              onEmpty={()=> Alert.alert('Atención','No se detectó firma.')}
              descriptionText="Firme aquí" clearText="Limpiar" confirmText="OK"
              webStyle={`.m-signature-pad--footer{display:flex;justify-content:space-between}`}
            />
          </View>

          <Text style={[st.label,{ marginTop:12 }]}>Nombre del cliente</Text>
          <TextInput style={st.input} value={nombreCliente} onChangeText={setNombreCliente} placeholder="Nombre del cliente" />

          <Text style={[st.label,{ marginTop:12 }]}>Cargo del cliente</Text>
          <TextInput style={st.input} value={cargoDelCliente} onChangeText={setCargoDelCliente} placeholder="Cargo del cliente" />
        </View>

        <TouchableOpacity style={st.primary} onPress={onPdf}>
          <Text style={st.primaryText}>Generar PDF</Text>
        </TouchableOpacity>
      </ScrollView>
      <Footer />
    </View>
  );
}

function Row({ l, v, onChange, readonly=false, half=false }) {
  return (
    <View style={[{ marginBottom:10 }, half && { flex:1 }]}>
      <Text style={st.label}>{l}</Text>
      <TextInput style={[st.input, readonly && st.readonly]} value={v} onChangeText={onChange} placeholder={l} editable={!readonly} />
    </View>
  );
}
function Chip({ text, on, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[st.chip, on && st.chipOn]}>
      <Text style={[st.chipText, on && st.chipTextOn]}>{text}</Text>
    </TouchableOpacity>
  );
}
const st = StyleSheet.create({
  section:{ marginTop:16, fontSize:18, fontWeight:'800', color:'#1f2937' },
  card:{ backgroundColor:'#fff', borderRadius:14, padding:16, marginTop:10, borderWidth:1, borderColor:'#e5e7eb' },
  label:{ fontSize:12, color:'#6b7280', marginBottom:6 },
  input:{ borderWidth:1, borderColor:'#d1d5db', borderRadius:12, paddingVertical:12, paddingHorizontal:12, backgroundColor:'#fff', fontSize:16, color:'#111827' },
  readonly:{ backgroundColor:'#f3f4f6', color:'#6b7280' },
  checkRow:{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:6 },
  checkbox:{ width:18, height:18, borderRadius:4, borderWidth:1, borderColor:'#9ca3af', backgroundColor:'#fff' },
  checkboxOn:{ backgroundColor:'#111827', borderColor:'#111827' },
  checkText:{ fontSize:14, color:'#111827' },
  chip:{ borderWidth:1, borderColor:'#c7cdd6', paddingVertical:10, paddingHorizontal:14, borderRadius:999, backgroundColor:'#fff' },
  chipOn:{ backgroundColor:'#111827', borderColor:'#111827' },
  chipText:{ color:'#111827', fontWeight:'700' },
  chipTextOn:{ color:'#fff' },
  primary:{ marginTop:18, backgroundColor:'#16a34a', padding:16, borderRadius:14, alignItems:'center' },
  primaryText:{ color:'#fff', fontWeight:'900', fontSize:16 },
});
