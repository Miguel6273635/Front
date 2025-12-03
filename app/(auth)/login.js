import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { router } from 'expo-router';
import Colors from '../../src/constants/colors';

export default function LoginScreen() {
  const { user, login } = useAuth();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      const rol = user.rol_id;
      if (rol === 1) router.replace('/admin');
      else if (rol === 2) router.replace('/supervisor');
      else if (rol === 3) router.replace('/tecnico');
    }
  }, [user]);

  const handleLogin = async () => {
    try {
      await login(correo, password);
    } catch {
      setError('Correo o contraseña incorrectos');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {/* Logo: lo dejamos igual */}
      <Image source={require('../../assets/logo.png')} style={styles.logo} />

      {/* Tarjeta / Panel tipo Fiori */}
      <View style={styles.card}>
        <Text style={styles.title}>Iniciar sesión</Text>

        {/* Campo correo */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Correo</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={20} style={styles.leadingIcon} />
            <TextInput
              placeholder="tu@correo.com"
              value={correo}
              onChangeText={setCorreo}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              placeholderTextColor={FIORI.textMuted}
            />
          </View>
        </View>

        {/* Campo contraseña */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={20} style={styles.leadingIcon} />
            <TextInput
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!verPassword}
              style={styles.input}
              placeholderTextColor={FIORI.textMuted}
            />
            <TouchableOpacity onPress={() => setVerPassword(!verPassword)} style={styles.trailingIconBtn}>
              <Ionicons name={verPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={FIORI.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.helper}>Ingresa tus credenciales para continuar</Text>}

        <TouchableOpacity onPress={handleLogin} style={styles.button}>
          <Text style={styles.buttonText}>Ingresar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Paleta Fiori Horizon */
const FIORI = {
  pageBg: '#F7F7F7',
  cardBg: '#FFFFFF',
  border: '#DDE6F2',
  inputBg: '#FDFEFF',
  text: '#0B1F3B',
  textMuted: '#63718B',
  accent: '#0A6ED1',   // Azul SAP
  danger: '#EB5757',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 160,
    height: 90,
    resizeMode: 'contain',
    marginBottom: 18,
  },
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: FIORI.text,
    marginBottom: 14,
    textAlign: 'center',
  },
  fieldGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: FIORI.textMuted,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FIORI.inputBg,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  leadingIcon: {
    color: FIORI.textMuted,
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: FIORI.text,
    paddingVertical: 10,
  },
  trailingIconBtn: {
    padding: 6,
    marginLeft: 4,
  },
  helper: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 12,
    color: FIORI.textMuted,
    textAlign: 'center',
  },
  error: {
    color: FIORI.danger,
    marginTop: 2,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  button: {
    backgroundColor: FIORI.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
