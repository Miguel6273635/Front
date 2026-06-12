import axios from "axios";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const extra = Constants.expoConfig?.extra || {};

export const API_URL =
  extra.API_BASE_URL_PROD ||
  "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";

const api = axios.create({
  baseURL: API_URL,
  timeout: 45000,
});

// Pila para agrupar peticiones mientras se renueva el token
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const method = (config.method || "GET").toUpperCase();
    console.log("[API]", method, `${config.baseURL}${config.url}`);

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;
    const status = err?.response?.status;

    // Si recibimos 401 y no es una petición que ya intentamos reintentar
    if (status === 401 && !originalRequest._retry) {
      console.log("🚨 [API INTERCEPTOR] Error 401 detectado. Token posiblemente expirado.");
      
      if (isRefreshing) {
        // Si ya hay otra petición renovando el token, formamos esta en la cola
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Llamamos a la función global que inyectamos desde AuthContext
        if (globalThis.__AUTH__ && typeof globalThis.__AUTH__.refreshAzureToken === "function") {
          const newToken = await globalThis.__AUTH__.refreshAzureToken();
          
          if (newToken) {
            console.log("🌟 [API INTERCEPTOR] Token renovado. Reintentando petición...");
            processQueue(null, newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          } else {
             // Si la renovación falló de plano
             processQueue(new Error("Refresh token failed"));
             return Promise.reject(err);
          }
        } else {
           console.log("⚠️ [API INTERCEPTOR] La función de renovación no está lista.");
           return Promise.reject(err);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Para cualquier otro error (500, timeouts, etc.)
    console.log("[API ERROR]", {
      message: err?.message,
      url: originalRequest?.url,
      status,
    });

    return Promise.reject(err);
  },
);

export default api;