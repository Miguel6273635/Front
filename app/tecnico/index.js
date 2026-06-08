// app/tecnico/index.js

import React, { useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
  BackHandler,
  Image,
} from "react-native";

import { router, useFocusEffect } from "expo-router";
import Header from "../../src/components/Header";

import { useAuth } from "../../src/context/AuthContext";
import { useOffline } from "../../src/offline/OfflineProvider";
import { bootstrapPrefetchOrdenesTecnico } from "../../src/offline/bootstrapSyncTecnico";
import { bootstrapPrefetchConsumiblesCatalogo } from "../../src/offline/bootstrapConsumiblesCatalogo";

// ====== Datos del menú (tiles) ======
const TILES = [
  {
    key: "ordenes",
    title: "Órdenes de servicio",
    icon: require("../../assets/icons/ICONOS TELLUS_CHEK LIST.png"),
    onPress: () => router.push("/tecnico/ordenes"),
  },
  {
    key: "pendiente_firma",
    title: "Pendientes de firma",
    icon: require("../../assets/icons/ICONOS TELLUS_FIRMA.png"),
    onPress: () => router.push("/tecnico/pendiente_firma"),
  },
  {
    key: "no_mantenimiento",
    title: "No mantenimiento",
    icon: require("../../assets/icons/ICONOS TELLUS_NO .png"),
    onPress: () => router.push("/tecnico/no_mantenimiento"),
  },
  {
    key: "averias",
    title: "Aviso de avería",
    icon: require("../../assets/icons/ICONOS TELLUS_ALERTA-29.png"),
    onPress: () => router.push("/tecnico/averias"),
  },
  {
    key: "rutas",
    title: "Ruta asignada",
    icon: require("../../assets/icons/ICONOS TELLUS_MAPA.png"),
    onPress: () => router.push("/tecnico/rutas"),
  },

  /*
  {
    key: "documentos",
    title: "Documentos de mantenimiento",
    icon: require("../../assets/icons/ICONOS TELLUS_ADJUNTAR.png"),
    onPress: () => router.push("/tecnico/documentos"),
  },
  */
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
        pressed && !disabled && Platform.OS === "ios"
          ? { opacity: 0.9 }
          : null,
      ]}
    >
      <View style={styles.tileHeader}>
        <Image
          source={icon}
          style={[
            styles.tileIcon,
            disabled && { opacity: 0.4 },
          ]}
          resizeMode="contain"
        />

        {typeof badge === "number" && badge > 0 && !disabled && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>

      <Text
        style={[
          styles.tileTitle,
          disabled && styles.tileTitleDisabled,
        ]}
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

  /*
    Bloquea el botón físico de regresar en Android
    solo cuando estás en el home principal del técnico.

    Esto evita que el usuario regrese al login desde /tecnico.
    Las vistas internas siguen funcionando normal.
  */
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        console.log("[NAV] Bloqueado regreso desde Inicio Técnico");
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      return () => subscription.remove();
    }, [])
  );

  useEffect(() => {
    const email =
      user?.email ||
      user?.Email ||
      user?.username ||
      user?.Userstatus ||
      null;

    if (!online || !dbReady || !email) return;

    bootstrapPrefetchOrdenesTecnico(String(email).trim())
      .then((r) => {
        console.log("[OFFLINE] prefetch tecnico:", r);
      })
      .catch((e) => {
        console.log(
          "[OFFLINE] prefetch tecnico error:",
          e?.message || e
        );
      });

    bootstrapPrefetchConsumiblesCatalogo()
      .then((r) => {
        console.log("[OFFLINE] prefetch consumibles:", r);
      })
      .catch((e) => {
        console.log(
          "[OFFLINE] prefetch consumibles error:",
          e?.message || e
        );
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
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  grid: {
    padding: 16,
    paddingBottom: 80,
  },

  gridRow: {
    justifyContent: "space-between",
    marginBottom: 12,
  },

  tile: {
    flex: 1,
    minHeight: 130,
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
        shadowOffset: {
          width: 0,
          height: 3,
        },
      },
      android: {
        elevation: 2,
      },
    }),
  },

  tileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  tileIcon: {
    width: 38,
    height: 38,
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

  badgeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },

  tileDisabled: {
    opacity: 0.45,
  },

  tileTitleDisabled: {
    color: "#7A869A",
  },
});