import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

export default function ModalPdfNoMantenimiento({
  visible,
  onClose,
  loadingNoMantPdf,
  noMantError,
  noMantPdfUrl,
  noMantPdfRawUrl,
  onDownload,
  downloadingNoMantPdf,
  FIORI,
  styles,
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { maxWidth: 600, maxHeight: '90%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Carta de no mantenimiento (PDF)</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
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
              onPress={onClose}
            >
              <Text style={styles.smallBtnText}>Cerrar</Text>
            </TouchableOpacity>

            {noMantPdfRawUrl && (
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.brand }]}
                onPress={onDownload}
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
  );
}
