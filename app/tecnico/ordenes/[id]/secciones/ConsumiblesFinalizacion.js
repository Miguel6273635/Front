// app/ordenes/[id]/secciones/ConsumiblesFinalizacion.js
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
} from "react-native";
import api from "../../../../../src/services/api";

const AGR1_FIXED = "BASICO";

const AGR2_OPTIONS = [
  "GRASAS",
  "DIELECTRICO",
  "ACEITE",
  "TRAPO",
  "ESTOPA",
  "BANDAMOTOR",
  "CADENTRACC",
  "FUSIBLE",
  "DEMARESCAL",
  "PEINES",
  "TORNILLESP",
  "BOBINAFREN",
  "CONTACTOR",
  "MICROSWTCH",
  "BUJESESCAL",
  "BOTONPAROS",
];

const uniqBy = (arr, keyFn) => {
  const map = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!map.has(k)) map.set(k, x);
  }
  return Array.from(map.values());
};

export default function ConsumiblesFinalizacion({
  plant, // centro (opcional)
  stylesGlobal, // opcional
  FIORI, // opcional
  onChange, // (selectedRows) => void
}) {
  const [agr2Selected, setAgr2Selected] = useState([]); // multi
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [q, setQ] = useState("");

  // seleccionados con cantidad
  const [selected, setSelected] = useState([]);
  // { Material, Descripcion, Agrupador1, Agrupador2, Cantidad, Unidad, Centro, Almacen }

  // ✅ Modal para capturar cantidad/unidad centrado
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [editingMat, setEditingMat] = useState(null); // {Material,Agrupador2,...}
  const [qtyDraft, setQtyDraft] = useState("1");
  const [unitDraft, setUnitDraft] = useState("PZA");

  // ✅ NUEVO: evita que respuestas viejas "pisen" a las nuevas cuando seleccionas varios chips
  const loadIdRef = useRef(0);

  // Propagar seleccionados al padre
  useEffect(() => {
    onChange?.(selected);
  }, [selected, onChange]);

  // ✅ Cargar materiales al cambiar Agr2 (en paralelo + protección de carrera)
  useEffect(() => {
    let mounted = true;
    const myLoadId = ++loadIdRef.current;

    (async () => {
      setMaterials([]);
      if (!agr2Selected.length) return;

      setLoadingMaterials(true);
      try {
        const a2List = agr2Selected.map((a2) =>
          String(a2).trim().toUpperCase(),
        );

        const urls = a2List.map(
          (a2Safe) =>
            `/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet` +
            `?$filter=Agrupador1 eq '${AGR1_FIXED}' and Agrupador2 eq '${a2Safe}'`,
        );

        const responses = await Promise.all(urls.map((u) => api.get(u)));

        // Si ya hubo otra carga más nueva, ignora esta
        if (!mounted || myLoadId !== loadIdRef.current) return;

        const all = [];
        for (const res of responses) {
          const rows = res?.data?.d?.results || res?.data?.results || [];
          for (const r of rows) {
            all.push({
              Id: String(r?.Id || "").trim(),
              Material: String(r?.Material || "").trim(),
              Agrupador1: AGR1_FIXED,
              Agrupador2: String(r?.Agrupador2 || "").trim(),
              Descripcion: String(
                r?.Descripcion || r?.Description || "",
              ).trim(),
            });
          }
        }

        const deduped = uniqBy(
          all.filter((x) => x.Material),
          (x) => `${x.Material}__${x.Descripcion}__${x.Agrupador2}`,
        );

        if (mounted && myLoadId === loadIdRef.current) setMaterials(deduped);
      } catch (e) {
        if (mounted && myLoadId === loadIdRef.current) setMaterials([]);
      } finally {
        if (mounted && myLoadId === loadIdRef.current)
          setLoadingMaterials(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [agr2Selected]);

  const filtered = useMemo(() => {
    const qq = String(q || "")
      .toUpperCase()
      .trim();
    if (!qq) return materials;
    return materials.filter((m) => {
      const hay =
        `${m.Material} ${m.Descripcion} ${m.Agrupador2}`.toUpperCase();
      return hay.includes(qq);
    });
  }, [materials, q]);

  const toggleAgr2 = (val) => {
    const v = String(val).trim().toUpperCase();
    setAgr2Selected((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  const isSelectedMat = (mat) =>
    selected.some(
      (s) => s.Material === mat.Material && s.Agrupador2 === mat.Agrupador2,
    );

  const openQtyModalFor = (mat) => {
    const sel = selected.find(
      (s) => s.Material === mat.Material && s.Agrupador2 === mat.Agrupador2,
    );
    setEditingMat(mat);
    setQtyDraft(sel?.Cantidad ?? "1");
    setUnitDraft(sel?.Unidad ?? "PZA");
    setQtyModalOpen(true);
  };

  const closeQtyModal = () => {
    setQtyModalOpen(false);
    setEditingMat(null);
  };

  const confirmQtyModal = () => {
    if (!editingMat) return closeQtyModal();

    const qClean = String(qtyDraft || "")
      .replace(",", ".")
      .replace(/[^0-9.]/g, "");

    const uClean =
      String(unitDraft || "")
        .toUpperCase()
        .trim() || "PZA";

    setSelected((prev) =>
      prev.map((s) =>
        s.Material === editingMat.Material &&
        s.Agrupador2 === editingMat.Agrupador2
          ? { ...s, Cantidad: qClean || "1", Unidad: uClean }
          : s,
      ),
    );

    closeQtyModal();
  };

  // ✅ al seleccionar material, abre modal centrado para cantidad/unidad
  const toggleMaterial = (mat) => {
    setSelected((prev) => {
      const exists = prev.find(
        (s) => s.Material === mat.Material && s.Agrupador2 === mat.Agrupador2,
      );

      // Si ya estaba, lo quita
      if (exists) {
        return prev.filter(
          (s) =>
            !(s.Material === mat.Material && s.Agrupador2 === mat.Agrupador2),
        );
      }

      // Si no estaba, lo agrega con default
      const next = [
        ...prev,
        {
          Material: mat.Material,
          Descripcion: mat.Descripcion,
          Agrupador1: AGR1_FIXED,
          Agrupador2: mat.Agrupador2,
          Cantidad: "1",
          Unidad: "PZA",
          Centro: plant || "",
          Almacen: "BSAT",
        },
      ];

      return next;
    });

    // Abrir modal después (ya con seleccionado)
    setTimeout(() => openQtyModalFor(mat), 0);
  };

  const s = stylesGlobal || localStyles;
  const P = FIORI || {};

  return (
    <View style={[s.card, { borderColor: P.border || "#DDE6F2" }]}>
      <Text style={[s.title, { color: P.text || "#0B1F3B" }]}>Consumibles</Text>

      <View style={s.row}>
        <Text style={s.label}>Agrupador1:</Text>
        <Text style={s.value}>{AGR1_FIXED}</Text>
        <Text style={[s.label, { marginLeft: 12 }]}>Centro:</Text>
        <Text style={s.value}>{plant || "—"}</Text>
      </View>

      <Text style={[s.label, { marginTop: 10 }]}>Tipo (Agrupador2)</Text>

      <View style={s.chipsWrap}>
        {AGR2_OPTIONS.map((opt) => {
          const v = String(opt).trim().toUpperCase();
          const active = agr2Selected.includes(v);
          return (
            <TouchableOpacity
              key={v}
              onPress={() => toggleAgr2(v)}
              style={[s.chip, active && s.chipActive]}
              activeOpacity={0.9}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>{v}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!agr2Selected.length ? (
        <Text style={s.hint}>
          Selecciona uno o varios tipos para cargar materiales.
        </Text>
      ) : loadingMaterials ? (
        <View style={{ paddingVertical: 10 }}>
          <ActivityIndicator />
          <Text style={s.hint}>Cargando materiales…</Text>
        </View>
      ) : materials.length === 0 ? (
        <Text style={[s.hint, { color: "#B00020" }]}>
          No se encontraron materiales. Puedes continuar sin consumibles.
        </Text>
      ) : (
        <>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar material (código o descripción)…"
            style={s.search}
          />

          <FlatList
            data={filtered}
            keyExtractor={(item, idx) =>
              `${item.Material}-${item.Agrupador2}-${idx}`
            }
            scrollEnabled={false}
            // ✅ Empuja el final para que NO lo tapen los botones fijos de abajo
            ListFooterComponent={<View style={{ height: 180 }} />}
            renderItem={({ item }) => {
              const active = isSelectedMat(item);

              return (
                <View style={s.matRow}>
                  <TouchableOpacity
                    onPress={() => toggleMaterial(item)}
                    style={s.matLeft}
                    activeOpacity={0.9}
                  >
                    <View style={[s.checkbox, active && s.checkboxOn]}>
                      {active ? <Text style={s.checkboxTxt}>✓</Text> : null}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={s.matCode}>{item.Material}</Text>
                      <Text style={s.matDesc}>{item.Descripcion}</Text>
                      <Text style={s.matMeta}>Tipo: {item.Agrupador2}</Text>

                      {active ? (
                        <Text style={s.matMeta}>
                          Cantidad/Unidad:{" "}
                          {selected.find(
                            (x) =>
                              x.Material === item.Material &&
                              x.Agrupador2 === item.Agrupador2,
                          )?.Cantidad || "1"}{" "}
                          {selected.find(
                            (x) =>
                              x.Material === item.Material &&
                              x.Agrupador2 === item.Agrupador2,
                          )?.Unidad || "PZA"}
                          {"  "}— toca para editar
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </>
      )}

      {/* ✅ MODAL CENTRADO */}
      <Modal
        visible={qtyModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeQtyModal}
      >
        <Pressable style={s.modalBackdrop} onPress={closeQtyModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={s.modalCenter}
          >
            <Pressable
              style={[s.modalCard, { borderColor: P.border || "#DDE6F2" }]}
              onPress={() => {}}
            >
              <Text style={[s.modalTitle, { color: P.text || "#0B1F3B" }]}>
                Cantidad del consumible
              </Text>

              <Text style={s.modalSub}>
                {editingMat?.Material || ""}{" "}
                {editingMat?.Descripcion ? `— ${editingMat.Descripcion}` : ""}
              </Text>

              <View style={s.modalRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalLabel}>Cantidad</Text>
                  <TextInput
                    value={qtyDraft}
                    onChangeText={setQtyDraft}
                    keyboardType="numeric"
                    placeholder="1"
                    style={s.modalInput}
                  />
                </View>

                <View style={{ width: 12 }} />

                <View style={{ flex: 1 }}>
                  <Text style={s.modalLabel}>Unidad</Text>
                  <TextInput
                    value={unitDraft}
                    onChangeText={setUnitDraft}
                    placeholder="PZA"
                    style={s.modalInput}
                  />
                </View>
              </View>

              <View style={s.modalActions}>
                <TouchableOpacity
                  onPress={closeQtyModal}
                  style={s.btnGhost}
                  activeOpacity={0.9}
                >
                  <Text style={s.btnGhostTxt}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={confirmQtyModal}
                  style={s.btnPrimary}
                  activeOpacity={0.9}
                >
                  <Text style={s.btnPrimaryTxt}>Guardar</Text>
                </TouchableOpacity>
              </View>
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
  title: { fontSize: 14, fontWeight: "900" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 6,
    flexWrap: "wrap",
  },
  label: { color: "#63718B", fontWeight: "800", fontSize: 12 },
  value: { color: "#0B1F3B", fontWeight: "900", fontSize: 12 },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#DDE6F2",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F5F7FA",
  },
  chipActive: { backgroundColor: "#0A6ED1", borderColor: "#0A6ED1" },
  chipText: { fontWeight: "900", fontSize: 11, color: "#0B1F3B" },
  chipTextActive: { color: "#fff" },

  hint: { marginTop: 10, color: "#63718B", fontSize: 12, fontWeight: "700" },

  search: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontWeight: "700",
  },

  matRow: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E8EEF7",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#F7F7F7",
  },
  matLeft: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#0A6ED1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    backgroundColor: "#fff",
  },
  checkboxOn: { backgroundColor: "#0A6ED1" },
  checkboxTxt: { color: "#fff", fontWeight: "900" },

  matCode: { fontWeight: "900", color: "#0B1F3B" },
  matDesc: { marginTop: 2, color: "#0B1F3B", fontWeight: "700" },
  matMeta: { marginTop: 2, color: "#63718B", fontSize: 11, fontWeight: "700" },

  // ✅ Modal styles
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  modalTitle: { fontSize: 14, fontWeight: "900" },
  modalSub: { marginTop: 6, color: "#63718B", fontWeight: "800", fontSize: 12 },
  modalRow: { flexDirection: "row", marginTop: 12 },
  modalLabel: {
    color: "#63718B",
    fontWeight: "800",
    fontSize: 12,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontWeight: "800",
    backgroundColor: "#fff",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  btnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    backgroundColor: "#F5F7FA",
  },
  btnGhostTxt: { fontWeight: "900", color: "#0B1F3B" },
  btnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0A6ED1",
  },
  btnPrimaryTxt: { fontWeight: "900", color: "#fff" },
});
