import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Image
} from 'react-native';
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Dropdown } from 'react-native-element-dropdown';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Signature from 'react-native-signature-canvas';
import { generarTbmkyPdf } from '../../../../src/utils/tbmkyPdf';
import api from '../../../../src/services/api'; //RUTA ARCHIVO DE CONEXIÓN API 

// ===== Listas locales (síntomas y EPP) =====
const sintomasIniciales = [
  'Dolor de cabeza',
  'Vértigo, zumbidos en la oreja',
  'Manos o pies temblorosos',
  'Fiebre',
  'Somnolencia',
  'Indigestión/diarrea',
];

const EPP_LIST = [
  'UNIFORME', 'CASCO', 'BARBIQUEJO', 'LAMPARA', 'POLVO', 'LENTES',
  'BOTAS', 'TAPONES', 'SIST. ANTICAIDAS', 'SOLDAR', 'ANTICORTE',
  'NYLON', 'NITRILO', 'CARNAZA', 'FAJA', 'MOSQUETON', 'BLOCK STOP', 'L. VIDA VERTICAL'
];

// ===== Iconos MDI para EPP =====
const EPP_ICONS_MDI = {
  'UNIFORME'         : 'tshirt-crew-outline',
  'CASCO'            : 'account-hard-hat',
  'BARBIQUEJO'       : 'face-mask',
  'LAMPARA'          : 'alarm-light-outline',
  'POLVO'            : 'face-mask-outline',
  'LENTES'           : 'safety-goggles',
  'BOTAS'            : 'shoe-print',
  'TAPONES'          : 'ear-hearing',
  'SIST. ANTICAIDAS' : 'run-fast',
  'SOLDAR'           : 'racing-helmet',
  'ANTICORTE'        : 'hand-back-right-outline',
  'NYLON'            : 'hand-clap',
  'NITRILO'          : 'beaker-outline',
  'CARNAZA'          : 'hand-back-left-outline',
  'FAJA'             : 'human-handsdown',
  'MOSQUETON'        : 'link',
  'BLOCK STOP'       : 'stop-circle-outline',
  'L. VIDA VERTICAL' : 'tune-vertical',
};
const getMdiIconName = (key) => EPP_ICONS_MDI[key] || 'help-circle-outline';

// ===== Equipos con iconos =====
const EQUIPOS = [
  { id: 'elevadores',   label: 'Elevadores',    icon: 'elevator-passenger' },
  { id: 'escaleras',    label: 'Escaleras',     icon: 'ladder' },
  { id: 'oficinas',     label: 'Oficinas',      icon: 'office-building' },
  { id: 'almacen',      label: 'Almacen/C. Herramientas', icon: 'warehouse' },
];

