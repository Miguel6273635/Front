// src/services/api.js
import axios from "axios";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isOnline } from "../offline/net";
import {
  ensureValidAuthToken,
  getStoredAccessToken,
} from "./tokenManager";

const extra = Constants.expoConfig?.extra || {};

// UNA SOLA BASE (BTP QAS)
export const API_URL =
  extra.API_BASE_URL_PROD ||
  "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";

const api = axios.create({
  baseURL: API_URL,
  timeout: 45000,
});

// ✅ Request interceptor
api.interceptors.request.use(
  async (config) => {
    /*
      IMPORTANTE:
      Antes cada petición solo leía AsyncStorage.getItem("token").
      En background puede estar vencido o no estar cargado en memoria.
      Ahora validamos/renovamos el token sin depender de AuthContext.
    */
    let token = await getStoredAccessToken();

    try {
      const ensured = await ensureValidAuthToken({
        source: "api_request",
      });

      if (ensured?.ok && ensured?.accessToken) {
        token = ensured.accessToken;
      }
    } catch (e) {
      console.log("[API TOKEN CHECK ERROR]", e?.message || e);
    }

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    const method = (config.method || "GET").toUpperCase();
    console.log("[API]", method, `${config.baseURL}${config.url}`);

    return config;
  },
  (error) => Promise.reject(error),
);

// ✅ Response error log + manejo seguro de 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status;
    const original = err?.config;

    console.log("[API ERROR]", {
      message: err?.message,
      url: err?.config?.url,
      baseURL: err?.config?.baseURL,
      status,
      data: err?.response?.data,
    });

    const online = await isOnline();

    /*
      Si no hay internet, NO cerramos sesión.
      Dejamos que la pantalla o servicio maneje el error offline.
    */
    if (!online) {
      console.log("[API ERROR] Sin internet. No se cierra sesión.");
      return Promise.reject(err);
    }

    /*
      Si hay internet y el backend responde 401:
      intentamos refrescar token una sola vez.
    */
    if (status === 401 && original && !original._retry) {
      original._retry = true;

      try {
        /*
          Primero usamos tokenManager porque también funciona en background,
          aunque AuthContext no esté montado.
        */
        let ensured = await ensureValidAuthToken({
          source: "api_401_retry",
          forceRefresh: true,
        });

        /*
          Fallback: si AuthContext está montado, también puede ayudar.
        */
        if (!ensured?.ok) {
          const auth = globalThis.__AUTH__;
          const ok = await auth?.ensureValidToken?.();

          if (ok) {
            ensured = {
              ok: true,
              accessToken: await getStoredAccessToken(),
            };
          }
        }

        if (ensured?.ok) {
          const newToken = ensured.accessToken || (await getStoredAccessToken());

          if (newToken) {
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${newToken}`;
          }

          console.log("[API 401] Token renovado. Reintentando petición.");
          return api(original);
        }

        /*
          Solo cerramos sesión si:
          - hay internet
          - hubo 401 real del backend
          - no se pudo renovar token
          - y AuthContext existe
        */
        const auth = globalThis.__AUTH__;
        await auth?.logout?.();
      } catch (e) {
        console.log("[API 401 HANDLER ERROR]", e?.message || e);
      }
    }

    return Promise.reject(err);
  },
);

export default api;
