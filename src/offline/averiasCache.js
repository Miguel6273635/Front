// src/offline/averiasCache.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "@mitsu:averias:";
const safe = (v) => (v == null ? "" : String(v));

const jsonParse = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};

/* =========================
   LISTA DE AVERÍAS (INDEX)
========================= */
const keyList = ({ correo, startYmd, endYmd }) =>
  `${PREFIX}list:${safe(correo).toLowerCase()}:${safe(startYmd)}:${safe(endYmd)}`;

export async function saveAveriasListCache({ correo, startYmd, endYmd, items }) {
  const k = keyList({ correo, startYmd, endYmd });
  const payload = {
    savedAt: Date.now(),
    correo: safe(correo),
    startYmd: safe(startYmd),
    endYmd: safe(endYmd),
    items: Array.isArray(items) ? items : [],
  };
  await AsyncStorage.setItem(k, JSON.stringify(payload));
  return k;
}

export async function loadAveriasListCache({ correo, startYmd, endYmd }) {
  const k = keyList({ correo, startYmd, endYmd });
  const raw = await AsyncStorage.getItem(k);
  if (!raw) return null;
  return jsonParse(raw, null);
}

/* =========================
   DETALLE DE AVERÍA (DETALLES)
========================= */
const keyDetail = ({ averiaid }) => `${PREFIX}detail:${safe(averiaid).trim()}`;

// ✅ ahora guarda header + item (y sigue guardando codigos si los usas)
export async function saveAveriaDetailCache({ averiaid, header, item, codigos }) {
  const k = keyDetail({ averiaid });
  const payload = {
    savedAt: Date.now(),
    averiaid: safe(averiaid).trim(),
    header: header ?? null,
    item: item ?? null,
    codigos: codigos ?? null,
  };
  await AsyncStorage.setItem(k, JSON.stringify(payload));
  return k;
}

export async function loadAveriaDetailCache({ averiaid }) {
  const k = keyDetail({ averiaid });
  const raw = await AsyncStorage.getItem(k);
  if (!raw) return null;
  return jsonParse(raw, null);
}
