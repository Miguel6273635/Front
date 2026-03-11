import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../../../../src/services/api";

/**
 * ✅ Cobertura -> pares (Agrupador1, Agrupador2)
 */
const COVERAGE_PAIRS = {
  BASICA: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },
  ],
  MEDIA: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },

    { Agr1: "MEDIO", Agr2: "FUSIBLE_TC" },
    { Agr1: "MEDIO", Agr2: "MECHAS" },
    { Agr1: "MEDIO", Agr2: "DESLIZADOR" },
    { Agr1: "MEDIO", Agr2: "FOCOS" },
    { Agr1: "MEDIO", Agr2: "LAMPARA" },
    { Agr1: "MEDIO", Agr2: "LAMP_EMERG" },
    { Agr1: "MEDIO", Agr2: "PLAST_CABI" },
    { Agr1: "MEDIO", Agr2: "PLAST_CONT" },
    { Agr1: "MEDIO", Agr2: "BATERIA_RE" },
    { Agr1: "MEDIO", Agr2: "CAM_ACEITE" },
    { Agr1: "MEDIO", Agr2: "MICROSWICH" },
    { Agr1: "MEDIO", Agr2: "CABLE_ELEC" },
  ],
  SEMI: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },

    { Agr1: "MEDIO", Agr2: "FUSIBLE_TC" },
    { Agr1: "MEDIO", Agr2: "MECHAS" },
    { Agr1: "MEDIO", Agr2: "DESLIZADOR" },
    { Agr1: "MEDIO", Agr2: "FOCOS" },
    { Agr1: "MEDIO", Agr2: "LAMPARA" },
    { Agr1: "MEDIO", Agr2: "LAMP_EMERG" },
    { Agr1: "MEDIO", Agr2: "PLAST_CABI" },
    { Agr1: "MEDIO", Agr2: "PLAST_CONT" },
    { Agr1: "MEDIO", Agr2: "BATERIA_RE" },
    { Agr1: "MEDIO", Agr2: "CAM_ACEITE" },
    { Agr1: "MEDIO", Agr2: "MICROSWICH" },
    { Agr1: "MEDIO", Agr2: "CABLE_ELEC" },

    { Agr1: "SEMIFULL", Agr2: "EXEN_COLGA" },
    { Agr1: "SEMIFULL", Agr2: "VENTI_CABIN" },
    { Agr1: "SEMIFULL", Agr2: "ACEITERAS" },
    { Agr1: "SEMIFULL", Agr2: "BALASTRAS" },
    { Agr1: "SEMIFULL", Agr2: "MICRO_SEGU" },
    { Agr1: "SEMIFULL", Agr2: "INTERLOCK" },
    { Agr1: "SEMIFULL", Agr2: "BAND_MOTOR" },
    { Agr1: "SEMIFULL", Agr2: "GOMA_CABI" },
    { Agr1: "SEMIFULL", Agr2: "GOMA_TOPE" },
    { Agr1: "SEMIFULL", Agr2: "CABLE_ACER" },
    { Agr1: "SEMIFULL", Agr2: "RETEN_ACEI" },
    { Agr1: "SEMIFULL", Agr2: "TRANF_ENER" },
  ],
};

const uniqBy = (arr, keyFn) => {
  const map = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!map.has(k)) map.set(k, x);
  }
  return Array.from(map.values());
};

const pairId = (p) =>
  `${String(p?.Agr1 || "").trim().toUpperCase()}__${String(p?.Agr2 || "")
    .trim()
    .toUpperCase()}`;

const pairLabel = (p) =>
  `${String(p?.Agr1 || "").trim().toUpperCase()} · ${String(p?.Agr2 || "")
    .trim()
    .toUpperCase()}`;

