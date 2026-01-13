import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { router } from 'expo-router';

const FIORI = {
  pageBg: '#F7F7F7',
  cardBg: '#FFFFFF',
  border: '#DDE6F2',
  text: '#0B1F3B',
  textMuted: '#63718B',
  accent: '#0A6ED1',
  danger: '#EB5757',
};

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return '/admin';
  if (rol_id === 2) return '/supervisor';
  return '/tecnico';
}

export default function LoginScreen() {
  const { user, loginSSO, loading } = useAuth();
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user) router.replace(pickHomeByRole(user.rol_id));
  }, [user]);

  const handleLoginSSO = async () => {
    setError('');
    setSending(true);
    try {
      await loginSSO(); // callback /auth termina
    } catch (e) {
      console.log('SSO error:', e?.message || e);
      setError(e?.message ? String(e.message) : 'No se pudo iniciar sesión con Microsoft');
    } finally {
      setSending(false);
    }
  };

  const disabled = sending || loading;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Image source={require('../../assets/logo.png')} style={styles.logo} />

      <View style={styles.card}>
        <Text style={styles.title}>Iniciar sesión</Text>

        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <Text style={styles.helper}>Continúa con tu cuenta corporativa Microsoft</Text>
        )}

        <TouchableOpacity
          onPress={handleLoginSSO}
          style={[styles.msButton, disabled && { opacity: 0.7 }]}
          disabled={disabled}
        >
          <Ionicons name="logo-microsoft" size={18} color={FIORI.text} />
          <Text style={styles.msButtonText}>
            {sending ? 'Abriendo Microsoft...' : 'Continuar con Microsoft'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: { width: 160, height: 90, resizeMode: 'contain', marginBottom: 18 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: FIORI.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 18,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 3 },
    }),
  },
  title: { fontSize: 20, fontWeight: '700', color: FIORI.text, marginBottom: 10, textAlign: 'center' },
  helper: { marginBottom: 12, fontSize: 12, color: FIORI.textMuted, textAlign: 'center' },
  error: { color: FIORI.danger, marginBottom: 12, textAlign: 'center', fontWeight: '600' },
  msButton: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFF',
  },
  msButtonText: { color: FIORI.text, fontSize: 15, fontWeight: '700' },
});
