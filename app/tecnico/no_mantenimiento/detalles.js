import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";

import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import { useAuth } from "../../../src/context/AuthContext";

// ✅ reutilizamos servicios YA EXISTENTES
import {
  fetchOperacionesSupervisor,
  fetchComponentesPorOperacion,
} from "../../../src/services/operacionesSupervisor";

/* ===================== Utils ===================== */
const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  muted: "#9AA5B1",
};

const safeStr = (v) => (v == null ? "" : String(v));

const parseSapDate = (v) => {
  if (!v) return null;
  const m = String(v).match(/\/Date\((\-?\d+)\)\//);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
};

/* ===================== Screen ===================== */
export default function TecnicoNoMantenimientoDetalle() {
  const params = useLocalSearchParams();
  const id = safeStr(params?.id).trim();

  const { user } = useAuth();
  const correo = useMemo(() => {
    return safeStr(user?.email || user?.correo || user?.upn || user?.username).trim();
  }, [user]);

  const [loading, setLoading] = useState(true);
  const [wo, setWo] = useState(null);

  // 🔹 NUEVO: operaciones
  const [operaciones, setOperaciones] = useState([]);
  const [openOps, setOpenOps] = useState({});
  const [componentsByOp, setComponentsByOp] = useState({});
  const [loadingComponents, setLoadingComponents] = useState({});

  const fetchDetalle = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);

      // === TU LÓGICA EXISTENTE (NO TOCADA) ===
      const url = `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${encodeURIComponent(id)}')`;
      const { data } = await api.get(url, { params: { $format: "json" } });
      setWo(data?.d || null);

      // === NUEVO: cargar operaciones ===
      const ops = await fetchOperacionesSupervisor(id);
      setOperaciones(Array.isArray(ops) ? ops : []);
    } catch (e) {
      console.error("Error detalle No mantenimiento (técnico):", e?.response?.data || e?.message);
      setWo(null);
      setOperaciones([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetalle();
  }, [fetchDetalle]);

  const toggleOperacion = async (op, idx) => {
    const activity = String(op?.Activity || "").padStart(4, "0");
    const opId = `${activity}-${idx}`;

    const willOpen = !openOps[opId];
    setOpenOps((p) => ({ ...p, [opId]: willOpen }));

    if (!willOpen || componentsByOp[activity]) return;

    try {
      setLoadingComponents((p) => ({ ...p, [activity]: true }));
      const comps = await fetchComponentesPorOperacion(id, activity);
      setComponentsByOp((p) => ({ ...p, [activity]: Array.isArray(comps) ? comps : [] }));
    } catch (e) {
      setComponentsByOp((p) => ({ ...p, [activity]: [] }));
    } finally {
      setLoadingComponents((p) => ({ ...p, [activity]: false }));
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle No mantenimiento" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={{ marginTop: 8, color: COLORS.text }}>Cargando…</Text>
        </View>
      </View>
    );
  }

  if (!wo) {
    return (
      <View style={styles.container}>
        <Header title="Detalle No mantenimiento" />
        <View style={styles.center}>
          <Text style={{ color: COLORS.text }}>No se encontró la orden.</Text>
        </View>
      </View>
    );
  }

  const startDate = parseSapDate(wo?.StartDate);
  const finishDate = parseSapDate(wo?.FinishDate);

  return (
    <View style={styles.container}>
      <Header title={`Orden ${id}`} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        {/* === TU HEADER EXISTENTE === */}
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>

        {/* === DATOS DE LA ORDEN (NO TOCADO) === */}
        <View style={styles.card}>
          <Text style={styles.h}>Datos de la orden</Text>

          <Text style={styles.line}>
            <Text style={styles.b}>OrderId: </Text>
            {id}
          </Text>

          <Text style={styles.line}>
            <Text style={styles.b}>Equipo: </Text>
            {wo?.Equipment || "—"}
          </Text>

          <Text style={styles.line}>
            <Text style={styles.b}>Texto: </Text>
            {wo?.ShortText || "—"}
          </Text>

          <Text style={styles.line}>
            <Text style={styles.b}>Userstatus: </Text>
            {wo?.Userstatus || "—"}
          </Text>

          <Text style={[styles.line, { fontSize: 12, marginTop: 8 }]}>
            <Text style={styles.b}>Inicio: </Text>
            {startDate ? startDate.toLocaleString() : "—"}
            {"  ·  "}
            <Text style={styles.b}>Fin: </Text>
            {finishDate ? finishDate.toLocaleString() : "—"}
          </Text>

          <Text style={[styles.line, { fontSize: 12, marginTop: 8 }]}>
            <Text style={styles.b}>Usuario loggeado: </Text>
            {correo || "—"}
          </Text>
        </View>

        {/* ===================== NUEVO: OPERACIONES ===================== */}
        <View style={styles.card}>
          <Text style={styles.h}>Operaciones</Text>

          {operaciones.length === 0 ? (
            <Text style={{ color: COLORS.muted, marginTop: 6 }}>
              No hay operaciones registradas.
            </Text>
          ) : (
            operaciones.map((op, idx) => {
              const activity = String(op?.Activity || "").padStart(4, "0");
              const opId = `${activity}-${idx}`;
              const isOpen = !!openOps[opId];

              return (
                <View key={opId} style={styles.opCard}>
                  <TouchableOpacity
                    style={styles.opHeader}
                    onPress={() => toggleOperacion(op, idx)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.opTitle}>
                        {activity} — {op?.Description || "Sin descripción"}
                      </Text>
                      <Text style={styles.opSub}>
                        Duración: {op?.DurationNormal ?? "—"}{" "}
                        {op?.DurationNormalUnit || ""}
                      </Text>
                    </View>

                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={COLORS.muted}
                    />
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.opBody}>
                      {loadingComponents[activity] ? (
                        <ActivityIndicator size="small" color={COLORS.accent} />
                      ) : !componentsByOp[activity]?.length ? (
                        <Text style={styles.opEmpty}>
                          Sin componentes para esta operación.
                        </Text>
                      ) : (
                        componentsByOp[activity].map((c, i) => (
                          <View key={i} style={styles.compRow}>
                            <Text style={styles.compTitle}>
                              {c.Material || "—"}{" "}
                              {c.MatlDesc ? `- ${c.MatlDesc}` : ""}
                            </Text>
                            <Text style={styles.compMeta}>
                              Req: {c.RequirementQuantity ?? 0}{" "}
                              {c.RequirementQuantityUnit || ""}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/* ===================== Styles ===================== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  backRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backText: { color: COLORS.accent, fontWeight: "900" },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  h: { fontSize: 15, fontWeight: "900", color: COLORS.title },
  line: { color: COLORS.text, marginTop: 6, fontSize: 13 },
  b: { color: COLORS.title, fontWeight: "900" },

  /* Operaciones */
  opCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    marginTop: 10,
    overflow: "hidden",
  },
  opHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#F5F7FA",
  },
  opTitle: { fontSize: 14, fontWeight: "700", color: COLORS.title },
  opSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },

  opBody: { padding: 10 },
  opEmpty: { fontStyle: "italic", color: COLORS.muted },

  compRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  compTitle: { fontSize: 13, fontWeight: "700", color: COLORS.title },
  compMeta: { fontSize: 12, color: COLORS.muted },
});
