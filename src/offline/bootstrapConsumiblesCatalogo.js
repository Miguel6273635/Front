// src/offline/bootstrapConsumiblesCatalogo.js
import NetInfo from "@react-native-community/netinfo";

import api from "../services/api";
import {
  loadConsumiblesByCobertura,
  saveConsumiblesGroup,
} from "./consumiblesCache";
import {
  getAgrupadoresByCobertura,
  normalizeCoberturaTipo,
} from "./consumiblesAgrupadores";

const DEFAULT_TIMEOUT_MS = 90_000;

function safeStr(v) {
  return String(v ?? "").trim();
}

function encodeFilterValue(v) {
  return safeStr(v).replace(/'/g, "''");
}

function getResults(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.d?.results)) return data.d.results;
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.results)) return data.data.results;
  if (Array.isArray(data?.data?.d?.results)) return data.data.d.results;

  return [];
}

function makeCandidateUrls({ Agr1, Agr2 }) {
  const a1 = encodeFilterValue(Agr1);
  const a2 = encodeFilterValue(Agr2);

  const filterAgrupador =
    `$filter=Agrupador1 eq '${a1}' and Agrupador2 eq '${a2}'&$format=json`;

  const filterAgr =
    `$filter=Agr1 eq '${a1}' and Agr2 eq '${a2}'&$format=json`;

  const filterLower =
    `$filter=agrupador1 eq '${a1}' and agrupador2 eq '${a2}'&$format=json`;

  return [
    `/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet?${filterAgrupador}`,
    `/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet?${filterAgr}`,
    `/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet?${filterLower}`,
    `/api/catalogos/materiales-cobertura?agr1=${encodeURIComponent(
      Agr1,
    )}&agr2=${encodeURIComponent(Agr2)}`,
    `/api/materiales/cobertura?agr1=${encodeURIComponent(
      Agr1,
    )}&agr2=${encodeURIComponent(Agr2)}`,
    `/api/consumibles/catalogo?agr1=${encodeURIComponent(
      Agr1,
    )}&agr2=${encodeURIComponent(Agr2)}`,
  ];
}

async function fetchMaterialesPorAgrupador({ Agr1, Agr2 }) {
  const urls = makeCandidateUrls({ Agr1, Agr2 });
  let lastError = null;

  for (const url of urls) {
    try {
      console.log("[CONSUMIBLES PREFETCH] Consultando agrupador:", {
        Agr1,
        Agr2,
        url,
      });

      const res = await api.get(url, {
        timeout: DEFAULT_TIMEOUT_MS,
      });

      const rows = getResults(res?.data);

      if (Array.isArray(rows) && rows.length > 0) {
        console.log("[CONSUMIBLES PREFETCH] OK agrupador:", {
          Agr1,
          Agr2,
          rows: rows.length,
          url,
        });

        return {
          ok: true,
          url,
          rows,
        };
      }

      lastError = new Error(`Sin registros para ${Agr1}/${Agr2}`);
    } catch (e) {
      lastError = e;

      console.log(
        "[CONSUMIBLES PREFETCH] Falló agrupador:",
        { Agr1, Agr2, url },
        e?.response?.data || e?.message || e,
      );
    }
  }

  return {
    ok: false,
    rows: [],
    error: lastError?.message || String(lastError || "Sin datos"),
  };
}

async function getCachedSummary(cobertura) {
  try {
    const cached = await loadConsumiblesByCobertura(cobertura);

    return {
      cachedCount: Number(cached?.count || cached?.cachedCount || 0),
      cachedGroups: Array.isArray(cached?.groups) ? cached.groups.length : 0,
      updatedAt: cached?.updatedAt || null,
    };
  } catch (e) {
    console.log(
      "[CONSUMIBLES PREFETCH] No se pudo leer cache actual:",
      e?.message || e,
    );

    return {
      cachedCount: 0,
      cachedGroups: 0,
      updatedAt: null,
    };
  }
}

