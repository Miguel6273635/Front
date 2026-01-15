// app/login/index.js (o donde tengas tu login)
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { router } from "expo-router";

const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  border: "#DDE6F2",
  text: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
  danger: "#EB5757",
};

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return "/admin";
  if (rol_id === 2) return "/supervisor";
  return "/tecnico";
}

// ✅ Ajusta estos textos a tu empresa
const BRAND = {
  developer: "Tellus Technologies",
  customer: "Mitsubishi Electric de México",
};

export default function LoginScreen() {
  const { user, loginSSO, loading } = useAuth();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user) router.replace(pickHomeByRole(user.rol_id));
  }, [user]);

  const handleLoginSSO = async () => {
    setError("");
    setSending(true);
    try {
      await loginSSO();
    } catch (e) {
      console.log("SSO error:", e?.message || e);
      setError(e?.message ? String(e.message) : "No se pudo iniciar sesión con Microsoft");
    } finally {
      setSending(false);
    }
  };

  const disabled = sending || loading;
  const year = new Date().getFullYear();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ✅ Contenido centrado */}
      <View style={styles.centerWrap}>
        {/* Logo de la app / cliente */}
        <Image source={require("../../assets/logo.png")} style={styles.logo} />

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
            activeOpacity={0.85}
          >
            <Ionicons name="logo-microsoft" size={18} color={FIORI.text} />
            <Text style={styles.msButtonText}>
              {sending ? "Abriendo Microsoft..." : "Continuar con Microsoft"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ✅ Footer marca / derechos + LOGO TELLUS */}
      <View style={styles.footer}>
        {/* 👇 Asegúrate de tener este archivo:
            /assets/tellus.png
            (ideal PNG horizontal y transparente)
        */}
        <Text style={styles.footerLine1}>
          Desarrollado por <Text style={styles.footerStrong}>{BRAND.developer}</Text>
        </Text>
        <Image source={require("../../assets/tellus_logo.png")} style={styles.footerLogo} />

        <Text style={styles.footerLine2}>
          © {year} {BRAND.customer}. Todos los derechos reservados.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 18,
    justifyContent: "space-between", // ✅ footer abajo
  },

  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  logo: {
    width: 160,
    height: 90,
    resizeMode: "contain",
    marginBottom: 18,
  },

  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: FIORI.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 3 },
    }),
  },

  title: {
    fontSize: 20,
    fontWeight: "700",
    color: FIORI.text,
    marginBottom: 10,
    textAlign: "center",
  },

  helper: {
    marginBottom: 12,
    fontSize: 12,
    color: FIORI.textMuted,
    textAlign: "center",
  },

  error: {
    color: FIORI.danger,
    marginBottom: 12,
    textAlign: "center",
    fontWeight: "600",
  },

  msButton: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FFF",
  },

  msButtonText: {
    color: FIORI.text,
    fontSize: 15,
    fontWeight: "700",
  },

  // ✅ Footer
  footer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },

  // ✅ Logo Tellus en footer
  footerLogo: {
    width: 90,
    height: 20,
    resizeMode: "contain",
    marginBottom: 6,
    opacity: 0.95,
  },

  footerLine1: {
    fontSize: 11,
    color: FIORI.textMuted,
    marginBottom: 2,
    textAlign: "center",
  },

  footerStrong: {
    color: FIORI.text,
    fontWeight: "700",
  },

  footerLine2: {
    fontSize: 10,
    color: FIORI.textMuted,
    opacity: 0.9,
    textAlign: "center",
  },
});
