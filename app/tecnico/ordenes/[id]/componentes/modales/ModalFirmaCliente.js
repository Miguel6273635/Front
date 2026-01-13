import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Signature from 'react-native-signature-canvas';

export default function ModalFirmaCliente({
  visible,
  onClose,
  signatureRef,
  signatureData,
  setSignatureData,
  savingSignature,
  onConfirmFinalizar,
  FIORI,
  styles,
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '90%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Firma del cliente</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 12 }}>
            <Text style={{ color: FIORI.text, fontSize: 13, marginBottom: 8, fontWeight: '600' }}>
              Pida al cliente que firme dentro del recuadro. Esta firma se usará como evidencia de finalización.
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
          </View>

          <View style={styles.modalFooterRow}>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
              onPress={onClose}
              disabled={savingSignature}
            >
              <Text style={styles.smallBtnText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnFinishOrder, savingSignature && { opacity: 0.7 }]}
              activeOpacity={0.9}
              onPress={onConfirmFinalizar}
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
  );
}
