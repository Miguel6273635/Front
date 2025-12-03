import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
// (opcional para reducir peso y evitar páginas en blanco en equipos lentos)
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Genera el PDF "SOLICITUD DE COTIZACIÓN".
 * Acepta fotos como file:// o content:// y las convierte a data URL (base64).
*/
export async function generarSolicitudPdf(data) {
  // 1) Convertir fotos a data URLs (y comprimir un poco)
  const fotosDataUrls = await urisToDataUrls(data.fotos || []);

  // 2) Construir HTML con esas imágenes embebidas
  const html = buildHtml({ ...data, fotos: fotosDataUrls });

  // 3) Generar/compartir
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    dialogTitle: 'Compartir Solicitud de Cotización (PDF)',
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
  return uri;
} 

  

/* ---------------- helpers de imágenes ---------------- */

async function urisToDataUrls(uris) {
  const out = [];
  for (const rawUri of uris) {
    try {
      // (A) comprimir/redimensionar suave para PDFs más ligeros (~1200px de ancho máx)
      const normalized = await normalizeImage(rawUri);

      // (B) leer como base64
      const b64 = await FileSystem.readAsStringAsync(normalized, { encoding: FileSystem.EncodingType.Base64 });

      // infiere mime por extensión (fallback a jpeg)
      const mime = guessMime(normalized);
      out.push(`data:${mime};base64,${b64}`);
    } catch (e) {
      console.warn('No se pudo convertir imagen:', rawUri, e?.message);
    }
  }
  return out;
}

function guessMime(uri) {
  const u = (uri || '').toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function normalizeImage(uri) {
  // Cuando viene como content:// en Android, ImageManipulator lo resuelve a un file temporal
  try {
    const res = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],                 // <= ajusta si quieres más calidad/peso
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return res.uri;
  } catch {
    // Si falla, lee directo el original
    return uri;
  }
}

/* ---------------- resto igual (render HTML) ---------------- */

const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function td(content, extra='') { return `<th ${extra}>${content ?? ''}</th>`; }
function markYN(cond) { return cond ? 'X' : ''; }

function filasPartes10(lista, conComentarios = false) {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const item = lista[i] || {};
    rows.push(`
      <tr>
        ${td(String(i+1), 'style="width: 5px"')}
        ${td(esc(item.concepto || ''), 'colspan="2"')}
        ${td(esc(item.partePlano || ''), 'colspan="2"')}
        ${td(esc(item.cantidad || ''))}
        ${td('')} ${td('')} ${td('')}
        ${conComentarios ? td(esc(item.analisisFalla || ''), 'colspan="2"') : td('', 'colspan="2"')}
      </tr>
    `);
  }
  return rows.join('\n');
}

function imgsGrid(dataUrls=[]) {
  if (!dataUrls.length) return `<div style="height: 600px"></div>`;
  const cells = dataUrls.slice(0, 8).map(u =>
    `<div style="width:48%; margin:1%; border:1px solid #ddd; height:270px; display:flex; align-items:center; justify-content:center">
      <img src="${u}" style="max-width:100%; max-height:100%;"/>
    </div>`
  ).join('');
  return `<div style="display:flex; flex-wrap:wrap; justify-content:space-between; min-height: 600px">${cells}</div>`;
}

