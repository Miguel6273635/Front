import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../src/components/Header';
import Footer from '../../src/components/Footer';

// ====== Datos del menú (tiles) PARA SUPERVISOR ======
const TILES = [
  {
    key: 'planes',
    title: 'Planes de mantenimiento',
    icon: 'calendar-outline',
    onPress: () => router.push('/supervisor/planes'),
  },
  {
    key: 'ordenes',
    title: 'Órdenes de servicio',
    icon: 'document-text-outline',
    onPress: () => router.push('/supervisor/ordenes'),
  },
  {
    key: 'averia',
    title: 'Avisos de avería',
    icon: 'warning-outline',
    onPress: () => router.push('/supervisor/averia'),
  },
  {
    key: 'notificaciones',
    title: 'Notificaciones',
    icon: 'notifications-outline',
    // si en algún momento quieres pasarle el total, aquí se lo pones:
    // badge: 5,
    onPress: () => router.push('/notificaciones'),
  },
  {
    key: 'monitoreo',
    title: 'Seguimiento en tiempo real',
    icon: 'location-outline',
    onPress: () => router.push('/supervisor/monitoreo/monitoreo'),
  },
  // si luego quieres más, se agregan aquí sin romper el diseño
];

// ====== Tile (azulejo) estilo Fiori ======
function FioriTile({ title, icon, badge, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#d7e3f3' }}
      style={({ pressed }) => [
        styles.tile,
        pressed && Platform.OS === 'ios' ? { opacity: 0.9 } : null,
      ]}
    >
      <View style={styles.tileHeader}>
        <Ionicons name={icon} size={28} />
        {typeof badge === 'number' && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.tileTitle} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

export default function SupervisorHome() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Header title="Inicio Supervisor" />

      {/* Grid 2 columnas tipo Launchpad / Fiori */}
      <FlatList
        data={TILES}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <FioriTile
            title={item.title}
            icon={item.icon}
            badge={item.badge}
            onPress={item.onPress}
          />
        )}
      />

      <Footer />
    </View>
  );
}

// ====== Estilos inspirados en SAP Fiori (Horizon) ======
const COLORS = {
  pageBg: '#F7F7F7',
  tileBg: '#EFF4F9',
  tileBorder: '#DDE6F2',
  textPrimary: '#0B1F3B',
  badgeBg: '#EB5757',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },
  grid: {
    padding: 16,
    paddingBottom: 80, // deja espacio para el Footer
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tile: {
    flex: 1,
    minHeight: 110,
    backgroundColor: COLORS.tileBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.tileBorder,
    padding: 14,
    marginHorizontal: 6,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 2,
      },
    }),
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: COLORS.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
