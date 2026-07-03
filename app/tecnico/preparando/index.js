// app/tecnico/preparando/index.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Platform,
  StatusBar,
  ScrollView,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import Header from "../../../src/components/Header";
import { useAuth } from "../../../src/context/AuthContext";
import api from "../../../src/services/api";

import { runPendingSendsOnly } from "../../../src/offline/backgroundSync";
import { bootstrapPrefetchConsumiblesCatalogo } from "../../../src/offline/bootstrapConsumiblesCatalogo";
import { prefetchOrdenesTecnicoDiaRapido } from "../../../src/offline/prefetchOrdenesTecnico";
import {
  loadOrdenesTecnicoList,
  loadOrdenTecnicoDetail,
  getOrdenesTecnicoLastSync,
  clearOrdenesTecnicoCache,
} from "../../../src/offline/ordenesTecnicoCache";
import { getSapQueue } from "../../../src/offline/sapQueue";
import {
  loadConsumiblesByCobertura,
  clearConsumiblesCatalog,
} from "../../../src/offline/consumiblesCache";

const FIORI = {
  pageBg: "#F7F7F7",
  surface: "#FFFFFF",
  surfaceAlt: "#F5F7FA",
  border: "#DDE6F2",
  borderSoft: "#E8EEF7",
  text: "#0B1F3B",
  textMuted: "#63718B",
  brand: "#0A6ED1",
  brandDark: "#0854A0",
  brandSoft: "#E3F2FD",
  ok: "#2FBF71",
  warn: "#F5A623",
  err: "#E74C3C",
};

const PRELOAD_DONE_KEY = (userEmail) =>
  `tecnico:preloadDone:${String(userEmail || "unknown")
    .toLowerCase()
    .trim()}`;

/*
  Miguel Ángel Hernández Álvarez - 01/07/2026

  Regla de precarga diaria:
  La precarga completa del técnico solo debe ejecutarse una vez por día
  por usuario. Si ya se realizó hoy, esta pantalla solo lee cache y permite
  entrar a Inicio Técnico sin volver a consumir API/SAP.
*/
function getTodayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

