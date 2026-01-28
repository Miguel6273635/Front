// app/ordenes/[id]/secciones/PieDetalleOrden.js
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * PieDetalleOrden
 * - Renderiza lo que hoy tienes en ListFooterComponent:
 *   - Sección Mantenimiento (2 cards)
 *   - Botón Finalizar orden (solo rol técnico)
 *
 * Recibe styles y FIORI para no duplicar estilos.
 */

const TarjetaFormulario = ({ title, icon, color, onPress, styles }) => (
  <TouchableOpacity style={styles.cardWrap} onPress={onPress} activeOpacity={0.92}>
    <View style={[styles.card, { backgroundColor: color }]}>
      <View style={styles.cardTop}>
        <View style={styles.iconBadge}>
          <Ionicons name={icon} size={18} color="#fff" />
        </View>
      </View>
      <Text numberOfLines={2} style={styles.cardTitle}>
        {title}
      </Text>
    </View>
  </TouchableOpacity>
);

export default function PieDetalleOrden({
  styles,
  FIORI,

  // reglas
  isNoMant,

  // usuario
  userRolId,

  // estado / acción
  finishingOrder,
  onIrManttoElevador,
  onIrManttoEscalera,
  onFinalizarOrden,
}) {
  if (isNoMant) return null;

  return (
    <>
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Mantenimiento</Text>

        <View style={styles.grid}>
          <TarjetaFormulario
            title="Mantto elevador"
            icon="construct-outline"
            color="#5AAAF6"
            onPress={onIrManttoElevador}
            styles={styles}
          />
          {/*<TarjetaFormulario
            title="Mantto escalera"
            icon="build-outline"
            color="#4C9FEF"
            onPress={onIrManttoEscalera}
            styles={styles}
          />*/}
        </View>
      </View>

      {userRolId === 3 && (
        <View style={{ marginTop: 4, marginBottom: 24 }}>
          <TouchableOpacity
            style={[styles.btnFinishOrder, finishingOrder && { opacity: 0.7 }]}
            activeOpacity={0.9}
            onPress={onFinalizarOrden}
            disabled={finishingOrder}
          >
            <Ionicons name="flag-outline" size={18} color="#fff" />
            <Text style={styles.btnFinishOrderText}>
              {finishingOrder ? 'Preparando firma…' : 'Finalizar orden'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}
