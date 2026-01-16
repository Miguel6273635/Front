// app/_layout.js
import { Stack } from "expo-router";
import { AuthProvider } from "../src/context/AuthContext";
import { UbicacionProvider } from "../src/context/UbicacionContext";
import { DrawerProvider } from "../src/context/DrawerContext";
import SideDrawer from "../src/components/SideDrawer";
import { OfflineProvider } from "../src/offline/OffilneProvider";

export default function RootLayout() {
  return (
    <OfflineProvider>
      <AuthProvider>
        <UbicacionProvider>
          <DrawerProvider>
            <Stack screenOptions={{ headerShown: false }} />
            <SideDrawer />
          </DrawerProvider>
        </UbicacionProvider>
      </AuthProvider>
    </OfflineProvider>
  );
}