const STEPS = [
  {
    key: "network",
    label: "Revisando conexión",
    description: "Validando internet para preparar la información.",
    percent: 8,
  },
  {
    key: "pending",
    label: "Revisando pendientes",
    description: "Procesando información pendiente por enviar a SAP.",
    percent: 18,
  },
  {
    key: "orders",
    label: "Precargando órdenes",
    description: "Guardando órdenes asignadas para uso offline.",
    percent: 38,
  },
  {
    key: "details",
    label: "Precargando detalles",
    description:
      "Guardando detalle, actividades, operaciones, dirección, cliente y correo.",
    percent: 68,
  },
  {
    key: "components",
    label: "Precargando componentes",
    description:
      "Guardando componentes por operación para evitar peticiones dentro del detalle.",
    percent: 82,
  },
  {
    key: "catalogs",
    label: "Precargando consumibles",
    description:
      "Actualizando consumibles durante la precarga, no en Inicio Técnico.",
    percent: 94,
  },
  {
    key: "done",
    label: "Información lista",
    description: "Puede iniciar con sus órdenes.",
    percent: 100,
  },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function msToHMS(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");

  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function resolveUserEmail(user) {
  return String(
    user?.correo ||
      user?.email ||
      user?.username ||
      user?.preferred_username ||
      "unknown",
  )
    .toLowerCase()
    .trim();
}

function formatDateTime(value) {
  if (!value) return "Sin sincronización previa";

  try {
    const d = typeof value === "string" ? new Date(value) : new Date(value);

    if (Number.isNaN(d.getTime())) return "Sin sincronización previa";

    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");

    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return "Sin sincronización previa";
  }
}
function getTecnicoPrefetchFromResult(result) {
  const mode = String(result?.mode || "").trim();

  if (
    mode === "day_fast" ||
    mode === "day_full" ||
    mode === "range_3_days_full"
  ) {
    return result;
  }

  return (
    result?.prefetchResult?.tecnicoPrefetchResult ||
    result?.prefetchResult?.result?.tecnicoPrefetchResult ||
    result?.tecnicoPrefetchResult ||
    null
  );
}

function getConsumiblesFromResult(result) {
  return (
    result?.prefetchResult?.consumiblesResult ||
    result?.prefetchResult?.result?.consumiblesResult ||
    result?.consumiblesResult ||
    null
  );
}

const CONSUMIBLES_COBERTURAS = ["BASICA", "MEDIA", "SEMI"];

async function loadConsumiblesSummaryAll() {
  const results = await Promise.all(
    CONSUMIBLES_COBERTURAS.map((coberturaTipo) =>
      loadConsumiblesByCobertura(coberturaTipo),
    ),
  );

  const consumibles = results.reduce(
    (acc, item) => acc + Number(item?.count || 0),
    0,
  );

  const gruposConsumibles = results.reduce((acc, item) => {
    const groups = Array.isArray(item?.groups) ? item.groups : [];

    return (
      acc +
      groups.filter((g) => Number(g?.count || 0) > 0).length
    );
  }, 0);

  return {
    consumibles,
    gruposConsumibles,
    results,
  };
}

async function bootstrapConsumiblesAll() {
  const results = [];

  for (const coberturaTipo of CONSUMIBLES_COBERTURAS) {
    const result = await bootstrapPrefetchConsumiblesCatalogo({
      coberturaTipo,
    });

    results.push(result);
  }

  const consumibles = results.reduce((acc, item) => {
    return acc + Number(item?.count || item?.cachedCount || 0);
  }, 0);

  const gruposConsumibles = results.reduce((acc, item) => {
    const groups = Array.isArray(item?.groups) ? item.groups : [];

    return (
      acc +
      groups.filter((g) => Number(g?.count || 0) > 0).length
    );
  }, 0);

  return {
    ok: results.some((item) => item?.ok === true),
    count: consumibles,
    gruposConsumibles,
    groups: results.flatMap((item) =>
      Array.isArray(item?.groups) ? item.groups : [],
    ),
    results,
    updatedAt: Date.now(),
  };
}

async function calculatePreloadCacheSummary(userEmail, cachedList) {
  const list = Array.isArray(cachedList?.data) ? cachedList.data : [];
  const ids = list
    .map((x) => x?.Orderid || x?.OrderId || x?.orderid || x?.order_id)
    .filter(Boolean)
    .map((x) => String(x).trim());

  let detalles = 0;
  let actividades = 0;

  for (const orderId of ids) {
    try {
      const cachedDetail = await loadOrdenTecnicoDetail(orderId);
      const detail = cachedDetail?.data;

      if (!detail) continue;

      detalles += 1;

      if (Array.isArray(detail?.operaciones)) {
        actividades += detail.operaciones.length;
      }
    } catch {}
  }

  let componentes = 0;

  try {
    const keys = await AsyncStorage.getAllKeys();
    const idSet = new Set(ids);

    componentes = (keys || []).filter((key) => {
      if (!String(key || "").startsWith("orderComponents:")) return false;

      const orderId = String(key).split(":")[1] || "";
      return idSet.has(orderId);
    }).length;
  } catch {}

  return {
    detalles,
    actividades,
    componentes,
  };
}

export default function PreparandoTecnicoScreen() {
  const { user, ensureValidToken } = useAuth();

  const userEmail = useMemo(() => resolveUserEmail(user), [user]);

  const mountedRef = useRef(true);
  const startedRef = useRef(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const [percent, setPercent] = useState(0);
  const [currentStep, setCurrentStep] = useState(STEPS[0]);
  const [done, setDone] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [online, setOnline] = useState(null);

  /*
    Miguel Ángel Hernández Álvarez - 01/07/2026

    Cronómetro de precarga:
    - Muestra en vivo cuánto tarda la precarga.
    - Al terminar, deja visible el tiempo total.
    - Si la precarga de hoy ya estaba hecha, muestra el último tiempo guardado.
  */
  const [preloadStartedAt, setPreloadStartedAt] = useState(null);
  const [preloadElapsedMs, setPreloadElapsedMs] = useState(0);
  const [preloadFinishedText, setPreloadFinishedText] = useState("");

  const [summary, setSummary] = useState({
    ordenes: 0,
    detalles: 0,
    actividades: 0,
    componentes: 0,
    consumibles: 0,
    gruposConsumibles: 0,
    pendientesSap: 0,
    lastSyncAt: null,
  });

  const [message, setMessage] = useState(
    "Estamos preparando su información para trabajar más rápido.",
  );

  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  useEffect(() => {
    if (!preloadStartedAt) return;

    const timer = setInterval(() => {
      setPreloadElapsedMs(Date.now() - preloadStartedAt);
    }, 1000);

    return () => clearInterval(timer);
  }, [preloadStartedAt]);

  const setProgress = (step) => {
    if (!mountedRef.current) return;

    setCurrentStep(step);
    setPercent(step.percent);

    Animated.timing(progressAnim, {
      toValue: step.percent,
      duration: 350,
      useNativeDriver: false,
    }).start();
  };

  const loadLocalSummary = async () => {
    try {
      const cached = await loadOrdenesTecnicoList(userEmail);
      const queue = await getSapQueue();
      const lastSyncAt = await getOrdenesTecnicoLastSync(userEmail);

      const [consumiblesSummary, cacheSummary] = await Promise.all([
        loadConsumiblesSummaryAll(),
        calculatePreloadCacheSummary(userEmail, cached),
      ]);

      if (!mountedRef.current) return;

      setSummary((prev) => ({
        ...prev,
        ordenes: Array.isArray(cached?.data) ? cached.data.length : 0,
        detalles: Number(cacheSummary?.detalles || prev.detalles || 0),
        actividades: Number(cacheSummary?.actividades || prev.actividades || 0),
        componentes: Number(cacheSummary?.componentes || prev.componentes || 0),
        pendientesSap: Array.isArray(queue) ? queue.length : 0,
        lastSyncAt,
        consumibles: Number(consumiblesSummary?.consumibles || 0),
        gruposConsumibles: Number(
          consumiblesSummary?.gruposConsumibles || 0,
        ),
      }));
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error leyendo resumen:", e?.message || e);

      if (!mountedRef.current) return;

      setSummary((prev) => ({
        ...prev,
        ordenes: 0,
        detalles: 0,
        actividades: 0,
        componentes: 0,
        consumibles: 0,
        gruposConsumibles: 0,
        pendientesSap: 0,
        lastSyncAt: null,
      }));
    }
  };

  const markPreloadDone = async (timingInfo = {}) => {
    try {
      const payload = {
        done: true,
        date: getTodayKey(),
        doneAt: Date.now(),
        userEmail,
        durationMs: Number(timingInfo?.durationMs || 0),
        durationText: timingInfo?.durationText || "",
        startedAt: timingInfo?.startedAt || null,
        finishedAt: timingInfo?.finishedAt || null,
      };

      await AsyncStorage.setItem(
        PRELOAD_DONE_KEY(userEmail),
        JSON.stringify(payload),
      );
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error guardando bandera:", e?.message || e);
    }
  };

  const getPreloadDoneInfoToday = async () => {
    try {
      const raw = await AsyncStorage.getItem(PRELOAD_DONE_KEY(userEmail));

      if (!raw) return null;

      /*
        Compatibilidad con versiones anteriores:
        antes se guardaba "true". Eso ya no es suficiente para bloquear por día,
        por eso solo aceptamos JSON con date.
      */
      if (raw === "true") return null;

      const parsed = JSON.parse(raw);

      if (parsed?.done === true && parsed?.date === getTodayKey()) {
        return parsed;
      }

      return null;
    } catch {
      return null;
    }
  };

  const wasPreloadDoneToday = async () => {
    const info = await getPreloadDoneInfoToday();
    return !!info;
  };

  const applyResultSummary = (result) => {
    const tecnicoPrefetch = getTecnicoPrefetchFromResult(result);
    const consumiblesResult = getConsumiblesFromResult(result);

    const detalleResult = tecnicoPrefetch?.detalleResult || {};
    const components = detalleResult?.components || {};

    setSummary((prev) => ({
      ...prev,
      ordenes: Number(tecnicoPrefetch?.count ?? prev.ordenes ?? 0),
      detalles: Number(detalleResult?.ok ?? prev.detalles ?? 0),
      actividades: Number(
        detalleResult?.operaciones?.total ??
          detalleResult?.actividades?.total ??
          prev.actividades ??
          0,
      ),
      componentes: Number(
        components?.total ??
          components?.ok ??
          prev.componentes ??
          0,
      ),
      consumibles: Number(
        consumiblesResult?.count ??
          consumiblesResult?.cachedCount ??
          prev.consumibles ??
          0,
      ),
      gruposConsumibles: Array.isArray(consumiblesResult?.groups)
        ? consumiblesResult.groups.filter((g) => Number(g?.count || 0) > 0)
            .length
        : prev.gruposConsumibles,
      lastSyncAt: Date.now(),
    }));
  };

  const startPreload = async ({ retry = false } = {}) => {
    if (startedRef.current && !retry) return;

    startedRef.current = true;

    let startedAt = null;

    try {
      setSyncing(true);
      setDone(false);

      const preloadInfoToday = await getPreloadDoneInfoToday();
      const alreadyDoneToday = !!preloadInfoToday;

      if (alreadyDoneToday && !retry) {
        setProgress({
          key: "done_today",
          label: "Información lista",
          description:
            "La precarga de hoy ya fue realizada. Se usará la información guardada.",
          percent: 100,
        });

        setMessage(
          "La precarga de hoy ya se realizó. No se volverán a consumir datos hasta mañana.",
        );

        if (preloadInfoToday?.durationText) {
          setPreloadFinishedText(preloadInfoToday.durationText);
          setPreloadElapsedMs(Number(preloadInfoToday.durationMs || 0));
        } else {
          setPreloadFinishedText("");
          setPreloadElapsedMs(0);
        }

        setPreloadStartedAt(null);

        await loadLocalSummary();

        if (!mountedRef.current) return;

        setDone(true);
        setSyncing(false);
        return;
      }

      setProgress(STEPS[0]);
      setMessage("Validando conexión del dispositivo...");

      const net = await NetInfo.fetch();
      const onlineNow = !!(
        net?.isConnected && net?.isInternetReachable !== false
      );

      if (!mountedRef.current) return;

      setOnline(onlineNow);

      await loadLocalSummary();

      if (!onlineNow) {
        setProgress({
          key: "offline",
          label: "Modo offline disponible",
          description:
            "No hay internet. Se usará la información guardada en el dispositivo.",
          percent: 100,
        });

        setMessage(
          "No hay conexión. Puede iniciar con las órdenes guardadas en el dispositivo. Que tenga un excelente día.",
        );

        /*
          Miguel Ángel Hernández Álvarez - 01/07/2026

          No marcamos la precarga como realizada cuando está offline.
          Si no hubo consumo real de SAP/API, la app debe volver a intentar
          precargar cuando tenga conexión.
        */
        if (!mountedRef.current) return;

        await loadLocalSummary();
        setDone(true);
        return;
      }

      startedAt = Date.now();
      setPreloadStartedAt(startedAt);
      setPreloadElapsedMs(0);
      setPreloadFinishedText("");

      setProgress(STEPS[1]);
      setMessage("Revisando pendientes locales por enviar a SAP...");
      await wait(200);

      setProgress(STEPS[2]);
      setMessage("Precargando órdenes del rango offline asignadas al técnico...");
      await wait(200);

      setProgress(STEPS[3]);
      setMessage(
        "Precargando detalle básico, operaciones y componentes del rango offline...",
      );

      /*
        Miguel Ángel Hernández Álvarez - 01/07/2026

        Esta es la precarga principal del día.
        La idea es que la pantalla de Inicio Técnico y el detalle de orden
        trabajen con cache y no vuelvan a disparar peticiones masivas.

        Nota:
        Si prefetchOrdenesTecnicoDiaRapido todavía no carga todos los
        componentes/consumibles, abajo ejecutamos runBackgroundSyncNow pero
        ESPERÁNDOLO dentro de esta pantalla de precarga, no después en Inicio.
      */
      const result = await prefetchOrdenesTecnicoDiaRapido(userEmail, {
        apiInstance: api,
        ensureValidToken,
      });

      console.log("[PRELOAD TECNICO] Resultado precarga del rango offline:", result);

      if (!mountedRef.current) return;

      applyResultSummary(result);

      const tecnicoPrefetch = getTecnicoPrefetchFromResult(result);
      const detalleResult = tecnicoPrefetch?.detalleResult || {};

      setProgress(STEPS[4]);
      setMessage(
        `Detalles del rango guardados: ${Number(
          detalleResult?.ok || 0,
        )}. Componentes y operaciones guardados desde la precarga.`,
      );
      await wait(200);

      setProgress(STEPS[5]);
      setMessage("Precargando consumibles y grupos de consumibles...");
      await wait(200);

      const consumiblesResult = await bootstrapConsumiblesAll();

      console.log("[PRELOAD TECNICO] Resultado consumibles:", consumiblesResult);

      if (!mountedRef.current) return;

      setSummary((prev) => ({
        ...prev,
        consumibles: Number(consumiblesResult?.count || 0),
        gruposConsumibles: Number(consumiblesResult?.gruposConsumibles || 0),
      }));

      /*
        Antes esto se lanzaba con .catch() en segundo plano y el usuario podía
        entrar a Inicio Técnico mientras todavía se consumían datos.

        Ahora se espera aquí. Así todo el consumo fuerte se queda en la pantalla
        de precarga.

        Usamos force:true porque app/index o el BackgroundFetch pueden estar
        revisando envíos pendientes. La precarga visible tiene prioridad para
        que no se quede en sync_already_running.
      */
     /*
  Miguel Ángel Hernández Álvarez - 01/07/2026

  Corrección rendimiento precarga:
  Ya NO ejecutamos runBackgroundSyncNow aquí porque vuelve a lanzar
  precarga completa y puede duplicar:
  - órdenes
  - detalles
  - operaciones
  - componentes
  - consumibles

  En esta pantalla ya se ejecutó prefetchOrdenesTecnicoDiaRapido().
  Aquí solo revisamos/envíamos pendientes, sin volver a precargar.
*/
let preloadCompletedOk = false;

try {
  const pendingOnlyResult = await runPendingSendsOnly({
    source: "tecnico_preload_pending_only",
    force: true,
  });

  console.log(
    "[PRELOAD TECNICO] Pendientes revisados sin precargar de nuevo:",
    pendingOnlyResult,
  );
} catch (pendingErr) {
  console.log(
    "[PRELOAD TECNICO] No se pudieron revisar pendientes:",
    pendingErr?.message || pendingErr,
  );
}

/*
  No marcamos la precarga como terminada si hubo fallos.
  Así evitamos perder datos en la primera precarga.
*/
const detalleFailCount = Number(detalleResult?.fail || 0);
const componentFailCount = Number(detalleResult?.components?.fail || 0);

preloadCompletedOk =
  result?.ok === true &&
  detalleFailCount === 0 &&
  componentFailCount === 0;

console.log("[PRELOAD TECNICO] Validación final de precarga:", {
  ok: result?.ok,
  detalleFailCount,
  componentFailCount,
  preloadCompletedOk,
});

      setMessage(
        "Información actualizada. Leyendo resumen local...",
      );
      await wait(200);

      await loadLocalSummary();

      if (!mountedRef.current) return;

      setProgress(STEPS[6]);

      const finishedAt = Date.now();
      const durationMs = startedAt ? finishedAt - startedAt : 0;
      const durationText = msToHMS(durationMs);

      setPreloadStartedAt(null);
      setPreloadElapsedMs(durationMs);
      setPreloadFinishedText(durationText);

      console.log("[PRECARGA] Tiempo total:", {
        durationMs,
        durationText,
      });

    if (preloadCompletedOk) {
  setMessage(
    "Información lista. Puede iniciar; no se volverá a precargar hasta mañana.",
  );

  await markPreloadDone({
    durationMs,
    durationText,
    startedAt,
    finishedAt,
  });
} else {
  setMessage(
    "Puede iniciar con la información guardada. La precarga no se marcó como terminada porque faltó información. Se volverá a intentar después.",
  );
}

      if (!mountedRef.current) return;

      setDone(true);
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error general:", e?.message || e);

      if (!mountedRef.current) return;

      if (startedAt) {
        const failedDurationMs = Date.now() - startedAt;
        setPreloadElapsedMs(failedDurationMs);
        setPreloadFinishedText(msToHMS(failedDurationMs));
      }

      setPreloadStartedAt(null);

      setProgress({
        key: "partial",
        label: "Información local disponible",
        description:
          "No se pudo terminar la actualización. Se usará lo guardado.",
        percent: 100,
      });

      setMessage(
        "No se pudo terminar la actualización, pero puede iniciar con la información guardada en el dispositivo.",
      );

      /*
        No marcamos precarga como realizada si cayó al modo parcial.
        Así mañana o cuando vuelva la red, la pantalla puede intentar de nuevo.
      */
      await loadLocalSummary();
      setDone(true);
    } finally {
      if (mountedRef.current) setSyncing(false);
    }
  };

  const goHome = async () => {
    router.replace("/tecnico?ready=1");
  };

  const retryPreload = async () => {
    startedRef.current = false;
    setDone(false);
    setPercent(0);
    setPreloadStartedAt(null);
    setPreloadElapsedMs(0);
    setPreloadFinishedText("");
    progressAnim.setValue(0);

    /*
      Miguel Ángel Hernández Álvarez - 02/07/2026

      Limpieza manual:
      Si antes se guardaron 250 órdenes en cache, se deben borrar antes
      de volver a precargar. Si no se limpia, la pantalla puede seguir
      mostrando datos viejos aunque el código ya esté corregido.
    */
    try {
      if (userEmail) {
        await clearOrdenesTecnicoCache(userEmail);
        console.log("[PRELOAD TECNICO] Cache de órdenes limpiado antes de reintentar.");
      }
    } catch (e) {
      console.log(
        "[PRELOAD TECNICO] No se pudo limpiar cache antes de reintentar:",
        e?.message || e,
      );
    }

    await startPreload({ retry: true });
  };

  const clearPreloadCacheForTests = async () => {
    if (clearingCache || syncing) return;

    try {
      setClearingCache(true);

      /*
        Miguel Ángel Hernández Álvarez - 02/07/2026

        Botón de pruebas:
        Limpia únicamente cache de precarga y datos locales relacionados.
        No elimina colas de envío pendientes a SAP para evitar perder trabajo real.
      */
      const keys = await AsyncStorage.getAllKeys();

      const keysToDelete = (keys || []).filter((key) => {
        const k = String(key || "");

        return (
          k === PRELOAD_DONE_KEY(userEmail) ||
          k.startsWith("orderComponents:") ||
          k.startsWith("consumibles:") ||
          k.startsWith("tbmky_json_") ||
          k.startsWith("tbmky_draft_") ||
          k.startsWith("tbmky_status_")
        );
      });

      await clearOrdenesTecnicoCache(userEmail);
      await clearConsumiblesCatalog();

      if (keysToDelete.length > 0) {
        await AsyncStorage.multiRemove(keysToDelete);
      }

      setSummary({
        ordenes: 0,
        detalles: 0,
        actividades: 0,
        componentes: 0,
        consumibles: 0,
        gruposConsumibles: 0,
        pendientesSap: 0,
        lastSyncAt: null,
      });

      setDone(false);
      startedRef.current = false;
      setPreloadFinishedText("");
      setPreloadElapsedMs(0);
      setPreloadStartedAt(null);
      setPercent(0);
      progressAnim.setValue(0);

      setProgress(STEPS[0]);
      setMessage(
        "Cache de pruebas eliminado. Ahora puede volver a precargar desde cero.",
      );

      console.log("[PRELOAD TECNICO] Cache de pruebas eliminado:", {
        userEmail,
        keysDeleted: keysToDelete.length,
      });

      Alert.alert(
        "Cache eliminado",
        "Se limpió el cache de precarga, consumibles, componentes y TBM/KY de pruebas. No se eliminaron pendientes SAP.",
      );
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error limpiando cache:", e?.message || e);

      Alert.alert(
        "Error",
        "No se pudo limpiar el cache de pruebas. Revise logs.",
      );
    } finally {
      if (mountedRef.current) setClearingCache(false);
    }
  };

  const confirmClearPreloadCache = () => {
    if (syncing || clearingCache) return;

    Alert.alert(
      "Limpiar cache de pruebas",
      "Esto borrará órdenes precargadas, detalles, operaciones, componentes, consumibles y datos temporales TBM/KY guardados en este dispositivo. No borra pendientes SAP. ¿Desea continuar?",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Limpiar",
          style: "destructive",
          onPress: clearPreloadCacheForTests,
        },
      ],
    );
  };

  useEffect(() => {
    mountedRef.current = true;

    startPreload();

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={FIORI.pageBg} />
      <Header title="Preparando información" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.iconCircle}>
            {done ? (
              <Ionicons name="checkmark-circle" size={42} color={FIORI.ok} />
            ) : (
              <ActivityIndicator size="large" color={FIORI.brand} />
            )}
          </View>

          <Text style={styles.title}>{currentStep.label}</Text>
          <Text style={styles.description}>{currentStep.description}</Text>

          <View style={styles.progressWrap}>
            <Animated.View
              style={[styles.progressFill, { width: widthInterpolated }]}
            />
          </View>

          <Text style={styles.percent}>{Math.round(percent)}%</Text>

          <View style={styles.timerBox}>
            <View style={styles.timerIcon}>
              <Ionicons
                name={
                  preloadFinishedText && !preloadStartedAt
                    ? "checkmark-done-outline"
                    : "timer-outline"
                }
                size={18}
                color={
                  preloadFinishedText && !preloadStartedAt
                    ? FIORI.ok
                    : FIORI.brand
                }
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.timerLabel}>
                {preloadFinishedText && !preloadStartedAt
                  ? "Precarga terminada en"
                  : "Tiempo de precarga"}
              </Text>
              <Text style={styles.timerValue}>
                {preloadFinishedText && !preloadStartedAt
                  ? preloadFinishedText
                  : msToHMS(preloadElapsedMs)}
              </Text>
            </View>
          </View>

          <Text style={styles.message}>{message}</Text>

          <View
            style={[
              styles.netPill,
              {
                backgroundColor:
                  online === false ? "#FFF3E0" : FIORI.brandSoft,
                borderColor: online === false ? "#FFD8A8" : "#B9DBFF",
              },
            ]}
          >
            <Ionicons
              name={online === false ? "cloud-offline-outline" : "cloud-done-outline"}
              size={16}
              color={online === false ? FIORI.warn : FIORI.brand}
            />
            <Text
              style={[
                styles.netText,
                { color: online === false ? "#9A5B00" : FIORI.brandDark },
              ]}
            >
              {online === false
                ? "Sin conexión: usando cache local"
                : online === true
                  ? "Con conexión: actualizando datos"
                  : "Validando conexión"}
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Datos preparados</Text>

          <SummaryRow
            icon="clipboard-outline"
            label="Órdenes cargadas"
            value={summary.ordenes}
          />
          <SummaryRow
            icon="document-text-outline"
            label="Detalles de órdenes"
            value={summary.detalles || summary.ordenes}
          />
          <SummaryRow
            icon="list-outline"
            label="Actividades / operaciones"
            value={summary.actividades || "Incluidas"}
          />
          <SummaryRow
            icon="cube-outline"
            label="Componentes por actividad"
            value={summary.componentes || "En cache"}
          />
          <SummaryRow
            icon="build-outline"
            label="Consumibles"
            value={summary.consumibles}
          />
          <SummaryRow
            icon="albums-outline"
            label="Grupos de consumibles"
            value={summary.gruposConsumibles}
          />
          <SummaryRow
            icon="swap-horizontal-outline"
            label="Pendientes SAP"
            value={summary.pendientesSap}
          />

          <View style={styles.lastSyncBox}>
            <Ionicons name="time-outline" size={16} color={FIORI.textMuted} />
            <Text style={styles.lastSyncText}>
              Última sincronización: {formatDateTime(summary.lastSyncAt)}
            </Text>
          </View>
        </View>

        <View style={styles.stepsCard}>
          {STEPS.map((step) => {
            const active = step.key === currentStep.key;
            const completed = percent >= step.percent;

            return (
              <View key={step.key} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor: completed ? FIORI.ok : FIORI.border,
                      borderColor: active ? FIORI.brand : FIORI.border,
                    },
                  ]}
                >
                  {completed ? (
                    <Ionicons name="checkmark" size={13} color="#fff" />
                  ) : null}
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.stepLabel,
                      { color: active ? FIORI.brandDark : FIORI.text },
                    ]}
                  >
                    {step.label}
                  </Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              (!done || syncing) && { opacity: 0.65 },
            ]}
            onPress={goHome}
            disabled={!done || syncing}
            activeOpacity={0.88}
          >
            <Ionicons name="arrow-forward-circle-outline" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>
              Iniciar con mis órdenes
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, syncing && { opacity: 0.65 }]}
            onPress={retryPreload}
            disabled={syncing}
            activeOpacity={0.88}
          >
            <Ionicons name="refresh-outline" size={18} color={FIORI.brand} />
            <Text style={styles.secondaryBtnText}>
              Volver a precargar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.dangerBtn,
              (syncing || clearingCache) && { opacity: 0.65 },
            ]}
            onPress={confirmClearPreloadCache}
            disabled={syncing || clearingCache}
            activeOpacity={0.88}
          >
            <Ionicons name="trash-outline" size={18} color={FIORI.err} />
            <Text style={styles.dangerBtnText}>
              {clearingCache ? "Limpiando cache..." : "Limpiar cache de pruebas"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryRow({ icon, label, value }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryIcon}>
        <Ionicons name={icon} size={17} color={FIORI.brand} />
      </View>

      <Text style={styles.summaryLabel}>{label}</Text>

      <Text style={styles.summaryValue}>{String(value ?? 0)}</Text>
    </View>
  );
}

