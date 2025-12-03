import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';
import { useLocalSearchParams, router } from 'expo-router';
import { fetchDatosMantenimiento, guardarMantElevadores } from '../../../../src/services/mantenimiento';
import FloorSelectModal from '../../../../src/components/FloorSelectModal';

const BLOQUE_TOP = [
  'COND. CUARTO DE MÁQUINA','COND. FUNCIONAMIENTO TOTAL CTO. MAQ.','COND. FUNCIONAMIENTO DE CABINA',
  'BOTÓN E INDICADOR DE CABINA','ILUMINACIÓN Y ACABADO DE CABINA','LUZ DE EMERGENCIA',
  'BOTÓN E INDICADOR DE PISO','INDICADOR DE T/SUPERVISIÓN','CONDICIÓN DE FOSA',
  'INTERLOCK','SW LÍMITE','CONDICIÓN AMBIENTAL EN TECHO CABINA'
];
const SUBCONJUNTOS = [
  { titulo: '1.- CUARTO DE MÁQUINA', items: ['1.1 PANEL DE CONTROL','1.2 FRENO','1.3 MÁQUINA DE TRACCIÓN/MOTOR/TACOGEN.','1.4 POLEA TRACCIÓN/DEFLECTORA','1.5 GOBERNADOR'] },
  { titulo: '2.- CABINA', items: ['2.1 ACEITERA','2.2 ZAPATA DE CABINA','2.3 OPERADOR DE PUERTA','2.4 CLUTCH DE CABINA','2.5 S.D.E. E.D.M.','2.6 DESLIZADOR','2.7 SEGURO CONTRA CAÍDA'] },
  { titulo: '3.- PISOS', items: ['3.1 RIEL','3.2 INTERLOCK','3.3 DESLIZADOR','3.4 CABLE ENTREPOLEA'] },
  { titulo: '4.- CUBO', items: ['4.1 CAJA DE CONEXIÓN Y 1/2 TIRO','4.2 CABLE VIAJERO','4.3 CABLE DE TRACCIÓN','4.4 RIEL Y SOPORTE','4.5 CONTRAPESO','4.6 SW LÍMITE'] },
  { titulo: '5.- FOSA', items: ['5.1 POLEA DE TENSIÓN','5.2 AMORTIGUADORES','5.3 CABLE DE GOBERNADOR'] },
];

function BadgeCount({ count }) {
  if (!count) return <View style={styles.badge}><Text style={styles.badgeText}>0</Text></View>;
  return <View style={[styles.badge, styles.badgeOn]}><Text style={styles.badgeTextOn}>{count}</Text></View>;
}

function CardItem({ title, count, onPress }) {
  return (
    <TouchableOpacity style={styles.cardItem} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.cardItemTitle} numberOfLines={2}>{title}</Text>
      <BadgeCount count={count} />
      <Text style={styles.cardItemLink}>Seleccionar pisos</Text>
    </TouchableOpacity>
  );
}

function CollapsibleGroup({ title, children, defaultOpen=false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.group}>
      <TouchableOpacity style={styles.groupHeader} onPress={() => setOpen(!open)}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.groupToggle}>{open ? 'Ocultar' : 'Mostrar'}</Text>
      </TouchableOpacity>
      {open && <View style={{ marginTop: 8 }}>{children}</View>}
    </View>
  );
}

