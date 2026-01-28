// app/ordenes/[id]/secciones/PieDetalleOrden.js
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function PieDetalleOrden({
  styles,
  FIORI,

  isNoMant,
  userRolId,

  finishingOrder,
  onFinalizarOrden,

  statusCode,
}) {
  if (isNoMant) return null;

  const status = String(statusCode || "").trim();

  // 🔹 NUEVAS REGLAS
  const isSinEmpezar = !status;          // Sin código
  const isPendiente0100 = status === "0100";

  // 🔹 Ya finalizadas (no mostrar)
  const isFinalizadaReal = status === "0300" || status === "0500";

  // 🔹 Solo técnico
  if (userRolId !== 3) return null;

  // 🔹 Ocultar botón en estos casos
  if (isFinalizadaReal || isSinEmpezar || isPendiente0100) return null;

  const finishLabel = finishingOrder
    ? "Preparando…"
    : status === "0400"
    ? "Pendiente de firma (continuar)"
    : "Finalizar orden";

  return (
    <View style={{ marginTop: 4, marginBottom: 24 }}>
      <TouchableOpacity
        style={[styles.btnFinishOrder, finishingOrder && { opacity: 0.7 }]}
        activeOpacity={0.9}
        onPress={onFinalizarOrden}
        disabled={finishingOrder}
      >
        <Ionicons name="flag-outline" size={18} color="#fff" />
        <Text style={styles.btnFinishOrderText}>{finishLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}
