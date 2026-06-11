// app/tecnico/index.js
import React, { useEffect, memo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../src/components/Header";

import { useAuth } from "../../src/context/AuthContext";
import { useOffline } from "../../src/offline/OfflineProvider";
import { bootstrapPrefetchOrdenesTecnico } from "../../src/offline/bootstrapSyncTecnico";
import { bootstrapPrefetchConsumiblesCatalogo } from "../../src/offline/bootstrapConsumiblesCatalogo";

// ====== Componentes Bento ======

// 1. Tarjeta Principal (Hero Card) - Para la tarea más importante
const BentoHero = memo(({ title, subtitle, icon, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.heroCard,
      pressed && Platform.OS === "ios" ? { transform: [{ scale: 0.98 }] } : null,
    ]}
  >
    <View style={styles.heroContent}>
      <View style={styles.heroIconWrapper}>
        <Ionicons name={icon} size={32} color="#FFFFFF" />
      </View>
      <View>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
      </View>
    </View>
    <Ionicons name="arrow-forward-circle" size={28} color="rgba(255,255,255,0.8)" />
  </Pressable>
));

// 2. Tarjeta Secundaria (Cuadrada)
const BentoSquare = memo(({ title, icon, badge, onPress, bgVariant }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.squareCard,
      bgVariant === 'dark' ? styles.squareDark : styles.squareLight,
      pressed && Platform.OS === "ios" ? { transform: [{ scale: 0.96 }] } : null,
    ]}
  >
    <View style={styles.squareHeader}>
      <Ionicons 
        name={icon} 
        size={26} 
        color={bgVariant === 'dark' ? "#FFFFFF" : COLORS.primary} 
      />
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? "+99" : badge}</Text>
        </View>
      )}
    </View>
    <Text style={[styles.squareTitle, bgVariant === 'dark' && { color: "#FFFFFF" }]}>
      {title}
    </Text>
  </Pressable>
));

// 3. Tarjeta Alargada (Rectangular)
const BentoRow = memo(({ title, icon, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.rowCard,
      pressed && Platform.OS === "ios" ? { transform: [{ scale: 0.98 }] } : null,
    ]}
  >
    <View style={styles.rowCardContent}>
      <View style={styles.rowIconWrapper}>
        <Ionicons name={icon} size={22} color={COLORS.textSecondary} />
      </View>
      <Text style={styles.rowTitle}>{title}</Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
  </Pressable>
));

export default function TecnicoHome() {
  const { user } = useAuth();
  const { online, dbReady } = useOffline();

  useEffect(() => {
    const email = user?.email || user?.Email || user?.username || null;
    if (!online || !dbReady || !email) return;

    bootstrapPrefetchOrdenesTecnico(String(email).trim()).catch(console.log);
    bootstrapPrefetchConsumiblesCatalogo().catch(console.log);
  }, [online, dbReady, user]);

  const nombreDashboard = user?.name?.split(" ")[0] || user?.username?.split("@")[0] || "Técnico";

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.pageBg} />
      <Header title="Panel de Control" />

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greetingSection}>
          <Text style={styles.dateText}>
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </Text>
          <Text style={styles.greetingText}>Listo para tu jornada</Text>
        </View>

        {/* ESTRUCTURA BENTO BOX */}
        <View style={styles.bentoGrid}>
          
          {/* Fila 1: Tarjeta Principal */}
          <BentoHero 
            title="Órdenes de Servicio" 
            subtitle="Tus tareas principales"
            icon="briefcase-outline" 
            onPress={() => router.push("/tecnico/ordenes")}
          />

          {/* Fila 2: Dos cuadradas asimétricas */}
          <View style={styles.bentoRow}>
            <BentoSquare 
              title="Pendiente Firma" 
              icon="pencil-outline" 
              badge={3} 
              bgVariant="light"
              onPress={() => router.push("/tecnico/pendiente_firma")}
            />
            <BentoSquare 
              title="Aviso de Avería" 
              icon="warning-outline" 
              bgVariant="dark" // Genera un contraste moderno
              onPress={() => router.push("/tecnico/averias")}
            />
          </View>

          {/* Fila 3: Acciones secundarias en lista limpia */}
          <View style={styles.secondaryActions}>
            <BentoRow 
              title="Ruta Asignada" 
              icon="navigate-outline" 
              onPress={() => router.push("/tecnico/rutas")}
            />
            <BentoRow 
              title="No Mantenimiento" 
              icon="ban-outline" 
              onPress={() => router.push("/tecnico/no_mantenimiento")}
            />
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

// ====== Estilos Modernos ======
const COLORS = {
  pageBg: "#F4F6F8", 
  primary: "#0A58CA", // Azul corporativo
  accentDark: "#1E293B", // Gris casi negro para contraste
  cardBg: "#FFFFFF",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
  badgeBg: "#EF4444",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 20, paddingBottom: 100 },
  
  // Header Text
  greetingSection: { marginBottom: 24 },
  dateText: { fontSize: 12, fontWeight: "700", color: COLORS.primary, letterSpacing: 1, marginBottom: 6 },
  greetingText: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -0.5, lineHeight: 34 },
  
  // Grid System
  bentoGrid: { gap: 16 },
  bentoRow: { flexDirection: "row", gap: 16 },
  secondaryActions: { backgroundColor: COLORS.cardBg, borderRadius: 24, padding: 8, marginTop: 4 },

  // Hero Card
  heroCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  heroContent: { flexDirection: "row", alignItems: "center", gap: 16 },
  heroIconWrapper: { backgroundColor: "rgba(255,255,255,0.2)", padding: 12, borderRadius: 20 },
  heroTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  heroSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 4 },

  // Square Cards
  squareCard: {
    flex: 1,
    height: 140,
    borderRadius: 28,
    padding: 20,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  squareLight: { backgroundColor: COLORS.cardBg },
  squareDark: { backgroundColor: COLORS.accentDark },
  squareHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  squareTitle: { fontSize: 16, fontWeight: "600", color: COLORS.textPrimary, lineHeight: 22 },
  
  badge: { backgroundColor: COLORS.badgeBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: "#FFF", fontSize: 12, fontWeight: "bold" },

  // Row Cards
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  rowCardContent: { flexDirection: "row", alignItems: "center", gap: 14 },
  rowIconWrapper: { backgroundColor: COLORS.pageBg, padding: 10, borderRadius: 12 },
  rowTitle: { fontSize: 16, fontWeight: "500", color: COLORS.textPrimary },
});