export default function FormularioRiesgosScreen() {
  const { orderid } = useLocalSearchParams();

  // Paso UI
  const [paso, setPaso] = useState(1);

  // Loading / datos base
  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState(null);

  // Campos de encabezado
  const [fecha, setFecha] = useState('');
  const [rutinaria, setRutinaria] = useState(false);

  // Equipo seleccionado
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null);

  // Técnicos
  const [trabajadores, setTrabajadores] = useState([
    { nombre: '', cargo: '', nomina: '' }, // Técnico asignado (no editable)
    { nombre: '', cargo: '', nomina: '' }, // Técnico 2 (editable)
  ]);

  // Datos de identificación
  const [centroTrabajo, setCentroTrabajo] = useState('');
  const [areasBD, setAreasBD] = useState([]);         // {id, area, descripcion}
  const [selectedArea, setSelectedArea] = useState(); // id del área en BD
  const [jefeInmediato, setJefeInmediato] = useState('');
  const [actividadDia, setActividadDia] = useState('');

  // Salud / EPP
  const [sintomas, setSintomas] = useState([]);
  const [eppSeleccionado, setEppSeleccionado] = useState({});
  const [herramientas, setHerramientas] = useState('');

  // ====== RIESGOS ======
  // Backend esperado: /riesgos -> [{ id: number, riesgo: string }]
  const [riesgosBD, setRiesgosBD] = useState([]);
  // Lista de seleccionados por ID (¡no strings!)
  const [riesgosSeleccionadosIds, setRiesgosSeleccionadosIds] = useState([]);

  // TOP 3: guardamos ID (o null)
  const [topSeleccionIds, setTopSeleccionIds] = useState([null, null, null]);

  // Textos que bajan al detalle (nombres de los TOP ya aplicados)
  const [riesgosTopText, setRiesgosTopText] = useState(['', '', '']);
  const [causasTop, setCausasTop] = useState(['', '', '']);
  const [medidasTop, setMedidasTop] = useState([
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
  ]);
  const [acciones, setAcciones] = useState(['', '', '']);

  // Compromisos (acciones se repiten aquí)
  const [compromisoTecnico, setCompromisoTecnico] = useState('');
  const [compromisoSupervisor, setCompromisoSupervisor] = useState(''); 

  const esRutinaria = (orderType) => ['Z1', 'Z2', 'Z3'].includes(orderType || '');
   // Firmas (base64 sin el prefijo data:)
  const [firmaTecnico, setFirmaTecnico] = useState(null);
  const [firmaSupervisor, setFirmaSupervisor] = useState(null);

  // Si viene como data URL, regresa solo el base64; si ya es base64 limpio, lo devuelve igual
const toBase64 = (data) => (data || '').replace(/^data:image\/\w+;base64,/, '');

// Asegura una data URL válida a partir de un base64 "limpio"
const toDataUrl = (b64) => `data:image/png;base64,${b64}`;

