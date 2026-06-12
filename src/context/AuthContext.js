import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import axios from "axios"; // Necesitamos axios básico para la renovación
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { authGet, authSet, authDel } from "../offline/db";
import { isOnline } from "../offline/net";
import api from "../services/api";

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const extra = Constants.expoConfig?.extra || {};
  const AZURE_TENANT_ID = extra.AZURE_TENANT_ID;
  const AZURE_CLIENT_ID = extra.AZURE_CLIENT_ID;
  const AZURE_API_SCOPE = extra.AZURE_API_SCOPE || "";
  const AZURE_GRAPH_SCOPE = extra.AZURE_GRAPH_SCOPE || "User.Read";

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

  async function clearSessionLocal() {
    await AsyncStorage.multiRemove([
      "user",
      "token",
      "refresh_token", // Limpiamos el refresh_token
      "token_expires_at",
      "sso_code_verifier",
      "local_session_until",
    ]);
    await authDel([
      "access_token",
      "refresh_token", // Limpiamos el refresh_token
      "expires_at",
      "user_json",
      "local_session_until",
    ]);
  }

  // --- LOGIN Y SSO ---
  const loginSSO = async () => {
    const online = await isOnline();
    if (!online)
      throw new Error("Necesitas internet para iniciar sesión la primera vez.");

    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);
    
    const verifier = await Crypto.getRandomBytesAsync(32).then((b) =>
      btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
    );
    const challenge = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    ).then(d => d.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""));

    await AsyncStorage.setItem("sso_code_verifier", verifier);

    const scopes = ["openid", "profile", "email", "offline_access", AZURE_API_SCOPE, AZURE_GRAPH_SCOPE].filter(Boolean);

    const authUrl =
      `${discovery.authorizationEndpoint}?` +
      `client_id=${encodeURIComponent(AZURE_CLIENT_ID)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_mode=query` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&code_challenge_method=S256` +
      `&prompt=select_account`;

    return await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
  };

  const finishSSO = async (params) => {
    const code = params?.code;
    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);
    const codeVerifier = await AsyncStorage.getItem("sso_code_verifier");

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
    const refreshToken = tokenResult?.refreshToken; // Atrapamos la llave maestra

    // Usamos axios puro para /me para evitar loops con nuestro propio interceptor
    const meRes = await axios.get(`${api.defaults.baseURL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const u = meRes?.data?.user;

    setUser(u);
    setToken(accessToken);
    
    // Guardamos TODO
    await AsyncStorage.setItem("user", JSON.stringify(u));
    await AsyncStorage.setItem("token", accessToken);
    if (refreshToken) await AsyncStorage.setItem("refresh_token", refreshToken);
    
    await authSet("user_json", JSON.stringify(u));
    await authSet("access_token", accessToken);
    if (refreshToken) await authSet("refresh_token", refreshToken);

    router.replace(
      u.rol_id === 1 ? "/admin" : u.rol_id === 2 ? "/supervisor" : "/tecnico"
    );
    return { ok: true };
  };

  // --- CARGA DE SESIÓN ETERNA ---
  useEffect(() => {
    const loadStorage = async () => {
      try {
        const storedToken =
          (await authGet("access_token")) ||
          (await AsyncStorage.getItem("token"));
        const storedUser =
          (await authGet("user_json")) || (await AsyncStorage.getItem("user"));

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (e) {
        console.log("Error cargando sesión:", e);
      } finally {
        setLoading(false);
      }
    };
    loadStorage();
  }, []);

  const logout = async () => {
    await clearSessionLocal();
    setUser(null);
    setToken(null);
    router.replace("/(auth)/login");
  };

  // --- FUNCIÓN PÚBLICA PARA RENOVAR TOKEN (USADA POR EL INTERCEPTOR) ---
  const refreshAzureToken = async () => {
    try {
      console.log("🔄 [AUTH] Intentando renovar token expirado...");
      const refreshToken = await AsyncStorage.getItem("refresh_token");
      
      if (!refreshToken) {
        console.log("❌ [AUTH] No hay refresh_token guardado.");
        throw new Error("No refresh token");
      }

      const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);
      
      const tokenResult = await AuthSession.refreshAsync(
        {
          clientId: AZURE_CLIENT_ID,
          refreshToken: refreshToken,
        },
        discovery
      );

      if (tokenResult?.accessToken) {
        setToken(tokenResult.accessToken);
        await AsyncStorage.setItem("token", tokenResult.accessToken);
        await authSet("access_token", tokenResult.accessToken);
        
        if (tokenResult.refreshToken) {
          await AsyncStorage.setItem("refresh_token", tokenResult.refreshToken);
          await authSet("refresh_token", tokenResult.refreshToken);
        }
        
        console.log("✅ [AUTH] Token renovado exitosamente.");
        return tokenResult.accessToken;
      }
      throw new Error("Renovación fallida, no devolvió token.");
    } catch (e) {
      console.log("❌ [AUTH] Falla crítica al renovar token:", e?.message || e);
      // Opcional: Podrías llamar a logout() aquí si quieres que los expulse
      return null;
    }
  };

  // Exponemos las funciones globalmente para que api.js pueda usarlas sin hooks
  useEffect(() => {
    globalThis.__AUTH__ = { logout, refreshAzureToken };
  }, [ISSUER]);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, loginSSO, finishSSO, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);