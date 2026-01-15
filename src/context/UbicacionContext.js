// src/context/UbicacionContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { Alert } from "react-native";
import { useAuth } from "./AuthContext";
import api from "../services/api";

const UbicacionContext = createContext();

const msToSapDate = (ms) => `/Date(${ms})/`;
const SEND_EVERY_MS = 30000;

export const UbicacionProvider = ({ children }) => {
  const { user } = useAuth();

  const [permisosOtorgados, setPermisosOtorgados] = useState(false);
  const [servicesEnabled, setServicesEnabled] = useState(true);

  const watchSubRef = useRef(null);
  const sendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const lastCoordsRef = useRef({ lat: null, lon: null });

  // 1) permisos + servicios
  useEffect(() => {
    (async () => {
      try {
        const enabled = await Location.hasServicesEnabledAsync();
        setServicesEnabled(enabled);
        console.log("[GEO] servicesEnabled:", enabled);

        if (!enabled) {
          Alert.alert(
            "Ubicación desactivada",
            "Activa el GPS/Ubicación del dispositivo para enviar tu ubicación."
          );
          return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        console.log("[GEO] permission status:", status);

        if (status !== "granted") {
          Alert.alert(
            "Permiso requerido",
            "Se necesita acceso a la ubicación para monitoreo en tiempo real."
          );
          return;
        }

        setPermisosOtorgados(true);
      } catch (e) {
        console.log("[GEO] Error permisos/servicios:", e?.message || e);
      }
    })();
  }, []);

  const postUbicacion = async (lat, lon) => {
    if (sendingRef.current) return;

    const now = Date.now();
    // throttle: manda máximo 1 cada 30s
    if (now - lastSentAtRef.current < SEND_EVERY_MS) return;

    try {
      sendingRef.current = true;

      const correo =
        user?.correo || user?.email || user?.preferred_username || "";

      if (!correo) {
        console.log("[GEO] No hay correo en user. user=", user);
        return;
      }

      // ✅ SI tú quieres Id fijo "1", lo dejamos fijo (como pediste)
      // (aunque yo usualmente lo haría único)
      const payload = {
        Id: "1",
        Usuario: String(correo),
        Latitud: String(lat),
        Longitud: String(lon),
        Timestamp: msToSapDate(Date.now()),
        Orden: "",
      };

      console.log("[GEO] POST => /api/odata/ZCS_GEOLOZACION_SRV/GeoLocalizacionSet");
      console.log("[GEO] payload:", payload);

      const res = await api.post(
        "/api/odata/ZCS_GEOLOZACION_SRV/GeoLocalizacionSet",
        payload
      );

      lastSentAtRef.current = Date.now();

      console.log("[GEO] OK status:", res?.status);
      // a veces SAP regresa el objeto creado en res.data.d o algo similar
      console.log("[GEO] OK data:", res?.data);
    } catch (err) {
      console.log("[GEO] ERROR message:", err?.message || err);
      console.log("[GEO] ERROR status:", err?.response?.status);
      console.log("[GEO] ERROR data:", err?.response?.data);
    } finally {
      sendingRef.current = false;
    }
  };

  // 2) empezar “watch” cuando ya hay permisos + user
  useEffect(() => {
    const start = async () => {
      // limpia watcher previo
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }

      if (!permisosOtorgados || !servicesEnabled || !user) {
        console.log("[GEO] No inicia watch. permisos:", permisosOtorgados, "services:", servicesEnabled, "user:", !!user);
        return;
      }

      console.log("[GEO] Iniciando watchPositionAsync...");

      // ✅ watchPositionAsync: más confiable que getCurrentPositionAsync con interval
      watchSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,     // cada 5s (pero THROTTLE manda cada 30s)
          distanceInterval: 10,   // o cada 10m, lo que ocurra primero
          mayShowUserSettingsDialog: true,
        },
        (loc) => {
          const lat = loc?.coords?.latitude;
          const lon = loc?.coords?.longitude;

          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

          // evita spam si coords casi iguales
          const prev = lastCoordsRef.current;
          const same =
            prev.lat != null &&
            prev.lon != null &&
            Math.abs(prev.lat - lat) < 0.00001 &&
            Math.abs(prev.lon - lon) < 0.00001;

          lastCoordsRef.current = { lat, lon };

          console.log("[GEO] coords:", lat, lon, same ? "(same-ish)" : "");

          // manda (con throttle interno a 30s)
          postUbicacion(lat, lon);
        }
      );
    };

    start();

    return () => {
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }
    };
  }, [permisosOtorgados, servicesEnabled, user]);

  // Útil para pruebas manuales (si quieres un botón “Enviar ahora”)
  const enviarUbicacionManual = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = loc?.coords?.latitude;
      const lon = loc?.coords?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        console.log("[GEO] Manual: coords inválidas", { lat, lon });
        return;
      }
      await postUbicacion(lat, lon);
    } catch (e) {
      console.log("[GEO] Manual: error", e?.message || e);
    }
  };

  return (
    <UbicacionContext.Provider
      value={{
        permisosOtorgados,
        servicesEnabled,
        enviarUbicacionManual,
      }}
    >
      {children}
    </UbicacionContext.Provider>
  );
};

export const useUbicacion = () => useContext(UbicacionContext);
