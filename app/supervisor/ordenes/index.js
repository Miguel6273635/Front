import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import api from '../../../src/services/api';
import { router } from 'expo-router';

export default function ListaOrdenesSupervisor() {
  const { token } = useAuth();
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrdenes = async () => {
    try {
      const res = await api.get('/ordenes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrdenes(res.data);
    } catch (error) {
      console.error('Error al cargar órdenes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdenes();
  }, []);

  const renderItem = ({ item }) => {
    const estatusColor =
      item.estatus === 'pendiente'
        ? '#E76565'
        : item.estatus === 'en_proceso'
        ? '#F5C044'
        : '#6FCF97';

    const estatusIcon =
      item.estatus === 'pendiente'
        ? 'time-outline'
        : item.estatus === 'en_proceso'
        ? 'refresh-outline'
        : 'checkmark-circle-outline';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/ordenes/${item.orderid}`)}
      >
        {/* barra lateral */}
        <View style={[styles.sideBar, { backgroundColor: estatusColor }]} />

        {/* contenido */}
        <View style={styles.cardBody}>
          {/* fila principal */}
          <View style={styles.topRow}>
            <View style={styles.titleWrap}>
              <View style={styles.avatar}>
                <Ionicons name="document-text-outline" size={20} color="#0B1F3B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  #{item.orderid} — {item.nombre_orden}
                </Text>
                <Text style={styles.subTitle} numberOfLines={1}>
                  {item.solicitante || 'Sin solicitante'}
                </Text>
              </View>
            </View>

            {/* pill de estatus */}
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: estatusColor + '20',
                  borderColor: estatusColor,
                },
              ]}
            >
              <Ionicons
                name={estatusIcon}
                size={14}
                color="#0B1F3B"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.statusText}>
                {item.estatus?.replace('_', ' ') || '—'}
              </Text>
            </View>
          </View>

          {/* fila de detalles */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="cube-outline" size={14} color="#52616B" />
              <Text style={styles.metaText}>
                {item.clave_equipo || 'Sin clave'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color="#52616B" />
              <Text style={styles.metaText}>
                {item.startdate
                  ? new Date(item.startdate).toLocaleDateString()
                  : 'Sin fecha'}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Órdenes de servicio" />

      {/* Encabezado Fiori */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>Lista de órdenes</Text>
          <Text style={styles.pageSubtitle}>
            {loading ? 'Cargando...' : `${ordenes.length} órdenes encontradas`}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#0A6ED1" />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(item) => item.orderid?.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Footer />
    </View>
  );
}

const COLORS = {
  pageBg: '#F4F6F9',
  cardBg: '#FFFFFF',
  border: '#E4E9F0',
  title: '#0B1F3B',
  text: '#52616B',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },
  pageHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.title,
  },
  pageSubtitle: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 3,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 80,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    // sombra suave estilo Fiori
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
    minHeight: 92,
  },
  sideBar: {
    width: 5,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EFF4F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.title,
  },
  subTitle: {
    fontSize: 12.5,
    color: '#7A8794',
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
    color: COLORS.title,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12.5,
    color: COLORS.text,
  },
});