function buildHtml({
  fecha,
  cliente = {},
  equipo = {},
  reporte = {},
  partesElectronicas = [],
  partesMecanicas   = [],
  software = {},
  fotos = []
}) {
  const isVig   = (cliente.contrato || '').toLowerCase() === 'vigente';
  const isPost  = (cliente.contrato || '').toLowerCase().includes('post');
  const isRecup = (cliente.contrato || '').toLowerCase().includes('recup');

  const ub = (equipo.ubicacion || '').toLowerCase();
  const ubCM = ub.includes('cuarto');
  const ubCubo = ub.includes('cubo');
  const ubCabina = ub.includes('cabina');
  const ubFosa = ub.includes('fosa');

  const funSi = reporte.funcionando === true;
  const funNo = reporte.funcionando === false;

  const tipoEquipo = esc(equipo.tipo || '');

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>SOLICITUD DE COTIZACIÓN</title>
    <style>
      @page { size: 612px auto; margin: 0; }
      body { font-family: Arial, sans-serif; box-sizing: border-box; }
      .pagina { width: 612px; padding: 30px; margin: 0 auto 20px auto; background: white; position: relative; page-break-after: always; border: 1px solid #999; }
      table { width: 100%; border-collapse: collapse; }
      th { border: 1px solid #000; padding: 1px; text-align: center; font-size: 8px; font-weight: bold; }
      .header { font-size: 6px; text-align: left; border: none; }
      img { image-rendering: -webkit-optimize-contrast; }
    </style>
  </head>
  <body>
    <!-- HOJA 1 -->
    <div class="pagina">
      <div class="header">
        <table>
          <tr>
            <td>HOJA No. 1</td>
            <th style="border: none">
              MITSUBISHI ELECTRIC DE MÉXICO, S.A DE C.V<br /><br />SOLICITUD DE COTIZACIÓN
            </th>
            <td>ANEXO 8</td>
          </tr>
        </table>
      </div>
      <table style="margin: 10px auto; width: 40%">
        <tr>
          <th style="background-color: #e0e0e0">FECHA</th>
          <th style="width: 50%">${esc(fecha || '')}</th>
        </tr>
      </table>
      <table>
        <tr><th colspan="11" style="background-color: #999595ef">DATOS DEL CLIENTE</th></tr>
        <tr>
          <th colspan="2" style="background-color: #e0e0e0">RAZÓN SOCIAL</th>
          <th colspan="4" style="width: 40%">${esc(cliente.razonSocial||'')}</th>
          <th style="background-color: #e0e0e0">MX</th>
          <th style="width: 10%">${esc(cliente.mx||'')}</th>
          <th style="background-color: #e0e0e0">CM</th>
          <th colspan="2" style="width: 65px">${esc(cliente.cm||'')}</th>
        </tr>
        <tr>
          <th colspan="2" style="background-color: #e0e0e0">DIRECCION</th>
          <th colspan="9">${esc(cliente.direccion||'')}</th>
        </tr>
        <tr>
          <th colspan="2" style="background-color: #e0e0e0">SOLICITANTE</th>
          <th colspan="4">${esc(cliente.solicitante||'')}</th>
          <th colspan="2" style="background-color: #e0e0e0">PUESTO</th>
          <th colspan="3">${esc(cliente.puesto||'')}</th>
        </tr>
        <tr>
          <th colspan="2" style="background-color: #e0e0e0">EMAIL</th>
          <th colspan="4">${esc(cliente.email||'')}</th>
          <th colspan="2" style="background-color: #e0e0e0">TELEFONO</th>
          <th colspan="3">${esc(cliente.telefono||'')}</th>
        </tr>
        <tr>
          <th colspan="2" style="background-color: #e0e0e0">CONTRATO</th>
          <th style="background-color: #e0e0e0">VIGENTE</th>
          <th style="background-color: #e0e0e0">POST VENTA</th>
          <th colspan="2" style="background-color: #e0e0e0">RECUPERACION</th>
          <th colspan="2" style="background-color: #e0e0e0">COBERTURA</th>
          <th colspan="3">${esc(cliente.cobertura||'')}</th>
        </tr>
        <tr>
          <th></th><th>${markYN(isVig)}</th><th></th><th>${markYN(isPost)}</th><th></th><th>${markYN(isRecup)}</th>
          <th colspan="5"></th>
        </tr>

        <tr><th colspan="11" style="background-color: #999595ef">DATOS DEL EQUIPO</th></tr>
        <tr>
          <th colspan="2" style="background-color: #e0e0e0">TIPO DE EQUIPO</th>
          <th colspan="2">${tipoEquipo}</th>
          <th colspan="2" style="background-color: #e0e0e0">MAQUINA</th>
          <th colspan="2">${esc(equipo.maquina||'')}</th>
          <th style="background-color: #e0e0e0">CONTROL</th>
          <th colspan="2">${esc(equipo.control||'')}</th>
        </tr>
        <tr>
          <th colspan="2" style="background-color: #e0e0e0">CAPACIDAD</th>
          <th colspan="2">${esc(equipo.capacidad||'')}</th>
          <th colspan="2" style="background-color: #e0e0e0">VELOCIDAD</th>
          <th colspan="2">${esc(equipo.velocidad||'')}</th>
          <th style="background-color: #e0e0e0">VOLTAJE</th>
          <th colspan="2">${esc(equipo.voltaje||'')}</th>
        </tr>
        <tr>
          <th colspan="2" style="background-color: #e0e0e0">PISOS DE SERVICIO</th>
          <th colspan="2">${esc(equipo.pisosServicio||'')}</th>
          <th colspan="2" style="background-color: #e0e0e0">MODELO</th>
          <th colspan="2">${esc(equipo.modelo||'')}</th>
          <th style="background-color: #e0e0e0">No. DE EQUIPO</th>
          <th colspan="2">${esc(equipo.numeroEquipo||'')}</th>
        </tr>
        <tr>
          <th colspan="2" style="background-color: #e0e0e0">UBICACIÓN</th>
          <th style="background-color: #e0e0e0">CUARTO DE MAQUINAS</th><th>${markYN(ubCM)}</th>
          <th style="background-color: #e0e0e0">CUBO</th><th></th><th>${markYN(ubCubo)}</th>
          <th style="background-color: #e0e0e0">CABINA</th><th>${markYN(ubCabina)}</th>
          <th style="background-color: #e0e0e0">FOSA</th><th>${markYN(ubFosa)}</th>
        </tr>

        <tr><th colspan="11" style="background-color: #999595ef">DATOS DEL REPORTE/ESPECIFICACIONES DE FALLA</th></tr>
        <tr>
          <th colspan="2" rowspan="2" style="background-color: #e0e0e0">OBSERVACIONES</th>
          <th rowspan="2" colspan="7" style="text-align:left">${esc(reporte.observaciones||'')}</th>
          <th colspan="2" style="background-color: #e0e0e0">FUNCIONANDO</th>
        </tr>
        <tr><th>${markYN(funSi)}</th><th>${markYN(funNo)}</th></tr>

        <tr><th colspan="11" style="background-color: #999595ef">PARTES ELECTRÓNICAS Y/O ELÉCTRICAS</th></tr>
        <tr>
          <th rowspan="2" colspan="3" style="background-color: #e0e0e0">CONCEPTO</th>
          <th rowspan="2" colspan="2" style="background-color: #e0e0e0">No. DE PARTE-PLANO</th>
          <th rowspan="2" style="background-color: #e0e0e0">CANTIDAD</th>
          <th colspan="3" style="background-color: #e0e0e0">MANO DE OBRA CONSIDERADA</th>
          <th rowspan="2" colspan="2" style="background-color: #e0e0e0">COMENTARIOS</th>
        </tr>
        <tr>
          <th style="background-color: #e0e0e0">HORAS</th>
          <th style="background-color: #e0e0e0">PERSONAS</th>
          <th style="background-color: #e0e0e0">DÍAS</th>
        </tr>
        ${filasPartes10(partesElectronicas, true)}

        <tr>
          <th colspan="3" style="background-color: #e0e0e0; height: 50px">
            COMO DETERMINO CAMBIO DE PARTES <br />(ANALISIS DE FALLA)
          </th>
          <th colspan="8" style="text-align:left">${esc((partesElectronicas[0]?.analisisFalla) || '')}</th>
        </tr>

        <tr><th colspan="11" style="background-color: #999595ef">PARTES MECÁNICAS Y/O REPARACIÓN MAYOR</th></tr>
        <tr>
          <th rowspan="2" colspan="3" style="background-color: #e0e0e0">CONCEPTO</th>
          <th rowspan="2" colspan="2" style="background-color: #e0e0e0">No. DE PARTE-PLANO</th>
          <th rowspan="2" style="background-color: #e0e0e0">CANTIDAD</th>
          <th colspan="3" style="background-color: #e0e0e0">MANO DE OBRA CONSIDERADA</th>
          <th rowspan="2" colspan="2" style="background-color: #e0e0e0">COMENTARIOS</th>
        </tr>
        <tr>
          <th style="background-color: #e0e0e0">HORAS</th>
          <th style="background-color: #e0e0e0">PERSONAS</th>
          <th style="background-color: #e0e0e0">DÍAS</th>
        </tr>
        ${filasPartes10(partesMecanicas, false)}

        <tr><th colspan="11" style="background-color: #999595ef">MODIFICACIÓN DE SOFTWARE</th></tr>
        <tr>
          <th rowspan="3" colspan="2" style="background-color: #e0e0e0">CAMBIOS QUE SE <br />REQUIEREN</th>
          <th rowspan="2" colspan="2" style="background-color: #e0e0e0">CONCEPTO</th>
          <th colspan="3" style="background-color: #e0e0e0">MANO DE OBRA CONSIDERADA</th>
          <th colspan="2">ACTUAL</th>
          <th colspan="2">REQUERIDO</th>
        </tr>
        <tr>
          <th style="background-color: #e0e0e0">HORAS</th>
          <th style="background-color: #e0e0e0">PERSONAS</th>
          <th style="background-color: #e0e0e0">DÍAS</th>
          <th rowspan="3" colspan="2"></th>
          <th rowspan="3" colspan="2"></th>
        </tr>
        <tr>
          <th colspan="2" style="height: 50px">${esc(software.cambios||'')}</th>
          <th colspan="2">${esc(software.concepto||'')}</th>
        </tr>
        <tr>
          <th colspan="5" style="background-color: #e0e0e0">
            ¿DEPARTAMENTO DE MANTENIMIENTO CUENTA CON LA PC PARA REALIZARLO?
          </th>
          <th>SI</th><th>NO</th>
        </tr>

        <tr><th colspan="11" style="background-color: #999595ef">CHAPAS TIPO KABA</th></tr>
        <!-- … se deja igual … -->
      </table>

      <table style="margin-top: 50px">
        <tr>
          <th style="width: 100px; height: 50px"></th>
          <th style="border: none"></th>
          <th style="border: none">ELABORÓ</th>
          <th style="border: none"></th>
        </tr>
        <tr>
          <th style="border: none">Vo Bo JEFATURA</th>
          <th style="width: 100px; border: none"></th>
          <th style="width: 100px; border: none; border-top: 1px solid #000">SUPERVISOR</th>
        </tr>
      </table>

      <p style="font-size: 6px; text-align: left; margin-top: 30px">
        NOTA: PARA LOS TRABAJOS DE POLEAS, CABLES DE TRACCIÓN Y GOBERNADOR, SE DEBE ANEXAR EL REPORTE DE
        INSPECIIÓN Y/O DICTAMEN TÉCNICO EN LO POSIBLE FIRMADO POR EL CLIENTE.
      </p>
      <p style="font-size: 6px; text-align: left; margin-top: 10px">TLA-GMA-FRT-004</p>
      <p style="font-size: 6px; text-align: right; margin-top: 10px">HOJA No. 2 PARA FOTOGRAFÍAS</p>
    </div>

    <!-- HOJA 2 (imágenes) -->
    <div class="pagina">
      <div class="header">
        <table>
          <tr>
            <td>HOJA No. 2</td>
            <th style="border: none">MITSUBISHI ELECTRIC DE MÉXICO, S.A DE C.V<br /><br />SOLICITUD DE COTIZACIÓN</th>
            <td>ANEXO 8</td>
          </tr>
        </table>
      </div>
      <table style="margin: 10px auto; width: 40%">
        <tr><th style="background-color: #e0e0e0">FECHA</th><th style="width: 50%">${esc(fecha || '')}</th></tr>
      </table>
      <table>
        <tr><th style="background-color: #999595ef">IMÁGENES</th></tr>
        <tr>
          <th style="background-color: #999595ef">
            EN CASO DE ANEXAR FOTOGRAFIAS, ESTAS TENDRAN QUE SER VISIBLES…
          </th>
        </tr>
        <tr><th>${imgsGrid(fotos)}</th></tr>
      </table>
      <p style="font-size: 6px; text-align: left; margin-top: 50px">TLA-GMA-FRT-004</p>
      <p style="font-size: 6px; text-align: right">NOTA: LAS FOTOGRAFIAS ANEXADAS…</p>
    </div>
  </body>
</html>`;
}
