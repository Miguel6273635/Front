import React, { useEffect, useState } from "react";
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
import { File, Paths } from "expo-file-system";
import * as Application from "expo-application";
import * as Network from "expo-network";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sharing from "expo-sharing";

import Header from "../../src/components/Header";
import Colors from "../../src/constants/colors";

const MIN_RAM_GB = 6;
const MIN_FREE_STORAGE_GB = 5;
const MIN_ANDROID_API = 30;

const MAX_JSON_RECOMENDADO_MB = 15;
const MAX_JSON_RIESGO_MB = 25;
const MAX_TIEMPO_ARMADO_MS = 15000;

export default function DiagnosticoScreen() {
  const [info, setInfo] = useState(null);
  const [performanceTest, setPerformanceTest] = useState(null);
  const [mitsuLoadTest, setMitsuLoadTest] = useState(null);
  const [appsUsageTest, setAppsUsageTest] = useState(null);
  const [sendingReport, setSendingReport] = useState(false);

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

  const medirUsoOtrasApps = async (performanceResult = null) => {
    try {
      const rendimiento = performanceResult || performanceTest;

      let posibleAfectacion = "Baja";
      let conclusion =
        "No se detecta afectación evidente por carga externa durante la prueba de rendimiento.";

      if (rendimiento?.fluidez === "Mala") {
        posibleAfectacion = "Alta";
        conclusion =
          "El dispositivo presentó lentitud durante la prueba. Puede deberse a apps abiertas en segundo plano, reproducción de video, almacenamiento bajo, batería, red o carga local pesada.";
      } else if (rendimiento?.fluidez === "Regular") {
        posibleAfectacion = "Media";
        conclusion =
          "El dispositivo presentó rendimiento regular. Se recomienda cerrar apps como YouTube, mapas, cámara, redes sociales o apps pesadas antes de usar Mitsu App.";
      }

      const resultado = {
        deteccionDirectaApps: "No disponible por permisos del sistema",
        youtubeDetectado: "No disponible por permisos del sistema",
        appsAbiertasDetectadas: "No disponible por permisos del sistema",
        numeroAppsAbiertas: "No disponible por permisos del sistema",
        posibleAfectacion,
        metodo:
          "Expo/React Native no permite consultar directamente otras apps abiertas sin módulo nativo y permisos especiales.",
        recomendacion:
          "Antes de usar Mitsu App se recomienda cerrar YouTube, redes sociales, cámara, mapas, juegos, apps de video o cualquier app pesada.",
        conclusion,
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setAppsUsageTest(resultado);
      return resultado;
    } catch (error) {
      console.log("Error midiendo uso de otras apps:", error);

      const resultado = {
        deteccionDirectaApps: "No disponible",
        youtubeDetectado: "No disponible",
        appsAbiertasDetectadas: "No disponible",
        numeroAppsAbiertas: "No disponible",
        posibleAfectacion: "No disponible",
        metodo: "No se pudo completar la medición.",
        recomendacion:
          "Cerrar apps abiertas y reiniciar el dispositivo si continúa lento.",
        conclusion:
          "No se pudo analizar la posible afectación por otras aplicaciones.",
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setAppsUsageTest(resultado);
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

  const obtenerConclusionGeneral = (
    infoBase = info,
    performanceBase = performanceTest,
    mitsuBase = mitsuLoadTest,
    appsBase = appsUsageTest,
  ) => {
    if (!infoBase) return "Sin información suficiente.";

    const problemas = [];

    if (!infoBase.cumpleAndroid) {
      problemas.push("Android menor al recomendado");
    }

    if (!infoBase.cumpleRam) {
      problemas.push("RAM menor a la recomendada");
    }

    if (!infoBase.cumpleStorage) {
      problemas.push("almacenamiento libre bajo");
    }

    if (!infoBase.cumpleRed) {
      problemas.push("sin internet disponible");
    }

    if (performanceBase?.fluidez === "Mala") {
      problemas.push("teléfono lento o trabándose");
    }

    if (performanceBase?.fluidez === "Regular") {
      problemas.push("rendimiento del teléfono regular");
    }

    if (mitsuBase?.riesgoCarga === "Alto") {
      problemas.push("carga local Mitsu pesada");
    }

    if (mitsuBase?.riesgoCarga === "Medio") {
      problemas.push("carga local Mitsu considerable");
    }

    if (appsBase?.posibleAfectacion === "Alta") {
      problemas.push("posible afectación alta por apps abiertas o carga externa");
    }

    if (appsBase?.posibleAfectacion === "Media") {
      problemas.push("posible afectación media por apps abiertas o carga externa");
    }

    if (problemas.length === 0) {
      return "El dispositivo, red, almacenamiento, rendimiento y carga local no muestran un problema evidente. Si el error continúa, se recomienda revisar app, API, backend, SAP, OData, Cloud Connector o estructura/tamaño real del JSON enviado.";
    }

    return `Se detectaron posibles puntos a revisar: ${problemas.join(", ")}.`;
  };

  const generarContenidoTxt = ({
    diagnostico,
    rendimiento,
    cargaMitsu,
    apps,
    conclusionGeneral,
  }) => {
    const lineas = [];

    agregarLineaTxt(lineas, "Sección", "Campo", "Valor");

    agregarLineaTxt(
      lineas,
      "Reporte",
      "Generado",
      new Date().toLocaleString("es-MX"),
    );

    agregarLineaTxt(lineas, "Reporte", "Formato", "TXT separado por tabulaciones");
    agregarLineaTxt(lineas, "Reporte", "Uso recomendado", "Abrir en Excel");

    agregarLineaTxt(lineas, "Aplicación", "Nombre", diagnostico?.appName);
    agregarLineaTxt(lineas, "Aplicación", "Versión", diagnostico?.appVersion);
    agregarLineaTxt(lineas, "Aplicación", "Build", diagnostico?.buildVersion);

    agregarLineaTxt(lineas, "Dispositivo", "Marca", diagnostico?.brand);
    agregarLineaTxt(lineas, "Dispositivo", "Fabricante", diagnostico?.manufacturer);
    agregarLineaTxt(lineas, "Dispositivo", "Modelo", diagnostico?.modelName);
    agregarLineaTxt(lineas, "Dispositivo", "Producto", diagnostico?.productName);
    agregarLineaTxt(lineas, "Dispositivo", "Tipo", diagnostico?.isDevice);

    agregarLineaTxt(lineas, "Sistema operativo", "Sistema", diagnostico?.osName);
    agregarLineaTxt(lineas, "Sistema operativo", "Versión", diagnostico?.osVersion);
    agregarLineaTxt(
      lineas,
      "Sistema operativo",
      "Android API",
      diagnostico?.androidApi ? String(diagnostico.androidApi) : "No disponible",
    );
    agregarLineaTxt(
      lineas,
      "Sistema operativo",
      "Validación Android",
      diagnostico?.cumpleAndroid ? "Correcto" : "Revisar",
    );

    agregarLineaTxt(
      lineas,
      "Memoria",
      "RAM total",
      bytesToGB(diagnostico?.totalMemory),
    );
    agregarLineaTxt(
      lineas,
      "Memoria",
      "Memoria máxima app",
      bytesToGB(diagnostico?.maxMemory),
    );
    agregarLineaTxt(
      lineas,
      "Memoria",
      "Validación RAM",
      diagnostico?.cumpleRam ? "Correcto" : "Revisar",
    );

    agregarLineaTxt(
      lineas,
      "Almacenamiento",
      "Almacenamiento total",
      bytesToGB(diagnostico?.totalStorage),
    );
    agregarLineaTxt(
      lineas,
      "Almacenamiento",
      "Almacenamiento libre",
      bytesToGB(diagnostico?.freeStorage),
    );
    agregarLineaTxt(
      lineas,
      "Almacenamiento",
      "Validación almacenamiento",
      diagnostico?.cumpleStorage ? "Correcto" : "Revisar",
    );

    agregarLineaTxt(
      lineas,
      "Procesador",
      "Arquitectura CPU",
      diagnostico?.cpuArchitectures?.length > 0
        ? diagnostico.cpuArchitectures.join(", ")
        : "No disponible",
    );

    agregarLineaTxt(
      lineas,
      "Red",
      "Conectado",
      diagnostico?.isConnected ? "Sí" : "No",
    );
    agregarLineaTxt(
      lineas,
      "Red",
      "Internet disponible",
      diagnostico?.isInternetReachable ? "Sí" : "No",
    );
    agregarLineaTxt(
      lineas,
      "Red",
      "Tipo de conexión",
      traducirTipoRed(diagnostico?.networkType),
    );
    agregarLineaTxt(
      lineas,
      "Red",
      "Red móvil",
      traducirGeneracionCelular(diagnostico?.cellularGeneration),
    );
    agregarLineaTxt(lineas, "Red", "Compañía", diagnostico?.carrier);
    agregarLineaTxt(
      lineas,
      "Red",
      "Conexión de costo alto",
      diagnostico?.isConnectionExpensive ? "Sí" : "No",
    );
    agregarLineaTxt(
      lineas,
      "Red",
      "Validación red",
      diagnostico?.cumpleRed ? "Correcto" : "Revisar",
    );

    agregarLineaTxt(lineas, "Rendimiento", "Fluidez", rendimiento?.fluidez);
    agregarLineaTxt(
      lineas,
      "Rendimiento",
      "Tiempo CPU",
      rendimiento?.tiempoCpu !== null && rendimiento?.tiempoCpu !== undefined
        ? `${rendimiento.tiempoCpu} ms`
        : "Sin prueba",
    );
    agregarLineaTxt(
      lineas,
      "Rendimiento",
      "Retraso promedio",
      rendimiento?.retrasoPromedio !== null &&
        rendimiento?.retrasoPromedio !== undefined
        ? `${rendimiento.retrasoPromedio} ms`
        : "Sin prueba",
    );
    agregarLineaTxt(
      lineas,
      "Rendimiento",
      "Retraso máximo",
      rendimiento?.retrasoMaximo !== null &&
        rendimiento?.retrasoMaximo !== undefined
        ? `${rendimiento.retrasoMaximo} ms`
        : "Sin prueba",
    );
    agregarLineaTxt(
      lineas,
      "Rendimiento",
      "Muestras",
      rendimiento?.muestras !== undefined ? String(rendimiento.muestras) : "Sin prueba",
    );
    agregarLineaTxt(
      lineas,
      "Rendimiento",
      "Conclusión",
      rendimiento?.conclusion || "Sin prueba",
    );

    agregarLineaTxt(
      lineas,
      "Apps en segundo plano",
      "Detección directa de apps",
      apps?.deteccionDirectaApps,
    );
    agregarLineaTxt(
      lineas,
      "Apps en segundo plano",
      "YouTube detectado",
      apps?.youtubeDetectado,
    );
    agregarLineaTxt(
      lineas,
      "Apps en segundo plano",
      "Apps abiertas detectadas",
      apps?.appsAbiertasDetectadas,
    );
    agregarLineaTxt(
      lineas,
      "Apps en segundo plano",
      "Número de apps abiertas",
      apps?.numeroAppsAbiertas,
    );
    agregarLineaTxt(
      lineas,
      "Apps en segundo plano",
      "Posible afectación",
      apps?.posibleAfectacion,
    );
    agregarLineaTxt(lineas, "Apps en segundo plano", "Método", apps?.metodo);
    agregarLineaTxt(
      lineas,
      "Apps en segundo plano",
      "Recomendación",
      apps?.recomendacion,
    );
    agregarLineaTxt(
      lineas,
      "Apps en segundo plano",
      "Conclusión",
      apps?.conclusion,
    );

    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Total keys AsyncStorage",
      cargaMitsu?.totalKeysAsyncStorage,
    );
    agregarLineaTxt(lineas, "Carga Mitsu", "Keys Mitsu", cargaMitsu?.keysMitsu);
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Registros locales",
      cargaMitsu?.registrosLocales,
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Registros con error parseo",
      cargaMitsu?.registrosConErrorParseo,
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Posibles órdenes",
      cargaMitsu?.posiblesOrdenes,
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Posibles PDFs",
      cargaMitsu?.posiblesPdfs,
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Posibles base64",
      cargaMitsu?.posiblesBase64,
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Peso local aproximado",
      bytesToMB(cargaMitsu?.totalBytes),
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Peso reporte JSON",
      bytesToMB(cargaMitsu?.jsonFinalBytes),
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Tiempo lectura/parseo",
      cargaMitsu?.tiempoLecturaParseo !== null &&
        cargaMitsu?.tiempoLecturaParseo !== undefined
        ? `${cargaMitsu.tiempoLecturaParseo} ms`
        : "Sin prueba",
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Tiempo armado JSON",
      cargaMitsu?.tiempoArmadoJson !== null &&
        cargaMitsu?.tiempoArmadoJson !== undefined
        ? `${cargaMitsu.tiempoArmadoJson} ms`
        : "Sin prueba",
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Tiempo total prueba",
      cargaMitsu?.tiempoTotal !== null && cargaMitsu?.tiempoTotal !== undefined
        ? `${cargaMitsu.tiempoTotal} ms`
        : "Sin prueba",
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Riesgo de carga",
      cargaMitsu?.riesgoCarga,
    );
    agregarLineaTxt(
      lineas,
      "Carga Mitsu",
      "Conclusión carga",
      cargaMitsu?.conclusion,
    );

    agregarLineaTxt(lineas, "Conclusión general", "Resultado", conclusionGeneral);

    agregarLineaTxt(
      lineas,
      "Seguridad",
      "Nota",
      "La IP, URL de API y contenido real de órdenes/PDFs no se muestran. Solo se reportan métricas técnicas.",
    );

    return `\ufeff${lineas.join("\n")}`;
  };

  const crearArchivoTxt = async (contenido) => {
    const fecha = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);

    const fileName = `diagnostico_mitsu_${fecha}.txt`;
    const file = new File(Paths.cache, fileName);

    try {
      if (file.exists) {
        file.delete();
      }

      file.create({
        overwrite: true,
        intermediates: true,
      });

      file.write(contenido);

      return file.uri;
    } catch (error) {
      console.log("Error creando TXT:", error);
      throw error;
    }
  };

  const mandarInformacion = async () => {
    try {
      setSendingReport(true);

      const diagnostico = await cargarDiagnostico();
      const rendimiento = await medirRendimientoTelefono();
      const cargaMitsu = await medirCargaRealMitsu();
      const apps = await medirUsoOtrasApps(rendimiento);

      const conclusionGeneral = obtenerConclusionGeneral(
        diagnostico,
        rendimiento,
        cargaMitsu,
        apps,
      );

      const contenidoTxt = generarContenidoTxt({
        diagnostico,
        rendimiento,
        cargaMitsu,
        apps,
        conclusionGeneral,
      });

      const uri = await crearArchivoTxt(contenidoTxt);

      const disponible = await Sharing.isAvailableAsync();

      if (!disponible) {
        Alert.alert(
          "No disponible",
          "Este dispositivo no permite compartir archivos en este momento.",
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "text/plain",
        dialogTitle: "Compartir diagnóstico Mitsu TXT",
        UTI: "public.plain-text",
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
    info.cumpleRed &&
    (!appsUsageTest || appsUsageTest.posibleAfectacion !== "Alta");

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
            red, sistema operativo, rendimiento, apps abiertas o carga local
            pueden afectar el funcionamiento de Mitsu App.
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

              {performanceTest && (
                <Section title="Check de rendimiento">
                  <InfoRow label="Fluidez" value={performanceTest.fluidez} />
                  <InfoRow
                    label="Tiempo CPU"
                    value={`${performanceTest.tiempoCpu} ms`}
                    danger={performanceTest.fluidez === "Mala"}
                  />
                  <InfoRow
                    label="Retraso promedio"
                    value={`${performanceTest.retrasoPromedio} ms`}
                    danger={performanceTest.fluidez === "Mala"}
                  />
                  <InfoRow
                    label="Retraso máximo"
                    value={`${performanceTest.retrasoMaximo} ms`}
                    danger={performanceTest.fluidez === "Mala"}
                  />
                  <InfoRow
                    label="Conclusión"
                    value={performanceTest.conclusion}
                    danger={performanceTest.fluidez === "Mala"}
                  />
                </Section>
              )}

              {appsUsageTest && (
                <Section title="Apps en segundo plano">
                  <InfoRow
                    label="Detección directa"
                    value={appsUsageTest.deteccionDirectaApps}
                  />
                  <InfoRow
                    label="YouTube"
                    value={appsUsageTest.youtubeDetectado}
                  />
                  <InfoRow
                    label="Número de apps abiertas"
                    value={appsUsageTest.numeroAppsAbiertas}
                  />
                  <InfoRow
                    label="Posible afectación"
                    value={appsUsageTest.posibleAfectacion}
                    danger={appsUsageTest.posibleAfectacion === "Alta"}
                  />
                  <InfoRow
                    label="Conclusión"
                    value={appsUsageTest.conclusion}
                    danger={appsUsageTest.posibleAfectacion === "Alta"}
                  />
                </Section>
              )}

              {mitsuLoadTest && (
                <Section title="Prueba de carga Mitsu">
                  <InfoRow
                    label="Registros locales"
                    value={String(mitsuLoadTest.registrosLocales)}
                  />
                  <InfoRow
                    label="Posibles órdenes"
                    value={String(mitsuLoadTest.posiblesOrdenes)}
                  />
                  <InfoRow
                    label="Posibles PDFs"
                    value={String(mitsuLoadTest.posiblesPdfs)}
                  />
                  <InfoRow
                    label="Posibles base64"
                    value={String(mitsuLoadTest.posiblesBase64)}
                  />
                  <InfoRow
                    label="Peso local aproximado"
                    value={bytesToMB(mitsuLoadTest.totalBytes)}
                  />
                  <InfoRow
                    label="Riesgo"
                    value={mitsuLoadTest.riesgoCarga}
                    danger={mitsuLoadTest.riesgoCarga === "Alto"}
                  />
                </Section>
              )}

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
                    name="document-text-outline"
                    size={20}
                    color="#fff"
                  />
                )}

                <Text style={styles.buttonText}>
                  {sendingReport
                    ? "Preparando archivo TXT..."
                    : "Mandar información TXT"}
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

function limpiarValorTxt(value) {
  if (value === null || value === undefined || value === "") {
    return "No disponible";
  }

  return String(value)
    .replace(/\t/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function agregarLineaTxt(lineas, seccion, campo, valor) {
  lineas.push(
    `${limpiarValorTxt(seccion)}\t${limpiarValorTxt(campo)}\t${limpiarValorTxt(
      valor,
    )}`,
  );
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
});