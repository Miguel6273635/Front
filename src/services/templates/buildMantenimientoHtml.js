// src/templates/buildMantenimientoHtml.js
import { HTML_ELEVADORES } from "./mantenimiento_elevadores.template";
import { HTML_ESCALERAS } from "./mantenimiento_escaleras.template";
import { renderOperacionesAgrupadasHtml } from "./renderOperacionesHtml";

const safeStr = (v) => String(v ?? "").trim();

// 1x1 png transparente (fallback para no romper el HTML si no mandas logoDataUri)
const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

function normalizeImgSrc(maybeDataUri) {
  const s = safeStr(maybeDataUri);
  if (!s) return TRANSPARENT_PX;

  // Si ya viene como data URI (png/jpg/svg/etc), úsalo tal cual
  if (s.startsWith("data:image/")) return s;

  // Si por alguna razón te pasan SOLO base64 (sin encabezado),
  // lo convertimos a data:image/png;base64,
  // (si tu logo es jpg, pásalo ya como data:image/jpeg;base64,...)
  const looksLikeBase64 = /^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 100;
  if (looksLikeBase64) return `data:image/png;base64,${s}`;

  // No es data uri ni base64: fallback
  return TRANSPARENT_PX;
}

export function buildMantenimientoHtml({
  tipo, // "elevador" | "escalera"
  orden,
  operaciones,
  checkedMap,
  signatureData, // data:image/png;base64,...
  logoDataUri, // ✅ NUEVO: data:image/png;base64,... (recomendado)
}) {
  const orderid = safeStr(orden?.Orderid || orden?.orderid || "");

  const opsHtml = renderOperacionesAgrupadasHtml({
    orderid,
    operaciones,
    checkedMap,
  });

  const firmaHtml = signatureData
    ? `<img class="firmaImg" src="${signatureData}" />`
    : "";

  const base = String(tipo).toLowerCase().includes("escal")
    ? HTML_ESCALERAS
    : HTML_ELEVADORES;

  const logoSrc = normalizeImgSrc(logoDataUri);

  return base
    .replaceAll("{{LOGO_SRC}}", logoSrc)
    .replaceAll("{{ORDERID}}", orderid)
    .replaceAll("{{CLIENTE}}", safeStr(orden?.cliente || orden?.CustomerName || ""))
    .replaceAll("{{TECNICO}}", safeStr(orden?.tecnico || orden?.TechnicianName || ""))
    .replaceAll("{{FECHA}}", new Date().toLocaleDateString())
    .replaceAll("{{OPERACIONES_APP}}", opsHtml)
    .replaceAll("{{FIRMA_IMG}}", firmaHtml);
}
