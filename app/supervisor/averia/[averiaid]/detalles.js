// app/supervisor/averia/[averiaid]/detalles.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';

const COLORS = {
  pageBg: '#F4F6F9',
  cardBg: '#FFFFFF',
  border: '#E4E9F0',
  title: '#0B1F3B',
  text: '#52616B',
  accent: '#0A6ED1',
};

const BASE_URL =
  'https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com/api/odata/ZCS_GET_NOTIFICATION_SRV';

const parseSapDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('/Date(')) {
    const ms = parseInt(value.replace('/Date(', '').replace(')/', ''), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (value) => {
  const d = parseSapDate(value);
  if (!d) return '—';
  return d.toLocaleDateString();
};

export default function DetallesAveriaSupervisor() {
  const { averiaid } = useLocalSearchParams(); // viene de la ruta [averiaid]
  const [header, setHeader] = useState(null);
  const [codigos, setCodigos] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDetalle = async () => {
    try {
      setLoading(true);

      // ===== Header =====
      const urlHeader = `${BASE_URL}/NotificationHeaderSet('${averiaid}')?$format=json`;
      const resHdr = await fetch(urlHeader);
      const jsonHdr = await resHdr.json();
      const hdr = jsonHdr?.d ?? jsonHdr ?? null;

      // ===== Items (NotificationItemsSet) =====
      const urlItems = `${BASE_URL}/NotificationHeaderSet('${averiaid}')/NotificationItemsSet?$format=json`;
      const resItems = await fetch(urlItems);
      const jsonItems = await resItems.json();
      const items = jsonItems?.d?.results ?? jsonItems?.value ?? [];

      // Tomamos el primer ítem (si luego quieres mostrar todos, se cambia a FlatList)
      const it = items[0] || {};

      const codes = {
        // lo que pediste explícitamente de esta URL:
        Descript: it.Descript || '',
        DCatTyp: it.DCatTyp || '',
        DCodegrp: it.DCodegrp || '',
        DCode: it.DCode || '',
        DlCatTyp: it.DlCatTyp || '',
        DlCodegrp: it.DlCodegrp || '',
        DlCode: it.DlCode || '',

       
      };

      setHeader(hdr);
      setCodigos(codes);
    } catch (err) {
      console.error('Error al cargar detalle de avería:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (averiaid) {
      fetchDetalle();
    }
  }, [averiaid]);

  const goBack = () => router.back();

  if (loading) {
  return (
    <View style={styles.container}>
      <Header title="Detalle de avería" />

      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Cargando detalle…</Text>
      </View>

      <Footer />
    </View>
  );
}


  if (!header) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de avería" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: COLORS.text }}>
            No se encontró información para el aviso #{averiaid}
          </Text>
        </View>
        <Footer />
      </View>
    );
  }

  const notifNo = header.NotifNo;
  const notifType = header.NotifType;
  const shortText = header.ShortText;
  const reportedBy = header.Reportedby;
  const codeGroup = header.CodeGroup;
  const coding = header.Coding;
  const equipment = header.Equipment;
  const functLoc = header.FunctLoc;
  const notifDate = header.NotifDate;
  const desstDate = header.Desstdate;
  const createdOn = header.CreatedOn;

  return (
    <View style={styles.container}>
      <Header title={`Aviso ${notifNo || averiaid}`} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Botón regresar */}
        <TouchableOpacity style={styles.backRow} onPress={goBack}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver a la lista</Text>
        </TouchableOpacity>

        {/* ===== Card: Datos generales ===== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos generales</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Número de aviso:</Text>
            <Text style={styles.value}>{notifNo}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Tipo de aviso (NotifType):</Text>
            <Text style={styles.value}>{notifType || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Descripción corta (ShortText):</Text>
            <Text style={styles.value}>{shortText || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Reportado por (Reportedby):</Text>
            <Text style={styles.value}>{reportedBy || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Equipo:</Text>
            <Text style={styles.value}>{equipment || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Ubicación funcional:</Text>
            <Text style={styles.value}>{functLoc || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Fecha de notificación:</Text>
            <Text style={styles.value}>{formatDate(notifDate)}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Fecha deseada inicio (Desstdate):</Text>
            <Text style={styles.value}>{formatDate(desstDate)}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Creado el:</Text>
            <Text style={styles.value}>{formatDate(createdOn)}</Text>
          </View>
        </View>

        {/* ===== Card: Códigos de header ===== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Códigos del aviso (header)</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Grupo de código (CodeGroup):</Text>
            <Text style={styles.value}>{codeGroup || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Código (Coding):</Text>
            <Text style={styles.value}>{coding || '—'}</Text>
          </View>
        </View>

        {/* ===== Card: Item de daño / parte / causa ===== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Detalle de daño / parte / causa</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Descripción del ítem (Descript):</Text>
            <Text style={styles.value}>{codigos?.Descript || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Tipo cat. daño (DCatTyp):</Text>
            <Text style={styles.value}>{codigos?.DCatTyp || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Grupo de daño (DCodegrp):</Text>
            <Text style={styles.value}>{codigos?.DCodegrp || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Código de daño (DCode):</Text>
            <Text style={styles.value}>{codigos?.DCode || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Tipo cat. parte (DlCatTyp):</Text>
            <Text style={styles.value}>{codigos?.DlCatTyp || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Grupo parte dañada (DlCodegrp):</Text>
            <Text style={styles.value}>{codigos?.DlCodegrp || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Código parte dañada (DlCode):</Text>
            <Text style={styles.value}>{codigos?.DlCode || '—'}</Text>
          </View>

        </View>

        <View style={{ height: 16 }} />

        <View>
  <TouchableOpacity
    style={styles.btnPrimary}
    onPress={() =>
      router.push({
        pathname: '/supervisor/ordenes/crear/crearOrden',
        params: {
          averiaid,
          notifNo: String(notifNo || ''),
          equipment: String(equipment || ''),
          functLoc: String(functLoc || ''),
          shortText: String(shortText || ''),
        },
      })
    }
  >
    <Text style={styles.btnPrimaryText}>Crear orden de mantenimiento</Text>
  </TouchableOpacity>
</View>

      </ScrollView>

      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 13,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backText: {
    marginLeft: 4,
    color: COLORS.accent,
    fontWeight: '600',
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.title,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
    flex: 1.1,
  },
  value: {
    fontSize: 13,
    color: COLORS.title,
    flex: 1,
    textAlign: 'right',
  },
  btnPrimary: {
    marginTop: 20,
    backgroundColor: 'blue',
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
