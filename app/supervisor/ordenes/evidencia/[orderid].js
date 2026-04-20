import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  TextInput,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { fetchOperacionesSupervisor } from "../../../../src/services/operacionesSupervisor";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  muted: "#63718B",
  accent: "#0A6ED1",
  success: "#27AE60",
  danger: "#E76565",
};

/* =========================
   Helpers de prorrateo / SAP
   ========================= */
function sapDateFromMs(ms) {
  const d = new Date(ms);
  const midnight = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();
  return `/Date(${midnight})/`;
}

function sapTimePTFromMs(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  return `PT${h}H${m}M${s}S`;
}

function prorateMinutes(totalMin, n) {
  const base = Math.floor(totalMin / n);
  const rem = totalMin % n;
  const arr = Array(n).fill(base);
  for (let i = 0; i < rem; i++) arr[i] += 1;
  return arr;
}

function buildSequentialWindows(startMs, mins) {
  let cursor = startMs;
  return mins.map((m) => {
    const end = cursor + m * 60000;
    const win = { start: cursor, end };
    cursor = end;
    return win;
  });
}

function normalizeSupervisorOps(ops = []) {
  if (!Array.isArray(ops)) return [];
  return ops
    .map((op) => {
      const activity = String(
        op?.activity || op?.Activity || op?.Vornr || "",
      ).trim();

      const subactivity = String(
        op?.subactivity || op?.SubActivity || op?.Uvorn || "",
      ).trim();

      return {
        ...op,
        activity,
        subactivity,
      };
    })
    .filter((op) => !!op.activity);
}

function buildSupervisorConfirmationPayload({
  orderId,
  opsAll,
  durationMinutes,
}) {
  const selectedOps = normalizeSupervisorOps(opsAll);

  if (!selectedOps.length) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const finishMs = Date.now();
  const startMs = finishMs - durationMinutes * 60000;

  const minsArr = prorateMinutes(durationMinutes, selectedOps.length);
  const windows = buildSequentialWindows(startMs, minsArr);

  return {
    Order: "S1",
    ConfirmationOrderSet: selectedOps.map((op, idx) => {
      const actRaw = String(op.activity || "").trim();
      const subRaw = String(op.subactivity || "").trim();

      const Operation = actRaw.padStart(4, "0");
      const SubActivity = subRaw ? subRaw.padStart(4, "0") : "";
      const w = windows[idx];

      const row = {
        ConfNo: "",
        Orderid: String(orderId || "").trim(),
        Operation,
        PostgDate: sapDateFromMs(finishMs),
        ActWork: String(minsArr[idx]),
        UnWork: "min",
        ExecStartDate: sapDateFromMs(w.start),
        ExecFinDate: sapDateFromMs(w.end),
        ExecStartTime: sapTimePTFromMs(w.start),
        ExecFinTime: sapTimePTFromMs(w.end),
        FinConf: "X",
      };

      if (SubActivity) row.SubActivity = SubActivity;
      return row;
    }),
    ConfirmationMaterialSet: [],
    Return: [],
  };
}

function getBackendMessage(err, fallback) {
  return (
    err?.response?.data?.error?.message?.value ||
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.response?.data?.d?.message ||
    err?.message ||
    fallback
  );
}

