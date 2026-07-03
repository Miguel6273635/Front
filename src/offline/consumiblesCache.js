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

function canonicalAgr1ByCobertura(coberturaTipo = "BASICA") {
  const cobertura = normalizeCoberturaTipo(coberturaTipo || "BASICA");

  if (cobertura === "MEDIA") return "MEDIO";
  if (cobertura === "SEMI") return "SEMI";

  return "BASICO";
}

function detectCoberturaFromAgr1(agr1 = "") {
  const value = normUpper(agr1);

  if (value.includes("MEDIO") || value.includes("MEDIA")) {
    return "MEDIA";
  }

  if (
    value.includes("SEMI") ||
    value.includes("SEMIFULL") ||
    value.includes("SEMI FULL") ||
    value.includes("SEMI-FULL") ||
    value.includes("SEMICOMPLETO") ||
    value.includes("SEMI_COMPLETO") ||
    value.includes("SEMI COMPLETO")
  ) {
    return "SEMI";
  }

  return "BASICA";
}

function coberturaLevel(coberturaTipo = "BASICA") {
  const cobertura = normalizeCoberturaTipo(coberturaTipo || "BASICA");

  if (cobertura === "SEMI") return 3;
  if (cobertura === "MEDIA") return 2;

  return 1;
}

function rowCompatibleWithCobertura(row = {}, coberturaTipo = "BASICA") {
  const rowAgr1 = pickFirst(row, [
    "Agr1",
    "AGR1",
    "agr1",
    "Agrupador1",
    "agrupador1",
    "Categoria",
    "categoria",
  ]);

  const rowCobertura = detectCoberturaFromAgr1(rowAgr1);
  const targetCobertura = normalizeCoberturaTipo(coberturaTipo || "BASICA");

  return coberturaLevel(rowCobertura) <= coberturaLevel(targetCobertura);
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
      normalized.Unidad,
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

export async function saveConsumiblesGroup({
  coberturaTipo = "BASICA",
  agr1,
  agr2,
  rows = [],
}) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo || "BASICA");
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
    const cobertura = normalizeCoberturaTipo(coberturaTipo || "BASICA");
    const Agr1 = normUpper(agr1);
    const Agr2 = normUpper(agr2);
    const key = GROUP_KEY(cobertura, Agr1, Agr2);
    const raw = await AsyncStorage.getItem(key);

    if (!raw) {
      return {
        cobertura,
        Agr1,
        Agr2,
        label: makeAgrupadorLabel(Agr1, Agr2),
        updatedAt: null,
        count: 0,
        data: [],
      };
    }

    const parsed = JSON.parse(raw);
    const data = Array.isArray(parsed?.data) ? parsed.data : [];

    return {
      ...parsed,
      cobertura,
      Agr1: parsed?.Agr1 || Agr1,
      Agr2: parsed?.Agr2 || Agr2,
      label: parsed?.label || makeAgrupadorLabel(Agr1, Agr2),
      data,
      count: data.length,
    };
  } catch (e) {
    console.log("[CONSUMIBLES CACHE] Error leyendo grupo:", e?.message || e);

    return {
      cobertura: normalizeCoberturaTipo(coberturaTipo || "BASICA"),
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
  const cobertura = normalizeCoberturaTipo(coberturaTipo || "BASICA");
  const agrupadoresBase = getAgrupadoresByCobertura(cobertura);
  const index = await loadIndex();
  const indexedGroups = Object.values(index?.[cobertura] || {});
  const groupMap = new Map();

  agrupadoresBase.forEach((agr) => {
    const Agr1 = normUpper(agr?.Agr1 || agr?.Agrupador1 || "");
    const Agr2 = normUpper(agr?.Agr2 || agr?.Agrupador2 || "");

    if (!Agr1 || !Agr2) return;

    groupMap.set(makeAgrupadorKey(Agr1, Agr2), {
      Agr1,
      Agr2,
      label: agr?.label || makeAgrupadorLabel(Agr1, Agr2),
    });
  });

  indexedGroups.forEach((agr) => {
    const Agr1 = normUpper(agr?.Agr1 || agr?.Agrupador1 || "");
    const Agr2 = normUpper(agr?.Agr2 || agr?.Agrupador2 || "");

    if (!Agr1 || !Agr2) return;

    groupMap.set(makeAgrupadorKey(Agr1, Agr2), {
      Agr1,
      Agr2,
      label: agr?.label || makeAgrupadorLabel(Agr1, Agr2),
    });
  });

  const groups = [];

  for (const agr of Array.from(groupMap.values())) {
    const group = await loadConsumiblesGroup({
      coberturaTipo: cobertura,
      agr1: agr.Agr1,
      agr2: agr.Agr2,
    });

    groups.push(group);
  }

  const all = groups.flatMap((g) => g.data || []);
  const updatedAt =
    groups
      .map((g) => g.updatedAt)
      .filter(Boolean)
      .sort()
      .pop() || null;

  return {
    ok: true,
    cobertura,
    coverageKey: cobertura,
    updatedAt,
    count: all.length,
    cachedCount: all.length,
    groups: groups.sort((a, b) =>
      String(a?.label || "").localeCompare(String(b?.label || "")),
    ),
    data: all,
  };
}

export async function loadConsumiblesCatalog(coberturaTipo = "BASICA") {
  return await loadConsumiblesByCobertura(coberturaTipo);
}

export async function saveConsumiblesCatalog(
  rows = [],
  coberturaTipo = "BASICA",
  options = {},
) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo || "BASICA");
  const forceAgr1FromCoverage = !!options?.forceAgr1FromCoverage;
  const forcedAgr1 = forceAgr1FromCoverage
    ? canonicalAgr1ByCobertura(cobertura)
    : "";

  const arr = Array.isArray(rows) ? rows : [];
  const normalized = [];
  const byGroup = new Map();

  arr.forEach((row) => {
    const forced = {};

    if (forcedAgr1) {
      forced.Agr1 = forcedAgr1;
      forced.Agrupador1 = forcedAgr1;
    }

    const normalizedRow = normalizeConsumibleRow(row, forced);

    if (!normalizedRow.Material && !normalizedRow.Description) return;

    normalized.push(normalizedRow);

    const agr = normalizeAgrupador(normalizedRow);

    if (!agr.Agr1 || !agr.Agr2) return;

    const key = makeAgrupadorKey(agr.Agr1, agr.Agr2);
    const list = byGroup.get(key) || [];

    list.push(normalizedRow);
    byGroup.set(key, list);
  });

  let count = 0;
  const groups = [];

  for (const [, list] of byGroup.entries()) {
    const first = list[0];

    const saved = await saveConsumiblesGroup({
      coberturaTipo: cobertura,
      agr1: first.Agr1,
      agr2: first.Agr2,
      rows: list,
    });

    count += saved.count || 0;
    groups.push(saved);
  }

  return {
    ok: count > 0,
    cobertura,
    coverageKey: cobertura,
    updatedAt: Date.now(),
    count,
    cachedCount: count,
    groups,
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

    return !cat || normUpper(label) === cat || normUpper(row?.Categoria) === cat;
  });
}

