// src/offline/consumiblesCache.js

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getAgrupadoresByCobertura,
  isAgrupadorAllowed,
  makeAgrupadorLabel,
  normalizeAgrupador,
  normalizeCoberturaTipo,
  normUpper,
} from "./consumiblesAgrupadores";

const CONSUMIBLES_CACHE_KEY = "consumiblesCatalogo:v1";

/*
  Miguel Ángel Hernández Álvarez - 30/06/2026

  Objetivo:
  Cache offline central para el catálogo de consumibles.

  Este archivo soporta dos formas de uso:

  1) Cache por cobertura y agrupador:
     data[cobertura][Agrupador1__Agrupador2] = materiales[]

  2) Lectura lista para UI:
     loadConsumiblesByCobertura("BASICA" | "MEDIA" | "SEMI")
     regresa:
     {
       updatedAt,
       cobertura,
       data: materiales[],
       groups: grupos[]
     }

  Importante:
  Este archivo está preparado para leer materiales que vengan de SAP
  o del archivo json.json con estructura:
  {
    Material,
    Agrupador1,
    Agrupador2,
    Descripcion,
    Unidad
  }
*/

function safeStr(v) {
  return String(v ?? "").trim();
}

function safeUpper(v) {
  return normUpper ? normUpper(v) : safeStr(v).toUpperCase();
}

function pairKey(agr1, agr2) {
  return `${safeUpper(agr1)}__${safeUpper(agr2)}`;
}

function splitPairKey(key = "") {
  const [agr1 = "", agr2 = ""] = String(key || "").split("__");

  return {
    Agrupador1: safeUpper(agr1),
    Agrupador2: safeUpper(agr2),
  };
}

function normalizeCoverageKey(value) {
  return normalizeCoberturaTipo(value || "BASICA");
}

function normalizeDescription(row = {}) {
  return safeStr(
    row?.Descripcion ||
      row?.Description ||
      row?.description ||
      row?.Desc ||
      row?.desc ||
      row?.TextoMaterial ||
      row?.Maktx ||
      row?.maktx ||
      "",
  );
}

function normalizeMaterialCode(row = {}) {
  return safeStr(
    row?.Material ||
      row?.material ||
      row?.Codigo ||
      row?.codigo ||
      row?.Matnr ||
      row?.matnr ||
      "",
  );
}

function normalizeUnidad(row = {}) {
  return safeUpper(
    row?.Unidad ||
      row?.unidad ||
      row?.Unit ||
      row?.unit ||
      row?.Uom ||
      row?.uom ||
      row?.BaseUnit ||
      row?.RequirementQuantityUnitIso ||
      row?.RequirementQuantityUnit ||
      "",
  );
}

function normalizeMaterialRow(row = {}, agr1Fallback = "", agr2Fallback = "") {
  const grouped = normalizeAgrupador({
    Agrupador1:
      row?.Agrupador1 ||
      row?.agrupador1 ||
      row?.Agr1 ||
      row?.agr1 ||
      row?.Categoria ||
      row?.categoria ||
      agr1Fallback,
    Agrupador2:
      row?.Agrupador2 ||
      row?.agrupador2 ||
      row?.Agr2 ||
      row?.agr2 ||
      row?.Subcategoria ||
      row?.subcategoria ||
      row?.Familia ||
      row?.familia ||
      agr2Fallback,
  });

  const Material = normalizeMaterialCode(row);
  const Descripcion = normalizeDescription(row);
  const Unidad = normalizeUnidad(row);

  const Categoria =
    grouped?.label ||
    makeAgrupadorLabel(grouped?.Agr1 || agr1Fallback, grouped?.Agr2 || agr2Fallback);

  return {
    Id: safeStr(row?.Id || row?.id || row?.ID || ""),
    Material,
    Agrupador1: grouped?.Agr1 || safeUpper(agr1Fallback),
    Agrupador2: grouped?.Agr2 || safeUpper(agr2Fallback),
    Agr1: grouped?.Agr1 || safeUpper(agr1Fallback),
    Agr2: grouped?.Agr2 || safeUpper(agr2Fallback),
    Categoria,
    Description: Descripcion,
    Descripcion,
    Unidad,
    unidad: Unidad,
  };
}

function uniqBy(arr, keyFn) {
  const map = new Map();

  for (const x of Array.isArray(arr) ? arr : []) {
    const k = keyFn(x);

    if (!k) continue;
    if (!map.has(k)) map.set(k, x);
  }

  return Array.from(map.values());
}

