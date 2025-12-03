// src/context/NotificacionesContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import {
  fetchNotificationsSmart,
  markReadLocal,
} from '../offline/notifications.store';

const NotificacionesContext = createContext();

export const NotificacionesProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [notificaciones, setNotificaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotificaciones = async () => {
    try {
      const data = await fetchNotificationsSmart(token); // ← smart (online→cache / offline→sqlite)
      setNotificaciones(data);
    } catch (err) {
      console.error('Error notificaciones smart:', err);
    } finally {
      setLoading(false);
    }
  };

  const marcarComoLeida = async (notifno) => {
    try {
      await api.put(
        '/notificaciones/leidas',
        { notifno },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      // sin red: marca local para que la UI refleje el estado
      await markReadLocal(user?.id, notifno);
    } finally {
      await fetchNotificaciones(); // recarga lista (smart)
    }
  };

  const noLeidas = notificaciones.filter((n) => !n.leida);

  useEffect(() => {
    if (token) fetchNotificaciones();
  }, [token]);

  return (
    <NotificacionesContext.Provider
      value={{
        notificaciones,
        noLeidas,
        loading,
        fetchNotificaciones,
        marcarComoLeida,
      }}
    >
      {children}
    </NotificacionesContext.Provider>
  );
};

export const useNotificaciones = () => useContext(NotificacionesContext);
