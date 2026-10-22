// app/supervisor/no_mantenimiento/index.js
// MELMEX APP - Supervisor / Carta de No Mantenimiento
// - Reutiliza el MISMO servicio de listado que las ordenes del supervisor.
// - El servicio envia al backend el parametro "user" y gestiona cache/offline.
// - Consulta un mes por vez, a demanda (sin descargar todo el anio).
// - Filtra exclusivamente el estatus 0600.
// - Busca localmente sin lanzar nuevas peticiones a cada pulsacion.

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";

import Header from "../../../src/components/Header";
import { useAuth } from "../../../src/context/AuthContext";
import { fetchOrdenesSupervisor } from "../../../src/services/ordenesSupervisor";
import { isOnline } from "../../../src/offline/net";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
};

const ESTATUS_CARTA_NO_MANTTO = "0600";
const ESTATUS_CARTA_NO_MANTTO_LABEL = "Carta No Mantto";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const safeStr = (value) => (value == null ? "" : String(value));

function normalizarCodigo(value) {
  const raw = safeStr(value).trim();
  if (!raw) return "";
  // No convertir textos libres a un codigo arbitrario.
  if (!/^\d{1,4}$/.test(raw)) return raw;
  return raw.padStart(4, "0");
}

function extraerEstatus(value) {
  const raw = safeStr(value);
  const matches = raw.match(/\d{1,4}/g) || [];
  return Array.from(new Set(matches.map(normalizarCodigo)));
}

function esCartaNoMantto(orden) {
  const userstatus =
    orden?.userstatus ?? orden?.Userstatus ?? orden?.UserStatus ?? "";
  const estatusCode =
    orden?.estatus_code ?? orden?.EstatusCode ??
    orden?.StatusCode ?? orden?.Status ?? "";

  return (
    extraerEstatus(userstatus).includes(ESTATUS_CARTA_NO_MANTTO) ||
    normalizarCodigo(estatusCode) === ESTATUS_CARTA_NO_MANTTO
  );
}

function getOrderId(orden) {
  return safeStr(
    orden?.orderid ?? orden?.Orderid ?? orden?.OrderId ?? orden?.OrderID,
  ).trim();
}

function getEquipment(orden) {
  return safeStr(
    orden?.equipment ?? orden?.Equipment ?? orden?.Equipo,
  ).trim();
}

function getDescription(orden) {
  return safeStr(
    orden?.nombre_orden ?? orden?.ShortText ??
    orden?.Description ?? orden?.Descripcion,
  ).trim();
}

function parseSapDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const txt = safeStr(value).trim();
  const match = txt.match(/\/Date\((-?\d+)(?:[+-]\d{4})?\)\//);
  if (match) {
    const d = new Date(Number(match[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{8}$/.test(txt)) {
    const d = new Date(
      Number(txt.slice(0, 4)),
      Number(txt.slice(4, 6)) - 1,
      Number(txt.slice(6, 8)),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(txt);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = parseSapDate(value);
  return d ? d.toLocaleDateString("es-MX") : "—";
}

function getStartDate(orden) {
  return orden?.startdate ?? orden?.StartDate ?? orden?.start_date ?? null;
}

function getFinishDate(orden) {
  return orden?.finishdate ?? orden?.FinishDate ?? orden?.finish_date ?? null;
}

function fechaYMD(year, month, day) {
  const y = String(year);
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangoDelMes(periodo) {
  const { year, month } = periodo;
  const ultimoDia = new Date(year, month + 1, 0).getDate();
  return {
    desde: fechaYMD(year, month, 1),
    hasta: fechaYMD(year, month, ultimoDia),
  };
}

function desplazarMes(periodo, cantidad) {
  const date = new Date(periodo.year, periodo.month + cantidad, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function mesActual() {
  const hoy = new Date();
  return { year: hoy.getFullYear(), month: hoy.getMonth() };
}

export default function NoMantenimientoIndex() {
  const { user } = useAuth();
  const { refresh } = useLocalSearchParams();

  const correo = useMemo(() => {
    return safeStr(
      user?.email || user?.correo || user?.upn ||
      user?.username || user?.userPrincipalName,
    ).trim();
  }, [user]);

  const [periodo, setPeriodo] = useState(mesActual);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allRows, setAllRows] = useState([]);
  const [q, setQ] = useState("");
  const [offline, setOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const periodoLabel = `${MESES[periodo.month]} ${periodo.year}`;

  // IMPORTANTE: la busqueda (q) NO forma parte de las dependencias.
  // Al escribir, solo se filtran resultados locales. No se consulta SAP.
  const fetchLista = useCallback(async () => {
    if (!correo) {
      setAllRows([]);
      setLoading(false);
      setErrorMessage("No se detectó el correo del usuario que inició sesión.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const { desde, hasta } = rangoDelMes(periodo);
      const online = await isOnline();
      setOffline(!online);

      console.log("[CARTA_NO_MANTTO] Consulta por servicio supervisor:", {
        desde,
        hasta,
        online,
      });

      // Mismo endpoint que ordenes del supervisor:
      // GET /api/ordenes/sap/list?start=...&end=...&mode=range&user=...
      // El servicio resuelve el usuario, token y almacenamiento en cache.
      const response = await fetchOrdenesSupervisor(desde, hasta, "range");
      const ordenes = Array.isArray(response)
        ? response
        : Array.isArray(response?.d?.results)
          ? response.d.results
          : Array.isArray(response?.results)
            ? response.results
            : [];

      const cartas = ordenes.filter(esCartaNoMantto);

      console.log("[CARTA_NO_MANTTO] Resultado:", {
        periodo: `${desde} / ${hasta}`,
        totalOrdenes: ordenes.length,
        cartas0600: cartas.length,
        origen: online ? "red o cache de respaldo" : "cache offline",
      });

      setAllRows(cartas);
    } catch (error) {
      console.error("[CARTA_NO_MANTTO] Error cargando ordenes:", error);
      setErrorMessage("No fue posible cargar las cartas de este periodo.");
      setAllRows([]);
      Alert.alert("Error", "No fue posible cargar las cartas de No Mantenimiento.");
    } finally {
      setLoading(false);
    }
  }, [correo, periodo.year, periodo.month]);

  // Carga inicial, cambio de mes y regreso con parametro refresh.
  useEffect(() => {
    fetchLista();
  }, [fetchLista, refresh]);

  const rows = useMemo(() => {
    const search = q.trim().toLowerCase();
    if (!search) return allRows;

    return allRows.filter((orden) => {
      const text = [
        getOrderId(orden),
        getEquipment(orden),
        getDescription(orden),
        safeStr(orden?.nombre_cliente ?? orden?.NombreCliente),
        ESTATUS_CARTA_NO_MANTTO_LABEL,
      ].join(" ").toLowerCase();

      return text.includes(search);
    });
  }, [allRows, q]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchLista();
    } finally {
      setRefreshing(false);
    }
  }, [fetchLista]);

  const openDetalle = (orden) => {
    const orderId = getOrderId(orden);
    if (!orderId) {
      Alert.alert("Error", "No se pudo determinar la orden.");
      return;
    }

    router.push({
      pathname: "/supervisor/no_mantenimiento/detalles",
      params: { id: orderId },
    });
  };

  const renderItem = ({ item }) => {
    const orderId = getOrderId(item);
    const startDate = formatDate(getStartDate(item));
    const finishDate = formatDate(getFinishDate(item));

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openDetalle(item)}
        activeOpacity={0.75}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.title}>Orden {orderId || "—"}</Text>
          <View style={styles.pillPending}>
            <Text style={styles.pillText}>{ESTATUS_CARTA_NO_MANTTO_LABEL}</Text>
          </View>
        </View>

        <Text style={styles.line}>
          <Text style={styles.label}>Equipo: </Text>
          {getEquipment(item) || "—"}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Texto: </Text>
          {getDescription(item) || "—"}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Estatus: </Text>
          {ESTATUS_CARTA_NO_MANTTO_LABEL}
        </Text>

        <Text style={styles.lineSmall}>
          <Text style={styles.label}>Inicio: </Text>
          {startDate}
          {"  ·  "}
          <Text style={styles.label}>Fin: </Text>
          {finishDate}
        </Text>

        <Text style={styles.lineSmall}>
          <Text style={styles.label}>Supervisor: </Text>
          {correo || "—"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Carta No Mantto" />

      <View style={styles.content}>
        <View style={styles.searchBox}>
          <Ionicons
            name="search"
            size={18}
            color={COLORS.text}
            style={{ marginRight: 6 }}
          />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por orden, equipo o texto..."
            placeholderTextColor="#8A96A3"
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
          />
          <TouchableOpacity
            onPress={onPullRefresh}
            style={styles.searchBtn}
            disabled={!correo || loading}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.periodBox}>
          <TouchableOpacity
            onPress={() => setPeriodo((prev) => desplazarMes(prev, -1))}
            style={styles.periodButton}
            accessibilityLabel="Mes anterior"
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>

          <View style={styles.periodCenter}>
            <Text style={styles.periodLabel}>Periodo de órdenes</Text>
            <Text style={styles.periodValue}>{periodoLabel}</Text>
          </View>

          <TouchableOpacity
            onPress={() => setPeriodo((prev) => desplazarMes(prev, 1))}
            style={styles.periodButton}
            accessibilityLabel="Mes siguiente"
          >
            <Ionicons name="chevron-forward" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoText}>
            {allRows.length} carta{allRows.length === 1 ? "" : "s"}
            {q.trim() ? ` · ${rows.length} coincidencia${rows.length === 1 ? "" : "s"}` : ""}
          </Text>
          <TouchableOpacity onPress={() => setPeriodo(mesActual())}>
            <Text style={styles.currentMonth}>Mes actual</Text>
          </TouchableOpacity>
        </View>

        {offline ? (
          <Text style={styles.note}>
            Sin conexión: se muestran datos guardados, si existen para este mes.
          </Text>
        ) : null}

        {errorMessage ? (
          <Text style={styles.noteError}>{errorMessage}</Text>
        ) : null}

        {loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Cargando cartas…</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(orden, idx) => getOrderId(orden) || `carta-${idx}`}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullRefresh}
                colors={[COLORS.accent]}
              />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {q.trim()
                  ? "No se encontraron cartas con ese texto en el mes seleccionado."
                  : "No hay cartas de No Mantenimiento disponibles para este mes. Puedes cambiar de mes con las flechas."}
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },
  content: {
    flex: 1,
    padding: 14,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: COLORS.title,
    fontSize: 13,
  },
  searchBtn: {
    backgroundColor: COLORS.accent,
    padding: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  periodBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 8,
    backgroundColor: COLORS.cardBg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
  },
  periodButton: {
    width: 40,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  periodCenter: {
    flex: 1,
    alignItems: "center",
  },
  periodLabel: {
    fontSize: 11,
    color: COLORS.text,
  },
  periodValue: {
    fontSize: 15,
    color: COLORS.title,
    fontWeight: "800",
    marginTop: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  infoText: {
    color: COLORS.text,
    fontSize: 12,
  },
  currentMonth: {
    color: COLORS.accent,
    fontWeight: "700",
    fontSize: 12,
  },
  note: {
    color: "#805600",
    backgroundColor: "#FFF5D6",
    padding: 9,
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 12,
  },
  noteError: {
    color: "#AF2733",
    paddingHorizontal: 4,
    paddingBottom: 8,
    fontSize: 12,
  },
  loadingBox: {
    paddingTop: 24,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    color: COLORS.text,
  },
  listContent: {
    paddingBottom: 90,
  },
  emptyText: {
    color: COLORS.text,
    textAlign: "center",
    marginTop: 20,
    lineHeight: 21,
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.title,
    flex: 1,
    paddingRight: 8,
  },
  line: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 13,
  },
  lineSmall: {
    marginTop: 6,
    color: COLORS.text,
    fontSize: 12,
  },
  label: {
    fontWeight: "900",
    color: COLORS.title,
  },
  pillPending: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FFF3CD",
  },
  pillText: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.title,
  },
});