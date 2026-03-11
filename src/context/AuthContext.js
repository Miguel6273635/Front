// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { router } from "expo-router";
import api from "../services/api";

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";

import { authGet, authSet, authDel } from "../offline/db";
import { isOnline } from "../offline/net";

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return "/admin";
  if (rol_id === 2) return "/supervisor";
  return "/tecnico";
}

/* =========================
   PKCE helpers
   ========================= */
function base64UrlEncodeFromBytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function makeCodeVerifier() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return base64UrlEncodeFromBytes(bytes);
}

async function makeCodeChallenge(verifier) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isExpired(expiresAtMs, skewSeconds = 60) {
  if (!expiresAtMs) return true;
  return Date.now() >= Number(expiresAtMs) - skewSeconds * 1000;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null); // access_token
  const [loading, setLoading] = useState(true);

  const extra = Constants.expoConfig?.extra || {};
  const AZURE_TENANT_ID = extra.AZURE_TENANT_ID;
  const AZURE_CLIENT_ID = extra.AZURE_CLIENT_ID;
  const AZURE_API_SCOPE = extra.AZURE_API_SCOPE || "";

  const ISSUER = useMemo(() => {
    if (!AZURE_TENANT_ID) return "";
    return `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`;
  }, [AZURE_TENANT_ID]);

  const REDIRECT_URI = useMemo(() => {
    return AuthSession.makeRedirectUri({
      scheme: "mitsuapp",
      path: "auth",
      useProxy: false,
    });
  }, []);

  // ====== refresco automático (simple) ======
  const [refreshTimer, setRefreshTimer] = useState(null);

  const clearRefreshTimer = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      setRefreshTimer(null);
    }
  };

  const scheduleRefresh = async () => {
    clearRefreshTimer();

    const expAt =
      (await authGet("expires_at")) ||
      (await AsyncStorage.getItem("token_expires_at"));

    if (!expAt) return;

    // refrescar 2 minutos antes de vencer (mínimo 5s)
    const msUntil = Math.max(5000, Number(expAt) - Date.now() - 120000);

    const t = setTimeout(async () => {
      try {
        const online = await isOnline();
        if (!online) return; // sin red no se refresca; se hará cuando haya red o al hacer request

        const r = await refreshAccessToken();
        if (r?.ok) {
          await scheduleRefresh(); // reprograma con el nuevo expiry
        }
      } catch {}
    }, msUntil);

    setRefreshTimer(t);
  };

  // carga sesión desde SQLite primero (y de AsyncStorage como fallback)
  useEffect(() => {
    const loadStorage = async () => {
      try {
        const storedToken =
          (await authGet("access_token")) || (await AsyncStorage.getItem("token"));
        const storedExp =
          (await authGet("expires_at")) || (await AsyncStorage.getItem("token_expires_at"));
        const storedUser =
          (await authGet("user_json")) || (await AsyncStorage.getItem("user"));

        if (storedToken && storedExp && isExpired(storedExp, 60)) {
          await clearSessionLocal();
          setUser(null);
          setToken(null);
          return;
        }

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          await scheduleRefresh(); // programa refresco si ya hay sesión
        } else {
          setToken(null);
          setUser(null);
        }
      } catch {
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function clearSessionLocal() {
    clearRefreshTimer();
    await AsyncStorage.multiRemove(["user", "token", "token_expires_at", "sso_code_verifier"]);
    await authDel(["access_token", "refresh_token", "expires_at", "user_json"]);
  }

  /* =========================
     SSO INICIAR
     ========================= */
  const loginSSO = async () => {
    if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
      throw new Error("Faltan AZURE_TENANT_ID o AZURE_CLIENT_ID en expo.extra");
    }
    if (!ISSUER) throw new Error("ISSUER vacío. Revisa AZURE_TENANT_ID");

    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

    const scopes = ["openid", "profile", "email"];
    if (AZURE_API_SCOPE) scopes.push(AZURE_API_SCOPE);

    const codeVerifier = await makeCodeVerifier();
    const codeChallenge = await makeCodeChallenge(codeVerifier);
    await AsyncStorage.setItem("sso_code_verifier", codeVerifier);

    const authUrl =
      `${discovery.authorizationEndpoint}` +
      `?client_id=${encodeURIComponent(AZURE_CLIENT_ID)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_mode=query` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}` +
      `&code_challenge_method=S256` +
      `&prompt=select_account`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

    //  Si el usuario canceló/cerró el browser, limpiamos PKCE y regresamos "cancelled"
    if (result.type === "dismiss" || result.type === "cancel") {
      await AsyncStorage.removeItem("sso_code_verifier");
      return { ok: false, cancelled: true, type: result.type };
    }

    //  Cualquier otra cosa diferente a success, lo tratamos como fallo de sesión
    if (result.type !== "success") {
      return { ok: false, cancelled: false, type: result.type };
    }

    // success: el callback /auth se encargará de finishSSO
    return { ok: true };
  };

  /* =========================
     REFRESH TOKEN (si existe)
     ========================= */
  const refreshAccessToken = async () => {
    const online = await isOnline();
    if (!online) return { ok: false, reason: "offline" };

    const refreshToken = await authGet("refresh_token");
    if (!refreshToken) return { ok: false, reason: "no_refresh_token" };

    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

    try {
      const tokenResult = await AuthSession.refreshAsync(
        {
          clientId: AZURE_CLIENT_ID,
          refreshToken,
          scopes: ["openid", "profile", "email"].concat(AZURE_API_SCOPE ? [AZURE_API_SCOPE] : []),
        },
        discovery
      );

      const accessToken = tokenResult?.accessToken;
      const expiresIn = tokenResult?.expiresIn;

      if (!accessToken) return { ok: false, reason: "no_access_token_in_refresh" };

      const expAt =
        Date.now() + (typeof expiresIn === "number" ? expiresIn : 50 * 60) * 1000;

      setToken(accessToken);
      await AsyncStorage.setItem("token", accessToken);
      await AsyncStorage.setItem("token_expires_at", String(expAt));

      await authSet("access_token", accessToken);
      await authSet("expires_at", String(expAt));

      if (tokenResult?.refreshToken) {
        await authSet("refresh_token", tokenResult.refreshToken);
      }

      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e?.message || "refresh_failed" };
    }
  };

  /* =========================
     SSO FINALIZAR (callback /auth)
     ========================= */
  const finishSSO = async (params) => {
    const code = params?.code;
    const error = params?.error;
    const errorDescription = params?.error_description;

    // CASO CLAVE: el usuario canceló en Microsoft y Azure devuelve access_denied
    if (error === "access_denied" && !code) {
      await AsyncStorage.removeItem("sso_code_verifier");
      router.replace("/(auth)/login");
      return { ok: false, cancelled: true };
    }

    // Otros errores reales
    if (error) {
      throw new Error(
        `SSO error: ${String(error)}${errorDescription ? ` - ${String(errorDescription)}` : ""}`
      );
    }

    if (!code) throw new Error('No llegó "code" en callback');

    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

    const codeVerifier = (await AsyncStorage.getItem("sso_code_verifier")) || "";
    if (!codeVerifier) throw new Error("Falta sso_code_verifier (vuelve a iniciar loginSSO)");

    const tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId: AZURE_CLIENT_ID,
        code,
        redirectUri: REDIRECT_URI,
        extraParams: { code_verifier: codeVerifier },
      },
      discovery
    );

    const accessToken = tokenResult?.accessToken;
    const expiresIn = tokenResult?.expiresIn;
    const refreshToken = tokenResult?.refreshToken;

    if (!accessToken) throw new Error("No llegó accessToken. Revisa scopes/consent de Azure.");

    const expAt =
      Date.now() + (typeof expiresIn === "number" ? expiresIn : 50 * 60) * 1000;

    // Guarda en AsyncStorage (por compat)
    await AsyncStorage.setItem("token", accessToken);
    await AsyncStorage.setItem("token_expires_at", String(expAt));

    // Guarda en SQLite
    await authSet("access_token", accessToken);
    await authSet("expires_at", String(expAt));
    if (refreshToken) await authSet("refresh_token", refreshToken);

    // Validar usuario/rol en tu API
    let meRes;
    try {
      meRes = await api.get("/api/auth/me");
    } catch (e) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || e?.response?.data || e?.message;
      throw new Error(
        `No pude validar en /api/auth/me (${status || "sin status"}): ${String(detail)}`
      );
    }

    const u = meRes?.data?.user;
    if (!u) throw new Error("Respuesta inválida de /api/auth/me (no viene user)");

    setUser(u);
    setToken(accessToken);

    await AsyncStorage.setItem("user", JSON.stringify(u));
    await authSet("user_json", JSON.stringify(u));

    await AsyncStorage.removeItem("sso_code_verifier");

    await scheduleRefresh(); //  programa refresco desde ya

    router.replace(pickHomeByRole(u.rol_id));
    return { ok: true };
  };

  /* =========================
     Ensure token
     ========================= */
  const ensureValidToken = async () => {
    const expAt =
      (await authGet("expires_at")) || (await AsyncStorage.getItem("token_expires_at"));
    const tok =
      (await authGet("access_token")) || (await AsyncStorage.getItem("token"));

    if (!tok || !expAt) return false;

    if (!isExpired(expAt, 60)) return true;

    const r = await refreshAccessToken();
    if (r?.ok) {
      await scheduleRefresh();
      return true;
    }
    return false;
  };

  /* =========================
     LOGOUT
     ========================= */
  const logout = async () => {
    await clearSessionLocal();
    setUser(null);
    setToken(null);

    try {
      await WebBrowser.clearBrowserSessionAsync();
    } catch {}

    router.replace("/(auth)/login");
  };

  //  Cuando la app regresa a foreground: si ya está por vencer y hay red, intenta refrescar
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        if (!user) return;
        const online = await isOnline();
        if (!online) return;
        await ensureValidToken();
      } catch {}
    });
    return () => sub?.remove?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Exponer auth a api.js SIN archivo extra (simple)
  useEffect(() => {
    globalThis.__AUTH__ = {
      ensureValidToken,
      logout,
    };
  }, [ensureValidToken, logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        loginSSO,
        finishSSO,
        logout,
        ensureValidToken,
        refreshAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
