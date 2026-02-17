// app/ordenes/[id]/secciones/EncabezadoDetalleOrden.js
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * EncabezadoDetalleOrden
 * - Card con #Orden + tipo + badge estatus
 * - Banner No mantenimiento
 * - Banner Operaciones bloqueadas (si no hay checkin)
 * - Banner Orden finalizada real (0300/0500) -> referencia
 * - Banner Pendiente de firma (0400) -> continuar
 * - Panel solicitante (partners)
 * - Panel datos orden (equipo, correo, dirección, inicio, fin)
 * - Botón ver materiales asignados
 * - Texto "Operaciones asignadas"
 */

const Row = ({ label, value, styles, formatValueForRow }) => {
  const text = formatValueForRow(value);
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

  // UI / estilos
  styles,
  FIORI,

  // derivados
  estatusColor,
  isNoMant,
  checkinDone,
  isOrderFinished, // acá le pasamos isOrderFinishedReal desde el padre

  // valores listos
  direccionValor,
  allMaterialsLen,

  // helpers
  fmtDMY,
  formatValueForRow,

  // callbacks
  onAbrirPdfNoMant,
  onVerMaterialesOrden,
  orderStartedAtMs, // (opcional, por si lo quieres mostrar aquí)
  orderFinishedAtMs, // (opcional, por si lo quieres mostrar aquí)
}) {
  const statusCode = String(orden?.estatus_code || orden?.userstatus || "").trim();
  const isPendingFirma0400 = statusCode === "0400";

  // ✅ correo ya guardado por el padre en orden.cliente_email
  const correoCliente =
    String(
      orden?.cliente_email ||
        orden?.email_cliente ||
        orden?.mail_cliente ||
        orden?.Mail1 ||
        ""
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
          <Text style={styles.statusBadgeText}>
            {orden?.estatus_label || orden?.estatus_code || "—"}
          </Text>
        </View>
      </View>

      {isNoMant && (
        <View style={styles.noMantBanner}>
          <Ionicons
            name="document-text-outline"
            size={22}
            color={FIORI.text}
            style={{ marginRight: 10 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.noMantTitle}>Orden marcada como "No mantenimiento"</Text>
            <Text style={styles.noMantText}>
              Las operaciones se muestran solo para referencia y no se pueden iniciar.
            </Text>

            {/* Si tuvieras botón para PDF no mantenimiento en header */}
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

      {/* ✅ Pendiente de firma (0400) NO es finalizada real */}
      {!isNoMant && isPendingFirma0400 && (
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
              Esta orden quedó en estatus 0400 (pendiente de firma). Puedes continuar el proceso
              para capturar firma y finalizar.
            </Text>
          </View>
        </View>
      )}

      {!isNoMant && !checkinDone && !isOrderFinished && (
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
              Primero debes hacer Check-in y el formulario TBMK/Y para habilitar el inicio de la orden.
            </Text>
          </View>
        </View>
      )}

      {isOrderFinished && !isNoMant && (
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
              Las operaciones se muestran solo como referencia y ya no se pueden modificar.
            </Text>
          </View>
        </View>
      )}

      {orden?.partners?.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Datos del solicitante</Text>
          {orden.partners.map((p, idx) => (
            <Text key={idx} style={styles.value}>
              <Text style={styles.labelInline}>Rol: </Text>
              {p.role} <Text style={styles.labelInline}>· Partner: </Text>
              {p.partner}
            </Text>
          ))}
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

        {/* ✅ NUEVO: Correo del cliente */}
        <Row
          label="Correo"
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
          value={fmtDMY(orden?.start_date)}
          styles={styles}
          formatValueForRow={formatValueForRow}
        />

        <Row
          label="Fin"
          value={fmtDMY(orden?.finish_date)}
          styles={styles}
          formatValueForRow={formatValueForRow}
        />

        {/* (Opcional) Si quieres mostrar inicio/fin LOCAL del cronómetro:
        {orderStartedAtMs ? (
          <Row
            label="Inicio (local)"
            value={new Date(orderStartedAtMs).toLocaleString()}
            styles={styles}
            formatValueForRow={formatValueForRow}
          />
        ) : null}
        {orderFinishedAtMs ? (
          <Row
            label="Fin (local)"
            value={new Date(orderFinishedAtMs).toLocaleString()}
            styles={styles}
            formatValueForRow={formatValueForRow}
          />
        ) : null}
        */}

        {allMaterialsLen > 0 && (
          <TouchableOpacity
            style={styles.btnSeeMaterials}
            onPress={onVerMaterialesOrden}
            activeOpacity={0.9}
          >
            <Ionicons name="cube-outline" size={16} color="#fff" />
            <Text style={styles.btnSeeMaterialsText}>Ver materiales asignados</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionKicker}>Operaciones asignadas</Text>
    </>
  );
}
