// src/offline/consumiblesAgrupadores.js

/*
  Miguel Ángel Hernández Álvarez - 30/06/2026

  Objetivo:
  Definir los agrupadores permitidos por cobertura para consumibles.

  Importante:
  - En SAP/JSON puede venir "BASICO", pero en la app usamos "BASICA".
  - En SAP/JSON puede venir "MEDIO", pero en la app usamos "MEDIA".
  - SEMI puede venir como "SEMI", "SEMICOMPLETO", "SEMI_COMPLETO", etc.

  Mejora aplicada:
  Antes MEDIA y SEMI estaban vacíos y la app caía a BASICA.
  Eso provocaba que una orden con COBERTURA MEDIA no mostrara materiales MEDIO.
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

/*
  Agrupadores base por cobertura.

  BASICA:
  Vienen como Agrupador1 = BASICO en el JSON/SAP.

  MEDIA:
  Vienen como Agrupador1 = MEDIO en el JSON/SAP.

  SEMI:
  Se dejan agrupadores comunes para que la app no se quede sin categorías.
  Además, isAgrupadorAllowed tiene una validación flexible por Agrupador1,
  por lo que si el JSON trae Agrupador1 = SEMI con un Agrupador2 nuevo,
  también se permitirá.
*/
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

    /*
      Agrupadores extra frecuentes.
      No afectan si no existen en el JSON; solo sirven como fallback visual
      cuando el catálogo todavía no se cargó.
    */
    { Agr1: "MEDIO", Agr2: "GRASAS" },
    { Agr1: "MEDIO", Agr2: "ACEITE" },
    { Agr1: "MEDIO", Agr2: "TRAPO" },
    { Agr1: "MEDIO", Agr2: "PAPEL_LIJA" },
    { Agr1: "MEDIO", Agr2: "TORNILLOS" },
    { Agr1: "MEDIO", Agr2: "PERNOS" },
  ],

  SEMI: [
    /*
      Si en el JSON tus registros vienen con Agrupador1 = SEMI,
      estos grupos aparecerán como categorías fallback.

      Aunque no estén todos aquí, isAgrupadorAllowed también acepta
      cualquier Agrupador2 cuando Agrupador1 pertenece a SEMI.
    */
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
    s.includes("SEMICOMPLETO") ||
    s.includes("SEMI_COMPLETO") ||
    s.includes("SEMI COMPLETO")
  ) {
    return "SEMI";
  }

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

function uniqueAgrupadores(rows = []) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const agr = normalizeAgrupador(row);

    if (!agr.Agr1 || !agr.Agr2) continue;

    map.set(agr.key, agr);
  }

  return Array.from(map.values());
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
      "SEMICOMPLETO",
      "SEMI_COMPLETO",
      "SEMI COMPLETO",
      "SEMI-COMPLETO",
    ]);
  }

  return new Set([cobertura]);
}

function isAgr1CompatibleWithCobertura(agr1, coberturaTipo) {
  const normalizedAgr1 = normUpper(agr1);
  const aliases = getCoberturaAgr1Aliases(coberturaTipo);

  if (aliases.has(normalizedAgr1)) return true;

  /*
    Regla flexible:
    Si SAP/JSON manda textos largos como:
    - COBERTURA MEDIA
    - COBERTURA BASICA
    - MANTTO SEMI
    también deben ser compatibles.
  */
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

  /*
    Fallback:
    Si llega una cobertura desconocida, regresamos todos los agrupadores
    configurados para que la app no se quede sin modal.
  */
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

export function isAgrupadorAllowed(row, coberturaTipo) {
  const cobertura = normalizeCoberturaTipo(coberturaTipo);
  const current = normalizeAgrupador(row);

  if (!current.Agr1) return false;

  /*
    Regla principal:
    Si Agrupador1 coincide con la cobertura normalizada, se permite.
    Esto evita que se pierdan materiales nuevos del JSON solo porque
    Agrupador2 todavía no esté escrito en AGRUPADORES_POR_COBERTURA.
  */
  if (isAgr1CompatibleWithCobertura(current.Agr1, cobertura)) {
    return true;
  }

  const allowed = getAgrupadoresByCobertura(cobertura);
  const allowedKeys = new Set(allowed.map((x) => x.key));

  if (allowedKeys.has(current.key)) return true;

  /*
    Fallback controlado:
    Si por alguna razón la cobertura viene vacía o como SIN COBERTURA,
    permitimos BASICA para no bloquear el flujo del técnico.
  */
  if (!cobertura || cobertura === "BASICA") {
    return isAgr1CompatibleWithCobertura(current.Agr1, "BASICA");
  }

  return false;
}
