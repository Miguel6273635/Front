// app/ordenes/[id]/secciones/PieDetalleOrden.js
import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function PieDetalleOrden({
  styles,
  FIORI,

  isNoMant,
  userRolId,

  finishingOrder,
  onFinalizarOrden,

  statusCode,

  // ✅ finalize mode
  finalizeMode = false,
  onCancelarFinalizacion,

  // ✅ acciones para 0400
  onGuardarPendiente,
  onAgregarFirma,
  hasSelectedOps = false,
}) {
  if (isNoMant) return null;

  const status = String(statusCode || "").trim();

  const isSinEmpezar = !status;
  const isPendiente0100 = status === "0100";

  // ✅ Finalizada REAL (no se puede)
  const isFinalizadaReal = status === "0300" || status === "0500";

  // Solo técnico
  if (userRolId !== 3) return null;

  // Bloqueos
  if (isFinalizadaReal || isSinEmpezar || isPendiente0100) return null;

  const confirmCancel = () => {
    Alert.alert(
      "Cancelar finalización",
      "Se quitarán los checks marcados. El cronómetro seguirá normal. ¿Deseas continuar?",
      [
        { text: "No", style: "cancel" },
        { text: "Sí, cancelar", style: "destructive", onPress: () => onCancelarFinalizacion?.() },
      ]
    );
  };

  // ✅ Si finalizeMode está ON, mostramos acciones dobles
  if (finalizeMode) {
    return (
      <View style={{ marginTop: 8, marginBottom: 24, gap: 10 }}>
        {/* Guardar pendiente (0400) */}
        <TouchableOpacity
          style={[
            styles.btnFinishOrder,
            (!hasSelectedOps || finishingOrder) && { opacity: 0.65 },
            { backgroundColor: FIORI.brand },
          ]}
          activeOpacity={0.9}
          onPress={onGuardarPendiente}
          disabled={!hasSelectedOps || finishingOrder}
        >
          <Ionicons name="save-outline" size={18} color="#fff" />
          <Text style={styles.btnFinishOrderText}>Guardar pendiente de firma (0400)</Text>
        </TouchableOpacity>

        {/* Agregar firma */}
        <TouchableOpacity
          style={[
            styles.btnFinishOrder,
            (!hasSelectedOps || finishingOrder) && { opacity: 0.65 },
            { backgroundColor: "#0B8457" },
          ]}
          activeOpacity={0.9}
          onPress={onAgregarFirma}
          disabled={!hasSelectedOps || finishingOrder}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.btnFinishOrderText}>Agregar firma del cliente</Text>
        </TouchableOpacity>

        {/* ✅ Cancelar finalize mode (NO mostrar si ya está en 0400) */}
        {status !== "0400" && (
          <TouchableOpacity
            style={[
              styles.btnFinishOrder,
              { backgroundColor: FIORI.err },
              finishingOrder && { opacity: 0.7 },
            ]}
            activeOpacity={0.9}
            onPress={confirmCancel}
            disabled={finishingOrder}
          >
            <Ionicons name="close-circle-outline" size={18} color="#fff" />
            <Text style={styles.btnFinishOrderText}>Cancelar finalización</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // finalizeMode OFF -> botón principal para entrar
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
