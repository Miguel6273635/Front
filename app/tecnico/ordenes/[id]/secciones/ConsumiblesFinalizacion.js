// app/tecnico/ordenes/[id]/secciones/ConsumiblesFinalizacion.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";

import consumiblesPrecargados from "../json.json";

import { bootstrapPrefetchConsumiblesCatalogo } from "../../../../../src/offline/bootstrapConsumiblesCatalogo";
import {
  filterConsumiblesByCategory,
  getConsumiblesCategories,
  loadConsumiblesByCobertura,
  searchConsumibles,
} from "../../../../../src/offline/consumiblesCache";
import {
  getAgrupadoresByCobertura,
  normalizeCoberturaTipo,
} from "../../../../../src/offline/consumiblesAgrupadores";

const DEFAULT_FIORI = {
  surface: "#FFFFFF",
  surfaceAlt: "#F5F7FA",
  border: "#DDE6F2",
  borderSoft: "#E8EEF7",
  text: "#0B1F3B",
  textMuted: "#63718B",
  brand: "#0A6ED1",
  brandSoft: "#E3F2FD",
  ok: "#2FBF71",
  warn: "#F5A623",
  err: "#E74C3C",
};

function safeStr(v) {
  return String(v ?? "").trim();
}

function normUpper(v) {
  return safeStr(v)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function makeRowId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function makeAgrupadorLabel(agr1, agr2) {
  const a1 = normUpper(agr1);
  const a2 = normUpper(agr2);

  if (a1 && a2) return `${a1} - ${a2}`;
  return a1 || a2 || "GENERAL";
}

function getResultsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.data?.d?.results)) return payload.data.d.results;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.value)) return payload.value;

  return [];
}

function getCoverageAgr1(coberturaTipo) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo || "BASICA");

  if (cobertura === "MEDIA") return "MEDIO";
  if (cobertura === "SEMI") return "SEMI";

  return "BASICO";
}

function getRawAgr1(row = {}) {
  return normUpper(
    row?.Agr1 ||
      row?.agr1 ||
      row?.AGR1 ||
      row?.Agrupador1 ||
      row?.agrupador1 ||
      row?.Categoria ||
      row?.categoria ||
      "",
  );
}

function getRawAgr2(row = {}) {
  return normUpper(
    row?.Agr2 ||
      row?.agr2 ||
      row?.AGR2 ||
      row?.Agrupador2 ||
      row?.agrupador2 ||
      row?.Subcategoria ||
      row?.subcategoria ||
      row?.Familia ||
      row?.familia ||
      "",
  );
}

function getCoverageFromAgr1(agr1) {
  const a1 = normUpper(agr1);

  if (a1.includes("MEDIO") || a1.includes("MEDIA")) return "MEDIA";

  if (
    a1.includes("SEMI") ||
    a1.includes("SEMIFULL") ||
    a1.includes("SEMI FULL") ||
    a1.includes("SEMI-FULL") ||
    a1.includes("SEMICOMPLETO") ||
    a1.includes("SEMI_COMPLETO") ||
    a1.includes("SEMI COMPLETO")
  ) {
    return "SEMI";
  }

  return "BASICA";
}

function rowCompatibleWithCoverage(row = {}, coberturaTipo = "BASICA") {
  const cobertura = normalizeCoberturaTipo(coberturaTipo || "BASICA");
  const rowCoverage = getCoverageFromAgr1(getRawAgr1(row));

  if (cobertura === "BASICA") {
    return rowCoverage === "BASICA";
  }

  if (cobertura === "MEDIA") {
    return rowCoverage === "BASICA" || rowCoverage === "MEDIA";
  }

  if (cobertura === "SEMI") {
    return (
      rowCoverage === "BASICA" ||
      rowCoverage === "MEDIA" ||
      rowCoverage === "SEMI"
    );
  }

  return true;
}

