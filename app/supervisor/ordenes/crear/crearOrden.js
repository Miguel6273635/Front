// app/supervisor/averia/[averiaid]/crear-orden-mantto.js
import React, { useEffect, useState } from 'react';
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
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../../src/components/Header';
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
  chipBg: '#EAF3FF',
};

const MATERIAL_CATEGORIES = [
  'GRASAS',
  'DIELECTRIC',
  'ACEITE',
  'TRAPO',
  'ESTOPA',
  'BANDAMOTOR',
  'CADENTRACC',
  'FUSIBLE',
  'DEMARESCAL',
  'PEINES',
  'TORNILLESP',
  'BOBINAFREN',
  'CONTACTOR',
  'MICROSWTCH',
  'BUJESESCAL',
  'BOTONPAROS',
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

// Extrae OrderId desde Return.results (tu caso real)
function extractOrderFromReturn(d) {
  const returns = d?.Return?.results || [];
  if (!Array.isArray(returns) || returns.length === 0) {
    return { orderId: null, message: null, hasError: false, errorMessage: null };
  }

  // Detecta si hay errores (Type "E")
  const errItem = returns.find((r) => String(r?.Type || '').toUpperCase() === 'E');
  const hasError = !!errItem;
  const errorMessage = errItem?.Message || null;

  // 1) Preferido: el registro exacto que trae el número en tu ejemplo (Id IWO_BAPI2, Number 126)
  let item =
    returns.find((r) => String(r?.Id || '') === 'IWO_BAPI2' && String(r?.Number || '') === '126') ||
    null;

  // 2) Si no, busca el que contenga "se ha grabado con número"
  if (!item) {
    item = returns.find((r) =>
      String(r?.Message || '').toLowerCase().includes('se ha grabado con número')
    );
  }

  // 3) Fallback: cualquier mensaje que mencione "número"
  if (!item) {
    item = returns.find((r) => String(r?.Message || '').toLowerCase().includes('número'));
  }

  const message = item?.Message || null;

  // ✅ En tu JSON, el número viene en MessageV2
  const orderId =
    (item?.MessageV2 && String(item.MessageV2).trim()) ||
    null;

  // Fallback regex por si MessageV2 viene vacío alguna vez
  let orderIdFromRegex = null;
  if (!orderId && message) {
    const m = String(message).match(/n[uú]mero\s+(\d{6,12})/i);
    orderIdFromRegex = m?.[1] || null;
  }

  return {
    orderId: orderId || orderIdFromRegex,
    message,
    hasError,
    errorMessage,
  };
}

export default function CrearOrdenMantto() {
  const { averiaid, notifNo, equipment, functLoc, shortText } =
    useLocalSearchParams();

  // Header fijo
  const [orderType] = useState('SM01');
  const [planPlant] = useState('TLP1');

  const [startDate, setStartDate] = useState(toIsoLocalDateTime(8, 0, 0));
  const [finishDate, setFinishDate] = useState(toIsoLocalDateTime(18, 0, 1));
  const [headerShortText, setHeaderShortText] = useState(shortText || '');

  // Work centres (técnicos)
  const [workCenters, setWorkCenters] = useState([]);
  const [loadingWorkCenters, setLoadingWorkCenters] = useState(false);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState(null); // { Arbpl, Ktext }

  // Operaciones
  const [operations, setOperations] = useState([
    { Activity: '0010', Description: '', DurationNormal: '', IsExternal: false },
    { Activity: '0020', Description: '', DurationNormal: '', IsExternal: false },
  ]);

  // Componentes (materiales)
  const [components, setComponents] = useState([
    {
      ItemNumber: '0010',
      Category: '',
      Materials: [],
      LoadingMaterials: false,
      Material: '',
      RequirementQuantity: '',
      StgeLoc: '',
      Plant: planPlant,
      Activity: '0010',
      Trackingno: '03',

      NotFound: false,
      MultiSelected: [],
      MultiTrackingno: '02',
    },
  ]);

  const [saving, setSaving] = useState(false);

  // Multi select modal
  const [multiVisible, setMultiVisible] = useState(false);
  const [multiIndex, setMultiIndex] = useState(-1);
  const [multiQuery, setMultiQuery] = useState('');

  const goBack = () => router.back();

  // ==== Cargar WorkCentreSet (técnicos / centros) ====
  useEffect(() => {
    const fetchWorkCenters = async () => {
      try {
        setLoadingWorkCenters(true);
        const url =
          'https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com/api/odata/ZSD_CATALOGOS_SRV/WorkCentreSet?$format=json';

        const res = await fetch(url);
        const json = await res.json();
        const list = json?.d?.results ?? json?.value ?? [];

        const mapped = list.map((it) => ({
          Arbpl: it.Arbpl,
          Ktext: it.Ktext,
        }));

        setWorkCenters(mapped);
      } catch (err) {
        console.error('Error al cargar WorkCentreSet:', err);
        Alert.alert(
          'Catálogo de técnicos',
          'No se pudo cargar la lista de centros de trabajo.'
        );
      } finally {
        setLoadingWorkCenters(false);
      }
    };

    fetchWorkCenters();
  }, []);

  // ===== Helpers =====
  const updateOperation = (index, field, value) => {
    setOperations((prev) =>
      prev.map((op, i) => (i === index ? { ...op, [field]: value } : op))
    );
  };

  const addOperation = () => {
    const nextIndex = operations.length;
    const nextActivity = String((nextIndex + 1) * 10).padStart(4, '0');
    setOperations((prev) => [
      ...prev,
      { Activity: nextActivity, Description: '', DurationNormal: '', IsExternal: false },
    ]);
  };

  const removeOperation = (index) => {
    if (operations.length === 1) {
      Alert.alert('No permitido', 'La orden debe tener al menos una operación.');
      return;
    }
    setOperations((prev) => prev.filter((_, i) => i !== index));
  };

  const updateComponent = (index, field, value) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const addComponent = () => {
    const nextIndex = components.length;
    const nextItem = String((nextIndex + 1) * 10).padStart(4, '0');
    setComponents((prev) => [
      ...prev,
      {
        ItemNumber: nextItem,
        Category: '',
        Materials: [],
        LoadingMaterials: false,
        Material: '',
        RequirementQuantity: '',
        StgeLoc: '',
        Plant: planPlant,
        Activity: '0010',
        Trackingno: '03',
        NotFound: false,
        MultiSelected: [],
        MultiTrackingno: '02',
      },
    ]);
  };

  const removeComponent = (index) => {
    if (components.length === 1) {
      Alert.alert('No permitido', 'Debe haber al menos un componente.');
      return;
    }
    setComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const openMultiSelect = (index) => {
    setMultiIndex(index);
    setMultiQuery('');
    setMultiVisible(true);
  };

  // ==== Cargar materiales por categoría y componente ====
  const handleCategoryChangeForComponent = async (index, category) => {
    if (!category) {
      setComponents((prev) =>
        prev.map((c, i) =>
          i === index
            ? {
                ...c,
                Category: '',
                Materials: [],
                Material: '',
                LoadingMaterials: false,
                NotFound: false,
                MultiSelected: [],
                MultiTrackingno: '02',
              }
            : c
        )
      );
      return;
    }

    setComponents((prev) =>
      prev.map((c, i) =>
        i === index
          ? { ...c, Category: category, Materials: [], Material: '', LoadingMaterials: true }
          : c
      )
    );

    try {
      const baseUrl =
        'https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet';
      const url =
        baseUrl +
        `?$filter=Agrupador1 eq 'BASICO' and Agrupador2 eq '${category}'&$format=json`;

      const res = await fetch(encodeURI(url));
      const json = await res.json();
      const list = json?.d?.results ?? json?.value ?? [];

      const mapped = list.map((m) => ({
        Id: m.Id,
        Material: m.Material,
        Descripcion: m.Descripcion,
      }));

      setComponents((prev) =>
        prev.map((c, i) =>
          i === index ? { ...c, Materials: mapped, LoadingMaterials: false } : c
        )
      );
    } catch (err) {
      console.error('Error al cargar MaterialesCoberturaSet:', err);
      Alert.alert('Catálogo de materiales', 'No se pudo cargar el catálogo.');
      setComponents((prev) =>
        prev.map((c, i) => (i === index ? { ...c, LoadingMaterials: false } : c))
      );
    }
  };

  const onGuardar = async () => {
    if (!selectedWorkCenter) {
      Alert.alert('Centro de trabajo', 'Debes seleccionar un técnico (MnWkCtr).');
      return;
    }
    if (!headerShortText.trim()) {
      Alert.alert('Descripción corta', 'Captura el ShortText.');
      return;
    }

    const opsValidas = operations.filter(
      (op) =>
        op.Activity &&
        op.Description &&
        op.DurationNormal &&
        !Number.isNaN(Number(op.DurationNormal))
    );

    if (!opsValidas.length) {
      Alert.alert('Operaciones', 'Debe haber operaciones válidas.');
      return;
    }

    const workCntrValue = String(selectedWorkCenter.Arbpl || '').trim();
    const planPlantValue = String(planPlant).trim();

    // ===== Components payload (soporta NotFound multi) =====
    const componentItems = [];
    components.forEach((c) => {
      const stge = String(c.StgeLoc || '').trim();
      const qty = String(c.RequirementQuantity || '').trim();

      if (c.NotFound) {
        const tracking = String(c.MultiTrackingno || '02').trim(); // 01 Oferta / 02 Préstamo
        (c.MultiSelected || []).forEach((mSel) => {
          componentItems.push({
            ItemNumber: String(c.ItemNumber || '').trim(),
            Material: String(mSel.Material || '').trim(),
            RequirementQuantity: qty,
            StgeLoc: stge,
            Plant: planPlantValue,
            Activity: '0010',
            Trackingno: tracking,
          });
        });
        return;
      }

      const hasSomething =
        String(c.Material || '').trim() ||
        String(c.RequirementQuantity || '').trim() ||
        String(c.StgeLoc || '').trim() ||
        String(c.Category || '').trim();

      if (!hasSomething) return;

      componentItems.push({
        ItemNumber: String(c.ItemNumber || '').trim(),
        Material: String(c.Material || '').trim(),
        RequirementQuantity: qty,
        StgeLoc: stge,
        Plant: planPlantValue,
        Activity: '0010',
        Trackingno: String(c.Trackingno || '03').trim(),
      });
    });

    const payload = {
      WorkOrderHeader: {
        OrderType: String(orderType).trim(),
        Planplant: planPlantValue,
        MnWkCtr: workCntrValue,
        Equipment: String(equipment || '').trim(),
        ShortText: headerShortText.trim(),
        StartDate: String(startDate).trim(),
        FinishDate: String(finishDate).trim(),
      },
      WorkOrderOperationSet: opsValidas.map((op) => {
        const base = {
          Activity: String(op.Activity || '').trim(),
          WorkCntr: workCntrValue,
          Plant: planPlantValue,
          Description: String(op.Description || '').trim(),
          DurationNormal: String(op.DurationNormal || '').trim(),
        };
        if (op.IsExternal) base.ControlKey = 'X';
        return base;
      }),
      WorkOrderComponentSet: componentItems,
    };

    try {
      setSaving(true);

      const res = await api.post(
        '/api/odata/ZCS_CREATE_WORKORDER_SRV_02/WorkOrderSet',
        payload
      );

      console.log('Respuesta crear orden mantto:', JSON.stringify(res.data, null, 2));

      const data = res?.data || {};
      const d = data?.d || data;

      // ✅ Aquí se obtiene el número REAL (MessageV2) desde ReturnSet
      const { orderId, message, hasError, errorMessage } = extractOrderFromReturn(d);

      // Si en el Return hay error, lo mostramos (pero aun así puede venir orderId)
      if (hasError && !orderId) {
        Alert.alert('Error SAP', errorMessage || 'Error al crear la orden.');
        return;
      }

      // Mensaje principal
      const finalMsg = message || (orderId ? `Orden creada con número ${orderId}` : 'Orden creada.');

      Alert.alert(
        'Orden creada',
        orderId ? `${finalMsg}\n\nNo. Orden: ${orderId}` : finalMsg,
        [{ text: 'OK', onPress: () => router.back() }]
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
        <TouchableOpacity style={styles.backRow} onPress={goBack} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver al aviso</Text>
        </TouchableOpacity>

        <View style={styles.cardHighlight}>
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Ionicons
                name="alert-circle-outline"
                size={14}
                color={COLORS.accent}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.chipText}>Aviso {notifNo || averiaid}</Text>
            </View>

            {equipment ? (
              <View style={styles.chip}>
                <Ionicons
                  name="hardware-chip-outline"
                  size={14}
                  color={COLORS.accent}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.chipText}>{equipment}</Text>
              </View>
            ) : null}
          </View>

          {shortText ? (
            <Text style={styles.mainTitle}>{shortText}</Text>
          ) : (
            <Text style={styles.mainTitleMuted}>Sin descripción corta en el aviso</Text>
          )}

          <View style={styles.block}>
            <Text style={styles.infoLabel}>Ubicación funcional</Text>
            <Text style={styles.infoValue}>{functLoc || '—'}</Text>
          </View>
        </View>

        {/* Card Header */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos de la orden</Text>

          <View style={styles.chipRow}>
            <View style={styles.chipSmall}>
              <Text style={styles.chipTextSmall}>OrderType: {orderType}</Text>
            </View>
            <View style={styles.chipSmall}>
              <Text style={styles.chipTextSmall}>Planplant: {planPlant}</Text>
            </View>
          </View>

          <View style={{ marginTop: 12, marginBottom: 14 }}>
            <Text style={styles.fieldLabel}>Descripción corta (ShortText)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={headerShortText}
              onChangeText={setHeaderShortText}
              placeholder="Describa brevemente el trabajo de mantenimiento..."
              placeholderTextColor={COLORS.muted}
              multiline
            />
          </View>

          <Text style={styles.fieldLabel}>Centro de trabajo / técnico (MnWkCtr)</Text>
          {loadingWorkCenters ? (
            <View style={{ paddingVertical: 8 }}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : (
            <SelectWorkCenter
              items={workCenters}
              selected={selectedWorkCenter}
              onSelect={setSelectedWorkCenter}
            />
          )}

          <View style={styles.dateRow}>
            <View style={styles.dateCol}>
              <Text style={styles.fieldLabel}>Fecha inicio (StartDate)</Text>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DDTHH:mm:ss"
                placeholderTextColor={COLORS.muted}
              />
            </View>
            <View style={styles.dateCol}>
              <Text style={styles.fieldLabel}>Fecha fin (FinishDate)</Text>
              <TextInput
                style={styles.input}
                value={finishDate}
                onChangeText={setFinishDate}
                placeholder="YYYY-MM-DDTHH:mm:ss"
                placeholderTextColor={COLORS.muted}
              />
            </View>
          </View>

          <Text style={styles.helpText}>
            Formato: <Text style={{ fontWeight: '700' }}>YYYY-MM-DDTHH:mm:ss</Text> (ej.
            2025-07-29T08:00:00)
          </Text>
        </View>

        {/* Operaciones */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Operaciones</Text>
          <Text style={styles.sectionSubtitle}>
            Define las actividades que se realizarán en la orden.
          </Text>

          {operations.map((op, index) => (
            <View key={index} style={styles.opCard}>
              <View style={styles.opHeader}>
                <Text style={styles.opTitle}>
                  Operación {index + 1} · Activity {op.Activity || '—'}
                </Text>
                {operations.length > 1 && (
                  <TouchableOpacity onPress={() => removeOperation(index)} style={styles.opDeleteBtn}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <Row label="Activity" value={op.Activity} />

              <Text style={styles.fieldLabel}>Tipo de operación</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleChip, !op.IsExternal && styles.toggleChipActive]}
                  onPress={() => updateOperation(index, 'IsExternal', false)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.toggleText, !op.IsExternal && styles.toggleTextActive]}>
                    Interna
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleChip, op.IsExternal && styles.toggleChipActive]}
                  onPress={() => updateOperation(index, 'IsExternal', true)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.toggleText, op.IsExternal && styles.toggleTextActive]}>
                    Externa (ControlKey X)
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 10 }}>
                <Text style={styles.fieldLabel}>Descripción de la actividad</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={op.Description}
                  onChangeText={(txt) => updateOperation(index, 'Description', txt)}
                  placeholder="Describe la actividad de mantenimiento..."
                  placeholderTextColor={COLORS.muted}
                  multiline
                />
              </View>

              <Field
                label="Duración (horas) - DurationNormal"
                value={op.DurationNormal}
                onChangeText={(txt) =>
                  updateOperation(index, 'DurationNormal', txt.replace(/[^0-9.]/g, ''))
                }
                placeholder="Ej. 2"
                keyboardType="numeric"
              />
            </View>
          ))}

          <TouchableOpacity style={styles.btnSecondary} onPress={addOperation}>
            <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
            <Text style={styles.btnSecondaryText}>Agregar operación</Text>
          </TouchableOpacity>
        </View>

        {/* Componentes */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Componentes / materiales</Text>
          <Text style={styles.sectionSubtitle}>
            Opcional: materiales necesarios para la orden. Para cada componente, selecciona categoría y material.
          </Text>

          {components.map((c, index) => (
            <View key={index} style={styles.opCard}>
              <View style={styles.opHeader}>
                <Text style={styles.opTitle}>
                  Componente {index + 1} · ItemNumber {c.ItemNumber}
                </Text>
                {components.length > 1 && (
                  <TouchableOpacity onPress={() => removeComponent(index)} style={styles.opDeleteBtn}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <Row label="ItemNumber" value={c.ItemNumber} />

              <Text style={styles.fieldLabel}>Categoría de material</Text>
              <View style={styles.categoryRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.categoryChipsWrapper}>
                    {MATERIAL_CATEGORIES.map((cat) => {
                      const active = c.Category === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[styles.categoryChip, active && styles.categoryChipActive]}
                          onPress={() => handleCategoryChangeForComponent(index, cat)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {c.LoadingMaterials && (
                <View style={{ paddingVertical: 4 }}>
                  <ActivityIndicator color={COLORS.accent} />
                </View>
              )}

              <View style={{ marginBottom: 10 }}>
                <Text style={styles.fieldLabel}>Material</Text>
                <SelectMaterial
                  items={c.Materials || []}
                  value={c.Material}
                  onSelect={(materialCode) => updateComponent(index, 'Material', materialCode)}
                  disabled={!c.Category || c.LoadingMaterials || c.NotFound}
                />
              </View>

              {!c.NotFound && (
                <>
                  <Text style={styles.fieldLabel}>Tipo de material</Text>
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      style={[styles.toggleChip, c.Trackingno === '03' && styles.toggleChipActive]}
                      onPress={() => updateComponent(index, 'Trackingno', '03')}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.toggleText, c.Trackingno === '03' && styles.toggleTextActive]}>
                        Directo (03)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.toggleChip, c.Trackingno === '02' && styles.toggleChipActive]}
                      onPress={() => updateComponent(index, 'Trackingno', '02')}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.toggleText, c.Trackingno === '02' && styles.toggleTextActive]}>
                        Préstamo / Falla (02)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}
                onPress={() => {
                  const next = !c.NotFound;
                  updateComponent(index, 'NotFound', next);
                  if (next) updateComponent(index, 'Material', '');
                  else {
                    updateComponent(index, 'MultiSelected', []);
                    updateComponent(index, 'MultiTrackingno', '02');
                  }
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.checkbox, c.NotFound && styles.checkboxChecked]}>
                  {c.NotFound && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={{ color: COLORS.title, fontWeight: '800' }}>
                  Material no encontrado
                </Text>
              </TouchableOpacity>

              {c.NotFound && (
                <>
                  <TouchableOpacity
                    style={[styles.btnMini, (!c.Category || c.LoadingMaterials) && { opacity: 0.6 }]}
                    disabled={!c.Category || c.LoadingMaterials}
                    onPress={() => openMultiSelect(index)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="list-outline" size={16} color={COLORS.accent} />
                    <Text style={styles.btnMiniText}>Seleccionar materiales</Text>
                  </TouchableOpacity>

                  <Text style={{ marginTop: 6, fontSize: 12, color: COLORS.text }}>
                    Seleccionados: {(c.MultiSelected || []).length}
                  </Text>

                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>
                    Tipo para “no encontrado”
                  </Text>
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      style={[styles.toggleChip, c.MultiTrackingno === '02' && styles.toggleChipActive]}
                      onPress={() => updateComponent(index, 'MultiTrackingno', '02')}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.toggleText, c.MultiTrackingno === '02' && styles.toggleTextActive]}>
                        Préstamo (02)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.toggleChip, c.MultiTrackingno === '01' && styles.toggleChipActive]}
                      onPress={() => updateComponent(index, 'MultiTrackingno', '01')}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.toggleText, c.MultiTrackingno === '01' && styles.toggleTextActive]}>
                        Oferta (01)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <Field
                label="Cantidad requerida (RequirementQuantity)"
                value={c.RequirementQuantity}
                onChangeText={(txt) =>
                  updateComponent(index, 'RequirementQuantity', txt.replace(/[^0-9.]/g, ''))
                }
                placeholder="Ej. 2"
                keyboardType="numeric"
              />

              <Field
                label="Almacén (StgeLoc)"
                value={c.StgeLoc}
                onChangeText={(txt) => updateComponent(index, 'StgeLoc', txt)}
                placeholder="BHER"
              />

              <Row label="Planta (Plant)" value={planPlant} />
              <Row label="Activity ligada" value="0010" />
            </View>
          ))}

          <TouchableOpacity style={styles.btnSecondary} onPress={addComponent}>
            <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
            <Text style={styles.btnSecondaryText}>Agregar componente</Text>
          </TouchableOpacity>
        </View>

        {/* Guardar */}
        <Pressable
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          style={({ pressed }) => [
            styles.btnPrimary,
            pressed && styles.btnPrimaryPressed,
            saving && styles.btnPrimaryDisabled,
          ]}
          onPress={onGuardar}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.btnPrimaryContent}>
              <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.btnPrimaryText}>Crear orden de mantenimiento</Text>
            </View>
          )}
        </Pressable>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ===== Modal MultiSelect ===== */}
      <Modal
        visible={multiVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMultiVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar materiales (multi)</Text>
              <TouchableOpacity onPress={() => setMultiVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 12, paddingBottom: 6 }}>
              <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <Ionicons name="search" size={16} color={COLORS.muted} />
                <TextInput
                  style={{ flex: 1, fontSize: 13, color: COLORS.title }}
                  value={multiQuery}
                  onChangeText={setMultiQuery}
                  placeholder="Buscar material..."
                  placeholderTextColor={COLORS.muted}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {!!multiQuery && (
                  <TouchableOpacity onPress={() => setMultiQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={COLORS.muted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingVertical: 8 }}>
              {(() => {
                const c = components[multiIndex] || {};
                const list = c.Materials || [];
                const q = String(multiQuery || '').trim().toLowerCase();

                const filtered = !q
                  ? list
                  : list.filter((m) =>
                      `${m.Descripcion || ''} ${m.Material || ''}`
                        .toLowerCase()
                        .includes(q)
                    );

                return filtered.map((m, idx) => {
                  const selected = (c.MultiSelected || []).some((x) => x.Material === m.Material);
                  const key = m.Id ? `${m.Id}-${idx}` : `mul-${idx}`;

                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.workerRow}
                      onPress={() => {
                        setComponents((prev) =>
                          prev.map((cc, i) => {
                            if (i !== multiIndex) return cc;
                            const curr = cc.MultiSelected || [];
                            const exists = curr.some((x) => x.Material === m.Material);
                            const next = exists
                              ? curr.filter((x) => x.Material !== m.Material)
                              : [...curr, { Material: m.Material, Descripcion: m.Descripcion }];
                            return { ...cc, MultiSelected: next };
                          })
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                        {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workerName}>{m.Descripcion || m.Material}</Text>
                        <Text style={styles.materialCodeText}>{m.Material}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.cardBg }]}
                onPress={() => {
                  if (multiIndex < 0) return;
                  setComponents((prev) =>
                    prev.map((cc, i) => (i === multiIndex ? { ...cc, MultiSelected: [] } : cc))
                  );
                }}
              >
                <Text style={styles.smallBtnText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}
                onPress={() => setMultiVisible(false)}
              >
                <Text style={[styles.smallBtnText, { color: '#fff' }]}>Listo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ========= Subcomponentes ========= */

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value || '—'}</Text>
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

/** Selector de centro de trabajo (técnico) */
const SelectWorkCenter = ({ items, selected, onSelect }) => {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');

  const label = selected
    ? `${selected.Ktext} (${selected.Arbpl})`
    : 'Seleccionar técnico / centro';

  const normalized = (s) => String(s || '').toLowerCase().trim();

  const filteredItems = !query.trim()
    ? items
    : items.filter((wc) => {
        const q = normalized(query);
        return normalized(wc.Ktext).includes(q) || normalized(wc.Arbpl).includes(q);
      });

  return (
    <>
      <TouchableOpacity
        style={[styles.input, styles.multiInput]}
        onPress={() => {
          setVisible(true);
          setQuery('');
        }}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 13, color: selected ? COLORS.title : COLORS.muted }} numberOfLines={2}>
          {label}
        </Text>
        <Ionicons name="chevron-down-outline" size={18} color={COLORS.muted} style={{ marginLeft: 6 }} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar técnico / centro</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 12, paddingBottom: 6 }}>
              <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff' }]}>
                <Ionicons name="search" size={16} color={COLORS.muted} />
                <TextInput
                  style={{ flex: 1, fontSize: 13, color: COLORS.title }}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buscar por nombre o Arbpl..."
                  placeholderTextColor={COLORS.muted}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {!!query && (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={COLORS.muted} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>
                {filteredItems.length} resultado(s)
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingVertical: 8 }}>
              {filteredItems.map((wc, index) => {
                const checked = selected?.Arbpl === wc.Arbpl;
                const key = wc.Arbpl ? `${wc.Arbpl}-${index}` : `wc-${index}`;

                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.workerRow}
                    onPress={() => {
                      onSelect(wc);
                      setVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={styles.workerName}>
                      {wc.Ktext} ({wc.Arbpl})
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {!filteredItems.length && (
                <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ color: COLORS.muted, fontSize: 12 }}>No hay resultados con esa búsqueda.</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.cardBg }]}
                onPress={() => {
                  onSelect(null);
                  setQuery('');
                }}
              >
                <Text style={styles.smallBtnText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}
                onPress={() => setVisible(false)}
              >
                <Text style={[styles.smallBtnText, { color: '#fff' }]}>Listo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

/** Selector de material */
const SelectMaterial = ({ items, value, onSelect, disabled }) => {
  const [visible, setVisible] = useState(false);

  const selectedItem = items.find((m) => m.Material === value) || null;
  const label = disabled
    ? 'Selecciona primero una categoría'
    : selectedItem
    ? `${selectedItem.Descripcion} (${selectedItem.Material})`
    : 'Seleccionar material de catálogo';

  const open = () => {
    if (disabled) return;
    setVisible(true);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.input,
          styles.multiInput,
          disabled && { backgroundColor: '#F0F1F5' },
        ]}
        onPress={open}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <Text
          style={{
            fontSize: 13,
            color: selectedItem && !disabled ? COLORS.title : COLORS.muted,
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
        {!disabled && (
          <Ionicons name="chevron-down-outline" size={18} color={COLORS.muted} style={{ marginLeft: 6 }} />
        )}
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar material</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingVertical: 8 }}>
              {items.map((m, index) => {
                const checked = value === m.Material;
                const key = m.Id ? `${m.Id}-${index}` : `mat-${index}`;

                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.workerRow}
                    onPress={() => {
                      onSelect(m.Material);
                      setVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.workerName}>{m.Descripcion || m.Material}</Text>
                      <Text style={styles.materialCodeText}>{m.Material}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.cardBg }]}
                onPress={() => onSelect('')}
              >
                <Text style={styles.smallBtnText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}
                onPress={() => setVisible(false)}
              >
                <Text style={[styles.smallBtnText, { color: '#fff' }]}>Listo</Text>
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
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 16, paddingBottom: 90 },

  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backText: { marginLeft: 4, color: COLORS.accent, fontWeight: '600' },

  cardHighlight: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...elev(1.2),
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.chipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 11, color: COLORS.title },

  chipSmall: {
    backgroundColor: COLORS.chipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  chipTextSmall: { fontSize: 11, color: COLORS.title },

  mainTitle: { fontSize: 15, fontWeight: '700', color: COLORS.title, marginBottom: 6 },
  mainTitleMuted: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.muted,
    fontStyle: 'italic',
    marginBottom: 6,
  },

  block: { marginTop: 4 },
  infoLabel: { fontSize: 11, color: COLORS.text, opacity: 0.8, marginBottom: 2 },
  infoValue: { fontSize: 13, color: COLORS.title, fontWeight: '600' },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...elev(1),
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.title, marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, color: COLORS.muted, marginBottom: 10 },

  row: { marginBottom: 6 },

  fieldLabel: { fontSize: 13, color: COLORS.text, fontWeight: '600', marginBottom: 4 },

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

  multiInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  dateRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  dateCol: { flex: 1 },
  helpText: { fontSize: 11, color: COLORS.muted, marginTop: 4 },

  opCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#FAFBFF',
  },

  opHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  opTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.title },
  opDeleteBtn: { paddingHorizontal: 6, paddingVertical: 4 },

  btnSecondary: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 8 },
  btnSecondaryText: { marginLeft: 6, color: COLORS.accent, fontWeight: '700', fontSize: 13 },

  btnPrimary: {
    marginTop: 10,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...elev(1.4),
  },
  btnPrimaryPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  btnPrimaryDisabled: { opacity: 0.7 },
  btnPrimaryContent: { flexDirection: 'row', alignItems: 'center' },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },

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
  modalTitle: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  workerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },

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
  checkboxChecked: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },

  workerName: { fontSize: 13, color: COLORS.title },
  materialCodeText: { fontSize: 11, color: COLORS.muted },

  modalFooterRow: { padding: 10, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  smallBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  categoryRow: { marginBottom: 8 },
  categoryChipsWrapper: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#F7F8FC',
    marginRight: 6,
  },
  categoryChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  categoryChipText: { fontSize: 11, color: COLORS.text, fontWeight: '600' },
  categoryChipTextActive: { color: '#fff' },

  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  toggleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#F7F8FC',
  },
  toggleChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  toggleText: { fontSize: 12, fontWeight: '800', color: COLORS.text },
  toggleTextActive: { color: '#fff' },

  btnMini: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  btnMiniText: { color: COLORS.accent, fontWeight: '900' },
});
