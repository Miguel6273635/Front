// app/tecnico/no_mantenimiento/index.js
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
import { useOrdenesTecnico } from "../../../src/context/OrdenesTecnicoContext";
import { loadOrdenTecnicoDetail } from "../../../src/offline/ordenesTecnicoCache";

/* ===================== Utils ===================== */
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

const safeStr = (v) => (v == null ? "" : String(v));

const parseSapDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value).trim();
  if (!text) return null;

  const sapMatch = text.match(/\/Date\((-?\d+)(?:[+-]\d+)?\)\//);
  if (sapMatch) {
    const milliseconds = Number(sapMatch[1]);
    if (!Number.isFinite(milliseconds)) return null;

    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));

    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
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

// Carta No Mantto únicamente se identifica con 0600.
function isCartaNoManttoByUserstatus(userstatusRaw, estatusCodeRaw) {
  const codes = extractStatusCodes(userstatusRaw);
  const apiCode = normalizeCode(estatusCodeRaw);

  return (
    codes.includes(ESTATUS_CARTA_NO_MANTTO) ||
    apiCode === ESTATUS_CARTA_NO_MANTTO
  );
}

function formatDateTime(value) {
  const date = parseSapDate(value);
  if (!date) return "—";

  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function mergeRowsWithCachedDetails(items = []) {
  const source = Array.isArray(items) ? items : [];

  return Promise.all(
    source.map(async (item) => {
      const orderId = safeStr(
        item?.Orderid ||
          item?.OrderId ||
          item?.OrderID ||
          item?.orderid,
      ).trim();

      if (!orderId) return item;

      try {
        const cached = await loadOrdenTecnicoDetail(orderId);
        const detail = cached?.data;

        if (!detail || typeof detail !== "object") return item;

        return {
          ...detail,
          ...item,
          Orderid:
            item?.Orderid ||
            item?.OrderId ||
            item?.OrderID ||
            item?.orderid ||
            detail?.Orderid ||
            detail?.OrderId ||
            detail?.orderid ||
            orderId,
          equipment:
            item?.equipment ||
            item?.Equipment ||
            item?.EQUIPMENT ||
            detail?.equipment ||
            detail?.Equipment ||
            detail?.EQUIPMENT ||
            "",
          start_date:
            item?.start_date ||
            item?.StartDate ||
            item?.startDate ||
            item?.BasicStartDate ||
            item?.BasicStart ||
            detail?.start_date ||
            detail?.StartDate ||
            detail?.startDate ||
            detail?.BasicStartDate ||
            detail?.BasicStart ||
            "",
          finish_date:
            item?.finish_date ||
            item?.FinishDate ||
            item?.finishDate ||
            item?.BasicFinDate ||
            item?.BasicFinish ||
            detail?.finish_date ||
            detail?.FinishDate ||
            detail?.finishDate ||
            detail?.BasicFinDate ||
            detail?.BasicFinish ||
            "",
        };
      } catch (error) {
        console.log(
          "[NO MANTENIMIENTO] No se pudo leer detalle guardado:",
          orderId,
          error?.message || error,
        );
        return item;
      }
    }),
  );
}

/* ===================== Screen ===================== */
export default function TecnicoNoMantenimientoIndex() {
  const { user } = useAuth();
  const {
    ordenes: ordenesCompartidas,
    loadingInitial: loading,
    refreshing,
    loadLocal,
    refresh: refreshCentral,
  } = useOrdenesTecnico();

  const correo = useMemo(() => {
    return safeStr(
      user?.email || user?.correo || user?.upn || user?.username,
    ).trim();
  }, [user]);

  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  const params = useLocalSearchParams();
  const { refresh: refreshParam } = params;

  const applySharedLista = useCallback(async (data = []) => {
      if (!correo) {
        setRows([]);
        return [];
      }

      const source = await mergeRowsWithCachedDetails(
        Array.isArray(data) ? data : [],
      );
      const filtradas = source.filter((it) => {
        const us =
          it?.userstatus ||
          it?.Userstatus ||
          it?.UserStatus ||
          it?.UserStText ||
          "";
        const estatusCode =
          it?.estatus_code ||
          it?.EstatusCode ||
          it?.StatusCode ||
          it?.Status ||
          "";

        return isCartaNoManttoByUserstatus(us, estatusCode);
      });

      const s = q.trim().toLowerCase();

      const buscadas = !s
        ? filtradas
        : filtradas.filter((it) => {
            const order = safeStr(
              it?.Orderid || it?.OrderId || it?.OrderID || it?.orderid,
            ).toLowerCase();

            const equip = safeStr(
              it?.equipment || it?.Equipment || it?.EQUIPMENT,
            ).toLowerCase();
            const text = safeStr(
              it?.ShortText || it?.short_text || it?.shortText,
            ).toLowerCase();
            const us = safeStr(
              it?.userstatus ||
                it?.Userstatus ||
                it?.UserStatus ||
                it?.UserStText,
            ).toLowerCase();

            return (
              order.includes(s) ||
              equip.includes(s) ||
              text.includes(s) ||
              us.includes(s) ||
              ESTATUS_CARTA_NO_MANTTO_LABEL.toLowerCase().includes(s)
            );
          });

      setRows(buscadas);
      return buscadas;
  }, [q, correo]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const prepared = await applySharedLista(ordenesCompartidas);
        if (cancelled) return prepared;
      } catch (error) {
        console.log(
          "[NO MANTENIMIENTO] Error preparando la lista:",
          error?.message || error,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySharedLista, ordenesCompartidas]);

  const reloadListaLocal = useCallback(async () => {
    const cached = await loadLocal();
    return applySharedLista(cached?.data || []);
  }, [applySharedLista, loadLocal]);

  const refreshLista = useCallback(async () => {
    try {
      const result = await refreshCentral();
      await applySharedLista(result?.cached?.data || []);
      return result;
    } catch (e) {
      console.error("Error actualizando Carta No Mantto:", e?.message || e);
      await reloadListaLocal();
      return { ok: false, error: e };
    }
  }, [applySharedLista, refreshCentral, reloadListaLocal]);

  useEffect(() => {
    if (refreshParam) reloadListaLocal();
  }, [refreshParam, reloadListaLocal]);

  const onPullRefresh = refreshLista;

  const openDetalle = (item) => {
    const orderId = safeStr(
      item?.Orderid || item?.OrderId || item?.OrderID || item?.orderid,
    ).trim();

    if (!orderId) {
      Alert.alert("Error", "No se pudo determinar la orden.");
      return;
    }

    router.push({
      pathname: "/tecnico/ordenes/[id]",
      params: { id: orderId },
    });
  };

  const renderItem = ({ item }) => {
    const orderId = safeStr(
      item?.Orderid || item?.OrderId || item?.OrderID || item?.orderid,
    );

    const equipment =
      item?.equipment || item?.Equipment || item?.EQUIPMENT || "—";

    const startLabel = formatDateTime(
      item?.start_date ||
        item?.StartDate ||
        item?.startDate ||
        item?.BasicStartDate ||
        item?.BasicStart,
    );

    const finishLabel = formatDateTime(
      item?.finish_date ||
        item?.FinishDate ||
        item?.finishDate ||
        item?.BasicFinDate ||
        item?.BasicFinish,
    );

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openDetalle(item)}
        activeOpacity={0.75}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.title}>Orden {orderId || "—"}</Text>

          <View style={styles.pill}>
            <Text style={styles.pillText}>{ESTATUS_CARTA_NO_MANTTO_LABEL}</Text>
          </View>
        </View>

        <Text style={styles.line}>
          <Text style={styles.label}>Equipo: </Text>
          {safeStr(equipment)}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Texto: </Text>
          {safeStr(
            item?.ShortText || item?.short_text || item?.shortText || "—",
          )}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Estatus: </Text>
          {ESTATUS_CARTA_NO_MANTTO_LABEL}
        </Text>

        <Text style={[styles.line, { fontSize: 12, marginTop: 6 }]}>
          <Text style={styles.label}>Inicio: </Text>
          {startLabel}
          {"  ·  "}
          <Text style={styles.label}>Fin: </Text>
          {finishLabel}
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
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={{ marginTop: 8, color: COLORS.text }}>
              Cargando…
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(it, idx) =>
              safeStr(it?.Orderid || it?.OrderId || it?.OrderID || idx)
            }
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 90 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullRefresh}
              />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No hay órdenes de Carta No Mantto.
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}

/* ===================== Styles ===================== */
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

  loadingBox: {
    paddingTop: 24,
    alignItems: "center",
  },

  emptyText: {
    color: COLORS.text,
    textAlign: "center",
    marginTop: 20,
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

  label: {
    fontWeight: "900",
    color: COLORS.title,
  },

  pill: {
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