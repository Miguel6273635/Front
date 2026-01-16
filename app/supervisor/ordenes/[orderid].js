import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../src/components/Header";

import {
  fetchOrdenDetalleSupervisor,
  fetchOperacionesSupervisor,
  fetchComponentesPorOperacion,
} from "../../../src/services/operacionesSupervisor";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  muted: "#9AA5B1",
  accent: "#0A6ED1",
  danger: "#E76565",
};

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
};

export default function DetalleOrdenSupervisor() {
  const { orderid } = useLocalSearchParams();

  const [data, setData] = useState(null);
  const [operaciones, setOperaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [openOps, setOpenOps] = useState({});
  const [componentsByAct, setComponentsByAct] = useState({});
  const [loadingComponents, setLoadingComponents] = useState({}); // { [activity]: true/false }

  const goBack = () => router.back();

  const getStatusColor = (status) => {
    const s = (status || "").toLowerCase();
    if (!s || s === "pendiente") return COLORS.danger;
    if (s === "en_proceso") return "#F5C044";
    if (s === "finalizada_con_pendientes") return "#F39C12";
    return "#6FCF97";
  };

  const cargarDetalle = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const detalle = await fetchOrdenDetalleSupervisor(orderid);
      const ops = await fetchOperacionesSupervisor(orderid);

      setData(detalle || null);
      setOperaciones(Array.isArray(ops) ? ops : []);
    } catch (err) {
      console.error("Error supervisor detalle:", err?.response?.data || err);
      setErrorMsg(err?.response?.data?.error || "No se pudo cargar el detalle de la orden.");
      setData(null);
      setOperaciones([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderid) cargarDetalle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderid]);

  const toggleOp = async (op, idx) => {
    const activity = String(op?.Activity || "").padStart(4, "0");
    const sub = String(op?.SubActivity || "");
    const opId = `${activity}-${sub}-${idx}`; // ✅ mismo ID que en render

    const willOpen = !openOps[opId];
    setOpenOps((prev) => ({ ...prev, [opId]: willOpen }));

    // si ya estaba cargado, no vuelvas a pedir
    if (componentsByAct[activity]) return;

    // si se está cerrando, no hacer nada
    if (!willOpen) return;

    try {
      setLoadingComponents((p) => ({ ...p, [activity]: true }));
      const comps = await fetchComponentesPorOperacion(orderid, activity);
      setComponentsByAct((p) => ({ ...p, [activity]: Array.isArray(comps) ? comps : [] }));
    } catch (e) {
      console.error("Error componentes:", e?.response?.data || e);
      setComponentsByAct((p) => ({ ...p, [activity]: [] }));
    } finally {
      setLoadingComponents((p) => ({ ...p, [activity]: false }));
    }
  };

  const statusColor = useMemo(() => getStatusColor(data?.estatus), [data]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de orden" />
        <View style={styles.centerBody}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={{ marginTop: 10, color: COLORS.muted }}>Cargando detalle…</Text>
        </View>
      </View>
    );
  }

  if (errorMsg || !data) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de orden" />
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{errorMsg || "Orden no encontrada."}</Text>

          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.backBtnText}>Regresar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Detalle de orden" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.inlineBack} onPress={goBack}>
          <Ionicons name="arrow-back" size={18} color={COLORS.accent} />
          <Text style={styles.inlineBackText}>Volver a lista</Text>
        </TouchableOpacity>

        {/* Encabezado */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderIdText}>Orden #{data.Orderid || data.orderid}</Text>
              <Text style={styles.orderTypeText}>{data.order_type || data.nombre_orden || "—"}</Text>
            </View>

            <View
              style={[
                styles.statusPill,
                { borderColor: statusColor, backgroundColor: statusColor + "22" },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={styles.statusPillText}>
                {(data.estatus || "pendiente").replace(/_/g, " ")}
              </Text>
            </View>
          </View>

          <View style={styles.row}>
            <Ionicons name="cube-outline" size={16} color={COLORS.muted} />
            <Text style={styles.rowLabel}>Equipo:</Text>
            <Text style={styles.rowValue}>{data.equipment || "—"}</Text>
          </View>

          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.muted} />
            <Text style={styles.rowLabel}>Inicio:</Text>
            <Text style={styles.rowValue}>{formatDate(data.start_date)}</Text>
          </View>

          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.muted} />
            <Text style={styles.rowLabel}>Fin:</Text>
            <Text style={styles.rowValue}>{formatDate(data.finish_date)}</Text>
          </View>

          {!!(data.partner_name || data.cliente) && (
            <View style={styles.row}>
              <Ionicons name="person-outline" size={16} color={COLORS.muted} />
              <Text style={styles.rowLabel}>Cliente:</Text>
              <Text style={styles.rowValue}>{data.partner_name || data.cliente}</Text>
            </View>
          )}

          {!!(data.partner_address || data.direccion) && (
            <View style={[styles.row, { alignItems: "flex-start" }]}>
              <Ionicons name="location-outline" size={16} color={COLORS.muted} />
              <Text style={styles.rowLabel}>Dirección:</Text>
              <Text style={[styles.rowValue, { flex: 1 }]} numberOfLines={3}>
                {data.partner_address || data.direccion}
              </Text>
            </View>
          )}
        </View>

        {/* Operaciones */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Operaciones</Text>

          {operaciones.length === 0 ? (
            <Text style={styles.emptyText}>No hay operaciones registradas.</Text>
          ) : (
            operaciones.map((op, idx) => {
              const activity = String(op?.Activity || "").padStart(4, "0");
              const sub = String(op?.SubActivity || "");
              const opId = `${activity}-${sub}-${idx}`;
              const isOpen = !!openOps[opId];

              const est = String(op?.estatus || "pendiente");
              const opColor = getStatusColor(est);

              const comps = componentsByAct[activity];
              const compsLoading = !!loadingComponents[activity];

              return (
                <View key={opId} style={styles.operationCard}>
                  <TouchableOpacity
                    style={styles.operationHeader}
                    onPress={() => toggleOp(op, idx)}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.operationTitle}>
                        {activity}
                        {sub ? `.${sub}` : ""} — {op?.Description || "Sin descripción"}
                      </Text>

                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 }}>
                        <View style={[styles.opBadge, { borderColor: opColor, backgroundColor: opColor + "22" }]}>
                          <Text style={styles.opBadgeText}>{est.replace(/_/g, " ")}</Text>
                        </View>

                        <Text style={styles.operationSub}>
                          Duración: {op?.DurationNormal ?? "—"} {op?.DurationNormalUnit || ""}
                        </Text>
                      </View>
                    </View>

                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={COLORS.muted}
                    />
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.operationBody}>
                      {compsLoading ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <ActivityIndicator size="small" color={COLORS.accent} />
                          <Text style={styles.emptyText}>Cargando componentes…</Text>
                        </View>
                      ) : !Array.isArray(comps) || comps.length === 0 ? (
                        <Text style={styles.emptyText}>Sin componentes asociados a esta operación.</Text>
                      ) : (
                        comps.map((c, i) => (
                          <View key={`${c.ResItem || i}`} style={styles.componentRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.componentTitle}>
                                {c.Material || "—"} {c.MatlDesc ? `- ${c.MatlDesc}` : ""}
                              </Text>
                              <Text style={styles.componentMeta}>
                                ResItem: {c.ResItem || "—"} · Req: {c.RequirementQuantity ?? 0}{" "}
                                {c.RequirementQuantityUnit || ""} · Ret: {c.WithdQuan ?? 0}
                              </Text>
                              <Text style={styles.componentMeta}>
                                Planta: {c.Plant || "—"} · Almacén: {c.StgeLoc || "—"}
                              </Text>
                            </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 16, paddingBottom: 80 },

  inlineBack: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  inlineBackText: { marginLeft: 4, color: COLORS.accent, fontWeight: "600" },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },

  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  orderIdText: { fontSize: 18, fontWeight: "700", color: COLORS.title },
  orderTypeText: { fontSize: 14, color: COLORS.text, marginTop: 2 },

  statusPill: { flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  statusPillText: { fontSize: 12, fontWeight: "600", color: COLORS.title, textTransform: "capitalize" },

  row: { flexDirection: "row", alignItems: "center", marginTop: 4, columnGap: 6 },
  rowLabel: { fontSize: 13, color: COLORS.muted, fontWeight: "600" },
  rowValue: { fontSize: 13, color: COLORS.text },

  sectionTitle: { fontSize: 15, fontWeight: "700", color: COLORS.title, marginBottom: 6 },

  operationCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginTop: 8, overflow: "hidden" },
  operationHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 10, backgroundColor: "#F5F7FA" },
  operationTitle: { fontSize: 14, fontWeight: "600", color: COLORS.title },
  operationSub: { fontSize: 12, color: COLORS.muted },

  opBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  opBadgeText: { fontSize: 11, fontWeight: "700", color: COLORS.title },

  operationBody: { paddingHorizontal: 10, paddingVertical: 10, backgroundColor: "#FFFFFF" },

  componentRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  componentTitle: { fontSize: 13, fontWeight: "600", color: COLORS.title },
  componentMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },

  emptyText: { fontSize: 13, color: COLORS.muted, marginTop: 4, fontStyle: "italic" },

  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  errorText: { textAlign: "center", fontSize: 14, color: COLORS.danger, marginBottom: 12 },
  backBtn: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  backBtnText: { color: "#fff", marginLeft: 6, fontWeight: "600" },

  centerBody: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
});
