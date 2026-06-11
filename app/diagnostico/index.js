import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Device from "expo-device";
import { Paths } from "expo-file-system";
import * as Application from "expo-application";
import * as Network from "expo-network";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

import Header from "../../src/components/Header";
import Colors from "../../src/constants/colors";

const MIN_RAM_GB = 6;
const MIN_FREE_STORAGE_GB = 5;
const MIN_ANDROID_API = 30; // Android 11

const MAX_JSON_RECOMENDADO_MB = 15;
const MAX_JSON_RIESGO_MB = 25;
const MAX_TIEMPO_ARMADO_MS = 15000;

export default function DiagnosticoScreen() {
  const [info, setInfo] = useState(null);
  const [performanceTest, setPerformanceTest] = useState(null);
  const [mitsuLoadTest, setMitsuLoadTest] = useState(null);
  const [sendingReport, setSendingReport] = useState(false);

  const reporteRef = useRef(null);

  useEffect(() => {
    cargarDiagnostico();
  }, []);

  const bytesToGB = (bytes) => {
    if (!bytes && bytes !== 0) return "No disponible";
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const bytesToMB = (bytes) => {
    if (!bytes && bytes !== 0) return "No disponible";
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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

      const netInfoState = await NetInfo.fetch().catch(() => null);

      const isConnected = networkState?.isConnected === true;

      const isInternetReachable =
        networkState?.isInternetReachable === null ||
        networkState?.isInternetReachable === undefined
          ? isConnected
          : networkState?.isInternetReachable === true;

      const cellularGeneration =
        netInfoState?.details?.cellularGeneration || null;

      const carrier = netInfoState?.details?.carrier || null;

      const isConnectionExpensive =
        netInfoState?.details?.isConnectionExpensive === true;

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
        cellularGeneration,
        carrier,
        isConnectionExpensive,

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
      return diagnostico;
    } catch (error) {
      console.log("Error diagnóstico:", error);

      Alert.alert(
        "Error",
        `No se pudo cargar el diagnóstico del dispositivo.\n\nDetalle: ${
          error?.message || "Error desconocido"
        }`,
      );

      return null;
    }
  };

  const medirRendimientoTelefono = async () => {
    try {
      const muestras = [];
      const intervaloEsperado = 100;
      const duracionMedicion = 3000;

      let ultimoTiempo = Date.now();
      const inicioMedicion = Date.now();

      await new Promise((resolve) => {
        const interval = setInterval(() => {
          const ahora = Date.now();
          const diferencia = ahora - ultimoTiempo;
          const retraso = Math.max(0, diferencia - intervaloEsperado);

          muestras.push(retraso);
          ultimoTiempo = ahora;

          if (ahora - inicioMedicion >= duracionMedicion) {
            clearInterval(interval);
            resolve();
          }
        }, intervaloEsperado);
      });

      await esperar(300);

      const inicioCpu = Date.now();

      let acumulado = 0;

      for (let i = 0; i < 850000; i++) {
        acumulado += Math.sqrt(i);
      }

      const finCpu = Date.now();
      const tiempoCpu = finCpu - inicioCpu;

      const retrasoPromedio =
        muestras.length > 0
          ? Math.round(muestras.reduce((a, b) => a + b, 0) / muestras.length)
          : null;

      const retrasoMaximo = muestras.length > 0 ? Math.max(...muestras) : null;

      let fluidez = "Buena";
      let conclusion = "El teléfono responde correctamente durante la prueba.";

      if (
        tiempoCpu > 1200 ||
        (retrasoPromedio !== null && retrasoPromedio > 120) ||
        (retrasoMaximo !== null && retrasoMaximo > 450)
      ) {
        fluidez = "Mala";
        conclusion =
          "El teléfono puede estar lento o trabándose. Se recomienda cerrar apps abiertas, reiniciar el equipo o revisar almacenamiento.";
      } else if (
        tiempoCpu > 700 ||
        (retrasoPromedio !== null && retrasoPromedio > 70) ||
        (retrasoMaximo !== null && retrasoMaximo > 250)
      ) {
        fluidez = "Regular";
        conclusion =
          "El teléfono responde, pero puede presentar lentitud en algunos momentos.";
      }

      const resultado = {
        fluidez,
        tiempoCpu,
        retrasoPromedio,
        retrasoMaximo,
        muestras: muestras.length,
        conclusion,
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setPerformanceTest(resultado);
      return resultado;
    } catch (error) {
      console.log("Error en check rendimiento teléfono:", error);

      const resultado = {
        fluidez: "No disponible",
        tiempoCpu: null,
        retrasoPromedio: null,
        retrasoMaximo: null,
        muestras: 0,
        conclusion: "No se pudo completar la prueba de rendimiento.",
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setPerformanceTest(resultado);
      return resultado;
    }
  };

  const medirCargaRealMitsu = async () => {
    const inicioTotal = Date.now();

    try {
      const keys = await AsyncStorage.getAllKeys();

      const palabrasMitsu = [
        "orden",
        "order",
        "workorder",
        "work_order",
        "pendiente",
        "firma",
        "offline",
        "queue",
        "cola",
        "pdf",
        "attachment",
        "evidencia",
        "base64",
        "mitsu",
      ];

      const keysMitsu = keys.filter((key) => {
        const keyLower = String(key).toLowerCase();
        return palabrasMitsu.some((word) => keyLower.includes(word));
      });

      const pares =
        keysMitsu.length > 0 ? await AsyncStorage.multiGet(keysMitsu) : [];

      let totalBytes = 0;
      let posiblesOrdenes = 0;
      let posiblesPdfs = 0;
      let posiblesBase64 = 0;
      let registrosLocales = 0;
      let registrosConErrorParseo = 0;

      const resumenKeys = [];

      const inicioParseo = Date.now();

      for (const [key, value] of pares) {
        const sizeBytes = medirBytesTexto(value || "");
        totalBytes += sizeBytes;
        registrosLocales++;

        const keyLower = String(key).toLowerCase();
        const valueLower = String(value || "").toLowerCase();

        let parsed = null;

        try {
          parsed = value ? JSON.parse(value) : null;
        } catch (error) {
          registrosConErrorParseo++;
        }

        const conteo = contarDatosMitsu(parsed, valueLower, keyLower);

        posiblesOrdenes += conteo.ordenes;
        posiblesPdfs += conteo.pdfs;
        posiblesBase64 += conteo.base64;

        resumenKeys.push({
          key,
          sizeBytes,
          ordenes: conteo.ordenes,
          pdfs: conteo.pdfs,
          base64: conteo.base64,
        });
      }

      const finParseo = Date.now();
      const tiempoLecturaParseo = finParseo - inicioParseo;

      const payloadDiagnostico = {
        fecha: new Date().toISOString(),
        totalKeysEncontradas: keys.length,
        keysMitsu: keysMitsu.length,
        registrosLocales,
        posiblesOrdenes,
        posiblesPdfs,
        posiblesBase64,
        totalBytes,
        resumenKeys: resumenKeys.map((item) => ({
          key: ocultarNombreKey(item.key),
          sizeBytes: item.sizeBytes,
          ordenes: item.ordenes,
          pdfs: item.pdfs,
          base64: item.base64,
        })),
      };

      const inicioArmadoJson = Date.now();
      const jsonFinal = JSON.stringify(payloadDiagnostico);
      const finArmadoJson = Date.now();

      const tiempoArmadoJson = finArmadoJson - inicioArmadoJson;
      const jsonFinalBytes = medirBytesTexto(jsonFinal);

      const finTotal = Date.now();
      const tiempoTotal = finTotal - inicioTotal;

      let riesgoCarga = "Bajo";
      let conclusion =
        "La carga local encontrada no parece pesada. Si el error continúa, se recomienda revisar app, API, backend, SAP, OData o Cloud Connector.";

      const totalMB = totalBytes / 1024 / 1024;

      if (
        totalMB >= MAX_JSON_RIESGO_MB ||
        tiempoArmadoJson >= MAX_TIEMPO_ARMADO_MS ||
        posiblesBase64 >= 10
      ) {
        riesgoCarga = "Alto";
        conclusion =
          "Se detectó una carga local pesada. El problema puede estar relacionado con PDFs/base64, varias órdenes pendientes o armado/envío de JSON grande.";
      } else if (
        totalMB >= MAX_JSON_RECOMENDADO_MB ||
        tiempoArmadoJson >= 7000 ||
        posiblesBase64 >= 5
      ) {
        riesgoCarga = "Medio";
        conclusion =
          "La carga local es considerable. Se recomienda revisar peso de PDFs, cantidad de órdenes pendientes y tiempos de envío.";
      }

      if (registrosLocales === 0) {
        riesgoCarga = "Sin carga local detectada";
        conclusion =
          "No se detectaron registros locales relacionados con órdenes, PDFs o cola offline en AsyncStorage. Si la app guarda esos datos en SQLite o FileSystem, se debe conectar esta prueba a esa fuente.";
      }

      const resultado = {
        totalKeysAsyncStorage: keys.length,
        keysMitsu: keysMitsu.length,
        registrosLocales,
        registrosConErrorParseo,
        posiblesOrdenes,
        posiblesPdfs,
        posiblesBase64,
        totalBytes,
        jsonFinalBytes,
        tiempoLecturaParseo,
        tiempoArmadoJson,
        tiempoTotal,
        riesgoCarga,
        conclusion,
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setMitsuLoadTest(resultado);
      return resultado;
    } catch (error) {
      console.log("Error prueba carga Mitsu:", error);

      const resultado = {
        totalKeysAsyncStorage: 0,
        keysMitsu: 0,
        registrosLocales: 0,
        registrosConErrorParseo: 0,
        posiblesOrdenes: 0,
        posiblesPdfs: 0,
        posiblesBase64: 0,
        totalBytes: 0,
        jsonFinalBytes: 0,
        tiempoLecturaParseo: null,
        tiempoArmadoJson: null,
        tiempoTotal: Date.now() - inicioTotal,
        riesgoCarga: "No disponible",
        conclusion:
          "No se pudo medir la carga local Mitsu. Revisar permisos, almacenamiento local o estructura donde se guardan las órdenes pendientes.",
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setMitsuLoadTest(resultado);
      return resultado;
    }
  };

  const obtenerConclusionGeneral = () => {
    if (!info) return "Sin información suficiente.";

    const problemas = [];

    if (!info.cumpleAndroid) {
      problemas.push("Android menor al recomendado");
    }

    if (!info.cumpleRam) {
      problemas.push("RAM menor a la recomendada");
    }

    if (!info.cumpleStorage) {
      problemas.push("almacenamiento libre bajo");
    }

    if (!info.cumpleRed) {
      problemas.push("sin internet disponible");
    }

    if (performanceTest?.fluidez === "Mala") {
      problemas.push("teléfono lento o trabándose");
    }

    if (performanceTest?.fluidez === "Regular") {
      problemas.push("rendimiento del teléfono regular");
    }

    if (mitsuLoadTest?.riesgoCarga === "Alto") {
      problemas.push("carga local Mitsu pesada");
    }

    if (mitsuLoadTest?.riesgoCarga === "Medio") {
      problemas.push("carga local Mitsu considerable");
    }

    if (problemas.length === 0) {
      return "El dispositivo, red, almacenamiento, rendimiento y carga local no muestran un problema evidente. Si el error continúa, se recomienda revisar app, API, backend, SAP, OData, Cloud Connector o estructura/tamaño real del JSON enviado.";
    }

    return `Se detectaron posibles puntos a revisar: ${problemas.join(", ")}.`;
  };

  const mandarInformacion = async () => {
    try {
      setSendingReport(true);

      await cargarDiagnostico();
      await medirRendimientoTelefono();
      await medirCargaRealMitsu();

      await esperar(900);

      if (!reporteRef.current) {
        Alert.alert("Error", "No se pudo generar el reporte.");
        return;
      }

      const uri = await captureRef(reporteRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      const disponible = await Sharing.isAvailableAsync();

      if (!disponible) {
        Alert.alert(
          "No disponible",
          "Este dispositivo no permite compartir archivos en este momento.",
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Compartir diagnóstico Mitsu",
        UTI: "public.png",
      });
    } catch (error) {
      console.log("Error al mandar información:", error);

      Alert.alert(
        "Error",
        `No se pudo mandar la información.\n\nDetalle: ${
          error?.message || "Error desconocido"
        }`,
      );
    } finally {
      setSendingReport(false);
    }
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
            red, sistema operativo, rendimiento o carga local pueden afectar el
            funcionamiento de Mitsu App.
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

                <InfoRow
                  label="Red móvil"
                  value={traducirGeneracionCelular(info.cellularGeneration)}
                />

                <InfoRow
                  label="Compañía"
                  value={info.carrier || "No disponible"}
                />

                <InfoRow
                  label="Validación"
                  value={info.cumpleRed ? "Correcto" : "Revisar"}
                  danger={!info.cumpleRed}
                />
              </Section>

              <TouchableOpacity
                style={styles.buttonSecondary}
                activeOpacity={0.8}
                onPress={mandarInformacion}
                disabled={sendingReport}
              >
                {sendingReport ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons
                    name="share-social-outline"
                    size={20}
                    color="#fff"
                  />
                )}

                <Text style={styles.buttonText}>
                  {sendingReport
                    ? "Preparando información..."
                    : "Mandar información"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                activeOpacity={0.8}
                onPress={cargarDiagnostico}
                disabled={sendingReport}
              >
                <Ionicons name="refresh-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>Actualizar diagnóstico</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {info && (
        <View style={styles.hiddenReportContainer}>
          <View ref={reporteRef} collapsable={false} style={styles.reportCard}>
            <Text style={styles.reportTitle}>Diagnóstico Mitsu App</Text>

            <Text style={styles.reportDate}>
              Generado: {new Date().toLocaleString("es-MX")}
            </Text>

            <View style={styles.reportDivider} />

            <Text style={styles.reportSection}>Aplicación</Text>
            <ReportRow label="Nombre" value={info.appName} />
            <ReportRow label="Versión" value={info.appVersion} />
            <ReportRow label="Build" value={info.buildVersion} />

            <Text style={styles.reportSection}>Dispositivo</Text>
            <ReportRow label="Marca" value={info.brand} />
            <ReportRow label="Fabricante" value={info.manufacturer} />
            <ReportRow label="Modelo" value={info.modelName} />
            <ReportRow label="Producto" value={info.productName} />
            <ReportRow label="Tipo" value={info.isDevice} />

            <Text style={styles.reportSection}>Sistema operativo</Text>
            <ReportRow label="Sistema" value={info.osName} />
            <ReportRow label="Versión" value={info.osVersion} />
            <ReportRow
              label="Android API"
              value={
                info.androidApi ? String(info.androidApi) : "No disponible"
              }
            />
            <ReportRow
              label="Validación Android"
              value={info.cumpleAndroid ? "Correcto" : "Revisar"}
            />

            <Text style={styles.reportSection}>Memoria y almacenamiento</Text>
            <ReportRow label="RAM total" value={bytesToGB(info.totalMemory)} />
            <ReportRow
              label="Memoria máxima app"
              value={bytesToGB(info.maxMemory)}
            />
            <ReportRow
              label="RAM"
              value={info.cumpleRam ? "Correcto" : "Revisar"}
            />
            <ReportRow
              label="Almacenamiento total"
              value={bytesToGB(info.totalStorage)}
            />
            <ReportRow
              label="Almacenamiento libre"
              value={bytesToGB(info.freeStorage)}
            />
            <ReportRow
              label="Almacenamiento"
              value={info.cumpleStorage ? "Correcto" : "Revisar"}
            />

            <Text style={styles.reportSection}>Procesador</Text>
            <ReportRow
              label="Arquitectura CPU"
              value={
                info.cpuArchitectures.length > 0
                  ? info.cpuArchitectures.join(", ")
                  : "No disponible"
              }
            />

            <Text style={styles.reportSection}>Red</Text>
            <ReportRow
              label="Conectado"
              value={info.isConnected ? "Sí" : "No"}
            />
            <ReportRow
              label="Internet disponible"
              value={info.isInternetReachable ? "Sí" : "No"}
            />
            <ReportRow
              label="Tipo de conexión"
              value={traducirTipoRed(info.networkType)}
            />
            <ReportRow
              label="Red móvil"
              value={traducirGeneracionCelular(info.cellularGeneration)}
            />
            <ReportRow
              label="Compañía"
              value={info.carrier || "No disponible"}
            />
            <ReportRow
              label="Conexión de costo alto"
              value={info.isConnectionExpensive ? "Sí" : "No"}
            />
            <ReportRow
              label="Validación red"
              value={info.cumpleRed ? "Correcto" : "Revisar"}
            />

            <Text style={styles.reportSection}>Check de rendimiento</Text>
            <ReportRow
              label="Fluidez"
              value={performanceTest?.fluidez || "Sin prueba"}
            />
            <ReportRow
              label="Tiempo CPU"
              value={
                performanceTest?.tiempoCpu !== null &&
                performanceTest?.tiempoCpu !== undefined
                  ? `${performanceTest.tiempoCpu} ms`
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Retraso promedio"
              value={
                performanceTest?.retrasoPromedio !== null &&
                performanceTest?.retrasoPromedio !== undefined
                  ? `${performanceTest.retrasoPromedio} ms`
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Retraso máximo"
              value={
                performanceTest?.retrasoMaximo !== null &&
                performanceTest?.retrasoMaximo !== undefined
                  ? `${performanceTest.retrasoMaximo} ms`
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Conclusión rendimiento"
              value={performanceTest?.conclusion || "Sin prueba"}
            />

            <Text style={styles.reportSection}>Prueba de carga Mitsu</Text>
            <ReportRow
              label="Registros locales"
              value={
                mitsuLoadTest
                  ? String(mitsuLoadTest.registrosLocales)
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Posibles órdenes"
              value={
                mitsuLoadTest
                  ? String(mitsuLoadTest.posiblesOrdenes)
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Posibles PDFs"
              value={
                mitsuLoadTest
                  ? String(mitsuLoadTest.posiblesPdfs)
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Posibles base64"
              value={
                mitsuLoadTest
                  ? String(mitsuLoadTest.posiblesBase64)
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Peso local aproximado"
              value={
                mitsuLoadTest
                  ? bytesToMB(mitsuLoadTest.totalBytes)
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Peso reporte JSON"
              value={
                mitsuLoadTest
                  ? bytesToMB(mitsuLoadTest.jsonFinalBytes)
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Tiempo lectura/parseo"
              value={
                mitsuLoadTest?.tiempoLecturaParseo !== null &&
                mitsuLoadTest?.tiempoLecturaParseo !== undefined
                  ? `${mitsuLoadTest.tiempoLecturaParseo} ms`
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Tiempo armado JSON"
              value={
                mitsuLoadTest?.tiempoArmadoJson !== null &&
                mitsuLoadTest?.tiempoArmadoJson !== undefined
                  ? `${mitsuLoadTest.tiempoArmadoJson} ms`
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Tiempo total prueba"
              value={
                mitsuLoadTest?.tiempoTotal !== null &&
                mitsuLoadTest?.tiempoTotal !== undefined
                  ? `${mitsuLoadTest.tiempoTotal} ms`
                  : "Sin prueba"
              }
            />
            <ReportRow
              label="Riesgo de carga"
              value={mitsuLoadTest?.riesgoCarga || "Sin prueba"}
            />
            <ReportRow
              label="Conclusión carga"
              value={mitsuLoadTest?.conclusion || "Sin prueba"}
            />

            <View style={styles.reportDivider} />

            <Text style={styles.reportConclusionTitle}>Conclusión general</Text>
            <Text style={styles.reportConclusion}>
              {obtenerConclusionGeneral()}
            </Text>

            <View style={styles.reportDivider} />

            <Text style={styles.reportFooter}>
              La IP, la URL de la API y el contenido real de órdenes/PDFs no se
              muestran por seguridad. Solo se reportan métricas técnicas.
            </Text>
          </View>
        </View>
      )}
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

function ReportRow({ label, value }) {
  return (
    <View style={styles.reportRow}>
      <Text style={styles.reportLabel}>{label}:</Text>
      <Text style={styles.reportValue}>{value || "No disponible"}</Text>
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

function traducirGeneracionCelular(generation) {
  switch (generation) {
    case "2g":
      return "2G";

    case "3g":
      return "3G";

    case "4g":
      return "4G / LTE";

    case "5g":
      return "5G";

    case null:
    case undefined:
      return "No disponible";

    default:
      return generation || "No disponible";
  }
}

function medirBytesTexto(texto) {
  try {
    return new Blob([texto]).size;
  } catch (error) {
    return texto ? texto.length * 2 : 0;
  }
}

function ocultarNombreKey(key) {
  const texto = String(key || "");

  if (texto.length <= 8) {
    return "key_oculta";
  }

  return `${texto.slice(0, 3)}***${texto.slice(-3)}`;
}

function contarDatosMitsu(parsed, valueLower, keyLower) {
  let ordenes = 0;
  let pdfs = 0;
  let base64 = 0;

  if (
    keyLower.includes("pdf") ||
    valueLower.includes(".pdf") ||
    valueLower.includes('mimetype":"pdf') ||
    valueLower.includes("application/pdf")
  ) {
    pdfs++;
  }

  if (
    valueLower.includes("base64") ||
    valueLower.includes("data:application/pdf") ||
    valueLower.includes("jvberi0") ||
    valueLower.includes("jvber")
  ) {
    base64++;
  }

  if (
    valueLower.includes("orderid") ||
    valueLower.includes("order_id") ||
    valueLower.includes("workorder") ||
    valueLower.includes("work_order") ||
    valueLower.includes("orden")
  ) {
    ordenes++;
  }

  const recorrido = recorrerJsonMitsu(parsed);

  ordenes += recorrido.ordenes;
  pdfs += recorrido.pdfs;
  base64 += recorrido.base64;

  return {
    ordenes,
    pdfs,
    base64,
  };
}

function recorrerJsonMitsu(data) {
  const resultado = {
    ordenes: 0,
    pdfs: 0,
    base64: 0,
  };

  const visitar = (valor, profundidad = 0) => {
    if (profundidad > 8) return;

    if (Array.isArray(valor)) {
      valor.forEach((item) => visitar(item, profundidad + 1));
      return;
    }

    if (valor && typeof valor === "object") {
      const keys = Object.keys(valor);

      const tieneOrderId = keys.some((key) => {
        const lower = key.toLowerCase();
        return (
          lower === "orderid" ||
          lower === "order_id" ||
          lower === "orden" ||
          lower === "workorder" ||
          lower === "work_order"
        );
      });

      if (tieneOrderId) {
        resultado.ordenes++;
      }

      const tienePdf = keys.some((key) => {
        const lower = key.toLowerCase();
        return (
          lower.includes("pdf") ||
          lower.includes("attachment") ||
          lower.includes("evidencia")
        );
      });

      if (tienePdf) {
        resultado.pdfs++;
      }

      const tieneBase64 = keys.some((key) => {
        const lower = key.toLowerCase();
        return lower.includes("base64");
      });

      if (tieneBase64) {
        resultado.base64++;
      }

      keys.forEach((key) => visitar(valor[key], profundidad + 1));
      return;
    }

    if (typeof valor === "string") {
      const lower = valor.toLowerCase();

      if (
        lower.includes(".pdf") ||
        lower.includes("application/pdf") ||
        lower.includes('mimetype":"pdf')
      ) {
        resultado.pdfs++;
      }

      if (
        lower.includes("base64") ||
        lower.includes("data:application/pdf") ||
        lower.includes("jvberi0") ||
        lower.includes("jvber")
      ) {
        resultado.base64++;
      }
    }
  };

  visitar(data);

  return resultado;
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

  hiddenReportContainer: {
    position: "absolute",
    left: -10000,
    top: 0,
  },

  reportCard: {
    width: 900,
    backgroundColor: "#FFFFFF",
    padding: 32,
    borderRadius: 20,
  },

  reportTitle: {
    fontSize: 30,
    fontWeight: "bold",
    color: Colors?.primary || "#a10000",
    textAlign: "center",
    marginBottom: 8,
  },

  reportDate: {
    fontSize: 16,
    color: "#555",
    textAlign: "center",
    marginBottom: 18,
  },

  reportDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },

  reportSection: {
    fontSize: 20,
    fontWeight: "bold",
    color: Colors?.primary || "#a10000",
    marginTop: 14,
    marginBottom: 8,
  },

  reportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F1F1",
    paddingVertical: 8,
    gap: 16,
  },

  reportLabel: {
    fontSize: 16,
    color: "#666",
    flex: 1,
  },

  reportValue: {
    fontSize: 16,
    color: "#222",
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },

  reportConclusionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: Colors?.primary || "#a10000",
    marginBottom: 8,
    textAlign: "center",
  },

  reportConclusion: {
    fontSize: 16,
    color: "#222",
    lineHeight: 24,
    textAlign: "center",
    fontWeight: "600",
  },

  reportFooter: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    marginTop: 10,
  },
});
