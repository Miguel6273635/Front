import React from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function TarjetaFormulario({ title, icon, color, onPress, styles }) {
  return (
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
}
