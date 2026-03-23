// src/services/tbmkyPdfTemplate.js

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const xBox = (cond) => (cond ? `<span class="xb">X</span>` : `<span class="xb"></span>`);

// ✅ equipo fijo elevadores
const equipoChecks = (_equipoId) => ({
  elevadores: true,
  escaleras: false,
  oficinas: false,
  almacen: false,
});

// Lista EPP en el mismo orden de tu formato
const EPP_ORDER = [
  "UNIFORME",
  "CASCO",
  "BARBIQUEJO",
  "LAMPARA",
  "POLVO",
  "LENTES",
  "BOTAS",
  "TAPONES",
  "SIST. ANTICAIDAS",
  "SOLDAR",
  "ANTICORTE",
  "NYLON",
  "NITRILO",
  "CARNAZA",
  "FAJA",
  "MOSQUETON",
  "BLOCK STOP",
  "L. VIDA VERTICAL",
];

// Síntomas del formato
const SINTOMAS_FORMATO = [
  "Dolor de cabeza",
  "Vértigo, zumbidos en la oreja",
  "Manos o pies temblorosos",
  "Fiebre",
  "Somnolencia",
  "Indigestión/diarrea",
];

function eppMark(eppSeleccionado, key, col /* 'M' | 'A' */) {
  const v = eppSeleccionado?.[key];
  return !!v?.[col];
}

// ✅ Round 1: "X" (no cuadrito) como tu formato
function xMark(cond) {
  return cond ? "X" : "";
}

function renderEppBlock(eppSel) {
  const first = EPP_ORDER.slice(0, 9);
  const second = EPP_ORDER.slice(9);

  const renderCell = (idx, key) => {
    const num = idx + 1;
    return `
      <table style="margin: 5px; width: 10%">
        <tr>
          <th rowspan="2" style="width: 40%; border: none"></th>
          <th style="width: 25%">M</th>
          <th style="width: 25%">A</th>
        </tr>
        <tr>
          <th style="height: 20px">${eppMark(eppSel, key, "M") ? "X" : ""}</th>
          <th>${eppMark(eppSel, key, "A") ? "X" : ""}</th>
        </tr>
        <tr>
          <th colspan="3" style="border: none; text-align: left">
            <br /> ${num}.${key}
          </th>
        </tr>
      </table>
    `;
  };

  return `
    <div style="display: flex">${first.map((k, i) => renderCell(i, k)).join("")}</div>
    <div style="display: flex">${second.map((k, i) => renderCell(i + 9, k)).join("")}</div>
  `;
}

function renderRound1(hasRiesgo) {
  const row = (a, b, c, d) => `
    <tr>
      <th style="width: 15px">${xMark(hasRiesgo(a))}</th>
      <th style="background-color: #c4bfbf">${esc(a)}</th>

      <th style="width: 15px">${xMark(hasRiesgo(b))}</th>
      <th style="background-color: #c4bfbf">${esc(b)}</th>

      <th style="width: 15px">${xMark(hasRiesgo(c))}</th>
      <th style="background-color: #c4bfbf">${esc(c)}</th>

      <th style="width: 15px">${xMark(hasRiesgo(d))}</th>
      <th style="background-color: #c4bfbf">${esc(d)}</th>
    </tr>
  `;

  return `
    ${row("CAIDAS AL MISMO NIVEL", "PROYECCION DE PARTICULAS QUIMICAS", "SOBRE EXPOSICION AL RUIDO", "POSTURAS INADECUADAS")}
    ${row("CAIDAS A DISTINTO NIVEL", "PROYECCION DE PARTICULAS INCANDECENTES", "GOLPES,CORTES CON OBJETO MOVIL", "DESLUBRAMIENTO/POCA ILUMINACIÓN")}
    ${row("CAIDAS OBJETOS MANIPULACION/DESPLOME", "PROYECCION PARTICULAS SOLIDAS", "GOLPES,CORTES CON OBJETO INMOVIL", "HORARIOS LARGOS / TRABAJO NOCTURNO")}
    ${row("DESPLOME DE MATERIALES/CARGAS", "ATROPELLAMIENTO POR VEHICULOS", "TRANSMISION MICROORGANISMOS COVID", "FATIGA MOVIMIENTOS REPETITIVOS")}
    ${row("CONTACTO CON SUPERFICIE CORTANTE", "ATRAPAMIENTO POR MAQUINARIA", "PERDIDA DEL EQUILIBRIO", "GASES Y VAPORES TOXICOS")}
    ${row("CONTACTO CON SUSTANCIAS QUIMICAS", "MOVIMIENTOS REPENTINOS DE MAQUINARIA", "GOLPE DE CALOR / DESMAYOS", "SOBREXPOSICION RADIACION IONIZANTE")}
    ${row("ELECTROCUCION", "SOBRE ESFUERZO", "PICADURAS DE INSECTO", "CONDICIONES CLIMATICAS")}
    <tr>
      <th style="width: 15px">${xMark(hasRiesgo("OTROS"))}</th>
      <th colspan="7" style="text-align: left">OTROS:</th>
    </tr>
  `;
}

