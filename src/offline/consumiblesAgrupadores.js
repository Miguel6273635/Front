// src/offline/consumiblesAgrupadores.js

/*
  Miguel Ángel Hernández Álvarez - 30/06/2026

  Objetivo:
  Definir y normalizar los agrupadores permitidos por cobertura para consumibles.

  Importante:
  - En SAP/JSON puede venir "BASICO", pero en la app usamos "BASICA".
  - En SAP/JSON puede venir "MEDIO", pero en la app usamos "MEDIA".
  - SEMI puede venir como "SEMI", "SEMIFULL", "SEMI FULL", "SEMICOMPLETO", etc.
  - Si la cobertura es MEDIA, también puede usar consumibles BASICOS.
  - Si la cobertura es SEMI, también puede usar consumibles BASICOS y MEDIOS.
*/

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

  MEDIA: [
    { Agr1: "MEDIO", Agr2: "FUSIBLE_TC" },
    { Agr1: "MEDIO", Agr2: "MECHAS" },
    { Agr1: "MEDIO", Agr2: "FOCOS" },
    { Agr1: "MEDIO", Agr2: "LAMPARA" },
    { Agr1: "MEDIO", Agr2: "LAMP_EMERG" },
    { Agr1: "MEDIO", Agr2: "BATERIA_RE" },
    { Agr1: "MEDIO", Agr2: "CAM_ACEITE" },

    { Agr1: "MEDIO", Agr2: "GRASAS" },
    { Agr1: "MEDIO", Agr2: "DIELECTRIC" },
    { Agr1: "MEDIO", Agr2: "ACEITE" },
    { Agr1: "MEDIO", Agr2: "TRAPO" },
    { Agr1: "MEDIO", Agr2: "PAPEL_LIJA" },
    { Agr1: "MEDIO", Agr2: "TORNILLOS" },
    { Agr1: "MEDIO", Agr2: "PERNOS" },
    { Agr1: "MEDIO", Agr2: "ARAN_CUER" },
  ],

  SEMI: [
    { Agr1: "SEMI", Agr2: "GRASAS" },
    { Agr1: "SEMI", Agr2: "DIELECTRIC" },
    { Agr1: "SEMI", Agr2: "ACEITE" },
    { Agr1: "SEMI", Agr2: "TRAPO" },
    { Agr1: "SEMI", Agr2: "PAPEL_LIJA" },
    { Agr1: "SEMI", Agr2: "TORNILLOS" },
    { Agr1: "SEMI", Agr2: "PERNOS" },
    { Agr1: "SEMI", Agr2: "ARAN_CUER" },
    { Agr1: "SEMI", Agr2: "FUSIBLE_TC" },
    { Agr1: "SEMI", Agr2: "MECHAS" },
    { Agr1: "SEMI", Agr2: "FOCOS" },
    { Agr1: "SEMI", Agr2: "LAMPARA" },
    { Agr1: "SEMI", Agr2: "LAMP_EMERG" },
    { Agr1: "SEMI", Agr2: "BATERIA_RE" },
    { Agr1: "SEMI", Agr2: "CAM_ACEITE" },

    { Agr1: "SEMIFULL", Agr2: "GRASAS" },
    { Agr1: "SEMIFULL", Agr2: "DIELECTRIC" },
    { Agr1: "SEMIFULL", Agr2: "ACEITE" },
    { Agr1: "SEMIFULL", Agr2: "TRAPO" },
    { Agr1: "SEMIFULL", Agr2: "PAPEL_LIJA" },
    { Agr1: "SEMIFULL", Agr2: "TORNILLOS" },
    { Agr1: "SEMIFULL", Agr2: "PERNOS" },
    { Agr1: "SEMIFULL", Agr2: "ARAN_CUER" },
    { Agr1: "SEMIFULL", Agr2: "FUSIBLE_TC" },
    { Agr1: "SEMIFULL", Agr2: "MECHAS" },
    { Agr1: "SEMIFULL", Agr2: "FOCOS" },
    { Agr1: "SEMIFULL", Agr2: "LAMPARA" },
    { Agr1: "SEMIFULL", Agr2: "LAMP_EMERG" },
    { Agr1: "SEMIFULL", Agr2: "BATERIA_RE" },
    { Agr1: "SEMIFULL", Agr2: "CAM_ACEITE" },

    { Agr1: "SEMIFULL", Agr2: "ACEITERAS" },
    { Agr1: "SEMIFULL", Agr2: "BALASTRAS" },
    { Agr1: "SEMIFULL", Agr2: "BAND_MOTOR" },
    { Agr1: "SEMIFULL", Agr2: "BOTONES" },
    { Agr1: "SEMIFULL", Agr2: "CONTACTOR" },
    { Agr1: "SEMIFULL", Agr2: "ESCOBILLAS" },
    { Agr1: "SEMIFULL", Agr2: "GUIAS" },
    { Agr1: "SEMIFULL", Agr2: "RODAMIENTOS" },
    { Agr1: "SEMIFULL", Agr2: "SENSORES" },
  ],
};

