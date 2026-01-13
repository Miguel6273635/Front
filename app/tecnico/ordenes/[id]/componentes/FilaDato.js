import React from 'react';
import { View, Text } from 'react-native';

function formatearValor(value) {
  if (value == null) return '—';

  const t = typeof value;

  if (t === 'string' || t === 'number' || t === 'boolean') {
    return String(value);
  }

  if (t === 'object') {
    const {
      calle,
      street,
      colonia,
      neighborhood,
      municipio,
      city,
      estado,
      region,
      estado_provincia,
      cp,
      postalCode,
      zip,
      pais,
      country,
      full,
      direccion,
    } = value;

    const posibleFull = full || direccion || value.fullAddress || value.addressString;
    if (posibleFull && typeof posibleFull === 'string') return posibleFull;

    const partes = [
      calle || street,
      colonia || neighborhood,
      municipio || city,
      estado || region || estado_provincia,
      cp || postalCode || zip,
      pais || country,
    ]
      .filter(Boolean)
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0);

    if (partes.length) return partes.join(', ');

    try {
      return JSON.stringify(value);
    } catch {
      return '—';
    }
  }

  try {
    return String(value);
  } catch {
    return '—';
  }
}

export default function FilaDato({ label, value, styles }) {
  const text = formatearValor(value);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{text}</Text>
    </View>
  );
}
