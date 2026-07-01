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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import Header from "../../../src/components/Header";
import { useAuth } from "../../../src/context/AuthContext";
import api from "../../../src/services/api";

import { runBackgroundSyncNow } from "../../../src/offline/backgroundSync";
import { prefetchOrdenesTecnicoDiaRapido } from "../../../src/offline/prefetchOrdenesTecnico";
import {
  loadOrdenesTecnicoList,
  getOrdenesTecnicoLastSync,
} from "../../../src/offline/ordenesTecnicoCache";
import { getSapQueue } from "../../../src/offline/sapQueue";
import { loadConsumiblesByCobertura } from "../../../src/offline/consumiblesCache";

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
  if (result?.mode === "day_fast") return result;

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
  const [online, setOnline] = useState(null);

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
      const consumibles = await loadConsumiblesByCobertura("BASICA");

      if (!mountedRef.current) return;

      setSummary((prev) => ({
        ...prev,
        ordenes: Array.isArray(cached?.data) ? cached.data.length : 0,
        pendientesSap: Array.isArray(queue) ? queue.length : 0,
        lastSyncAt,
        consumibles: Number(consumibles?.count || 0),
        gruposConsumibles: Array.isArray(consumibles?.groups)
          ? consumibles.groups.filter((g) => Number(g?.count || 0) > 0).length
          : 0,
      }));
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error leyendo resumen:", e?.message || e);

      if (!mountedRef.current) return;

      setSummary((prev) => ({
        ...prev,
        ordenes: 0,
        pendientesSap: 0,
        lastSyncAt: null,
      }));
    }
  };

  const markPreloadDone = async () => {
    try {
      const payload = {
        done: true,
        date: getTodayKey(),
        doneAt: Date.now(),
        userEmail,
      };

      await AsyncStorage.setItem(
        PRELOAD_DONE_KEY(userEmail),
        JSON.stringify(payload),
      );
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error guardando bandera:", e?.message || e);
    }
  };

  const wasPreloadDoneToday = async () => {
    try {
      const raw = await AsyncStorage.getItem(PRELOAD_DONE_KEY(userEmail));

      if (!raw) return false;

      /*
        Compatibilidad con versiones anteriores:
        antes se guardaba "true". Eso ya no es suficiente para bloquear por día,
        por eso solo aceptamos JSON con date.
      */
      if (raw === "true") return false;

      const parsed = JSON.parse(raw);

      return parsed?.done === true && parsed?.date === getTodayKey();
    } catch {
      return false;
    }
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
      actividades: Number(detalleResult?.ok ?? prev.actividades ?? 0),
      componentes: Number(components?.ok ?? prev.componentes ?? 0),
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

    try {
      setSyncing(true);
      setDone(false);

      const alreadyDoneToday = await wasPreloadDoneToday();

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

        await markPreloadDone();

        if (!mountedRef.current) return;

        await loadLocalSummary();
        setDone(true);
        return;
      }

      setProgress(STEPS[1]);
      setMessage("Revisando pendientes locales por enviar a SAP...");
      await wait(200);

      setProgress(STEPS[2]);
      setMessage("Precargando órdenes del día asignadas al técnico...");
      await wait(200);

      setProgress(STEPS[3]);
      setMessage(
        "Precargando detalle básico y operaciones de las órdenes del día...",
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

      console.log("[PRELOAD TECNICO] Resultado precarga del día:", result);

      if (!mountedRef.current) return;

      applyResultSummary(result);

      const tecnicoPrefetch = getTecnicoPrefetchFromResult(result);
      const detalleResult = tecnicoPrefetch?.detalleResult || {};

      setProgress(STEPS[4]);
      setMessage(
        `Detalles del día guardados: ${Number(
          detalleResult?.ok || 0,
        )}. Precargando componentes dentro de esta pantalla...`,
      );
      await wait(200);

      /*
        Antes esto se lanzaba con .catch() en segundo plano y el usuario podía
        entrar a Inicio Técnico mientras todavía se consumían datos.

        Ahora se espera aquí. Así todo el consumo fuerte se queda en la pantalla
        de precarga.
      */
      try {
        const fullSyncResult = await runBackgroundSyncNow({
          source: "tecnico_preload_full_waited",
        });

        console.log("[PRELOAD TECNICO] Sync completa esperada:", fullSyncResult);

        applyResultSummary(fullSyncResult);
      } catch (syncErr) {
        console.log(
          "[PRELOAD TECNICO] Sync completa no pudo terminar:",
          syncErr?.message || syncErr,
        );
      }

      setProgress(STEPS[5]);
      setMessage(
        "Consumibles y componentes actualizados. Leyendo resumen local...",
      );
      await wait(200);

      await loadLocalSummary();

      setProgress(STEPS[6]);
      setMessage(
        "Información del día lista. Puede iniciar; no se volverá a precargar hasta mañana.",
      );

      await markPreloadDone();

      if (!mountedRef.current) return;

      setDone(true);
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error general:", e?.message || e);

      if (!mountedRef.current) return;

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

      await markPreloadDone();
      await loadLocalSummary();
      setDone(true);
    } finally {
      if (mountedRef.current) setSyncing(false);
    }
  };

 const goHome = async () => {
  await markPreloadDone();
  router.replace("/tecnico?ready=1");
};

  const retryPreload = async () => {
    startedRef.current = false;
    setDone(false);
    setPercent(0);
    progressAnim.setValue(0);
    await startPreload({ retry: true });
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
});