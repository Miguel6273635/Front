import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ModalMaterialesOperacion({
  visible,
  onClose,
  selectedOp,
  compList = [],
  loadingComponents,
  modalMode, // 'view' | 'finalizar'
  hasComponents,
  consumioMaterial,
  setConsumioMaterial,
  cantidadesConsumidas,
  setCantidadesConsumidas,
  finalizandoOp,
  onFinalizar,
  FIORI,
  styles,
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Materiales ·{' '}
              {selectedOp
                ? `${selectedOp.activity}${selectedOp.subactivity ? ' / ' + selectedOp.subactivity : ''}`
                : ''}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
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
                const unit = c.RequirementQuantityUnitIso || c.RequirementQuantityUnit || c.Unit || '';

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
                            value={cantidadesConsumidas[c.ResItem] ?? ''}
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
                  <Text style={{ color: FIORI.text, fontWeight: '700' }}>¿Se consumió material asignado?</Text>
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, consumioMaterial && styles.toggleBtnActive]}
                      onPress={() => setConsumioMaterial(true)}
                    >
                      <Text style={[styles.toggleBtnText, consumioMaterial && styles.toggleBtnTextActive]}>Sí</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.toggleBtn, !consumioMaterial && styles.toggleBtnActive]}
                      onPress={() => setConsumioMaterial(false)}
                    >
                      <Text style={[styles.toggleBtnText, !consumioMaterial && styles.toggleBtnTextActive]}>No</Text>
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
                  onPress={onClose}
                  disabled={finalizandoOp}
                >
                  <Text style={styles.smallBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: FIORI.brand }]}
                  onPress={onFinalizar}
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
  );
}
