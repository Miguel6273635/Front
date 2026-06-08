// app/supervisor/index.js

import React, { useCallback } from "react";
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

// ====== Datos del menú (tiles) PARA SUPERVISOR ======
const TILES = [
  {
    key: "ordenes",
    title: "Órdenes de servicio",
    icon: require("../../assets/icons/ICONOS TELLUS_CHEK LIST.png"),
    onPress: () => router.push("/supervisor/ordenes"),
  },
  {
    key: "reprogramaciones",
    title: "Reprogramación de órdenes",
    icon: require("../../assets/icons/ICONOS TELLUS_CALENDARIO .png"),
    onPress: () => router.push("/supervisor/reprogramacionesPlan"),
  },
  {
    key: "averia",
    title: "Avisos de avería",
    icon: require("../../assets/icons/ICONOS TELLUS_ALERTA-29.png"),
    onPress: () => router.push("/supervisor/averia"),
  },
  {
    key: "no_mantenimiento",
    title: "No mantenimiento",
    icon: require("../../assets/icons/ICONOS TELLUS_NO .png"),
    onPress: () => router.push("/supervisor/no_mantenimiento"),
  },
  {
    key: "monitoreo",
    title: "Seguimiento en tiempo real",
    icon: require("../../assets/icons/ICONOS TELLUS_UBICACION 2.png"),
    onPress: () => router.push("/supervisor/monitoreo/monitoreo"),
  },
  {
    key: "equipos",
    title: "Equipos a cargo",
    icon: require("../../assets/icons/ICONOS TELLUS_AJUSTE-10.png"),
    onPress: () => router.push("/supervisor/equipos"),
  },
];

// ====== Tile estilo Fiori ======
function FioriTile({ title, icon, badge, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "#d7e3f3" }}
      style={({ pressed }) => [
        styles.tile,
        pressed && Platform.OS === "ios"
          ? { opacity: 0.9 }
          : null,
      ]}
    >
      <View style={styles.tileHeader}>
        <Image
          source={icon}
          style={styles.tileIcon}
          resizeMode="contain"
        />

        {typeof badge === "number" && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>

      <Text
        style={styles.tileTitle}
        numberOfLines={2}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export default function SupervisorHome() {
  /*
    Bloquea el botón físico de regresar en Android
    solo cuando estás en el home principal del supervisor.

    Esto evita que el usuario regrese al login desde /supervisor.
    Las vistas internas siguen funcionando normal.
  */
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        console.log(
          "[NAV] Bloqueado regreso desde Inicio Supervisor"
        );
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      return () => subscription.remove();
    }, [])
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <Header title="Inicio Supervisor" />

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
          />
        )}
      />
    </View>
  );
}

// ====== Estilos inspirados en SAP Fiori (Horizon) ======
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
});