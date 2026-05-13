// app/ordenes/[id]/secciones/EncabezadoDetalleOrden.js
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * EncabezadoDetalleOrden
 *
 * Reglas actuales de estatus:
 * - Sin código: Sin empezar
 * - 0100: PENDIENTE
 * - 0200: EN PROCESO
 * - 0300: FINALIZADA
 * - 0400: PENDIENTE DE FIRMA
 * - 0600: Carta No Mantto
 *
 * Funciones:
 * - Card con #Orden + tipo + badge estatus
 * - Banner Carta No Mantto cuando statusCode === "0600"
 * - Banner Operaciones bloqueadas si no hay check-in
 * - Banner Orden finalizada cuando statusCode === "0300"
 * - Banner Pendiente de firma cuando statusCode === "0400"
 * - Panel datos orden
 * - Botón ver materiales asignados
 * - Texto "Operaciones asignadas"
 */

function normalizeCode(code) {
  if (code === null || code === undefined) return "";

  const s = String(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;

  return String(n).padStart(4, "0");
}

function resolveHeaderStatusLabel(code, fallback = "") {
  const c = normalizeCode(code);

  if (!c) return "Sin empezar";
  if (c === "0100") return "PENDIENTE";
  if (c === "0200") return "EN PROCESO";
  if (c === "0300") return "FINALIZADA";
  if (c === "0400") return "PENDIENTE DE FIRMA";
  if (c === "0600") return "Carta No Mantto";

  return String(fallback || c || "—").trim();
}

const Row = ({ label, value, styles, formatValueForRow }) => {
  const text =
    typeof formatValueForRow === "function"
      ? formatValueForRow(value)
      : value == null
        ? "—"
        : String(value);

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{text}</Text>
    </View>
  );
};

