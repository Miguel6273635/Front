// src/components/Header.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';
import { useRouter, useNavigation, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotificaciones } from '../context/NotificacionesContext';
import { useDrawer } from '../context/DrawerContext';

const FIORI = {
  shellBg: '#FFFFFF',
  border: '#E6E9EF',
  ink: '#0B1F3B',
  accent: '#0A6ED1',
  danger: '#EB5757',
};

export default function Header({ title }) {
  const router = useRouter();
  const navigation = useNavigation();
  const segments = useSegments();
  const { noLeidas = [] } = useNotificaciones();
  const { toggleDrawer } = useDrawer();

  // Detecta si estamos en una pantalla raíz
  const isRoot = ['/admin', '/supervisor', '/tecnico'].includes('/' + segments[1]);

  return (
    <View style={styles.header}>
      {/* ===== LOGO CENTRADO ===== */}
      <View style={styles.logoWrapper}>
        <Image
          source={require('../../assets/logo_simple.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* ===== FILA: BACK | TITULO | ICONOS ===== */}
      <View style={styles.row}>
        {/* Back */}
        {!isRoot ? (
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) router.back();
            }}
            style={styles.iconButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={FIORI.ink} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 34 }} /> // espacio para centrar título
        )}

        {/* Título */}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        {/* Iconos derecha */}
        <View style={styles.rightIcons}>
          {/* Notificaciones */}
          <TouchableOpacity
            onPress={() => router.push('')}
            style={styles.iconButton}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={22} color={FIORI.ink} />
            {noLeidas.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {noLeidas.length > 99 ? '99+' : noLeidas.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* ☰ MENÚ LATERAL */}
          <TouchableOpacity
            onPress={toggleDrawer}
            style={styles.iconButton}
            activeOpacity={0.7}
          >
            <Ionicons name="menu-outline" size={26} color={FIORI.ink} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 40,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: FIORI.shellBg,
    borderBottomWidth: 1,
    borderColor: FIORI.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 3 },
    }),
  },

  logoWrapper: {
    alignItems: 'center',
    marginBottom: 6,
  },

  logo: {
    width: 120,
    height: 32,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  iconButton: {
    padding: 6,
    borderRadius: 18,
    position: 'relative',
  },

  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: FIORI.ink,
  },

  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: FIORI.danger,
    borderRadius: 10,
    paddingHorizontal: 5,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