export function normalizeCoberturaTipo(value) {
  const s = normUpper(value);

  if (!s || s === "SIN COBERTURA") return "BASICA";

  if (
    s.includes("BASICA") ||
    s.includes("BASICO") ||
    s.includes("BASIC")
  ) {
    return "BASICA";
  }

  if (
    s.includes("MEDIA") ||
    s.includes("MEDIO") ||
    s.includes("MEDIUM")
  ) {
    return "MEDIA";
  }

  if (
    s.includes("SEMI") ||
    s.includes("SEMIFULL") ||
    s.includes("SEMI FULL") ||
    s.includes("SEMI-FULL") ||
    s.includes("SEMICOMPLETO") ||
    s.includes("SEMI_COMPLETO") ||
    s.includes("SEMI COMPLETO") ||
    s.includes("SEMI-COMPLETO")
  ) {
    return "SEMI";
  }

  return s;
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
      agr?.categoria ||
      "",
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
      agr?.familia ||
      "",
  );

  return {
    Agr1,
    Agr2,
    key: makeAgrupadorKey(Agr1, Agr2),
    label: makeAgrupadorLabel(Agr1, Agr2),
  };
}

function uniqueAgrupadores(rows = []) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const agr = normalizeAgrupador(row);

    if (!agr.Agr1 || !agr.Agr2) continue;

    map.set(agr.key, agr);
  }

  return Array.from(map.values()).sort((a, b) =>
    String(a.label || "").localeCompare(String(b.label || "")),
  );
}

function getCoberturaLevel(coberturaTipo) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);

  if (cobertura === "SEMI") return 3;
  if (cobertura === "MEDIA") return 2;

  return 1;
}

function getCoberturaAgr1Aliases(coberturaTipo) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);

  if (cobertura === "BASICA") {
    return new Set(["BASICA", "BASICO", "BASIC"]);
  }

  if (cobertura === "MEDIA") {
    return new Set(["MEDIA", "MEDIO", "MEDIUM"]);
  }

  if (cobertura === "SEMI") {
    return new Set([
      "SEMI",
      "SEMIFULL",
      "SEMI FULL",
      "SEMI-FULL",
      "SEMICOMPLETO",
      "SEMI_COMPLETO",
      "SEMI COMPLETO",
      "SEMI-COMPLETO",
    ]);
  }

  return new Set([cobertura]);
}

