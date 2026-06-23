// src/offline/consumiblesAgrupadores.js

function safeStr(v) {
  return String(v ?? "").trim();
}

export function normUpper(v) {
  return safeStr(v)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const AGRUPADORES_POR_COBERTURA = {
  BASICA: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },
  ],

  /*
    Cuando tengas los agrupadores reales de MEDIA y SEMI,
    agrégalos aquí.

    Mientras estén vacíos, se usa BASICA como base para no bloquear el modal.
  */
  MEDIA: [],
  SEMI: [],
};

export function normalizeCoberturaTipo(value) {
  const s = normUpper(value);

  if (!s || s === "SIN COBERTURA") return "BASICA";

  if (s.includes("BASICA") || s.includes("BASICO")) return "BASICA";
  if (s.includes("MEDIA") || s.includes("MEDIO")) return "MEDIA";
  if (s.includes("SEMI")) return "SEMI";

  return s;
}

export function normalizeAgrupador(agr = {}) {
  const Agr1 = normUpper(
    agr?.Agr1 ||
      agr?.AGR1 ||
      agr?.agr1 ||
      agr?.Agrupador1 ||
      agr?.agrupador1 ||
      agr?.Grupo ||
      agr?.grupo ||
      agr?.Categoria ||
      agr?.categoria,
  );

  const Agr2 = normUpper(
    agr?.Agr2 ||
      agr?.AGR2 ||
      agr?.agr2 ||
      agr?.Agrupador2 ||
      agr?.agrupador2 ||
      agr?.Subcategoria ||
      agr?.subcategoria ||
      agr?.Familia ||
      agr?.familia,
  );

  return {
    Agr1,
    Agr2,
    key: makeAgrupadorKey(Agr1, Agr2),
    label: makeAgrupadorLabel(Agr1, Agr2),
  };
}

export function makeAgrupadorKey(agr1, agr2) {
  return `${normUpper(agr1)}:${normUpper(agr2)}`;
}

export function makeAgrupadorLabel(agr1, agr2) {
  const a1 = normUpper(agr1);
  const a2 = normUpper(agr2);

  if (a1 && a2) return `${a1} - ${a2}`;
  return a1 || a2 || "GENERAL";
}

export function getAgrupadoresByCobertura(coberturaTipo) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);
  const exact = AGRUPADORES_POR_COBERTURA[cobertura];

  if (Array.isArray(exact) && exact.length > 0) {
    return exact.map(normalizeAgrupador).filter((x) => x.Agr1 && x.Agr2);
  }

  /*
    Fallback seguro:
    Si MEDIA/SEMI aún no tienen lista configurada, usamos BASICA
    para que la app no se quede sin materiales.
  */
  return (AGRUPADORES_POR_COBERTURA.BASICA || [])
    .map(normalizeAgrupador)
    .filter((x) => x.Agr1 && x.Agr2);
}

export function isAgrupadorAllowed(row, coberturaTipo) {
  const allowed = getAgrupadoresByCobertura(coberturaTipo);
  const allowedKeys = new Set(allowed.map((x) => x.key));

  const current = normalizeAgrupador(row);

  return allowedKeys.has(current.key);
}