export default function MantElevadores() {
  const { orderid } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [datos, setDatos] = useState(null);

  const [pisos, setPisos] = useState(6);
  const [top, setTop] = useState({});
  const [subsel, setSubsel] = useState({});
  const setIn = (setter, map, key, val) => setter({ ...map, [key]: val });

  const fecha = useMemo(() => {
    const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }, []);
  const horaEntrada = useMemo(() => {
    const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }, []);

  const [niveles, setNiveles] = useState('');
  const [avisoCliente, setAvisoCliente] = useState('');
  const [detalleTrabajo, setDetalleTrabajo] = useState('');
  const [notas, setNotas] = useState('');
  const [refacciones, setRefacciones] = useState([{ cantidad:'', descripcion:'', conCargo:false, codigo:'' }]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const d = await fetchDatosMantenimiento(String(orderid));
        if (!alive) return;
        setDatos(d);
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'No se pudieron cargar los datos.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [orderid]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState({ type: 'T', name: '' });
  const openModal = (type, name) => { setModalKey({ type, name }); setModalOpen(true); };
  const applyModal = (vals) => {
    if (modalKey.type === 'T') setIn(setTop, top, modalKey.name, vals);
    else setIn(setSubsel, subsel, modalKey.name, vals);
  };

  const onGuardar = async () => {
    if (!datos) return;
    const horaSalida = (() => {
      const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    })();

    const payload = {
      orderid: datos.Orderid,
      equipment: datos.equipment,
      tecnico: datos.tecnico_nombre,
      cliente: `${datos.Name1 ?? ''} ${datos.Name2 ?? ''}`.trim(),
      fecha, hora_entrada: horaEntrada, hora_salida: horaSalida,
      pisos,
      bloques: { tablaTop: top, subconjuntos: subsel },
      niveles: niveles ? Number(niveles) : null,
      aviso_cliente: avisoCliente,
      detalle_trabajo: detalleTrabajo,
      notas,
      refacciones: refacciones.filter(r => r.cantidad || r.descripcion || r.codigo),
    };

    try {
      const res = await guardarMantElevadores(payload);
      Alert.alert('Listo', `Reporte (Elevadores) guardado (id: ${res?.id ?? '—'}).`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo guardar el reporte.');
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator/></View>;
  if (!datos) return <View style={styles.center}><Text>No hay datos.</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Mantenimiento de Elevadores" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 160 }}>
        {/* CABECERA */}
        <View style={styles.card}>
          <Text style={styles.h1}>{`${datos.Name1 ?? ''} ${datos.Name2 ?? ''}`.trim()}</Text>
          <View style={styles.pillsRow}>
            <View style={styles.pill}><Text style={styles.pillText}>MX: {datos.Orderid}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>Equipo: {datos.equipment}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>Técnico: {datos.tecnico_nombre ?? '—'}</Text></View>
          </View>
          <View style={styles.pillsRow}>
            <View style={styles.pill}><Text style={styles.pillText}>Fecha: {fecha}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>Entrada: {horaEntrada}</Text></View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Pisos:</Text>
              <TextInput
                style={[styles.pill]}
                keyboardType="numeric"
                value={String(pisos)}
                onChangeText={(t)=>setPisos(Math.max(1, Math.min(50, Number(t)||6)))}
                editable={false}
              />
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Niveles:</Text>
              <TextInput
                style={[styles.pillInput]}
                keyboardType="numeric"
                value={niveles}
                onChangeText={setNiveles}
              />
            </View>
          </View>
        </View>

        {/* BLOQUE SUPERIOR */}
        <Text style={styles.section}>Bloque superior</Text>
        <View style={styles.card}>
          <View style={styles.grid2}>
            {BLOQUE_TOP.map(a => (
              <CardItem
                key={a}
                title={a}
                count={(top[a]||[]).length}
                onPress={() => openModal('T', a)}
              />
            ))}
          </View>
        </View>

        {/* SUBCONJUNTOS (COLLAPSIBLES) */}
        <Text style={styles.section}>Subconjuntos</Text>
        <View style={styles.card}>
          {SUBCONJUNTOS.map(group => (
            <CollapsibleGroup key={group.titulo} title={group.titulo}>
              <View style={styles.grid2}>
                {group.items.map(it => (
                  <CardItem
                    key={it}
                    title={it}
                    count={(subsel[it]||[]).length}
                    onPress={() => openModal('S', it)}
                  />
                ))}
              </View>
            </CollapsibleGroup>
          ))}
        </View>

        {/* AVISO / DETALLE / REFACCIONES / NOTAS */}
        <Text style={styles.section}>Aviso al cliente</Text>
        <View style={styles.card}><TextInput style={[styles.input, styles.tarea]} placeholder="Escribe el aviso..." value={avisoCliente} onChangeText={setAvisoCliente} multiline /></View>

        <Text style={styles.section}>Detalle de trabajo</Text>
        <View style={styles.card}><TextInput style={[styles.input, styles.tarea]} placeholder="Describe el trabajo realizado..." value={detalleTrabajo} onChangeText={setDetalleTrabajo} multiline /></View>

        <Text style={styles.section}>Refacciones</Text>
        <View style={styles.card}>
          {refacciones.map((r,i)=>(
            <View key={`ref-${i}`} style={{ marginTop: i?10:0 }}>
              <View style={styles.rowGap}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Cantidad</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={r.cantidad} onChangeText={(v)=>patchArr(setRefacciones, refacciones, i, { cantidad:v })} />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.smallLabel}>Descripción</Text>
                  <TextInput style={styles.input} value={r.descripcion} onChangeText={(v)=>patchArr(setRefacciones, refacciones, i, { descripcion:v })} />
                </View>
              </View>
              <View style={[styles.rowGap, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Con cargo al cliente (SI/NO)</Text>
                  <TextInput style={styles.input} placeholder="SI o NO" value={r.conCargo ? 'SI' : 'NO'} onChangeText={(v)=>patchArr(setRefacciones, refacciones, i, { conCargo: (v||'').trim().toUpperCase()==='SI' })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Código interno</Text>
                  <TextInput style={styles.input} value={r.codigo} onChangeText={(v)=>patchArr(setRefacciones, refacciones, i, { codigo:v })} />
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={()=>setRefacciones([...refacciones,{cantidad:'',descripcion:'',conCargo:false,codigo:''}])} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Agregar refacción</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>Notas</Text>
        <View style={styles.card}><TextInput style={[styles.input, styles.tarea]} placeholder="Notas adicionales..." value={notas} onChangeText={setNotas} multiline /></View>
      </ScrollView>

      {/* FAB GUARDAR */}
      <TouchableOpacity style={styles.fab} onPress={onGuardar}>
        <Text style={styles.fabText}>Guardar</Text>
      </TouchableOpacity>

      <FloorSelectModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        floors={pisos}
        value={
          modalKey.type==='T' ? (top[modalKey.name]||[])
          : (subsel[modalKey.name]||[])
        }
        onChange={applyModal}
      />

      <Footer />
    </View>
  );
}

function patchArr(setter, arr, index, patch) {
  const next = [...arr];
  next[index] = { ...next[index], ...patch };
  setter(next);
}

const styles = StyleSheet.create({
  center: { flex:1, justifyContent:'center', alignItems:'center' },
  h1: { fontSize: 18, fontWeight: '900', color: '#111827', marginBottom: 6 },
  section: { marginTop: 18, fontSize: 18, fontWeight: '800', color: '#1f2937' },
  card: {
    backgroundColor:'#fff', borderRadius:14, padding:14, marginTop:10,
    borderWidth:1, borderColor:'#e5e7eb', shadowColor:'#000', shadowOpacity:0.03, shadowRadius:6, elevation:1
  },
  pillsRow: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  pill: { flexDirection:'row', alignItems:'center', gap:6, paddingVertical:8, paddingHorizontal:12, backgroundColor:'#F5F7FB', borderRadius:999, borderWidth:1, borderColor:'#e5e7eb' },
  pillText: { color:'#111827', fontWeight:'700' },
  pillInput: { minWidth: 60, paddingVertical: 4, paddingHorizontal: 8, backgroundColor:'#fff', borderRadius:8, borderWidth:1, borderColor:'#d1d5db', color:'#111827' },
  grid2: { flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' },
  cardItem: {
    width: '48%', borderWidth:1, borderColor:'#e5e7eb', borderRadius:12, padding:12, marginBottom:10, backgroundColor:'#fff'
  },
  cardItemTitle: { fontWeight:'800', color:'#111827', minHeight:40 },
  cardItemLink: { color:'#0A84FF', fontWeight:'900', marginTop: 8 },
  badge: { marginTop:8, alignSelf:'flex-start', backgroundColor:'#eef2ff', paddingVertical:4, paddingHorizontal:8, borderRadius:999 },
  badgeOn: { backgroundColor:'#111827' },
  badgeText: { color:'#111827', fontWeight:'900' },
  badgeTextOn: { color:'#fff', fontWeight:'900' },
  group: { marginBottom: 8 },
  groupHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:4 },
  groupTitle: { fontWeight:'900', color:'#111827' },
  groupToggle: { color:'#0A84FF', fontWeight:'900' },
  rowGap: { flexDirection:'row', gap: 8 },
  input: { borderWidth:1, borderColor:'#d1d5db', borderRadius:10, paddingVertical:10, paddingHorizontal:10, backgroundColor:'#fff', fontSize:16, color:'#111827' },
  smallLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  addBtn: { marginTop: 10 }, addBtnText: { color:'#0A84FF', fontWeight:'800' },
  tarea: { height: 110, textAlignVertical:'top' },
  fab: {
    position:'absolute', right:16, bottom:92, backgroundColor:'#16a34a',
    paddingVertical:14, paddingHorizontal:18, borderRadius:999, shadowColor:'#000', shadowOpacity:0.15, shadowRadius:8, elevation:4
  },
  fabText: { color:'#fff', fontWeight:'900', fontSize:16 },
});
