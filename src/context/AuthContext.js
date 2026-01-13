// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import api from '../services/api';

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return '/admin';
  if (rol_id === 2) return '/supervisor';
  return '/tecnico';
}

/* =========================
   PKCE helpers
   ========================= */
function base64UrlEncodeFromBytes(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// ✅ helper mínimo: expiración por timestamp guardado
function isExpired(expiresAtMs, skewSeconds = 60) {
  if (!expiresAtMs) return true;
  return Date.now() >= (Number(expiresAtMs) - skewSeconds * 1000);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null); // access_token Azure
  const [loading, setLoading] = useState(true);

  const extra = Constants.expoConfig?.extra || {};
  const AZURE_TENANT_ID = extra.AZURE_TENANT_ID;
  const AZURE_CLIENT_ID = extra.AZURE_CLIENT_ID;
  const AZURE_API_SCOPE = extra.AZURE_API_SCOPE || '';

  const ISSUER = useMemo(() => {
    if (!AZURE_TENANT_ID) return '';
    return `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`;
  }, [AZURE_TENANT_ID]);

  /* =========================
     Load storage
     ========================= */
  useEffect(() => {
    const loadStorage = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        const storedToken = await AsyncStorage.getItem('token');
        const storedExp = await AsyncStorage.getItem('token_expires_at');

        // ✅ si existe pero ya expiró → limpia
        if (storedToken && storedExp && isExpired(storedExp, 60)) {
          await AsyncStorage.removeItem('user');
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('token_expires_at');
          await AsyncStorage.removeItem('sso_code_verifier');
          setUser(null);
          setToken(null);
          return;
        }

        if (storedUser && storedToken) {
          setUser(JSON.parse(storedUser));
          setToken(storedToken);
        } else {
          setUser(null);
          setToken(null);
        }
      } finally {
        setLoading(false);
      }
    };
    loadStorage();
  }, []);

  /* =========================
     SSO INICIAR
     ========================= */
  const loginSSO = async () => {
    if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
      throw new Error('Faltan AZURE_TENANT_ID o AZURE_CLIENT_ID en app.json -> expo.extra');
    }
    if (!ISSUER) throw new Error('ISSUER vacío. Revisa AZURE_TENANT_ID');

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'mitsuapp',
      path: 'auth',
      useProxy: false,
    });

    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

    // scopes mínimos + scope API
    const scopes = ['openid', 'profile', 'email'];
    if (AZURE_API_SCOPE) scopes.push(AZURE_API_SCOPE);

    const codeVerifier = await makeCodeVerifier();
    const codeChallenge = await makeCodeChallenge(codeVerifier);
    await AsyncStorage.setItem('sso_code_verifier', codeVerifier);

    const authUrl =
      `${discovery.authorizationEndpoint}` +
      `?client_id=${encodeURIComponent(AZURE_CLIENT_ID)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_mode=query` +
      `&scope=${encodeURIComponent(scopes.join(' '))}` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}` +
      `&code_challenge_method=S256` +
      `&prompt=select_account`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    if (result.type !== 'success') {
      throw new Error(`SSO cancelado/falló: ${result.type}`);
    }

    // ✅ El callback /auth (expo-router) llamará finishSSO con los params
    return true;
  };

  /* =========================
     SSO FINALIZAR (callback /auth)
     ========================= */
  const finishSSO = async (params) => {
    const code = params?.code;
    const error = params?.error;

    if (error) throw new Error(`SSO error: ${String(error)}`);
    if (!code) throw new Error('No llegó "code" en callback');

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'mitsuapp',
      path: 'auth',
      useProxy: false,
    });

    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

    const codeVerifier = (await AsyncStorage.getItem('sso_code_verifier')) || '';
    if (!codeVerifier) throw new Error('Falta sso_code_verifier (vuelve a iniciar loginSSO)');

    const tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId: AZURE_CLIENT_ID,
        code,
        redirectUri,
        extraParams: { code_verifier: codeVerifier },
      },
      discovery
    );

    const accessToken = tokenResult?.accessToken;
    const expiresIn = tokenResult?.expiresIn; // seconds (normalmente viene)

    if (!accessToken) throw new Error('No llegó accessToken. Revisa scopes/consent de Azure.');

    // ✅ Guarda token ANTES para que el interceptor lo use
    await AsyncStorage.setItem('token', accessToken);

    // ✅ Guarda expiración si viene (cambio mínimo para evitar "jwt expired")
    if (typeof expiresIn === 'number' && expiresIn > 0) {
      const expAt = Date.now() + expiresIn * 1000;
      await AsyncStorage.setItem('token_expires_at', String(expAt));
    } else {
      // si no viene, igual guardamos algo “corto” para forzar re-login después
      const expAt = Date.now() + 50 * 60 * 1000; // 50 min
      await AsyncStorage.setItem('token_expires_at', String(expAt));
    }

    // ✅ Pide user/rol a tu API (BTP)
    let meRes;
    try {
      meRes = await api.get('/api/auth/me');
    } catch (e) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || e?.response?.data || e?.message;
      throw new Error(`No pude validar en /api/auth/me (${status || 'sin status'}): ${String(detail)}`);
    }

    const u = meRes?.data?.user;
    if (!u) throw new Error('Respuesta inválida de /api/auth/me (no viene user)');

    setUser(u);
    setToken(accessToken);

    await AsyncStorage.setItem('user', JSON.stringify(u));
    await AsyncStorage.removeItem('sso_code_verifier');

    router.replace(pickHomeByRole(u.rol_id));
  };

  /* =========================
     ✅ Validación mínima antes de consumir API
     ========================= */
  const ensureValidToken = async () => {
    const expAt = await AsyncStorage.getItem('token_expires_at');
    const tok = await AsyncStorage.getItem('token');

    if (!tok || !expAt || isExpired(expAt, 60)) {
      // token expirado -> cerrar sesión suave y mandar a login
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('token_expires_at');
      setUser(null);
      setToken(null);
      router.replace('/(auth)/login');
      return false;
    }
    return true;
  };

  /* =========================
     LOGOUT
     ========================= */
  const logout = async () => {
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('token_expires_at');
    await AsyncStorage.removeItem('sso_code_verifier');

    setUser(null);
    setToken(null);

    try {
      await WebBrowser.clearBrowserSessionAsync();
    } catch (e) {
      console.log('clearBrowserSessionAsync error:', e?.message || e);
    }

    router.replace('/(auth)/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        loginSSO,
        finishSSO,
        logout,
        ensureValidToken, // ✅ para usarlo antes de pegarle a SAP
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