function getCoberturaFromAgr1(agr1) {
  const normalizedAgr1 = normUpper(agr1);

  if (
    normalizedAgr1.includes("SEMI") ||
    normalizedAgr1.includes("SEMIFULL") ||
    normalizedAgr1.includes("SEMI FULL") ||
    normalizedAgr1.includes("SEMI-FULL") ||
    normalizedAgr1.includes("SEMICOMPLETO") ||
    normalizedAgr1.includes("SEMI_COMPLETO") ||
    normalizedAgr1.includes("SEMI COMPLETO") ||
    normalizedAgr1.includes("SEMI-COMPLETO")
  ) {
    return "SEMI";
  }

  if (
    normalizedAgr1.includes("MEDIA") ||
    normalizedAgr1.includes("MEDIO") ||
    normalizedAgr1.includes("MEDIUM")
  ) {
    return "MEDIA";
  }

  if (
    normalizedAgr1.includes("BASICA") ||
    normalizedAgr1.includes("BASICO") ||
    normalizedAgr1.includes("BASIC")
  ) {
    return "BASICA";
  }

  return normalizedAgr1 || "BASICA";
}

function isAgr1CompatibleWithCobertura(agr1, coberturaTipo) {
  const normalizedAgr1 = normUpper(agr1);
  const aliases = getCoberturaAgr1Aliases(coberturaTipo);

  if (aliases.has(normalizedAgr1)) return true;

  for (const alias of aliases) {
    if (normalizedAgr1.includes(alias)) return true;
  }

  return false;
}

export function getAgrupadoresByCobertura(coberturaTipo) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);
  const exact = AGRUPADORES_POR_COBERTURA[cobertura];

  if (Array.isArray(exact) && exact.length > 0) {
    return uniqueAgrupadores(exact);
  }

  return uniqueAgrupadores([
    ...(AGRUPADORES_POR_COBERTURA.BASICA || []),
    ...(AGRUPADORES_POR_COBERTURA.MEDIA || []),
    ...(AGRUPADORES_POR_COBERTURA.SEMI || []),
  ]);
}

export function getAllAgrupadores() {
  return uniqueAgrupadores([
    ...(AGRUPADORES_POR_COBERTURA.BASICA || []),
    ...(AGRUPADORES_POR_COBERTURA.MEDIA || []),
    ...(AGRUPADORES_POR_COBERTURA.SEMI || []),
  ]);
}

export function getAgrupadoresAcumuladosByCobertura(coberturaTipo) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);

  if (cobertura === "SEMI") {
    return uniqueAgrupadores([
      ...(AGRUPADORES_POR_COBERTURA.BASICA || []),
      ...(AGRUPADORES_POR_COBERTURA.MEDIA || []),
      ...(AGRUPADORES_POR_COBERTURA.SEMI || []),
    ]);
  }

  if (cobertura === "MEDIA") {
    return uniqueAgrupadores([
      ...(AGRUPADORES_POR_COBERTURA.BASICA || []),
      ...(AGRUPADORES_POR_COBERTURA.MEDIA || []),
    ]);
  }

  return uniqueAgrupadores(AGRUPADORES_POR_COBERTURA.BASICA || []);
}

export function isAgrupadorAllowed(row, coberturaTipo) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);
  const current = normalizeAgrupador(row);

  if (!current.Agr1) return false;

  if (isAgr1CompatibleWithCobertura(current.Agr1, cobertura)) {
    return true;
  }

  const rowCobertura = getCoberturaFromAgr1(current.Agr1);

  if (getCoberturaLevel(rowCobertura) <= getCoberturaLevel(cobertura)) {
    return true;
  }

  const allowed = getAgrupadoresByCobertura(cobertura);
  const allowedKeys = new Set(allowed.map((x) => x.key));

  if (allowedKeys.has(current.key)) return true;

  if (!cobertura || cobertura === "BASICA") {
    return isAgr1CompatibleWithCobertura(current.Agr1, "BASICA");
  }

  return false;
}

export default {
  AGRUPADORES_POR_COBERTURA,
  getAgrupadoresAcumuladosByCobertura,
  getAgrupadoresByCobertura,
  getAllAgrupadores,
  isAgrupadorAllowed,
  makeAgrupadorKey,
  makeAgrupadorLabel,
  normUpper,
  normalizeAgrupador,
  normalizeCoberturaTipo,
};