// src/offline/OfflineProvider.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { initDb } from "./db";
import { subscribeOnline } from "./net";
import { runOutboxSync } from "./syncEngine";
import api from "../services/api";

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [dbReady, setDbReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    (async () => {
      await initDb();
      setDbReady(true);
    })();
  }, []);

  useEffect(() => {
    const unsub = subscribeOnline(async (isOn) => {
      setOnline(isOn);

      // Cuando vuelve a online y ya hay DB, intenta sincronizar
      if (isOn && dbReady) {
        const r = await runOutboxSync(api, { limit: 30 });
        if (r?.ok) setLastSync(Date.now());
      }
    });
    return () => unsub && unsub();
  }, [dbReady]);

  const value = useMemo(() => ({ dbReady, online, lastSync }), [dbReady, online, lastSync]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  return useContext(OfflineContext);
}
