// app/index.js
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return '/admin';
  if (rol_id === 2) return '/supervisor';
  return '/tecnico';
}

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return <Redirect href={pickHomeByRole(user.rol_id)} />;
}
