// app/index.js
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { useOffline } from "../src/offline/OfflineProvider";
import { bootstrapPrefetchOrdenesSupervisor } from "../src/offline/bootstrapSync";

// 🔴 NUEVO: Importamos la función de precarga del técnico
import { prefetchOrdenesTecnico } from "../src/offline/prefetchOrdenesTecnico"; 

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return "/admin";
  if (rol_id === 2) return "/supervisor";
  return "/tecnico";
}

export default function Index() {
  const { user, loading } = useAuth();
  const { dbReady, online } = useOffline();

  useEffect(() => {
    // Si no hay sesión iniciada (o guardada en memoria) no hacemos nada
    if (!user || !dbReady) return;

    const inicializarDatos = async () => {
      try {
        if (online) {
          // 🔴 MEJORA: Descarga automática según el rol en cuanto la app se abre
          if (user.rol_id === 2) {
            console.log("[SYNC BACKGROUND] Actualizando órdenes de supervisor...");
            await bootstrapPrefetchOrdenesSupervisor();
          } else if (user.rol_id === 3) {
            console.log("[SYNC BACKGROUND] Actualizando órdenes del técnico...");
            await prefetchOrdenesTecnico(); // Dispara la petición a SAP en modo oculto
          }
        }
      } catch (e) {
        console.log("[SYNC BACKGROUND ERROR]", e?.message || e);
      }
    };

    // Lanzamos la sincronización sin bloquear al usuario
    inicializarDatos();
  }, [user, dbReady, online]); 

  // ... (el resto del código de Index se queda igual)
  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator size="large" /></View>;
  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href={pickHomeByRole(user.rol_id)} />;
}