// src/components/Header.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter, useNavigation, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useNotificaciones } from '../context/NotificacionesContext';
import Colors from '../constants/colors';

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
  const { logout } = useAuth();
  const { noLeidas = [] } = useNotificaciones();

  const isRoot = ['/admin', '/supervisor', '/tecnico'].includes('/' + segments[1]);

  return (
    <View style={styles.header}>
      {!isRoot && (
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) router.back();
          }}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={FIORI.ink} />
        </TouchableOpacity>
      )}

      <Text style={styles.title}>{title}</Text>

      <View style={styles.rightIcons}>
        <TouchableOpacity onPress={() => router.push('/notificaciones')} style={styles.iconButton} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={22} color={FIORI.ink} />
          {noLeidas.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{noLeidas.length > 99 ? '99+' : noLeidas.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={logout} style={styles.iconButton} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={22} color={FIORI.ink} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Mantengo tus paddings EXACTOS para no alterar la altura ni spacing:
  header: {
    paddingTop: 40,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: FIORI.shellBg,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,            // misma línea inferior, pero con color Fiori
    borderColor: FIORI.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
    }),
  },
  iconButton: {
    padding: 6,                      // igual que el tuyo
    position: 'relative',
    borderRadius: 18,                // toque Fiori (suave)
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: FIORI.ink,                // tinta Fiori
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Badge más “pill” y con contraste Fiori
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
