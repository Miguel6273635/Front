// src/utils/tbmkyPdf.js
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Genera y comparte el PDF del TBM/KY usando tu plantilla HTML tal cual.
 * Pasas tus estados; el util arma el HTML e invoca expo-print.
 *
 * Campos esperados:
 * {
 *   fecha, equipoSeleccionado, trabajadores, centroTrabajo,
 *   selectedAreaLabel, jefeInmediato, actividadDia, rutinaria,
 *   sintomas, eppSeleccionado,
 *   // Para ROUND 1 puedes pasar:
 *   //   a) riesgosSeleccionadosText: string[]
 *   //   o b) riesgosSeleccionadosIds: number[] y riesgosBD: {id, riesgo}[]
 *   riesgosSeleccionadosText, riesgosSeleccionadosIds, riesgosBD,
 *   riesgosTopText, causasTop, medidasTop, acciones,
 *   firmaTecnico, firmaSupervisor
 * }
 */
export async function generarTbmkyPdf(payload) {
  const html = buildHtml(normalizarPayload(payload));
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    dialogTitle: 'Compartir TBM-KY (PDF)',
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
  return uri;
}

/* ================= ROUND 1: helpers para marcar los cuadritos ================= */

// Normaliza texto: quita acentos, signos, compacta espacios y tolera "DE"
const rmAccents = (s)=> String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const norm = (s)=> rmAccents(String(s||'').toUpperCase())
  .replace(/[^A-Z0-9\/ ]+/g, ' ')     // quita comas, puntos, etc.
  .replace(/\s+DE\s+/g, ' ')          // tolera "DE" opcional
  .replace(/\s+/g, ' ')
  .trim();

// Etiquetas EXACTAS como aparecen en tu plantilla (mismo orden y renglones)
const R1_ROWS = [
  ['CAIDAS AL MISMO NIVEL','PROYECCION DE PARTICULAS QUIMICAS','SOBRE EXPOSICION AL RUIDO','POSTURAS INADECUADAS'],
  ['CAIDAS A DISTINTO NIVEL','PROYECCION DE PARTICULAS INCANDECENTES','GOLPES,CORTES CON OBJETO MOVIL','DESLUBRAMIENTO/POCA ILUMINACIÓN'],
  ['CAIDAS OBJETOS MANIPULACION/DESPLOME','PROYECCION PARTICULAS SOLIDAS','GOLPES,CORTES CON OBJETO INMOVIL','HORARIOS LARGOS / TRABAJO NOCTURNO'],
  ['DESPLOME DE MATERIALES/CARGAS','ATROPELLAMIENTO POR VEHICULOS','TRANSMISION MICROORGANISMOS COVID','FATIGA MOVIMIENTOS REPETITIVOS'],
  ['CONTACTO CON SUPERFICIE CORTANTE','ATRAPAMIENTO POR MAQUINARIA','PERDIDA DEL EQUILIBRIO','GASES Y VAPORES TOXICOS'],
  ['CONTACTO CON SUSTANCIAS QUIMICAS','MOVIMIENTOS REPENTINOS DE MAQUINARIA','GOLPE DE CALOR / DESMAYOS','SOBREXPOSICION RADIACION IONIZANTE'],
  ['ELECTROCUCION','SOBRE ESFUERZO','PICADURAS DE INSECTO','CONDICIONES CLIMATICAS'],
];

const R1_LABELS_SET = new Set(R1_ROWS.flat().map(norm));

// Par de celdas: [cuadro 15px con X] + [etiqueta gris]
const mkCell = (label, selectedCanon) =>
  `<th style="width: 15px">${selectedCanon.has(norm(label)) ? 'X' : ''}</th>` +
  `<th style="background-color: #c4bfbf">${label}</th>`;