export default function EncabezadoDetalleOrden({
  orden,
  id,
  styles,
  FIORI,
  estatusColor,
  isNoMant,
  checkinDone,
  isOrderFinished,
  direccionValor,
  allMaterialsLen,
  fmtDMY,
  formatValueForRow,
  onAbrirPdfNoMant,
  onVerMaterialesOrden,
  orderStartedAtMs,
  orderFinishedAtMs,
  orderElapsedMs,
  fmtDateTimeLocal,
  msToHMS,
  statusCode: statusCodeProp,
  statusLabel: statusLabelProp,
}) {
  const statusCode = normalizeCode(
    statusCodeProp || orden?.estatus_code || orden?.userstatus || "",
  );

  const statusLabel = resolveHeaderStatusLabel(
    statusCode,
    statusLabelProp || orden?.estatus_label || orden?.estatus || orden?.status,
  );

  /**
   * Regla principal:
   * Carta No Mantto = únicamente 0600.
   *
   * Dejamos `isNoMant` como apoyo temporal por si el padre todavía trae cache viejo
   * con estatus_tipo = NO_MANTENIMIENTO.
   */
  const isCartaNoMantto = statusCode === "0600" || !!isNoMant;
  const isPendingFirma0400 = statusCode === "0400";
  const isFinished0300 = statusCode === "0300" || !!isOrderFinished;

  const correoCliente =
    String(
      orden?.cliente_email ||
        orden?.email_cliente ||
        orden?.mail_cliente ||
        orden?.Mail1 ||
        "",
    ).trim() || null;

  return (
    <>
      <View style={styles.headerBox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>
            #{orden?.Orderid || id || ""} · {orden?.order_type || "—"}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: estatusColor }]}>
          <Text style={styles.statusBadgeText}>{statusLabel}</Text>
        </View>
      </View>

      {isCartaNoMantto && (
        <View style={styles.noMantBanner}>
          <Ionicons
            name="document-text-outline"
            size={22}
            color={FIORI.text}
            style={{ marginRight: 10 }}
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.noMantTitle}>
              Orden marcada como "Carta No Mantto"
            </Text>

            <Text style={styles.noMantText}>
              Esta orden tiene el estatus 0600. Las operaciones se muestran solo
              como referencia y no se pueden iniciar.
            </Text>

            {typeof onAbrirPdfNoMant === "function" && (
              <TouchableOpacity
                style={[styles.btnNoMantBanner, { marginTop: 10 }]}
                onPress={onAbrirPdfNoMant}
                activeOpacity={0.9}
              >
                <Text style={styles.btnNoMantBannerText}>Ver carta PDF</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {!isCartaNoMantto && isPendingFirma0400 && (
        <View style={styles.noMantBanner}>
          <Ionicons
            name="create-outline"
            size={22}
            color={FIORI.text}
            style={{ marginRight: 10 }}
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.noMantTitle}>Orden pendiente de firma</Text>

            <Text style={styles.noMantText}>
              Esta orden quedó en estatus 0400. Puedes continuar el proceso para
              capturar firma y finalizar.
            </Text>
          </View>
        </View>
      )}

      {!isCartaNoMantto &&
        statusCode !== "0200" &&
        !checkinDone &&
        !isFinished0300 && (
          <View style={styles.noMantBanner}>
            <Ionicons
              name="lock-closed-outline"
              size={22}
              color={FIORI.text}
              style={{ marginRight: 10 }}
            />

            <View style={{ flex: 1 }}>
              <Text style={styles.noMantTitle}>Operaciones bloqueadas</Text>

              <Text style={styles.noMantText}>
                Primero debes hacer Check-in y el formulario TBMK/Y para
                habilitar el inicio de la orden.
              </Text>
            </View>
          </View>
        )}

      {isFinished0300 && !isCartaNoMantto && (
        <View style={styles.noMantBanner}>
          <Ionicons
            name="checkmark-done-outline"
            size={22}
            color={FIORI.text}
            style={{ marginRight: 10 }}
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.noMantTitle}>Orden finalizada</Text>

            <Text style={styles.noMantText}>
              Esta orden tiene el estatus 0300. Las operaciones se muestran solo
              como referencia y ya no se pueden modificar.
            </Text>
          </View>
        </View>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Datos de la orden</Text>

        <Row
          label="Equipo"
          value={orden?.equipment}
          styles={styles}
          formatValueForRow={formatValueForRow}
        />

        <Row
          label="Correo del cliente"
          value={correoCliente}
          styles={styles}
          formatValueForRow={formatValueForRow}
        />

        <Row
          label="Dirección"
          value={direccionValor}
          styles={styles}
          formatValueForRow={formatValueForRow}
        />

        <Row
          label="Inicio"
          value={typeof fmtDMY === "function" ? fmtDMY(orden?.start_date) : "—"}
          styles={styles}
          formatValueForRow={formatValueForRow}
        />

        <Row
          label="Fin"
          value={
            typeof fmtDMY === "function" ? fmtDMY(orden?.finish_date) : "—"
          }
          styles={styles}
          formatValueForRow={formatValueForRow}
        />

        {Number.isFinite(orderStartedAtMs) ? (
          <Row
            label="Inicio local"
            value={
              typeof fmtDateTimeLocal === "function"
                ? fmtDateTimeLocal(orderStartedAtMs)
                : "—"
            }
            styles={styles}
            formatValueForRow={formatValueForRow}
          />
        ) : null}

        {Number.isFinite(orderFinishedAtMs) ? (
          <Row
            label="Fin local"
            value={
              typeof fmtDateTimeLocal === "function"
                ? fmtDateTimeLocal(orderFinishedAtMs)
                : "—"
            }
            styles={styles}
            formatValueForRow={formatValueForRow}
          />
        ) : null}

        {Number.isFinite(orderElapsedMs) ? (
          <Row
            label="Tiempo transcurrido"
            value={
              typeof msToHMS === "function" ? msToHMS(orderElapsedMs) : "—"
            }
            styles={styles}
            formatValueForRow={formatValueForRow}
          />
        ) : null}

        {allMaterialsLen > 0 && (
          <TouchableOpacity
            style={styles.btnSeeMaterials}
            onPress={onVerMaterialesOrden}
            activeOpacity={0.9}
          >
            <Ionicons name="cube-outline" size={16} color="#fff" />
            <Text style={styles.btnSeeMaterialsText}>
              Ver materiales asignados
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionKicker}>Operaciones asignadas</Text>
    </>
  );
}
