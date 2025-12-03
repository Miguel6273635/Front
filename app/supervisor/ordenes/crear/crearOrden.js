// app/supervisor/averia/[averiaid]/crear-orden-mantto.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Modal, // 👈 agregado para el multiselect
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';
import api from '../../../../src/services/api';

const COLORS = {
  pageBg: '#F4F6F9',
  cardBg: '#FFFFFF',
  border: '#E4E9F0',
  title: '#0B1F3B',
  text: '#52616B',
  accent: '#0A6ED1',
  muted: '#9AA5B1',
  danger: '#E74C3C',
};

/** 🔹 Catálogo simple de trabajadores para el multiselect */
const WORKERS = [
  { id: 'T001', name: 'Técnico 1' },
  { id: 'T002', name: 'Técnico 2' },
  { id: 'T003', name: 'Técnico 3' },
  // aquí luego puedes cambiarlo para que venga de tu API
];

function elev(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.06 * multiplier,
      shadowRadius: 6 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });
}

// Helper para generar fecha tipo "2025-07-29T08:00:00"
function toIsoLocalDateTime(hour = 8, minute = 0, plusDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  d.setHours(hour, minute, 0, 0);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

export default function CrearOrdenMantto() {
  const { averiaid, notifNo, equipment, functLoc, shortText } =
    useLocalSearchParams();

  const [orderType, setOrderType] = useState('SM01');
  const [planPlant, setPlanPlant] = useState('TLP1');
  const [mnWkCtr, setMnWkCtr] = useState('WC04');
  const [startDate, setStartDate] = useState(toIsoLocalDateTime(8, 0, 0));
  const [finishDate, setFinishDate] = useState(toIsoLocalDateTime(18, 0, 1));

  /** 🔹 Operaciones:
   *  - Activity
   *  - SubActivity
   *  - Description (texto de la actividad)
   *  - DurationHrs (horas)
   *  - Workers (array de ids de trabajadores)
   */
  const [operations, setOperations] = useState([
    {
      Activity: '0010',
      SubActivity: '01',
      Description: '',
      DurationHrs: '',
      Workers: [],
    },
    {
      Activity: '0020',
      SubActivity: '01',
      Description: '',
      DurationHrs: '',
      Workers: [],
    },
  ]);

  const [saving, setSaving] = useState(false);

  const goBack = () => router.back();

  const updateOperation = (index, field, value) => {
    setOperations((prev) =>
      prev.map((op, i) => (i === index ? { ...op, [field]: value } : op))
    );
  };

  const setOperationWorkers = (index, workersIds) => {
    setOperations((prev) =>
      prev.map((op, i) =>
        i === index ? { ...op, Workers: workersIds } : op
      )
    );
  };

  const addOperation = () => {
    const nextIndex = operations.length;
    const nextActivity = String((nextIndex + 1) * 10).padStart(4, '0'); // 0010, 0020, 0030...
    setOperations((prev) => [
      ...prev,
      {
        Activity: nextActivity,
        SubActivity: '01',
        Description: '',
        DurationHrs: '',
        Workers: [],
      },
    ]);
  };

  const removeOperation = (index) => {
    if (operations.length === 1) {
      Alert.alert('No permitido', 'La orden debe tener al menos una operación.');
      return;
    }
    setOperations((prev) => prev.filter((_, i) => i !== index));
  };

  const onGuardar = async () => {
    if (!orderType || !planPlant || !mnWkCtr) {
      Alert.alert(
        'Campos requeridos',
        'OrderType, Planta planificadora y Centro de trabajo principal son obligatorios.'
      );
      return;
    }

    const opsValidas = operations.filter(
      (op) =>
        op.Activity &&
        op.Description &&
        op.DurationHrs &&
        !Number.isNaN(Number(op.DurationHrs))
    );

    if (!opsValidas.length) {
      Alert.alert(
        'Operaciones',
        'Cada operación debe tener Activity, descripción y duración (en horas).'
      );
      return;
    }

    const payload = {
      WorkOrderHeader: {
        OrderType: String(orderType).trim(),
        Planplant: String(planPlant).trim(),
        MnWkCtr: String(mnWkCtr).trim(),
        StartDate: String(startDate).trim(),
        FinishDate: String(finishDate).trim(),
      },
      WorkOrderOperationSet: opsValidas.map((op) => ({
        Activity: String(op.Activity || '').trim(),
        SubActivity: String(op.SubActivity || '').trim(),
        WorkCntr: String(mnWkCtr).trim(), // usamos el centro principal
        Plant: String(planPlant).trim(), // usamos la planta planificadora
        Description: String(op.Description || '').trim(),
        DurationHrs: Number(op.DurationHrs),
        Workers: Array.isArray(op.Workers) ? op.Workers : [],
      })),
    };

    try {
      setSaving(true);

      const res = await api.post(
        '/sap/ordenes/crear-mantenimiento-desde-aviso',
        {
          averiaId: averiaid,
          notifNo: notifNo,
          equipment,
          functLoc,
          shortText,
          payload,
        }
      );

      const orderId =
        res?.data?.Orderid || res?.data?.orderid || res?.data?.WorkOrderId;

      Alert.alert(
        'Orden creada',
        orderId
          ? `Se creó la orden de mantenimiento ${orderId} correctamente.`
          : 'La orden de mantenimiento se creó correctamente.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    } catch (err) {
      console.error('Error al crear orden de mantenimiento:', err);
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'No se pudo crear la orden.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Crear orden de mantenimiento" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Botón regresar */}
        <TouchableOpacity style={styles.backRow} onPress={goBack}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver al aviso</Text>
        </TouchableOpacity>

        {/* Card: contexto del aviso */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contexto del aviso</Text>

          <Row label="Número de aviso" value={notifNo || averiaid} />
          <Row label="Equipo" value={equipment || '—'} />
          <Row label="Ubicación funcional" value={functLoc || '—'} />
          <Row label="Descripción corta" value={shortText || '—'} />
        </View>

        {/* Card: WorkOrderHeader */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos de la orden</Text>

          <Field
            label="Tipo de orden (OrderType)"
            value={orderType}
            onChangeText={setOrderType}
          />

          <Field
            label="Planta planificadora (Planplant)"
            value={planPlant}
            onChangeText={setPlanPlant}
          />

          <Field
            label="Fecha inicio (StartDate)"
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DDTHH:mm:ss"
          />

          <Field
            label="Fecha fin (FinishDate)"
            value={finishDate}
            onChangeText={setFinishDate}
            placeholder="YYYY-MM-DDTHH:mm:ss"
          />

          <Text style={styles.helpText}>
            Formato de fecha: <Text style={{ fontWeight: '700' }}>YYYY-MM-DDTHH:mm:ss</Text>{' '}
            (ejemplo: 2025-07-29T08:00:00)
          </Text>
        </View>

        {/* Card: Operaciones */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Operaciones (WorkOrderOperationSet)</Text>

          {operations.map((op, index) => (
            <View key={index} style={styles.opCard}>
              <View style={styles.opHeader}>
                <Text style={styles.opTitle}>
                  Operación {index + 1} · Activity {op.Activity || '—'}
                </Text>
                {operations.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeOperation(index)}
                    style={styles.opDeleteBtn}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={COLORS.danger}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Activity (por si quieres ajustarla) */}

              {/* Descripción de la actividad */}
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.fieldLabel}>Descripción de la actividad</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={op.Description}
                  onChangeText={(txt) =>
                    updateOperation(index, 'Description', txt)
                  }
                  placeholder="Describe brevemente la actividad a realizar"
                  placeholderTextColor={COLORS.muted}
                  multiline
                />
              </View>

              {/* Duración en minutos */}
              <Field
                label="Duración (horas)"
                value={op.DurationHrs}
                onChangeText={(txt) =>
                  updateOperation(index, 'DurationHrs', txt.replace(/[^0-9]/g, ''))
                }
                placeholder="Ej. 2"
                keyboardType="numeric"
              />

              {/* 🔹 Multiselect de trabajadores */}
              <View style={{ marginTop: 6 }}>
                <Text style={styles.fieldLabel}>Trabajadores asignados</Text>
                <MultiSelectWorkers
                  allWorkers={WORKERS}
                  selectedIds={op.Workers || []}
                  onChange={(ids) => setOperationWorkers(index, ids)}
                />
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.btnSecondary} onPress={addOperation}>
            <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
            <Text style={styles.btnSecondaryText}>Agregar operación</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 12 }} />

        {/* Botón guardar */}
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={onGuardar}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>
              Crear orden de mantenimiento
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 30 }} />
      </ScrollView>

      <Footer />
    </View>
  );
}

/* ========= Subcomponentes ========= */

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value || '—'}</Text>
  </View>
);

