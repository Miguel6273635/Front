// src/services/tokenManager.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";

import { authGet, authSet } from "../offline/db";
import { isOnline } from "../offline/net";

/*
  Archivo: src/services/tokenManager.js

  Objetivo:
  - Renovar el token sin depender de AuthContext ni de pantallas montadas.
  - Permitir que api.js y backgroundSync.js puedan validar token en segundo plano.
  - Evitar errores 401 / "Token ausente" durante precarga automática.
*/

const LOCAL_SESSION_DAYS = 15;

const extra = Constants.expoConfig?.extra || {};

const AZURE_TENANT_ID = extra.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = extra.AZURE_CLIENT_ID;
const AZURE_API_SCOPE = extra.AZURE_API_SCOPE || "";

const ISSUER = AZURE_TENANT_ID
  ? `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`
  : "";

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function buildApiScopes() {
  return uniq([
    "openid",
    "profile",
    "email",
    "offline_access",
    AZURE_API_SCOPE,
  ]);
}

function isExpired(expiresAtMs, skewSeconds = 90) {
  if (!expiresAtMs) return true;
  return Date.now() >= Number(expiresAtMs) - skewSeconds * 1000;
}

function getLocalSessionUntilMs() {
  return Date.now() + LOCAL_SESSION_DAYS * 24 * 60 * 60 * 1000;
}

function isLocalSessionValid(localSessionUntil) {
  if (!localSessionUntil) return false;

  const value = Number(localSessionUntil);

  if (Number.isNaN(value)) return false;

  return Date.now() <= value;
}

export async function getStoredAccessToken() {
  return (
    (await authGet("access_token")) ||
    (await AsyncStorage.getItem("token")) ||
    null
  );
}

export async function getStoredExpiresAt() {
  return (
    (await authGet("expires_at")) ||
    (await AsyncStorage.getItem("token_expires_at")) ||
    null
  );
}

export async function getStoredRefreshToken() {
  return (await authGet("refresh_token")) || null;
}

export async function getStoredUserJson() {
  return (
    (await authGet("user_json")) ||
    (await AsyncStorage.getItem("user")) ||
    null
  );
}

async function saveAccessToken(accessToken, expiresAt, refreshToken = null) {
  if (!accessToken) return false;

  await AsyncStorage.setItem("token", accessToken);
  await AsyncStorage.setItem("token_expires_at", String(expiresAt));

  await authSet("access_token", accessToken);
  await authSet("expires_at", String(expiresAt));

  if (refreshToken) {
    await authSet("refresh_token", refreshToken);
  }

  const localSessionUntil = getLocalSessionUntilMs();

  await AsyncStorage.setItem("local_session_until", String(localSessionUntil));
  await authSet("local_session_until", String(localSessionUntil));

  return true;
}

export async function refreshAccessTokenStandalone() {
  const online = await isOnline();

  if (!online) {
    return {
      ok: false,
      reason: "offline",
    };
  }

  if (!ISSUER || !AZURE_CLIENT_ID) {
    return {
      ok: false,
      reason: "missing_azure_config",
    };
  }

  const refreshToken = await getStoredRefreshToken();

  if (!refreshToken) {
    return {
      ok: false,
      reason: "no_refresh_token",
    };
  }

  try {
    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

    const tokenResult = await AuthSession.refreshAsync(
      {
        clientId: AZURE_CLIENT_ID,
        refreshToken,
        scopes: buildApiScopes(),
      },
      discovery
    );

    const accessToken = tokenResult?.accessToken;
    const expiresIn = tokenResult?.expiresIn;

    if (!accessToken) {
      return {
        ok: false,
        reason: "no_access_token_in_refresh",
      };
    }

    const expiresAt =
      Date.now() +
      (typeof expiresIn === "number" ? expiresIn : 50 * 60) * 1000;

    await saveAccessToken(
      accessToken,
      expiresAt,
      tokenResult?.refreshToken || null
    );

    console.log("[TOKEN MANAGER] Token renovado correctamente");

    return {
      ok: true,
      accessToken,
      expiresAt,
      refreshed: true,
    };
  } catch (e) {
    console.log("[TOKEN MANAGER] Error renovando token:", e?.message || e);

    return {
      ok: false,
      reason: e?.message || "refresh_failed",
    };
  }
}

export async function ensureValidAuthToken(options = {}) {
  const { forceRefresh = false, source = "unknown" } = options;

  const online = await isOnline();
  const storedUser = await getStoredUserJson();

  if (!storedUser) {
    return {
      ok: false,
      reason: "no_user",
      source,
    };
  }

  if (!online) {
    const localSessionUntil =
      (await authGet("local_session_until")) ||
      (await AsyncStorage.getItem("local_session_until"));

    if (isLocalSessionValid(localSessionUntil)) {
      return {
        ok: false,
        reason: "offline_local_session_valid",
        source,
      };
    }

    return {
      ok: false,
      reason: "offline_without_local_session",
      source,
    };
  }

  const accessToken = await getStoredAccessToken();
  const expiresAt = await getStoredExpiresAt();

  if (!forceRefresh && accessToken && expiresAt && !isExpired(expiresAt, 90)) {
    return {
      ok: true,
      accessToken,
      expiresAt: Number(expiresAt),
      refreshed: false,
      source,
    };
  }

  const refreshed = await refreshAccessTokenStandalone();

  return {
    ...refreshed,
    source,
  };
}

export async function getAuthorizationHeader(options = {}) {
  const ensured = await ensureValidAuthToken(options);

  if (!ensured?.ok) {
    return null;
  }

  const token = ensured.accessToken || (await getStoredAccessToken());

  if (!token) return null;

  return `Bearer ${token}`;
}
