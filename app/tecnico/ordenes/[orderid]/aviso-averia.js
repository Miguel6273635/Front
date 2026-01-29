// app/tecnico/ordenes/[id]/aviso-averia.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import Header from "../../../../src/components/Header";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "../../../../src/context/AuthContext";
import NetInfo from "@react-native-community/netinfo";

import {
  fetchMetaAviso,
  fetchCatalogoCircunstancia,
  crearAvisoAveriaSap,
} from "../../../../src/services/avisoAveriaSap";

// ✅ encola el JSON cuando no hay red
import { enqueueCrearAvisoAveria } from "../../../../src/offline/avisoAveriaOutbox";

const FIORI = {
  bg: "#F5F7FB",
  card: "#FFFFFF",
  border: "#D1D5DB",
  text: "#111827",
  textMuted: "#6B7280",
  primary: "#0A6ED1",
  danger: "#A10000",
};

async function isOnlineNow() {
  const st = await NetInfo.fetch();
  return !!st?.isConnected && st?.isInternetReachable !== false;
}

const Chip = ({ active, label, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
  </TouchableOpacity>
);

export default function AvisoAveriaSapScreen() {
  const params = useLocalSearchParams();
  const rawId = params.id || params.orderid || params.Orderid || params.ordenId || null;
  const orderid = rawId ? String(rawId).trim() : null;

  const { token, user } = useAuth();
  const emailUsuario =
    String(user?.email || user?.correo || user?.preferred_username || "").trim() || null;

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  const [catR, setCatR] = useState([]);
  const [catS, setCatS] = useState([]);
  const [catT, setCatT] = useState([]);

  // daños y causas son ARREGLOS (máx 2)
  const [selR, setSelR] = useState([]); // daños (R)
  const [selS, setSelS] = useState(null); // localización (S) única
  const [selT, setSelT] = useState([]); // causas (T)

  const [shortText, setShortText] = useState("");
  const [itemDescript, setItemDescript] = useState(""); // falla (ItemsSet[].Descript)
  const [causaText, setCausaText] = useState("");

  // descripción pieza (NotificationTextSet[].TextLine)
  const [piezaDescripcion, setPiezaDescripcion] = useState("");

  const [saving, setSaving] = useState(false);

  // Foto evidencia (local)
  const [evidenceUri, setEvidenceUri] = useState(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        console.log("[AVISO-AVERIA] params recibidos =", params);
        console.log("[AVISO-AVERIA] orderid resuelto =", orderid);

        if (!orderid || orderid === "undefined" || orderid === "null") {
          Alert.alert("Error", "No se recibió el identificador de la orden para crear el aviso.");
          if (alive) setLoading(false);
          return;
        }

        const [metaRes, r, s, t] = await Promise.all([
          fetchMetaAviso(orderid, token),
          fetchCatalogoCircunstancia("R", token),
          fetchCatalogoCircunstancia("S", token),
          fetchCatalogoCircunstancia("T", token),
        ]);

        if (!alive) return;

        setMeta(metaRes);
        setCatR(Array.isArray(r) ? r : []);
        setCatS(Array.isArray(s) ? s : []);
        setCatT(Array.isArray(t) ? t : []);

        setShortText(metaRes?.ShortTextDefault || "");
      } catch (e) {
        console.error("Error cargando aviso de avería:", e?.response?.data || e);
        Alert.alert(
          "Error",
          e?.message || "No se pudo cargar la información del aviso."
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [orderid, token]);

  const toggleMultiWithLimit = (prev, item, max = 2) => {
    const exists = prev.some((sel) => sel.Codigo === item.Codigo);
    if (exists) return prev.filter((sel) => sel.Codigo !== item.Codigo);
    if (prev.length >= max) {
      Alert.alert("Límite alcanzado", `Sólo puedes seleccionar hasta ${max} opciones en este grupo.`);
      return prev;
    }
    return [...prev, item];
  };

  const onGuardar = async () => {
    if (saving) return;
    if (!meta) return;

    if (!shortText.trim())
      return Alert.alert("Falta información", "Captura la descripción breve (ShortText).");

    if (!piezaDescripcion.trim())
      return Alert.alert("Falta información", "Captura la descripción de la pieza.");

    if (!itemDescript.trim())
      return Alert.alert("Falta información", "Captura la descripción de la falla (Descript).");

    if (!causaText.trim())
      return Alert.alert("Falta información", "Captura el texto de causa.");

    if (!selR.length || !selS || !selT.length) {
      return Alert.alert(
        "Falta información",
        "Selecciona al menos un código de daño (R), una localización (S) y al menos una causa (T)."
      );
    }

    if (!emailUsuario) {
      return Alert.alert("Falta usuario", "No se encontró el email del usuario loggeado.");
    }

    const payload = {
      equipment: meta.Equipment,
      docNumber: meta.DocNumber,
      itmNumber: meta.ItmNumber,
      shortText,
      itemDescript,
      piezaDescripcion,
      causaText,

      // ✅ email del técnico/loggeado
      email: emailUsuario,

      piezaCircList: selR,
      lugarCirc: selS,
      causasCirc: selT,
    };

    try {
      setSaving(true);

      console.log("=======================================");
      console.log("[AVISO-AVERIA] JSON ARMADO (payload):");
      console.log(JSON.stringify(payload, null, 2));
      console.log("=======================================");

      const online = await isOnlineNow();

      // ✅ OFFLINE: encolar JSON
      if (!online) {
        const r = await enqueueCrearAvisoAveria({ payload });

        if (r?.ok) {
          Alert.alert(
            "Guardado offline",
            "No hay conexión. El aviso quedó guardado en cola y se enviará automáticamente cuando regrese la red.",
            [{ text: "OK", onPress: () => router.back() }]
          );
        } else {
          Alert.alert("Error", "No se pudo guardar el aviso en la cola offline.");
        }
        return;
      }

      // ✅ ONLINE: enviar normal
      const res = await crearAvisoAveriaSap(payload, token);
      console.log("[AVISO-AVERIA] respuesta backend crearAvisoAveriaSap:", res);

      if (res?.ok) {
        const notifNo =
          res?.notifNo ||
          res?.raw?.NotifNo ||
          res?.raw?.NotificationNo ||
          (Array.isArray(res?.raw?.Return?.results)
            ? (() => {
                const msgs = res.raw.Return.results.map((x) => String(x?.Message || "")).join(" | ");
                const nums = msgs.match(/\d{6,}/g);
                return nums?.sort((a, b) => b.length - a.length)[0] || null;
              })()
            : null);

        const backendMsg = res?.sapMessage;
        let message = "";

        if (backendMsg && notifNo) message = `${backendMsg}\nNo. de aviso: ${notifNo}`;
        else if (backendMsg) message = backendMsg;
        else if (notifNo) message = `Se creó el aviso en SAP.\nNo. de aviso: ${notifNo}`;
        else message = "Se creó el aviso en SAP (no se recibió número de aviso).";

        Alert.alert("Aviso creado", message, [{ text: "OK", onPress: () => router.back() }]);
      } else {
        Alert.alert(
          "Aviso no creado",
          res?.error ||
            "Hubo un problema al crear el aviso en SAP. Revisa conexión o intenta más tarde."
        );
      }
    } catch (e) {
      console.error("Error al crear aviso de avería:", e?.response?.data || e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.sapMessage ||
        e?.message ||
        "No se pudo crear el aviso en SAP.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso requerido", "Necesitas otorgar permiso de cámara para tomar una foto.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setEvidenceUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error("Error al tomar foto:", e);
      Alert.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: FIORI.bg }}>
        <Header title="Aviso de avería (SAP)" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={FIORI.primary} />
          <Text style={{ marginTop: 10, color: FIORI.textMuted, fontWeight: "700" }}>
            Cargando información…
          </Text>
        </View>
      </View>
    );
  }

  if (!meta) {
    return (
      <View style={{ flex: 1, backgroundColor: FIORI.bg }}>
        <Header title="Aviso de avería (SAP)" />
        <View style={styles.center}>
          <Text style={{ color: FIORI.text }}>No se pudo obtener la información de la orden.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: FIORI.bg }}>
      <Header title="Aviso de avería (SAP)" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text style={styles.section}>Datos base</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Orden</Text>
          <Text style={styles.value}>{meta.Orderid}</Text>

          <Text style={styles.label}>Equipo</Text>
          <Text style={styles.value}>{meta.Equipment}</Text>

          <Text style={styles.label}>DocNumber (SalesOrd)</Text>
          <Text style={styles.value}>{meta.DocNumber}</Text>

          <Text style={styles.label}>ItmNumber (SOrdItem)</Text>
          <Text style={styles.value}>{meta.ItmNumber}</Text>
        </View>

        <Text style={styles.section}>Encabezado del aviso</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Descripción breve (ShortText)</Text>
          <TextInput
            style={styles.input}
            value={shortText}
            onChangeText={setShortText}
            placeholder="Breve descripción del aviso"
          />

          <Text style={styles.label}>Descripción de la pieza (NotificationTextSet)</Text>
          <TextInput
            style={styles.input}
            value={piezaDescripcion}
            onChangeText={setPiezaDescripcion}
            placeholder="Ej: sensor, polea, etc."
          />
        </View>

        <Text style={styles.section}>Falla en la pieza / daño</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Descripción de la falla (Descript)</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            multiline
            value={itemDescript}
            onChangeText={setItemDescript}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>
            Código de daño (Catálogo = R) – máx 2
          </Text>

          <View style={styles.chipsWrap}>
            {catR.map((c) => {
              const isActive = selR.some((sel) => sel.Codigo === c.Codigo);
              return (
                <Chip
                  key={c.Codigo}
                  label={`${c.Codigo} - ${c.Descripcion}`}
                  active={isActive}
                  onPress={() => setSelR((prev) => toggleMultiWithLimit(prev, c, 2))}
                />
              );
            })}
          </View>
        </View>

        <Text style={styles.section}>Código de localización</Text>
        <View style={styles.card}>
          <View style={styles.chipsWrap}>
            {catS.map((c) => (
              <Chip
                key={c.Codigo}
                label={`${c.Codigo} - ${c.Descripcion}`}
                active={selS?.Codigo === c.Codigo}
                onPress={() => setSelS(c)}
              />
            ))}
          </View>
        </View>

        <Text style={styles.section}>Causa</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Texto de causa</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            multiline
            value={causaText}
            onChangeText={setCausaText}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>
            Código de causa (Catálogo = T) – máx 2
          </Text>

          <View style={styles.chipsWrap}>
            {catT.map((c) => {
              const isActive = selT.some((sel) => sel.Codigo === c.Codigo);
              return (
                <Chip
                  key={c.Codigo}
                  label={`${c.Codigo} - ${c.Descripcion}`}
                  active={isActive}
                  onPress={() => setSelT((prev) => toggleMultiWithLimit(prev, c, 2))}
                />
              );
            })}
          </View>
        </View>

        <Text style={styles.section}>Evidencia (foto)</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.btnSecondary} onPress={handleTakePhoto}>
            <Text style={styles.btnSecondaryText}>Tomar foto de evidencia</Text>
          </TouchableOpacity>

          {evidenceUri ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Foto capturada:</Text>
              <Image
                source={{ uri: evidenceUri }}
                style={{ width: "100%", height: 200, borderRadius: 12, marginTop: 6 }}
                resizeMode="cover"
              />
            </View>
          ) : (
            <Text style={[styles.label, { marginTop: 8 }]}>Aún no se ha tomado ninguna foto.</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.btnPrimary, saving && styles.btnPrimaryDisabled]}
          onPress={onGuardar}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnPrimaryText}>Crear aviso en SAP</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  section: { marginTop: 18, fontSize: 18, fontWeight: "800", color: FIORI.text },

  card: {
    backgroundColor: FIORI.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  label: { fontSize: 12, color: FIORI.textMuted, marginTop: 6 },
  value: { fontSize: 15, color: FIORI.text, fontWeight: "600" },

  input: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 15,
    color: FIORI.text,
    backgroundColor: "#FFFFFF",
    marginTop: 4,
  },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },

  chip: {
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  chipOn: { backgroundColor: FIORI.primary, borderColor: FIORI.primary },
  chipText: { fontSize: 11, color: FIORI.text, fontWeight: "700" },
  chipTextOn: { color: "#FFFFFF" },

  btnPrimary: {
    marginTop: 20,
    backgroundColor: FIORI.danger,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  btnPrimaryDisabled: { opacity: 0.7 },
  btnPrimaryText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },

  btnSecondary: {
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  btnSecondaryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
});