const Field = ({ label, value, onChangeText, placeholder, keyboardType }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.muted}
      keyboardType={keyboardType}
    />
  </View>
);

/** 🔹 Multiselect de trabajadores con modal */
const MultiSelectWorkers = ({ allWorkers, selectedIds, onChange }) => {
  const [visible, setVisible] = useState(false);

  const toggle = (id) => {
    const current = Array.isArray(selectedIds) ? selectedIds : [];
    const exists = current.includes(id);
    const next = exists
      ? current.filter((x) => x !== id)
      : [...current, id];
    onChange(next);
  };

  const selectedNames = allWorkers
    .filter((w) => selectedIds?.includes(w.id))
    .map((w) => w.name);

  const label =
    selectedNames.length === 0
      ? 'Seleccionar técnicos'
      : selectedNames.join(', ');

  return (
    <>
      {/* Campo que abre el modal */}
      <TouchableOpacity
        style={[styles.input, styles.multiInput]}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Text
          style={{
            fontSize: 13,
            color: selectedNames.length ? COLORS.title : COLORS.muted,
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
        <Ionicons
          name="chevron-down-outline"
          size={18}
          color={COLORS.muted}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      {/* Modal de selección */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar técnicos</Text>
              <TouchableOpacity
                onPress={() => setVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 280 }}
              contentContainerStyle={{ paddingVertical: 8 }}
            >
              {allWorkers.map((w) => {
                const checked = selectedIds?.includes(w.id);
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={styles.workerRow}
                    onPress={() => toggle(w.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        checked && styles.checkboxChecked,
                      ]}
                    >
                      {checked && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.workerName}>{w.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.cardBg }]}
                onPress={() => onChange([])}
              >
                <Text style={styles.smallBtnText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
                ]}
                onPress={() => setVisible(false)}
              >
                <Text
                  style={[styles.smallBtnText, { color: '#fff' }]}
                >
                  Listo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

/* ========= Estilos ========= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backText: {
    marginLeft: 4,
    color: COLORS.accent,
    fontWeight: '600',
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...elev(1),
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.title,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
    flex: 1.1,
  },
  value: {
    fontSize: 13,
    color: COLORS.title,
    flex: 1,
    textAlign: 'right',
  },
  fieldLabel: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 13,
    color: COLORS.title,
    backgroundColor: '#FDFDFE',
  },
  multiInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helpText: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
  },
  opCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#FAFBFF',
  },
  opHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  opTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.title,
  },
  opDeleteBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 8,
  },
  btnSecondaryText: {
    marginLeft: 6,
    color: COLORS.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  btnPrimary: {
    marginTop: 10,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    ...elev(1.2),
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },

  /* Modal multiselect */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...elev(1.4),
  },
  modalHeader: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    flex: 1,
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  workerName: {
    fontSize: 13,
    color: COLORS.title,
  },
  modalFooterRow: {
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  smallBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
});
