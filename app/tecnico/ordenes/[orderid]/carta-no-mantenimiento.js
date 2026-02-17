// app/tecnico/ordenes/[orderid]/carta-no-mantenimiento.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import Header from "../../../../src/components/Header";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "../../../../src/context/AuthContext";
import api from "../../../../src/services/api";

import { fetchDatosNoMantenimiento, guardarCartaNoMantenimiento } from "../../../../src/services/noMantenimiento";

function Row({ label, value }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}>
        <Text style={styles.readonlyText}>{String(value ?? "—")}</Text>
      </View>
    </View>
  );
}

export default function CartaNoMantenimientoForm() {
  const { orderid } = useLocalSearchParams();
  const { user, ensureValidToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [datos, setDatos] = useState(null);

  // Editable
  const [mesAfecto, setMesAfecto] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // Status/cause code a mandar (por ahora fijo 0011)
  // Si luego quieres selector, aquí lo cambiamos por un dropdown.
  const CAUSA_CODE = "0011";

  const [saving, setSaving] = useState(false);

  const fechaProgramadaDDMMYYYY = useMemo(() => {
    if (!datos?.StartDate) return "";
    const d = new Date(datos.StartDate);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, [datos]);

  // ✅ Nombre técnico asignado (prioridad: user del login)
  const tecnicoAsignado = useMemo(() => {
    const nomina = user?.nomina || datos?.nomina || "";
    const nombre =
      user?.nombre ||
      user?.name ||
      datos?.nombre ||
      datos?.Nombre ||
      "";
    const full = `${nomina ? nomina + " - " : ""}${nombre}`.trim();
    return full || "—";
  }, [user, datos]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const d = await fetchDatosNoMantenimiento(String(orderid));
        if (!alive) return;
        setDatos(d);

        // Prellenar "mes afecto" con StartDate
        if (d?.StartDate) {
          const dt = new Date(d.StartDate);
          const meses = [
            "ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
            "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE",
          ];
          setMesAfecto(`${meses[dt.getMonth()]} ${dt.getFullYear()}`);
        }
      } catch (e) {
        console.error(e);
        Alert.alert("Error", "No se pudieron cargar los datos.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [orderid]);

  // ✅ Notificar SAP: activar causa 0011 + desactivar 0100
  const notificarSapNoMantenimiento = async (orderId) => {
    const payloadSap = {
      OrderId: String(orderId),
      WorkOrderHeader: {
        Orderid: String(orderId),
      },
      WorkOrderUserStatusSet: [
        {
          UserStText: CAUSA_CODE, // ✅ causa (ej. 0011)
          Langu: "ES",
          Inactive: "",
        },
        {
          UserStText: "0100", // ✅ quitar pendiente
          Langu: "ES",
          Inactive: "X",
        },
      ],
      Return: [],
    };

    // OJO: usamos tu BTP API (baseURL ya apunta a CF)
    await api.post(
      `/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet?sap-client=400&sap-language=ES`,
      payloadSap,
      { headers: { "Content-Type": "application/json" } }
    );
  };

  const onGuardar = async () => {
    if (saving) return;
    if (!datos) return;

    if (!descripcion.trim()) {
      return Alert.alert("Falta información", "Captura la causa / descripción concreta.");
    }

    const payloadLocal = {
      orderid: datos.Orderid,
      equipment: datos.Equipment,
      fecha_programada: datos.StartDate,
      razon_social: datos.razon_social,
      direccion: datos.direccion,

      // guardamos mecánico asignado (del user si existe, si no del backend)
      mecanico: {
        nomina: user?.nomina ?? datos.nomina,
        nombre: user?.nombre ?? user?.name ?? datos.nombre,
      },

      mes_afecto: mesAfecto,
      descripcion_concreta: descripcion,
      causa_code: CAUSA_CODE, // opcional para tu backend/local
    };

    try {
      setSaving(true);

      // 1) Guardar local (tu backend)
      await guardarCartaNoMantenimiento(payloadLocal);

      // 2) Notificar a SAP (update estatus)
      try {
        const ok = await ensureValidToken?.();
        if (ok === false) throw new Error("Token inválido");

        await notificarSapNoMantenimiento(datos.Orderid);

        Alert.alert(
          "Listo",
          `Notificación enviada a SAP para la orden #${datos.Orderid} ✅`,
          [
            {
              text: "OK",
              onPress: () => router.replace("/tecnico/ordenes"),
            },
          ]
        );
      } catch (sapErr) {
        console.log("SAP notify error:", sapErr?.response?.data || sapErr?.message || sapErr);

        Alert.alert(
          "Guardado local",
          `La carta se guardó, pero no se pudo notificar SAP para la orden #${datos.Orderid}. Intenta más tarde o avisa al supervisor.`,
          [
            {
              text: "OK",
              onPress: () => router.replace("/tecnico/ordenes"),
            },
          ]
        );
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo guardar la carta.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!datos) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>No hay datos para la orden.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F5F7FB" }}>
      <Header title="Carta de no mantenimiento" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={styles.section}>Datos de la orden</Text>
        <View style={styles.cardCompact}>
          <Row label="No. de orden" value={datos.Orderid} />
          <Row label="Equipo No" value={datos.Equipment} />
          <Row label="Fecha programada" value={fechaProgramadaDDMMYYYY} />
          <Row label="Razón social" value={datos.razon_social} />
          <Row label="Dirección" value={datos.direccion} />

          {/* ✅ AQUÍ mostramos el técnico asignado */}
          <Row label="Técnico asignado" value={tecnicoAsignado} />

          {/* opcional: mostrar causa que se notificará */}
          <Row label="Causa (clave)" value={CAUSA_CODE} />
        </View>

        <Text style={styles.section}>Mes afectado</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Afectó al mantenimiento correspondiente al mes de:</Text>
          <TextInput style={[styles.input, styles.inputReadonly]} value={mesAfecto} editable={false} />
        </View>

        <Text style={styles.section}>Causa (descripción concreta)</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Describe la causa por la cual no se realizó el mantenimiento:</Text>
          <TextInput
            style={[styles.input, { height: 160, textAlignVertical: "top" }]}
            placeholder="Escribe aquí la causa / descripción concreta..."
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />
        </View>

        <TouchableOpacity style={[styles.primary, saving && styles.primaryDisabled]} onPress={onGuardar} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Guardar</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "800",
    color: "#1f2937",
  },
  cardCompact: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  label: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 4,
  },
  readonly: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f9fafb",
  },
  readonlyText: {
    fontSize: 13,
    color: "#111827",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    fontSize: 14,
    color: "#111827",
  },
  inputReadonly: {
    backgroundColor: "#f3f4f6",
    color: "#4b5563",
  },
  primary: {
    marginTop: 20,
    backgroundColor: "#16a34a",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
});
