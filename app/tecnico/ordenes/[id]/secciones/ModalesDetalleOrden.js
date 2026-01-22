// app/ordenes/[id]/secciones/ModalesDetalleOrden.js
import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import Signature from 'react-native-signature-canvas';

/**
 * ModalesDetalleOrden
 * Agrupa todos los modales de la pantalla:
 * - Materiales asignados a la orden (todos)
 * - Materiales por operación + consumo + finalizar
 * - Motivo de pausa
 * - Firma del cliente
 * - PDF No mantenimiento
 *
 * Recibe `styles` y `FIORI` desde index.js (no duplica estilos).
 */

export default function ModalesDetalleOrden({
  // ===== estilos / tema =====
  styles,
  FIORI,

  // ===== orden / materiales =====
  orden,
  allMaterials,

  // ===== Modal: TODOS materiales =====
  showAllMaterialsModal,
  setShowAllMaterialsModal,

  // ===== Modal: materiales por operación =====
  showCompModal,
  closeComponentsModal,
  selectedOp,
  modalMode,
  loadingComponents,
  compList,
  hasComponents,
  consumioMaterial,
  setConsumioMaterial,
  cantidadesConsumidas,
  setCantidadesConsumidas,
  finalizandoOp,
  finalizarOperacionConMaterial,

  // ===== Modal: motivo pausa =====
  showPauseModal,
  closePauseModal,
  pauseMotivo,
  setPauseMotivo,
  sendingPause,
  confirmarPausaConMotivo,

  // ===== Modal: firma =====
  showSignModal,
  setShowSignModal,
  signatureRef,
  setSignatureData,
  signatureData,
  savingSignature,
  confirmarFinalizarConFirma,

  // ===== Modal: PDF no mant =====
  showNoMantPdfModal,
  cerrarModalNoMantPdf,
  loadingNoMantPdf,
  noMantError,
  noMantPdfUrl,
  noMantPdfRawUrl,
  descargarNoMantPdf,
  downloadingNoMantPdf,
}) {
  return (
    <>
      {/* ===== Modal TODOS materiales ===== */}
      <Modal
        visible={showAllMaterialsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAllMaterialsModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Materiales asignados a la orden</Text>
              <TouchableOpacity
                onPress={() => setShowAllMaterialsModal(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420, paddingHorizontal: 12, paddingVertical: 8 }}>
              {!allMaterials || allMaterials.length === 0 ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 8 }}>
                  Esta orden no tiene materiales asignados desde SAP.
                </Text>
              ) : (
                allMaterials.map((m, idx) => {
                  const desc = m.MatlDesc || m.ShortText || m.Material || 'Sin descripción';
                  const qty = m.RequirementQuantity ?? m.Quantity ?? '—';
                  const unit =
                    m.RequirementQuantityUnitIso || m.RequirementQuantityUnit || m.Unit || '';
                  return (
                    <View key={m.id || `${m.activity}-${m.Item}-${idx}`} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.compTitle}>{desc}</Text>
                        <Text style={styles.compSub}>
                          Cantidad: {qty} {unit}
                        </Text>
                        <Text style={styles.compMeta}>
                          Operación: {m.activity || '—'} · Item: {m.Item || '—'}
                        </Text>
                        <Text style={styles.compMeta}>
                          Centro: {m.Plant || '—'} · Almacén: {m.StorageLocation || '—'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== Modal materiales por operación + consumo ===== */}
      <Modal
        visible={showCompModal}
        animationType="slide"
        transparent
        onRequestClose={closeComponentsModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Materiales ·{' '}
                {selectedOp
                  ? `${selectedOp.activity}${selectedOp.subactivity ? ' / ' + selectedOp.subactivity : ''}`
                  : ''}
              </Text>
              <TouchableOpacity onPress={closeComponentsModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380, paddingHorizontal: 12 }}>
              {loadingComponents ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 12 }}>Cargando materiales…</Text>
              ) : !compList || compList.length === 0 ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 12 }}>
                  No hay materiales asignados a esta operación.
                </Text>
              ) : (
                compList.map((c) => {
                  const desc = c.MatlDesc || c.ShortText || c.Material || 'Sin descripción';
                  const qtyAsignada = c.RequirementQuantity ?? c.Quantity ?? '—';
                  const unit =
                    c.RequirementQuantityUnitIso || c.RequirementQuantityUnit || c.Unit || '';

                  return (
                    <View key={`${c.Orderid}-${c.Activity}-${c.ResItem}`} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.compTitle}>{desc || 'Sin descripción'}</Text>
                        <Text style={styles.compSub}>
                          Cantidad asignada: {qtyAsignada} {unit}
                        </Text>
                      </View>

                      {modalMode === 'finalizar' && hasComponents && consumioMaterial && (
                        <View style={styles.compQtyWrapper}>
                          <Text style={styles.compMeta}>Consumido:</Text>
                          <View style={styles.compQty}>
                            <TextInput
                              style={styles.inputQty}
                              keyboardType="numeric"
                              value={cantidadesConsumidas?.[c.ResItem] ?? ''}
                              onChangeText={(txt) =>
                                setCantidadesConsumidas((prev) => ({ ...prev, [c.ResItem]: txt }))
                              }
                              placeholder="0"
                            />
                            <Text style={styles.compQtyUnit}>{unit}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>

            {modalMode === 'finalizar' ? (
              <>
                {hasComponents ? (
                  <View style={styles.modalConsumeRow}>
                    <Text style={{ color: FIORI.text, fontWeight: '700' }}>
                      ¿Se consumió material asignado?
                    </Text>
                    <View style={styles.toggleRow}>
                      <TouchableOpacity
                        style={[styles.toggleBtn, consumioMaterial && styles.toggleBtnActive]}
                        onPress={() => setConsumioMaterial(true)}
                      >
                        <Text
                          style={[
                            styles.toggleBtnText,
                            consumioMaterial && styles.toggleBtnTextActive,
                          ]}
                        >
                          Sí
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.toggleBtn, !consumioMaterial && styles.toggleBtnActive]}
                        onPress={() => setConsumioMaterial(false)}
                      >
                        <Text
                          style={[
                            styles.toggleBtnText,
                            !consumioMaterial && styles.toggleBtnTextActive,
                          ]}
                        >
                          No
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.modalConsumeRow}>
                    <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>
                      Esta operación no tiene materiales asignados. Solo se marcará como finalizada.
                    </Text>
                  </View>
                )}

                <View style={styles.modalFooterRow}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                    onPress={closeComponentsModal}
                    disabled={finalizandoOp}
                  >
                    <Text style={styles.smallBtnText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: FIORI.brand }]}
                    onPress={finalizarOperacionConMaterial}
                    disabled={finalizandoOp}
                  >
                    <Text style={[styles.smallBtnText, { color: '#fff' }]}>
                      {finalizandoOp ? 'Guardando…' : 'Finalizar operación'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.modalFooter} />
            )}
          </View>
        </View>
      </Modal>

      {/* ===== Modal motivo de pausa ===== */}
      <Modal
        visible={showPauseModal}
        animationType="slide"
        transparent
        onRequestClose={closePauseModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Motivo de pausa</Text>
              <TouchableOpacity
                onPress={closePauseModal}
                style={styles.modalCloseBtn}
                disabled={sendingPause}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 14 }}>
              <Text style={{ color: FIORI.text, fontWeight: '800', marginBottom: 8 }}>
                Escribe el motivo:
              </Text>

              <TextInput
                value={pauseMotivo}
                onChangeText={setPauseMotivo}
                placeholder="Ej. Esperando refacción / Cliente no autoriza / Falta acceso…"
                placeholderTextColor={FIORI.textMuted}
                multiline
                style={{
                  minHeight: 90,
                  borderWidth: 1,
                  borderColor: FIORI.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: FIORI.surfaceAlt,
                  color: FIORI.text,
                  textAlignVertical: 'top',
                }}
              />

              <View style={[styles.modalFooterRow, { paddingLeft: 0, paddingRight: 0 }]}>
                <TouchableOpacity
                  style={[
                    styles.smallBtn,
                    { backgroundColor: FIORI.surfaceAlt },
                    sendingPause && { opacity: 0.6 },
                  ]}
                  onPress={closePauseModal}
                  disabled={sendingPause}
                >
                  <Text style={styles.smallBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.smallBtn,
                    { backgroundColor: FIORI.pause, borderColor: FIORI.pause },
                    sendingPause && { opacity: 0.6 },
                  ]}
                  onPress={confirmarPausaConMotivo}
                  disabled={sendingPause}
                >
                  {sendingPause ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={[styles.smallBtnText, { color: '#fff' }]}>
                        Enviando pausa…
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="pause-circle-outline" size={16} color="#fff" />
                      <Text style={[styles.smallBtnText, { color: '#fff' }]}>Pausar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal firma cliente ===== */}
      <Modal
        visible={showSignModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSignModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Firma del cliente</Text>
              <TouchableOpacity
                onPress={() => setShowSignModal(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 12 }}>
              <Text style={{ color: FIORI.text, fontSize: 13, marginBottom: 8, fontWeight: '600' }}>
                Pida al cliente que firme dentro del recuadro. Esta firma se usará como evidencia de
                finalización.
              </Text>

              <View
                style={{
                  height: 320,
                  borderWidth: 1,
                  borderColor: FIORI.border,
                  borderRadius: 12,
                  backgroundColor: '#fff',
                }}
              >
                <Signature
                  ref={signatureRef}
                  onOK={(sig) => setSignatureData(sig)}
                  onClear={() => setSignatureData(null)}
                  descriptionText="Firme aquí"
                  clearText="Limpiar"
                  confirmText="Listo"
                  webStyle={`
                    .m-signature-pad { box-shadow: none; border: none; height: 100%; }
                    .m-signature-pad--body { border: 0; height: 75%; }
                    .m-signature-pad--footer {
                      height: 25%;
                      display: flex !important;
                      justify-content: space-between;
                      align-items: center;
                      padding: 8px 12px;
                    }
                    .m-signature-pad--footer .button { font-size: 12px; padding: 6px 10px; border-radius: 6px; }
                    .m-signature-pad--footer .button.save { background-color: #0A6ED1; color: #fff; }
                    .m-signature-pad--footer .button.clear { background-color: #EEEEEE; color: #333; }
                  `}
                />
              </View>

              <Text style={{ marginTop: 8, fontSize: 11, color: FIORI.textMuted }}>
                Puede usar "Limpiar" dentro del recuadro para borrar y volver a firmar.
              </Text>

              <Text style={{ marginTop: 6, fontSize: 11, color: FIORI.textMuted }}>
                {signatureData ? '✅ Firma capturada (Listo).' : '⚠️ Aún no se ha capturado firma.'}
              </Text>
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={() => setShowSignModal(false)}
                disabled={savingSignature}
              >
                <Text style={styles.smallBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnFinishOrder, savingSignature && { opacity: 0.7 }]}
                activeOpacity={0.9}
                onPress={confirmarFinalizarConFirma}
                disabled={savingSignature}
              >
                <Ionicons name="flag-outline" size={18} color="#fff" />
                <Text style={styles.btnFinishOrderText}>
                  {savingSignature ? 'Guardando…' : 'Finalizar orden'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal PDF no mantenimiento ===== */}
      <Modal
        visible={showNoMantPdfModal}
        animationType="slide"
        transparent
        onRequestClose={cerrarModalNoMantPdf}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Carta de no mantenimiento (PDF)</Text>
              <TouchableOpacity onPress={cerrarModalNoMantPdf} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, padding: 12 }}>
              {loadingNoMantPdf ? (
                <View style={{ alignItems: 'center', marginTop: 20 }}>
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

              {noMantPdfRawUrl && (
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: FIORI.brand }]}
                  onPress={descargarNoMantPdf}
                  disabled={downloadingNoMantPdf}
                >
                  <Text style={[styles.smallBtnText, { color: '#fff' }]}>
                    {downloadingNoMantPdf ? 'Descargando…' : 'Descargar'}
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
