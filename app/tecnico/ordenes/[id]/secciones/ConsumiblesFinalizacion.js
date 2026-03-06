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

/**
 * ✅ Cobertura -> pares (Agrupador1, Agrupador2)
 * Nota: Agrupador2 debe coincidir EXACTO con SAP (como tú lo pasaste).
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
    // BASICO + MEDIO
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
    // BASICO + MEDIO + SEMIFULL
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

// ID único para un “par”
const pairId = (p) => `${String(p?.Agr1 || "").trim().toUpperCase()}__${String(p?.Agr2 || "").trim().toUpperCase()}`;

export default function ConsumiblesFinalizacion({
  plant, // centro (opcional)
  coberturaTipo, // ✅ "BASICA" | "MEDIA" | "SEMI"
  stylesGlobal,
  FIORI,
  onChange,
}) {
  // ✅ Chips seleccionados = pares Agr1/Agr2
  const [pairSelected, setPairSelected] = useState([]); // array de ids pairId()
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [q, setQ] = useState("");

  // seleccionados con cantidad
  const [selected, setSelected] = useState([]);
  // { Material, Descripcion, Agrupador1, Agrupador2, Cantidad, Unidad, Centro, Almacen }

  // Modal cantidad
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [editingMat, setEditingMat] = useState(null);
  const [qtyDraft, setQtyDraft] = useState("1");
  const [unitDraft, setUnitDraft] = useState("PZA");

  const loadIdRef = useRef(0);

  // ✅ Opciones disponibles según cobertura
  const coverageKey = String(coberturaTipo || "").trim().toUpperCase();
  const pairsForCoverage = useMemo(() => {
    if (coverageKey === "MEDIA") return COVERAGE_PAIRS.MEDIA;
    if (coverageKey === "SEMI") return COVERAGE_PAIRS.SEMI;
    if (coverageKey === "BASICA") return COVERAGE_PAIRS.BASICA;

    // Si no detectó cobertura, por default muestro BASICA (puedes cambiar a [] si prefieres)
    return COVERAGE_PAIRS.BASICA;
  }, [coverageKey]);

  // Propagar seleccionados al padre
  useEffect(() => {
    onChange?.(selected);
  }, [selected, onChange]);

  // ✅ Cuando cambia cobertura, limpiar selección de chips/materiales (para evitar mezclar)
  useEffect(() => {
    setPairSelected([]);
    setMaterials([]);
    setQ("");
    // OJO: NO borro "selected" (los consumibles ya elegidos), por si el usuario ya capturó cantidades.
    // Si quieres que también se borre, descomenta:
    // setSelected([]);
  }, [coverageKey]);

  // ✅ Cargar materiales al cambiar chips (pares) - en paralelo + protección de carrera
  useEffect(() => {
    let mounted = true;
    const myLoadId = ++loadIdRef.current;

    (async () => {
      setMaterials([]);
      if (!pairSelected.length) return;

      setLoadingMaterials(true);
      try {
        const selectedPairs = pairsForCoverage.filter((p) => pairSelected.includes(pairId(p)));

        const urls = selectedPairs.map((p) => {
          const a1 = String(p.Agr1).trim().toUpperCase();
          const a2 = String(p.Agr2).trim().toUpperCase();
          return (
            `/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet` +
            `?$filter=Agrupador1 eq '${a1}' and Agrupador2 eq '${a2}'`
          );
        });

        const responses = await Promise.all(urls.map((u) => api.get(u)));

        if (!mounted || myLoadId !== loadIdRef.current) return;

        const all = [];
        for (let i = 0; i < responses.length; i++) {
          const res = responses[i];
          const rows = res?.data?.d?.results || res?.data?.results || [];

          // identificamos el par que originó esta respuesta
          const p = selectedPairs[i];
          const Agrupador1 = String(p?.Agr1 || "").trim().toUpperCase();
          const Agrupador2 = String(p?.Agr2 || "").trim().toUpperCase();

          for (const r of rows) {
            all.push({
              Id: String(r?.Id || "").trim(),
              Material: String(r?.Material || "").trim(),
              Agrupador1,
              Agrupador2,
              Descripcion: String(r?.Descripcion || r?.Description || "").trim(),
            });
          }
        }

        const deduped = uniqBy(
          all.filter((x) => x.Material),
          (x) => `${x.Material}__${x.Descripcion}__${x.Agrupador1}__${x.Agrupador2}`
        );

        if (mounted && myLoadId === loadIdRef.current) setMaterials(deduped);
      } catch (e) {
        if (mounted && myLoadId === loadIdRef.current) setMaterials([]);
      } finally {
        if (mounted && myLoadId === loadIdRef.current) setLoadingMaterials(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [pairSelected, pairsForCoverage]);

  const filtered = useMemo(() => {
    const qq = String(q || "").toUpperCase().trim();
    if (!qq) return materials;
    return materials.filter((m) => {
      const hay = `${m.Material} ${m.Descripcion} ${m.Agrupador1} ${m.Agrupador2}`.toUpperCase();
      return hay.includes(qq);
    });
  }, [materials, q]);

  const togglePair = (p) => {
    const id = pairId(p);
    setPairSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const isSelectedMat = (mat) =>
    selected.some(
      (s) =>
        s.Material === mat.Material &&
        String(s.Agrupador1).toUpperCase() === String(mat.Agrupador1).toUpperCase() &&
        String(s.Agrupador2).toUpperCase() === String(mat.Agrupador2).toUpperCase()
    );

  const openQtyModalFor = (mat) => {
    const sel = selected.find(
      (s) =>
        s.Material === mat.Material &&
        String(s.Agrupador1).toUpperCase() === String(mat.Agrupador1).toUpperCase() &&
        String(s.Agrupador2).toUpperCase() === String(mat.Agrupador2).toUpperCase()
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

    const qClean = String(qtyDraft || "").replace(",", ".").replace(/[^0-9.]/g, "");
    const uClean = String(unitDraft || "").toUpperCase().trim() || "PZA";

    setSelected((prev) =>
      prev.map((s) =>
        s.Material === editingMat.Material &&
        String(s.Agrupador1).toUpperCase() === String(editingMat.Agrupador1).toUpperCase() &&
        String(s.Agrupador2).toUpperCase() === String(editingMat.Agrupador2).toUpperCase()
          ? { ...s, Cantidad: qClean || "1", Unidad: uClean }
          : s
      )
    );

    closeQtyModal();
  };

  // ✅ al seleccionar material, abre modal para cantidad/unidad
  const toggleMaterial = (mat) => {
    setSelected((prev) => {
      const exists = prev.find(
        (s) =>
          s.Material === mat.Material &&
          String(s.Agrupador1).toUpperCase() === String(mat.Agrupador1).toUpperCase() &&
          String(s.Agrupador2).toUpperCase() === String(mat.Agrupador2).toUpperCase()
      );

      if (exists) {
        return prev.filter(
          (s) =>
            !(
              s.Material === mat.Material &&
              String(s.Agrupador1).toUpperCase() === String(mat.Agrupador1).toUpperCase() &&
              String(s.Agrupador2).toUpperCase() === String(mat.Agrupador2).toUpperCase()
            )
        );
      }

      return [
        ...prev,
        {
          Material: mat.Material,
          Descripcion: mat.Descripcion,
          Agrupador1: mat.Agrupador1,
          Agrupador2: mat.Agrupador2,
          Cantidad: "1",
          Unidad: "PZA",
          Centro: plant || "",
          Almacen: "BSAT",
        },
      ];
    });

    setTimeout(() => openQtyModalFor(mat), 0);
  };

  const s = stylesGlobal || localStyles;
  const P = FIORI || {};

  return (
    <View style={[s.card, { borderColor: P.border || "#DDE6F2" }]}>
      <Text style={[s.title, { color: P.text || "#0B1F3B" }]}>Consumibles</Text>

      <View style={s.row}>
        <Text style={s.label}>Cobertura:</Text>
        <Text style={s.value}>{coverageKey || "—"}</Text>
        <Text style={[s.label, { marginLeft: 12 }]}>Centro:</Text>
        <Text style={s.value}>{plant || "—"}</Text>
      </View>

      <Text style={[s.label, { marginTop: 10 }]}>Tipos disponibles</Text>

      <View style={s.chipsWrap}>
        {pairsForCoverage.map((p) => {
          const id = pairId(p);
          const active = pairSelected.includes(id);

          // ✅ etiqueta clara para evitar colisiones y que se entienda:
          const label = `${p.Agr1} · ${p.Agr2}`;

          return (
            <TouchableOpacity
              key={id}
              onPress={() => togglePair(p)}
              style={[s.chip, active && s.chipActive]}
              activeOpacity={0.9}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!pairSelected.length ? (
        <Text style={s.hint}>Selecciona uno o varios tipos para cargar materiales.</Text>
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
            keyExtractor={(item, idx) => `${item.Material}-${item.Agrupador1}-${item.Agrupador2}-${idx}`}
            scrollEnabled={false}
            ListFooterComponent={<View style={{ height: 180 }} />}
            renderItem={({ item }) => {
              const active = isSelectedMat(item);
              const selectedRow = selected.find(
                (x) =>
                  x.Material === item.Material &&
                  String(x.Agrupador1).toUpperCase() === String(item.Agrupador1).toUpperCase() &&
                  String(x.Agrupador2).toUpperCase() === String(item.Agrupador2).toUpperCase()
              );

              return (
                <View style={s.matRow}>
                  <TouchableOpacity onPress={() => toggleMaterial(item)} style={s.matLeft} activeOpacity={0.9}>
                    <View style={[s.checkbox, active && s.checkboxOn]}>
                      {active ? <Text style={s.checkboxTxt}>✓</Text> : null}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={s.matCode}>{item.Material}</Text>
                      <Text style={s.matDesc}>{item.Descripcion}</Text>
                      <Text style={s.matMeta}>
                        Cobertura: {item.Agrupador1} · Tipo: {item.Agrupador2}
                      </Text>

                      {active ? (
                        <Text style={s.matMeta}>
                          Cantidad/Unidad: {selectedRow?.Cantidad || "1"} {selectedRow?.Unidad || "PZA"} — toca para editar
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
      <Modal visible={qtyModalOpen} transparent animationType="fade" onRequestClose={closeQtyModal}>
        <Pressable style={s.modalBackdrop} onPress={closeQtyModal}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalCenter}>
            <Pressable style={[s.modalCard, { borderColor: P.border || "#DDE6F2" }]} onPress={() => {}}>
              <Text style={[s.modalTitle, { color: P.text || "#0B1F3B" }]}>Cantidad del consumible</Text>

              <Text style={s.modalSub}>
                {editingMat?.Material || ""} {editingMat?.Descripcion ? `— ${editingMat.Descripcion}` : ""}
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
                  <TextInput value={unitDraft} onChangeText={setUnitDraft} placeholder="PZA" style={s.modalInput} />
                </View>
              </View>

              <View style={s.modalActions}>
                <TouchableOpacity onPress={closeQtyModal} style={s.btnGhost} activeOpacity={0.9}>
                  <Text style={s.btnGhostTxt}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={confirmQtyModal} style={s.btnPrimary} activeOpacity={0.9}>
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
  row: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6, flexWrap: "wrap" },
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

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, padding: 14 },
  modalTitle: { fontSize: 14, fontWeight: "900" },
  modalSub: { marginTop: 6, color: "#63718B", fontWeight: "800", fontSize: 12 },
  modalRow: { flexDirection: "row", marginTop: 12 },
  modalLabel: { color: "#63718B", fontWeight: "800", fontSize: 12, marginBottom: 6 },
  modalInput: { borderWidth: 1, borderColor: "#DDE6F2", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontWeight: "800", backgroundColor: "#fff" },

  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  btnGhost: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#DDE6F2", backgroundColor: "#F5F7FA" },
  btnGhostTxt: { fontWeight: "900", color: "#0B1F3B" },
  btnPrimary: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#0A6ED1" },
  btnPrimaryTxt: { fontWeight: "900", color: "#fff" },
});