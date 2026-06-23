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

function encodeFilterValue(v) {
  return String(v ?? "").replace(/'/g, "''");
}

function getResults(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.d?.results)) return data.d.results;
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data?.data)) return data.data;
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

    /*
      Fallbacks por si tu backend ya tiene endpoints propios.
      No rompen si no existen; solo se prueban.
    */
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

export async function bootstrapPrefetchConsumiblesCatalogo(options = {}) {
  const cobertura = normalizeCoberturaTipo(options?.coberturaTipo || "BASICA");

  try {
    const net = await NetInfo.fetch();
    const online = !!(net?.isConnected && net?.isInternetReachable !== false);

    if (!online) {
      const cached = await loadConsumiblesByCobertura(cobertura);

      return {
        ok: false,
        reason: "offline",
        cobertura,
        cachedCount: cached?.count || 0,
      };
    }

    const agrupadores = getAgrupadoresByCobertura(cobertura);

    let total = 0;
    const groups = [];

    for (const agr of agrupadores) {
      const result = await fetchMaterialesPorAgrupador({
        Agr1: agr.Agr1,
        Agr2: agr.Agr2,
      });

      const saved = await saveConsumiblesGroup({
        coberturaTipo: cobertura,
        agr1: agr.Agr1,
        agr2: agr.Agr2,
        rows: result.rows || [],
      });

      total += saved.count || 0;

      groups.push({
        Agr1: agr.Agr1,
        Agr2: agr.Agr2,
        label: agr.label,
        ok: result.ok,
        count: saved.count || 0,
        error: result.error || null,
      });
    }

    console.log("[CONSUMIBLES PREFETCH] Guardado por agrupadores:", {
      cobertura,
      total,
      groups: groups.length,
    });

    return {
      ok: true,
      cobertura,
      count: total,
      groups,
      updatedAt: Date.now(),
    };
  } catch (e) {
    const cached = await loadConsumiblesByCobertura(cobertura);

    console.log(
      "[CONSUMIBLES PREFETCH] Error general:",
      e?.response?.data || e?.message || e,
    );

    return {
      ok: false,
      reason: "prefetch_consumibles_error",
      cobertura,
      error: e?.message || String(e),
      cachedCount: cached?.count || 0,
    };
  }
}

export default bootstrapPrefetchConsumiblesCatalogo;