function renderMedidasAcciones(medidas, acciones) {
  const m = (i, j) => esc((medidas?.[i]?.[j] ?? "").toString());
  const a = (i) => esc((acciones?.[i] ?? "").toString());

  const block = (idx) => `
    <tr>
      <th rowspan="3">${idx + 1}</th>
      <th colspan="2" class="left">${m(idx, 0)}</th>
      <th rowspan="3" style="height: 30px" class="left">${a(idx)}</th>
    </tr>
    <tr><th colspan="2" class="left">${m(idx, 1)}</th></tr>
    <tr><th colspan="2" class="left">${m(idx, 2)}</th></tr>
  `;

  return `${block(0)}${block(1)}${block(2)}`;
}

export function buildTbmkyHtml(payload) {
  const orderid = esc(payload.orderid);
  const fecha = esc(payload.fecha);
  const centro = esc(payload.centroTrabajo || "");
  const area = esc(payload.selectedAreaLabel || "");
  const jefe = esc(payload.jefeInmediato || "");
  const actividadDia = esc(payload.actividadDia || "");

  const trabajadores = Array.isArray(payload.trabajadores) ? payload.trabajadores : [];
  const t1 = trabajadores[0] || {};
  const t2 = trabajadores[1] || {};

  // ✅ fijo elevadores
  const equipoId = payload.equipoId || payload.equipoSeleccionado;
  const eq = equipoChecks(equipoId);

  const rutinaria = !!payload.rutinaria;
  const noRutinaria = !rutinaria;

  const sintomas = Array.isArray(payload.sintomas) ? payload.sintomas : [];
  const eppSel = payload.eppSeleccionado || {};

  // TOP 3
  const topR = payload.riesgosTopText || ["", "", ""];
  const causas = payload.causasTop || ["", "", ""];
  const medidas = payload.medidasTop || [
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
  ];
  const acciones = payload.acciones || ["", "", ""];

  // ✅ SOLO firma técnico (sin supervisor)
  const firmaTecnico = payload.firmaTecnico ? String(payload.firmaTecnico) : "";

  // Round 1
  const riesgosSeleccionadosIds = Array.isArray(payload.riesgosSeleccionadosIds) ? payload.riesgosSeleccionadosIds : [];
  const riesgosBD = Array.isArray(payload.riesgosBD) ? payload.riesgosBD : [];
  const selectedRiesgosText = new Set(
    riesgosBD
      .filter((r) => riesgosSeleccionadosIds.includes(r.id))
      .map((r) => String(r.riesgo || "").toUpperCase().trim())
  );

  const hasRiesgo = (txt) => selectedRiesgosText.has(String(txt).toUpperCase().trim());

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>PREDICCION DE RIESGOS</title>
  <style>
    @page { size: letter; margin: 0; }
    body { font-family: Arial, sans-serif; box-sizing: border-box; }
    .pagina {
      width: 612px;
      padding: 30px;
      margin: 0 auto 20px auto;
      background: white;
      position: relative;
      page-break-after: always;
      border: 1px solid #999;
    }
    table { width: 100%; border-collapse: collapse; }
    td { border: 1px solid #000; text-align: center; padding: 1px; font-size: 11px; font-weight: bold; }
    th { border: 1px solid #000; padding: 1px; text-align: center; font-size: 8px; font-weight: bold; }
    .xb {
      display: inline-flex;
      width: 14px;
      height: 14px;
      border: 1px solid #000;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 900;
      line-height: 1;
    }
    .sig {
      width: 100%;
      height: 90px;
      border: 1px solid #000;
      object-fit: contain;
    }
    .left { text-align: left !important; }
    .h8 { height: 8px; }
    .h15 { height: 15px; }
    .h20 { height: 20px; }
  </style>
</head>

<body>
  <!-- ==================== PAGINA 1 ==================== -->
  <div class="pagina">
    <table>
      <tr><th colspan="2"></th></tr>

      <tr>
        <th colspan="2" class="left">
          <strong>INSTRUCTIVO:</strong> <br />
          1.Todo el personal que realice TBM-KY, debe ser previamente capacitado por el Departamento de Seguridad e Higiene respecto a su llenado.<br />
          2.Este documento es de carácter obligatorio para la identificación y prevención de riesgos, este deberá ser llenado ANTES de realizar cualquier actividad rutinaria y / o no rutinaria.<br />
          3.Cuando hay cambios en las condiciones de trabajo, rotación de personal u otro riesgo no identificado en la ejecución de la tarea, se debe suspender la actividad reevaluando los riesgos y definiendo las contramedidas adicionales a implementar.<br />
          4.Es indispensable y obligatorio que la realización de este documento se haga directamente en el lugar de trabajo en el cual va a ejecutar sus funciones, evaluando, identificando y analizando las condiciones de su entorno cercano.<br />
          5.Si en el lugar de trabajo usted encuentra RIESGOS INMINENTES, pare actividad y avise inmediatamente a su jefe inmediato o al siguiente correo: AllSeguridad@melco.com.mx
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
      <tr>
        <th style="height: 8px">${fecha}</th>
      </tr>

      <tr>
        <td colspan="2" style="background-color: black; color: white">
          IDENTIFICACION DE AREA DE TRABAJO
        </td>
      </tr>
    </table>

    <div style="display: flex">
      <table style="margin: 5px; width: 30%"><tr><th>ELEVADORES</th><th style="width: 40%">${xBox(eq.elevadores)}</th></tr></table>
      <table style="margin: 5px; width: 30%"><tr><th>ESCALERAS</th><th style="width: 40%">${xBox(eq.escaleras)}</th></tr></table>
      <table style="margin: 5px; width: 30%"><tr><th>OFICINAS</th><th style="width: 40%">${xBox(eq.oficinas)}</th></tr></table>
      <table style="margin: 5px; width: 30%"><tr><th>ALMACEN / C. HERRAMIENTAS</th><th style="width: 40%">${xBox(eq.almacen)}</th></tr></table>
    </div>

    <div style="display: flex">
      <!-- SIN NÓMINA -->
      <table style="margin: 5px; width: 60%">
        <tr>
          <th>NOMBRE COMPLETO DE QUIEN REALIZA TBM-KY</th>
          <th style="width: 25%">CARGO</th>
        </tr>
        <tr>
          <th class="left">1.- ${esc(t1.nombre || "")}</th>
          <th>${esc(t1.cargo || "")}</th>
        </tr>
        <tr>
          <th class="left">2.- ${esc(t2.nombre || "")}</th>
          <th>${esc(t2.cargo || "")}</th>
        </tr>
      </table>

      <table style="margin: 5px; width: 40%">
        <tr>
          <th style="width: 50%">CENTRO DE TRABAJO:</th>
          <th class="left">MX-${centro}</th>
        </tr>
        <tr>
          <th>ÁREA DE TRABAJO:</th>
          <th class="left">${area}</th>
        </tr>
        <tr>
          <th>JEFE INMEDIATO:</th>
          <th class="left">${jefe}</th>
        </tr>
      </table>
    </div>

    <table>
      <th>
        <strong style="font-size: 7px">INDICA SI TU ACTIVIDAD ES RUTINARIA O NO RUTINARIA</strong>
        (Rutinaria: plan de trabajo mensual, No Rutinaria: fuera del plan mensual (Falla, solicitud de cliente))
      </th>
    </table>

    <div style="display: flex">
      <table style="margin: 5px auto; width: 30%"><tr><th style="height: 15px">RUTINARIA</th><th style="width: 40%">${xBox(rutinaria)}</th></tr></table>
      <table style="margin: 5px auto; width: 30%"><tr><th style="width: 50%">NO RUTINARIA</th><th>${xBox(noRutinaria)}</th></tr></table>
    </div>

    <table>
      <tr><th>ACTIVIDAD DEL DIA:</th><th style="width: 80%" class="left">${actividadDia}</th></tr>
      <tr><th></th></tr>
      <tr><th colspan="2" class="left">NOTA: Si tu actividad cambia de RUTINARIA a NO RUTINARIA, avisa a tu jefe inmediato para evaluar las condiciones</th></tr>
      <tr><th colspan="2"></th></tr>
      <tr><td colspan="2" style="background-color: black; color: white">CHEQUEO INDIVIDUAL DE SALUD</td></tr>
    </table>

    <div style="display: flex">
      <table style="margin: 5px; width: 60%">
        <tr><th>Si usted y sus compañeros tienen alguno de los siguientes sintomas marque con una (X)</th></tr>
      </table>
    </div>

    <div style="display: flex">
      <table style="margin: 5px; width: 50%">
        <tr>
          <td class="left">
            <strong>Auto chequeo individual:</strong><br /><br/>
            ${xBox(sintomas.includes(SINTOMAS_FORMATO[0]))} ${esc(SINTOMAS_FORMATO[0])}.<br />
            ${xBox(sintomas.includes(SINTOMAS_FORMATO[1]))} ${esc(SINTOMAS_FORMATO[1])}.<br />
            ${xBox(sintomas.includes(SINTOMAS_FORMATO[2]))} ${esc(SINTOMAS_FORMATO[2])}.<br />
            ${xBox(sintomas.includes(SINTOMAS_FORMATO[3]))} ${esc(SINTOMAS_FORMATO[3])}.<br />
            ${xBox(sintomas.includes(SINTOMAS_FORMATO[4]))} ${esc(SINTOMAS_FORMATO[4])}.<br />
            ${xBox(sintomas.includes(SINTOMAS_FORMATO[5]))} Indigestión / diarrea.
          </td>
        </tr>
      </table>

      <table style="margin: 5px; width: 50%">
        <tr><th colspan="2">RECORDEMOS QUE</th></tr>
        <tr>
          <th style="border-right: none; width: 50%"></th>
          <td class="left" style="border-left: none">
            <strong>PELIGRO</strong> <br />Trabajo en alturas. <br /><br />
            <strong>RIESGO</strong> <br />Caída a distinto nivel. <br />
            Caída de objetos.<br />Contactos eléctricos.
          </td>
        </tr>
      </table>
    </div>

    <div style="display: flex">
      <table style="margin: 5px; width: 50%"><tr><th>NOTA: En caso de presentar algun sintoma notifica a jefe de inmediato y servicio medico para tu valoración y seguimiento.</th></tr></table>
      <table style="margin: 5px; width: 50%"><tr><td>PELIGRO: CAUSA &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; RIESGO:CONSECUENCIA</td></tr></table>
    </div>

    <table>
      <tr><td colspan="2" style="background-color: black; color: white">EQUIPO DE PROTECCION PERSONAL:SELECCIONE LOS NECESARIOS PARA LA ACTIVIDAD</td></tr>
    </table>

    ${renderEppBlock(eppSel)}

    <table>
      <tr>
        <td colspan="8" style="text-align: center; vertical-align: top; height: 50px">
          ¿LA ACTIVIDAD REQUIERE ALGUNA HERRAMIENTA ESPECIAL O EQUIPO DE TRABAJO ESPECÍFICO?
        </td>
      </tr>
      <tr><td colspan="8" style="background-color: black; color: white">ROUND 1 (IDENTIFICACION DE TODOS LOS RIESGOS POSIBLES)</td></tr>

      ${renderRound1(hasRiesgo)}
    </table>
  </div>

  <!-- ==================== PAGINA 2 ==================== -->
  <div class="pagina">
    <table>
      <tr><td colspan="4" style="background-color: black; color: white">ROUND 2 (ESTUDIO DEL NUCLEO: RIESGOS MAS IMPORTANTES IDENTIFIQUE Y MARQUE TOP 3)</td></tr>
      <tr><th colspan="4"></th></tr>
      <tr><th colspan="4" class="left">Identifica los 4 riesgos a los que estarás más expuesto durantes tus actividades.(Es obligatorio llenar las 4 filas con un riesgo diferente)</th></tr>
      <tr><th colspan="4"></th></tr>

      <tr>
        <th style="width: 15px">No.</th>
        <th style="width: 15px">TOP</th>
        <th>RIESGOS</th>
        <th>¿POR QUE PUEDE PASAR?</th>
      </tr>

      <tr>
        <th>1</th>
        <th>${xBox(true)}</th>
        <th class="left">${esc(topR[0] || "")}</th>
        <th class="left">${esc(causas[0] || "")}</th>
      </tr>
      <tr>
        <th>2</th>
        <th>${xBox(true)}</th>
        <th class="left">${esc(topR[1] || "")}</th>
        <th class="left">${esc(causas[1] || "")}</th>
      </tr>
      <tr>
        <th>3</th>
        <th>${xBox(true)}</th>
        <th class="left">${esc(topR[2] || "")}</th>
        <th class="left">${esc(causas[2] || "")}</th>
      </tr>
      <tr>
        <th>4</th>
        <th></th>
        <th class="left"></th>
        <th class="left"></th>
      </tr>

      <tr><th colspan="4"></th></tr>
      <tr><th colspan="4" class="left">En la columna TOP enumera del 1 al 3 los riesgos más importantes en orden de más gravedad o probabilidad de que ocurra.</th></tr>

      <tr><td colspan="4" style="background-color: black; color: white">ROUND 3 (MEDIDAS DE CONTROL:SUGIERA MEDIDAS CONCRETAS )</td></tr>
      <tr><th colspan="4"></th></tr>
      <tr><th colspan="4" class="left">De los tres riesgos enumerados en la columna TOP coloque las medidas de control necesarias para cada uno.</th></tr>
      <tr><th colspan="4"></th></tr>

      <tr>
        <th>No.</th>
        <th colspan="2">MEDIDAS DE CONTROL A IMLEMENTAR</th>
        <th>(ACCION AREALIZAR)</th>
      </tr>

      ${renderMedidasAcciones(medidas, acciones)}
    </table>

    <!-- ROUND 4 + FIRMAS: SOLO TECNICO -->
    <table>
      <tr>
        <td colspan="2" style="background-color: black; color: white; width: 50%">ROUND 4 (ACCIONES A REALIZAR, SEÑALAR Y LLAMAR)</td>
        <th rowspan="4" style="width: 10%"></th>
        <td colspan="2" style="background-color: black; color: white">FIRMA TECNICO</td>
      </tr>

      <tr>
        <th style="width: 5%">1</th>
        <th class="left">${esc(acciones?.[0] || "")}</th>
        <th colspan="2">
          ${
            firmaTecnico
              ? `<img class="sig" src="data:image/png;base64,${firmaTecnico}" />`
              : `<div class="sig"></div>`
          }
        </th>
      </tr>

      <tr>
        <th style="width: 5%">2</th>
        <th class="left">${esc(acciones?.[1] || "")}</th>
        <th colspan="2"></th>
      </tr>

      <tr>
        <th style="width: 5%">3</th>
        <th class="left">${esc(acciones?.[2] || "")}</th>
        <th colspan="2"></th>
      </tr>
    </table>

    <div style="display: flex">
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
      <tr>
        <th>
          Es mejor perder un minuto en la vida que la vida en un minuto, priorizar la seguridad sobre la prisa puede marcar la diferencia entre realizar tus actividades sano y regresar a casa o sufriri un accidente.
        </th>
      </tr>
    </table>

    <p style="font-size: 7px; text-align: right">TLA-SHO-FRT-004.1</p>
  </div>
</body>
</html>`;
}
