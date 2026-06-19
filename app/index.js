// app/index.js
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "../src/context/AuthContext";
import { useOffline } from "../src/offline/OfflineProvider";

import {
  registerBackgroundSync,
  runBackgroundSyncNow,
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

    /**
     * Registramos la tarea de segundo plano solo una vez.
     * No depende de que online sea true, porque la tarea puede quedar lista
     * y después ejecutarse cuando el sistema operativo lo permita.
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
          console.log("[INDEX] Error registrando background sync:", e?.message || e);
        });
    }
  }, [user, dbReady]);

  useEffect(() => {
    if (!user) return;
    if (!dbReady) return;

    /**
     * Cuando la app abre y hay internet, hacemos una sincronización en segundo plano.
     * No usamos await directo en pantalla para no trabar la navegación.
     */
    if (online) {
      runBackgroundSyncNow({
        source: "app_index",
      })
        .then((r) => {
          console.log("[INDEX] Sync inicial finalizada:", r);
        })
        .catch((e) => {
          console.log("[INDEX] Sync inicial error:", e?.message || e);
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