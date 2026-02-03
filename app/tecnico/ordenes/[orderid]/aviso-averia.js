// app/tecnico/ordenes/[orderid]/aviso-averia.js
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
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

// ✅ En tu SDK, los métodos legacy se deben importar del legacy:
import * as LegacyFS from "expo-file-system/legacy";

import Header from "../../../../src/components/Header";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "../../../../src/context/AuthContext";
import NetInfo from "@react-native-community/netinfo";

import {
  fetchMetaAviso,
  fetchCatalogoCircunstancia,
  crearAvisoAveriaSap,
} from "../../../../src/services/avisoAveriaSap";

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

/**
 * ✅ Convierte un file:// a base64 usando la API legacy
 * - En tu Expo, readAsStringAsync desde "expo-file-system" ya no se permite.
 * - Usamos encoding: "base64" (string).
 */
async function uriToBase64(uri) {
  if (!uri) return null;

  const b64 = await LegacyFS.readAsStringAsync(uri, {
    encoding: "base64",
  });

  return b64 || null;
}

/**
 * ✅ Asegura file:// cuando el uri venga content:// (Android)
 */
async function ensureFileUri(uri, ext = "jpg") {
  if (!uri) return null;
  if (!uri.startsWith("content://")) return uri;

  const dest = `${LegacyFS.cacheDirectory}aviso_${Date.now()}.${ext}`;
  await LegacyFS.copyAsync({ from: uri, to: dest });
  return dest;
}

export default function AvisoAveriaSapScreen() {
  const params = useLocalSearchParams();

  const rawId =
    params.orderid ||
    params.id ||
    params.Orderid ||
    params.ordenId ||
    params.orderId ||
    null;

  const orderid = rawId ? String(rawId).trim() : null;

  const { token, user } = useAuth();
  const emailUsuario =
    String(user?.email || user?.correo || user?.preferred_username || "").trim() || null;

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  const [catR, setCatR] = useState([]);
  const [catS, setCatS] = useState([]);
  const [catT, setCatT] = useState([]);

  const [selR, setSelR] = useState([]);
  const [selS, setSelS] = useState(null);
  const [selT, setSelT] = useState([]);

  const [shortText, setShortText] = useState("");
  const [itemDescript, setItemDescript] = useState("");
  const [causaText, setCausaText] = useState("");
  const [piezaDescripcion, setPiezaDescripcion] = useState("");

  const [saving, setSaving] = useState(false);

  const [evidenceUri, setEvidenceUri] = useState(null);
  const [evidenceMeta, setEvidenceMeta] = useState(null);

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
        Alert.alert("Error", e?.message || "No se pudo cargar la información del aviso.");
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
        base64: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      let uri = asset?.uri;

      if (!uri) {
        Alert.alert("Error", "No se recibió la imagen de la cámara.");
        return;
      }

      // ✅ content:// -> file://
      uri = await ensureFileUri(uri, "jpg");

      // ✅ manipulación (sale como file://)
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );

      const finalUri = manipulated?.uri || uri;

      // ✅ Base64 por legacy (ya NO truena)
      const base64 = await uriToBase64(finalUri);
      if (!base64) {
        Alert.alert("Error", "No se pudo convertir la imagen a Base64.");
        return;
      }

      setEvidenceUri(finalUri);

      const fileName = `aviso_${String(orderid || "orden")}_${Date.now()}.jpg`;

      let sizeBytes = null;
      try {
        const info = await LegacyFS.getInfoAsync(finalUri);
        sizeBytes = info?.size ?? null;
      } catch {}

      setEvidenceMeta({
        fileName,
        mimeType: "image/jpeg",
        base64,
        sizeBytes,
      });

      console.log("[AVISO-AVERIA] evidenceUri =", finalUri);
      console.log("[AVISO-AVERIA] base64 length =", base64?.length);
      console.log("[AVISO-AVERIA] mimeType =", "image/jpeg");
      console.log("[AVISO-AVERIA] platform =", Platform.OS);
    } catch (e) {
      console.error("Error al tomar foto:", e);
      Alert.alert("Error", e?.message || "No se pudo abrir la cámara o convertir la imagen.");
    }
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

    if (!evidenceMeta?.base64) {
      return Alert.alert("Falta evidencia", "Toma una foto de evidencia para adjuntarla al aviso.");
    }

    const payload = {
      equipment: meta.Equipment,
      docNumber: meta.DocNumber,
      itmNumber: meta.ItmNumber,
      shortText,
      itemDescript,
      piezaDescripcion,
      causaText,
      email: emailUsuario,
      piezaCircList: selR,
      lugarCirc: selS,
      causasCirc: selT,

      // ✅ Según tu JSON: DocId vacío
      Attachments: [
        {
          DocId: " ",
          FileName: evidenceMeta.fileName,
          MimeType: evidenceMeta.mimeType, // "image/jpeg"
          Base64: evidenceMeta.base64,
        },
      ],
    };

    try {
      setSaving(true);

      const online = await isOnlineNow();
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

      const res = await crearAvisoAveriaSap(payload, token);

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
        const message =
          backendMsg && notifNo
            ? `${backendMsg}\nNo. de aviso: ${notifNo}`
            : backendMsg
            ? backendMsg
            : notifNo
            ? `Se creó el aviso en SAP.\nNo. de aviso: ${notifNo}`
            : "Se creó el aviso en SAP (no se recibió número de aviso).";

        Alert.alert("Aviso creado", message, [{ text: "OK", onPress: () => router.back() }]);
      } else {
        Alert.alert("Aviso no creado", res?.error || "Hubo un problema al crear el aviso en SAP.");
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
          <Text style={styles.label}>Descripción breve</Text>
          <TextInput style={styles.input} value={shortText} onChangeText={setShortText} />

          <Text style={styles.label}>Descripción de la pieza</Text>
          <TextInput style={styles.input} value={piezaDescripcion} onChangeText={setPiezaDescripcion} />
        </View>

        <Text style={styles.section}>Falla en la pieza / daño</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Descripción de la falla</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            multiline
            value={itemDescript}
            onChangeText={setItemDescript}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>Código de daño (Catálogo = R) – máx 2</Text>

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

          <Text style={[styles.label, { marginTop: 10 }]}>Código de causa (Catálogo = T) – máx 2</Text>

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
              <Text style={[styles.label, { marginTop: 8 }]}>
                {evidenceMeta?.sizeBytes != null
                  ? `Tamaño: ${Math.round(evidenceMeta.sizeBytes / 1024)} KB`
                  : ""}
              </Text>
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