// Por si el WebView mete saltos/espacios invisibles
const sanitize = (s) => (s || '').replace(/\s/g, '');

  // Modal para firmar
  const [modalFirma, setModalFirma] = useState({ open: false, tipo: null }); // 'tecnico' | 'supervisor'
  const signatureCss = `
    .m-signature-pad {
      box-shadow: none; border: 0; 
    }
    .m-signature-pad--body {
      border: 1px solid #e5e7eb;
    }
    .m-signature-pad--footer {
      display: flex; justify-content: space-between; align-items: center; gap: 8px; 
    }
    .m-signature-pad--footer .button {
      background: #a10000; color: #fff; border: 0; border-radius: 8px; padding: 8px 12px;
    }
    .m-signature-pad--footer .button.clear {
      background: #6b7280;
    }
  `;

  // Cargar datos desde la BD
  useEffect(() => {
    const loadAll = async () => {
      try {
        setLoading(true);

        const ordenRes = await api.get(`/ordenes/${orderid}`); // <-- ojo backticks
        const ord = ordenRes.data || null;
        setOrden(ord);

        const startIso = ord?.start_date ? new Date(ord.start_date) : new Date();
        theDateFormatter(setFecha, startIso);

        setRutinaria(esRutinaria(ord?.order_type));

        setTrabajadores((prev) => {
          const copia = [...prev];
          copia[0] = {
            nombre: ord?.tecnico_nombre || '',
            cargo: ord?.tecnico_cargo || '',
            nomina: ord?.tecnico_nomina || '',
          };
          return copia;
        });

        const areasRes = await api.get('/area-trabajo');
        setAreasBD(areasRes.data || []);

        const riesgosRes = await api.get('/riesgos'); // [{id, riesgo}]
        setRiesgosBD(riesgosRes.data || []);
      } catch (err) {
        console.error('Error cargando datos:', err);
        Alert.alert('Error', 'No se pudieron cargar los datos iniciales.');
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [orderid]);

  // Opciones de áreas
  const areaOptions = useMemo(
    () => areasBD.map((a) => ({ label: a.area, value: a.id })),
    [areasBD]
  );

  // Helpers toggles
  const toggleSintoma = (sintoma) => {
    setSintomas((prev) =>
      prev.includes(sintoma) ? prev.filter((s) => s !== sintoma) : [...prev, sintoma]
    );
  };

  const toggleEppCampo = (item, campo) => {
    setEppSeleccionado((prev) => {
      const actual = prev[item] || { M: false, A: false };
      return { ...prev, [item]: { ...actual, [campo]: !actual[campo] } };
    });
  };

  // ======= Selección de Riesgos (IDs) =======
  const toggleRiesgo = (id) => {
    setRiesgosSeleccionadosIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ======= Opciones TOP 1/2/3 (sin duplicados y sólo de seleccionados) =======
  const opcionesTop1 = useMemo(() => {
    return riesgosBD
      .filter(r => riesgosSeleccionadosIds.includes(r.id))
      .map(r => ({ label: r.riesgo, value: r.id }));
  }, [riesgosBD, riesgosSeleccionadosIds]);

  const opcionesTop2 = useMemo(() => {
    const usados = new Set([topSeleccionIds[0]].filter(Boolean));
    return riesgosBD
      .filter(r =>
        riesgosSeleccionadosIds.includes(r.id) &&
        !usados.has(r.id)
      )
      .map(r => ({ label: r.riesgo, value: r.id }));
  }, [riesgosBD, riesgosSeleccionadosIds, topSeleccionIds]);

  const opcionesTop3 = useMemo(() => {
    const usados = new Set([topSeleccionIds[0], topSeleccionIds[1]].filter(Boolean));
    return riesgosBD
      .filter(r =>
        riesgosSeleccionadosIds.includes(r.id) &&
        !usados.has(r.id)
      )
      .map(r => ({ label: r.riesgo, value: r.id }));
  }, [riesgosBD, riesgosSeleccionadosIds, topSeleccionIds]);

  // Si deseleccionas un riesgo que estaba en TOP, lo limpiamos del TOP
  useEffect(() => {
    setTopSeleccionIds((prev) =>
      prev.map((v) => (v && !riesgosSeleccionadosIds.includes(v) ? null : v))
    );
  }, [riesgosSeleccionadosIds]);

  // Pasa IDs -> nombres y baja al detalle (limpiando campos si cambió el riesgo)
  const aplicarTop = () => {
    if (!topSeleccionIds[0] || !topSeleccionIds[1] || !topSeleccionIds[2]) {
      Alert.alert('TOP 3 incompleto', 'Elige TOP 1, TOP 2 y TOP 3 (sin repetir).');
      return;
    }
    const nombres = topSeleccionIds.map((id) => {
      const r = riesgosBD.find(x => x.id === id);
      return r?.riesgo || '';
    });

    // si cambió el riesgo, limpiamos causa/medidas/acción del índice
    setCausasTop((prev) => prev.map((c, i) => (riesgosTopText[i] !== nombres[i] ? '' : c)));
    setMedidasTop((prev) =>
      prev.map((fila, i) => (riesgosTopText[i] !== nombres[i] ? ['', '', ''] : fila))
    );
    setAcciones((prev) => prev.map((a, i) => (riesgosTopText[i] !== nombres[i] ? '' : a)));

    setRiesgosTopText(nombres);
    Alert.alert('TOP 3 aplicado', 'Los riesgos TOP se colocaron en los campos de abajo.');
  };

  // Autollenar TOP con los 3 primeros seleccionados
  const autollenarTopDesdeSeleccionados = () => {
    if (riesgosSeleccionadosIds.length < 3) {
      Alert.alert('Selecciona riesgos', 'Marca al menos 3 riesgos en "Riesgos presentes".');
      return;
    }
    setTopSeleccionIds([
      riesgosSeleccionadosIds[0],
      riesgosSeleccionadosIds[1],
      riesgosSeleccionadosIds[2],
    ]);
  };

  const handleFinalizar = () => {
    const datosPreview = {
      orderid,
      fecha,
      rutinaria,
      equipoSeleccionado,
      centroTrabajo,
      selectedArea,
      jefeInmediato,
      actividadDia,
      trabajadores,
      sintomas,
      eppSeleccionado,
      herramientas,
      // riesgos
      riesgosSeleccionadosIds,
      topSeleccionIds,
      riesgosTopText,
      causasTop,
      medidasTop,
      acciones,
      compromisoTecnico,
      compromisoSupervisor,
      //Firmas
      firmaTecnico,     // <-- base64 PNG
      firmaSupervisor,  // <-- base64 PNG
    };
    console.log('Formulario (preview, sin guardar):', datosPreview);
    Alert.alert('Listo', 'Datos cargados y preparados (sin guardar).');
    router.push(`/tecnico/ordenes/${orderid}/seleccionar-tipo`);
  };

  const onPdf = async () => {
  try {
    const selectedAreaLabel =
      (areaOptions.find(a => a.value === selectedArea)?.label) || '';

    await generarTbmkyPdf({
      fecha,
      equipoSeleccionado,
      trabajadores,
      centroTrabajo,
      selectedAreaLabel,
      jefeInmediato,
      actividadDia,
      rutinaria,
      sintomas,
      eppSeleccionado,
      // Para ROUND 1: pasa lo que tengas
      riesgosSeleccionadosIds, // y riesgosBD para resolver texto
      riesgosBD,
      // TOP + detalle
      riesgosTopText,
      causasTop,
      medidasTop,
      acciones,
      // Firmas (base64 LIMPIO)
      firmaTecnico,
      firmaSupervisor,
    });
  } catch (e) {
    console.error(e);
    Alert.alert('Error', 'No se pudo generar el PDF.');
  }
};

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Cargando..." />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 10 }}>Cargando datos del formulario...</Text>
        </View>
        <Footer />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title={`Paso ${paso} de 4`} />

      {/* Stepper */}
      <View style={styles.stepper}>
        {[1,2,3,4].map(n => (
          <View key={n} style={styles.stepItem}>
            <View style={[styles.stepDot, paso >= n && styles.stepDotActive]} />
            <Text style={[styles.stepText, paso === n && styles.stepTextActive]}>Paso {n}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Encabezado resumen */}
        <View style={styles.headerCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="document-text-outline" size={18} />
            <Text style={styles.headerCardTitle}> Orden: {orden?.Orderid || orderid}</Text>
          </View>
          <Text style={styles.headerCardText}>Fecha: {fecha}</Text>
          <View style={styles.tagRow}>
            <Text style={styles.headerCardText}>Tipo: {orden?.order_type || '-'}</Text>
            <View style={[styles.badge, rutinaria ? styles.badgeOk : styles.badgeWarn]}>
              <Text style={styles.badgeText}>{rutinaria ? 'RUTINARIA' : 'NO RUTINARIA'}</Text>
            </View>
          </View>
        </View>

        {paso === 1 && (
          <View>
            <Text style={[styles.title, { marginTop: 14 }]}>Identificación del área de trabajo</Text>
            <View style={styles.equiposGrid}>
              {EQUIPOS.map(eq => {
                const active = equipoSeleccionado === eq.id;
                return (
                  <TouchableOpacity
                    key={eq.id}
                    style={[styles.equipoTile, active && styles.equipoTileActive]}
                    onPress={() => setEquipoSeleccionado(eq.id)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name={eq.icon}
                      size={25}
                      color={active ? '#fff' : '#555'}
                      style={{ marginBottom: 5 }}
                    />
                    <Text style={[styles.equipoText, active && styles.equipoTextActive]}>
                      {eq.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Técnico 1 (asignado) — NO editable */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Técnico 1 (asignado)</Text>
              <TextInput placeholder="Nombre" style={[styles.input, styles.inputDisabled]} value={trabajadores[0].nombre} editable={false} />
              <TextInput placeholder="Cargo"  style={[styles.input, styles.inputDisabled]} value={trabajadores[0].cargo}  editable={false} />
              <TextInput placeholder="Nómina" style={[styles.input, styles.inputDisabled]} value={trabajadores[0].nomina} editable={false} />
              <TextInput placeholder="Fecha"  style={[styles.input, styles.inputDisabled]} value={fecha} editable={false} />
            </View>

            {/* Técnico 2 (opcional) — editable */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Técnico 2 (opcional)</Text>
              <TextInput placeholder="Nombre" style={styles.input} value={trabajadores[1].nombre}
                onChangeText={(v) => { const copia = [...trabajadores]; copia[1].nombre = v; setTrabajadores(copia); }} />
              <TextInput placeholder="Cargo"  style={styles.input} value={trabajadores[1].cargo}
                onChangeText={(v) => { const copia = [...trabajadores]; copia[1].cargo = v; setTrabajadores(copia); }} />
              <TextInput placeholder="Nómina" style={styles.input} value={trabajadores[1].nomina}
                onChangeText={(v) => { const copia = [...trabajadores]; copia[1].nomina = v; setTrabajadores(copia); }} />
            </View>

            <TextInput placeholder="Centro de trabajo (MX-###)" style={styles.input} value={centroTrabajo} onChangeText={setCentroTrabajo} />

            <Dropdown
              style={styles.dropdown}
              data={areaOptions}
              labelField="label"
              valueField="value"
              placeholder="Seleccionar área de trabajo..."
              value={selectedArea}
              onChange={(item) => setSelectedArea(item.value)}
            />

            <TextInput placeholder="Jefe inmediato" style={styles.input} value={jefeInmediato} onChangeText={setJefeInmediato} />
            <TextInput placeholder="Actividad del día" multiline style={[styles.input, { height: 80 }]} value={actividadDia} onChangeText={setActividadDia} />
          </View>
        )}

        {paso === 2 && (
          <View>
            <Text style={styles.title}>Chequeo individual de salud</Text>
            <View style={styles.listCard}>
              {sintomasIniciales.map((sintoma) => (
                <TouchableOpacity
                  key={sintoma}
                  style={styles.checkboxRow}
                  onPress={() => toggleSintoma(sintoma)}
                >
                  <Ionicons
                    name={sintomas.includes(sintoma) ? 'checkbox' : 'square-outline'}
                    size={20}
                    color="#a10000"
                  />
                  <Text style={styles.checkboxLabel}>{sintoma}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.title}>EPP</Text>
            <View style={styles.eppGrid}>
              {EPP_LIST.map((epp) => {
                const iconName = getMdiIconName(epp);
                return (
                  <View key={epp} style={styles.eppItem}>
                    <View style={styles.eppHeader}>
                      <MaterialCommunityIcons name={iconName} size={20} color="#555" style={{ marginRight: 6 }} />
                      <Text style={styles.eppLabel}>{epp}</Text>
                    </View>

                    <View style={styles.eppButtons}>
                      <TouchableOpacity
                        style={[styles.eppBox, eppSeleccionado[epp]?.M && styles.eppBoxOnM]}
                        onPress={() => toggleEppCampo(epp, 'M')}
                      >
                        <MaterialCommunityIcons
                          name={eppSeleccionado[epp]?.M ? 'check-circle' : 'circle-outline'}
                          size={18}
                          color={eppSeleccionado[epp]?.M ? '#fff' : '#007AFF'}
                        />
                        <Text style={[styles.eppBoxText, eppSeleccionado[epp]?.M && styles.eppBoxTextOn]}>
                          M
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.eppBox, eppSeleccionado[epp]?.A && styles.eppBoxOnA]}
                        onPress={() => toggleEppCampo(epp, 'A')}
                      >
                        <MaterialCommunityIcons
                          name={eppSeleccionado[epp]?.A ? 'check-circle' : 'circle-outline'}
                          size={18}
                          color={eppSeleccionado[epp]?.A ? '#fff' : '#FF9500'}
                        />
                        <Text style={[styles.eppBoxText, eppSeleccionado[epp]?.A && styles.eppBoxTextOn]}>
                          A
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>

            <TextInput
              placeholder="Herramientas especiales"
              style={[styles.input, { height: 60 }]}
              value={herramientas}
              onChangeText={setHerramientas}
              multiline
            />
          </View>
        )}

        {paso === 3 && (
          <View>
            <Text style={styles.title}>ROUND 1: Riesgos presentes</Text>
            <View style={styles.listCard}>
              {riesgosBD.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.checkboxRow}
                  onPress={() => toggleRiesgo(r.id)}
                >
                  <Ionicons
                    name={riesgosSeleccionadosIds.includes(r.id) ? 'checkbox' : 'square-outline'}
                    size={20}
                    color="#a10000"
                  />
                  <Text style={styles.checkboxLabel}>{r.riesgo}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.title}>ROUND 2: Seleccionar TOP 3 (de los riesgos anteriores)</Text>
            <View style={[styles.card, { paddingVertical: 10 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#6b7280' }]} onPress={autollenarTopDesdeSeleccionados}>
                  <Text style={styles.smallBtnText}>Autollenar con primeros 3</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#a10000' }]} onPress={aplicarTop}>
                  <Text style={styles.smallBtnText}>Aplicar TOP 3</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.miniLabel}>TOP 1</Text>
              <Dropdown
                style={styles.dropdown}
                data={opcionesTop1}
                labelField="label"
                valueField="value"
                placeholder="Elige riesgo TOP 1"
                value={topSeleccionIds[0]}
                onChange={(item) => setTopSeleccionIds([item.value, topSeleccionIds[1], topSeleccionIds[2]])}
              />

              <Text style={styles.miniLabel}>TOP 2</Text>
              <Dropdown
                style={styles.dropdown}
                data={opcionesTop2}
                labelField="label"
                valueField="value"
                placeholder="Elige riesgo TOP 2"
                value={topSeleccionIds[1]}
                onChange={(item) => setTopSeleccionIds([topSeleccionIds[0], item.value, topSeleccionIds[2]])}
              />

              <Text style={styles.miniLabel}>TOP 3</Text>
              <Dropdown
                style={styles.dropdown}
                data={opcionesTop3}
                labelField="label"
                valueField="value"
                placeholder="Elige riesgo TOP 3"
                value={topSeleccionIds[2]}
                onChange={(item) => setTopSeleccionIds([topSeleccionIds[0], topSeleccionIds[1], item.value])}
              />
            </View>

            <Text style={styles.title}>ROUND 3: ¿Por qué puede pasar? y Medidas de control (3 por riesgo)</Text>
            {riesgosTopText.map((r, i) => (
              <View key={i} style={styles.card}>
                <Text style={styles.cardTitle}>TOP {i + 1} — {r || '—'}</Text>

                <TextInput
                  placeholder="¿Por qué puede pasar?"
                  style={styles.input}
                  value={causasTop[i]}
                  onChangeText={(v) => {
                    const nuevo = [...causasTop]; nuevo[i] = v; setCausasTop(nuevo);
                  }}
                />

                <Text style={styles.miniLabel}>Medidas de control</Text>
                {[0, 1, 2].map((idxM) => (
                  <TextInput
                    key={idxM}
                    placeholder={`Medida ${idxM + 1}`}
                    style={styles.input}
                    value={medidasTop[i][idxM]}
                    onChangeText={(v) => {
                      const m = medidasTop.map((fila) => [...fila]);
                      m[i][idxM] = v;
                      setMedidasTop(m);
                    }}
                  />
                ))}
              </View>
            ))}

            <Text style={styles.title}>ROUND 4: Acciones a realizar (1 por cada riesgo TOP)</Text>
            {acciones.map((a, i) => (
              <TextInput
                key={i}
                placeholder={`Acción para TOP ${i + 1}`}
                style={styles.input}
                value={acciones[i]}
                onChangeText={(v) => {
                  const nuevo = [...acciones]; nuevo[i] = v; setAcciones(nuevo);
                }}
              />
            ))}
          </View>
        )}

        {paso === 4 && (
          <View>
            <Text style={styles.title}>Compromisos y firmas</Text>

            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 8 }]}>Acciones a comprometer (autollenado)</Text>
              {acciones.map((a, i) => (
                <View key={i} style={styles.compromisoRow}>
                  <Ionicons name="checkmark-done-outline" size={18} color="#16a34a" />
                  <Text style={styles.compromisoText}>{a ? a : `Acción para TOP ${i + 1} (vacía)`}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Firma del técnico</Text>

              <View style={styles.firmaBox}>
                {firmaTecnico ? (
                  <Image
                    source={{ uri: toDataUrl(firmaTecnico) }}
                    style={styles.firmaPreview}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: '#666' }}>Sin firma</Text>
                )}
              </View>

              
              <View style={styles.firmaBtnRow}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: '#a10000' }]}
                  onPress={() => setModalFirma({ open: true, tipo: 'tecnico' })}
                >
                  <Text style={styles.smallBtnText}>Firmar</Text>
                </TouchableOpacity>
                {firmaTecnico && (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#6b7280' }]}
                    onPress={() => setFirmaTecnico(null)}
                  >
                    <Text style={styles.smallBtnText}>Borrar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Firma del supervisor</Text>
              <View style={styles.firmaBox}>
                {firmaSupervisor ? (
                  <Image
                    source={{ uri: toDataUrl(firmaSupervisor) }}
                    style={styles.firmaPreview}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: '#666' }}>Sin firma</Text>
                )}
              </View>

              <View style={styles.firmaBtnRow}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: '#a10000' }]}
                  onPress={() => setModalFirma({ open: true, tipo: 'supervisor' })}
                >
                  <Text style={styles.smallBtnText}>Firmar</Text>
                </TouchableOpacity>
                {firmaSupervisor && (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#6b7280' }]}
                    onPress={() => setFirmaSupervisor(null)}
                  >
                    <Text style={styles.smallBtnText}>Borrar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Controles de paso */}
      <View style={styles.footerNav}>
        {paso > 1 && (
          <TouchableOpacity onPress={() => setPaso(paso - 1)} style={styles.navBtn}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Atrás</Text>
          </TouchableOpacity>
        )}
        {paso < 4 && (
          <TouchableOpacity onPress={() => setPaso(paso + 1)} style={styles.navBtn}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Siguiente</Text>
          </TouchableOpacity>
        )}
        {paso === 4 && (
          <TouchableOpacity onPress={onPdf} style={[styles.navBtn, { backgroundColor: '#007AFF' }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Generar PDF</Text>
          </TouchableOpacity>

        )}
      </View>

      <Modal visible={modalFirma.open} animationType="slide" onRequestClose={() => setModalFirma({ open: false, tipo: null })}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>
              {modalFirma.tipo === 'tecnico' ? 'Firma del técnico' : 'Firma del supervisor'}
            </Text>
            <TouchableOpacity onPress={() => setModalFirma({ open: false, tipo: null })}>
              <Ionicons name="close" size={22} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <Signature
              onOK={(val) => {
                // val puede venir como "data:image/png;base64,AAA..." o como "AAA..."
                const cleanB64 = sanitize(toBase64(val));

                if (modalFirma.tipo === 'tecnico') setFirmaTecnico(cleanB64);
                else setFirmaSupervisor(cleanB64);

                setModalFirma({ open: false, tipo: null });
              }}
              onEmpty={() => Alert.alert('Sin trazo', 'Dibuja tu firma dentro del recuadro.')}
              descriptionText="Firme dentro del recuadro"
              clearText="Limpiar"
              confirmText="Guardar"
              autoClear={false}
              imageType="image/png"
            />
          </View>

          <View style={{ padding: 12, borderTopWidth: 1, borderColor: '#eee' }}>
            <Text style={{ color: '#666' }}>
              Guarda para insertar la firma en el documento y en el PDF.
            </Text>
          </View>
        </View>
      </Modal>

      <Footer />
    </View>
  );
}

// util: formato YYYY-MM-DD
function theDateFormatter(setFecha, dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  setFecha(`${yyyy}-${mm}-${dd}`);
}



const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 120 },

  // Stepper
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  stepItem: { alignItems: 'center' },
  stepDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#ddd', marginBottom: 4,
  },
  stepDotActive: { backgroundColor: '#a10000' },
  stepText: { fontSize: 12, color: '#777' },
  stepTextActive: { color: '#a10000', fontWeight: '600' },

  title: { fontSize: 18, fontWeight: 'bold', color: '#a10000', marginBottom: 12 },

  headerCard: {
    backgroundColor: '#f4f6f9',
    borderWidth: 1,
    borderColor: '#e3e6ea',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  headerCardTitle: { fontWeight: 'bold', marginLeft: 6 },
  headerCardText: { color: '#333', marginTop: 4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeOk: { backgroundColor: '#e7f7ed' },
  badgeWarn: { backgroundColor: '#fdecea' },
  badgeText: { fontWeight: 'bold', color: '#333' },

  input: {
    borderWidth: 1, borderColor: '#d9d9d9', borderRadius: 10,
    padding: 10, marginBottom: 12, backgroundColor: '#fff'
  },
  inputDisabled: { backgroundColor: '#f1f1f1', color: '#555' },

  card: {
    backgroundColor: '#f9f9f9', padding: 12, borderRadius: 12,
    marginBottom: 12, borderColor: '#e5e5e5', borderWidth: 1
  },
  cardTitle: { fontWeight: 'bold', marginBottom: 8 },

  // Lista simple en tarjetas
  listCard: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#eee',
    paddingVertical: 6, paddingHorizontal: 10, marginBottom: 12
  },

  checkboxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  checkboxLabel: { marginLeft: 10, color: '#333' },

  // EPP grid
  eppGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#eee',
    padding: 8, marginBottom: 12
  },
  eppItem: {
    width: '48%',
    backgroundColor: '#fafafa',
    borderWidth: 1, borderColor: '#eee',
    borderRadius: 10, padding: 10, marginBottom: 8
  },
  eppHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  eppLabel: { fontWeight: '600', color: '#333' },
  eppButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  eppBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#d6e4ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6
  },
  eppBoxOnM: { backgroundColor: '#007AFF' },
  eppBoxOnA: { backgroundColor: '#FF9500' },
  eppBoxText: { marginLeft: 5, color: '#333', fontWeight: '600' },
  eppBoxTextOn: { color: '#fff' },

  // Dropdown
  dropdown: {
    height: 45, borderColor: '#d0d0d0', borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 10, marginBottom: 12, backgroundColor: '#fff',
  },
  miniLabel: { fontSize: 12, color: '#666', marginBottom: 6 },

  // Grid de equipos
  equiposGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  equipoTile: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '23%',
    marginBottom: 10,
  },
  equipoTileActive: {
    backgroundColor: '#a10000',
    borderColor: '#a10000',
  },
  equipoText: { fontSize: 10, color: '#333', textAlign: 'center' },
  equipoTextActive: { color: '#fff', fontWeight: '600' },

  // Compromisos
  compromisoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  compromisoText: { color: '#111', flex: 1 },

  // Navegación inferior del formulario
  footerNav: {
    flexDirection: 'row', justifyContent: 'space-around',
    padding: 14, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#f8f8f8'
  },
  navBtn: { backgroundColor: '#a10000', paddingVertical: 10, paddingHorizontal: 30, borderRadius: 10 },

  // Botones pequeños
  smallBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  smallBtnText: { color: '#fff', fontWeight: '600' },
  firmaBox: {
  height: 120,
  borderWidth: 1,
  borderColor: '#e5e5e5',
  borderRadius: 10,
  backgroundColor: '#fafafa',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 10,
},
firmaPreview: {
  width: '100%',
  height: '100%',
},
firmaBtnRow: {
  flexDirection: 'row',
  gap: 10,
},

});
