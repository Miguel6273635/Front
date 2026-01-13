// src/services/ordenesSupervisor.js
import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function fetchOrdenesSupervisor(startDate, endDate, mode = 'range') {
  try {
    // 👇 ajusta la key si tú guardas el correo en otra
    const correo =
      (await AsyncStorage.getItem('correo')) ||
      (await AsyncStorage.getItem('email')) ||
      (await AsyncStorage.getItem('userEmail')) ||
      '';

    console.log('[SUP-ORDENES] correo usado =', correo);

    console.log('[SUP-ORDENES] GET /api/ordenes/sap/list params =', {
      start: startDate,
      end: endDate,
      mode,
      user: correo,
    });

    const res = await api.get('/api/ordenes/sap/list', {
      params: {
        start: startDate,
        end: endDate,
        mode,
        user: correo, // ✅ FIX
      },
    });

    return Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    console.error('Error fetchOrdenesSupervisor:', error?.response?.data || error);
    return [];
  }
}
