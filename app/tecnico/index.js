// app/tecnico/index.js

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  ActivityIndicator,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import Header from "../../src/components/Header";

import { useAuth } from "../../src/context/AuthContext";
import { useOffline } from "../../src/offline/OfflineProvider";
import { runBackgroundSyncNow } from "../../src/offline/backgroundSync";

const PRELOAD_DONE_KEY = (userEmail) =>
  `tecnico:preloadDone:${String(userEmail || "unknown")
    .toLowerCase()
    .trim()}`;

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
          style={[styles.tileIcon, disabled && { opacity: 0.4 }]}
          resizeMode="contain"
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

  const [checkingPreload, setCheckingPreload] = useState(true);

  const userEmail = useMemo(() => {
    return String(
      user?.correo ||
        user?.email ||
        user?.username ||
        user?.preferred_username ||
        "unknown",
    )
      .toLowerCase()
      .trim();
  }, [user]);

  /*
    Validación de precarga.

    IMPORTANTE:
    Esta pantalla se abre directo cuando el usuario ya tiene sesión guardada.
    Por eso no basta con mandar al técnico desde login.

    Flujo:
    - Si NO tiene bandera de precarga, manda a /tecnico/preparando
    - Si ya tiene bandera, muestra Inicio Técnico
  */
  useEffect(() => {
    let mounted = true;

    const revisarPrecarga = async () => {
      try {
        if (!user) {
          if (mounted) setCheckingPreload(false);
          return;
        }

        const preloadDone = await AsyncStorage.getItem(
          PRELOAD_DONE_KEY(userEmail),
        );

        if (preloadDone !== "true") {
          console.log("[TECNICO HOME] Precarga no realizada. Redirigiendo...");
          router.replace("/tecnico/preparando");
          return;
        }

        console.log("[TECNICO HOME] Precarga ya realizada.");
      } catch (e) {
        console.log(
          "[TECNICO HOME] Error revisando precarga:",
          e?.message || e,
        );

        router.replace("/tecnico/preparando");
        return;
      } finally {
        if (mounted) {
          setCheckingPreload(false);
        }
      }
    };

    revisarPrecarga();

    return () => {
      mounted = false;
    };
  }, [user, userEmail]);

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
        onBackPress,
      );

      return () => subscription.remove();
    }, []),
  );

  /*
    Sincronización silenciosa del técnico.

    Esta sync se mantiene, pero ya NO es la primera carga obligatoria.
    La primera carga visible la hace /tecnico/preparando.

    Aquí solo dejamos una actualización silenciosa para mantener datos frescos.
  */
  useEffect(() => {
    if (!user) return;
    if (!dbReady) return;
    if (checkingPreload) return;

    if (!online) {
      console.log("[TECNICO HOME] Sin internet. Se usará información offline.");
      return;
    }

    runBackgroundSyncNow({
      source: "tecnico_home",
    })
      .then((r) => {
        console.log("[TECNICO HOME] Sync segundo plano:", r);
      })
      .catch((e) => {
        console.log("[TECNICO HOME] Sync error:", e?.message || e);
      });
  }, [online, dbReady, user, checkingPreload]);

  if (checkingPreload) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <Header title="Preparando información" />

        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={COLORS.brand} />

          <Text style={styles.loadingTitle}>Validando información</Text>

          <Text style={styles.loadingText}>
            Estamos revisando si la información del técnico ya fue precargada.
          </Text>
        </View>
      </View>
    );
  }

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
  textMuted: "#63718B",
  badgeBg: "#EB5757",
  brand: "#0A6ED1",
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  loadingTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.textPrimary,
    textAlign: "center",
  },

  loadingText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textMuted,
    fontWeight: "700",
    textAlign: "center",
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