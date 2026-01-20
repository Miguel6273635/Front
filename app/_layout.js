// app/_layout.js
import React from "react";
import { Stack } from "expo-router";
import { View, Platform } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { AuthProvider } from "../src/context/AuthContext";
import { UbicacionProvider } from "../src/context/UbicacionContext";
import { DrawerProvider } from "../src/context/DrawerContext";
import SideDrawer from "../src/components/SideDrawer";
import { OfflineProvider } from "../src/offline/OffilneProvider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <OfflineProvider>
        <AuthProvider>
          <UbicacionProvider>
            <DrawerProvider>
              {/* ✅ SafeArea GLOBAL para TODA la app */}
              <SafeAreaView
                style={{ flex: 1, backgroundColor: "#fff" }}
                edges={["top", "bottom"]}
              >
                <View style={{ flex: 1 }}>
                  <Stack screenOptions={{ headerShown: false }} />
                  <SideDrawer />
                </View>
              </SafeAreaView>
            </DrawerProvider>
          </UbicacionProvider>
        </AuthProvider>
      </OfflineProvider>
    </SafeAreaProvider>
  );
}
