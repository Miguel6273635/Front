import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../constants/colors';

export default function MenuCard({ title, icon, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.card}>
      <Ionicons name={icon} size={32} color={Colors.icon} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      <Ionicons name="arrow-forward-circle" size={24} color={Colors.icon} style={styles.arrow} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  icon: {
    marginRight: 14,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  arrow: {},
});
