import { Asset } from "expo-asset";
import { HTML_ELEVADORES } from "./mantenimiento_elevadores.template";
import { HTML_ESCALERAS } from "./mantenimiento_escaleras.template";
import { renderOperacionesAgrupadasHtml } from "./renderOperacionesHtml";

const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

const safeStr = (v) => String(v ?? "").trim();

function escapeHtml(str) {
  return safeStr(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeImgSrc(maybeDataUri) {
  const s = safeStr(maybeDataUri);
  if (!s) return "";

  if (s.startsWith("data:image/")) return s;

  // si te llega "base64 puro" de signature-canvas
  if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 100) {
    return `data:image/png;base64,${s}`;
  }

  return s;
}

async function getLogoDataUriFromAsset() {
  try {
    const asset = Asset.fromModule(require("../../../assets/imgDocs/logo.png"));
    await asset.downloadAsync();
    const localUri = asset.localUri || asset.uri;
    if (!localUri) return TRANSPARENT_PX;

    const FileSystem = await import("expo-file-system");
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return `data:image/png;base64,${base64}`;
  } catch (e) {
    console.warn("[buildMantenimientoHtml] No se pudo cargar logo:", e?.message || e);
    return TRANSPARENT_PX;
  }
}

function formatDMY(dateOrSap) {
  if (!dateOrSap) return "—";
  // soporta "/Date(....)/"
  if (typeof dateOrSap === "string" && dateOrSap.startsWith("/Date(")) {
    const ms = parseInt(dateOrSap.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) {
      const d = new Date(ms);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }
  }
  const d = new Date(dateOrSap);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function formatHM(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatElapsed(ms) {
  const n = Number(ms || 0);
  if (!n || n <= 0) return "—";
  const totalMin = Math.round(n / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function joinClienteNameFromAddress(addr) {
  const parts = [addr?.Name1, addr?.Name2, addr?.Name3, addr?.Name4]
    .map((x) => safeStr(x))
    .filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildFirmaHtml(signatureData) {
  const src = normalizeImgSrc(signatureData);
  if (!src) {
    return `<div class="firmaEmpty">Sin firma capturada</div>`;
  }
  return `<img class="firmaImg" src="${src}" alt="Firma del cliente" />`;
}

function buildConsumiblesHtml(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div style="color:#63718B;font-weight:800;">Sin consumibles</div>`;
  }

  const safe = (v) => escapeHtml(String(v ?? ""));

  const tr = rows
    .map((r, idx) => {
      const material = safe(r.material || r.Material || "");
      const descripcion = safe(r.descripcion || r.Description || r.texto || "");
      const cantidad = safe(r.cantidad ?? r.qty ?? "");
      const unidad = safe(r.unidad || r.uom || "");
      return `
        <tr>
          <td style="padding:6px;border:1px solid #DDE6F2;">${idx + 1}</td>
          <td style="padding:6px;border:1px solid #DDE6F2;">${material}</td>
          <td style="padding:6px;border:1px solid #DDE6F2;">${descripcion}</td>
          <td style="padding:6px;border:1px solid #DDE6F2;text-align:right;">${cantidad}</td>
          <td style="padding:6px;border:1px solid #DDE6F2;">${unidad}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr>
          <th style="padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">#</th>
          <th style="padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">Material</th>
          <th style="padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">Descripción</th>
          <th style="padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">Cant.</th>
          <th style="padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">U.M.</th>
        </tr>
      </thead>
      <tbody>${tr}</tbody>
    </table>
  `;
}

/**
 * buildMantenimientoHtml(args)
 * - orden: { Orderid, Equipment, start_date, finish_date, ... }
 * - address: objeto de ToAddresses (Name1..Name4)
 */
export async function buildMantenimientoHtml(args = {}) {
  const {
    tipo = "elevador",
    orden = {},
    address = null,

    operaciones = [],
    checkedMap = {},
    signatureData = null,

    // datos cliente capturados
    clienteEmail = "",
    clienteNombre = "",
    clienteCargo = "",

    // textos
    avisoCliente = "",
    notaTecnico = "",

    // cobertura / consumibles
    coberturaTipo = "",
    consumibles = [],

    // tiempos (ms)
    horaInicioMs = null,
    horaFinMs = null,
    tiempoTotalMs = null,
  } = args;

  const logoDataUri = await getLogoDataUriFromAsset();

  const isEsc = String(tipo).toLowerCase().includes("escal");
  let html = isEsc ? HTML_ESCALERAS : HTML_ELEVADORES;

  const orderid = safeStr(orden?.Orderid || orden?.OrderId || orden?.orderid || "");
  const equipment = safeStr(orden?.Equipment || orden?.equipment || "");

  const clienteFromAddr = address ? joinClienteNameFromAddress(address) : "";
  const cliente = safeStr(clienteFromAddr || orden?.cliente || "");

  const tecnico = safeStr(orden?.tecnico || orden?.Tecnico || "");

  const fecha = formatDMY(orden?.start_date || orden?.fecha || orden?.Fecha);

  const opsHtml = renderOperacionesAgrupadasHtml({
    orderid,
    operaciones,
    checkedMap,
  });

  const firmaHtml = buildFirmaHtml(signatureData);
  const consHtml = buildConsumiblesHtml(Array.isArray(consumibles) ? consumibles : []);

  const hIni = formatHM(horaInicioMs);
  const hFin = formatHM(horaFinMs);
  const elapsed = formatElapsed(tiempoTotalMs || (horaInicioMs && horaFinMs ? (horaFinMs - horaInicioMs) : 0));

  // reemplazos
  html = html.replaceAll("{{LOGO_DATA_URI}}", normalizeImgSrc(logoDataUri) || TRANSPARENT_PX);
  html = html.replaceAll("{{COBERTURA_TIPO}}", escapeHtml(coberturaTipo || "—"));

  html = html.replaceAll("{{ORDERID}}", escapeHtml(orderid || "—"));
  html = html.replaceAll("{{EQUIPMENT}}", escapeHtml(equipment || "—"));
  html = html.replaceAll("{{CLIENTE}}", escapeHtml(cliente || "—"));
  html = html.replaceAll("{{TECNICO}}", escapeHtml(tecnico || "—"));
  html = html.replaceAll("{{FECHA}}", escapeHtml(fecha || "—"));

  html = html.replaceAll("{{HORA_INICIO}}", escapeHtml(hIni));
  html = html.replaceAll("{{HORA_FIN}}", escapeHtml(hFin));
  html = html.replaceAll("{{TIEMPO_TOTAL}}", escapeHtml(elapsed));

  html = html.replaceAll("{{OPERACIONES_HTML}}", opsHtml);

  html = html.replaceAll("{{AVISO_CLIENTE}}", escapeHtml(avisoCliente || ""));
  html = html.replaceAll("{{NOTA_TECNICO}}", escapeHtml(notaTecnico || ""));

  html = html.replaceAll("{{CONSUMIBLES_HTML}}", consHtml);

  html = html.replaceAll("{{FIRMA_CLIENTE_HTML}}", firmaHtml);

  html = html.replaceAll("{{CLIENTE_EMAIL}}", escapeHtml(clienteEmail || ""));
  html = html.replaceAll("{{CLIENTE_NOMBRE}}", escapeHtml(clienteNombre || ""));
  html = html.replaceAll("{{CLIENTE_CARGO}}", escapeHtml(clienteCargo || ""));

  return html;
}