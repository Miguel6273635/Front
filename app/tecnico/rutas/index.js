// app/tecnico/rutas/index.js  (o donde tengas esta vista)
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import * as Location from 'expo-location';
import api from '../../../src/services/api';
import { useAuth } from '../../../src/context/AuthContext';
import Header from '../../../src/components/Header';
import Footer from '../../../src/components/Footer';
import { Ionicons } from '@expo/vector-icons';

// ===== Paleta Fiori (Horizon) =====
const FIORI = {
  pageBg: '#F7F7F7',
  panelBg: '#FFFFFF',
  panelSubtle: '#F5F7FA',
  border: '#DDE6F2',
  borderMuted: '#CFD8E3',
  ink: '#0B1F3B',
  textMuted: '#63718B',
  accent: '#0A6ED1',
  accentSoft: '#E3F2FD',
  success: '#2FBF71',
  danger: '#E74C3C',
};

// ⚠️ Keys (dejas las tuyas tal cual)
const GOOGLE_API_KEY = 'AIzaSyCNzVLTuidfPcwlSWO8113G5H_oy8fqdlU';
const MAPTILER_KEY   = 'xXsfDizxhemYIlweqX7X';

export default function RutasTecnico() {
  const { token } = useAuth();
  const [ordenes, setOrdenes] = useState([]);
  const [ubicacion, setUbicacion] = useState(null);
  const [selectedOrden, setSelectedOrden] = useState(null);
  const [mode, setMode] = useState('DRIVING'); // DRIVING | WALKING | BICYCLING | TRANSIT
  const [routeInfo, setRouteInfo] = useState(null);
  const [loadingUbic, setLoadingUbic] = useState(true);

  const [query, setQuery] = useState('');
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const mapRef = useRef(null);
  const markerRefs = useRef({});
  const geocodeCache = useRef(new Map());

  useEffect(() => {
    obtenerUbicacion();
    fetchOrdenes();
  }, []);

  const obtenerUbicacion = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingUbic(false);
        Alert.alert('Permiso ubicación', 'No se concedió el permiso de ubicación.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setUbicacion(loc.coords);
    } catch (e) {
      console.error('Ubicación error:', e);
    } finally {
      setLoadingUbic(false);
    }
  };

  const fetchOrdenes = async () => {
    try {
      const res = await api.get('/rutas-asignadas', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const ordenesConCoords = await Promise.all(
        res.data.map(async (orden) => {
          const coords = await geocodeDireccion(orden.direccion);
          return {
            ...orden,
            latitude: coords?.lat ?? null,
            longitude: coords?.lng ?? null,
            _viewport: coords?._viewport ?? null,
          };
        })
      );
      setOrdenes(ordenesConCoords);
    } catch (error) {
      console.error('Error al obtener órdenes:', error);
      Alert.alert('Error', 'No se pudieron cargar las órdenes.');
    }
  };

  // Geocodificación + cache
  const geocodeDireccion = async (direccion) => {
    if (!direccion) return null;
    if (geocodeCache.current.has(direccion)) return geocodeCache.current.get(direccion);
    try {
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(direccion)}` +
        `&components=country:MX&region=mx&key=${GOOGLE_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.results?.length) {
        const r = data.results[0];
        const loc = r.geometry.location;
        const vp = r.geometry.viewport;
        const value = {
          lat: loc.lat,
          lng: loc.lng,
          _viewport: vp
            ? {
                ne: { lat: vp.northeast.lat, lng: vp.northeast.lng },
                sw: { lat: vp.southwest.lat, lng: vp.southwest.lng },
              }
            : null,
        };
        geocodeCache.current.set(direccion, value);
        return value;
      } else {
        console.warn('Geocode fallo:', data.status, data.error_message);
      }
    } catch (e) {
      console.error('Error al geocodificar:', e);
    }
    return null;
  };

  const deltasFromViewport = (vp) => {
    if (!vp) return { latitudeDelta: 0.01, longitudeDelta: 0.01 };
    const latDelta = Math.abs(vp.ne.lat - vp.sw.lat);
    const lngDelta = Math.abs(vp.ne.lng - vp.sw.lng);
    return {
      latitudeDelta: Math.max(latDelta * 1.2, 0.005),
      longitudeDelta: Math.max(lngDelta * 1.2, 0.005),
    };
  };

  const seleccionarOrden = async (orden) => {
    let lat = orden?.latitude ?? null;
    let lng = orden?.longitude ?? null;
    let vp = orden?._viewport ?? null;

    if (!lat || !lng) {
      const re = await geocodeDireccion(orden?.direccion);
      if (re) { lat = re.lat; lng = re.lng; vp = re._viewport; }
    }
    if (!lat || !lng) {
      Alert.alert('Dirección no encontrada', 'No se pudo ubicar la dirección con precisión.');
      return;
    }

    const nueva = { ...orden, latitude: lat, longitude: lng, _viewport: vp };
    setSelectedOrden(nueva);
    setRouteInfo(null);

    const deltas = deltasFromViewport(vp);
    if (mapRef.current) {
      if (Platform.OS === 'android') {
        mapRef.current.animateCamera(
          { center: { latitude: lat, longitude: lng }, zoom: 16 },
          { duration: 500 }
        );
      } else {
        mapRef.current.animateToRegion({ latitude: lat, longitude: lng, ...deltas }, 500);
      }
    }

    markerRefs.current[orden.order_id]?.showCallout?.();
    if (!sheetExpanded) setSheetExpanded(true);
  };

  const centrarMiUbicacion = () => {
    if (!ubicacion || !mapRef.current) return;
    if (Platform.OS === 'android') {
      mapRef.current.animateCamera(
        { center: { latitude: ubicacion.latitude, longitude: ubicacion.longitude }, zoom: 16 },
        { duration: 500 }
      );
    } else {
      mapRef.current.animateToRegion(
        {
          latitude: ubicacion.latitude,
          longitude: ubicacion.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500
      );
    }
  };

  const filteredOrdenes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordenes;
    return ordenes.filter((o) =>
      [o.order_id, o.nombre_orden, o.direccion].join(' ').toLowerCase().includes(q)
    );
  }, [ordenes, query]);

  const renderOrdenCard = ({ item }) => {
    const isSelected = selectedOrden?.order_id === item.order_id;
    return (
      <TouchableOpacity
        onPress={() => seleccionarOrden(item)}
        activeOpacity={0.9}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.badgeMini}>#{item.order_id}</Text>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.nombre_orden || 'Orden'}
          </Text>
        </View>

        <View style={styles.cardBottomRow}>
          <Ionicons name="location-outline" size={14} color={FIORI.accent} />
          <Text style={styles.cardAddress} numberOfLines={1}>
            {item.direccion}
          </Text>
          <TouchableOpacity onPress={() => seleccionarOrden(item)} style={styles.goBtn}>
            <Ionicons name="navigate-outline" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const initialRegion = {
    latitude: ubicacion?.latitude || 19.4326,
    longitude: ubicacion?.longitude || -99.1332,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const modeSafe =
    mode === 'DRIVING' || mode === 'WALKING' || mode === 'BICYCLING' || mode === 'TRANSIT'
      ? mode
      : 'DRIVING';

  return (
    <View style={styles.container}>
      <Header title="Rutas asignadas" />

      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          mapType="none"
          showsUserLocation
          showsMyLocationButton={false}
          initialRegion={initialRegion}
        >
          <UrlTile
            urlTemplate={`https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`}
            maximumZ={19}
            zIndex={-1}
          />

          {ordenes.map((orden) => {
            if (!orden.latitude || !orden.longitude) return null;
            return (
              <Marker
                key={orden.order_id}
                ref={(ref) => (markerRefs.current[orden.order_id] = ref)}
                coordinate={{ latitude: orden.latitude, longitude: orden.longitude }}
                title={orden.nombre_orden}
                description={orden.direccion}
                pinColor={selectedOrden?.order_id === orden.order_id ? FIORI.success : FIORI.danger}
              />
            );
          })}

          {selectedOrden &&
            ubicacion &&
            selectedOrden.latitude &&
            selectedOrden.longitude &&
            GOOGLE_API_KEY && (
              <MapViewDirections
                origin={{ latitude: ubicacion.latitude, longitude: ubicacion.longitude }}
                destination={{ latitude: selectedOrden.latitude, longitude: selectedOrden.longitude }}
                apikey={GOOGLE_API_KEY}
                strokeWidth={4}
                strokeColor={FIORI.accent}
                mode={modeSafe}
                optimizeWaypoints={false}
                timePrecision="now"
                onError={(errMessage) => {
                  console.warn('Directions error:', errMessage);
                  Alert.alert(
                    'Ruta no disponible',
                    'No se pudo obtener la ruta. Verifica que tu API key tenga Directions API habilitado y facturación activa.'
                  );
                }}
                onReady={(result) => {
                  setRouteInfo({ distance: result.distance, duration: result.duration });
                  if (mapRef.current && result.coordinates?.length) {
                    mapRef.current.fitToCoordinates(result.coordinates, {
                      edgePadding: { top: 80, right: 80, bottom: 380, left: 80 },
                      animated: true,
                    });
                  }
                }}
              />
            )}
        </MapView>

        {/* Chips de modo */}
        <View style={styles.modeContainer}>
          {[
            { key: 'DRIVING',   icon: 'car-outline' },
            { key: 'WALKING',   icon: 'walk-outline' },
            { key: 'BICYCLING', icon: 'bicycle-outline' },
            { key: 'TRANSIT',   icon: 'bus-outline' },
          ].map((m) => {
            const active = modeSafe === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[styles.modeChip, active && styles.modeChipActive]}
                onPress={() => setMode(m.key)}
              >
                <Ionicons name={m.icon} size={15} color={active ? '#fff' : FIORI.accent} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Info de ruta */}
        {routeInfo && (
          <View style={styles.routeInfoPill}>
            <Text style={styles.routeInfoText}>
              {Math.round(routeInfo.duration)} min · {routeInfo.distance.toFixed(1)} km
            </Text>
          </View>
        )}

        {/* FABs */}
        <View style={styles.fabStack}>
          <TouchableOpacity style={styles.fab} onPress={centrarMiUbicacion} disabled={loadingUbic}>
            <Ionicons name="locate-outline" size={20} color="#fff" />
          </TouchableOpacity>
          {selectedOrden && (
            <TouchableOpacity style={styles.fab} onPress={() => seleccionarOrden(selectedOrden)}>
              <Ionicons name="swap-vertical-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Pill seleccionado */}
        {selectedOrden && (
          <View style={styles.selectedPill}>
            <Text style={styles.selectedPillText} numberOfLines={1}>
              #{selectedOrden.order_id} · {selectedOrden.nombre_orden}
            </Text>
          </View>
        )}
      </View>

      {/* Sheet */}
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
            color={FIORI.textMuted}
          />
        </TouchableOpacity>

        {/* Buscador */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={FIORI.textMuted} />
          <TextInput
            placeholder="Buscar #, nombre o dirección"
            placeholderTextColor={FIORI.textMuted}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
              <Ionicons name="close-outline" size={16} color={FIORI.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filteredOrdenes}
          keyExtractor={(item, index) => item.order_id?.toString() ?? index.toString()}
          renderItem={renderOrdenCard}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={{ padding: 12, alignItems: 'center' }}>
              <Text style={{ color: FIORI.textMuted, fontSize: 12 }}>Sin resultados</Text>
            </View>
          }
        />
      </View>

      <Footer />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: FIORI.pageBg },
  mapWrapper:  { flex: 1, position: 'relative', backgroundColor: FIORI.panelSubtle },
  map:         { width: '100%', height: '100%' },

  // Chips modo
  modeContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    backgroundColor: FIORI.panelBg,
    borderRadius: 999,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: FIORI.border,
    ...shadow(0.7),
  },
  modeChip: {
    width: 32, height: 32, borderRadius: 999,
    backgroundColor: FIORI.accentSoft,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: FIORI.border,
  },
  modeChipActive: {
    backgroundColor: FIORI.accent,
    borderColor: FIORI.accent,
  },

  // Info ruta
  routeInfoPill: {
    position: 'absolute',
    top: 48, left: 8,
    backgroundColor: FIORI.panelBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: FIORI.border,
    ...shadow(0.7),
  },
  routeInfoText: { color: FIORI.ink, fontSize: 12, fontWeight: '700' },

  // FABs
  fabStack: { position: 'absolute', right: 10, bottom: 150, gap: 8 },
  fab: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: FIORI.accent,
    alignItems: 'center', justifyContent: 'center',
    ...shadow(1),
  },

  // Pill seleccionado
  selectedPill: {
    position: 'absolute', left: 8, bottom: 150,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
    maxWidth: '75%', borderWidth: 1, borderColor: FIORI.border,
    ...shadow(0.6),
  },
  selectedPillText: { color: FIORI.ink, fontSize: 12, fontWeight: '700' },

  // Sheet
  sheet: {
    backgroundColor: FIORI.panelBg,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderColor: FIORI.border,
    ...shadow(0.8),
  },
  sheetCollapsed: { height: 180 },
  sheetExpanded:  { height: 360 },

  sheetHandle: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handleBar: {
    width: 32, height: 3, backgroundColor: FIORI.borderMuted,
    borderRadius: 999, marginBottom: 2,
  },

  // Buscador
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: FIORI.panelSubtle,
    marginHorizontal: 10, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 1, borderColor: FIORI.border,
    marginBottom: 6,
  },
  searchInput: { flex: 1, color: FIORI.ink, paddingVertical: 2, fontSize: 13 },
  clearBtn: {
    width: 26, height: 26, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },

  // Cards de lista
  card: {
    backgroundColor: FIORI.panelBg,
    borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: FIORI.border,
    ...shadow(0.25),
  },
  cardSelected: { borderColor: FIORI.accent, backgroundColor: FIORI.accentSoft },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  badgeMini: {
    color: FIORI.accent, fontWeight: '800', fontSize: 11,
    backgroundColor: FIORI.accentSoft,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  cardTitle: { color: FIORI.ink, fontWeight: '700', fontSize: 13, flex: 1 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardAddress: { color: FIORI.textMuted, fontSize: 12, flex: 1 },
  goBtn: {
    backgroundColor: FIORI.accent,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
});

function shadow(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 6 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });
}