function normalizeMaterialFromJson(row = {}, coberturaTipo = "BASICA") {
  const Agr1 = getCoverageAgr1(coberturaTipo);
  const Agr2 = getRawAgr2(row);

  const Material = safeStr(
    row?.Material ||
      row?.material ||
      row?.MATNR ||
      row?.Matnr ||
      row?.matnr ||
      row?.Codigo ||
      row?.codigo ||
      row?.Code ||
      row?.code ||
      "",
  );

  const Description = safeStr(
    row?.Description ||
      row?.description ||
      row?.Descripcion ||
      row?.descripcion ||
      row?.MAKTX ||
      row?.Maktx ||
      row?.maktx ||
      row?.TextoMaterial ||
      row?.textoMaterial ||
      row?.ShortText ||
      row?.shortText ||
      "",
  );

  const Unidad =
    safeStr(
      row?.Unidad ||
        row?.unidad ||
        row?.Unit ||
        row?.unit ||
        row?.MEINS ||
        row?.Meins ||
        row?.meins ||
        row?.BaseUnit ||
        row?.baseUnit ||
        row?.Uom ||
        row?.uom ||
        "",
    ) || "PZA";

  const Centro = safeStr(
    row?.Centro ||
      row?.centro ||
      row?.Plant ||
      row?.plant ||
      row?.WERKS ||
      row?.Werks ||
      row?.werks ||
      "",
  );

  const Categoria = makeAgrupadorLabel(Agr1, Agr2);

  return {
    ...row,
    id: `${Agr1}:${Agr2}:${Material || Description}`.replace(/\s+/g, "_"),

    Agr1,
    agr1: Agr1,
    Agrupador1: Agr1,

    Agr2,
    agr2: Agr2,
    Agrupador2: Agr2,

    Categoria,
    categoria: Categoria,

    Material,
    material: Material,

    Description,
    description: Description,
    Descripcion: Description,

    Unidad,
    unidad: Unidad,

    Centro,
    centro: Centro,

    searchText: normUpper(
      `${Categoria} ${Agr1} ${Agr2} ${Material} ${Description} ${Unidad}`,
    ),
  };
}

function normalizeInitialRow(row = {}) {
  return {
    id: row?.id || makeRowId(),
    Categoria: safeStr(row?.Categoria || row?.categoria || ""),
    Agr1: safeStr(row?.Agr1 || row?.agr1 || row?.Agrupador1 || ""),
    Agr2: safeStr(row?.Agr2 || row?.agr2 || row?.Agrupador2 || ""),
    Material: safeStr(row?.Material || row?.material || row?.codigo || ""),
    Description: safeStr(
      row?.Description || row?.description || row?.Descripcion || "",
    ),
    Cantidad: safeStr(row?.Cantidad || row?.cantidad || "1"),
    Unidad: safeStr(row?.Unidad || row?.unidad || "PZA"),
    Centro: safeStr(row?.Centro || row?.centro || row?.Plant || ""),
  };
}

function buildGroupsFromRows(rows = []) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const Agr1 = normUpper(row?.Agr1 || row?.Agrupador1 || "");
    const Agr2 = normUpper(row?.Agr2 || row?.Agrupador2 || "");

    if (!Agr1 || !Agr2) continue;

    const key = `${Agr1}:${Agr2}`;
    const current =
      map.get(key) ||
      {
        key,
        Agr1,
        Agr2,
        Agrupador1: Agr1,
        Agrupador2: Agr2,
        label: makeAgrupadorLabel(Agr1, Agr2),
        count: 0,
      };

    current.count += 1;
    map.set(key, current);
  }

  return Array.from(map.values()).sort((a, b) =>
    String(a.label || "").localeCompare(String(b.label || "")),
  );
}

function buildLocalCatalogFromJson(coberturaTipo = "BASICA") {
  const rows = getResultsFromPayload(consumiblesPrecargados);

  const normalizedMap = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!rowCompatibleWithCoverage(row, coberturaTipo)) continue;

    const normalized = normalizeMaterialFromJson(row, coberturaTipo);

    if (!normalized.Material && !normalized.Description) continue;

    const key = [
      normalized.Agr1,
      normalized.Agr2,
      normalized.Material,
      normalized.Description,
      normalized.Unidad,
    ].join(":");

    normalizedMap.set(key, normalized);
  }

  const data = Array.from(normalizedMap.values());

  return {
    ok: data.length > 0,
    cobertura: normalizeCoberturaTipo(coberturaTipo || "BASICA"),
    updatedAt: Date.now(),
    count: data.length,
    cachedCount: data.length,
    data,
    groups: buildGroupsFromRows(data),
    source: "json_local",
  };
}

