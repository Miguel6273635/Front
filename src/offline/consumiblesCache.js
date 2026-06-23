// src/offline/consumiblesCache.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getAgrupadoresByCobertura,
  makeAgrupadorKey,
  makeAgrupadorLabel,
  normalizeAgrupador,
  normalizeCoberturaTipo,
  normUpper,
} from "./consumiblesAgrupadores";

const INDEX_KEY = "consumibles:index:v3";
const META_KEY = "consumibles:meta:v3";

const GROUP_KEY = (cobertura, agr1, agr2) =>
  `consumibles:grupo:v3:${normalizeCoberturaTipo(cobertura)}:${makeAgrupadorKey(
    agr1,
    agr2,
  )}`;

function safeStr(v) {
  return String(v ?? "").trim();
}

function pickFirst(obj, keys = []) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== null && v !== undefined && safeStr(v)) return v;
  }

  return "";
}

export function normalizeConsumibleRow(row = {}, forced = {}) {
  const agr = normalizeAgrupador({
    ...row,
    ...forced,
  });

  const materialRaw = pickFirst(row, [
    "Material",
    "material",
    "MATNR",
    "Matnr",
    "matnr",
    "Codigo",
    "codigo",
    "Code",
    "code",
  ]);

  const descripcionRaw = pickFirst(row, [
    "Description",
    "description",
    "Descripcion",
    "descripcion",
    "MAKTX",
    "Maktx",
    "maktx",
    "TextoMaterial",
    "textoMaterial",
    "ShortText",
    "shortText",
  ]);

  const unidadRaw = pickFirst(row, [
    "Unidad",
    "unidad",
    "Unit",
    "unit",
    "MEINS",
    "Meins",
    "meins",
    "BaseUnit",
    "baseUnit",
    "Uom",
    "uom",
  ]);

  const centroRaw = pickFirst(row, [
    "Centro",
    "centro",
    "Plant",
    "plant",
    "WERKS",
    "Werks",
    "werks",
  ]);

  const Material = safeStr(materialRaw);
  const Description = safeStr(descripcionRaw);
  const Unidad = safeStr(unidadRaw) || "PZA";
  const Centro = safeStr(centroRaw);

  const Categoria = makeAgrupadorLabel(agr.Agr1, agr.Agr2);

  return {
    ...row,

    id: `${agr.key}:${Material || Description}`.replace(/\s+/g, "_"),

    Agr1: agr.Agr1,
    Agr2: agr.Agr2,
    agr1: agr.Agr1,
    agr2: agr.Agr2,
    Agrupador1: agr.Agr1,
    Agrupador2: agr.Agr2,

    Categoria,
    categoria: Categoria,

    Material,
    material: Material,

    Description,
    description: Description,
    Descripcion: Description,

    Unidad,
    unidad: Unidad,

    Centro,
    centro: Centro,

    searchText: normUpper(
      `${Categoria} ${agr.Agr1} ${agr.Agr2} ${Material} ${Description} ${Unidad}`,
    ),
  };
}

export function normalizeConsumiblesRows(rows = [], forced = {}) {
  const arr = Array.isArray(rows) ? rows : [];
  const map = new Map();

  arr.forEach((row) => {
    const normalized = normalizeConsumibleRow(row, forced);

    if (!normalized.Material && !normalized.Description) return;

    const key = [
      normalized.Agr1,
      normalized.Agr2,
      normalized.Material,
      normalized.Description,
    ].join(":");

    map.set(key, normalized);
  });

  return Array.from(map.values());
}

async function loadIndex() {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveIndex(index) {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index || {}));
}

export async function saveConsumiblesGroup({
  coberturaTipo = "BASICA",
  agr1,
  agr2,
  rows = [],
}) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);
  const Agr1 = normUpper(agr1);
  const Agr2 = normUpper(agr2);
  const key = GROUP_KEY(cobertura, Agr1, Agr2);

  const data = normalizeConsumiblesRows(rows, {
    Agr1,
    Agr2,
  });

  const payload = {
    cobertura,
    Agr1,
    Agr2,
    label: makeAgrupadorLabel(Agr1, Agr2),
    updatedAt: Date.now(),
    count: data.length,
    data,
  };

  await AsyncStorage.setItem(key, JSON.stringify(payload));

  const index = await loadIndex();
  index[cobertura] = index[cobertura] || {};
  index[cobertura][makeAgrupadorKey(Agr1, Agr2)] = {
    key,
    cobertura,
    Agr1,
    Agr2,
    label: payload.label,
    count: payload.count,
    updatedAt: payload.updatedAt,
  };

  await AsyncStorage.multiSet([
    [INDEX_KEY, JSON.stringify(index)],
    [
      META_KEY,
      JSON.stringify({
        lastSyncAt: Date.now(),
      }),
    ],
  ]);

  return payload;
}