export default function EvidenciaOrden() {
  const { orderid } = useLocalSearchParams();

  const [archivos, setArchivos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [tipoEnvio, setTipoEnvio] = useState("TBM");

  const [operaciones, setOperaciones] = useState([]);
  const [loadingOperaciones, setLoadingOperaciones] = useState(true);

  const [horasEjecucion, setHorasEjecucion] = useState("");
  const [minutosEjecucion, setMinutosEjecucion] = useState("");

  const orderIdLimpio = useMemo(() => {
    return String(orderid || "").trim();
  }, [orderid]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!orderIdLimpio) {
        if (mounted) {
          setOperaciones([]);
          setLoadingOperaciones(false);
        }
        return;
      }

      try {
        setLoadingOperaciones(true);
        const ops = await fetchOperacionesSupervisor(orderIdLimpio);

        if (mounted) {
          setOperaciones(Array.isArray(ops) ? ops : []);
        }
      } catch (error) {
        console.log("[EVIDENCIA] Error cargando operaciones:", error);
        if (mounted) {
          setOperaciones([]);
        }
      } finally {
        if (mounted) {
          setLoadingOperaciones(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [orderIdLimpio]);

  const formatearTamano = (bytes) => {
    if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) {
      return "Tamaño no disponible";
    }

    const size = Number(bytes);

    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const getExtensionFromName = (fileName) => {
    const safeName = String(fileName || "").trim();
    if (!safeName.includes(".")) return "bin";
    return safeName.split(".").pop().toLowerCase();
  };

  const formatearFechaArchivo = (date = new Date()) => {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    return `${dd}${mm}${yyyy}`;
  };

  const construirNombreArchivo = (file) => {
    const extension = getExtensionFromName(file?.name);
    const fecha = formatearFechaArchivo(new Date());
    const tipoArchivo = file?.tipoEnvio || "TBM";

    if (tipoArchivo === "TBM") {
      return `TBMKY_${orderIdLimpio}_${fecha}.${extension}`;
    }

    return `MANTENIMIENTO_${orderIdLimpio}_${fecha}.${extension}`;
  };

  const seleccionarArchivo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const assets = Array.isArray(result.assets) ? result.assets : [];
      if (!assets.length) return;

      const assetsConTipo = assets.map((file) => ({
        ...file,
        tipoEnvio,
      }));

      setArchivos((prev) => {
        const existentes = new Set(
          prev.map((f) => `${f.name}-${f.size}-${f.uri}-${f.tipoEnvio}`),
        );

        const nuevos = assetsConTipo.filter(
          (f) => !existentes.has(`${f.name}-${f.size}-${f.uri}-${f.tipoEnvio}`),
        );

        return [...prev, ...nuevos];
      });
    } catch (error) {
      console.log("[EVIDENCIA] Error seleccionando archivo:", error);
      Alert.alert("Error", "No se pudo abrir el selector de archivos.");
    }
  };

  const eliminarArchivo = (uri) => {
    setArchivos((prev) => prev.filter((file) => file.uri !== uri));
  };

  const cambiarTipoArchivo = (uri, nuevoTipo) => {
    setArchivos((prev) =>
      prev.map((file) =>
        file.uri === uri ? { ...file, tipoEnvio: nuevoTipo } : file,
      ),
    );
  };

  const convertirArchivoABase64 = async (file) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return base64;
    } catch (error) {
      console.log(
        "[EVIDENCIA] Error convirtiendo a base64:",
        file?.name,
        error,
      );
      throw new Error(`No se pudo convertir el archivo ${file?.name || ""}`);
    }
  };

  const construirPayload = async () => {
    const attachments = [];

    for (const file of archivos) {
      const base64 = await convertirArchivoABase64(file);

      attachments.push({
        DocId: orderIdLimpio,
        FileName: construirNombreArchivo(file),
        MimeType: getExtensionFromName(file?.name),
        Base64: base64,
      });
    }

    return {
      WorkOrderHeader: {
        Orderid: orderIdLimpio,
      },
      Attachments: attachments,
      Return: [],
    };
  };

  const getDurationMinutes = () => {
    const h = parseInt(String(horasEjecucion || "0").trim(), 10);
    const m = parseInt(String(minutosEjecucion || "0").trim(), 10);

    const hh = Number.isFinite(h) && h >= 0 ? h : 0;
    const mm = Number.isFinite(m) && m >= 0 ? m : 0;

    return hh * 60 + mm;
  };

  const enviarEvidencia = async () => {
    if (!orderIdLimpio) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    if (!archivos.length) {
      Alert.alert("Validación", "Debes seleccionar al menos un archivo.");
      return;
    }

    if (!Array.isArray(operaciones) || operaciones.length === 0) {
      Alert.alert(
        "Validación",
        "No se encontraron operaciones para esta orden.",
      );
      return;
    }

    const durationMinutes = getDurationMinutes();
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      Alert.alert(
        "Validación",
        "Debes capturar un tiempo de ejecución válido en horas y/o minutos.",
      );
      return;
    }

    try {
      setGuardando(true);

      const payloadEvidencia = await construirPayload();

      const payloadConfirmaciones = buildSupervisorConfirmationPayload({
        orderId: orderIdLimpio,
        opsAll: operaciones,
        durationMinutes,
      });

      if (!payloadConfirmaciones) {
        throw new Error(
          "No se pudo construir el payload de confirmaciones de operaciones.",
        );
      }

      console.log(
        "[EVIDENCIA] JSON ATTACHMENTS:",
        JSON.stringify(payloadEvidencia, null, 2),
      );

      console.log(
        "[EVIDENCIA] JSON CONFIRMATIONS:",
        JSON.stringify(payloadConfirmaciones, null, 2),
      );

      const responseEvidencia = await api.post(
        "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
        payloadEvidencia,
      );

      console.log("[EVIDENCIA] RESPONSE ATTACHMENTS:", responseEvidencia?.data);

      const responseConfirm = await api.post(
        "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
        payloadConfirmaciones,
      );

      console.log("[EVIDENCIA] RESPONSE CONFIRMATIONS:", responseConfirm?.data);

      Alert.alert(
        "Éxito",
        "La evidencia y las operaciones confirmadas se enviaron correctamente.",
      );
      router.back();
    } catch (error) {
      console.log(
        "[EVIDENCIA] Error completo:",
        error?.response?.data || error,
      );

      const mensaje = getBackendMessage(
        error,
        "No se pudo enviar la información.",
      );

      Alert.alert("Error al enviar", String(mensaje));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title={`Evidencia Orden ${orderIdLimpio}`} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Carga de evidencia</Text>
          <Text style={styles.subtitle}>
            Selecciona archivos desde tu teléfono para esta orden.
          </Text>

          <Text style={styles.label}>Tiempo total de ejecución de la orden</Text>

          <View style={styles.timeRow}>
            <View style={styles.timeInputWrap}>
              <Text style={styles.smallLabel}>Horas</Text>
              <TextInput
                value={horasEjecucion}
                onChangeText={setHorasEjecucion}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor={COLORS.muted}
                style={styles.timeInput}
              />
            </View>

            <View style={styles.timeInputWrap}>
              <Text style={styles.smallLabel}>Minutos</Text>
              <TextInput
                value={minutosEjecucion}
                onChangeText={setMinutosEjecucion}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor={COLORS.muted}
                style={styles.timeInput}
              />
            </View>
          </View>

          <View style={styles.opsInfoBox}>
            <Text style={styles.opsInfoTitle}>Operaciones a confirmar</Text>

            {loadingOperaciones ? (
              <View style={styles.opsLoadingRow}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={styles.opsInfoText}>Cargando operaciones…</Text>
              </View>
            ) : (
              <Text style={styles.opsInfoText}>
                Se enviarán automáticamente todas las operaciones de la orden:{" "}
                <Text style={styles.opsInfoCount}>{operaciones.length}</Text>
              </Text>
            )}
          </View>

          <Text style={styles.label}>Tipo que se asignará al seleccionar</Text>

          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[
                styles.typeBtn,
                tipoEnvio === "TBM" && styles.typeBtnActive,
              ]}
              onPress={() => setTipoEnvio("TBM")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  tipoEnvio === "TBM" && styles.typeBtnTextActive,
                ]}
              >
                TBM
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeBtn,
                tipoEnvio === "FINALIZACION" && styles.typeBtnActive,
              ]}
              onPress={() => setTipoEnvio("FINALIZACION")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  tipoEnvio === "FINALIZACION" && styles.typeBtnTextActive,
                ]}
              >
                Finalización
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.pickBtn}
            onPress={seleccionarArchivo}
            activeOpacity={0.85}
          >
            <Ionicons name="document-attach-outline" size={18} color="#fff" />
            <Text style={styles.pickBtnText}>Seleccionar archivo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Archivos seleccionados ({archivos.length})
          </Text>

          {!archivos.length ? (
            <Text style={styles.emptyText}>
              No has seleccionado archivos todavía.
            </Text>
          ) : (
            archivos.map((file, index) => (
              <View key={`${file.uri}-${index}`} style={styles.fileItem}>
                <View style={styles.fileIconWrap}>
                  <Ionicons
                    name="document-text-outline"
                    size={22}
                    color={COLORS.accent}
                  />
                </View>

                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {file.name || `Archivo ${index + 1}`}
                  </Text>

                  <Text style={styles.fileMeta} numberOfLines={1}>
                    Tipo asignado:{" "}
                    {file.tipoEnvio === "TBM" ? "TBM" : "Finalización"}
                  </Text>

                  <Text style={styles.fileMeta} numberOfLines={1}>
                    Nombre a enviar: {construirNombreArchivo(file)}
                  </Text>

                  <Text style={styles.fileMeta}>
                    Tamaño: {formatearTamano(file.size)}
                  </Text>

                  <View style={styles.inlineTypeRow}>
                    <TouchableOpacity
                      style={[
                        styles.smallTypeBtn,
                        file.tipoEnvio === "TBM" && styles.smallTypeBtnActive,
                      ]}
                      onPress={() => cambiarTipoArchivo(file.uri, "TBM")}
                    >
                      <Text
                        style={[
                          styles.smallTypeBtnText,
                          file.tipoEnvio === "TBM" &&
                            styles.smallTypeBtnTextActive,
                        ]}
                      >
                        TBM
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.smallTypeBtn,
                        file.tipoEnvio === "FINALIZACION" &&
                          styles.smallTypeBtnActive,
                      ]}
                      onPress={() =>
                        cambiarTipoArchivo(file.uri, "FINALIZACION")
                      }
                    >
                      <Text
                        style={[
                          styles.smallTypeBtnText,
                          file.tipoEnvio === "FINALIZACION" &&
                            styles.smallTypeBtnTextActive,
                        ]}
                      >
                        Finalización
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => eliminarArchivo(file.uri)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, guardando && styles.saveBtnDisabled]}
          onPress={enviarEvidencia}
          activeOpacity={0.9}
          disabled={guardando}
        >
          {guardando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Enviar Evidencia</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  content: {
    padding: 16,
    paddingBottom: 30,
  },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 2,
      },
    }),
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.title,
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 14,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 8,
  },

  smallLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 6,
  },

  timeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },

  timeInputWrap: {
    flex: 1,
  },

  timeInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.title,
    fontWeight: "700",
  },

  opsInfoBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },

  opsInfoTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.title,
    marginBottom: 4,
  },

  opsInfoText: {
    fontSize: 12,
    color: COLORS.text,
  },

  opsInfoCount: {
    fontWeight: "800",
    color: COLORS.title,
  },

  opsLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  typeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },

  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  typeBtnActive: {
    backgroundColor: "#EAF4FF",
    borderColor: COLORS.accent,
  },

  typeBtnText: {
    color: COLORS.title,
    fontSize: 13,
    fontWeight: "700",
  },

  typeBtnTextActive: {
    color: COLORS.accent,
  },

  pickBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  pickBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
    fontStyle: "italic",
  },

  fileItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },

  fileIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  fileInfo: {
    flex: 1,
    paddingRight: 10,
  },

  fileName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.title,
    marginBottom: 2,
  },

  fileMeta: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 2,
  },

  inlineTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },

  smallTypeBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },

  smallTypeBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: "#EAF4FF",
  },

  smallTypeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.title,
  },

  smallTypeBtnTextActive: {
    color: COLORS.accent,
  },

  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
  },

  saveBtn: {
    backgroundColor: COLORS.success,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  saveBtnDisabled: {
    opacity: 0.7,
  },

  saveText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});