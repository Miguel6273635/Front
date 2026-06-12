// app/index.js
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage"; // 🔴 NUEVO: Importación para guardar la hora

import { useAuth } from "../src/context/AuthContext";
import { useOffline } from "../src/offline/OfflineProvider";
import { bootstrapPrefetchOrdenesSupervisor } from "../src/offline/bootstrapSync";

// Importamos la función de precarga del técnico
import { prefetchOrdenesTecnico } from "../src/offline/prefetchOrdenesTecnico"; 

// ==========================================
// DEFINICIÓN DE TAREA EN SEGUNDO PLANO
// ==========================================
const BACKGROUND_SYNC_TASK = "BACKGROUND_SYNC_TASK";

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    // ⚡ LOG LLAMATIVO PARA VALIDACIÓN EN CONSOLA
    console.log("⚡ [BACKGROUND FETCH] ¡EL SISTEMA OPERATIVO ME DESPERTÓ! Hora:", new Date().toLocaleTimeString());

    // Disparamos las precargas silenciosas
    await prefetchOrdenesTecnico().catch(() => {});
    await bootstrapPrefetchOrdenesSupervisor().catch(() => {});

    // 🔴 GUARDAMOS LA HORA EXACTA DEL ÉXITO EN SEGUNDO PLANO
    await AsyncStorage.setItem('ultima_sincronizacion', new Date().toLocaleString());

    console.log("⚡ [BACKGROUND FETCH] Sincronización finalizada con éxito.");
    
    // Indicamos al OS que hubo datos nuevos
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.log("[BACKGROUND FETCH] Error en la tarea de fondo:", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Función auxiliar para registrar la tarea en el dispositivo
async function registerBackgroundSync() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: 60 * 15, // Intentar cada 15 minutos (el OS decide el momento exacto)
        stopOnTerminate: false,   // Seguir intentando si la app se cierra (Android)
        startOnBoot: true,        // Reiniciar tarea al encender el celular (Android)
      });
      console.log("[BACKGROUND FETCH] Tarea registrada correctamente en el dispositivo.");
    }
  } catch (err) {
    console.log("[BACKGROUND FETCH] Error al registrar la tarea:", err);
  }
}
// ==========================================

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
          // Descarga automática según el rol en cuanto la app se abre
          if (user.rol_id === 2) {
            console.log("[SYNC FOREGROUND] Actualizando órdenes de supervisor...");
            await bootstrapPrefetchOrdenesSupervisor();
          } else if (user.rol_id === 3) {
            console.log("[SYNC FOREGROUND] Actualizando órdenes del técnico...");
            await prefetchOrdenesTecnico(); // Dispara la petición a SAP en modo oculto
          }
          
          // Registramos la tarea de fondo una vez que sabemos que hay conexión y sesión válida
          await registerBackgroundSync();
        }
      } catch (e) {
        console.log("[SYNC ERROR]", e?.message || e);
      }
    };

    // Lanzamos la sincronización sin bloquear al usuario
    inicializarDatos();
  }, [user, dbReady, online]); 

  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator size="large" /></View>;
  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href={pickHomeByRole(user.rol_id)} />;
}