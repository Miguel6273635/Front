import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import api from '../services/api';

const UbicacionContext = createContext();

export const UbicacionProvider = ({ children }) => {
  const [permisosOtorgados, setPermisosOtorgados] = useState(false);
  const { user, token } = useAuth();

  useEffect(() => {
    const solicitarPermisos = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la ubicación para esta app.');
        return;
      }
      setPermisosOtorgados(true);
    };

    solicitarPermisos();
  }, []);

  useEffect(() => {
    let intervalo;

    const enviarUbicacion = async () => {
      try {
        const location = await Location.getCurrentPositionAsync({});
        await api.post('/geolocalizacion', {
            latitud: location.coords.latitude,
            longitud: location.coords.longitude,
            }, {
            headers: {
                Authorization: `Bearer ${token}`,
            }
        });

      } catch (err) {
        console.log('No se pudo enviar ubicación:', err.message);
      }
    };

    if (permisosOtorgados && user && token) {
      enviarUbicacion(); // primer envío inmediato
      intervalo = setInterval(enviarUbicacion, 30000); // cada 30s
    }

    return () => clearInterval(intervalo);
  }, [permisosOtorgados, user, token]);

  return (
    <UbicacionContext.Provider value={{ permisosOtorgados }}>
      {children}
    </UbicacionContext.Provider>
  );
};

export const useUbicacion = () => useContext(UbicacionContext);
