// app/supervisor/ordenes/[orderid].js
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

  pendienteBg: "#FDECEC",
  pendienteBorder: "#F5B7B1",

  procesoBg: "#FFF7E6",
  procesoBorder: "#F5C16C",

  finalBg: "#EAF7EF",
  finalBorder: "#8FD19E",

  firmaBg: "#EAF4FF",
  firmaBorder: "#8EC5FF",

  noMantBg: "#F1F3F5",
  noMantBorder: "#C9CED6",

  unknownBg: "#F4F6F9",
  unknownBorder: "#D6DEE8",
};

/* ======================
   Helpers SAP Date
   ====================== */
const sapDateToMs = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;

  const s = String(value);

  const m = s.match(/\/Date\((\-?\d+)([+-]\d{4})?\)\//);
  if (m) {
    const ms = Number(m[1]);
    const off = m[2];

    if (!off) return ms;

    const sign = off.startsWith("-") ? -1 : 1;
    const hh = parseInt(off.slice(1, 3), 10);
    const mm = parseInt(off.slice(3, 5), 10);
    const offsetMinutes = sign * (hh * 60 + mm);

    return ms - offsetMinutes * 60 * 1000;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

const formatDateUTC = (value) => {
  const ms = sapDateToMs(value);
  if (ms === null) return "—";

  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";

  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();

  return `${dd}/${mm}/${yyyy}`;
};

/* =========================
   Reglas Userstatus
   ========================= */
function normalizeCode(code) {
  if (code === null || code === undefined) return "";

  const s = String(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;

  return String(n).padStart(4, "0");
}

function extractCodes(raw) {
  if (!raw) return [];

  const s = String(raw).trim();
  if (!s) return [];

  const matches = s.match(/\d{1,4}/g) || [];

  const codes = matches
    .map((x) => normalizeCode(x))
    .filter((x) => /^\d{4}$/.test(x));

  return Array.from(new Set(codes));
}

const STATUS_META = {
  "0100": {
    label: "PENDIENTE",
    type: "pendiente",
    color: "#D64545",
    bgColor: COLORS.pendienteBg,
    borderColor: COLORS.pendienteBorder,
  },
  "0200": {
    label: "EN PROCESO",
    type: "proceso",
    color: "#D49C00",
    bgColor: COLORS.procesoBg,
    borderColor: COLORS.procesoBorder,
  },
  "0300": {
    label: "FINALIZADA",
    type: "final",
    color: "#27AE60",
    bgColor: COLORS.finalBg,
    borderColor: COLORS.finalBorder,
  },
  "0301": {
    label: "FINALIZADA SUPER",
    type: "final",
    color: "#024d21",
    bgColor: COLORS.finalBg,
    borderColor: COLORS.finalBorder,
  },
  "0400": {
    label: "PENDIENTE DE FIRMA",
    type: "firma",
    color: "#2D9CDB",
    bgColor: COLORS.firmaBg,
    borderColor: COLORS.firmaBorder,
  },
  "0600": {
    label: "Carta No Mantto",
    type: "no_mantto",
    color: "#b90909",
    bgColor: COLORS.noMantBg,
    borderColor: COLORS.noMantBorder,
  },
};

const PRIORITY = ["0600", "0400", "0300", "0200", "0100", "0301"];

function resolveUserstatus(
  rawUserstatus,
  _catalogMap = {},
  itemFromApi = null,
) {
  const rawCodes = extractCodes(rawUserstatus);
  const apiCode = normalizeCode(itemFromApi?.estatus_code);

  const codes = Array.from(
    new Set([...(rawCodes || []), ...(apiCode ? [apiCode] : [])]),
  );

  if (!codes.length) {
    return {
      code: "",
      label: "Sin empezar",
      type: "start",
      color: "#6A7381",
      bgColor: COLORS.unknownBg,
      borderColor: COLORS.unknownBorder,
      rawCodes: [],
    };
  }

  for (const p of PRIORITY) {
    if (codes.includes(p)) {
      return {
        code: p,
        ...STATUS_META[p],
        rawCodes: codes,
      };
    }
  }

  return {
    code: codes[0],
    label: `Estatus ${codes.join(", ")}`,
    type: "unknown",
    color: "#6A7381",
    bgColor: COLORS.unknownBg,
    borderColor: COLORS.unknownBorder,
    rawCodes: codes,
  };
}

/* ======================
   Normaliza detalle
   ====================== */
function normalizeDetalle(det) {
  if (!det) return null;

  const orderid = det.orderid ?? det.Orderid ?? "";
  const equipment = det.equipment ?? det.Equipment ?? "";

  const nombre_orden =
    det.nombre_orden ?? det.ShortText ?? det.order_type ?? det.OrderType ?? "";

  const userstatus = det.userstatus ?? det.Userstatus ?? "";
  const estatus_code = det.estatus_code ?? det.EstatusCode ?? "";

  const startRaw =
    det.start_date ??
    det.startdate ??
    det.StartDate ??
    det.Basicstart ??
    det.BasicStart ??
    det.BasStaDate ??
    null;

  const finishRaw =
    det.finish_date ??
    det.finishdate ??
    det.FinishDate ??
    det.BasicFin ??
    det.BasicFinish ??
    det.BasFinDate ??
    null;

  return {
    ...det,
    orderid: String(orderid),
    equipment: String(equipment),
    nombre_orden: String(nombre_orden || "—"),
    userstatus: String(userstatus || ""),
    estatus_code: String(estatus_code || ""),
    start_date: sapDateToMs(startRaw),
    finish_date: sapDateToMs(finishRaw),
  };
}

export default function DetalleOrdenSupervisor() {
  const { orderid } = useLocalSearchParams();

  const [data, setData] = useState(null);
  const [operaciones, setOperaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const goBack = () => router.back();

  const cargarDetalle = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const detalle = await fetchOrdenDetalleSupervisor(orderid);
      const ops = await fetchOperacionesSupervisor(orderid);

      setData(normalizeDetalle(detalle));
      setOperaciones(Array.isArray(ops) ? ops : []);
    } catch (err) {
      console.error("Error supervisor detalle:", err?.response?.data || err);

      setErrorMsg(
        err?.response?.data?.error ||
          "No se pudo cargar el detalle de la orden.",
      );

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

  const headerStatus = useMemo(() => {
    return resolveUserstatus(data?.userstatus ?? "", {}, data);
  }, [data]);

  const canSendEvidence = useMemo(() => {
    if (!headerStatus) return false;

    // No se permite evidencia si ya está finalizada o Carta No Mantto.
    if (headerStatus.type === "final") return false;
    if (headerStatus.type === "no_mantto") return false;

    return true;
  }, [headerStatus]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de orden" />

        <View style={styles.centerBody}>
          <ActivityIndicator size="large" color={COLORS.accent} />

          <Text style={{ marginTop: 10, color: COLORS.muted }}>
            Cargando detalle…
          </Text>
        </View>
      </View>
    );
  }

  if (errorMsg || !data) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de orden" />

        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>
            {errorMsg || "Orden no encontrada."}
          </Text>

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

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderIdText}>Orden #{data.orderid}</Text>

              <Text style={styles.orderTypeText}>
                {data.nombre_orden || "—"}
              </Text>
            </View>

            <View
              style={[
                styles.statusPill,
                {
                  borderColor: headerStatus.color,
                  backgroundColor: headerStatus.color + "22",
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: headerStatus.color },
                ]}
              />

              <Text style={styles.statusPillText}>{headerStatus.label}</Text>
            </View>
          </View>

          {headerStatus.type === "no_mantto" ? (
            <View style={styles.infoBanner}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color={headerStatus.color}
              />

              <Text style={styles.infoBannerText}>
                Esta orden está marcada como Carta No Mantto. Las operaciones se
                muestran solo como referencia.
              </Text>
            </View>
          ) : null}

          {headerStatus.type === "final" ? (
            <View style={styles.infoBanner}>
              <Ionicons
                name="checkmark-done-outline"
                size={18}
                color={headerStatus.color}
              />

              <Text style={styles.infoBannerText}>
                Esta orden ya está finalizada. Las operaciones se muestran solo
                como referencia.
              </Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <Ionicons name="cube-outline" size={16} color={COLORS.muted} />
            <Text style={styles.rowLabel}>Equipo:</Text>
            <Text style={styles.rowValue}>{data.equipment || "—"}</Text>
          </View>

          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.muted} />
            <Text style={styles.rowLabel}>Inicio:</Text>
            <Text style={styles.rowValue}>
              {formatDateUTC(data.start_date)}
            </Text>
          </View>

          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.muted} />
            <Text style={styles.rowLabel}>Fin:</Text>
            <Text style={styles.rowValue}>
              {formatDateUTC(data.finish_date)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Operaciones</Text>

          {operaciones.length === 0 ? (
            <Text style={styles.emptyText}>
              No hay operaciones registradas.
            </Text>
          ) : (
            operaciones.map((op, idx) => {
              const activity = String(op?.Activity || "").padStart(4, "0");
              const sub = String(op?.SubActivity || "");
              const opId = `${activity}-${sub}-${idx}`;

              const opRawStatus =
                op?.userstatus ??
                op?.Userstatus ??
                op?.estatus_code ??
                op?.estatus ??
                data?.estatus_code ??
                data?.userstatus ??
                "";

              const opStatus = resolveUserstatus(opRawStatus, {}, op);

              return (
                <View
                  key={opId}
                  style={[
                    styles.operationCard,
                    {
                      backgroundColor: opStatus.bgColor,
                      borderColor: opStatus.borderColor,
                    },
                  ]}
                >
                  <View style={styles.operationHeaderStatic}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.operationTitle}>
                        {activity}
                        {sub ? `.${sub}` : ""} —{" "}
                        {op?.Description || "Sin descripción"}
                      </Text>

                      <View style={styles.opBadgeRow}>
                        <View
                          style={[
                            styles.opBadge,
                            {
                              borderColor: opStatus.color,
                              backgroundColor: "#FFFFFFAA",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.opBadgeText,
                              { color: opStatus.color },
                            ]}
                          >
                            {opStatus.label}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Ionicons
                      name="construct-outline"
                      size={20}
                      color={opStatus.color}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={styles.fabContainer}>
        {canSendEvidence ? (
          <TouchableOpacity
            style={styles.fab}
            onPress={() =>
              router.push(`/supervisor/ordenes/evidencia/${data.orderid}`)
            }
            activeOpacity={0.9}
          >
            <Ionicons name="camera" size={22} color="#fff" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.fabNoMantto}
          onPress={() =>
            router.push({
              pathname: "/supervisor/no_mantenimiento/Carta_no_mantto/",
              params: {
                orderid: data.orderid,
              },
            })
          }
          activeOpacity={0.9}
        >
          <Ionicons name="document-text" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },

  inlineBack: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  inlineBackText: {
    marginLeft: 4,
    color: COLORS.accent,
    fontWeight: "600",
  },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.03,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 1,
      },
    }),
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  orderIdText: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.title,
  },

  orderTypeText: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 2,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "45%",
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },

  statusPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.title,
    flexShrink: 1,
  },

  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },

  infoBannerText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 17,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    columnGap: 6,
  },

  rowLabel: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: "600",
  },

  rowValue: {
    fontSize: 13,
    color: COLORS.text,
    flexShrink: 1,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.title,
    marginBottom: 6,
  },

  operationCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 10,
    overflow: "hidden",
  },

  operationHeaderStatic: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },

  operationTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.title,
  },

  opBadgeRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
  },

  opBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  opBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },

  emptyText: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 4,
    fontStyle: "italic",
  },

  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  errorText: {
    textAlign: "center",
    fontSize: 14,
    color: COLORS.danger,
    marginBottom: 12,
  },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },

  backBtnText: {
    color: "#fff",
    marginLeft: 6,
    fontWeight: "600",
  },

  centerBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  fab: {
    backgroundColor: "#0A6ED1",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },

    elevation: 6,
  },
  fabContainer: {
    position: "absolute",
    bottom: 20,
    right: 20,
    alignItems: "center",
    gap: 12,
  },

  fabNoMantto: {
    backgroundColor: "#b90909",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },

    elevation: 6,
  },
});
