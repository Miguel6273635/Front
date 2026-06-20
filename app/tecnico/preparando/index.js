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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import Header from "../../../src/components/Header";
import { useAuth } from "../../../src/context/AuthContext";
import { runBackgroundSyncNow } from "../../../src/offline/backgroundSync";
import {
  loadOrdenesTecnicoList,
  getOrdenesTecnicoLastSync,
} from "../../../src/offline/ordenesTecnicoCache";
import { getSapQueue } from "../../../src/offline/sapQueue";

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
    description: "Buscando información pendiente por enviar a SAP.",
    percent: 18,
  },
  {
    key: "orders",
    label: "Precargando órdenes",
    description: "Guardando órdenes cercanas para uso offline.",
    percent: 42,
  },
  {
    key: "details",
    label: "Precargando detalles",
    description: "Guardando detalle, operaciones, dirección y cliente.",
    percent: 72,
  },
  {
    key: "catalogs",
    label: "Precargando catálogos",
    description: "Preparando consumibles y datos auxiliares.",
    percent: 92,
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

function formatDateTime(ms) {
  if (!ms) return "Sin sincronización previa";

  try {
    const d = new Date(ms);
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

export default function PreparandoTecnicoScreen() {
  const { user } = useAuth();

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
    pendientesSap: 0,
    lastSyncAt: null,
  });

  const [message, setMessage] = useState(
    "Estamos preparando su información para trabajar más rápido.",
  );

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

      if (!mountedRef.current) return;

      setSummary({
        ordenes: Array.isArray(cached?.data) ? cached.data.length : 0,
        pendientesSap: Array.isArray(queue) ? queue.length : 0,
        lastSyncAt,
      });
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error leyendo resumen:", e?.message || e);

      if (!mountedRef.current) return;

      setSummary({
        ordenes: 0,
        pendientesSap: 0,
        lastSyncAt: null,
      });
    }
  };

  const markPreloadDone = async () => {
    try {
      await AsyncStorage.setItem(PRELOAD_DONE_KEY(userEmail), "true");
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error guardando bandera:", e?.message || e);
    }
  };

  const startPreload = async () => {
    if (startedRef.current) return;

    startedRef.current = true;

    try {
      setSyncing(true);
      setDone(false);

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
      setMessage("Revisando pendientes por enviar a SAP...");
      await wait(350);

      setProgress(STEPS[2]);
      setMessage("Precargando órdenes asignadas al técnico...");
      await wait(350);

      setProgress(STEPS[3]);
      setMessage("Precargando detalles, operaciones, dirección y cliente...");

      const result = await runBackgroundSyncNow({
        source: "tecnico_preload_screen",
      });

      console.log("[PRELOAD TECNICO] Resultado:", result);

      if (!mountedRef.current) return;

      if (result?.ok === false && result?.reason === "sync_already_running") {
        setMessage(
          "La sincronización ya estaba corriendo. Esperando información guardada...",
        );
      }

      setProgress(STEPS[4]);
      setMessage("Preparando catálogos, consumibles y datos auxiliares...");
      await wait(500);

      await loadLocalSummary();

      setProgress(STEPS[5]);
      setMessage("Puede iniciar con sus órdenes. Que tenga un excelente día.");

      await markPreloadDone();

      if (!mountedRef.current) return;

      setDone(true);
    } catch (e) {
      console.log("[PRELOAD TECNICO] Error:", e?.message || e);

      if (!mountedRef.current) return;

      await loadLocalSummary();

      setProgress({
        key: "warning",
        label: "Preparación parcial",
        description:
          "No se pudo completar toda la precarga, pero puede continuar.",
        percent: 100,
      });

      setMessage(
        "No se pudo completar toda la precarga. Puede iniciar con la información disponible.",
      );

      await markPreloadDone();

      if (!mountedRef.current) return;

      setDone(true);
    } finally {
      if (mountedRef.current) {
        setSyncing(false);
      }
    }
  };

  const retryPreload = async () => {
    startedRef.current = false;
    setPercent(0);
    progressAnim.setValue(0);
    setDone(false);
    setMessage("Estamos preparando su información para trabajar más rápido.");
    await startPreload();
  };

  const continuar = () => {
    router.replace("/tecnico");
  };

  useEffect(() => {
    mountedRef.current = true;
    startPreload();

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={FIORI.pageBg} />
      <Header title="Preparando información" />

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            {done ? (
              <Ionicons name="checkmark-circle" size={56} color={FIORI.ok} />
            ) : (
              <ActivityIndicator size="large" color={FIORI.brand} />
            )}
          </View>

          <Text style={styles.title}>{currentStep.label}</Text>

          <Text style={styles.description}>{currentStep.description}</Text>

          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progreso de precarga</Text>
            <Text style={styles.progressPercent}>{percent}%</Text>
          </View>

          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: barWidth }]} />
          </View>

          <Text style={styles.message}>{message}</Text>

          <View style={styles.stepsBox}>
            {STEPS.map((step) => {
              const active = percent >= step.percent;
              const current = currentStep.key === step.key;

              return (
                <View key={step.key} style={styles.stepRow}>
                  <View
                    style={[
                      styles.stepDot,
                      active && styles.stepDotActive,
                      current && styles.stepDotCurrent,
                    ]}
                  >
                    {active ? (
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    ) : null}
                  </View>

                  <Text
                    style={[
                      styles.stepText,
                      active && styles.stepTextActive,
                      current && styles.stepTextCurrent,
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.summaryBox}>
            <SummaryItem
              icon="document-text-outline"
              label="Órdenes guardadas"
              value={String(summary.ordenes)}
            />

            <SummaryItem
              icon="cloud-upload-outline"
              label="Pendientes SAP"
              value={String(summary.pendientesSap)}
            />

            <SummaryItem
              icon={online ? "wifi-outline" : "cloud-offline-outline"}
              label="Conexión"
              value={
                online === null ? "Validando" : online ? "Online" : "Offline"
              }
            />

            <SummaryItem
              icon="time-outline"
              label="Última sincronización"
              value={formatDateTime(summary.lastSyncAt)}
            />
          </View>

          {done ? (
            <>
              <TouchableOpacity
                style={styles.primaryBtn}
                activeOpacity={0.88}
                onPress={continuar}
              >
                <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  Iniciar con mis órdenes
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, syncing && { opacity: 0.7 }]}
                activeOpacity={0.88}
                onPress={retryPreload}
                disabled={syncing}
              >
                <Text style={styles.secondaryBtnText}>
                  Volver a precargar información
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.waitBox}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={FIORI.textMuted}
              />
              <Text style={styles.waitText}>
                No cierres la app mientras se prepara la información.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function SummaryItem({ icon, label, value }) {
  return (
    <View style={styles.summaryItem}>
      <View style={styles.summaryIcon}>
        <Ionicons name={icon} size={18} color={FIORI.brand} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
  },

  content: {
    flex: 1,
    padding: 18,
    justifyContent: "center",
  },

  card: {
    backgroundColor: FIORI.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 18,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.09,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },

  iconCircle: {
    alignSelf: "center",
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: FIORI.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: FIORI.text,
    textAlign: "center",
  },

  description: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: FIORI.textMuted,
    fontWeight: "700",
    textAlign: "center",
  },

  progressHeader: {
    marginTop: 20,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  progressLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: FIORI.text,
  },

  progressPercent: {
    fontSize: 13,
    fontWeight: "900",
    color: FIORI.brand,
  },

  progressTrack: {
    height: 13,
    backgroundColor: FIORI.borderSoft,
    borderRadius: 999,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    backgroundColor: FIORI.brand,
    borderRadius: 999,
  },

  message: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: FIORI.text,
    fontWeight: "800",
    textAlign: "center",
  },

  stepsBox: {
    marginTop: 16,
    backgroundColor: FIORI.surfaceAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    padding: 12,
    gap: 8,
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },

  stepDotActive: {
    backgroundColor: FIORI.ok,
    borderColor: FIORI.ok,
  },

  stepDotCurrent: {
    borderColor: FIORI.brand,
  },

  stepText: {
    flex: 1,
    fontSize: 12,
    color: FIORI.textMuted,
    fontWeight: "700",
  },

  stepTextActive: {
    color: FIORI.text,
  },

  stepTextCurrent: {
    color: FIORI.brandDark,
    fontWeight: "900",
  },

  summaryBox: {
    marginTop: 16,
    gap: 10,
  },

  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    borderRadius: 14,
    padding: 10,
    gap: 10,
  },

  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: FIORI.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  summaryLabel: {
    fontSize: 11,
    color: FIORI.textMuted,
    fontWeight: "800",
  },

  summaryValue: {
    marginTop: 2,
    fontSize: 13,
    color: FIORI.text,
    fontWeight: "900",
  },

  primaryBtn: {
    marginTop: 18,
    backgroundColor: FIORI.brand,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  primaryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },

  secondaryBtn: {
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FIORI.surfaceAlt,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  secondaryBtnText: {
    color: FIORI.text,
    fontSize: 13,
    fontWeight: "900",
  },

  waitBox: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: FIORI.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    padding: 10,
  },

  waitText: {
    flex: 1,
    fontSize: 12,
    color: FIORI.textMuted,
    fontWeight: "700",
  },
});