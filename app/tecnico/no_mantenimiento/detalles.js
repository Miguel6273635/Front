// app/tecnico/no_mantenimiento/detalles.js
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

const ESTATUS_CARTA_NO_MANTTO = "0600";
const ESTATUS_CARTA_NO_MANTTO_LABEL = "Carta No Mantto";

const safeStr = (v) => (v == null ? "" : String(v));

const parseSapDate = (v) => {
  if (!v) return null;

  const m = String(v).match(/\/Date\((\-?\d+)\)\//);
  if (!m) return null;

  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;

  return new Date(ms);
};

function normalizeCode(code) {
  const s = safeStr(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;

  return String(n).padStart(4, "0");
}

function extractStatusCodes(userstatusRaw) {
  const s = safeStr(userstatusRaw).trim();
  if (!s) return [];

  const matches = s.match(/\d{1,4}/g) || [];

  const codes = matches
    .map((x) => normalizeCode(x))
    .filter((x) => /^\d{4}$/.test(x));

  return Array.from(new Set(codes));
}

function isCartaNoMantto(userstatusRaw, estatusCodeRaw) {
  const codes = extractStatusCodes(userstatusRaw);
  const apiCode = normalizeCode(estatusCodeRaw);

  return (
    codes.includes(ESTATUS_CARTA_NO_MANTTO) ||
    apiCode === ESTATUS_CARTA_NO_MANTTO
  );
}

function formatDateTime(value) {
  const d = parseSapDate(value);
  if (!d) return "—";

  return d.toLocaleString();
}

/* ===================== Screen ===================== */
export default function TecnicoNoMantenimientoDetalle() {
  const params = useLocalSearchParams();
  const id = safeStr(params?.id).trim();

  const { user } = useAuth();

  const correo = useMemo(() => {
    return safeStr(
      user?.email || user?.correo || user?.upn || user?.username,
    ).trim();
  }, [user]);

  const [loading, setLoading] = useState(true);
  const [wo, setWo] = useState(null);

  const [operaciones, setOperaciones] = useState([]);
  const [openOps, setOpenOps] = useState({});
  const [componentsByOp, setComponentsByOp] = useState({});
  const [loadingComponents, setLoadingComponents] = useState({});

  const fetchDetalle = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);

      const url = `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${encodeURIComponent(
        id,
      )}')`;

      const { data } = await api.get(url, {
        params: {
          $format: "json",
        },
      });

      setWo(data?.d || null);

      const ops = await fetchOperacionesSupervisor(id);
      setOperaciones(Array.isArray(ops) ? ops : []);
    } catch (e) {
      console.error(
        "Error detalle Carta No Mantto (técnico):",
        e?.response?.data || e?.message,
      );

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
    const activity = String(op?.Activity || op?.activity || "").padStart(
      4,
      "0",
    );

    const opId = `${activity}-${idx}`;
    const willOpen = !openOps[opId];

    setOpenOps((p) => ({
      ...p,
      [opId]: willOpen,
    }));

    if (!willOpen || componentsByOp[activity]) return;

    try {
      setLoadingComponents((p) => ({
        ...p,
        [activity]: true,
      }));

      const comps = await fetchComponentesPorOperacion(id, activity);

      setComponentsByOp((p) => ({
        ...p,
        [activity]: Array.isArray(comps) ? comps : [],
      }));
    } catch (e) {
      setComponentsByOp((p) => ({
        ...p,
        [activity]: [],
      }));
    } finally {
      setLoadingComponents((p) => ({
        ...p,
        [activity]: false,
      }));
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle Carta No Mantto" />

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
        <Header title="Detalle Carta No Mantto" />

        <View style={styles.center}>
          <Text style={{ color: COLORS.text }}>No se encontró la orden.</Text>
        </View>
      </View>
    );
  }

  const startLabel = formatDateTime(wo?.StartDate);
  const finishLabel = formatDateTime(wo?.FinishDate);

  const userstatus = wo?.Userstatus || wo?.UserStatus || "";
  const estatusCode =
    wo?.estatus_code || wo?.EstatusCode || wo?.StatusCode || wo?.Status || "";

  const is0600 = isCartaNoMantto(userstatus, estatusCode);

  return (
    <View style={styles.container}>
      <Header title={`Orden ${id}`} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>

        {!is0600 ? (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={20} color="#B45309" />

            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>
                Esta orden no está marcada como Carta No Mantto
              </Text>

              <Text style={styles.warningText}>
                Esta vista es solo para órdenes con estatus Carta No Mantto.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.okCard}>
            <Ionicons
              name="document-text-outline"
              size={20}
              color="#0B8457"
            />

            <View style={{ flex: 1 }}>
              <Text style={styles.okTitle}>{ESTATUS_CARTA_NO_MANTTO_LABEL}</Text>

              <Text style={styles.okText}>
                Esta orden está marcada como Carta No Mantto.
              </Text>
            </View>
          </View>
        )}

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
            <Text style={styles.b}>Estatus: </Text>
            {ESTATUS_CARTA_NO_MANTTO_LABEL}
          </Text>

          <Text style={[styles.line, { fontSize: 12, marginTop: 8 }]}>
            <Text style={styles.b}>Inicio: </Text>
            {startLabel}
            {"  ·  "}
            <Text style={styles.b}>Fin: </Text>
            {finishLabel}
          </Text>

          <Text style={[styles.line, { fontSize: 12, marginTop: 8 }]}>
            <Text style={styles.b}>Usuario loggeado: </Text>
            {correo || "—"}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h}>Operaciones</Text>

          {operaciones.length === 0 ? (
            <Text style={{ color: COLORS.muted, marginTop: 6 }}>
              No hay operaciones registradas.
            </Text>
          ) : (
            operaciones.map((op, idx) => {
              const activity = String(
                op?.Activity || op?.activity || "",
              ).padStart(4, "0");

              const description =
                op?.Description || op?.description || "Sin descripción";

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
                        {activity} — {description}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  scroll: {
    padding: 16,
    paddingBottom: 110,
  },

  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  backText: {
    color: COLORS.accent,
    fontWeight: "900",
  },

  warningCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  warningTitle: {
    color: "#92400E",
    fontWeight: "900",
    fontSize: 13,
  },

  warningText: {
    color: "#92400E",
    fontSize: 12,
    marginTop: 2,
  },

  okCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#ECFDF3",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  okTitle: {
    color: "#166534",
    fontWeight: "900",
    fontSize: 13,
  },

  okText: {
    color: "#166534",
    fontSize: 12,
    marginTop: 2,
  },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  h: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.title,
  },

  line: {
    color: COLORS.text,
    marginTop: 6,
    fontSize: 13,
  },

  b: {
    color: COLORS.title,
    fontWeight: "900",
  },

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

  opTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.title,
  },

  opSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },

  opBody: {
    padding: 10,
  },

  opEmpty: {
    fontStyle: "italic",
    color: COLORS.muted,
  },

  compRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  compTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.title,
  },

  compMeta: {
    fontSize: 12,
    color: COLORS.muted,
  },
});