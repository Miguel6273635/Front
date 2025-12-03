// app/notificaciones/[id].js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useNotificaciones } from '../../src/context/NotificacionesContext';
import Header from '../../src/components/Header';
import Footer from '../../src/components/Footer';
import { fetchNotificationDetailSmart } from '../../src/offline/notifications.store';
import { useAuth } from '../../src/context/AuthContext';

const FIORI = {
  pageBg: '#F7F7F7',
  cardBg: '#FFFFFF',
  cardSubtle: '#F5F7FA',
  border: '#DDE6F2',
  ink: '#0B1F3B',
  textMuted: '#63718B',
  accent: '#0A6ED1',     // azul SAP
  accentSoft: '#E3F2FD',
  danger: '#EB5757',
};

export default function NotificacionDetalle() {
  const { id } = useLocalSearchParams();
  const { notificaciones, marcarComoLeida } = useNotificaciones();
  const { token } = useAuth();
  const [notificacion, setNotificacion] = useState(null);

  useEffect(() => {
    (async () => {
      let encontrada = notificaciones.find(n => n.NotifNo?.toString() === id?.toString());
      if (!encontrada) {
        encontrada = await fetchNotificationDetailSmart(token, id);
      }
      setNotificacion(encontrada);
      if (encontrada && !encontrada.leida) {
        await marcarComoLeida(encontrada.NotifNo);
      }
    })();
  }, [id, notificaciones]);

  if (!notificacion) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={FIORI.accent} />
        <Text style={styles.text}>Cargando notificación...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Detalle de notificación" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Título */}
        <Text style={styles.title}>
          <Ionicons name="document-text-outline" size={20} color={FIORI.accent} />{' '}
          <Text style={styles.titleText}>{notificacion.ShortText || 'Sin título'}</Text>
        </Text>

        {/* Datos principales */}
        <View style={styles.sectionBox}>
          <View style={styles.leftStripe} />
          <View style={{ flex: 1 }}>
            <LabelValue label="Tipo" value={notificacion.NotifType} />
            <LabelValue label="Planta" value={notificacion.Planplant} />
            <LabelValue label="Equipo" value={notificacion.Equipment} />
            <LabelValue
              label="Fecha"
              value={notificacion.NotifDate ? new Date(notificacion.NotifDate).toLocaleString() : 'No disponible'}
            />
          </View>
        </View>

        {/* Items */}
        {notificacion.items?.length > 0 && (
          <View style={styles.sectionBox}>
            <View style={styles.leftStripeSoft} />
            <Text style={styles.sectionTitle}>
              <Ionicons name="list-outline" size={18} color={FIORI.ink} /> Items
            </Text>
            {notificacion.items.map((item, idx) => (
              <Text key={idx} style={styles.value}>• {item.Descript}</Text>
            ))}
          </View>
        )}

        {/* Actividades */}
        {notificacion.activities?.length > 0 && (
          <View style={styles.sectionBox}>
            <View style={styles.leftStripeSoft} />
            <Text style={styles.sectionTitle}>
              <Ionicons name="time-outline" size={18} color={FIORI.ink} /> Actividades
            </Text>
            {notificacion.activities.map((act, idx) => (
              <Text key={idx} style={styles.value}>
                • {act.Acttext} ({act.StartDate} a {act.EndDate})
              </Text>
            ))}
          </View>
        )}

        {/* Partners */}
        {notificacion.partners?.length > 0 && (
          <View style={styles.sectionBox}>
            <View style={styles.leftStripeSoft} />
            <Text style={styles.sectionTitle}>
              <Ionicons name="people-outline" size={18} color={FIORI.ink} /> Partners
            </Text>
            {notificacion.partners.map((p, idx) => (
              <Text key={idx} style={styles.value}>
                • {p.PartnRole || p.role}: {p.Partner || p.partner}
              </Text>
            ))}
          </View>
        )}

        {/* CTA Orden (misma funcionalidad) */}
        {notificacion.Orderid && (
          <TouchableOpacity
            style={styles.botonOrden}
            onPress={() => router.push(`/ordenes/${notificacion.Orderid}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="eye-outline" size={20} color="#fff" />
            <Text style={styles.botonTexto}>Ver Detalles de la Orden</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <Footer />
    </View>
  );
}

/** Componente pequeño para etiquetas/valores estilo Fiori */
function LabelValue({ label, value }) {
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={styles.label}>{label}:</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Mantengo tus espaciamientos base
  container: { flex: 1, backgroundColor: FIORI.pageBg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { marginTop: 10, color: FIORI.textMuted },
  content: { padding: 20 },

  // Título
  title: { marginBottom: 12 },
  titleText: {
    fontSize: 18,
    fontWeight: '700',
    color: FIORI.ink,
  },

  // Caja/Sección tipo “card” Fiori (mantengo padding 14 y radius 10)
  sectionBox: {
    backgroundColor: FIORI.cardBg,
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: FIORI.border,
    flexDirection: 'row',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },

  // Franja izquierda (accent stripe) Fiori
  leftStripe: {
    width: 4,
    backgroundColor: FIORI.accent,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    marginRight: 12,
  },
  leftStripeSoft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: FIORI.border,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },

  // Tipos de texto
  label: { fontSize: 13, fontWeight: '600', color: FIORI.textMuted },
  value: { fontSize: 14, color: FIORI.ink, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: FIORI.ink, marginBottom: 6, paddingLeft: 8 },

  // Botón CTA (cambiado a azul SAP; si prefieres tu rojo, dime y lo dejamos)
  botonOrden: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FIORI.accent,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  botonTexto: { color: '#fff', fontWeight: '700', marginLeft: 8, fontSize: 16 },
});
