// app/tecnico/ordenes/[id]/aviso-averia.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../../../../src/context/AuthContext';
import {
  fetchMetaAviso,
  fetchCatalogoCircunstancia,
  crearAvisoAveriaSap,
} from '../../../../src/services/avisoAveriaSap';

const FIORI = {
  bg: '#F5F7FB',
  card: '#FFFFFF',
  border: '#D1D5DB',
  text: '#111827',
  textMuted: '#6B7280',
  primary: '#0A6ED1',
  danger: '#A10000',
};

const Chip = ({ active, label, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.chip, active && styles.chipOn]}
  >
    <Text style={[styles.chipText, active && styles.chipTextOn]}>
      {label}
    </Text>
  </TouchableOpacity>
);

export default function AvisoAveriaSapScreen() {
  const params = useLocalSearchParams();
  // Intentamos varias claves posibles por si cambias navegación
  const rawId =
    params.id ||
    params.orderid ||
    params.Orderid ||
    params.ordenId ||
    null;

  const orderid = rawId ? String(rawId).trim() : null;
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  const [catP, setCatP] = useState([]);
  const [catR, setCatR] = useState([]);
  const [catS, setCatS] = useState([]);
  const [catT, setCatT] = useState([]);

  const [selP, setSelP] = useState(null);
  const [selR, setSelR] = useState(null);
  const [selS, setSelS] = useState(null);
  const [selT, setSelT] = useState(null);

  const [shortText, setShortText] = useState('');
  const [itemDescript, setItemDescript] = useState('');
  const [causaText, setCausaText] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);

        console.log('[AVISO-AVERIA] params recibidos =', params);
        console.log('[AVISO-AVERIA] orderid resuelto =', orderid);

        if (!orderid || orderid === 'undefined' || orderid === 'null') {
          console.error(
            '[AVISO-AVERIA] orderid inválido en params:',
            orderid
          );
          Alert.alert(
            'Error',
            'No se recibió el identificador de la orden para crear el aviso.'
          );
          if (alive) setLoading(false);
          return;
        }

        const [metaRes, p, r, s, t] = await Promise.all([
          fetchMetaAviso(orderid, token),
          fetchCatalogoCircunstancia('P', token),
          fetchCatalogoCircunstancia('R', token),
          fetchCatalogoCircunstancia('S', token),
          fetchCatalogoCircunstancia('T', token),
        ]);

        if (!alive) return;
        setMeta(metaRes);
        setCatP(p);
        setCatR(r);
        setCatS(s);
        setCatT(t);

        setShortText(metaRes.ShortTextDefault || '');
      } catch (e) {
        console.error(
          'Error cargando aviso de avería:',
          e?.response?.data || e
        );
        Alert.alert('Error', 'No se pudo cargar la información del aviso.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [orderid, token]);

  const onGuardar = async () => {
    if (!meta) return;

    if (!shortText.trim())
      return Alert.alert(
        'Falta información',
        'Captura la descripción breve (ShortText).'
      );
    if (!itemDescript.trim())
      return Alert.alert(
        'Falta información',
        'Captura la descripción de la pieza dañada (Descript).'
      );
    if (!causaText.trim())
      return Alert.alert(
        'Falta información',
        'Captura el texto de causa.'
      );
    if (!selP || !selR || !selS || !selT)
      return Alert.alert(
        'Falta información',
        'Selecciona al menos un código en cada sección (P, R, S, T).'
      );

    // Validar PersNo que vino del backend (ya viene limpio)
    if (
      !meta.ReportedByPersNo ||
      meta.ReportedByPersNo.trim() === ''
    ) {
      return Alert.alert(
        'Aviso',
        'Esta orden no tiene un número de persona (PersNo) asignado en las operaciones de SAP.\n\nNo se puede crear el aviso automáticamente porque falta el ReportedBy.'
      );
    }

    const payload = {
      equipment: meta.Equipment,
      docNumber: meta.DocNumber,
      itmNumber: meta.ItmNumber,
      shortText,
      itemDescript,
      causaText,
      headerCirc: selP,
      piezaCirc: selR,
      lugarCirc: selS,
      causaCirc: selT,
      reportedBy: meta.ReportedByPersNo, // ya validado y limpio
    };

    try {
      const res = await crearAvisoAveriaSap(payload, token);
      if (res.ok) {
        const suffix = res.notifNo ? `\nNo. de aviso: ${res.notifNo}` : '';
        Alert.alert('Aviso creado', `Se creó el aviso en SAP.${suffix}`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert(
          'Aviso no creado',
          res.error ||
            'Hubo un problema al crear el aviso en SAP. Revisa conexión o intenta más tarde.'
        );
        console.warn('SAP aviso error:', res.detail || res);
      }
    } catch (e) {
      console.error(
        'Error al crear aviso de avería:',
        e?.response?.data || e
      );
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.sapMessage ||
        'No se pudo crear el aviso en SAP.';
      Alert.alert('Error', msg);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FIORI.primary} />
      </View>
    );
  }

  if (!meta) {
    return (
      <View style={styles.center}>
        <Text>No se pudo obtener la información de la orden.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: FIORI.bg }}>
      <Header title="Aviso de avería (SAP)" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={styles.section}>Datos base</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Orden</Text>
          <Text style={styles.value}>{meta.Orderid}</Text>

          <Text style={styles.label}>Equipo</Text>
          <Text style={styles.value}>{meta.Equipment}</Text>

          <Text style={styles.label}>DocNumber (SalesOrd)</Text>
          <Text style={styles.value}>{meta.DocNumber}</Text>

          <Text style={styles.label}>ItmNumber (SOrdItem)</Text>
          <Text style={styles.value}>{meta.ItmNumber}</Text>

          {meta.ReportedByPersNo ? (
            <>
              <Text style={styles.label}>ReportedBy (PersNo de operación)</Text>
              <Text style={styles.value}>{meta.ReportedByPersNo}</Text>
            </>
          ) : null}
        </View>

        <Text style={styles.section}>Encabezado del aviso</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Descripción breve (ShortText)</Text>
          <TextInput
            style={styles.input}
            value={shortText}
            onChangeText={setShortText}
            placeholder="Breve descripción del aviso"
          />

          <Text style={[styles.label, { marginTop: 10 }]}>
            Código de circunstancia (Catálogo = P)
          </Text>
          <View style={styles.chipsWrap}>
            {catP.map((c) => (
              <Chip
                key={c.Codigo}
                label={`${c.Codigo} - ${c.Descripcion}`}
                active={selP?.Codigo === c.Codigo}
                onPress={() => setSelP(c)}
              />
            ))}
          </View>
        </View>

        <Text style={styles.section}>Falla en la pieza / daño</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Descripción de la falla (Descript)</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            multiline
            value={itemDescript}
            onChangeText={setItemDescript}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>
            Código de daño (Catálogo = R)
          </Text>
          <View style={styles.chipsWrap}>
            {catR.map((c) => (
              <Chip
                key={c.Codigo}
                label={`${c.Codigo} - ${c.Descripcion}`}
                active={selR?.Codigo === c.Codigo}
                onPress={() => setSelR(c)}
              />
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 10 }]}>
            Código de localización (Catálogo = S)
          </Text>
          <View style={styles.chipsWrap}>
            {catS.map((c) => (
              <Chip
                key={c.Codigo}
                label={`${c.Codigo} - ${c.Descripcion}`}
                active={selS?.Codigo === c.Codigo}
                onPress={() => setSelS(c)}
              />
            ))}
          </View>
        </View>

        <Text style={styles.section}>Causa</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Texto de causa</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            multiline
            value={causaText}
            onChangeText={setCausaText}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>
            Código de causa (Catálogo = T)
          </Text>
          <View style={styles.chipsWrap}>
            {catT.map((c) => (
              <Chip
                key={c.Codigo}
                label={`${c.Codigo} - ${c.Descripcion}`}
                active={selT?.Codigo === c.Codigo}
                onPress={() => setSelT(c)}
              />
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.btnPrimary} onPress={onGuardar}>
          <Text style={styles.btnPrimaryText}>Crear aviso en SAP</Text>
        </TouchableOpacity>
      </ScrollView>
      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginTop: 18,
    fontSize: 18,
    fontWeight: '800',
    color: FIORI.text,
  },
  card: {
    backgroundColor: FIORI.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  label: {
    fontSize: 12,
    color: FIORI.textMuted,
    marginTop: 6,
  },
  value: {
    fontSize: 15,
    color: FIORI.text,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 15,
    color: FIORI.text,
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  chipOn: {
    backgroundColor: FIORI.primary,
    borderColor: FIORI.primary,
  },
  chipText: {
    fontSize: 11,
    color: FIORI.text,
    fontWeight: '700',
  },
  chipTextOn: {
    color: '#FFFFFF',
  },
  btnPrimary: {
    marginTop: 20,
    backgroundColor: FIORI.danger,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
});
