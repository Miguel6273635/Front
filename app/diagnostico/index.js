import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Device from "expo-device";
import { Paths } from "expo-file-system";
import * as Application from "expo-application";
import * as Network from "expo-network";

import Header from "../../src/components/Header";
import Colors from "../../src/constants/colors";

const MIN_RAM_GB = 6;
const MIN_FREE_STORAGE_GB = 5;
const MIN_ANDROID_API = 30; // Android 11

// Cambia esta URL por la API real de Mitsu si tienes otra
const API_TEST_URL =
  "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";

export default function DiagnosticoScreen() {
  const [info, setInfo] = useState(null);
  const [networkTest, setNetworkTest] = useState(null);
  const [testingNetwork, setTestingNetwork] = useState(false);

  useEffect(() => {
    cargarDiagnostico();
  }, []);

  const bytesToGB = (bytes) => {
    if (!bytes && bytes !== 0) return "No disponible";
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const esperar = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  const cargarDiagnostico = async () => {
    try {
      const totalStorage = Paths?.totalDiskSpace || null;
      const freeStorage = Paths?.availableDiskSpace || null;

      const ramGB = Device.totalMemory
        ? Device.totalMemory / 1024 / 1024 / 1024
        : null;

      const freeStorageGB = freeStorage
        ? freeStorage / 1024 / 1024 / 1024
        : null;

      const androidApi = Device.platformApiLevel || null;

      let maxMemory = null;

      if (Platform.OS === "android") {
        try {
          maxMemory = await Device.getMaxMemoryAsync();
        } catch (error) {
          maxMemory = null;
        }
      }

      const networkState = await Network.getNetworkStateAsync().catch(
        () => null,
      );

      const ipAddress = await Network.getIpAddressAsync().catch(() => null);

      const isConnected = networkState?.isConnected === true;

      const isInternetReachable =
        networkState?.isInternetReachable === null ||
        networkState?.isInternetReachable === undefined
          ? isConnected
          : networkState?.isInternetReachable === true;

      const cumpleRed = isConnected && isInternetReachable;

      const diagnostico = {
        appName: Application.applicationName || "Mitsu App",
        appVersion: Application.nativeApplicationVersion || "No disponible",
        buildVersion: Application.nativeBuildVersion || "No disponible",

        brand: Device.brand || "No disponible",
        manufacturer: Device.manufacturer || "No disponible",
        modelName: Device.modelName || "No disponible",
        productName: Device.productName || "No disponible",

        osName: Device.osName || Platform.OS,
        osVersion: Device.osVersion || "No disponible",
        androidApi,

        totalMemory: Device.totalMemory || null,
        maxMemory,

        totalStorage,
        freeStorage,

        cpuArchitectures: Device.supportedCpuArchitectures || [],

        isDevice: Device.isDevice ? "Dispositivo físico" : "Emulador",

        networkType: networkState?.type || "No disponible",
        isConnected,
        isInternetReachable,
        ipAddress: ipAddress || "No disponible",

        cumpleRam: ramGB !== null ? ramGB >= MIN_RAM_GB : false,
        cumpleStorage:
          freeStorageGB !== null ? freeStorageGB >= MIN_FREE_STORAGE_GB : false,
        cumpleAndroid:
          Platform.OS === "android"
            ? androidApi !== null && androidApi >= MIN_ANDROID_API
            : true,
        cumpleRed,
      };

      setInfo(diagnostico);
    } catch (error) {
      console.log("Error diagnóstico:", error);

      Alert.alert(
        "Error",
        `No se pudo cargar el diagnóstico del dispositivo.\n\nDetalle: ${
          error?.message || "Error desconocido"
        }`,
      );
    }
  };

  const medirEstabilidadRed = async () => {
    setTestingNetwork(true);

    const intentos = 5;
    const tiempos = [];
    let exitosos = 0;
    let fallidos = 0;

    for (let i = 0; i < intentos; i++) {
      const inicio = Date.now();

      try {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
          controller.abort();
        }, 5000);

        await fetch(API_TEST_URL, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const fin = Date.now();
        const tiempo = fin - inicio;

        tiempos.push(tiempo);
        exitosos++;
      } catch (error) {
        fallidos++;
      }

      await esperar(500);
    }

    const promedio =
      tiempos.length > 0
        ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)
        : null;

    const minimo = tiempos.length > 0 ? Math.min(...tiempos) : null;
    const maximo = tiempos.length > 0 ? Math.max(...tiempos) : null;

    let estabilidad = "Mala";

    if (exitosos >= 5 && promedio !== null && promedio <= 800) {
      estabilidad = "Buena";
    } else if (exitosos >= 3 && promedio !== null && promedio <= 2000) {
      estabilidad = "Regular";
    }

    setNetworkTest({
      api: API_TEST_URL,
      intentos,
      exitosos,
      fallidos,
      promedio,
      minimo,
      maximo,
      estabilidad,
    });

    setTestingNetwork(false);
  };

  const estadoGeneral =
    info &&
    info.cumpleRam &&
    info.cumpleStorage &&
    info.cumpleAndroid &&
    info.cumpleRed;

  return (
    <View style={styles.container}>
      <Header title="Diagnóstico" />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="phone-portrait-outline" size={86} color="#ff6868" />
          </View>

          <Text style={styles.name}>Diagnóstico del dispositivo</Text>

          <Text style={styles.description}>
            Información técnica para validar si el dispositivo, almacenamiento,
            red o sistema operativo pueden afectar el funcionamiento de Mitsu
            App.
          </Text>

          {!info ? (
            <Text style={styles.loading}>Cargando información...</Text>
          ) : (
            <>
              <View
                style={[
                  styles.statusBox,
                  estadoGeneral ? styles.statusOk : styles.statusWarning,
                ]}
              >
                <Ionicons
                  name={
                    estadoGeneral
                      ? "checkmark-circle-outline"
                      : "warning-outline"
                  }
                  size={22}
                  color={estadoGeneral ? "#15803D" : "#B45309"}
                />

                <Text
                  style={[
                    styles.statusText,
                    {
                      color: estadoGeneral ? "#15803D" : "#B45309",
                    },
                  ]}
                >
                  {estadoGeneral
                    ? "El dispositivo cumple con lo recomendado."
                    : "El dispositivo puede presentar problemas."}
                </Text>
              </View>

              <Section title="Aplicación">
                <InfoRow label="Nombre" value={info.appName} />
                <InfoRow label="Versión" value={info.appVersion} />
                <InfoRow label="Build" value={info.buildVersion} />
              </Section>

              <Section title="Dispositivo">
                <InfoRow label="Marca" value={info.brand} />
                <InfoRow label="Fabricante" value={info.manufacturer} />
                <InfoRow label="Modelo" value={info.modelName} />
                <InfoRow label="Producto" value={info.productName} />
                <InfoRow label="Tipo" value={info.isDevice} />
              </Section>

              <Section title="Sistema operativo">
                <InfoRow label="Sistema" value={info.osName} />
                <InfoRow label="Versión" value={info.osVersion} />
                <InfoRow
                  label="Android API"
                  value={
                    info.androidApi ? String(info.androidApi) : "No disponible"
                  }
                />
                <InfoRow
                  label="Validación"
                  value={info.cumpleAndroid ? "Correcto" : "Revisar"}
                  danger={!info.cumpleAndroid}
                />
              </Section>

              <Section title="Memoria RAM">
                <InfoRow
                  label="RAM total"
                  value={bytesToGB(info.totalMemory)}
                />
                <InfoRow
                  label="Memoria máxima app"
                  value={bytesToGB(info.maxMemory)}
                />
                <InfoRow
                  label="Validación"
                  value={info.cumpleRam ? "Correcto" : "Revisar"}
                  danger={!info.cumpleRam}
                />
              </Section>

              <Section title="Almacenamiento">
                <InfoRow
                  label="Almacenamiento total"
                  value={bytesToGB(info.totalStorage)}
                />
                <InfoRow
                  label="Almacenamiento libre"
                  value={bytesToGB(info.freeStorage)}
                />
                <InfoRow
                  label="Validación"
                  value={info.cumpleStorage ? "Correcto" : "Revisar"}
                  danger={!info.cumpleStorage}
                />
              </Section>

              <Section title="Procesador">
                <InfoRow
                  label="Arquitectura CPU"
                  value={
                    info.cpuArchitectures.length > 0
                      ? info.cpuArchitectures.join(", ")
                      : "No disponible"
                  }
                />
              </Section>

              <Section title="Red e internet">
                <InfoRow
                  label="Conectado"
                  value={info.isConnected ? "Sí" : "No"}
                  danger={!info.isConnected}
                />

                <InfoRow
                  label="Internet disponible"
                  value={info.isInternetReachable ? "Sí" : "No"}
                  danger={!info.isInternetReachable}
                />

                <InfoRow
                  label="Tipo de conexión"
                  value={traducirTipoRed(info.networkType)}
                />

                <InfoRow label="Dirección IP" value={info.ipAddress} />

                <InfoRow
                  label="Validación"
                  value={info.cumpleRed ? "Correcto" : "Revisar"}
                  danger={!info.cumpleRed}
                />
              </Section>

              <Section title="Prueba de estabilidad de red">
                <InfoRow
                  label="API probada"
                  value={networkTest?.api || "Sin prueba"}
                />

                <InfoRow
                  label="Intentos"
                  value={
                    networkTest ? String(networkTest.intentos) : "Sin prueba"
                  }
                />

                <InfoRow
                  label="Exitosos"
                  value={
                    networkTest ? String(networkTest.exitosos) : "Sin prueba"
                  }
                  danger={networkTest && networkTest.exitosos < 3}
                />

                <InfoRow
                  label="Fallidos"
                  value={
                    networkTest ? String(networkTest.fallidos) : "Sin prueba"
                  }
                  danger={networkTest && networkTest.fallidos > 0}
                />

                <InfoRow
                  label="Promedio"
                  value={
                    networkTest?.promedio !== null &&
                    networkTest?.promedio !== undefined
                      ? `${networkTest.promedio} ms`
                      : "Sin prueba"
                  }
                  danger={networkTest && networkTest.promedio > 2000}
                />

                <InfoRow
                  label="Tiempo mínimo"
                  value={
                    networkTest?.minimo !== null &&
                    networkTest?.minimo !== undefined
                      ? `${networkTest.minimo} ms`
                      : "Sin prueba"
                  }
                />

                <InfoRow
                  label="Tiempo máximo"
                  value={
                    networkTest?.maximo !== null &&
                    networkTest?.maximo !== undefined
                      ? `${networkTest.maximo} ms`
                      : "Sin prueba"
                  }
                  danger={networkTest && networkTest.maximo > 3000}
                />

                <InfoRow
                  label="Estabilidad"
                  value={networkTest?.estabilidad || "Sin prueba"}
                  danger={
                    networkTest &&
                    (networkTest.estabilidad === "Regular" ||
                      networkTest.estabilidad === "Mala")
                  }
                />
              </Section>

              <TouchableOpacity
                style={styles.buttonSecondary}
                activeOpacity={0.8}
                onPress={medirEstabilidadRed}
                disabled={testingNetwork}
              >
                <Ionicons name="speedometer-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>
                  {testingNetwork
                    ? "Midiendo red..."
                    : "Medir estabilidad de red"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                activeOpacity={0.8}
                onPress={cargarDiagnostico}
              >
                <Ionicons name="refresh-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>Actualizar diagnóstico</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, danger }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}:</Text>

      <Text style={[styles.value, danger && styles.danger]}>
        {value || "No disponible"}
      </Text>
    </View>
  );
}

function traducirTipoRed(type) {
  switch (type) {
    case "WIFI":
    case "wifi":
      return "WiFi";

    case "CELLULAR":
    case "cellular":
      return "Datos móviles";

    case "ETHERNET":
    case "ethernet":
      return "Ethernet";

    case "BLUETOOTH":
    case "bluetooth":
      return "Bluetooth";

    case "VPN":
    case "vpn":
      return "VPN";

    case "NONE":
    case "none":
      return "Sin conexión";

    case "UNKNOWN":
    case "unknown":
      return "Desconocida";

    default:
      return type || "No disponible";
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors?.background || "#f7f7f7",
  },

  scroll: {
    padding: 20,
    paddingBottom: 100,
    alignItems: "center",
  },

  card: {
    backgroundColor: Colors?.surface || "#fff",
    width: "100%",
    maxWidth: 600,
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowRadius: 8,
    elevation: 2,
    marginTop: 16,
  },

  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 16,
    backgroundColor: "#F3F6FB",
    borderWidth: 1,
    borderColor: "#E6E9EF",
    alignItems: "center",
    justifyContent: "center",
  },

  name: {
    fontSize: 22,
    fontWeight: "bold",
    color: Colors?.primary || "#a10000",
    marginBottom: 6,
    textAlign: "center",
  },

  description: {
    fontSize: 15,
    color: Colors?.text || "#333",
    marginBottom: 16,
    textAlign: "center",
    lineHeight: 21,
  },

  loading: {
    fontSize: 15,
    color: Colors?.textLight || "#666",
    marginTop: 10,
  },

  statusBox: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },

  statusOk: {
    backgroundColor: "#DCFCE7",
  },

  statusWarning: {
    backgroundColor: "#FEF3C7",
  },

  statusText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },

  section: {
    width: "100%",
    marginTop: 10,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: Colors?.primary || "#a10000",
    marginBottom: 8,
    marginTop: 6,
  },

  row: {
    width: "100%",
    backgroundColor: Colors?.chip || "#f2f4f7",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  },

  label: {
    fontSize: 15,
    color: Colors?.textLight || "#666",
    flex: 1,
  },

  value: {
    fontSize: 15,
    color: Colors?.text || "#222",
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },

  danger: {
    color: "#DC2626",
  },

  buttonSecondary: {
    marginTop: 10,
    width: "100%",
    backgroundColor: "#0A6ED1",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  button: {
    marginTop: 10,
    width: "100%",
    backgroundColor: Colors?.primary || "#a10000",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },
});