function normalizeMaterialsList(rows = [], agr1Fallback = "", agr2Fallback = "") {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((r) => normalizeMaterialRow(r, agr1Fallback, agr2Fallback))
    .filter((x) => !!x.Material);

  return uniqBy(
    normalized,
    (x) =>
      `${x.Material}__${x.Descripcion}__${x.Agrupador1}__${x.Agrupador2}__${x.Unidad}`,
  );
}

function flattenCoverageData(coverageData = {}) {
  const out = [];

  const entries = Object.entries(
    coverageData && typeof coverageData === "object" ? coverageData : {},
  );

  for (const [key, value] of entries) {
    const pair = splitPairKey(key);
    const rows = Array.isArray(value) ? value : [];

    for (const row of rows) {
      out.push(
        normalizeMaterialRow(row, pair.Agrupador1 || row?.Agrupador1, pair.Agrupador2 || row?.Agrupador2),
      );
    }
  }

  return uniqBy(
    out,
    (x) =>
      `${x.Material}__${x.Descripcion}__${x.Agrupador1}__${x.Agrupador2}__${x.Unidad}`,
  );
}

function groupRowsForMeta(rows = []) {
  const groupsMap = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const agr = normalizeAgrupador(row);

    if (!agr.Agr1 || !agr.Agr2) continue;

    const key = agr.key;

    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        ...agr,
        Agrupador1: agr.Agr1,
        Agrupador2: agr.Agr2,
        count: 0,
      });
    }

    const current = groupsMap.get(key);
    current.count += 1;
  }

  return Array.from(groupsMap.values()).sort((a, b) =>
    String(a.label || "").localeCompare(String(b.label || "")),
  );
}

function buildCoverageDataFromRows(rows = [], coberturaTipo = "BASICA") {
  const cobertura = normalizeCoverageKey(coberturaTipo);
  const allowedRows = [];

  for (const raw of Array.isArray(rows) ? rows : []) {
    const normalized = normalizeMaterialRow(raw);

    if (!normalized.Material) continue;

    if (isAgrupadorAllowed(normalized, cobertura)) {
      allowedRows.push(normalized);
    }
  }

  const nextCoverage = {};

  for (const row of allowedRows) {
    const pk = pairKey(row.Agrupador1, row.Agrupador2);

    if (!nextCoverage[pk]) nextCoverage[pk] = [];
    nextCoverage[pk].push(row);
  }

  for (const key of Object.keys(nextCoverage)) {
    const pair = splitPairKey(key);
    nextCoverage[key] = normalizeMaterialsList(
      nextCoverage[key],
      pair.Agrupador1,
      pair.Agrupador2,
    );
  }

  return nextCoverage;
}

export async function loadConsumiblesCatalogo() {
  try {
    const raw = await AsyncStorage.getItem(CONSUMIBLES_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (!parsed || typeof parsed !== "object") {
      return { updatedAt: null, data: {} };
    }

    return {
      updatedAt: parsed?.updatedAt ?? null,
      data: parsed?.data && typeof parsed.data === "object" ? parsed.data : {},
    };
  } catch (e) {
    console.log("[CONSUMIBLES CACHE] loadConsumiblesCatalogo error:", e?.message || e);

    return { updatedAt: null, data: {} };
  }
}

export async function saveConsumiblesCatalogo(data) {
  const payload = {
    updatedAt: Date.now(),
    data: data && typeof data === "object" ? data : {},
  };

  await AsyncStorage.setItem(CONSUMIBLES_CACHE_KEY, JSON.stringify(payload));

  return payload;
}

export async function clearConsumiblesCatalogo() {
  try {
    await AsyncStorage.removeItem(CONSUMIBLES_CACHE_KEY);

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
    };
  }
}

export async function mergeConsumiblesPair({
  coverageKey,
  coberturaTipo,
  agr1,
  agr2,
  materials,
}) {
  const cov = normalizeCoverageKey(coverageKey || coberturaTipo || "BASICA");
  const a1 = safeUpper(agr1);
  const a2 = safeUpper(agr2);

  if (!cov || !a1 || !a2) return false;

  const pk = pairKey(a1, a2);
  const current = await loadConsumiblesCatalogo();

  const currentData = current?.data || {};
  const currentCoverage = currentData?.[cov] || {};

  const nextData = {
    ...currentData,
    [cov]: {
      ...currentCoverage,
      [pk]: normalizeMaterialsList(materials, a1, a2),
    },
  };

  await saveConsumiblesCatalogo(nextData);

  return true;
}