export default function ConsumiblesFinalizacion({
  plant,
  coberturaTipo,
  stylesGlobal,
  FIORI,
  onChange,
}) {
  const s = stylesGlobal || localStyles;
  const P = FIORI || {};

  const coverageKey = String(coberturaTipo || "").trim().toUpperCase();

  const pairsForCoverage = useMemo(() => {
    if (coverageKey === "MEDIA") return COVERAGE_PAIRS.MEDIA;
    if (coverageKey === "SEMI") return COVERAGE_PAIRS.SEMI;
    if (coverageKey === "BASICA") return COVERAGE_PAIRS.BASICA;
    return COVERAGE_PAIRS.BASICA;
  }, [coverageKey]);

  const [selected, setSelected] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedPairId, setSelectedPairId] = useState("");
  const [pairPickerOpen, setPairPickerOpen] = useState(false);

  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState(null);

  const [qtyDraft, setQtyDraft] = useState("1");
  const [unitDraft, setUnitDraft] = useState("PZA");

  const [editingKey, setEditingKey] = useState(null);

  const loadIdRef = useRef(0);

  useEffect(() => {
    onChange?.(selected);
  }, [selected, onChange]);

  useEffect(() => {
    setSelectedPairId("");
    setMaterials([]);
    setSelectedMaterial(null);
    setMaterialSearch("");
    setQtyDraft("1");
    setUnitDraft("PZA");
    setPairPickerOpen(false);
    setMaterialPickerOpen(false);
  }, [coverageKey]);

  const selectedPair = useMemo(() => {
    return pairsForCoverage.find((p) => pairId(p) === selectedPairId) || null;
  }, [pairsForCoverage, selectedPairId]);

  useEffect(() => {
    let mounted = true;
    const myLoadId = ++loadIdRef.current;

    (async () => {
      setMaterials([]);
      setSelectedMaterial(null);

      if (!selectedPair) return;

      setLoadingMaterials(true);
      try {
        const a1 = String(selectedPair.Agr1 || "").trim().toUpperCase();
        const a2 = String(selectedPair.Agr2 || "").trim().toUpperCase();

        const url =
          `/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet` +
          `?$filter=Agrupador1 eq '${a1}' and Agrupador2 eq '${a2}'`;

        const res = await api.get(url);

        if (!mounted || myLoadId !== loadIdRef.current) return;

        const rows = res?.data?.d?.results || res?.data?.results || [];

        const all = rows.map((r) => ({
          Id: String(r?.Id || "").trim(),
          Material: String(r?.Material || "").trim(),
          Agrupador1: a1,
          Agrupador2: a2,
          Descripcion: String(r?.Descripcion || r?.Description || "").trim(),
        }));

        const deduped = uniqBy(
          all.filter((x) => x.Material),
          (x) => `${x.Material}__${x.Descripcion}__${x.Agrupador1}__${x.Agrupador2}`
        );

        if (mounted && myLoadId === loadIdRef.current) {
          setMaterials(deduped);
        }
      } catch (e) {
        if (mounted && myLoadId === loadIdRef.current) {
          setMaterials([]);
        }
      } finally {
        if (mounted && myLoadId === loadIdRef.current) {
          setLoadingMaterials(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedPair]);

  const filteredMaterials = useMemo(() => {
    const qq = String(materialSearch || "").toUpperCase().trim();
    if (!qq) return materials;

    return materials.filter((m) => {
      const hay = `${m.Material} ${m.Descripcion} ${m.Agrupador1} ${m.Agrupador2}`.toUpperCase();
      return hay.includes(qq);
    });
  }, [materials, materialSearch]);

  const resetForm = () => {
    setSelectedPairId("");
    setMaterials([]);
    setSelectedMaterial(null);
    setMaterialSearch("");
    setQtyDraft("1");
    setUnitDraft("PZA");
    setEditingKey(null);
    setPairPickerOpen(false);
    setMaterialPickerOpen(false);
  };

  const openAddModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const closeAddModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const buildSelectedKey = (item) =>
    `${String(item?.Material || "").trim()}__${String(item?.Agrupador1 || "")
      .trim()
      .toUpperCase()}__${String(item?.Agrupador2 || "").trim().toUpperCase()}`;

  const handleEditItem = (item) => {
    setEditingKey(buildSelectedKey(item));
    setSelectedPairId(
      pairId({
        Agr1: item?.Agrupador1,
        Agr2: item?.Agrupador2,
      })
    );
    setSelectedMaterial({
      Material: String(item?.Material || "").trim(),
      Descripcion: String(item?.Descripcion || "").trim(),
      Agrupador1: String(item?.Agrupador1 || "").trim().toUpperCase(),
      Agrupador2: String(item?.Agrupador2 || "").trim().toUpperCase(),
    });
    setQtyDraft(String(item?.Cantidad || "1"));
    setUnitDraft(String(item?.Unidad || "PZA"));
    setModalOpen(true);
  };

  const handleDeleteItem = (item) => {
    const key = buildSelectedKey(item);
    setSelected((prev) => prev.filter((x) => buildSelectedKey(x) !== key));
  };

  const handleSaveItem = () => {
    if (!selectedPair) return;
    if (!selectedMaterial?.Material) return;

    const qClean = String(qtyDraft || "")
      .replace(",", ".")
      .replace(/[^0-9.]/g, "")
      .trim();

    const uClean = String(unitDraft || "").trim().toUpperCase() || "PZA";

    const row = {
      Material: String(selectedMaterial.Material || "").trim(),
      Descripcion: String(selectedMaterial.Descripcion || "").trim(),
      Agrupador1: String(selectedMaterial.Agrupador1 || "").trim().toUpperCase(),
      Agrupador2: String(selectedMaterial.Agrupador2 || "").trim().toUpperCase(),
      Cantidad: qClean || "1",
      Unidad: uClean,
      Centro: plant || "",
      Almacen: "BSAT",
    };

    const rowKey = buildSelectedKey(row);

    setSelected((prev) => {
      const exists = prev.some((x) => buildSelectedKey(x) === rowKey);

      if (editingKey) {
        return prev.map((x) => (buildSelectedKey(x) === editingKey ? row : x));
      }

      if (exists) {
        return prev.map((x) => (buildSelectedKey(x) === rowKey ? row : x));
      }

      return [...prev, row];
    });

    closeAddModal();
  };

  return (
    <View style={[localStyles.card, { borderColor: P.border || "#DDE6F2" }]}>
      <View style={localStyles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[localStyles.title, { color: P.text || "#0B1F3B" }]}>Consumibles</Text>
          <Text style={localStyles.helperText}>
            Agrega uno por uno.
          </Text>
        </View>

        <TouchableOpacity
          style={[localStyles.addBtn, { backgroundColor: P.brand || "#0A6ED1" }]}
          onPress={openAddModal}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={localStyles.addBtnText}>Agregar</Text>
        </TouchableOpacity>
      </View>

      <View style={localStyles.metaRow}>
        <Text style={localStyles.metaLabel}>Cobertura:</Text>
        <Text style={localStyles.metaValue}>{coverageKey || "—"}</Text>
        <Text style={[localStyles.metaLabel, { marginLeft: 12 }]}>Centro:</Text>
        <Text style={localStyles.metaValue}>{plant || "—"}</Text>
      </View>

      {!selected.length ? (
        <View style={localStyles.emptyBox}>
          <Ionicons name="cube-outline" size={22} color="#63718B" />
          <Text style={localStyles.emptyText}>
            No has agregado consumibles todavía.
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 12, gap: 10 }}>
          {selected.map((item, idx) => (
            <View key={`${buildSelectedKey(item)}-${idx}`} style={localStyles.selectedCard}>
              <View style={{ flex: 1 }}>
                <Text style={localStyles.selectedCode}>{item.Material}</Text>
                <Text style={localStyles.selectedDesc}>{item.Descripcion || "Sin descripción"}</Text>
                <Text style={localStyles.selectedMeta}>
                  Categoría: {item.Agrupador1} · {item.Agrupador2}
                </Text>
                <Text style={localStyles.selectedMeta}>
                  Cantidad: {item.Cantidad} {item.Unidad}
                </Text>
              </View>

              <View style={localStyles.actionsCol}>
                <TouchableOpacity
                  style={localStyles.iconBtn}
                  onPress={() => handleEditItem(item)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="create-outline" size={18} color="#0A6ED1" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={localStyles.iconBtn}
                  onPress={() => handleDeleteItem(item)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAddModal}
      >
        <Pressable style={localStyles.modalBackdrop} onPress={closeAddModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={localStyles.modalCenter}
          >
            <Pressable
              style={[localStyles.modalCard, { borderColor: P.border || "#DDE6F2" }]}
              onPress={() => {}}
            >
              <View style={localStyles.modalHeader}>
                <Text style={[localStyles.modalTitle, { color: P.text || "#0B1F3B" }]}>
                  {editingKey ? "Editar consumible" : "Agregar consumible"}
                </Text>

                <TouchableOpacity onPress={closeAddModal} style={localStyles.modalCloseBtn}>
                  <Ionicons name="close" size={18} color="#0B1F3B" />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={localStyles.fieldLabel}>Categoría</Text>

                <TouchableOpacity
                  style={localStyles.selector}
                  onPress={() => setPairPickerOpen((v) => !v)}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      localStyles.selectorText,
                      !selectedPair ? localStyles.placeholderText : null,
                    ]}
                  >
                    {selectedPair ? pairLabel(selectedPair) : "Selecciona una categoría"}
                  </Text>
                  <Ionicons
                    name={pairPickerOpen ? "chevron-up-outline" : "chevron-down-outline"}
                    size={18}
                    color="#63718B"
                  />
                </TouchableOpacity>

                {pairPickerOpen ? (
                  <View style={localStyles.dropdownBox}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                      {pairsForCoverage.map((p) => {
                        const id = pairId(p);
                        const active = id === selectedPairId;

                        return (
                          <TouchableOpacity
                            key={id}
                            style={[localStyles.dropdownItem, active && localStyles.dropdownItemActive]}
                            onPress={() => {
                              setSelectedPairId(id);
                              setPairPickerOpen(false);
                              setSelectedMaterial(null);
                              setMaterialSearch("");
                            }}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                localStyles.dropdownItemText,
                                active && localStyles.dropdownItemTextActive,
                              ]}
                            >
                              {pairLabel(p)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                <Text style={[localStyles.fieldLabel, { marginTop: 12 }]}>Material</Text>

                <TouchableOpacity
                  style={[
                    localStyles.selector,
                    !selectedPair && { opacity: 0.55 },
                  ]}
                  onPress={() => {
                    if (!selectedPair) return;
                    setMaterialPickerOpen((v) => !v);
                  }}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      localStyles.selectorText,
                      !selectedMaterial ? localStyles.placeholderText : null,
                    ]}
                    numberOfLines={2}
                  >
                    {selectedMaterial
                      ? `${selectedMaterial.Material} · ${selectedMaterial.Descripcion || "Sin descripción"}`
                      : "Selecciona un material"}
                  </Text>
                  <Ionicons
                    name={materialPickerOpen ? "chevron-up-outline" : "chevron-down-outline"}
                    size={18}
                    color="#63718B"
                  />
                </TouchableOpacity>

                {!selectedPair ? (
                  <Text style={localStyles.helperMini}>
                    Primero selecciona una categoría.
                  </Text>
                ) : null}

                {selectedPair && materialPickerOpen ? (
                  <View style={localStyles.dropdownBox}>
                    <TextInput
                      value={materialSearch}
                      onChangeText={setMaterialSearch}
                      placeholder="Buscar material..."
                      placeholderTextColor="#63718B"
                      style={localStyles.searchInput}
                    />

                    {loadingMaterials ? (
                      <View style={{ paddingVertical: 16, alignItems: "center" }}>
                        <ActivityIndicator />
                        <Text style={localStyles.helperMini}>Cargando materiales…</Text>
                      </View>
                    ) : filteredMaterials.length === 0 ? (
                      <Text style={[localStyles.helperMini, { padding: 12 }]}>
                        No se encontraron materiales para esta categoría.
                      </Text>
                    ) : (
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }}>
                        {filteredMaterials.map((item, idx) => {
                          const active =
                            selectedMaterial?.Material === item.Material &&
                            String(selectedMaterial?.Agrupador1 || "").toUpperCase() ===
                              String(item.Agrupador1 || "").toUpperCase() &&
                            String(selectedMaterial?.Agrupador2 || "").toUpperCase() ===
                              String(item.Agrupador2 || "").toUpperCase();

                          return (
                            <TouchableOpacity
                              key={`${item.Material}-${item.Agrupador1}-${item.Agrupador2}-${idx}`}
                              style={[
                                localStyles.dropdownItem,
                                active && localStyles.dropdownItemActive,
                              ]}
                              onPress={() => {
                                setSelectedMaterial(item);
                                setMaterialPickerOpen(false);
                              }}
                              activeOpacity={0.9}
                            >
                              <Text
                                style={[
                                  localStyles.dropdownItemText,
                                  active && localStyles.dropdownItemTextActive,
                                ]}
                              >
                                {item.Material}
                              </Text>
                              <Text
                                style={[
                                  localStyles.dropdownItemSub,
                                  active && { color: "#fff" },
                                ]}
                              >
                                {item.Descripcion || "Sin descripción"}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                ) : null}

                <View style={localStyles.formRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={localStyles.fieldLabel}>Cantidad</Text>
                    <TextInput
                      value={qtyDraft}
                      onChangeText={setQtyDraft}
                      keyboardType="numeric"
                      placeholder="1"
                      placeholderTextColor="#63718B"
                      style={localStyles.textInput}
                    />
                  </View>

                  <View style={{ width: 12 }} />

                  <View style={{ flex: 1 }}>
                    <Text style={localStyles.fieldLabel}>Unidad</Text>
                    <TextInput
                      value={unitDraft}
                      onChangeText={setUnitDraft}
                      placeholder="PZA"
                      placeholderTextColor="#63718B"
                      autoCapitalize="characters"
                      style={localStyles.textInput}
                    />
                  </View>
                </View>

                <View style={localStyles.modalActions}>
                  <TouchableOpacity
                    onPress={closeAddModal}
                    style={localStyles.btnGhost}
                    activeOpacity={0.9}
                  >
                    <Text style={localStyles.btnGhostTxt}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSaveItem}
                    style={[
                      localStyles.btnPrimary,
                      (!selectedPair || !selectedMaterial) && { opacity: 0.55 },
                    ]}
                    activeOpacity={0.9}
                    disabled={!selectedPair || !selectedMaterial}
                  >
                    <Text style={localStyles.btnPrimaryTxt}>
                      {editingKey ? "Guardar cambios" : "Agregar"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  title: {
    fontSize: 14,
    fontWeight: "900",
  },

  helperText: {
    marginTop: 4,
    color: "#63718B",
    fontSize: 12,
    fontWeight: "700",
  },

  addBtn: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  addBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },

  metaLabel: {
    color: "#63718B",
    fontWeight: "800",
    fontSize: 12,
  },

  metaValue: {
    color: "#0B1F3B",
    fontWeight: "900",
    fontSize: 12,
  },

  emptyBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#E8EEF7",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F7F9FC",
  },

  emptyText: {
    color: "#63718B",
    fontWeight: "700",
    textAlign: "center",
  },

  selectedCard: {
    borderWidth: 1,
    borderColor: "#E8EEF7",
    borderRadius: 12,
    backgroundColor: "#F7F7F7",
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  selectedCode: {
    color: "#0B1F3B",
    fontWeight: "900",
    fontSize: 13,
  },

  selectedDesc: {
    color: "#0B1F3B",
    fontWeight: "700",
    marginTop: 2,
  },

  selectedMeta: {
    color: "#63718B",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  actionsCol: {
    gap: 8,
  },

  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  modalCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  modalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "88%",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  modalTitle: {
    fontSize: 15,
    fontWeight: "900",
  },

  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E8EEF7",
    alignItems: "center",
    justifyContent: "center",
  },

  fieldLabel: {
    color: "#0B1F3B",
    fontWeight: "900",
    fontSize: 12,
    marginBottom: 6,
    marginTop: 4,
  },

  selector: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    backgroundColor: "#F5F7FA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  selectorText: {
    flex: 1,
    color: "#0B1F3B",
    fontWeight: "800",
    fontSize: 13,
  },

  placeholderText: {
    color: "#63718B",
  },

  dropdownBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },

  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF3FA",
  },

  dropdownItemActive: {
    backgroundColor: "#0A6ED1",
  },

  dropdownItemText: {
    color: "#0B1F3B",
    fontWeight: "800",
    fontSize: 13,
  },

  dropdownItemTextActive: {
    color: "#fff",
  },

  dropdownItemSub: {
    color: "#63718B",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  searchInput: {
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF7",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0B1F3B",
    fontWeight: "700",
  },

  helperMini: {
    marginTop: 6,
    color: "#63718B",
    fontSize: 11,
    fontWeight: "700",
  },

  formRow: {
    flexDirection: "row",
    marginTop: 12,
  },

  textInput: {
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontWeight: "800",
    backgroundColor: "#fff",
    color: "#0B1F3B",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },

  btnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    backgroundColor: "#F5F7FA",
  },

  btnGhostTxt: {
    fontWeight: "900",
    color: "#0B1F3B",
  },

  btnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0A6ED1",
  },

  btnPrimaryTxt: {
    fontWeight: "900",
    color: "#fff",
  },
});