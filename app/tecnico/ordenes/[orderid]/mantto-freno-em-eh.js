// app/tecnico/ordenes/[orderid]/mantto-freno-em-eh.js
// Formulario: REGISTRO DE MANTENIMIENTO DE FRENO (EM/EH y otros)
// + Segunda hoja: FOTOS ANTES / DESPUÉS por sección
//
// ✅ MODO ACTUAL: SIN BACKEND (para que NO mande error)
// - No hace GET /mantenimiento-freno-em-eh/datos/:orderid
// - No sube fotos (endpoint desactivado)
// - Mantiene TODO listo para re-activar después (solo descomentas y cambias banderas)
//
// 🔁 Para reactivar backend:
// 1) Cambia USE_BACKEND=true
// 2) Descomenta import api
// 3) Descomenta load() y el useEffect que lo llama
// 4) Para subir fotos: pon HAS_PHOTO_ENDPOINT=true y descomenta el api.post de fotos

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import Header from "../../../../src/components/Header";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
// import api from "../../../../src/services/api"; // 🔁 (BACKEND) descomenta cuando vuelvas a usar GET/POST reales

// =======================
// ✅ Toggle de backend
// =======================
const USE_BACKEND = false;

// =======================
// ✅ Toggle de endpoint fotos
// =======================
const HAS_PHOTO_ENDPOINT = false;

// =======================
// ✅ Datos fijos (tu demo)
// =======================
const FIXED_AUTO = {
  cliente: "Liverpool",
  equipo: "MX19EM829-A2",
  tecnico_nombre: "Carlos Chavez",
  start_date: "03/03/2026",
};

// ------- UI utilitaria -------
const Section = ({ children }) => <Text style={styles.section}>{children}</Text>;
const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);
const Label = ({ children, style }) => (
  <Text style={[styles.label, style]}>{children}</Text>
);
const Input = (props) => <TextInput {...props} style={[styles.input, props.style]} />;

const Readonly = ({ children }) => (
  <View style={styles.readonly}>
    <Text style={styles.readonlyText}>{String(children ?? "—")}</Text>
  </View>
);

