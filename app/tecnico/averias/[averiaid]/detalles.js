// app/tecnico/averias/[averiaid]/detalles.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  chipBg: "#EAF3FF",
};

const parseSapDate = (value) => {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/\/Date\((\d+)\)\//);
  if (m?.[1]) {
    const ms = Number(m[1]);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (value) => {
  const d = parseSapDate(value);
  if (!d) return "—";
  return d.toLocaleDateString();
};

export default function DetallesAveriaTecnico() {
  const { averiaid } = useLocalSearchParams();

  const [header, setHeader] = useState(null);
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDetalle = async () => {
    try {
      setLoading(true);

      const id = String(averiaid || "").trim();
      if (!id || id === "undefined" || id === "null") {
        setHeader(null);
        setItem(null);
        return;
      }

      // ✅ Header (opcional, pero útil para mostrar info)
      const resHdr = await api.get(
        `/api/odata/ZCS_GET_NOTIFICATION_SRV/NotificationHeaderSet('${encodeURIComponent(id)}')`,
        { params: { $format: "json" } }
      );
      const hdr = resHdr?.data?.d ?? resHdr?.data ?? null;

      // ✅ ItemsSet (tu URL exacta)
      const resItems = await api.get(
        `/api/odata/ZCS_GET_NOTIFICATION_SRV/NotificationHeaderSet('${encodeURIComponent(id)}')/NotificationItemsSet`,
        { params: { $format: "json" } }
      );

      const itemsRaw = resItems?.data;
      const items = itemsRaw?.d?.results ?? itemsRaw?.value ?? [];
      const first = items?.[0] ?? null;

      setHeader(hdr);
      setItem(first);
    } catch (err) {
      console.error("Error detalle técnico:", err?.response?.data || err);
      Alert.alert("Error", "No se pudo cargar el detalle del aviso.");
      setHeader(null);
      setItem(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (averiaid) fetchDetalle();
  }, [averiaid]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de avería" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Cargando detalle…</Text>
        </View>
      </View>
    );
  }

  if (!header) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de avería" />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16 }}>
          <Text style={{ color: COLORS.text, textAlign: "center" }}>
            No se encontró información para el aviso #{String(averiaid || "")}
          </Text>

          <TouchableOpacity onPress={fetchDetalle} style={[styles.btnSecondary, { marginTop: 14 }]}>
            <Text style={styles.btnSecondaryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const notifNo = header?.NotifNo || averiaid;
  const shortText = header?.ShortText || "";
  const equipment = header?.Equipment || "";
  const functLoc = header?.FunctLoc || "";
  const notifDate = header?.NotifDate || header?.CreatedOn || null;

  // Item fields comunes
  const descript = item?.Descript || "";
  const damage = { DCatTyp: item?.DCatTyp, DCodegrp: item?.DCodegrp, DCode: item?.DCode };
  const part = { DlCatTyp: item?.DlCatTyp, DlCodegrp: item?.DlCodegrp, DlCode: item?.DlCode };

  return (
    <View style={styles.container}>
      <Header title={`Aviso ${notifNo}`} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver a la lista</Text>
        </TouchableOpacity>

        {/* ===== resumen ===== */}
        <View style={styles.cardHighlight}>
          <View style={styles.chipRow}>
            {equipment ? (
              <View style={styles.chip}>
                <Ionicons name="hardware-chip-outline" size={14} color={COLORS.accent} style={{ marginRight: 4 }} />
                <Text style={styles.chipText}>{equipment}</Text>
              </View>
            ) : null}

            {functLoc ? (
              <View style={styles.chip}>
                <Ionicons name="pin-outline" size={14} color={COLORS.accent} style={{ marginRight: 4 }} />
                <Text style={styles.chipText} numberOfLines={1}>{functLoc}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.mainTitle}>{shortText || "Sin descripción"}</Text>
          <Text style={styles.subtitle}>Fecha: {formatDate(notifDate)}</Text>
        </View>

        {/* ===== item ===== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Detalle (NotificationItemsSet)</Text>

          {descript ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={styles.infoLabel}>Descripción</Text>
              <Text style={styles.infoValue}>{descript}</Text>
            </View>
          ) : (
            <Text style={{ color: COLORS.text }}>Sin ítems / sin descripción.</Text>
          )}

          <View style={{ marginTop: 6 }}>
            <Text style={styles.infoLabel}>Daño</Text>
            <View style={styles.chipRowWrap}>
              <View style={styles.chip}><Text style={styles.chipText}>Tipo: {damage.DCatTyp || "—"}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Grupo: {damage.DCodegrp || "—"}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Código: {damage.DCode || "—"}</Text></View>
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <Text style={styles.infoLabel}>Parte dañada</Text>
            <View style={styles.chipRowWrap}>
              <View style={styles.chip}><Text style={styles.chipText}>Tipo: {part.DlCatTyp || "—"}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Grupo: {part.DlCodegrp || "—"}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Código: {part.DlCode || "—"}</Text></View>
            </View>
          </View>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 16, paddingBottom: 24 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 8, color: COLORS.text, fontSize: 13 },

  backRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, paddingVertical: 4 },
  backText: { marginLeft: 4, color: COLORS.accent, fontWeight: "600", fontSize: 13 },

  cardHighlight: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  mainTitle: { fontSize: 16, fontWeight: "700", color: COLORS.title, marginBottom: 4 },
  subtitle: { fontSize: 13, color: COLORS.text },

  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8, gap: 6 },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.chipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "100%",
  },
  chipText: { fontSize: 11, color: COLORS.title },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: COLORS.title, marginBottom: 10 },
  infoLabel: { fontSize: 11, color: COLORS.text, opacity: 0.8, marginBottom: 2 },
  infoValue: { fontSize: 14, color: COLORS.title, fontWeight: "600" },

  btnSecondary: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  btnSecondaryText: { color: COLORS.accent, fontWeight: "800", fontSize: 13 },
});
