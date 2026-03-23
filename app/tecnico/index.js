// app/tecnico/index.js
import React, { useEffect } from "react";
import {
  View,
  Text,
  FlatList,
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

// ====== Datos del menú (tiles) ======
const TILES = [
  {
    key: "ordenes",
    title: "Órdenes de servicio",
    icon: "document-text-outline",
    onPress: () => router.push("/tecnico/ordenes"),
  },
  {
    key: "pendiente_firma",
    title: "Pendiente de firma",
    icon: "pencil-outline",
    onPress: () => router.push("/tecnico/pendiente_firma"),
  },
  {
    key: "no_mantenimiento",
    title: "No mantenimiento",
    icon: "ban-outline",
    onPress: () => router.push("/tecnico/no_mantenimiento"),
  },
  {
    key: "averias",
    title: "Aviso de avería",
    icon: "warning-outline",
    onPress: () => router.push("/tecnico/averias"),
  },
  {
    key: "rutas",
    title: "Ruta asignada",
    icon: "navigate-outline",
    onPress: () => router.push("/tecnico/rutas"),
  },
  /*{
    key: "documentos",
    title: "Documentos de mantenimiento",
    icon: "documents-outline",
    onPress: () => router.push("/tecnico/documentos"),
  },*/
];

// ====== Tile estilo Fiori ======
function FioriTile({ title, icon, badge, onPress, disabled = false }) {
  return (
    <Pressable
      onPress={disabled ? null : onPress}
      disabled={disabled}
      android_ripple={disabled ? null : { color: "#d7e3f3" }}
      style={({ pressed }) => [
        styles.tile,
        disabled && styles.tileDisabled,
        pressed && !disabled && Platform.OS === "ios" ? { opacity: 0.9 } : null,
      ]}
    >
      <View style={styles.tileHeader}>
        <Ionicons
          name={icon}
          size={28}
          color={disabled ? "#9AA5B1" : "#0B1F3B"}
        />

        {typeof badge === "number" && badge > 0 && !disabled && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>

      <Text
        style={[styles.tileTitle, disabled && styles.tileTitleDisabled]}
        numberOfLines={2}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export default function TecnicoHome() {
  const { user } = useAuth();
  const { online, dbReady } = useOffline();

  useEffect(() => {
    // ✅ detecta email (ajusta aquí si tu user trae otro nombre de campo)
    const email =
      user?.email ||
      user?.Email ||
      user?.username ||
      user?.Userstatus ||
      null;

    if (!online || !dbReady || !email) return;

    // dispara prefetch (no bloquea UI)
    bootstrapPrefetchOrdenesTecnico(String(email).trim())
      .then((r) => {
        console.log("[OFFLINE] prefetch tecnico:", r);
      })
      .catch((e) => {
        console.log("[OFFLINE] prefetch tecnico error:", e?.message || e);
      });
  }, [online, dbReady, user]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Header title="Inicio Técnico" />

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
            disabled={item.disabled}
          />
        )}
      />
    </View>
  );
}

const COLORS = {
  pageBg: "#F7F7F7",
  tileBg: "#EFF4F9",
  tileBorder: "#DDE6F2",
  textPrimary: "#0B1F3B",
  badgeBg: "#EB5757",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  grid: { padding: 16, paddingBottom: 80 },
  gridRow: { justifyContent: "space-between", marginBottom: 12 },
  tile: {
    flex: 1,
    minHeight: 110,
    backgroundColor: COLORS.tileBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.tileBorder,
    padding: 14,
    marginHorizontal: 6,
    justifyContent: "space-between",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
    }),
  },
  tileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: COLORS.badgeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  tileDisabled: { opacity: 0.45 },
  tileTitleDisabled: { color: "#7A869A" },
});
