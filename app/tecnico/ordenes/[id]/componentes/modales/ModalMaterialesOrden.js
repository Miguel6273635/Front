import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ModalMaterialesOrden({ visible, onClose, allMaterials = [], FIORI, styles }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Materiales asignados a la orden</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
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
                const unit = m.RequirementQuantityUnitIso || m.RequirementQuantityUnit || m.Unit || '';

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
  );
}
