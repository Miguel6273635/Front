// app/tecnico/index.js

import React, { useCallback, useEffect, useState } from "react";
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

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Header from "../../src/components/Header";

import { useAuth } from "../../src/context/AuthContext";
import { useOffline } from "../../src/offline/OfflineProvider";
import { runBackgroundSyncNow } from "../../src/offline/backgroundSync";

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
  const params = useLocalSearchParams();

  /*
    Miguel Ángel Hernández Álvarez - 29/06/2026

    Flujo correcto:
    - La primera vista del técnico siempre debe ser /tecnico/preparando.
    - Después de la precarga, el botón "Iniciar con mis órdenes"
      debe mandar a /tecnico?ready=1.
    - Solo si ready=1 se muestra este Inicio Técnico.

    Esto evita que el mecánico entre directo al menú sin ver la pantalla
    de preparación y sin que se precarguen los datos del día.
  */
  const puedeVerHome = String(params?.ready || "") === "1";

  const [checkingPreload, setCheckingPreload] = useState(true);

  useEffect(() => {
    let mounted = true;

    const revisarEntrada = async () => {
      try {
        if (mounted) {
          setCheckingPreload(true);
        }

        if (!user) {
          if (mounted) {
            setCheckingPreload(false);
          }

          return;
        }

        if (!puedeVerHome) {
          console.log(
            "[TECNICO HOME] Primera vista del técnico. Redirigiendo a precarga...",
          );

          router.replace("/tecnico/preparando");
          return;
        }

        console.log(
          "[TECNICO HOME] Viene desde precarga. Mostrando Inicio Técnico.",
        );

        if (mounted) {
          setCheckingPreload(false);
        }
      } catch (e) {
        console.log(
          "[TECNICO HOME] Error revisando entrada:",
          e?.message || e,
        );

        router.replace("/tecnico/preparando");
      }
    };

    revisarEntrada();

    return () => {
      mounted = false;
    };
  }, [user, puedeVerHome]);

  /*
    Bloquea el botón físico de regresar en Android
    solo cuando estás en el home principal del técnico.
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

    La primera carga visible la hace /tecnico/preparando.
    Aquí solo se deja una actualización silenciosa cuando ya está en el menú.
  */
  useEffect(() => {
    if (!user) return;
    if (!dbReady) return;
    if (checkingPreload) return;
    if (!puedeVerHome) return;

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
  }, [online, dbReady, user, checkingPreload, puedeVerHome]);

  if (checkingPreload) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <Header title="Preparando información" />

        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={COLORS.brand} />

          <Text style={styles.loadingTitle}>Abriendo precarga</Text>

          <Text style={styles.loadingText}>
            Estamos preparando la información antes de mostrar el menú del
            técnico.
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