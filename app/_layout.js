// app/_layout.js
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { AuthProvider } from '../src/context/AuthContext';
import { UbicacionProvider } from '../src/context/UbicacionContext';
import { NotificacionesProvider } from '../src/context/NotificacionesContext';
import { initOffline } from '../src/offline';
import { listenNet } from '../src/offline/net';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await initOffline();   // ← crea/migra SQLite
      setReady(true);
    })();
    const unsub = listenNet(); // ← actualiza estado interno de red
    return () => unsub?.();
  }, []);

  if (!ready) return null; // puedes mostrar un Splash si quieres

  return (
    <AuthProvider>
      <UbicacionProvider>
        <NotificacionesProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </NotificacionesProvider>
      </UbicacionProvider>
    </AuthProvider>
  );
}