function elev(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 8 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: FIORI.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 18,
    alignItems: "center",
    ...elev(0.6),
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: FIORI.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: "900",
    color: FIORI.text,
    textAlign: "center",
  },
  description: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: FIORI.textMuted,
    textAlign: "center",
  },
  progressWrap: {
    marginTop: 18,
    width: "100%",
    height: 12,
    borderRadius: 999,
    backgroundColor: FIORI.surfaceAlt,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: FIORI.brand,
  },
  percent: {
    marginTop: 8,
    fontSize: 13,
    color: FIORI.brandDark,
    fontWeight: "900",
  },
  timerBox: {
    marginTop: 12,
    width: "100%",
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    backgroundColor: FIORI.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: FIORI.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  timerLabel: {
    color: FIORI.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  timerValue: {
    marginTop: 2,
    color: FIORI.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  message: {
    marginTop: 12,
    color: FIORI.text,
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  netPill: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  netText: {
    fontSize: 12,
    fontWeight: "900",
  },
  summaryCard: {
    marginTop: 14,
    backgroundColor: FIORI.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    ...elev(0.4),
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: FIORI.text,
    marginBottom: 10,
  },
  summaryRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: FIORI.borderSoft,
    gap: 10,
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: FIORI.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: {
    flex: 1,
    color: FIORI.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  summaryValue: {
    color: FIORI.text,
    fontSize: 13,
    fontWeight: "900",
  },
  lastSyncBox: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  lastSyncText: {
    color: FIORI.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  stepsCard: {
    marginTop: 14,
    backgroundColor: FIORI.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    ...elev(0.35),
  },
  stepRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
  },
  stepDot: {
    marginTop: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: "900",
  },
  stepDescription: {
    marginTop: 2,
    fontSize: 11,
    color: FIORI.textMuted,
    fontWeight: "700",
    lineHeight: 15,
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: FIORI.brand,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FIORI.border,
    backgroundColor: FIORI.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnText: {
    color: FIORI.brand,
    fontWeight: "900",
    fontSize: 13,
  },
  dangerBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F5B7B1",
    backgroundColor: "#FFF5F5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  dangerBtnText: {
    color: FIORI.err,
    fontWeight: "900",
    fontSize: 13,
  },
});