export async function bootstrapPrefetchConsumiblesCatalogo(options = {}) {
  const cobertura = normalizeCoberturaTipo(options?.coberturaTipo || "BASICA");

  try {
    const net = await NetInfo.fetch();
    const online = !!(net?.isConnected && net?.isInternetReachable !== false);

    if (!online) {
      const cached = await getCachedSummary(cobertura);

      console.log("[CONSUMIBLES PREFETCH] Offline. Se conserva cache:", {
        cobertura,
        cachedCount: cached.cachedCount,
      });

      return {
        ok: false,
        reason: "offline",
        cobertura,
        cachedCount: cached.cachedCount,
        cachedGroups: cached.cachedGroups,
        updatedAt: cached.updatedAt,
      };
    }

    const agrupadores = getAgrupadoresByCobertura(cobertura);

    let total = 0;
    let savedGroups = 0;
    let skippedGroups = 0;

    const groups = [];

    for (const agr of agrupadores) {
      const Agr1 = agr?.Agr1 || agr?.Agrupador1 || "";
      const Agr2 = agr?.Agr2 || agr?.Agrupador2 || "";
      const label = agr?.label || `${Agr1} - ${Agr2}`;

      if (!Agr1 || !Agr2) {
        skippedGroups += 1;

        groups.push({
          Agr1,
          Agr2,
          label,
          ok: false,
          count: 0,
          skipped: true,
          error: "Agrupador incompleto",
        });

        continue;
      }

      const result = await fetchMaterialesPorAgrupador({
        Agr1,
        Agr2,
      });

      if (!result.ok || !Array.isArray(result.rows) || !result.rows.length) {
        skippedGroups += 1;

        groups.push({
          Agr1,
          Agr2,
          label,
          ok: false,
          count: 0,
          skipped: true,
          error: result.error || "Sin datos nuevos, se conserva cache anterior",
        });

        console.log("[CONSUMIBLES PREFETCH] Grupo sin datos. No se sobrescribe cache:", {
          cobertura,
          Agr1,
          Agr2,
          error: result.error || "Sin datos",
        });

        continue;
      }

      const saved = await saveConsumiblesGroup({
        coberturaTipo: cobertura,
        agr1: Agr1,
        agr2: Agr2,
        rows: result.rows,
      });

      const savedCount = Number(saved?.count || 0);

      total += savedCount;
      savedGroups += 1;

      groups.push({
        Agr1,
        Agr2,
        label,
        ok: true,
        count: savedCount,
        skipped: false,
        error: null,
      });
    }

    const cached = await getCachedSummary(cobertura);

    console.log("[CONSUMIBLES PREFETCH] Guardado por agrupadores:", {
      cobertura,
      total,
      savedGroups,
      skippedGroups,
      cachedCount: cached.cachedCount,
      groups: groups.length,
    });

    if (total <= 0) {
      return {
        ok: false,
        reason: "sin_datos_nuevos_se_conserva_cache",
        cobertura,
        count: 0,
        savedGroups,
        skippedGroups,
        cachedCount: cached.cachedCount,
        cachedGroups: cached.cachedGroups,
        groups,
        updatedAt: cached.updatedAt,
      };
    }

    return {
      ok: true,
      cobertura,
      count: total,
      savedGroups,
      skippedGroups,
      cachedCount: cached.cachedCount,
      cachedGroups: cached.cachedGroups,
      groups,
      updatedAt: Date.now(),
    };
  } catch (e) {
    const cached = await getCachedSummary(cobertura);

    console.log(
      "[CONSUMIBLES PREFETCH] Error general:",
      e?.response?.data || e?.message || e,
    );

    return {
      ok: false,
      reason: "prefetch_consumibles_error",
      cobertura,
      error: e?.message || String(e),
      cachedCount: cached.cachedCount,
      cachedGroups: cached.cachedGroups,
      updatedAt: cached.updatedAt,
    };
  }
}

export default bootstrapPrefetchConsumiblesCatalogo;