export async function loadConsumiblesGroup({
  coberturaTipo = "BASICA",
  agr1,
  agr2,
}) {
  try {
    const cobertura = normalizeCoberturaTipo(coberturaTipo);
    const key = GROUP_KEY(cobertura, agr1, agr2);
    const raw = await AsyncStorage.getItem(key);

    if (!raw) {
      return {
        cobertura,
        Agr1: normUpper(agr1),
        Agr2: normUpper(agr2),
        label: makeAgrupadorLabel(agr1, agr2),
        updatedAt: null,
        count: 0,
        data: [],
      };
    }

    const parsed = JSON.parse(raw);
    const data = Array.isArray(parsed?.data) ? parsed.data : [];

    return {
      ...parsed,
      data,
      count: data.length,
    };
  } catch (e) {
    console.log("[CONSUMIBLES CACHE] Error leyendo grupo:", e?.message || e);

    return {
      cobertura: normalizeCoberturaTipo(coberturaTipo),
      Agr1: normUpper(agr1),
      Agr2: normUpper(agr2),
      label: makeAgrupadorLabel(agr1, agr2),
      updatedAt: null,
      count: 0,
      data: [],
    };
  }
}

export async function loadConsumiblesByCobertura(coberturaTipo = "BASICA") {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);
  const agrupadores = getAgrupadoresByCobertura(cobertura);
  const groups = [];

  for (const agr of agrupadores) {
    const group = await loadConsumiblesGroup({
      coberturaTipo: cobertura,
      agr1: agr.Agr1,
      agr2: agr.Agr2,
    });

    groups.push(group);
  }

  const all = groups.flatMap((g) => g.data || []);

  return {
    cobertura,
    updatedAt: groups
      .map((g) => g.updatedAt)
      .filter(Boolean)
      .sort()
      .pop() || null,
    count: all.length,
    groups,
    data: all,
  };
}

/*
  Compatibilidad:
  Algunos componentes anteriores usan loadConsumiblesCatalog().
  Ahora devuelve el catálogo de BASICA unido por grupos.
*/
export async function loadConsumiblesCatalog(coberturaTipo = "BASICA") {
  return await loadConsumiblesByCobertura(coberturaTipo);
}

/*
  Compatibilidad:
  Si algún código viejo llama saveConsumiblesCatalog(rows), guardamos
  repartiendo por Agr1/Agr2 de cada fila. Si no trae Agr1/Agr2, no se puede
  asignar a un grupo y se omite.
*/
export async function saveConsumiblesCatalog(rows = [], coberturaTipo = "BASICA") {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);
  const normalized = normalizeConsumiblesRows(rows);
  const byGroup = new Map();

  normalized.forEach((row) => {
    const agr = normalizeAgrupador(row);
    if (!agr.Agr1 || !agr.Agr2) return;

    const key = makeAgrupadorKey(agr.Agr1, agr.Agr2);
    const list = byGroup.get(key) || [];
    list.push(row);
    byGroup.set(key, list);
  });

  let count = 0;

  for (const [, list] of byGroup.entries()) {
    const first = list[0];
    const saved = await saveConsumiblesGroup({
      coberturaTipo: cobertura,
      agr1: first.Agr1,
      agr2: first.Agr2,
      rows: list,
    });

    count += saved.count || 0;
  }

  return {
    updatedAt: Date.now(),
    count,
    data: normalized,
  };
}

export async function getConsumiblesLastSync() {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.lastSyncAt || null;
  } catch {
    return null;
  }
}

export async function clearConsumiblesCatalog() {
  const index = await loadIndex();
  const keys = [INDEX_KEY, META_KEY];

  Object.values(index || {}).forEach((byCoverage) => {
    Object.values(byCoverage || {}).forEach((item) => {
      if (item?.key) keys.push(item.key);
    });
  });

  await AsyncStorage.multiRemove(keys);

  return { ok: true };
}

export function getConsumiblesCategories(rowsOrGroups = []) {
  const rows = Array.isArray(rowsOrGroups)
    ? rowsOrGroups.flatMap((x) => (Array.isArray(x?.data) ? x.data : [x]))
    : [];

  const set = new Set();

  rows.forEach((row) => {
    const agr = normalizeAgrupador(row);
    const label = makeAgrupadorLabel(agr.Agr1, agr.Agr2);
    if (label) set.add(label);
  });

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function filterConsumiblesByCategory(rows = [], category = "") {
  const cat = normUpper(category);

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const agr = normalizeAgrupador(row);
    const label = makeAgrupadorLabel(agr.Agr1, agr.Agr2);
    return !cat || normUpper(label) === cat;
  });
}

export function searchConsumibles(rows = [], query = "") {
  const q = normUpper(query);

  if (!q) return Array.isArray(rows) ? rows : [];

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const searchText =
      row?.searchText ||
      normUpper(
        `${row?.Categoria || row?.categoria || ""} ${row?.Agr1 || ""} ${row?.Agr2 || ""} ${row?.Material || row?.material || ""} ${row?.Description || row?.description || ""}`,
      );

    return searchText.includes(q);
  });
}
