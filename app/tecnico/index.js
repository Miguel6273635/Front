import React, { useEffect, memo, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
  Animated,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../src/components/Header";

import { useAuth } from "../../src/context/AuthContext";
import { useOffline } from "../../src/offline/OfflineProvider";
import { bootstrapPrefetchOrdenesTecnico } from "../../src/offline/bootstrapSyncTecnico";
import { bootstrapPrefetchConsumiblesCatalogo } from "../../src/offline/bootstrapConsumiblesCatalogo";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ====== Estilos Modernos ======
const COLORS = {
  pageBg: "#F4F6F8", primary: "#0A58CA", accentDark: "#1E293B",
  cardBg: "#FFFFFF", textPrimary: "#111827", textSecondary: "#6B7280", badgeBg: "#EF4444",
};

// ====== Componentes Bento ======
const BentoHero = memo(({ title, subtitle, icon, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.heroCard, pressed && Platform.OS === 'ios' ? { opacity: 0.8 } : null]}>
    <View style={styles.heroContent}>
      <View style={styles.heroIconWrapper}><Ionicons name={icon} size={32} color="#FFFFFF" /></View>
      <View><Text style={styles.heroTitle}>{title}</Text><Text style={styles.heroSubtitle}>{subtitle}</Text></View>
    </View>
    <Ionicons name="arrow-forward-circle" size={28} color="rgba(255,255,255,0.8)" />
  </Pressable>
));

const BentoSquare = memo(({ title, icon, onPress, bgVariant }) => (
  <Pressable onPress={onPress} style={[styles.squareCard, bgVariant === "dark" ? styles.squareDark : styles.squareLight]}>
    <Ionicons name={icon} size={26} color={bgVariant === "dark" ? "#FFFFFF" : COLORS.primary} />
    <Text style={[styles.squareTitle, bgVariant === "dark" && { color: "#FFFFFF" }]}>{title}</Text>
  </Pressable>
));

const BentoRow = memo(({ title, icon, onPress }) => (
  <Pressable onPress={onPress} style={styles.rowCard}>
    <View style={styles.rowCardContent}>
      <View style={styles.rowIconWrapper}><Ionicons name={icon} size={22} color={COLORS.textSecondary} /></View>
      <Text style={styles.rowTitle}>{title}</Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
  </Pressable>
));

export default function TecnicoHome() {
  const { user } = useAuth();
  const { online, dbReady } = useOffline();

  const [ultimaSync, setUltimaSync] = useState("Esperando...");
  const [isFirstSync, setIsFirstSync] = useState(true);
  const [syncMessage, setSyncMessage] = useState("Iniciando conexión segura...");
  const [percent, setPercent] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  const progress = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem("ultima_sincronizacion").then((hora) => {
      if (hora) setUltimaSync(hora);
    });
  }, []);

  const updateProgress = (val, msg) => {
    setSyncMessage(msg);
    Animated.timing(progress, { toValue: val, duration: 800, useNativeDriver: false }).start();
  };

  useEffect(() => {
    const arrancarSincronizacion = async () => {
      const email = user?.correo || user?.email || user?.Email || user?.upn || user?.username || null;
      if (!online || !dbReady || !email) { setIsFirstSync(false); return; }

      const firstSyncKey = `first_sync_done_${email}`;
      const hasDoneFirstSync = await AsyncStorage.getItem(firstSyncKey);

      if (!hasDoneFirstSync) {
        try {
          updateProgress(0.2, "Conectando con servidores...");
          await bootstrapPrefetchOrdenesTecnico(String(email).trim());
          updateProgress(0.6, "Descargando historial...");
          await bootstrapPrefetchConsumiblesCatalogo();
          updateProgress(1, "Configuración completada");
          setPercent(100);
          setIsReady(true);
          await AsyncStorage.setItem(firstSyncKey, "true");
        } catch (err) { setIsFirstSync(false); }
      } else {
        setIsFirstSync(false);
        bootstrapPrefetchOrdenesTecnico(String(email).trim()).catch(console.log);
      }
    };
    arrancarSincronizacion();
  }, [online, dbReady, user]);

  if (isFirstSync) {
    return (
      <View style={styles.firstSyncContainer}>
        <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name="apps-outline" size={60} color="#FFF" />
        </Animated.View>
        <Text style={styles.syncTitle}>Configurando tu entorno</Text>
        <Text style={styles.syncMsg}>{syncMessage}</Text>
        <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </View>
        {isReady && (
          <TouchableOpacity style={styles.startBtn} onPress={() => setIsFirstSync(false)}>
            <Text style={styles.startBtnText}>Comenzar jornada</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Panel de Control" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.greetingSection}>
          <Text style={styles.dateText}>{new Date().toLocaleDateString("es-ES", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</Text>
          <Text style={styles.greetingText}>Listo para tu jornada</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 4 }}>Última actualización: {ultimaSync}</Text>
        </View>

        <View style={styles.bentoGrid}>
          <BentoHero title="Órdenes de Servicio" subtitle="Tus tareas principales" icon="briefcase-outline" onPress={() => router.push("/tecnico/ordenes")} />
          <View style={styles.bentoRow}>
            <BentoSquare title="Pendiente Firma" icon="pencil-outline" bgVariant="light" onPress={() => router.push("/tecnico/pendiente_firma")} />
            <BentoSquare title="Aviso de Avería" icon="warning-outline" bgVariant="dark" onPress={() => router.push("/tecnico/averias")} />
          </View>
          <View style={styles.secondaryActions}>
            <BentoRow title="Ruta Asignada" icon="navigate-outline" onPress={() => router.push("/tecnico/rutas")} />
            <BentoRow title="No Mantenimiento" icon="ban-outline" onPress={() => router.push("/tecnico/no_mantenimiento")} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 20 },
  greetingSection: { marginBottom: 24 },
  dateText: { fontSize: 12, fontWeight: "700", color: COLORS.primary, letterSpacing: 1 },
  greetingText: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary },
  bentoGrid: { gap: 16 },
  bentoRow: { flexDirection: "row", gap: 16 },
  heroCard: { backgroundColor: COLORS.primary, borderRadius: 28, padding: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: { color: "#FFF", fontSize: 20, fontWeight: "700" },
  heroSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 13 },
  squareCard: { flex: 1, height: 140, borderRadius: 28, padding: 20, justifyContent: "space-between" },
  squareLight: { backgroundColor: COLORS.cardBg },
  squareDark: { backgroundColor: COLORS.accentDark },
  squareTitle: { fontSize: 16, fontWeight: "600" },
  rowCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  rowCardContent: { flexDirection: "row", alignItems: "center", gap: 14 },
  firstSyncContainer: { flex: 1, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", padding: 40 },
  iconContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  syncTitle: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  syncMsg: { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginBottom: 30 },
  progressBarBg: { width: '100%', height: 6, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FFF' },
  startBtn: { marginTop: 40, backgroundColor: '#FFF', paddingHorizontal: 30, paddingVertical: 14, borderRadius: 30 },
  startBtnText: { color: COLORS.primary, fontWeight: '800' }
});