export function searchConsumibles(rows = [], query = "") {
  const q = normUpper(query);

  if (!q) return Array.isArray(rows) ? rows : [];

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const searchText =
      row?.searchText ||
      normUpper(
        `${row?.Categoria || row?.categoria || ""} ${
          row?.Agr1 || row?.Agrupador1 || ""
        } ${row?.Agr2 || row?.Agrupador2 || ""} ${
          row?.Material || row?.material || ""
        } ${
          row?.Description ||
          row?.description ||
          row?.Descripcion ||
          row?.descripcion ||
          ""
        } ${row?.Unidad || row?.unidad || ""}`,
      );

    return searchText.includes(q);
  });
}

export function extractConsumiblesRowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.data?.d?.results)) return payload.data.d.results;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;

  return [];
}

export async function seedConsumiblesFromJsonPayload(
  payload,
  coberturaTipo = null,
) {
  const rows = extractConsumiblesRowsFromPayload(payload);

  if (!rows.length) {
    return {
      ok: false,
      reason: "json_sin_materiales",
      count: 0,
      cachedCount: 0,
      results: [],
    };
  }

  const coverages = coberturaTipo
    ? [normalizeCoberturaTipo(coberturaTipo)]
    : ["BASICA", "MEDIA", "SEMI"];

  const results = [];

  for (const coverageKey of coverages) {
    const coverageRows = rows.filter((row) =>
      rowCompatibleWithCobertura(row, coverageKey),
    );

    if (!coverageRows.length) continue;

    const saved = await saveConsumiblesCatalog(coverageRows, coverageKey, {
      forceAgr1FromCoverage: true,
    });

    results.push(saved);
  }

  const total = results.reduce((acc, item) => acc + Number(item?.count || 0), 0);

  return {
    ok: total > 0,
    count: total,
    cachedCount: total,
    results,
  };
}

export default {
  clearConsumiblesCatalog,
  extractConsumiblesRowsFromPayload,
  filterConsumiblesByCategory,
  getConsumiblesCategories,
  getConsumiblesLastSync,
  loadConsumiblesByCobertura,
  loadConsumiblesCatalog,
  loadConsumiblesGroup,
  normalizeConsumibleRow,
  normalizeConsumiblesRows,
  saveConsumiblesCatalog,
  saveConsumiblesGroup,
  searchConsumibles,
  seedConsumiblesFromJsonPayload,
};