// app/ordenes/[id]/secciones/EncabezadoDetalleOrden.js
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FormatosOrdenMultiSelect from "./FormatosOrdenMultiSelect";

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

function formatText(value, formatValueForRow) {
  if (typeof formatValueForRow === "function") return formatValueForRow(value);
  if (value == null || value === "") return "—";
  return String(value);
}

const MiniInfo = ({ icon, label, value, FIORI, formatValueForRow }) => (
  <View style={local.miniInfo}>
    <View style={[local.miniIcon, { backgroundColor: FIORI.brandSoft }]}>
      <Ionicons name={icon} size={16} color={FIORI.brand} />
    </View>

    <View style={{ flex: 1 }}>
      <Text style={local.miniLabel}>{label}</Text>
      <Text style={local.miniValue} numberOfLines={1}>
        {formatText(value, formatValueForRow)}
      </Text>
    </View>
  </View>
);

const Banner = ({ icon, title, text, FIORI, children }) => (
  <View style={local.banner}>
    <View style={[local.bannerIcon, { backgroundColor: FIORI.brandSoft }]}>
      <Ionicons name={icon} size={20} color={FIORI.brand} />
    </View>

    <View style={{ flex: 1 }}>
      <Text style={local.bannerTitle}>{title}</Text>
      <Text style={local.bannerText}>{text}</Text>
      {children}
    </View>
  </View>
);

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
  onVerMaterialesOrden,
  orderStartedAtMs,
  orderFinishedAtMs,
  orderElapsedMs,
  fmtDateTimeLocal,
  msToHMS,
  statusCode: statusCodeProp,
  statusLabel: statusLabelProp,
  onOpenTbmky,
  onOpenNoMantto,
}) {
  const statusCode = normalizeCode(
    statusCodeProp || orden?.estatus_code || orden?.userstatus || "",
  );

  const statusLabel = resolveHeaderStatusLabel(
    statusCode,
    statusLabelProp || orden?.estatus_label || orden?.estatus || orden?.status,
  );

  const isCartaNoMantto = statusCode === "0600" || !!isNoMant;
  const isPendingFirma0400 = statusCode === "0400";
  const isFinished0300 = statusCode === "0300" || !!isOrderFinished;

  // Acciones disponibles según el flujo actual de la orden.
  // 0100: ya hizo check-in y puede continuar con TBM/KY o Carta No Mantto.
  // 0200: el TBM/KY ya fue realizado, pero se mantiene acceso al formulario.
  const canOpenTbmky = statusCode === "0100" || statusCode === "0200";
  const canOpenNoMantto = statusCode === "0100";
  const showServiceActions = canOpenTbmky || canOpenNoMantto;

  const correoCliente =
    String(
      orden?.cliente_email ||
        orden?.email_cliente ||
        orden?.mail_cliente ||
        orden?.Mail1 ||
        "",
    ).trim() || null;

  const inicioSap =
    typeof fmtDMY === "function"
      ? fmtDMY(
          orden?.start_date ||
            orden?.StartDate ||
            orden?.startDate ||
            orden?.BasicStartDate ||
            orden?.BasicStart,
        )
      : "—";

  const finSap =
    typeof fmtDMY === "function"
      ? fmtDMY(
          orden?.finish_date ||
            orden?.FinishDate ||
            orden?.finishDate ||
            orden?.BasicFinDate ||
            orden?.BasicFinish,
        )
      : "—";

  return (
    <>
      <View style={local.headerBox}>
        <View style={{ flex: 1 }}>
          <Text style={local.titulo}>
            #{orden?.Orderid || id || ""} · {orden?.order_type || "—"}
          </Text>
        </View>

        <View style={[local.statusBadge, { backgroundColor: estatusColor }]}>
          <Text style={local.statusBadgeText}>{statusLabel}</Text>
        </View>
      </View>

      {isCartaNoMantto && (
        <Banner
          icon="document-text-outline"
          title='Orden marcada como "Carta No Mantto"'
          text="Las operaciones se muestran solo como referencia y no se pueden iniciar."
          FIORI={FIORI}
        />
      )}

      {!isCartaNoMantto && isPendingFirma0400 && (
        <Banner
          icon="create-outline"
          title="Orden pendiente de firma"
          text="Puedes continuar el proceso para capturar firma y finalizar."
          FIORI={FIORI}
        />
      )}

      {!isCartaNoMantto &&
        statusCode === "0100" &&
        !isFinished0300 && (
          <View style={local.nextStepPanel}>
            <View style={local.nextStepBadge}>
              <Ionicons
                name="arrow-forward-circle-outline"
                size={16}
                color={FIORI.brand}
              />
              <Text style={[local.nextStepBadgeText, { color: FIORI.brand }]}>
                SIGUIENTE PASO
              </Text>
            </View>

            <View style={local.nextStepHeader}>
              <View
                style={[
                  local.nextStepIcon,
                  { backgroundColor: FIORI.brandSoft },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={22}
                  color={FIORI.brand}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={local.nextStepTitle}>
                  Check-in completado
                </Text>
              </View>
            </View>

            <View style={local.nextStepActions}>
              <TouchableOpacity
                style={[
                  local.nextStepPrimaryButton,
                  { backgroundColor: FIORI.brand },
                ]}
                onPress={onOpenTbmky}
                activeOpacity={0.88}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={19}
                  color="#FFFFFF"
                />

                <View style={{ flex: 1 }}>
                  <Text style={local.nextStepPrimaryTitle}>
                    Realizar TBM/KY
                  </Text>

                  <Text style={local.nextStepPrimarySubtitle}>
                    Continuar con el mantenimiento
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="#FFFFFF"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={local.nextStepSecondaryButton}
                onPress={onOpenNoMantto}
                activeOpacity={0.88}
              >
                <Ionicons
                  name="document-text-outline"
                  size={19}
                  color="#B42318"
                />

                <View style={{ flex: 1 }}>
                  <Text style={local.nextStepSecondaryTitle}>
                    Carta No Mantto
                  </Text>

                  <Text style={local.nextStepSecondarySubtitle}>
                    Registrar que el servicio no puede realizarse
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="#B42318"
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

      {!isCartaNoMantto &&
        !statusCode &&
        !checkinDone &&
        !isFinished0300 && (
          <Banner
            icon="lock-closed-outline"
            title="Operaciones bloqueadas"
            text="Primero debes realizar el Check-in."
            FIORI={FIORI}
          />
        )}

      {isFinished0300 && !isCartaNoMantto && (
        <Banner
          icon="checkmark-done-outline"
          title="Orden finalizada"
          text="Las operaciones se muestran solo como referencia."
          FIORI={FIORI}
        />
      )}

      <View style={local.panel}>
        <View style={local.cleanCard}>
          <MiniInfo
            icon="business-outline"
            label="Equipo"
            value={
              orden?.equipment ||
              orden?.Equipment ||
              orden?.EQUIPMENT
            }
            FIORI={FIORI}
            formatValueForRow={formatValueForRow}
          />

          <View style={local.divider} />

          <MiniInfo
            icon="mail-outline"
            label="Correo cliente"
            value={correoCliente}
            FIORI={FIORI}
            formatValueForRow={formatValueForRow}
          />

          <View style={local.divider} />

          <View style={local.dateRow}>
            <View style={local.dateItem}>
              <Ionicons name="calendar-outline" size={15} color={FIORI.brand} />
              <View>
                <Text style={local.dateLabel}>Inicio</Text>
                <Text style={local.dateValue}>{inicioSap}</Text>
              </View>
            </View>

            <View style={local.dateSeparator} />

            <View style={local.dateItem}>
              <Ionicons
                name="calendar-clear-outline"
                size={15}
                color={FIORI.brand}
              />
              <View>
                <Text style={local.dateLabel}>Fin</Text>
                <Text style={local.dateValue}>{finSap}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={local.addressCard}>
          <View style={local.addressHeader}>
            <Ionicons name="location-outline" size={16} color={FIORI.brand} />
            <Text style={local.addressLabel}>Dirección</Text>
          </View>

          <Text style={local.addressText}>
            {formatText(direccionValor, formatValueForRow)}
          </Text>
        </View>

        {(Number.isFinite(orderStartedAtMs) ||
          Number.isFinite(orderFinishedAtMs) ||
          Number.isFinite(orderElapsedMs)) && (
          <View style={local.timeBox}>
            <View style={local.timeHeader}>
              <Ionicons name="time-outline" size={16} color={FIORI.brand} />
              <Text style={local.timeTitle}>Registro local</Text>
            </View>

            {Number.isFinite(orderStartedAtMs) && (
              <Text style={local.timeText}>
                Inicio:{" "}
                {typeof fmtDateTimeLocal === "function"
                  ? fmtDateTimeLocal(orderStartedAtMs)
                  : "—"}
              </Text>
            )}

            {Number.isFinite(orderFinishedAtMs) && (
              <Text style={local.timeText}>
                Fin:{" "}
                {typeof fmtDateTimeLocal === "function"
                  ? fmtDateTimeLocal(orderFinishedAtMs)
                  : "—"}
              </Text>
            )}

            {Number.isFinite(orderElapsedMs) && (
              <Text style={local.timeText}>
                Tiempo:{" "}
                {typeof msToHMS === "function" ? msToHMS(orderElapsedMs) : "—"}
              </Text>
            )}
          </View>
        )}

        {allMaterialsLen > 0 && (
          <TouchableOpacity
            style={[local.btnSeeMaterials, { backgroundColor: FIORI.brand }]}
            onPress={onVerMaterialesOrden}
            activeOpacity={0.9}
          >
            <Ionicons name="cube-outline" size={16} color="#fff" />
            <Text style={local.btnSeeMaterialsText}>
              Ver materiales asignados
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {showServiceActions && statusCode !== "0100" && (
        <View style={local.serviceActionsPanel}>
          <View style={local.serviceActionsHeader}>
            <View
              style={[
                local.serviceActionsIcon,
                { backgroundColor: FIORI.brandSoft },
              ]}
            >
              <Ionicons
                name="options-outline"
                size={20}
                color={FIORI.brand}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={local.serviceActionsTitle}>
                Acciones de servicio
              </Text>

              <Text style={local.serviceActionsSubtitle}>
                Selecciona el proceso que necesitas realizar para esta orden.
              </Text>
            </View>
          </View>

          <View style={local.serviceActionsRow}>
            {canOpenTbmky && (
              <TouchableOpacity
                style={[
                  local.serviceActionButton,
                  { backgroundColor: FIORI.brand },
                ]}
                onPress={onOpenTbmky}
                activeOpacity={0.88}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color="#FFFFFF"
                />

                <Text style={local.serviceActionPrimaryText}>
                  {statusCode === "0200" ? "Ver TBM/KY" : "Realizar TBM/KY"}
                </Text>
              </TouchableOpacity>
            )}

            {canOpenNoMantto && (
              <TouchableOpacity
                style={[
                  local.serviceActionButton,
                  local.serviceActionSecondary,
                ]}
                onPress={onOpenNoMantto}
                activeOpacity={0.88}
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color="#B42318"
                />

                <Text style={local.serviceActionSecondaryText}>
                  Carta No Mantto
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <FormatosOrdenMultiSelect
        FIORI={FIORI}
        orderid={orden?.Orderid || id}
      />

      <Text style={styles?.sectionKicker || local.sectionKicker}>
        Operaciones asignadas
      </Text>
    </>
  );
}

const local = StyleSheet.create({
  headerBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  titulo: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0B1F3B",
  },

  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginLeft: 8,
  },

  statusBadgeText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 11,
  },

  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EEF7",
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },

  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  bannerTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0B1F3B",
    marginBottom: 4,
  },

  bannerText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: "#63718B",
  },

  panel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    padding: 14,
    marginBottom: 12,
  },

  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  miniBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  miniBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },

  cleanCard: {
    backgroundColor: "#F7F9FC",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E8EEF7",
    padding: 12,
  },

  miniInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },

  miniIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  miniLabel: {
    fontSize: 10.5,
    fontWeight: "900",
    color: "#63718B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  miniValue: {
    marginTop: 2,
    fontSize: 13.5,
    fontWeight: "900",
    color: "#0B1F3B",
  },

  divider: {
    height: 1,
    backgroundColor: "#E3EAF4",
    marginVertical: 9,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 2,
  },

  dateItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  dateSeparator: {
    width: 1,
    height: 34,
    backgroundColor: "#DDE6F2",
    marginHorizontal: 10,
  },

  dateLabel: {
    fontSize: 10.5,
    fontWeight: "900",
    color: "#63718B",
    textTransform: "uppercase",
  },

  dateValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "900",
    color: "#0B1F3B",
  },

  addressCard: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EEF7",
    padding: 12,
  },

  addressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 7,
  },

  addressLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#63718B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  addressText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: "#0B1F3B",
  },

  timeBox: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EEF7",
    padding: 12,
  },

  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 5,
  },

  timeTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0B1F3B",
  },

  timeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#63718B",
    marginTop: 3,
  },

  btnSeeMaterials: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },

  btnSeeMaterialsText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
  },

  serviceActionsPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    padding: 14,
    marginBottom: 12,
  },

  serviceActionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  serviceActionsIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  serviceActionsTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0B1F3B",
  },

  serviceActionsSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: "#63718B",
  },

  serviceActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  serviceActionButton: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },

  serviceActionSecondary: {
    backgroundColor: "#FFF6F5",
    borderWidth: 1,
    borderColor: "#F3C7C2",
  },

  serviceActionPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
  },

  serviceActionSecondaryText: {
    color: "#B42318",
    fontWeight: "900",
    fontSize: 12,
  },

  nextStepPanel: {
    backgroundColor: "#EEF6FF",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#0A6ED1",
    padding: 15,
    marginBottom: 14,
  },

  nextStepBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },

  nextStepBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  nextStepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },

  nextStepIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  nextStepTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0B1F3B",
  },

  nextStepText: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    color: "#63718B",
  },

  nextStepActions: {
    gap: 10,
  },

  nextStepPrimaryButton: {
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  nextStepPrimaryTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  nextStepPrimarySubtitle: {
    marginTop: 2,
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "700",
  },

  nextStepSecondaryButton: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3C7C2",
    backgroundColor: "#FFF6F5",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  nextStepSecondaryTitle: {
    color: "#B42318",
    fontSize: 13,
    fontWeight: "900",
  },

  nextStepSecondarySubtitle: {
    marginTop: 2,
    color: "#8A4B45",
    fontSize: 11,
    fontWeight: "700",
  },

  sectionKicker: {
    fontSize: 13,
    color: "#63718B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
    fontWeight: "900",
  },
});