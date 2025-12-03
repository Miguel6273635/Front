// src/context/AuthContext.js
import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);        // { ... , permisos: [] }
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStorage = async () => {
      const storedUser = await AsyncStorage.getItem('user');
      const storedToken = await AsyncStorage.getItem('token');

      if (storedUser && storedToken) {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        setToken(storedToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      }

      setLoading(false);
    };

    loadStorage();
  }, []);

  const login = async (correo, password) => {
    const res = await api.post('/auth/login', { correo, password });
    setUser(res.data.user);                        // ⬅️ incluye permisos
    setToken(res.data.token);
    await AsyncStorage.setItem('user', JSON.stringify(res.data.user));
    await AsyncStorage.setItem('token', res.data.token);
    api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
  };

  const logout = async () => {
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('token');
    setUser(null);
    setToken(null);
    router.replace('/login');
  };

  // ✅ helper para consultar permisos en la UI
  const hasPermission = (perm) => {
    const list = user?.permisos || [];
    return list.includes(perm);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
