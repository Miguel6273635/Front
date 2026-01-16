// src/services/ordenesSupervisor.js
import api from "./api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cacheGet, cacheSet } from "../offline/db";
import { cacheKeys } from "../offline/keys";
import { isOnline } from "../offline/net";

export async function fetchOrdenesSupervisor(startDate, endDate, mode = "range") {
  const correo =
    (await AsyncStorage.getItem("correo")) ||
    (await AsyncStorage.getItem("email")) ||
    (await AsyncStorage.getItem("userEmail")) ||
    "";

  const userKey = correo || "unknown";
  const key = cacheKeys.ordenesSupervisor({
    userKey,
    start: startDate,
    end: endDate,
    mode,
  });

  // 1) cache primero (para que se vea rápido / offline)
  const cached = await cacheGet(key);
  const cachedArray = Array.isArray(cached?.value) ? cached.value : null;

  // 2) si no hay red -> cache
  const online = await isOnline();
  if (!online) {
    console.log("[ORDENES OFFLINE] usando cache:", key);
    return cachedArray || [];
  }

  // 3) hay red: fetch + guardar cache
  try {
    const url = "/api/ordenes/sap/list";
    const params = { start: startDate, end: endDate, mode, user: correo };

    console.log("[ORDENES URL]", `${api.defaults?.baseURL || ""}${url}`, params);

    const res = await api.get(url, { params });

    const arr = Array.isArray(res.data) ? res.data : [];
    await cacheSet(key, arr);
    return arr;
  } catch (e) {
    console.log("[ORDENES ERROR] fallback cache:", e?.message || e);
    return cachedArray || [];
  }
}