const Chips = ({ options, value, onChange }) => (
  <View style={styles.chipsWrap}>
    {options.map((opt) => {
      const active = value === opt;
      return (
        <TouchableOpacity
          key={opt}
          style={[styles.chip, active && styles.chipOn]}
          onPress={() => onChange(opt)}
        >
          <Text style={[styles.chipText, active && styles.chipTextOn]}>{opt}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const Toggle = ({ value, onValueChange }) => (
  <Switch value={!!value} onValueChange={onValueChange} />
);

const Row2 = ({ children }) => <View style={styles.row2}>{children}</View>;
const Col = ({ children, min = 220 }) => (
  <View style={[styles.col, { minWidth: min }]}>{children}</View>
);

function IconButton({ label, onPress, kind = "primary", disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        kind === "primary" ? styles.btnPrimary : styles.btnSecondary,
        disabled && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.btnText, kind === "primary" && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Thumbnail de foto con input de nota y eliminar */
function PhotoItem({ uri, note, onChangeNote, onRemove }) {
  return (
    <View style={styles.photoItem}>
      <Image source={{ uri }} style={styles.photoImg} />
      <TextInput
        placeholder="Nota (opcional)"
        value={note}
        onChangeText={onChangeNote}
        style={styles.photoNote}
      />
      <TouchableOpacity onPress={onRemove} style={styles.photoRemove}>
        <Text style={styles.photoRemoveText}>Eliminar</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Sub-sección con 2 columnas: ANTES y DESPUÉS (lista de fotos) */
function PhotoBlock({ title, value, onChange }) {
  const pick = async (momento) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        return Alert.alert("Permisos", "Se requiere permiso para acceder a la galería.");
      }

      // si el usuario niega cámara no pasa nada, igual puede escoger de galería
      await ImagePicker.requestCameraPermissionsAsync();

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled) return;

      const newUri = result.assets?.[0]?.uri;
      if (!newUri) return;

      const arr = [...(value?.[momento] || [])];
      arr.push({ uri: newUri, note: "" });
      onChange({ ...(value || {}), [momento]: arr });
    } catch (e) {
      console.error("pick image", e);
      Alert.alert("Error", "No se pudo seleccionar la imagen.");
    }
  };

  const removeAt = (momento, idx) => {
    const arr = [...(value?.[momento] || [])];
    arr.splice(idx, 1);
    onChange({ ...(value || {}), [momento]: arr });
  };

  const updateNoteAt = (momento, idx, note) => {
    const arr = [...(value?.[momento] || [])];
    arr[idx] = { ...(arr[idx] || {}), note };
    onChange({ ...(value || {}), [momento]: arr });
  };

  return (
    <Card>
      <Text style={styles.photoBlockTitle}>{title}</Text>
      <View style={styles.photoColumns}>
        {/* ANTES */}
        <View style={styles.photoCol}>
          <View style={styles.photoColHeader}>
            <Text style={styles.photoColTitle}>Antes</Text>
            <TouchableOpacity onPress={() => pick("antes")} style={styles.photoAdd}>
              <Text style={styles.photoAddText}>+ Agregar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.photoGrid}>
            {(value?.antes || []).map((p, i) => (
              <PhotoItem
                key={`a-${i}-${p.uri}`}
                uri={p.uri}
                note={p.note}
                onChangeNote={(t) => updateNoteAt("antes", i, t)}
                onRemove={() => removeAt("antes", i)}
              />
            ))}
          </View>
        </View>

        {/* DESPUÉS */}
        <View style={styles.photoCol}>
          <View style={styles.photoColHeader}>
            <Text style={styles.photoColTitle}>Después</Text>
            <TouchableOpacity onPress={() => pick("despues")} style={styles.photoAdd}>
              <Text style={styles.photoAddText}>+ Agregar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.photoGrid}>
            {(value?.despues || []).map((p, i) => (
              <PhotoItem
                key={`d-${i}-${p.uri}`}
                uri={p.uri}
                note={p.note}
                onChangeNote={(t) => updateNoteAt("despues", i, t)}
                onRemove={() => removeAt("despues", i)}
              />
            ))}
          </View>
        </View>
      </View>
    </Card>
  );
}

// ========= PANTALLA PRINCIPAL =========
export default function ManttoFrenoEmEhForm() {
  const { orderid } = useLocalSearchParams();

  // ✅ SIN BACKEND: no hay "cargando por GET"
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ✅ Datos fijos para mostrar en cabecera
  const [auto, setAuto] = useState(FIXED_AUTO);

  // Cabecera de reporte
  const [fecha, setFecha] = useState("");
  const [horario, setHorario] = useState("");
  const [control, setControl] = useState("");
  const [tipoMt, setTipoMt] = useState("");
  const [velNominal, setVelNominal] = useState("");
  const [capacidadKg, setCapacidadKg] = useState("");
  const [tipoReporte, setTipoReporte] = useState("overhaul");

  // 1–9
  const [pinesKitLubOxidoAntes, setPinesKitLubOxidoAntes] = useState(null);
  const [pinesKitLubOxidoDesp, setPinesKitLubOxidoDesp] = useState(null);
  const [pinesKitLubLubAntes, setPinesKitLubLubAntes] = useState(null);
  const [pinesKitLubLubDesp, setPinesKitLubLubDesp] = useState(null);
  const [pinesKitLibreGiroAntes, setPinesKitLibreGiroAntes] = useState(null);
  const [pinesKitLibreGiroDesp, setPinesKitLibreGiroDesp] = useState(null);
  const [pinesKitLibreCubiertaAntes, setPinesKitLibreCubiertaAntes] = useState(null);
  const [pinesKitLibreCubiertaDesp, setPinesKitLibreCubiertaDesp] = useState(null);
  const [pinesRevisado, setPinesRevisado] = useState(null);
  const [pinesRevisionSMA, setPinesRevisionSMA] = useState(null);

  const [torqueEstandarRef, setTorqueEstandarRef] = useState("");
  const [torque1Antes, setTorque1Antes] = useState("");
  const [torque1Desp, setTorque1Desp] = useState("");
  const [torque2Antes, setTorque2Antes] = useState("");
  const [torque2Desp, setTorque2Desp] = useState("");
  const [torque3Antes, setTorque3Antes] = useState("");
  const [torque3Desp, setTorque3Desp] = useState("");
  const torquePromAntes = useMemo(
    () => avg([torque1Antes, torque2Antes, torque3Antes]),
    [torque1Antes, torque2Antes, torque3Antes]
  );
  const torquePromDesp = useMemo(
    () => avg([torque1Desp, torque2Desp, torque3Desp]),
    [torque1Desp, torque2Desp, torque3Desp]
  );
  const [torqueEstadoAntes, setTorqueEstadoAntes] = useState(null);
  const [torqueEstadoDesp, setTorqueEstadoDesp] = useState(null);
  const [torqueRevisado, setTorqueRevisado] = useState(null);
  const [torqueRevisionSMA, setTorqueRevisionSMA] = useState(null);

  const [resorteIzqAntes, setResorteIzqAntes] = useState("");
  const [resorteIzqDesp, setResorteIzqDesp] = useState("");
  const [resorteDerAntes, setResorteDerAntes] = useState("");
  const [resorteDerDesp, setResorteDerDesp] = useState("");
  const [resorteEstadoAntes, setResorteEstadoAntes] = useState(null);
  const [resorteEstadoDesp, setResorteEstadoDesp] = useState(null);
  const [resorteRevisado, setResorteRevisado] = useState(null);
  const [resorteRevisionSMA, setResorteRevisionSMA] = useState(null);

  const [emboloRef, setEmboloRef] = useState("");
  const [emboloIzqAntes, setEmboloIzqAntes] = useState("");
  const [emboloIzqDesp, setEmboloIzqDesp] = useState("");
  const [emboloDerAntes, setEmboloDerAntes] = useState("");
  const [emboloDerDesp, setEmboloDerDesp] = useState("");
  const [emboloDesgTieneAntes, setEmboloDesgTieneAntes] = useState(null);
  const [emboloDesgTieneDesp, setEmboloDesgTieneDesp] = useState(null);
  const [emboloOxidoTieneAntes, setEmboloOxidoTieneAntes] = useState(null);
  const [emboloOxidoTieneDesp, setEmboloOxidoTieneDesp] = useState(null);
  const [emboloLubAntes, setEmboloLubAntes] = useState(null);
  const [emboloLubDesp, setEmboloLubDesp] = useState(null);
  const [emboloEspesorAntes, setEmboloEspesorAntes] = useState("");
  const [emboloEspesorDesp, setEmboloEspesorDesp] = useState("");
  const [emboloRevisado, setEmboloRevisado] = useState(null);
  const [emboloRevisionSMA, setEmboloRevisionSMA] = useState(null);

  const [contactoRef, setContactoRef] = useState("");
  const [contactoSepIzqAntes, setContactoSepIzqAntes] = useState("");
  const [contactoSepIzqDesp, setContactoSepIzqDesp] = useState("");
  const [contactoSepDerAntes, setContactoSepDerAntes] = useState("");
  const [contactoSepDerDesp, setContactoSepDerDesp] = useState("");
  const [contactoPuntoBienAntes, setContactoPuntoBienAntes] = useState(null);
  const [contactoPuntoBienDesp, setContactoPuntoBienDesp] = useState(null);
  const [contactoRevisado, setContactoRevisado] = useState(null);
  const [contactoRevisionSMA, setContactoRevisionSMA] = useState(null);

  const [bppDesgIzqAntes, setBppDesgIzqAntes] = useState(null);
  const [bppDesgIzqDesp, setBppDesgIzqDesp] = useState(null);
  const [bppDesgDerAntes, setBppDesgDerAntes] = useState(null);
  const [bppDesgDerDesp, setBppDesgDerDesp] = useState(null);

  const [bppOxIzqAntes, setBppOxIzqAntes] = useState(null);
  const [bppOxIzqDesp, setBppOxIzqDesp] = useState(null);
  const [bppOxDerAntes, setBppOxDerAntes] = useState(null);
  const [bppOxDerDesp, setBppOxDerDesp] = useState(null);

  const [bppLubIzqAntes, setBppLubIzqAntes] = useState(null);
  const [bppLubIzqDesp, setBppLubIzqDesp] = useState(null);
  const [bppLubDerAntes, setBppLubDerAntes] = useState(null);
  const [bppLubDerDesp, setBppLubDerDesp] = useState(null);

  const [bppRevisado, setBppRevisado] = useState(null);
  const [bppRevisionSMA, setBppRevisionSMA] = useState(null);

  const [tamborDesgTieneAntes, setTamborDesgTieneAntes] = useState(null);
  const [tamborDesgTieneDesp, setTamborDesgTieneDesp] = useState(null);
  const [tamborAceiteTieneAntes, setTamborAceiteTieneAntes] = useState(null);
  const [tamborAceiteTieneDesp, setTamborAceiteTieneDesp] = useState(null);
  const [tamborOxidoTieneAntes, setTamborOxidoTieneAntes] = useState(null);
  const [tamborOxidoTieneDesp, setTamborOxidoTieneDesp] = useState(null);
  const [tamborRevisado, setTamborRevisado] = useState(null);
  const [tamborRevisionSMA, setTamborRevisionSMA] = useState(null);

  const [balataIzqAntes, setBalataIzqAntes] = useState(null);
  const [balataIzqDesp, setBalataIzqDesp] = useState(null);
  const [balataDerAntes, setBalataDerAntes] = useState(null);
  const [balataDerDesp, setBalataDerDesp] = useState(null);
  const [balataRevisado, setBalataRevisado] = useState(null);
  const [balataRevisionSMA, setBalataRevisionSMA] = useState(null);

  const [operPruebaAntes, setOperPruebaAntes] = useState(null);
  const [operPruebaDesp, setOperPruebaDesp] = useState(null);
  const [operRevisado, setOperRevisado] = useState(null);
  const [operRevisionSMA, setOperRevisionSMA] = useState(null);

  // Observaciones y resultado total
  const [observaciones, setObservaciones] = useState("");
  const [resultadoTotal, setResultadoTotal] = useState("bien");
  const [detalleResultado, setDetalleResultado] = useState("");

  // ====== FOTOS (segunda hoja) ======
  const [photos, setPhotos] = useState({
    general: {},
    pines_levas: {},
    torque: {},
    resortes: {},
    embolo: {},
    contacto: {},
    brazo_palanca_perno: {},
    tambor: {},
    balatas: {},
    operacion: {},
  });
  const updPhoto = (key, value) => setPhotos((s) => ({ ...s, [key]: value }));

  // Inicializa fecha hoy
  useEffect(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    setFecha(`${dd}/${mm}/${yyyy}`);
  }, []);

  // ✅ Deja orderid usable aunque venga raro
  const orderidStr = useMemo(() => {
    const raw = orderid?.toString();
    if (!raw || raw === "[orderid]") return "40215133";
    return raw;
  }, [orderid]);

  // ==========================
  // 🔁 (BACKEND) Carga por API
  // ==========================
  // const load = useCallback(async () => {
  //   try {
  //     setLoading(true);
  //     const token = await AsyncStorage.getItem("token");
  //
  //     const { data, status } = await api.get(`/mantenimiento-freno-em-eh/datos/${orderidStr}`, {
  //       headers: { Authorization: `Bearer ${token}` },
  //       validateStatus: () => true,
  //     });
  //     if (status >= 400) throw { response: { status, data } };
  //
  //     let autoFromApi = data?.auto;
  //     if (!autoFromApi && data) {
  //       autoFromApi = {
  //         cliente: data?.cliente ?? data?.Client ?? "",
  //         equipo: data?.equipo ?? data?.Equipment ?? "",
  //         start_date: data?.start_date ?? data?.StartDate ?? "",
  //         tecnico_nombre: data?.tecnico_nombre ?? data?.nombre ?? "",
  //         partner_rol: data?.partner_rol ?? data?.PartnRoleOld ?? "",
  //         partner_id: data?.partner_id ?? data?.PartnerOld ?? "",
  //       };
  //     }
  //     if (!autoFromApi) throw { response: { status: 404, data: { error: "Sin datos de la orden" } } };
  //     setAuto(autoFromApi);
  //   } catch (e) {
  //     console.error("[ManttoFrenoEmEh] load error", e?.response?.status, e?.response?.data || e?.message);
  //     const status = e?.response?.status;
  //     const msg = e?.response?.data?.error || e?.message || "Error desconocido";
  //     Alert.alert("Error al cargar", `(${status || "??"}) ${msg}`);
  //   } finally {
  //     setLoading(false);
  //   }
  // }, [orderidStr]);
  //
  // useEffect(() => {
  //   if (USE_BACKEND) load();
  // }, [load]);

  const onGuardar = async () => {
    try {
      setSaving(true);
      // const token = await AsyncStorage.getItem("token"); // 🔁 si luego vuelves a POST real

      // ====== 1) Guardar datos del formulario ======
      const payload = buildPayload(orderidStr);

      // 🔁 (BACKEND) ejemplo:
      // const { data, status } = await api.post("/mantenimiento-freno-em-eh/guardar", payload, {
      //   headers: { Authorization: `Bearer ${token}` },
      //   validateStatus: () => true,
      // });
      // if (status >= 400) throw new Error(data?.error || "No se pudo guardar");

      // ====== 2) Subir fotos (si tienes endpoint) ======
      const uploadOk = await maybeUploadAllPhotos(orderidStr, photos /*, token */);

      Alert.alert(
        "Listo",
        uploadOk
          ? "Formulario y fotos guardados"
          : "Formulario guardado. (Las fotos no se subieron: endpoint desactivado)",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e) {
      console.error(e);
      Alert.alert("Error", e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const buildPayload = (oid) => ({
    orderid: String(oid),
    // encabezado
    fecha,
    horario,
    control,
    tipoMt,
    velocidad_nominal_mmin: toNumberOrNull(velNominal),
    capacidad_kg: toNumberOrNull(capacidadKg),
    tipo_reporte: tipoReporte,
    // 1
    pines: {
      kit_con_lubricacion: {
        oxido: { antes: yn(pinesKitLubOxidoAntes), despues: yn(pinesKitLubOxidoDesp) },
        lubricacion: { antes: bm(pinesKitLubLubAntes), despues: bm(pinesKitLubLubDesp) },
      },
      kit_libre_lubricacion: {
        giro_libre: { antes: bm(pinesKitLibreGiroAntes), despues: bm(pinesKitLibreGiroDesp) },
        cubierta: { antes: yn(pinesKitLibreCubiertaAntes), despues: yn(pinesKitLibreCubiertaDesp) },
      },
      revisado: yn(pinesRevisado),
      revision_sma: oknec(pinesRevisionSMA),
    },
    // 2
    torque: {
      estandar_ref: torqueEstandarRef || null,
      mediciones: {
        antes: [torque1Antes, torque2Antes, torque3Antes].map(toNumberOrNull),
        despues: [torque1Desp, torque2Desp, torque3Desp].map(toNumberOrNull),
        promedio: { antes: toNumberOrNull(torquePromAntes), despues: toNumberOrNull(torquePromDesp) },
      },
      estado: { antes: bm(torqueEstadoAntes), despues: bm(torqueEstadoDesp) },
      revisado: yn(torqueRevisado),
      revision_sma: oknec(torqueRevisionSMA),
    },
    // 3
    resorte: {
      longitud: {
        izquierdo: { antes: resorteIzqAntes || null, despues: resorteIzqDesp || null },
        derecho: { antes: resorteDerAntes || null, despues: resorteDerDesp || null },
        estado: { antes: bm(resorteEstadoAntes), despues: bm(resorteEstadoDesp) },
      },
      revisado: yn(resorteRevisado),
      revision_sma: oknec(resorteRevisionSMA),
    },
    // 4
    embolo: {
      ref: emboloRef || null,
      recorrido: {
        izquierdo: { antes: toNumberOrNull(emboloIzqAntes), despues: toNumberOrNull(emboloIzqDesp) },
        derecho: { antes: toNumberOrNull(emboloDerAntes), despues: toNumberOrNull(emboloDerDesp) },
      },
      desgaste_tiene: { antes: yn(emboloDesgTieneAntes), despues: yn(emboloDesgTieneDesp) },
      oxido_tiene: { antes: yn(emboloOxidoTieneAntes), despues: yn(emboloOxidoTieneDesp) },
      lubricacion: { antes: bm(emboloLubAntes), despues: bm(emboloLubDesp) },
      espesor_arandela_mm: { antes: toNumberOrNull(emboloEspesorAntes), despues: toNumberOrNull(emboloEspesorDesp) },
      revisado: yn(emboloRevisado),
      revision_sma: oknec(emboloRevisionSMA),
    },
    // 5
    contacto: {
      ref: contactoRef || null,
      separacion_mm: {
        izquierdo: { antes: toNumberOrNull(contactoSepIzqAntes), despues: toNumberOrNull(contactoSepIzqDesp) },
        derecho: { antes: toNumberOrNull(contactoSepDerAntes), despues: toNumberOrNull(contactoSepDerDesp) },
      },
      punto_contacto_cable_tuercas: { antes: bm(contactoPuntoBienAntes), despues: bm(contactoPuntoBienDesp) },
      revisado: yn(contactoRevisado),
      revision_sma: oknec(contactoRevisionSMA),
    },
    // 6
    brazo_palanca_perno: {
      desgaste: {
        izquierdo: { antes: yn(bppDesgIzqAntes), despues: yn(bppDesgIzqDesp) },
        derecho: { antes: yn(bppDesgDerAntes), despues: yn(bppDesgDerDesp) },
      },
      oxido: {
        izquierdo: { antes: yn(bppOxIzqAntes), despues: yn(bppOxIzqDesp) },
        derecho: { antes: yn(bppOxDerAntes), despues: yn(bppOxDerDesp) },
      },
      lubricacion: {
        izquierdo: { antes: bm(bppLubIzqAntes), despues: bm(bppLubIzqDesp) },
        derecho: { antes: bm(bppLubDerAntes), despues: bm(bppLubDerDesp) },
      },
      revisado: yn(bppRevisado),
      revision_sma: oknec(bppRevisionSMA),
    },
    // 7
    tambor: {
      desgaste_tiene: { antes: yn(tamborDesgTieneAntes), despues: yn(tamborDesgTieneDesp) },
      aceite_tiene: { antes: yn(tamborAceiteTieneAntes), despues: yn(tamborAceiteTieneDesp) },
      oxido_tiene: { antes: yn(tamborOxidoTieneAntes), despues: yn(tamborOxidoTieneDesp) },
      revisado: yn(tamborRevisado),
      revision_sma: oknec(tamborRevisionSMA),
    },
    // 8
    balatas: {
      presentan_desg_fisuras_aceite: {
        izquierdo: { antes: yn(balataIzqAntes), despues: yn(balataIzqDesp) },
        derecho: { antes: yn(balataDerAntes), despues: yn(balataDerDesp) },
      },
      revisado: yn(balataRevisado),
      revision_sma: oknec(balataRevisionSMA),
    },
    // 9
    operacion: {
      prueba_funcionamiento: { antes: bm(operPruebaAntes), despues: bm(operPruebaDesp) },
      revisado: yn(operRevisado),
      revision_sma: oknec(operRevisionSMA),
    },
    observaciones,
    resultado_total: resultadoTotal,
    detalle_resultado: detalleResultado,
    fotos_meta: Object.fromEntries(
      Object.entries(photos).map(([k, v]) => [
        k,
        { antes: v?.antes?.length || 0, despues: v?.despues?.length || 0 },
      ])
    ),
  });

  async function maybeUploadAllPhotos(orderidStr2, photosObj /*, token */) {
    if (!HAS_PHOTO_ENDPOINT) return false;

    // 🔁 Cuando tengas endpoint real, descomenta el import api y usa token
    // if (!token) return false;

    try {
      const entries = Object.entries(photosObj);
      for (const [seccion, val] of entries) {
        for (const momento of ["antes", "despues"]) {
          for (const item of val?.[momento] || []) {
            const form = new FormData();
            form.append("orderid", orderidStr2);
            form.append("seccion", seccion);
            form.append("momento", momento);
            if (item.note) form.append("nota", item.note);

            const name = item.uri.split("/").pop() || `foto_${Date.now()}.jpg`;
            const ext = (name.split(".").pop() || "jpg").toLowerCase();
            const type = ext === "png" ? "image/png" : "image/jpeg";

            form.append("file", { uri: item.uri, name, type });

            // const res = await api.post("/mantenimiento-freno-em-eh/fotos", form, {
            //   headers: {
            //     Authorization: `Bearer ${token}`,
            //     "Content-Type": "multipart/form-data",
            //   },
            //   timeout: 60000,
            //   validateStatus: () => true,
            // });
            //
            // if (!res || res.status >= 400) {
            //   console.warn("falló foto", seccion, momento, res?.status, res?.data);
            // }
          }
        }
      }
      return true;
    } catch (e) {
      console.error("maybeUploadAllPhotos", e);
      return false;
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Cargando…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F5F7FB" }}>
      <Header title="Mantenimiento de freno (EM/EH y otros)" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 180 }}>
        {/* DATOS AUTO */}
        <Section>Datos del cliente/orden</Section>
        <Card>
          <Row2>
            <Col>
              <Label>Cliente</Label>
              <Readonly>{auto?.cliente}</Readonly>
            </Col>
            <Col>
              <Label>No. Equipo</Label>
              <Readonly>{auto?.equipo}</Readonly>
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Nombre del técnico</Label>
              <Readonly>{auto?.tecnico_nombre}</Readonly>
            </Col>
            <Col>
              <Label>Fecha de inicio</Label>
              <Readonly>{auto?.start_date}</Readonly>
            </Col>
          </Row2>
        </Card>

        {/* CABECERA DEL REPORTE */}
        <Section>Datos del reporte</Section>
        <Card>
          <Row2>
            <Col>
              <Label>Fecha</Label>
              <Input value={fecha} onChangeText={setFecha} placeholder="DD/MM/AAAA" />
            </Col>
            <Col>
              <Label>Horario</Label>
              <Input value={horario} onChangeText={setHorario} placeholder="Ej. 08:00–12:00" />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Control</Label>
              <Input value={control} onChangeText={setControl} placeholder="Control…" />
            </Col>
            <Col>
              <Label>Tipo de MT</Label>
              <Input value={tipoMt} onChangeText={setTipoMt} placeholder="Preventivo/Correctivo…" />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Velocidad nominal (m/min)</Label>
              <Input keyboardType="numeric" value={velNominal} onChangeText={setVelNominal} placeholder="0.0" />
            </Col>
            <Col>
              <Label>Capacidad (kg)</Label>
              <Input keyboardType="numeric" value={capacidadKg} onChangeText={setCapacidadKg} placeholder="0" />
            </Col>
          </Row2>

          <Label style={{ marginTop: 12 }}>Reporte</Label>
          <Chips
            options={["overhaul", "ajuste_reparacion_sustitucion"]}
            value={tipoReporte}
            onChange={setTipoReporte}
          />
        </Card>

        {/* 1) Pines y levas de freno */}
        <Section>1) Pines y levas de freno</Section>
        <Card>
          <Label>1a) Kit con lubricación</Label>
          <Row2>
            <Col>
              <Label>Óxido (antes)</Label>
              <YN value={pinesKitLubOxidoAntes} onChange={setPinesKitLubOxidoAntes} />
            </Col>
            <Col>
              <Label>Óxido (después)</Label>
              <YN value={pinesKitLubOxidoDesp} onChange={setPinesKitLubOxidoDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Lubricación (antes)</Label>
              <BM value={pinesKitLubLubAntes} onChange={setPinesKitLubLubAntes} />
            </Col>
            <Col>
              <Label>Lubricación (después)</Label>
              <BM value={pinesKitLubLubDesp} onChange={setPinesKitLubLubDesp} />
            </Col>
          </Row2>

          <Label style={{ marginTop: 10 }}>1b) Kit libre de lubricación</Label>
          <Row2>
            <Col>
              <Label>Giro libre (antes)</Label>
              <BM value={pinesKitLibreGiroAntes} onChange={setPinesKitLibreGiroAntes} />
            </Col>
            <Col>
              <Label>Giro libre (después)</Label>
              <BM value={pinesKitLibreGiroDesp} onChange={setPinesKitLibreGiroDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Cubierta (antes)</Label>
              <YN value={pinesKitLibreCubiertaAntes} onChange={setPinesKitLibreCubiertaAntes} />
            </Col>
            <Col>
              <Label>Cubierta (después)</Label>
              <YN value={pinesKitLibreCubiertaDesp} onChange={setPinesKitLibreCubiertaDesp} />
            </Col>
          </Row2>

          <Row2>
            <Col>
              <Label>Revisado</Label>
              <YN value={pinesRevisado} onChange={setPinesRevisado} />
            </Col>
            <Col>
              <Label>Revisión SMA</Label>
              <OkNec value={pinesRevisionSMA} onChange={setPinesRevisionSMA} />
            </Col>
          </Row2>
        </Card>

        {/* 2) Par de torsión (torque) */}
        <Section>2) Par de torsión (torque)</Section>
        <Card>
          <Row2>
            <Col>
              <Label>Estándar (REF 1)</Label>
              <Input value={torqueEstandarRef} onChangeText={setTorqueEstandarRef} placeholder="Valor ref" />
            </Col>
          </Row2>
          <Label style={{ marginTop: 8 }}>Mediciones</Label>
          <Row2>
            <Col>
              <Label>1. antes</Label>
              <Input keyboardType="numeric" value={torque1Antes} onChangeText={setTorque1Antes} />
            </Col>
            <Col>
              <Label>1. después</Label>
              <Input keyboardType="numeric" value={torque1Desp} onChangeText={setTorque1Desp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>2. antes</Label>
              <Input keyboardType="numeric" value={torque2Antes} onChangeText={setTorque2Antes} />
            </Col>
            <Col>
              <Label>2. después</Label>
              <Input keyboardType="numeric" value={torque2Desp} onChangeText={setTorque2Desp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>3. antes</Label>
              <Input keyboardType="numeric" value={torque3Antes} onChangeText={setTorque3Antes} />
            </Col>
            <Col>
              <Label>3. después</Label>
              <Input keyboardType="numeric" value={torque3Desp} onChangeText={setTorque3Desp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Promedio (antes)</Label>
              <Readonly>{torquePromAntes ?? "—"}</Readonly>
            </Col>
            <Col>
              <Label>Promedio (después)</Label>
              <Readonly>{torquePromDesp ?? "—"}</Readonly>
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Estado (antes)</Label>
              <BM value={torqueEstadoAntes} onChange={setTorqueEstadoAntes} />
            </Col>
            <Col>
              <Label>Estado (después)</Label>
              <BM value={torqueEstadoDesp} onChange={setTorqueEstadoDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Revisado</Label>
              <YN value={torqueRevisado} onChange={setTorqueRevisado} />
            </Col>
            <Col>
              <Label>Revisión SMA</Label>
              <OkNec value={torqueRevisionSMA} onChange={setTorqueRevisionSMA} />
            </Col>
          </Row2>
        </Card>

        {/* 3) Resorte de freno */}
        <Section>3) Resorte de freno (longitud)</Section>
        <Card>
          <Row2>
            <Col>
              <Label>Izquierdo (antes) mm (% opcional)</Label>
              <Input value={resorteIzqAntes} onChangeText={setResorteIzqAntes} placeholder="Ej. 20 (5%)" />
            </Col>
            <Col>
              <Label>Izquierdo (después)</Label>
              <Input value={resorteIzqDesp} onChangeText={setResorteIzqDesp} placeholder="Ej. 20 (5%)" />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Derecho (antes)</Label>
              <Input value={resorteDerAntes} onChangeText={setResorteDerAntes} placeholder="Ej. 20 (5%)" />
            </Col>
            <Col>
              <Label>Derecho (después)</Label>
              <Input value={resorteDerDesp} onChangeText={setResorteDerDesp} placeholder="Ej. 20 (5%)" />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Estado (antes)</Label>
              <BM value={resorteEstadoAntes} onChange={setResorteEstadoAntes} />
            </Col>
            <Col>
              <Label>Estado (después)</Label>
              <BM value={resorteEstadoDesp} onChange={setResorteEstadoDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Revisado</Label>
              <YN value={resorteRevisado} onChange={setResorteRevisado} />
            </Col>
            <Col>
              <Label>Revisión SMA</Label>
              <OkNec value={resorteRevisionSMA} onChange={setResorteRevisionSMA} />
            </Col>
          </Row2>
        </Card>

        {/* 4) Condiciones del émbolo */}
        <Section>4) Condiciones del émbolo</Section>
        <Card>
          <Row2>
            <Col>
              <Label>Estándar (REF 2)</Label>
              <Input value={emboloRef} onChangeText={setEmboloRef} placeholder="Valor ref" />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Recorrido Izq. (antes) mm</Label>
              <Input keyboardType="numeric" value={emboloIzqAntes} onChangeText={setEmboloIzqAntes} />
            </Col>
            <Col>
              <Label>Recorrido Izq. (después) mm</Label>
              <Input keyboardType="numeric" value={emboloIzqDesp} onChangeText={setEmboloIzqDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Recorrido Der. (antes) mm</Label>
              <Input keyboardType="numeric" value={emboloDerAntes} onChangeText={setEmboloDerAntes} />
            </Col>
            <Col>
              <Label>Recorrido Der. (después) mm</Label>
              <Input keyboardType="numeric" value={emboloDerDesp} onChangeText={setEmboloDerDesp} />
            </Col>
          </Row2>

          <Row2>
            <Col>
              <Label>Desgaste ¿tiene? (antes)</Label>
              <YN value={emboloDesgTieneAntes} onChange={setEmboloDesgTieneAntes} />
            </Col>
            <Col>
              <Label>Desgaste ¿tiene? (después)</Label>
              <YN value={emboloDesgTieneDesp} onChange={setEmboloDesgTieneDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Óxido ¿tiene? (antes)</Label>
              <YN value={emboloOxidoTieneAntes} onChange={setEmboloOxidoTieneAntes} />
            </Col>
            <Col>
              <Label>Óxido ¿tiene? (después)</Label>
              <YN value={emboloOxidoTieneDesp} onChange={setEmboloOxidoTieneDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Lubricación (antes)</Label>
              <BM value={emboloLubAntes} onChange={setEmboloLubAntes} />
            </Col>
            <Col>
              <Label>Lubricación (después)</Label>
              <BM value={emboloLubDesp} onChange={setEmboloLubDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Espesor de arandela (antes) mm</Label>
              <Input keyboardType="numeric" value={emboloEspesorAntes} onChangeText={setEmboloEspesorAntes} />
            </Col>
            <Col>
              <Label>Espesor de arandela (después) mm</Label>
              <Input keyboardType="numeric" value={emboloEspesorDesp} onChangeText={setEmboloEspesorDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Revisado</Label>
              <YN value={emboloRevisado} onChange={setEmboloRevisado} />
            </Col>
            <Col>
              <Label>Revisión SMA</Label>
              <OkNec value={emboloRevisionSMA} onChange={setEmboloRevisionSMA} />
            </Col>
          </Row2>
        </Card>

        {/* 5) Contacto de freno */}
        <Section>5) Contacto de freno</Section>
        <Card>
          <Row2>
            <Col>
              <Label>Estándar (REF 3)</Label>
              <Input value={contactoRef} onChangeText={setContactoRef} placeholder="Valor ref" />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Separación Izq. (antes) mm</Label>
              <Input keyboardType="numeric" value={contactoSepIzqAntes} onChangeText={setContactoSepIzqAntes} />
            </Col>
            <Col>
              <Label>Separación Izq. (después) mm</Label>
              <Input keyboardType="numeric" value={contactoSepIzqDesp} onChangeText={setContactoSepIzqDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Separación Der. (antes) mm</Label>
              <Input keyboardType="numeric" value={contactoSepDerAntes} onChangeText={setContactoSepDerAntes} />
            </Col>
            <Col>
              <Label>Separación Der. (después) mm</Label>
              <Input keyboardType="numeric" value={contactoSepDerDesp} onChangeText={setContactoSepDerDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Punto de contacto / cable / tuercas (antes)</Label>
              <BM value={contactoPuntoBienAntes} onChange={setContactoPuntoBienAntes} />
            </Col>
            <Col>
              <Label>Punto de contacto / cable / tuercas (después)</Label>
              <BM value={contactoPuntoBienDesp} onChange={setContactoPuntoBienDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Revisado</Label>
              <YN value={contactoRevisado} onChange={setContactoRevisado} />
            </Col>
            <Col>
              <Label>Revisión SMA</Label>
              <OkNec value={contactoRevisionSMA} onChange={setContactoRevisionSMA} />
            </Col>
          </Row2>
        </Card>

        {/* 6) Brazo, palanca y perno */}
        <Section>6) Brazo, palanca y perno</Section>
        <Card>
          <Label>Desgaste</Label>
          <Row2>
            <Col>
              <Label>Izquierdo (antes)</Label>
              <YN value={bppDesgIzqAntes} onChange={setBppDesgIzqAntes} />
            </Col>
            <Col>
              <Label>Izquierdo (después)</Label>
              <YN value={bppDesgIzqDesp} onChange={setBppDesgIzqDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Derecho (antes)</Label>
              <YN value={bppDesgDerAntes} onChange={setBppDesgDerAntes} />
            </Col>
            <Col>
              <Label>Derecho (después)</Label>
              <YN value={bppDesgDerDesp} onChange={setBppDesgDerDesp} />
            </Col>
          </Row2>

          <Label style={{ marginTop: 10 }}>Óxido</Label>
          <Row2>
            <Col>
              <Label>Izquierdo (antes)</Label>
              <YN value={bppOxIzqAntes} onChange={setBppOxIzqAntes} />
            </Col>
            <Col>
              <Label>Izquierdo (después)</Label>
              <YN value={bppOxIzqDesp} onChange={setBppOxIzqDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Derecho (antes)</Label>
              <YN value={bppOxDerAntes} onChange={setBppOxDerAntes} />
            </Col>
            <Col>
              <Label>Derecho (después)</Label>
              <YN value={bppOxDerDesp} onChange={setBppOxDerDesp} />
            </Col>
          </Row2>

          <Label style={{ marginTop: 10 }}>Lubricación</Label>
          <Row2>
            <Col>
              <Label>Izquierdo (antes)</Label>
              <BM value={bppLubIzqAntes} onChange={setBppLubIzqAntes} />
            </Col>
            <Col>
              <Label>Izquierdo (después)</Label>
              <BM value={bppLubIzqDesp} onChange={setBppLubIzqDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Derecho (antes)</Label>
              <BM value={bppLubDerAntes} onChange={setBppLubDerAntes} />
            </Col>
            <Col>
              <Label>Derecho (después)</Label>
              <BM value={bppLubDerDesp} onChange={setBppLubDerDesp} />
            </Col>
          </Row2>

          <Row2>
            <Col>
              <Label>Revisado</Label>
              <YN value={bppRevisado} onChange={setBppRevisado} />
            </Col>
            <Col>
              <Label>Revisión SMA</Label>
              <OkNec value={bppRevisionSMA} onChange={setBppRevisionSMA} />
            </Col>
          </Row2>
        </Card>

        {/* 7) Condiciones de tambor */}
        <Section>7) Condiciones de tambor</Section>
        <Card>
          <Row2>
            <Col>
              <Label>Desgaste ¿tiene? (antes)</Label>
              <YN value={tamborDesgTieneAntes} onChange={setTamborDesgTieneAntes} />
            </Col>
            <Col>
              <Label>Desgaste ¿tiene? (después)</Label>
              <YN value={tamborDesgTieneDesp} onChange={setTamborDesgTieneDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Aceite ¿tiene? (antes)</Label>
              <YN value={tamborAceiteTieneAntes} onChange={setTamborAceiteTieneAntes} />
            </Col>
            <Col>
              <Label>Aceite ¿tiene? (después)</Label>
              <YN value={tamborAceiteTieneDesp} onChange={setTamborAceiteTieneDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Óxido ¿tiene? (antes)</Label>
              <YN value={tamborOxidoTieneAntes} onChange={setTamborOxidoTieneAntes} />
            </Col>
            <Col>
              <Label>Óxido ¿tiene? (después)</Label>
              <YN value={tamborOxidoTieneDesp} onChange={setTamborOxidoTieneDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Revisado</Label>
              <YN value={tamborRevisado} onChange={setTamborRevisado} />
            </Col>
            <Col>
              <Label>Revisión SMA</Label>
              <OkNec value={tamborRevisionSMA} onChange={setTamborRevisionSMA} />
            </Col>
          </Row2>
        </Card>

        {/* 8) Revestimiento (balatas) */}
        <Section>8) Revestimiento (balatas)</Section>
        <Card>
          <Row2>
            <Col>
              <Label>¿Presenta desgaste/fisuras/aceite? Izq. (antes)</Label>
              <YN value={balataIzqAntes} onChange={setBalataIzqAntes} />
            </Col>
            <Col>
              <Label>Izq. (después)</Label>
              <YN value={balataIzqDesp} onChange={setBalataIzqDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>¿Presenta desgaste/fisuras/aceite? Der. (antes)</Label>
              <YN value={balataDerAntes} onChange={setBalataDerAntes} />
            </Col>
            <Col>
              <Label>Der. (después)</Label>
              <YN value={balataDerDesp} onChange={setBalataDerDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Revisado</Label>
              <YN value={balataRevisado} onChange={setBalataRevisado} />
            </Col>
            <Col>
              <Label>Revisión SMA</Label>
              <OkNec value={balataRevisionSMA} onChange={setBalataRevisionSMA} />
            </Col>
          </Row2>
        </Card>

        {/* 9) Operación del freno */}
        <Section>9) Operación del freno</Section>
        <Card>
          <Row2>
            <Col>
              <Label>Prueba de funcionamiento (antes)</Label>
              <BM value={operPruebaAntes} onChange={setOperPruebaAntes} />
            </Col>
            <Col>
              <Label>Prueba de funcionamiento (después)</Label>
              <BM value={operPruebaDesp} onChange={setOperPruebaDesp} />
            </Col>
          </Row2>
          <Row2>
            <Col>
              <Label>Revisado</Label>
              <YN value={operRevisado} onChange={setOperRevisado} />
            </Col>
            <Col>
              <Label>Revisión SMA</Label>
              <OkNec value={operRevisionSMA} onChange={setOperRevisionSMA} />
            </Col>
          </Row2>
        </Card>

        {/* ======= SEGUNDA HOJA: FOTOS ANTES / DESPUÉS ======= */}
        <Section>Fotos (Antes / Después)</Section>
        <PhotoBlock title="General" value={photos.general} onChange={(v) => updPhoto("general", v)} />
        <PhotoBlock title="Pines / Levas" value={photos.pines_levas} onChange={(v) => updPhoto("pines_levas", v)} />
        <PhotoBlock title="Torque" value={photos.torque} onChange={(v) => updPhoto("torque", v)} />
        <PhotoBlock title="Resortes" value={photos.resortes} onChange={(v) => updPhoto("resortes", v)} />
        <PhotoBlock title="Émbolo" value={photos.embolo} onChange={(v) => updPhoto("embolo", v)} />
        <PhotoBlock title="Contacto de freno" value={photos.contacto} onChange={(v) => updPhoto("contacto", v)} />
        <PhotoBlock title="Brazo / Palanca / Perno" value={photos.brazo_palanca_perno} onChange={(v) => updPhoto("brazo_palanca_perno", v)} />
        <PhotoBlock title="Tambor" value={photos.tambor} onChange={(v) => updPhoto("tambor", v)} />
        <PhotoBlock title="Balatas" value={photos.balatas} onChange={(v) => updPhoto("balatas", v)} />
        <PhotoBlock title="Operación del freno" value={photos.operacion} onChange={(v) => updPhoto("operacion", v)} />

        <IconButton label={saving ? "Guardando…" : "Guardar"} onPress={onGuardar} disabled={saving} />
      </ScrollView>
    </View>
  );
}

// -------- Selectores (chips) para Y/N, Bien/Mal, Ok/Nec --------
function YN({ value, onChange }) {
  return <Chips options={["Si", "No"]} value={value} onChange={onChange} />;
}
function BM({ value, onChange }) {
  return <Chips options={["Bien", "Mal"]} value={value} onChange={onChange} />;
}
function OkNec({ value, onChange }) {
  return <Chips options={["Ok", "Necesita Seguimiento"]} value={value} onChange={onChange} />;
}

// -------- helpers --------
function toNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function avg(list) {
  const nums = list.map(toNumberOrNull).filter((n) => typeof n === "number");
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return Math.round((s / nums.length) * 100) / 100;
}
function yn(v) {
  return v == null ? null : v === "Si" ? true : v === "No" ? false : null;
}
function bm(v) {
  return v == null ? null : v === "Bien" ? "bien" : v === "Mal" ? "mal" : null;
}
function oknec(v) {
  return v == null ? null : v === "Ok" ? "ok" : v === "Necesita Seguimiento" ? "seguimiento" : null;
}

// -------- estilos --------
const styles = StyleSheet.create({
  section: { marginTop: 18, fontSize: 18, fontWeight: "800", color: "#1f2937" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  label: { fontSize: 12, color: "#6b7280", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    fontSize: 16,
    color: "#111827",
  },
  readonly: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f9fafb",
  },
  readonlyText: { fontSize: 16, color: "#111827" },
  row2: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  col: { flexGrow: 1, flexBasis: 0, minWidth: 220 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: "#c7cdd6",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { color: "#111827", fontWeight: "700" },
  chipTextOn: { color: "#fff" },

  btn: { marginTop: 20, padding: 16, borderRadius: 14, alignItems: "center" },
  btnPrimary: { backgroundColor: "#2563eb" },
  btnSecondary: { backgroundColor: "#e5e7eb" },
  btnText: { fontWeight: "900", fontSize: 16 },

  // Fotos
  photoBlockTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8, color: "#111827" },
  photoColumns: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  photoCol: { flexGrow: 1, flexBasis: 0, minWidth: 260 },
  photoColHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  photoColTitle: { fontWeight: "800", color: "#374151" },
  photoAdd: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#0ea5e9", borderRadius: 999 },
  photoAddText: { color: "#fff", fontWeight: "800" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoItem: { width: 150, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" },
  photoImg: { width: "100%", height: 100, backgroundColor: "#f3f4f6" },
  photoNote: { paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#eef2f7" },
  photoRemove: { alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#eef2f7", backgroundColor: "#fee2e2" },
  photoRemoveText: { color: "#991b1b", fontWeight: "700" },
});