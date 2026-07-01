// app/index.js
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "../src/context/AuthContext";
import { useOffline } from "../src/offline/OfflineProvider";

import {
  registerBackgroundSync,
  runPendingSendsOnly,
} from "../src/offline/backgroundSync";

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return "/admin";
  if (rol_id === 2) return "/supervisor";
  return "/tecnico";
}

export default function Index() {
  const { user, loading } = useAuth();
  const { dbReady, online } = useOffline();

  // Evita registrar varias veces mientras la app renderiza
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (!dbReady) return;

    /*
      Miguel Ángel Hernández Álvarez - 01/07/2026

      Se registra la tarea de segundo plano solo una vez.

      Importante:
      Esta tarea ya NO debe ejecutar precarga completa automáticamente.
      La precarga fuerte debe vivir en /tecnico/preparando.

      El BackgroundFetch debe quedar preparado para enviar pendientes:
      - outbox
      - cola SAP
      - check-in pendiente
      - PDFs / firmas / estatus pendientes
    */
    if (!registeredRef.current) {
      registeredRef.current = true;

      registerBackgroundSync(user, {
        runImmediately: false,
      })
        .then((r) => {
          console.log("[INDEX] Background sync registrado:", r);
        })
        .catch((e) => {
          console.log(
            "[INDEX] Error registrando background sync:",
            e?.message || e,
          );
        });
    }
  }, [user, dbReady]);

  useEffect(() => {
    if (!user) return;
    if (!dbReady) return;

    /*
      Miguel Ángel Hernández Álvarez - 01/07/2026

      Corrección de consumo:
      Antes aquí se llamaba runBackgroundSyncNow(), pero esa función
      ejecutaba precarga completa:
      - órdenes
      - detalles
      - operaciones
      - componentes
      - consumibles

      Eso provocaba que al abrir la app se dispararan muchas peticiones
      después de la pantalla de precarga.

      Ahora solo se mandan pendientes guardados.
      La app debe trabajar con la información ya precargada.
    */
    if (online) {
      runPendingSendsOnly({
        source: "app_index_send_only",
      })
        .then((r) => {
          console.log("[INDEX] Envíos pendientes revisados:", r);
        })
        .catch((e) => {
          console.log(
            "[INDEX] Error revisando envíos pendientes:",
            e?.message || e,
          );
        });
    } else {
      console.log("[INDEX] Sin internet. Se cargará desde offline.");
    }
  }, [user, dbReady, online]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return <Redirect href={pickHomeByRole(user.rol_id)} />;
}