export async function mergeConsumiblesRowsByCobertura({
  coverageKey,
  coberturaTipo,
  rows,
}) {
  const cov = normalizeCoverageKey(coverageKey || coberturaTipo || "BASICA");
  const current = await loadConsumiblesCatalogo();

  const currentData = current?.data || {};
  const currentCoverage = currentData?.[cov] || {};
  const incomingCoverage = buildCoverageDataFromRows(rows, cov);

  const nextCoverage = {
    ...currentCoverage,
  };

  for (const [pk, materials] of Object.entries(incomingCoverage)) {
    const pair = splitPairKey(pk);
    nextCoverage[pk] = normalizeMaterialsList(
      [...(nextCoverage[pk] || []), ...(materials || [])],
      pair.Agrupador1,
      pair.Agrupador2,
    );
  }

  const nextData = {
    ...currentData,
    [cov]: nextCoverage,
  };

  await saveConsumiblesCatalogo(nextData);

  return {
    ok: true,
    coverageKey: cov,
    count: flattenCoverageData(nextCoverage).length,
    groups: groupRowsForMeta(flattenCoverageData(nextCoverage)),
  };
}

export async function saveConsumiblesByCobertura(coberturaTipo, rows = []) {
  const cov = normalizeCoverageKey(coberturaTipo || "BASICA");
  const current = await loadConsumiblesCatalogo();

  const currentData = current?.data || {};
  const nextCoverage = buildCoverageDataFromRows(rows, cov);

  const nextData = {
    ...currentData,
    [cov]: nextCoverage,
  };

  await saveConsumiblesCatalogo(nextData);

  const data = flattenCoverageData(nextCoverage);

  return {
    ok: true,
    cobertura: cov,
    coverageKey: cov,
    updatedAt: Date.now(),
    count: data.length,
    groups: groupRowsForMeta(data),
    data,
  };
}

export async function getConsumiblesByPair({ coverageKey, coberturaTipo, agr1, agr2 }) {
  try {
    const cov = normalizeCoverageKey(coverageKey || coberturaTipo || "BASICA");
    const a1 = safeUpper(agr1);
    const a2 = safeUpper(agr2);
    const pk = pairKey(a1, a2);

    const cached = await loadConsumiblesCatalogo();
    const arr = cached?.data?.[cov]?.[pk];

    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.log("[CONSUMIBLES CACHE] getConsumiblesByPair error:", e?.message || e);
    return [];
  }
}

export async function loadConsumiblesByCobertura(coberturaTipo = "BASICA") {
  try {
    const cov = normalizeCoverageKey(coberturaTipo || "BASICA");
    const cached = await loadConsumiblesCatalogo();

    const coverageData = cached?.data?.[cov] || {};
    let data = flattenCoverageData(coverageData);

    /*
      Fallback seguro:
      Si la cobertura no tiene datos todavía, regresamos lista vacía,
      pero sí regresamos groups con los agrupadores esperados.
      ConsumiblesFinalizacion podrá mostrar categorías aunque aún no haya cache.
    */
    const configuredGroups = getAgrupadoresByCobertura(cov).map((g) => ({
      ...g,
      Agrupador1: g.Agr1,
      Agrupador2: g.Agr2,
      count: data.filter((r) => normalizeAgrupador(r).key === g.key).length,
    }));

    const groupsFromData = groupRowsForMeta(data);
    const groupMap = new Map();

    for (const g of configuredGroups) groupMap.set(g.key, g);
    for (const g of groupsFromData) groupMap.set(g.key, g);

    return {
      ok: true,
      cobertura: cov,
      coverageKey: cov,
      updatedAt: cached?.updatedAt ?? null,
      data,
      count: data.length,
      cachedCount: data.length,
      groups: Array.from(groupMap.values()).sort((a, b) =>
        String(a.label || "").localeCompare(String(b.label || "")),
      ),
    };
  } catch (e) {
    console.log("[CONSUMIBLES CACHE] loadConsumiblesByCobertura error:", e?.message || e);

    return {
      ok: false,
      cobertura: normalizeCoverageKey(coberturaTipo || "BASICA"),
      coverageKey: normalizeCoverageKey(coberturaTipo || "BASICA"),
      updatedAt: null,
      data: [],
      count: 0,
      cachedCount: 0,
      groups: [],
      error: e?.message || String(e),
    };
  }
}

