// app/ordenes/[id]/secciones/ModalesDetalleOrden.js
import React from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import Signature from "react-native-signature-canvas";

export default function ModalesDetalleOrden({
  styles,
  FIORI,

  orden,
  allMaterials,

  showAllMaterialsModal,
  setShowAllMaterialsModal,

  showCompModal,
  closeComponentsModal,
  selectedOp,
  loadingComponents,
  compList,

  showSignModal,
  setShowSignModal,
  signatureRef,
  signatureData,
  setSignatureData,
  savingSignature,
  confirmarFinalizarConFirma,

  showNoMantPdfModal,
  cerrarModalNoMantPdf,
  loadingNoMantPdf,
  noMantError,
  noMantPdfUrl,
  noMantPdfRawUrl,
  descargarNoMantPdf,
  downloadingNoMantPdf,
}) {
  const safeStr = (v) => String(v ?? "").trim();

  const titleOp = selectedOp
    ? `${safeStr(selectedOp.activity || selectedOp.Activity)}${
        safeStr(selectedOp.subactivity || selectedOp.SubActivity)
          ? " / " + safeStr(selectedOp.subactivity || selectedOp.SubActivity)
          : ""
      }`
    : "";

  const closeSign = () => {
    if (savingSignature) return;
    setShowSignModal?.(false);
  };

  return (
    <>
      {/* ===== Modal TODOS materiales ===== */}
      <Modal
        visible={!!showAllMaterialsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAllMaterialsModal?.(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Materiales asignados a la orden</Text>
              <TouchableOpacity
                onPress={() => setShowAllMaterialsModal?.(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420, paddingHorizontal: 12, paddingVertical: 8 }}>
              {!Array.isArray(allMaterials) || allMaterials.length === 0 ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 8 }}>
                  Esta orden no tiene materiales asignados desde SAP.
                </Text>
              ) : (
                allMaterials.map((m, idx) => {
                  const desc = m.MatlDesc || m.ShortText || m.Material || "Sin descripción";
                  const qty = m.RequirementQuantity ?? m.Quantity ?? "—";
                  const unit =
                    m.RequirementQuantityUnitIso || m.RequirementQuantityUnit || m.Unit || "";

                  const key =
                    m.id ||
                    `${m.Orderid || orden?.Orderid || ""}-${m.activity || m.Activity || ""}-${
                      m.Item || m.ResItem || idx
                    }`;

                  return (
                    <View key={key} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.compTitle}>{desc}</Text>
                        <Text style={styles.compSub}>
                          Cantidad: {qty} {unit}
                        </Text>

                        <Text style={styles.compMeta}>
                          Operación: {m.activity || m.Activity || "—"} · Item:{" "}
                          {m.Item || m.ResItem || "—"}
                        </Text>

                        <Text style={styles.compMeta}>
                          Centro: {m.Plant || "—"} · Almacén: {m.StorageLocation || "—"}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={() => setShowAllMaterialsModal?.(false)}
              >
                <Text style={styles.smallBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal materiales por operación (SOLO VIEW) ===== */}
      <Modal
        visible={!!showCompModal}
        animationType="slide"
        transparent
        onRequestClose={closeComponentsModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Materiales · {titleOp}</Text>
              <TouchableOpacity onPress={closeComponentsModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420, paddingHorizontal: 12, paddingVertical: 8 }}>
              {loadingComponents ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 12 }}>Cargando materiales…</Text>
              ) : !Array.isArray(compList) || compList.length === 0 ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 12 }}>
                  No hay materiales asignados a esta operación.
                </Text>
              ) : (
                compList.map((c, idx) => {
                  const desc = c.MatlDesc || c.ShortText || c.Material || "Sin descripción";
                  const qtyAsignada = c.RequirementQuantity ?? c.Quantity ?? "—";
                  const unit =
                    c.RequirementQuantityUnitIso || c.RequirementQuantityUnit || c.Unit || "";

                  const key = `${c.Orderid || orden?.Orderid || ""}-${
                    c.Activity || c.activity || ""
                  }-${c.ResItem || c.Item || idx}`;

                  return (
                    <View key={key} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.compTitle}>{desc}</Text>
                        <Text style={styles.compSub}>
                          Cantidad asignada: {qtyAsignada} {unit}
                        </Text>

                        {!!(c.Plant || c.StorageLocation) && (
                          <Text style={styles.compMeta}>
                            Centro: {c.Plant || "—"} · Almacén: {c.StorageLocation || "—"}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={closeComponentsModal}
              >
                <Text style={styles.smallBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== ✅ Modal firma cliente (centrado + con "Listo") ===== */}
      <Modal
        visible={!!showSignModal}
        animationType="fade"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={closeSign}
      >
        <View style={signStyles.backdrop}>
          <View style={signStyles.card}>
            {/* Header */}
            <View style={signStyles.header}>
              <Text style={signStyles.title}>Firma del cliente</Text>

              <TouchableOpacity
                onPress={closeSign}
                style={[signStyles.closeBtn, savingSignature && { opacity: 0.7 }]}
                disabled={!!savingSignature}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={18} color="#0B1F3B" />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <View style={signStyles.body}>
              <Text style={signStyles.helper}>
                Pida al cliente que firme dentro del recuadro y presione “Listo”.
              </Text>

              <View style={signStyles.signatureBox}>
                <Signature
                  ref={signatureRef}
                  onOK={(sig) => setSignatureData?.(sig)}
                  onClear={() => setSignatureData?.(null)}
                  onEmpty={() => setSignatureData?.(null)}
                  autoClear={false}
                  descriptionText="Firme aquí"
                  clearText="Limpiar"
                  confirmText="Listo"
                  webStyle={`
                    html, body {
                      height: 100%;
                      width: 100%;
                      margin: 0;
                      padding: 0;
                      background: #fff;
                    }

                    /* Contenedor */
                    .m-signature-pad {
                      box-shadow: none;
                      border: none;
                      height: 100% !important;
                      width: 100% !important;
                      display: flex;
                      flex-direction: column;
                    }

                    /* Área de firma: dejamos espacio al footer */
                    .m-signature-pad--body {
                      flex: 1;
                      border: 0;
                      height: auto !important;
                      min-height: 0 !important;
                    }

                    /* Footer visible (botones) */
                    .m-signature-pad--footer {
                      height: 64px !important;
                      display: flex !important;
                      justify-content: space-between;
                      align-items: center;
                      padding: 10px 12px;
                      border-top: 1px solid #E8EEF7;
                      box-sizing: border-box;
                    }

                    .m-signature-pad--footer .description {
                      display: none !important;
                    }

                    .m-signature-pad--footer .button {
                      font-size: 13px !important;
                      padding: 10px 14px !important;
                      border-radius: 10px !important;
                      border: 0 !important;
                      box-shadow: none !important;
                    }

                    .m-signature-pad--footer .button.clear {
                      background: #EEEEEE !important;
                      color: #333 !important;
                    }

                    .m-signature-pad--footer .button.save {
                      background: #0A6ED1 !important;
                      color: #fff !important;
                    }

                    canvas {
                      width: 100% !important;
                      height: 100% !important;
                    }
                  `}
                />
              </View>

              <Text style={signStyles.statusLine}>
                {signatureData ? "✅ Firma capturada." : "⚠️ Aún no se ha capturado firma."}
              </Text>
            </View>

            {/* Footer app (Cancelar / Finalizar orden) */}
            <View style={signStyles.footer}>
              <TouchableOpacity
                style={[signStyles.secondaryBtn, savingSignature && { opacity: 0.7 }]}
                onPress={closeSign}
                disabled={!!savingSignature}
                activeOpacity={0.9}
              >
                <Text style={signStyles.secondaryText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[signStyles.primaryBtn, savingSignature && { opacity: 0.7 }]}
                activeOpacity={0.9}
                onPress={confirmarFinalizarConFirma}
                disabled={!!savingSignature}
              >
                <Ionicons name="flag-outline" size={18} color="#fff" />
                <Text style={signStyles.primaryText}>
                  {savingSignature ? "Guardando…" : "Finalizar orden"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal PDF no mantenimiento ===== */}
      <Modal
        visible={!!showNoMantPdfModal}
        animationType="slide"
        transparent
        onRequestClose={cerrarModalNoMantPdf}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 600, maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Carta de no mantenimiento (PDF)</Text>
              <TouchableOpacity onPress={cerrarModalNoMantPdf} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, padding: 12 }}>
              {loadingNoMantPdf ? (
                <View style={{ alignItems: "center", marginTop: 20 }}>
                  <ActivityIndicator size="large" color={FIORI.brand} />
                  <Text style={{ marginTop: 10, color: FIORI.textMuted }}>Cargando PDF…</Text>
                </View>
              ) : noMantError ? (
                <Text style={{ color: FIORI.err, marginTop: 10 }}>{noMantError}</Text>
              ) : noMantPdfUrl ? (
                <View style={{ flex: 1, height: 420 }}>
                  <WebView source={{ uri: noMantPdfUrl }} style={{ flex: 1 }} />
                </View>
              ) : (
                <Text style={{ color: FIORI.textMuted, marginTop: 10 }}>
                  No se encontró el archivo PDF de la carta de no mantenimiento.
                </Text>
              )}
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={cerrarModalNoMantPdf}
              >
                <Text style={styles.smallBtnText}>Cerrar</Text>
              </TouchableOpacity>

              {!!noMantPdfRawUrl && (
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: FIORI.brand }]}
                  onPress={descargarNoMantPdf}
                  disabled={!!downloadingNoMantPdf}
                >
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                    {downloadingNoMantPdf ? "Descargando…" : "Descargar"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ====================== Estilos internos SOLO para firma ====================== */
const signStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    height: "82%",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: "900", color: "#0B1F3B" },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E8EEF7",
  },
  body: {
    flex: 1,
    padding: 12,
    gap: 10,
  },
  helper: { color: "#0B1F3B", fontSize: 13, fontWeight: "700" },
  signatureBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  statusLine: { fontSize: 11, color: "#63718B", fontWeight: "700" },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#E8EEF7",
    flexDirection: "row",
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E8EEF7",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: "#0B1F3B", fontWeight: "900", fontSize: 14 },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#0B8457",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 14 },
});