// Genera toda la tabla de ROUND 1 (con "¿Herramienta especial?" + cabecera + filas + OTROS)
function renderRound1(riesgosSeleccionadosText, esc) {
  const sel = (riesgosSeleccionadosText || []).map(norm);
  const selectedCanon = new Set(sel);
  const otrosList = (riesgosSeleccionadosText || []).filter(s => !R1_LABELS_SET.has(norm(s)));
  const otros = esc(otrosList.join(', '));

  const rowsHtml = R1_ROWS
    .map(row => `<tr>${row.map(label => mkCell(label, selectedCanon)).join('')}</tr>`)
    .join('\n');

  return `
  <table>
    <tr>
      <td colspan="8" style="text-align: center; vertical-align: top; height: 50px">
        ¿LA ACTIVIDAD REQUIERE ALGUNA HERRAMIENTA ESPECIAL O EQUIPO DE TRABAJO ESPECÍFICO?
      </td>
    </tr>
    <tr>
      <td colspan="8" style="background-color: black; color: white">
        ROUND 1 (IDENTIFICACION DE TODOS LOS RIESGOS POSIBLES)
      </td>
    </tr>
    ${rowsHtml}
    <tr>
      <th style="width: 15px"></th>
      <th colspan="7" style="text-align: left">OTROS: ${otros}</th>
    </tr>
  </table>`;
}

/* ===================== Internos comunes ===================== */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/\n/g,'<br/>');

const toDataUrl = (b64) => (b64 ? `data:image/png;base64,${b64}` : '');
const chk = (cond) => (cond ? 'X' : '&nbsp;');

const renderEquipo = (label, on) => `
  <table style="margin: 5px; width: 30%">
    <tr>
      <th>${label}</th>
      <th style="width: 40%">${on ? 'X' : ''}</th>
    </tr>
  </table>
`;

const renderEPP = (label, estado) => `
  <table style="margin: 5px; width: 10%">
    <tr>
      <th rowspan="2" style="width: 40%; border: none"></th>
      <th style="width: 25%">M</th>
      <th style="width: 25%">A</th>
    </tr>
    <tr>
      <th style="height: 20px">${chk(estado?.M)}</th>
      <th>${chk(estado?.A)}</th>
    </tr>
    <tr>
      <th colspan="3" style="border: none; text-align: left"><br />${label}</th>
    </tr>
  </table>
`;

function normalizarPayload(p) {
  // Derivar textos de ROUND 1 si no vinieron listos
  let riesgosSeleccionadosText = p.riesgosSeleccionadosText;
  if ((!riesgosSeleccionadosText || !riesgosSeleccionadosText.length) && p.riesgosSeleccionadosIds && p.riesgosBD) {
    riesgosSeleccionadosText = p.riesgosSeleccionadosIds
      .map(id => p.riesgosBD.find(r => r.id === id)?.riesgo)
      .filter(Boolean);
  }
  return { ...p, riesgosSeleccionadosText };
}

