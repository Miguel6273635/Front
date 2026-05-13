// src/services/api.js
import axios from "axios";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
    const token = await AsyncStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;

    const method = (config.method || "GET").toUpperCase();
    console.log("[API]", method, `${config.baseURL}${config.url}`);

    return config;
  },
  (error) => Promise.reject(error),
);

// ✅ Response error log + manejo 401 (mínimo y seguro)
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

    // ✅ Si el token venció: intenta refrescar 1 vez y reintenta la petición
    if (status === 401 && original && !original._retry) {
      original._retry = true;

      try {
        const auth = globalThis.__AUTH__;
        const ok = await auth?.ensureValidToken?.();

        if (ok) {
          const newToken = await AsyncStorage.getItem("token");
          if (newToken) original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }

        // si no se pudo refrescar, cerramos sesión de forma limpia
        await auth?.logout?.();
      } catch {}
    }

    return Promise.reject(err);
  },
);

export default api;