export default function ConsumiblesFinalizacion({
  plant,
  coberturaTipo,
  FIORI: FIORIProp,
  initialRows = [],
  onChange,
}) {
  const FIORI = FIORIProp || DEFAULT_FIORI;

  const mountedRef = useRef(true);
  const refreshingRef = useRef(false);

  const cobertura = useMemo(
    () => normalizeCoberturaTipo(coberturaTipo || "BASICA"),
    [coberturaTipo],
  );

  const [rows, setRows] = useState(() =>
    (Array.isArray(initialRows) ? initialRows : []).map(normalizeInitialRow),
  );

  const [catalog, setCatalog] = useState([]);
  const [groups, setGroups] = useState([]);
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [unidad, setUnidad] = useState("PZA");

  const colors = useMemo(
    () => ({
      surface: FIORI.surface || DEFAULT_FIORI.surface,
      surfaceAlt: FIORI.surfaceAlt || DEFAULT_FIORI.surfaceAlt,
      border: FIORI.border || DEFAULT_FIORI.border,
      borderSoft: FIORI.borderSoft || DEFAULT_FIORI.borderSoft,
      text: FIORI.text || DEFAULT_FIORI.text,
      textMuted: FIORI.textMuted || DEFAULT_FIORI.textMuted,
      brand: FIORI.brand || DEFAULT_FIORI.brand,
      brandSoft: FIORI.brandSoft || DEFAULT_FIORI.brandSoft,
      ok: FIORI.ok || DEFAULT_FIORI.ok,
      warn: FIORI.warn || DEFAULT_FIORI.warn,
      err: FIORI.err || DEFAULT_FIORI.err,
    }),
    [FIORI],
  );

  const categories = useMemo(() => {
    const fromCache = getConsumiblesCategories(catalog);

    if (fromCache.length) return fromCache;

    return getAgrupadoresByCobertura(cobertura).map((x) => x.label);
  }, [catalog, cobertura]);

  const materialsByCategory = useMemo(() => {
    const byCat = filterConsumiblesByCategory(catalog, selectedCategory);
    return searchConsumibles(byCat, materialSearch);
  }, [catalog, selectedCategory, materialSearch]);

  const emitChange = (nextRows) => {
    const normalized = (Array.isArray(nextRows) ? nextRows : []).map(
      normalizeInitialRow,
    );

    setRows(normalized);
    onChange?.(normalized);
  };

  const loadCachedCatalog = async ({ keepLoading = false } = {}) => {
    try {
      if (!keepLoading) setLoadingCatalog(true);

      let cached = await loadConsumiblesByCobertura(cobertura);

      let data = Array.isArray(cached?.data) ? cached.data : [];
      let cachedGroups = Array.isArray(cached?.groups) ? cached.groups : [];
      let updatedAt = cached?.updatedAt || null;

      if (!data.length) {
        const localCatalog = buildLocalCatalogFromJson(cobertura);

        if (localCatalog.data.length) {
          cached = localCatalog;
          data = localCatalog.data;
          cachedGroups = localCatalog.groups;
          updatedAt = localCatalog.updatedAt;

          console.log("[CONSUMIBLES UI] Catálogo cargado desde JSON local:", {
            cobertura,
            count: data.length,
            groups: cachedGroups.length,
          });
        }
      }

      if (!mountedRef.current) return;

      setCatalog(data);
      setGroups(cachedGroups);
      setCatalogUpdatedAt(updatedAt);

      const currentCategories = getConsumiblesCategories(data);
      const fallbackCategories = getAgrupadoresByCobertura(cobertura).map(
        (x) => x.label,
      );

      const nextCategories = currentCategories.length
        ? currentCategories
        : fallbackCategories;

      if (
        nextCategories.length &&
        (!selectedCategory || !nextCategories.includes(selectedCategory))
      ) {
        setSelectedCategory(nextCategories[0]);
      }
    } catch (e) {
      console.log("[CONSUMIBLES UI] Error leyendo cache:", e?.message || e);

      const localCatalog = buildLocalCatalogFromJson(cobertura);

      if (mountedRef.current && localCatalog.data.length) {
        setCatalog(localCatalog.data);
        setGroups(localCatalog.groups);
        setCatalogUpdatedAt(localCatalog.updatedAt);

        const localCategories = getConsumiblesCategories(localCatalog.data);
        if (localCategories.length) setSelectedCategory(localCategories[0]);
      }
    } finally {
      if (mountedRef.current && !keepLoading) setLoadingCatalog(false);
    }
  };

  const refreshCatalogInBackground = async () => {
    if (refreshingRef.current) return;

    refreshingRef.current = true;

    try {
      setRefreshingCatalog(true);

      const net = await NetInfo.fetch();
      const online = !!(net?.isConnected && net?.isInternetReachable !== false);

      if (!online) {
        console.log("[CONSUMIBLES UI] Offline. Se usa cache o JSON local.");
        return;
      }

      const result = await bootstrapPrefetchConsumiblesCatalogo({
        coberturaTipo: cobertura,
      });

      console.log("[CONSUMIBLES UI] Prefetch resultado:", result);

      await loadCachedCatalog({ keepLoading: true });
    } catch (e) {
      console.log(
        "[CONSUMIBLES UI] Error actualizando en segundo plano:",
        e?.message || e,
      );

      await loadCachedCatalog({ keepLoading: true });
    } finally {
      refreshingRef.current = false;
      if (mountedRef.current) setRefreshingCatalog(false);
    }
  };

  const openModal = async () => {
    setModalVisible(true);
    setCategoryOpen(false);
    setMaterialOpen(false);
    setSelectedMaterial(null);
    setMaterialSearch("");
    setCantidad("1");
    setUnidad("PZA");

    await loadCachedCatalog();

    refreshCatalogInBackground();
  };

  const closeModal = () => {
    setModalVisible(false);
    setCategoryOpen(false);
    setMaterialOpen(false);
  };

  const selectCategory = (cat) => {
    setSelectedCategory(cat);
    setSelectedMaterial(null);
    setMaterialSearch("");
    setUnidad("PZA");
    setCategoryOpen(false);
    setMaterialOpen(false);
  };

  const selectMaterial = (mat) => {
    setSelectedMaterial(mat);
    setUnidad(safeStr(mat?.Unidad || mat?.unidad || "PZA") || "PZA");
    setMaterialOpen(false);
  };

  const addConsumible = () => {
    const qty = Number(cantidad);

    if (!selectedCategory) {
      Alert.alert("Categoría", "Selecciona una categoría.");
      return;
    }

    if (!selectedMaterial) {
      Alert.alert("Material", "Selecciona un material.");
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert("Cantidad", "La cantidad debe ser mayor a 0.");
      return;
    }

    const nextRow = normalizeInitialRow({
      id: makeRowId(),
      Categoria: selectedCategory,
      Agr1: selectedMaterial?.Agr1 || selectedMaterial?.Agrupador1 || "",
      Agr2: selectedMaterial?.Agr2 || selectedMaterial?.Agrupador2 || "",
      Material: selectedMaterial?.Material || selectedMaterial?.material || "",
      Description:
        selectedMaterial?.Description ||
        selectedMaterial?.description ||
        selectedMaterial?.Descripcion ||
        "",
      Cantidad: String(cantidad || "1").trim(),
      Unidad: unidad || selectedMaterial?.Unidad || "PZA",
      Centro: safeStr(plant || selectedMaterial?.Centro || ""),
    });

    emitChange([...(rows || []), nextRow]);
    closeModal();
  };

  const removeConsumible = (id) => {
    emitChange((rows || []).filter((r) => String(r.id) !== String(id)));
  };

  useEffect(() => {
    mountedRef.current = true;

    loadCachedCatalog().then(() => {
      refreshCatalogInBackground();
    });

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobertura]);

  useEffect(() => {
    emitChange(
      (Array.isArray(initialRows) ? initialRows : []).map(normalizeInitialRow),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastSyncLabel = catalogUpdatedAt
    ? new Date(catalogUpdatedAt).toLocaleString()
    : "Sin precarga";

  const groupsWithData = groups.filter((g) => Number(g?.count || 0) > 0).length;
  const groupsTotal =
    groups.length || getAgrupadoresByCobertura(cobertura).length;

  return (
    <View style={[localStyles.container, { borderColor: colors.border }]}>
      <View style={localStyles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[localStyles.title, { color: colors.text }]}>
            Consumibles
          </Text>

          <Text style={[localStyles.subtitle, { color: colors.textMuted }]}>
            Catálogo: {catalog.length} materiales · {groupsWithData}/
            {groupsTotal} grupos · {lastSyncLabel}
          </Text>

          <Text style={[localStyles.subtitle, { color: colors.textMuted }]}>
            Cobertura: {String(coberturaTipo || cobertura)}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          onPress={openModal}
          style={[localStyles.addBtn, { backgroundColor: colors.brand }]}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={localStyles.addBtnText}>Agregar</Text>
        </TouchableOpacity>
      </View>

      {refreshingCatalog ? (
        <View style={localStyles.syncRow}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={[localStyles.syncText, { color: colors.textMuted }]}>
            Actualizando materiales por agrupador en segundo plano…
          </Text>
        </View>
      ) : null}

      {!rows.length ? (
        <View
          style={[
            localStyles.emptyBox,
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.borderSoft,
            },
          ]}
        >
          <Text style={[localStyles.emptyText, { color: colors.textMuted }]}>
            No hay consumibles agregados.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {rows.map((row) => (
            <View
              key={row.id}
              style={[
                localStyles.rowCard,
                {
                  borderColor: colors.borderSoft,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.rowTitle, { color: colors.text }]}>
                  {row.Material || "Sin material"}
                </Text>

                <Text style={[localStyles.rowSub, { color: colors.textMuted }]}>
                  {row.Description || row.Categoria || "—"}
                </Text>

                <Text style={[localStyles.rowQty, { color: colors.text }]}>
                  Cantidad: {row.Cantidad} {row.Unidad}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => removeConsumible(row.id)}
                style={[
                  localStyles.removeBtn,
                  {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.borderSoft,
                  },
                ]}
              >
                <Ionicons name="trash-outline" size={18} color={colors.err} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={localStyles.backdrop}>
          <View
            style={[
              localStyles.modalCard,
              { backgroundColor: colors.surface },
            ]}
          >
            <View style={localStyles.modalHeader}>
              <Text style={[localStyles.modalTitle, { color: colors.text }]}>
                Agregar consumible
              </Text>

              <TouchableOpacity
                onPress={closeModal}
                style={[
                  localStyles.closeBtn,
                  {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.borderSoft,
                  },
                ]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[localStyles.label, { color: colors.text }]}>
              Categoría / Agrupador
            </Text>

            <TouchableOpacity
              style={[
                localStyles.selectBox,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setCategoryOpen((v) => !v)}
              activeOpacity={0.88}
            >
              <Text
                style={[localStyles.selectText, { color: colors.text }]}
                numberOfLines={1}
              >
                {selectedCategory || "Selecciona una categoría"}
              </Text>

              <Ionicons
                name={categoryOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.text}
              />
            </TouchableOpacity>

            {categoryOpen ? (
              <View
                style={[localStyles.dropdown, { borderColor: colors.border }]}
              >
                {loadingCatalog ? (
                  <LoadingSmall colors={colors} text="Cargando categorías..." />
                ) : categories.length ? (
                  <FlatList
                    data={categories}
                    keyExtractor={(item) => item}
                    style={{ maxHeight: 170 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={localStyles.optionRow}
                        onPress={() => selectCategory(item)}
                      >
                        <Text
                          style={[
                            localStyles.optionText,
                            { color: colors.text },
                          ]}
                        >
                          {item}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                ) : (
                  <EmptyCatalog
                    colors={colors}
                    text={`No hay categorías para la cobertura ${cobertura}.`}
                  />
                )}
              </View>
            ) : null}

            <Text style={[localStyles.label, { color: colors.text }]}>
              Material
            </Text>

            <TouchableOpacity
              style={[
                localStyles.selectBox,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setMaterialOpen((v) => !v)}
              activeOpacity={0.88}
              disabled={!selectedCategory}
            >
              <Text
                style={[localStyles.selectText, { color: colors.text }]}
                numberOfLines={1}
              >
                {selectedMaterial
                  ? `${selectedMaterial.Material} ${
                      selectedMaterial.Description || ""
                    }`.trim()
                  : "Selecciona un material"}
              </Text>

              <Ionicons
                name={materialOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.text}
              />
            </TouchableOpacity>

            {materialOpen ? (
              <View
                style={[localStyles.dropdown, { borderColor: colors.border }]}
              >
                <TextInput
                  value={materialSearch}
                  onChangeText={setMaterialSearch}
                  placeholder="Buscar material..."
                  placeholderTextColor={colors.textMuted}
                  style={[
                    localStyles.searchInput,
                    {
                      borderColor: colors.borderSoft,
                      color: colors.text,
                    },
                  ]}
                />

                {loadingCatalog ? (
                  <LoadingSmall colors={colors} text="Cargando materiales..." />
                ) : materialsByCategory.length ? (
                  <FlatList
                    data={materialsByCategory}
                    keyExtractor={(item, idx) =>
                      `${item?.Agr1 || ""}_${item?.Agr2 || ""}_${
                        item?.Material || item?.Description || "mat"
                      }_${idx}`
                    }
                    style={{ maxHeight: 190 }}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={localStyles.materialRow}
                        onPress={() => selectMaterial(item)}
                      >
                        <Text
                          style={[
                            localStyles.materialTitle,
                            { color: colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {item?.Material || "Sin código"}
                        </Text>

                        <Text
                          style={[
                            localStyles.materialDesc,
                            { color: colors.textMuted },
                          ]}
                          numberOfLines={2}
                        >
                          {item?.Description ||
                            item?.description ||
                            item?.Descripcion ||
                            "Sin descripción"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                ) : (
                  <View style={localStyles.emptyCatalogBox}>
                    <Text
                      style={[
                        localStyles.emptyText,
                        { color: colors.textMuted },
                      ]}
                    >
                      No hay materiales para este agrupador.
                    </Text>

                    <TouchableOpacity
                      onPress={refreshCatalogInBackground}
                      style={[
                        localStyles.retryBtn,
                        {
                          backgroundColor: colors.brandSoft,
                          borderColor: colors.borderSoft,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          localStyles.retryText,
                          { color: colors.brand },
                        ]}
                      >
                        Actualizar catálogo
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : null}

            <View style={localStyles.qtyRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.label, { color: colors.text }]}>
                  Cantidad
                </Text>

                <TextInput
                  value={cantidad}
                  onChangeText={setCantidad}
                  keyboardType="numeric"
                  style={[
                    localStyles.input,
                    { borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[localStyles.label, { color: colors.text }]}>
                  Unidad
                </Text>

                <TextInput
                  value={unidad}
                  onChangeText={setUnidad}
                  autoCapitalize="characters"
                  style={[
                    localStyles.input,
                    { borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>
            </View>

            <View style={localStyles.footerRow}>
              <TouchableOpacity
                style={[
                  localStyles.cancelBtn,
                  {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                  },
                ]}
                onPress={closeModal}
              >
                <Text
                  style={[localStyles.cancelText, { color: colors.text }]}
                >
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  localStyles.saveBtn,
                  {
                    backgroundColor: selectedMaterial
                      ? colors.brand
                      : "#AFCBEA",
                  },
                ]}
                onPress={addConsumible}
                disabled={!selectedMaterial}
              >
                <Text style={localStyles.saveText}>Agregar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LoadingSmall({ colors, text }) {
  return (
    <View style={localStyles.loadingSmall}>
      <ActivityIndicator size="small" color={colors.brand} />

      <Text style={[localStyles.loadingText, { color: colors.textMuted }]}>
        {text}
      </Text>
    </View>
  );
}

function EmptyCatalog({ colors, text }) {
  return (
    <View style={localStyles.emptyCatalogBox}>
      <Text style={[localStyles.emptyText, { color: colors.textMuted }]}>
        {text || "No hay catálogo precargado."}
      </Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
  },
  addBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
  syncRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  rowCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "900",
  },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
  },
  rowQty: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "900",
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 14,
    padding: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "900",
  },
  selectBox: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  dropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  optionRow: {
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EEF7",
  },
  optionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  searchInput: {
    minHeight: 38,
    borderBottomWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: "700",
  },
  materialRow: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EEF7",
  },
  materialTitle: {
    fontSize: 12,
    fontWeight: "900",
  },
  materialDesc: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
  },
  loadingSmall: {
    minHeight: 86,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyCatalogBox: {
    minHeight: 86,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    gap: 8,
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 12,
    fontWeight: "900",
  },
  qtyRow: {
    flexDirection: "row",
    gap: 10,
  },
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "800",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: "900",
  },
  saveBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
});