function buildHtml({
  fecha,
  equipoSeleccionado, trabajadores,
  centroTrabajo, selectedAreaLabel, jefeInmediato, actividadDia,
  rutinaria, sintomas, eppSeleccionado,
  riesgosSeleccionadosText, riesgosTopText, causasTop, medidasTop, acciones,
  firmaTecnico, firmaSupervisor,
}) {
  // Equipos (los 4 que trae tu formato)
  const equiposHtml = [
    renderEquipo('ELEVADORES', equipoSeleccionado === 'elevadores'),
    renderEquipo('ESCALERAS',  equipoSeleccionado === 'escaleras'),
    renderEquipo('OFICINAS',   equipoSeleccionado === 'oficinas'),
    renderEquipo('ALMACEN / C. HERRAMIENTAS', equipoSeleccionado === 'almacen'),
  ].join('\n');

  // Orden de EPP tal cual tu plantilla (ojo: clave 9 es "SIST.ANTICAIDAS" sin espacio)
  const EPP_ORDER = [
    'UNIFORME','CASCO','BARBIQUEJO','LAMPARA','POLVO','LENTES','BOTAS','TAPONES',
    'SIST.ANTICAIDAS','SOLDAR','ANTICORTE','NYLON','NITRILO','CARNAZA','FAJA',
    'MOSQUETON','BLOCK STOP','L. VIDA VERTICAL'
  ];
  const getEstadoEpp = (k) =>
    eppSeleccionado[k] || eppSeleccionado[k.replace('SIST.ANTICAIDAS','SIST. ANTICAIDAS')] || {};

  const eppHtml = EPP_ORDER.map(k => renderEPP(k, getEstadoEpp(k))).join('\n');

  // Sintomas
  const has = (t) => sintomas?.includes(t);

  // Round 2 filas (la 4 queda vacía)
  const round2Row = (i) => `
    <tr>
      <th>${i+1}</th>
      <th>${i<3 ? (i+1) : ''}</th>
      <th>${esc(riesgosTopText?.[i] || '')}</th>
      <th>${esc(causasTop?.[i] || '')}</th>
    </tr>
  `;
  // Round 3 bloque
  const round3Block = (i) => `
    <tr>
      <th rowspan="3">${i+1}</th>
      <th colspan="2">${esc(medidasTop?.[i]?.[0] || '')}</th>
      <th rowspan="3" style="height: 30px">${esc(acciones?.[i] || '')}</th>
    </tr>
    <tr><th colspan="2">${esc(medidasTop?.[i]?.[1] || '')}</th></tr>
    <tr><th colspan="2">${esc(medidasTop?.[i]?.[2] || '')}</th></tr>
  `;
  // Round 4 acciones + firmas (misma firma en las 3 filas, como en tu tabla)
  const firmasTecnicoImg = firmaTecnico ? `<img src="${toDataUrl(firmaTecnico)}" style="height:40px" />` : '';
  const firmasSupervisorImg = firmaSupervisor ? `<img src="${toDataUrl(firmaSupervisor)}" style="height:40px" />` : '';
  const accionesFirmasRows = [0,1,2].map(i => `
    <tr>
      <th style="width: 5%">${i+1}</th>
      <th>${esc(acciones?.[i] || '')}</th>
      <th>${firmasTecnicoImg}</th>
      <th>${firmasSupervisorImg}</th>
    </tr>
  `).join('\n');

  const t1 = trabajadores?.[0] || {};
  const t2 = trabajadores?.[1] || {};

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>PREDICCION DE RIESGOS</title>
  <style>
    @page { size: 612px auto; margin: 0; }
    body { font-family: Arial, sans-serif; box-sizing: border-box; }
    .pagina { width: 612px; padding: 30px; margin: 0 auto 20px auto; background: white; position: relative; page-break-after: always; border: 1px solid #999; }
    table { width: 100%; border-collapse: collapse; }
    td { border: 1px solid #000; text-align: center; padding: 1px; font-size: 11px; font-weight: bold; }
    th { border: 1px solid #000; padding: 1px; text-align: center; font-size: 8px; font-weight: bold; }
    img { image-rendering: -webkit-optimize-contrast; }
  </style>
</head>
<body>
  <div class="pagina">
    <table>
      <tr><th colspan="2"></th></tr>
      <tr>
        <th colspan="2" style="text-align: left">
          <strong>INSTRUCTIVO:</strong> <br />
          1.Todo el personal que realice TBM-KY, debe ser previamente capacitado por el Departamento de Seguridad e Higiene respecto a su llenado.<br />
          2.Este documento es de carácter obligatorio para la identificación y prevención de riesgos, este deberá ser llenado ANTES de realizar cualquier actividad rutinaria y / o no rutinaria.<br />
          3.Cuando hay cambios en las condiciones de trabajo, rotación de personal u otro riesgo no identificado en la ejecución de la tarea, se debe suspender la actividad reevaluando los riesgos y definiendo las contramedidas adicionales a implementar.<br />
          4. Es indispensable y obligatorio que la realización de este documento se haga directamente en el lugar de trabajo en el cual va a ejecutar sus funciones, evaluando, identificando y analizando las condiciones de su entorno cercano.<br />
          5.Si en el lugar de trabajo usted encuentra RIESGOS INMINENTES, pare actividad y avise inmediatamente a su jefe inmediato o alsiguiente correo: AllSeguridad@melco.com.mx
        </th>
      </tr>
      <tr><th colspan="2"></th></tr>
      <tr>
        <td rowspan="2">
          MITSUBISHI ELECTRIC DE MEXICO S.A. DE C.V.<br />
          TBM/KY PREDICCION DE RIESGOS (TLA-SHO-FRT-004.1)
        </td>
        <th style="width: 20%">Fecha:</th>
      </tr>
      <tr><th style="height: 8px">${esc(fecha || '')}</th></tr>
      <tr><td colspan="2" style="background-color: black; color: white">IDENTIFICACION DE AREA DE TRABAJO</td></tr>
    </table>

    <div style="display:flex">${equiposHtml}</div>

    <div style="display:flex">
      <table style="margin: 5px; width: 60%">
        <tr>
          <th>NOMBRE COMPLETO DE QUIEN REALIZA TBM-KY</th>
          <th style="width: 20%">CARGO</th>
          <th style="width: 20%">NOMINA</th>
        </tr>
        <tr>
          <th style="text-align: left">1.- ${esc(t1.nombre || '')}</th>
          <th>${esc(t1.cargo || '')}</th>
          <th>${esc(t1.nomina || '')}</th>
        </tr>
        <tr>
          <th style="text-align: left">2.- ${esc(t2.nombre || '')}</th>
          <th>${esc(t2.cargo || '')}</th>
          <th>${esc(t2.nomina || '')}</th>
        </tr>
      </table>
      <table style="margin: 5px; width: 40%">
        <tr><th style="width: 50%">CENTRO DE TRABAJO:</th><th style="text-align:left">${esc(centroTrabajo || '')}</th></tr>
        <tr><th>ÁREA DE TRABAJO:</th><th>${esc(selectedAreaLabel || '')}</th></tr>
        <tr><th>JEFE INMEDIATO:</th><th>${esc(jefeInmediato || '')}</th></tr>
      </table>
    </div>

    <table>
      <th>
        <strong style="font-size: 7px">INDICA SI TU ACTIVIDAD ES RUTINARIA O NO RUTINARIA</strong>
        (Rutinaria: plan de trabajo mensual, No Rutinaria: fuera del plan mensual (Falla, solicitud de cliente))
      </th>
    </table>
    <div style="display:flex">
      <table style="margin: 5px auto; width: 30%">
        <tr><th style="height: 15px">RUTINARIA</th><th style="width: 40%">${rutinaria ? 'X' : ''}</th></tr>
      </table>
      <table style="margin: 5px auto; width: 30%">
        <tr><th style="width: 50%">NO RUTINARIA</th><th>${!rutinaria ? 'X' : ''}</th></tr>
      </table>
    </div>

    <table>
      <tr><th>ACTIVIDAD DEL DIA:</th><th style="width: 80%">${esc(actividadDia || '')}</th></tr>
      <tr><th></th></tr>
      <tr><th colspan="2" style="text-align: left">NOTA: Si tu actividad cambia de RUTINARIA a NO RUTINARIA, avisa a tu jefe inmediato para evaluar las condiciones</th></tr>
      <tr><th colspan="2"></th></tr>
      <tr><td colspan="2" style="background-color: black; color: white">CHEQUEO INDIVIDUAL DE SALUD</td></tr>
    </table>

    <div style="display:flex">
      <table style="margin: 5px; width: 60%"><tr><th>Si usted y sus compañeros tienen alguno de los siguientes sintomas marque con una (X)</th></tr></table>
    </div>

    <div style="display:flex">
      <table style="margin: 5px; width: 50%">
        <tr>
          <td style="text-align: left">
            <strong>Auto chequeo individual:</strong><br />
            ${chk(has('Dolor de cabeza'))} Dolor de cabeza.<br />
            ${chk(has('Vértigo, zumbidos en la oreja'))} Vértigo, zumbidos en la oreja.<br />
            ${chk(has('Manos o pies temblorosos'))} Manos o pies temblorosos.<br />
            ${chk(has('Fiebre'))} Fiebre.<br />
            ${chk(has('Somnolencia'))} Somnolencia.<br />
            ${chk(has('Indigestión/diarrea'))} Indigestión / diarrea.
          </td>
        </tr>
      </table>
      <table style="margin: 5px; width: 50%">
        <tr><th colspan="2">RECORDEMOS QUE</th></tr>
        <tr>
          <th style="border-right: none; width: 50%"></th>
          <td style="text-align: left; border-left: none">
            <strong>PELIGRO</strong> <br />
            Trabajo en alturas. <br /><br /><strong>RIESGO</strong> <br />
            Caída a distinto nivel. <br />
            Caída de objetos.<br />
            Contactos eléctricos.
          </td>
        </tr>
      </table>
    </div>

    <div style="display:flex">
      <table style="margin: 5px; width: 50%"><tr><th>NOTA: En caso de presentar algun sintoma notifica a jefe de inmediato y servicio medico para tu valoración y seguimiento.</th></tr></table>
      <table style="margin: 5px; width: 50%"><tr><td>PELIGRO: CAUSA &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; RIESGO:CONSECUENCIA</td></tr></table>
    </div>

    <table><tr><td colspan="2" style="background-color: black; color: white">EQUIPO DE PROTECCION PERSONAL:SELECCIONE LOS NECESARIOS PARA LA ACTIVIDAD</td></tr></table>
    <div style="display:flex; flex-wrap: wrap">${eppHtml}</div>

    <!-- ROUND 1 dinámico con marcas -->
    ${renderRound1(riesgosSeleccionadosText, esc)}

  </div>

  <div class="pagina">
    <table>
      <tr><td colspan="4" style="background-color: black; color: white">ROUND 2 (ESTUDIO DEL NUCLEO: RIESGOS MAS IMPORTANTES IDENTIFIQUE Y MARQUE TOP 3)</td></tr>
      <tr><th colspan="4"></th></tr>
      <tr><th colspan="4" style="text-align:left">Identifica los 4 riesgos a los que estarás más expuesto durantes tus actividades.(Es obligatorio llenar las 4 filas con un riesgo diferente)</th></tr>
      <tr><th colspan="4"></th></tr>
      <tr><th style="width: 15px">No.</th><th style="width: 15px">TOP</th><th>RIESGOS</th><th>¿POR QUE PUEDE PASAR?</th></tr>
      ${round2Row(0)}
      ${round2Row(1)}
      ${round2Row(2)}
      ${round2Row(3)}
      <tr><th colspan="4"></th></tr>
      <tr><th colspan="4" style="text-align:left">En la columna TOP enumera del 1 al 3 los riesgos más importantes en orden de más gravedad o probabilidad de que ocurra.</th></tr>

      <tr><td colspan="4" style="background-color: black; color: white">ROUND 3 (MEDIDAS DE CONTROL:SUGIERA MEDIDAS CONCRETAS )</td></tr>
      <tr><th colspan="4"></th></tr>
      <tr><th colspan="4" style="text-align:left">De los tres riesgos enumerados en la columna TOP coloque las medidas de control necesarias para cada uno.</th></tr>
      <tr><th colspan="4"></th></tr>
      <tr><th>No.</th><th colspan="2">MEDIDAS DE CONTROL A IMLEMENTAR</th><th>(ACCION AREALIZAR)</th></tr>
      ${round3Block(0)}
      ${round3Block(1)}
      ${round3Block(2)}
    </table>

    <table>
      <tr>
        <td colspan="2" style="background-color: black; color: white; width: 50%">ROUND 4 (ACCIONES A REALIZAR, SEÑALAR Y LLAMAR)</td>
        <th rowspan="4" style="width: 10%"></th>
        <td colspan="2" style="background-color: black; color: white">FIRMAS COMPROMISO</td>
      </tr>
      ${accionesFirmasRows}
    </table>

    <div style="display:flex">
      <table style="margin: 5px; width: 60%"><tr><th>NOTA: DEBERAS REALIZAR EL SEÑALAR Y LLAMAR EN LAS ACCIONES ENLISTADAS EN EL ROUND 4</th></tr></table>
    </div>

    <table>
      <tr><th colspan="2">EN CASO DE CAMBIO DE CONDICIONES DE TRABAJO INDIQUE EN ESTE ESPACIO LOS NUEVOS RIESGOS Y MEDIDAS ADICIONALES A IMPLEMENTAR.</th></tr>
      <tr><th style="background-color: #c4bfbf">NUEVO RIESGO</th><th style="background-color: #c4bfbf">MEDIDA DE CONTROL</th></tr>
      <tr><th style="height: 9px"></th><th></th></tr>
      <tr><th style="height: 9px"></th><th></th></tr>
      <tr><th style="height: 9px"></th><th></th></tr>
      <tr><th style="height: 9px"></th><th></th></tr>
      <tr><th style="height: 9px"></th><th></th></tr>
      <tr><th style="height: 9px"></th><th></th></tr>
      <tr><th colspan="2" style="height: 20px"></th></tr>
    </table>

    <table style="margin-top: 30px">
      <tr><th>Es mejor perder un minuto en la vida que la vida en un minuto, priorizar la seguridad sobre la prisa puede marcar la diferencia entre realizar tus actividades sano y regresar a casa o sufriri un accidente.</th></tr>
    </table>
    <p style="font-size: 7px; text-align: right">TLA-SHO-FRT-004.1</p>
  </div>
</body>
</html>`;
}
