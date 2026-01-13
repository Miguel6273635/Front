// app/_layout.js
import { Stack } from 'expo-router';

import { AuthProvider } from '../src/context/AuthContext';
import { UbicacionProvider } from '../src/context/UbicacionContext';
import { NotificacionesProvider } from '../src/context/NotificacionesContext';

import { DrawerProvider } from '../src/context/DrawerContext';
import SideDrawer from '../src/components/SideDrawer';

export default function RootLayout() {
  return (
    <AuthProvider>
      <UbicacionProvider>
        <NotificacionesProvider>
          <DrawerProvider>
            <Stack screenOptions={{ headerShown: false }} />
            <SideDrawer />
          </DrawerProvider>
        </NotificacionesProvider>
      </UbicacionProvider>
    </AuthProvider>
  );
}