export async function getConsumiblesCatalogMeta() {
  try {
    const cached = await loadConsumiblesCatalogo();
    const data = cached?.data || {};
    const coverages = Object.keys(data);

    const summary = coverages.map((coverageKey) => {
      const rows = flattenCoverageData(data?.[coverageKey] || {});
      const groups = groupRowsForMeta(rows);

      return {
        coverageKey,
        cobertura: coverageKey,
        count: rows.length,
        groups: groups.length,
      };
    });

    return {
      updatedAt: cached?.updatedAt ?? null,
      coverages,
      summary,
    };
  } catch (e) {
    return {
      updatedAt: null,
      coverages: [],
      summary: [],
      error: e?.message || String(e),
    };
  }
}

export function buildConsumiblePairKey(agr1, agr2) {
  return pairKey(agr1, agr2);
}

export function getConsumiblesCategories(rows = []) {
  const categories = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const agr = normalizeAgrupador(row);

    if (!agr.Agr1 || !agr.Agr2) continue;

    const label = makeAgrupadorLabel(agr.Agr1, agr.Agr2);

    if (!categories.includes(label)) categories.push(label);
  }

  return categories.sort((a, b) => String(a).localeCompare(String(b)));
}

export function filterConsumiblesByCategory(rows = [], category = "") {
  const cat = safeUpper(category);

  if (!cat) return Array.isArray(rows) ? rows : [];

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const agr = normalizeAgrupador(row);
    const label = makeAgrupadorLabel(agr.Agr1, agr.Agr2);

    return (
      safeUpper(label) === cat ||
      safeUpper(row?.Categoria) === cat ||
      `${safeUpper(agr.Agr1)} - ${safeUpper(agr.Agr2)}` === cat ||
      `${safeUpper(agr.Agr1)}-${safeUpper(agr.Agr2)}` === cat
    );
  });
}

export function searchConsumibles(rows = [], query = "") {
  const q = safeUpper(query);

  if (!q) return Array.isArray(rows) ? rows : [];

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const fields = [
      row?.Material,
      row?.Descripcion,
      row?.Description,
      row?.Unidad,
      row?.Agrupador1,
      row?.Agrupador2,
      row?.Categoria,
    ]
      .map((x) => safeUpper(x))
      .filter(Boolean)
      .join(" ");

    return fields.includes(q);
  });
}

/*
  Utilidad para convertir un JSON OData completo:
  { d: { results: [...] } }
  a una lista de materiales normalizados.
*/
export function extractConsumiblesRowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.data?.d?.results)) return payload.data.d.results;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;

  return [];
}

export async function seedConsumiblesFromJsonPayload(payload, coberturaTipo = null) {
  const rows = extractConsumiblesRowsFromPayload(payload);

  if (!rows.length) {
    return {
      ok: false,
      reason: "json_sin_materiales",
      count: 0,
    };
  }

  /*
    Si no mandas coberturaTipo, guardamos por cada cobertura detectada
    desde Agrupador1:
    - BASICO => BASICA
    - MEDIO => MEDIA
    - SEMI => SEMI
  */
  if (!coberturaTipo) {
    const byCoverage = {
      BASICA: [],
      MEDIA: [],
      SEMI: [],
    };

    for (const row of rows) {
      const agr1 = safeUpper(row?.Agrupador1 || row?.Agr1 || "");

      if (agr1.includes("MEDIO") || agr1.includes("MEDIA")) {
        byCoverage.MEDIA.push(row);
      } else if (agr1.includes("SEMI")) {
        byCoverage.SEMI.push(row);
      } else {
        byCoverage.BASICA.push(row);
      }
    }

    const results = [];

    for (const [coverageKey, coverageRows] of Object.entries(byCoverage)) {
      if (!coverageRows.length) continue;

      const saved = await saveConsumiblesByCobertura(coverageKey, coverageRows);
      results.push(saved);
    }

    return {
      ok: results.some((r) => r?.ok),
      count: results.reduce((acc, r) => acc + Number(r?.count || 0), 0),
      results,
    };
  }

  return saveConsumiblesByCobertura(coberturaTipo, rows);
}

export default {
  buildConsumiblePairKey,
  clearConsumiblesCatalogo,
  extractConsumiblesRowsFromPayload,
  filterConsumiblesByCategory,
  getConsumiblesByPair,
  getConsumiblesCatalogMeta,
  getConsumiblesCategories,
  loadConsumiblesByCobertura,
  loadConsumiblesCatalogo,
  mergeConsumiblesPair,
  mergeConsumiblesRowsByCobertura,
  saveConsumiblesByCobertura,
  saveConsumiblesCatalogo,
  searchConsumibles,
  seedConsumiblesFromJsonPayload,
};
