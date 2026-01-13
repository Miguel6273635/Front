import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useDrawer } from '../context/DrawerContext';

const FIORI = {
  overlay: 'rgba(0,0,0,0.35)',
  panelBg: '#FFFFFF',
  border: '#E6E9EF',
  ink: '#0B1F3B',
  muted: '#63718B',
  accent: '#0A6ED1',
};

export default function SideDrawer() {
  const router = useRouter();
  const { open, closeDrawer } = useDrawer();
  const { user, logout } = useAuth();

  const homeRoute =
    user?.rol_id === 1 ? '/admin' : user?.rol_id === 2 ? '/supervisor' : '/tecnico';

  const slideX = useRef(new Animated.Value(-320)).current;

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: open ? 0 : -320,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [open]);

  const items = useMemo(
    () => [
      { key: 'home', label: 'Inicio', icon: 'home-outline', onPress: () => router.push(homeRoute) },
      { key: 'perfil', label: 'Perfil', icon: 'person-outline', onPress: () => router.push('/perfil') },
    ],
    [homeRoute]
  );

  const handleGo = async (fn) => {
    closeDrawer();
    setTimeout(() => fn?.(), 120);
  };

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={closeDrawer}>
      <View style={styles.root}>
        {/* overlay (toca afuera para cerrar) */}
        <Pressable style={styles.overlay} onPress={closeDrawer} />

        {/* panel */}
        <Animated.View style={[styles.panel, { transform: [{ translateX: slideX }] }]}>
          {/* header perfil */}
          <View style={styles.profile}>
            <View style={styles.avatarWrap}>
              {/* Si no tienes avatar, puedes dejar solo el icon */}
              <Ionicons name="person-circle-outline" size={46} color={FIORI.accent} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {user?.nombre || user?.name || 'Usuario'}
              </Text>
              <Text style={styles.role} numberOfLines={1}>
                {user?.rol_id === 1 ? 'Administrador' : user?.rol_id === 2 ? 'Supervisor' : 'Técnico'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* items */}
          {items.map((it) => (
            <TouchableOpacity
              key={it.key}
              style={styles.item}
              activeOpacity={0.75}
              onPress={() => handleGo(it.onPress)}
            >
              <Ionicons name={it.icon} size={22} color={FIORI.ink} style={{ width: 28 }} />
              <Text style={styles.itemText}>{it.label}</Text>
            </TouchableOpacity>
          ))}

          <View style={{ flex: 1 }} />

          <View style={styles.divider} />

          {/* logout */}
          <TouchableOpacity
            style={[styles.item, { marginBottom: 8 }]}
            activeOpacity={0.75}
            onPress={() =>
              handleGo(() => {
                logout?.();
              })
            }
          >
            <Ionicons name="log-out-outline" size={22} color={FIORI.ink} style={{ width: 28 }} />
            <Text style={styles.itemText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: FIORI.overlay },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    backgroundColor: FIORI.panelBg,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    paddingTop: Platform.select({ ios: 54, android: 40 }),
    paddingHorizontal: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 4, height: 0 } },
      android: { elevation: 10 },
    }),
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
  },
  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F6FB',
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  name: { fontSize: 16, fontWeight: '700', color: FIORI.ink },
  role: { marginTop: 2, fontSize: 13, color: FIORI.muted },
  divider: { height: 1, backgroundColor: FIORI.border, marginVertical: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  itemText: { fontSize: 15, color: FIORI.ink, fontWeight: '600' },
});
