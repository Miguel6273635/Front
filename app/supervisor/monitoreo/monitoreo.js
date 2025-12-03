import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/services/api';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';

const BG = '#F4F6F9';
const SAP_BLUE = '#0A6ED1';
const SAP_RED = '#E74C3C';
const CARD = '#FFFFFF';

// 👇 PON AQUÍ TU KEY DE MAPTILER
const MAPTILER_KEY = 'xXsfDizxhemYIlweqX7X';

const DEFAULT_REGION_MX = {
  latitude: 23.6345,
  longitude: -102.5528,
  latitudeDelta: 15,
  longitudeDelta: 15,
};

export default function Monitoreo() {
  const [tecnicos, setTecnicos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sheetExpanded, setSheetExpanded] = useState(true);

  const mapRef = useRef(null);

  const cargarUbicaciones = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await api.get('/geolocalizacion/tecnicos');
      const data = Array.isArray(res.data) ? res.data : [];
      const sane = data
        .filter((t) => t.latitud != null && t.longitud != null)
        .map((t) => ({
          ...t,
          latitud: typeof t.latitud === 'string' ? parseFloat(t.latitud) : t.latitud,
          longitud: typeof t.longitud === 'string' ? parseFloat(t.longitud) : t.longitud,
        }))
        .filter((t) => Number.isFinite(t.latitud) && Number.isFinite(t.longitud));
      setTecnicos(sane);
      setLastUpdated(new Date());
    } catch (error) {
      setErrorMsg('No se pudo cargar la geolocalización. Intenta de nuevo.');
      console.log('Error al cargar ubicaciones:', error?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarUbicaciones();
    const interval = setInterval(cargarUbicaciones, 30000);
    return () => clearInterval(interval);
  }, []);

  // Ajusta el mapa para que muestre todos los técnicos
  useEffect(() => {
    if (mapRef.current && tecnicos.length > 0) {
      const coords = tecnicos.map((t) => ({ latitude: t.latitud, longitude: t.longitud }));
      requestAnimationFrame(() => {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 90, right: 50, bottom: sheetExpanded ? 240 : 145, left: 50 },
          animated: true,
        });
      });
    }
  }, [tecnicos, sheetExpanded]);

  const tecnicosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return tecnicos;
    return tecnicos.filter((t) => (t.nombre || '').toLowerCase().includes(q));
  }, [tecnicos, busqueda]);

  const enfocarTecnico = (tecnico) => {
    if (!tecnico || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: tecnico.latitud,
        longitude: tecnico.longitud,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      800
    );
  };

  const initialRegion =
    tecnicos.length > 0
      ? {
          latitude: tecnicos[0].latitud,
          longitude: tecnicos[0].longitud,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }
      : DEFAULT_REGION_MX;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Header title="Monitoreo en tiempo real" />

      {/* MAPA */}
      <View style={{ flex: 1, position: 'relative' }}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={initialRegion}
          mapPadding={{
            top: 90,
            right: 10,
            bottom: sheetExpanded ? 240 : 145,
            left: 10,
          }}
        >
          <UrlTile
            urlTemplate={`https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`}
            maximumZ={19}
            zIndex={0}
          />
          {tecnicos.map((t) => (
            <Marker
              key={t.usuario_id?.toString() ?? `${t.latitud}-${t.longitud}`}
              coordinate={{ latitude: t.latitud, longitude: t.longitud }}
              title={t.nombre}
              description={t.correo}
              pinColor={SAP_RED}
            />
          ))}
        </MapView>

        {/* BARRA FIORI SUPERIOR (buscador + estado + refrescar) */}
        <View style={styles.topPanel}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#8390A6" />
            <TextInput
              placeholder="Buscar técnico…"
              placeholderTextColor="#98A4B6"
              value={busqueda}
              onChangeText={setBusqueda}
              style={styles.searchInput}
            />
            {busqueda.length > 0 && (
              <TouchableOpacity onPress={() => setBusqueda('')} style={styles.clearBtn}>
                <Ionicons name="close-outline" size={16} color="#8390A6" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.infoPill}>
            <View style={styles.statusDot} />
            <Text style={styles.infoText}>
              {tecnicos.length} en línea
            </Text>
          </View>

          <TouchableOpacity
            onPress={cargarUbicaciones}
            disabled={loading}
            style={[styles.refreshBtn, loading && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="refresh" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Pill: última actualización */}
        <View style={styles.statusPill}>
          <Ionicons name="time-outline" size={13} color="#6F7380" />
          <Text style={styles.statusText}>
            {loading
              ? 'Actualizando…'
              : lastUpdated
              ? `Actualizado: ${lastUpdated.toLocaleTimeString()}`
              : 'Sin actualización'}
          </Text>
        </View>

        {/* Atribución */}
        <View style={styles.attrBox}>
          <Text style={styles.attrText}>© OpenStreetMap · © MapTiler</Text>
        </View>
      </View>

      {/* BOTTOM SHEET FIORI */}
      <View style={[styles.sheet, sheetExpanded ? styles.sheetExpanded : styles.sheetCollapsed]}>
        <TouchableOpacity
          style={styles.sheetHandle}
          activeOpacity={0.8}
          onPress={() => setSheetExpanded((v) => !v)}
        >
          <View style={styles.handleBar} />
          <Ionicons
            name={sheetExpanded ? 'chevron-down' : 'chevron-up'}
            size={18}
            color="#8A8FA6"
          />
        </TouchableOpacity>

        {!!errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

        {tecnicos.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No se encontraron técnicos con ubicación</Text>
            <Text style={styles.emptySub}>Puedes reintentar la carga.</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={cargarUbicaciones}
              disabled={loading}
            >
              <Text style={styles.retryText}>{loading ? 'Cargando…' : 'Reintentar'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={tecnicosFiltrados}
            keyExtractor={(item) =>
              item.usuario_id?.toString() ?? `${item.latitud}-${item.longitud}`
            }
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16 }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => enfocarTecnico(item)}
                style={styles.resultItem}
                activeOpacity={0.7}
              >
                <View style={styles.avatar}>
                    <Ionicons name="person-outline" size={18} color={SAP_BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.nombre}
                  </Text>
                  {!!item.correo && (
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.correo}
                    </Text>
                  )}
                </View>
                <View style={styles.coordBox}>
                  <Text style={styles.coords}>
                    {item.latitud.toFixed(4)}, {item.longitud.toFixed(4)}
                  </Text>
                  <Ionicons name="locate-outline" size={16} color={SAP_BLUE} />
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyFilter}>No hay coincidencias con “{busqueda}”.</Text>
            }
          />
        )}
      </View>

      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: '100%' },

  // PANEL SUPERIOR
  topPanel: {
    position: 'absolute',
    top: 12,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E4F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchInput: {
    flex: 1,
    marginLeft: 5,
    color: '#2F3349',
    fontSize: 13,
    paddingVertical: 0,
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E5E9F5',
    gap: 5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#4CAF50',
  },
  infoText: {
    fontSize: 12,
    color: '#43516A',
    fontWeight: '500',
  },
  refreshBtn: {
    backgroundColor: SAP_BLUE,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },

  statusPill: {
    position: 'absolute',
    top: 60,
    right: 10,
    backgroundColor: CARD,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E9ECF3',
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  statusText: { color: '#2F3349', fontSize: 11.5 },

  attrBox: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  attrText: { fontSize: 10, color: '#333' },

  // SHEET
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: '#E1E4F0',
  },
  sheetCollapsed: { height: 145 },
  sheetExpanded: { height: 240 },

  sheetHandle: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
  },
  handleBar: {
    width: 32,
    height: 3,
    backgroundColor: '#D5D8E6',
    borderRadius: 999,
    marginBottom: 4,
  },

  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  separator: {
    height: 1,
    backgroundColor: '#EEF1F5',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EAF2FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 14.5, fontWeight: '700', color: '#2F3349' },
  sub: { color: '#687187', marginTop: 2, fontSize: 11.5 },
  coordBox: { alignItems: 'flex-end', gap: 3 },
  coords: { color: '#4B5563', fontSize: 11 },

  emptyBox: {
    borderWidth: 1,
    borderColor: '#FCE0E0',
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginHorizontal: 4,
    marginTop: 4,
    marginBottom: 6,
  },
  emptyTitle: { fontWeight: '700', color: '#7a0000', marginBottom: 4 },
  emptySub: { color: '#7a0000', marginBottom: 10, textAlign: 'center' },
  retryBtn: {
    backgroundColor: SAP_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '700' },

  emptyFilter: { textAlign: 'center', color: '#666', paddingVertical: 10 },

  error: { color: '#a10000', marginBottom: 6, fontSize: 12, textAlign: 'center' },
});
