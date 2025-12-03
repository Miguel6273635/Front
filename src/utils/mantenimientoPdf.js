// src/utils/mantenimientoPdf.js
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Plantillas que me pasaste, sin cambiar el layout.
 * OJO: el util reemplaza <img src="logo.png"> por tu logo en data URL.
 */
const TEMPLATE_ESCALERAS = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>REPORTE DE MANTENIMIENTO DE ESCALERAS</title>
    <style>
      body {
        width: 612px;
        margin: 0 auto;
        font-family: Arial, sans-serif;
        font-size: 8px;
        color: #000;
        box-sizing: border-box;
        border: 1px solid #999;
        padding: 60px;
      }
      /*HEADER*/
      .header-row {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        width: 65%;
      }

      .header-logo img {
        width: 150px;
      }
      .image img {
        width: 200px;
      }
      .header-company {
        text-align: left;
        font-weight: bold;
        font-size: 12px;
        display: flex;
        gap: 8px;
        width: 70%;
      }
      .header-divider {
        width: 2px;
        height: 60px;
        background-color: black;
        display: block;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        table-layout: fixed;
      }

      td {
        border: 1px solid #000;
        padding: 2px;
        text-align: left;
        font-size: 7px;
        font-weight: normal;
      }
      th {
        border: 1px solid #000;
        padding: 2px;
        text-align: center;
        font-size: 7px;
        font-weight: normal;
      }
      .linea {
        display: inline-block;
        border-bottom: 1px solid #000;
        height: 14px;
        vertical-align: center;
        margin-left: 5px;
        margin-right: 15px;
      }
      .label {
        display: inline-block;
      }
      h1 {
        text-align: center;
        font-size: 18px;
        font-weight: normal;
        margin-bottom: 0px;
      }
    </style>
  </head>
  <body>
    <div class="header-row">
      <div class="header-logo">
        <img src="logo.png" alt="Logo Mitsubishi" />
      </div>
      <div class="header-divider"></div>
      <div class="header-company">
        MITSUBISHI ELECTRIC <br />DE MÉXICO, S.A. DE C.V. <br />
      </div>
    </div>

    <div style="display: flex; gap: 5px; width: 100%">
      <table style="width: 40%">
        <tr>
          <td style="border: none; font-size: 6px">
            TELEFONOS DE EMERGENCIA 25HRS. Y ATENCIÓN A CLIENTES (CALL CENTER),
            EN ZONA METROPOLITANA E INTERIOR DEL PAIS:<br />
            800-926-3526&nbsp;&nbsp; 800-926-3563 &nbsp;&nbsp;55 5341-8512
          </td>
        </tr>
      </table>
      <table style="width: 15%">
        <tr>
          <th colspan="3">CONTRATO</th>
        </tr>
        <tr>
          <th style="height: 15px"></th>
          <th></th>
          <th></th>
        </tr>
      </table>
      <table style="width: 35%">
        <tr>
          <th colspan="5">ORDEN</th>
        </tr>
        <tr>
          <td>No.</td>
          <th></th>
          <th></th>
          <th></th>
          <th></th>
        </tr>
      </table>
      <table style="width: 30%">
        <tr>
          <td>No. DE FOLIO</td>
          <td rowspan="2" style="color: red; font-size: 15px">882801</td>
        </tr>
        <tr>
          <th>CDMX</th>
        </tr>
      </table>
    </div>
    <h1>REPORTE DE MANTENIMIENTO DE ESCALERAS</h1>
    <div style="display: flex; gap: 5px; width: 100%">
      <table style="width: 40%">
        <tr>
          <td style="height: 20px; vertical-align: top">CLIENTE</td>
        </tr>
      </table>

      <table style="width: 40%">
        <tr>
          <td style="height: 20px; vertical-align: top">NOMBRE DE MECÁNICO</td>
        </tr>
      </table>
      <table style="width: 20%">
        <tr>
          <td style="height: 20px; vertical-align: top">FECHA</td>
        </tr>
      </table>
    </div>

    <div style="display: flex; gap: 25%; width: 100%">
      <table style="width: 100%">
        <thead>
          <tr>
            <th style="width: 50%">No. DE ESCALERA #</th>
            <th>1</th>
            <th>2</th>
            <th>3</th>
            <th>4</th>
            <th>5</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>PARTIDA DE TRABAJO</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>CONDICIONES DE TRABAJO</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>CONDICIONES DE MANEJO</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>SW. OPERADOR</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>ACCION DE BOTON</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>COND. DE PEINE Y ESCALON</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>RESQ. DE PEINE Y ESCALON</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>RESQ. DE ENTRE Y ESCALON</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>RESQ. DE ESCALON Y ZOCL</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>ILUMINACIÓN Y ACABADO</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>CHEQUEO DE CORRIENTE</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>CHAPAS DE DIRECCION</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>CHAPA DE ALARMA</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <table style="width: 100%; height: 50%">
        <tr>
          <td style="width: 50%">No. DE ESCALERA #</td>
          <td>1</td>
          <td>2</td>
          <td>3</td>
          <td>4</td>
          <td>5</td>
          <td>6</td>
        </tr>
        <tr>
          <td>COND. AMBIENTAL DE C/MAQ.S</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>COND. AMBIENTAL DE C/MAQ.IN</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>COND. MANEJO C/EQUIPOS</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>FUNCIONAMIENTO DE FRENO</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>LUBRICACION DE CADENA</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>CHEQUEO DE CIRCUITO DE SEGURIDADES</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>SW. DE CUCHILLA INFERIOR</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>SW. DE ALIMENTACION RST</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="height: 8px"></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="height: 8px"></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="height: 8px"></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="height: 8px"></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </table>
    </div>

    <div style="display: flex; gap: 1px; width: 100%">
      <div style="width: 100%; display: flex; flex-direction: column">
        <table style="width: 100%; margin-top: 41px">
          <tr>
            <td style="width: 50%">1.C/MAQ. SUP. Y INF.</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>
        <div
          style="font-size: 5px; margin-top: 3px; line-height: 1.5; width: 100%"
        >
          1.1 INTERRUPTOR Y T/CONTROL<br />
          1.2 FRENO MAGNETICO <br />
          1.3 MOTOR Y REDUCTOR<br />
          1.4 CADENA DE TRACCION <br />
          1.5 FRENO DE EMERGENCIA
        </div>

        <table style="width: 100%; margin-top: 2px">
          <tr>
            <td style="width: 50%">2. PASAMANOS</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>
        <div
          style="font-size: 5px; margin-top: 4px; line-height: 1.5; width: 100%"
        >
          2.1 BANDA DE PASAMANOS <br />
          2.2 GUIA DE PASAMANOS
        </div>

        <table style="width: 100%; margin-top: 1px">
          <tr>
            <td style="width: 50%; font-size: 5px">
              3. DISPOSITIVO DE TRACC. DE PASAMANOS
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>
        <div
          style="font-size: 5px; margin-top: 3px; line-height: 1.5; width: 100%"
        >
          3.1 CADENA DE TRACCION DE PASAMANOS <br />
          3.2 DISPOSITIVO DE TRACCION <br />
          3.3 DISPOSITIVO DE TENSION DE PASAMANOS
        </div>

        <table style="width: 100%; margin-top: 2px">
          <tr>
            <td style="width: 50%">4. ESCALON RIEL</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>
        <div
          style="font-size: 5px; margin-top: 3px; line-height: 1.5; width: 100%"
        >
          4.1 RIEL GUIA
          <br />
          4.2 ESCALON <br />
          4.3 CADENA DE ESCALON <br />
          4.4 FLECHA PRINCIPAL SUP. Y INF.<br />
          4.5 DISPOSITIVO DE SEG. PARA CADENA DE ESCALON
        </div>
      </div>
      <div class="image">
        <img src="escalera.png" />
      </div>
      <div style="width: 100%; display: flex; flex-direction: column">
        <table style="width: 100%; margin-top: 33px">
          <tr>
            <td style="width: 50%">5. ILUMINACION Y ACABADO</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>
        <div
          style="font-size: 5px; margin-top: 4px; line-height: 1.5; width: 100%"
        >
          5.1 PANEL INTERIOR <br />
          5.2 DISPOSITIVO DE ILUMINACIÓN <br />5.3 ZOCLO<br />
          5.4 PLACA DE DEMARCACION
        </div>
        <table style="width: 100%; margin-top: 30px">
          <tr>
            <th style="height: 50px; border: none"></th>
          </tr>
          <tr>
            <td colspan="7" style="border: none">MECANICO</td>
          </tr>
          <tr>
            <th colspan="3">HORA DE ENTRADA</th>
            <th colspan="4"></th>
          </tr>
          <tr>
            <th colspan="3">HORA DE SALIDA</th>
            <th colspan="4"></th>
          </tr>
        </table>
      </div>
    </div>
    <table>
      <tr>
        <td>AVISO AL CLIENTE</td>
      </tr>
      <tr>
        <th style="height: 8px"></th>
      </tr>
      <tr>
        <th style="height: 8px"></th>
      </tr>
    </table>
    <table>
      <tr>
        <th style="width: 35%">DETALLE DE TRABAJO</th>
        <th colspan="3" style="width: 35%">REFACCIONES UTILIZADAS</th>
        <th colspan="2">
          CON CARGO <br />
          AL CLIENTE
        </th>
        <th rowspan="2">
          CODIGO <br />
          INTERNO
        </th>
      </tr>
      <tr>
        <th></th>
        <th>CANTIDAD</th>
        <th colspan="2">DESCRIPCIÓN</th>
        <th>SI</th>
        <th>NO</th>
      </tr>
      <tr>
        <th style="height: 6px"></th>
        <th></th>
        <th colspan="2"></th>
        <th></th>
        <th></th>
        <th></th>
      </tr>
      <tr>
        <th style="height: 6px"></th>
        <th></th>
        <th colspan="2"></th>
        <th></th>
        <th></th>
        <th></th>
      </tr>
      <tr>
        <th style="height: 6px"></th>
        <th></th>
        <th colspan="2"></th>
        <th></th>
        <th></th>
        <th></th>
      </tr>
      <tr>
        <th style="height: 6px"></th>
        <th></th>
        <th colspan="2"></th>
        <th></th>
        <th></th>
        <th></th>
      </tr>
      <tr>
        <th colspan="6" style="border: none">ESTIMADO CLIENTE</th>
      </tr>
      <tr>
        <td colspan="3">
          1.-POR FAVOR VERIFIQUE TODOS LOS TRABAJOS REALIZADOS POR EL MECANICO
          DE MANTENIMIENTO Y SI ESTA DE ACUERDO, POR FAVOR FIRME ESTE REPORTE DE
          CONFORMIDAD <br />
          2.- TAMBIEN VERIFIQUE LA HORA DE ENTRADA Y DE SALIDA DEL MECANICO Y
          CUANDO HAYA CAMBIO DE REFACCIONES, EXIJA LE ENTREGUEN LAS USADAS
          (DAÑADAS).
        </td>
        <td colspan="4">
          <div>
            <span class="label" style="font-size: 7px"
              >FIRMA DEL CLIENTE:
            </span>
            <span class="linea" style="width: 95px"></span><br /><br />
            <span class="label" style="font-size: 7px">NOMBRE: </span>
            <span class="linea" style="width: 135px"></span><br /><br />
            <span class="label" style="font-size: 7px">CARGO: </span>
            <span class="linea" style="width: 140px"></span>
          </div>
        </td>
      </tr>
    </table>
    <p style="font-size: 6px">TEL-GMA-FRT-002.2</p>
  </body>
</html>
`;

const TEMPLATE_ELEVADORES = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>REPORTE DE MANTENIMIENTO DE ELEVADORES</title>
    <style>
      body {
        width: 612px;
        margin: 0 auto;
        font-family: Arial, sans-serif;
        font-size: 8px;
        color: #000;
        box-sizing: border-box;
        border: 1px solid #999;
        padding: 60px;
      }
      /*HEADER*/
      .header-row {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        width: 65%;
      }

      .header-logo img {
        width: 150px;
      }
      .image img {
        width: 150px;
        margin-top: 20px;
      }
      .header-company {
        text-align: left;
        font-weight: bold;
        font-size: 12px;
        display: flex;
        gap: 8px;
        width: 70%;
      }
      .header-divider {
        width: 2px;
        height: 60px;
        background-color: black;
        display: block;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        table-layout: fixed;
      }

      td {
        border: 1px solid #000;
        padding: 2px;
        text-align: left;
        font-size: 7px;
        font-weight: normal;
      }
      th {
        border: 1px solid #000;
        padding: 2px;
        text-align: center;
        font-size: 7px;
        font-weight: normal;
      }
      .linea {
        display: inline-block;
        border-bottom: 1px solid #000;
        height: 14px;
        vertical-align: bottom;
        margin-left: 5px;
        margin-right: 15px;
      }
      .label {
        display: inline-block;
      }
      h1 {
        text-align: left;
        font-size: 18px;
        font-weight: normal;
        margin-bottom: 0px;
      }
    </style>
  </head>
  <body>
    <div class="header-row">
      <div class="header-logo">
        <img src="logo.png" alt="Logo Mitsubishi" />
      </div>
      <div class="header-divider"></div>
      <div class="header-company">
        MITSUBISHI ELECTRIC <br />DE MÉXICO, S.A. DE C.V. <br />
      </div>
    </div>

    <div style="display: flex; gap: 5px; width: 100%">
      <table style="width: 40%">
        <tr>
          <td style="border: none; font-size: 6px">
            TELEFONOS DE EMERGENCIA 25HRS. Y ATENCIÓN A CLIENTES (CALL CENTER),
            EN ZONA METROPOLITANA E INTERIOR DEL PAIS:<br />
            800-926-3526&nbsp;&nbsp; 800-926-3563 &nbsp;&nbsp;(01-55) 5341-8512
          </td>
        </tr>
      </table>
      <table style="width: 15%">
        <tr>
          <th colspan="3">CONTRATO</th>
        </tr>
        <tr>
          <th style="height: 15px"></th>
          <th></th>
          <th></th>
        </tr>
      </table>
      <table style="width: 35%">
        <tr>
          <th colspan="8">ORDEN</th>
        </tr>
        <tr>
          <td>MX</td>
          <th></th>
          <th></th>
          <th></th>
          <th></th>
          <th></th>
          <th></th>
          <th></th>
        </tr>
      </table>
      <table style="width: 30%">
        <tr>
          <th colspan="2">No. DE FOLIO</th>
        </tr>
        <tr>
          <td style="border-right: none">CDMX</td>
          <td style="color: red; font-size: 15px; border-left: none">609851</td>
        </tr>
      </table>
    </div>
    <h1>REPORTE DE MANTENIMIENTO DE ELEVADORES</h1>
    <div style="display: flex; gap: 5px; width: 100%">
      <table style="width: 40%">
        <tr>
          <td style="height: 20px; vertical-align: top">CLIENTE</td>
        </tr>
      </table>

      <table style="width: 40%">
        <tr>
          <td style="height: 20px; vertical-align: top">NOMBRE DE MECÁNICO</td>
        </tr>
      </table>
      <table style="width: 20%">
        <tr>
          <td style="height: 20px; vertical-align: top">FECHA</td>
        </tr>
      </table>
    </div>
    <div style="display: flex; gap: 5px; width: 100%">
      <table style="width: 35%">
        <thead>
          <tr>
            <th style="width: 50%">No. ELEVADOR</th>
            <th>1</th>
            <th>2</th>
            <th>3</th>
            <th>4</th>
            <th>5</th>
            <th>6</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>COND. CUARTO DE MAQUINA</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>
              COND. FUNCIONAMIENTO<br />
              TOTAL CUARTO DE MAQ.
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>
              COND. FUNCIONAMIENTO<br />
              DE CABINA
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>BOTÓN E <br />> DE CABINA</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>
              ILUMINACIÓN Y ACABADO<br />
              DE CABINA
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>LUZ DE EMERGENCIA</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>
              BOTÓN E INDICADOR <br />
              DE PISO
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>INDICADOR DE T/SUPERVISIÓN</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>CONDICIÓN DE FOSA</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>INTERLOCK</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>SW LIMITE</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>
              CONDICION AMBIENTAL<br />
              EN TECHO CABINA
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td style="height: 8px"></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td style="height: 8px"></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>No. DE NIVELES</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <th style="height: 50px; border: none"></th>
          </tr>
          <tr>
            <td colspan="7" style="border: none">MECANICO</td>
          </tr>
          <tr>
            <th colspan="3">HORA DE ENTRADA</th>
            <th colspan="4"></th>
          </tr>
          <tr>
            <th colspan="3">HORA DE SALIDA</th>
            <th colspan="4"></th>
          </tr>
        </tbody>
      </table>

      <div class="image">
        <img src="elevador.png" />
      </div>

      <div style="width: 33%; display: flex; flex-direction: column">
        <table style="width: 100%">
          <tr>
            <td style="width: 50%">1.- CUARTO DE MAQUINA</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>

        <div style="font-size: 5px; margin-top: 11px; line-height: 1.5">
          1.1 PANEL DE CONTROL<br />
          1.2 FRENO<br />
          1.3 MAQUINA DE TRACCIÓN MOTOR Y TACOGENERADOR<br />
          1.4 POLEA DE TRACCIÓN Y DEFLECTORA<br />
          1.5 GOBERNADOR
        </div>

        <table style="width: 100%">
          <tr>
            <td style="width: 50%">2.- CABINA</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>

        <div style="font-size: 5px; margin-top: 12px; line-height: 1.5">
          2.1 ACEITERA <br />
          2.2 ZAPATA DE CABINA<br />
          2.3 OPERADOR DE PUERTA<br />
          2.4 CLUTCH DE CABINA<br />
          2.5 S.D.E. E.D.M. <br />
          2.6 DESLIZADOR<br />
          2.7 SEGURO CONTRA CAÍDA
        </div>

        <table style="width: 100%">
          <tr>
            <td style="width: 50%">3.- PISOS</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>

        <div style="font-size: 5px; margin-top: 4px; line-height: 1.4">
          3.1 RIEL <br />
          3.2 INTERLOCK <br />
          3.3 DESLIZADOR <br />
          3.4 CABLE ENTREPOLEA
        </div>

        <table style="width: 100%">
          <tr>
            <td style="width: 50%">4.- CUBO</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>

        <div style="font-size: 5px; margin-top: 5px; line-height: 1.5">
          4.1 CAJA DE CONEXION Y 1/2 TIRO<br />
          4.2 CABLE VIEJAERO<br />
          4.3 CABLE DE TRACCIÓN<br />
          4.4 RIEL Y SOPORTE<br />
          4.5 CONTRAPESO<br />
          4.6 SW LIMITE
        </div>

        <table style="width: 100%">
          <tr>
            <td style="width: 50%">5.- FOSA</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>

        <div style="font-size: 5px; margin-top: 3px; line-height: 1.4">
          5.1 POLEA DE TENSION <br />
          5.2 AMORTIGUADORES<br />
          5.3 CABLE DE GOBERNADOR
        </div>
      </div>
    </div>
    <table>
      <tr>
        <td>AVISO AL CLIENTE</td>
      </tr>
    </table>
    <table>
      <tr>
        <th style="width: 35%">DETALLE DE TRABAJO</th>
        <th colspan="3" style="width: 35%">REFACCIONES UTILIZADAS</th>
        <th colspan="2">
          CON CARGO <br />
          AL CLIENTE
        </th>
        <th rowspan="2">
          CODIGO <br />
          INTERNO
        </th>
      </tr>
      <tr>
        <th></th>
        <th>CANTIDAD</th>
        <th colspan="2">DESCRIPCIÓN</th>
        <th>SI</th>
        <th>NO</th>
      </tr>
      <tr>
        <th style="height: 6px"></th>
        <th></th>
        <th colspan="2"></th>
        <th></th>
        <th></th>
        <th></th>
      </tr>
      <tr>
        <th style="height: 6px"></th>
        <th></th>
        <th colspan="2"></th>
        <th></th>
        <th></th>
        <th></th>
      </tr>
      <tr>
        <th style="height: 6px"></th>
        <th></th>
        <th colspan="2"></th>
        <th></th>
        <th></th>
        <th></th>
      </tr>
      <tr>
        <th style="height: 6px"></th>
        <th></th>
        <th colspan="2"></th>
        <th></th>
        <th></th>
        <th></th>
      </tr>
      <tr>
        <th colspan="6" style="border: none">ESTIMADO CLIENTE</th>
      </tr>
      <tr>
        <td colspan="3">
          1.-POR FAVOR VERIFIQUE TODOS LOS TRABAJOS REALIZADOS POR EL MECANICO
          DE MANTENIMIENTO Y SI ESTA DE ACUERDO, POR FAVOR FIRME ESTE REPORTE DE
          CONFORMIDAD <br />
          2.- TAMBIEN VERIFIQUE LA HORA DE ENTRADA Y DE SALIDA DEL MECANICO Y
          CUANDO HAYA CAMBIO DE REFACCIONES, EXIJA LE ENTREGUEN LAS USADAS
          (DAÑADAS).
        </td>
        <td colspan="4">
          <div>
            <span class="label" style="font-size: 7px"
              >FIRMA DEL CLIENTE:
            </span>
            <span class="linea" style="width: 95px"></span><br /><br />
            <span class="label" style="font-size: 7px">NOMBRE: </span>
            <span class="linea" style="width: 135px"></span><br /><br />
            <span class="label" style="font-size: 7px">CARGO: </span>
            <span class="linea" style="width: 140px"></span>
          </div>
        </td>
      </tr>
    </table>
    <p style="font-size: 6px">TEL-GMA-FRT-003.3</p>
  </body>
</html>
`;

/**
 * payload:
 *  {
 *    tipo: 'elevador' | 'escalera',
 *    contrato, orden, folio,
 *    cliente, tecnico, fecha, horaEntrada, horaSalida,
 *    detalleTrabajo, refacciones:[{cantidad, descripcion}],
 *    cargoCliente: 'SI'|'NO'|null, codigoInterno,
 *    // Checklist (elige UNO):
 *    checklist: string[] // marcas simples (OK en la última columna de la fila)
 *    // o
 *    checklistMatrix: { [label: string]: 1|2|3|4|5|6 } // marca columna exacta
 *
 *    firmaCliente: 'data:image/png;base64,...',
 *    nombreCliente, cargoDelCliente,
 *    logoDataUrl: 'data:image/png;base64,...'
 *  }
 */
export async function generarMantenimientoPdf(payload) {
  const html = buildHtml(payload);
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    dialogTitle: 'Compartir Reporte de Mantenimiento (PDF)',
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
  return uri;
}

/* =================== helpers =================== */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

// Reemplaza solo la PRIMERA coincidencia de un regex
function replaceFirst(input, regex, replacement) {
  const m = input.match(regex);
  if (!m) return input;
  return input.replace(m[0], typeof replacement === 'function' ? replacement(m[0]) : replacement);
}

// ===== Logo: reemplaza <img src="logo.png"> por tu data URL
function injectLogo(html, logoDataUrl) {
  if (!logoDataUrl) return html;
  return html.replace(/<img\s+[^>]*src=["']logo\.png["'][^>]*>/i, `<img src="${logoDataUrl}" style="height:150px;object-fit:contain" />`);
}

// ===== Folio: reemplaza el número rojo al lado de "No. DE FOLIO"
function injectFolio(html, folio) {
  if (!folio) return html;
  // Busca un TD/TH con dígitos largos y lo sustituye
  return html.replace(/>(\s*\d{5,10}\s*)<\/(td|th)>/i, `>${esc(String(folio).replace('CDMX','').trim())}</$2>`);
}

// ===== Básicos: contrato, orden, cliente, técnico, fecha, horas
function injectBasics(html, p) {
  // CONTRATO: primer th con height:15px vacío
  if (p.contrato) {
    html = replaceFirst(
      html,
      /<th[^>]*height:\s*15px[^>]*>\s*<\/th>/i,
      (m) => m.replace('</th>', `${esc(p.contrato)}</th>`)
    );
  }

  // ORDEN: mete número en el primer <td/th> vacío dentro del bloque "ORDEN"
  if (p.orden) {
    html = replaceFirst(
      html,
      /(<th[^>]*>\s*ORDEN\s*<\/th>[\s\S]*?<tr>[\s\S]*?)(<t[dh][^>]*>\s*<\/t[dh]>)/i,
      (block) => block.replace(/<t[dh][^>]*>\s*<\/t[dh]>/i, (m) => m.replace(/>\s*<\/t[dh]>/i, `>${esc(p.orden)}</td>`))
    );
  }

  // CLIENTE / NOMBRE DE MECÁNICO / FECHA (sustituye el contenido de la celda)
  if (p.cliente) {
    html = html.replace(/(<td[^>]*>\s*)CLIENTE(\s*<\/td>)/i, `$1CLIENTE: ${esc(p.cliente)}$2`);
  }
  if (p.tecnico) {
    html = html.replace(/(<td[^>]*>\s*)NOMBRE DE MECÁNICO(\s*<\/td>)/i, `$1NOMBRE DE MECÁNICO: ${esc(p.tecnico)}$2`);
  }
  if (p.fecha) {
    html = html.replace(/(<td[^>]*>\s*)FECHA(\s*<\/td>)/i, `$1FECHA: ${esc(p.fecha)}$2`);
  }

  // Horas (llenar la siguiente celda vacía tras el rótulo)
  if (p.horaEntrada) {
    html = replaceFirst(
      html,
      /(HORA DE ENTRADA<\/t[dh]>[\s\S]*?)(<t[dh][^>]*>\s*<\/t[dh]>)/i,
      (blk) => blk.replace(/<t[dh][^>]*>\s*<\/t[dh]>/i, `<td>${esc(p.horaEntrada)}</td>`)
    );
  }
  if (p.horaSalida) {
    html = replaceFirst(
      html,
      /(HORA DE SALIDA<\/t[dh]>[\s\S]*?)(<t[dh][^>]*>\s*<\/t[dh]>)/i,
      (blk) => blk.replace(/<t[dh][^>]*>\s*<\/t[dh]>/i, `<td>${esc(p.horaSalida)}</td>`)
    );
  }

  return html;
}

// ===== Detalle / Refacciones / Cargo / Código
function injectDetalleRefacciones(html, p) {
  const detalleHtml = esc(p.detalleTrabajo || '');
  const filasRef = (p.refacciones || []).filter((r) => r.cantidad || r.descripcion).slice(0, 8);
  const isSI = p.cargoCliente === 'SI';
  const isNO = p.cargoCliente === 'NO';

  const fila = (r) => `
    <tr>
      <th style="height:6px">${detalleHtml && '&nbsp;'}</th>
      <th>${esc(r?.cantidad || '')}</th>
      <th colspan="2">${esc(r?.descripcion || '')}</th>
      <th>${isSI ? 'X' : ''}</th>
      <th>${isNO ? 'X' : ''}</th>
      <th>${esc(p.codigoInterno || '')}</th>
    </tr>`;

  const gen = (filasRef.length ? filasRef : [{}]).map(fila).join('');

  return html.replace(
    /(<t[dh][^>]*>\s*DETALLE DE TRABAJO\s*<\/t[dh]>[\s\S]*?<tr>\s*<t[dh][^>]*style="[^"]*height:\s*6px[^"]*"[\s\S]*?<\/tr>)/i,
    (_head) => _head.replace(/<tr>\s*<t[dh][^>]*style="[^"]*height:\s*6px[^"]*"[\s\S]*?<\/tr>/i, gen)
  );
}

// ===== Firma + Nombre + Cargo (bloque del cliente)
function injectFirma(html, p) {
  if (p.firmaCliente) {
    html = html.replace(
      /FIRMA DEL CLIENTE:\s*<\/span>\s*<span class="linea"[^>]*><\/span>/i,
      `FIRMA DEL CLIENTE:</span><br/><img src="${p.firmaCliente}" style="width:180px;height:60px;object-fit:contain;border:1px solid #000" />`
    );
  }
  if (p.nombreCliente) {
    html = html.replace(
      />\s*NOMBRE:\s*<\/span>\s*<span class="linea"[^>]*><\/span>/i,
      `>NOMBRE:</span> <span>${esc(p.nombreCliente)}</span>`
    );
  }
  if (p.cargoDelCliente) {
    html = html.replace(
      />\s*CARGO:\s*<\/span>\s*<span class="linea"[^>]*><\/span>/i,
      `>CARGO:</span> <span>${esc(p.cargoDelCliente)}</span>`
    );
  }
  return html;
}

/**
 * Marca “X” en la N-ésima columna de la fila cuyo texto contenga el label.
 * - checklist: string[]  → pone X en la última columna (OK)
 * - checklistMatrix: { label: colIndex } → pone X en la columna exacta (1..N)
 */
function injectChecklistMatrix(html, p, { okColIndex }) {
  const toArray = (v) => (Array.isArray(v) ? v : []);
  const okLabels = new Set(toArray(p.checklist)); // modo simple
  const matrix = p.checklistMatrix || {}; // modo por columna

  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  // Construye tareas
  const tasks = [];
  okLabels.forEach((label) => tasks.push({ labelVisible: label, targetCol: okColIndex }));
  Object.entries(matrix).forEach(([label, col]) => {
    const n = Number(col);
    if (n >= 1 && n <= 20) tasks.push({ labelVisible: label, targetCol: n });
  });
  if (!tasks.length) return html;

  // Aplica tareas recorriendo TODAS las filas (<tr>) globalmente
  tasks.forEach(({ labelVisible, targetCol }) => {
    const labelN = norm(labelVisible);

    html = html.replace(/<tr[^>]*>[\s\S]*?<\/tr>/gi, (row) => {
      // Sólo si la fila contiene el label, la modificamos
      const textRow = row.replace(/<[^>]+>/g, ' ');
      if (!norm(textRow).includes(labelN)) return row;

      // Divide en celdas (conserva etiquetas)
      const cells = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      if (!cells.length) return row;

      // targetCol es 1-based contando TODAS las celdas de la fila (incluida la del label)
      const idx = Math.max(1, Math.min(targetCol, cells.length)) - 1;

      // Si la celda está vacía, sustituye su contenido interno por "X"
      cells[idx] = cells[idx].replace(/>(?:\s|&nbsp;)*</i, '>X<');

      return '<tr>' + cells.join('') + '</tr>';
    });
  });

  return html;
}

function buildHtml(p) {
  // 1) plantilla
  let html = p.tipo === 'escalera' ? TEMPLATE_ESCALERAS : TEMPLATE_ELEVADORES;

  // 2) logo
  html = injectLogo(html, p.logoDataUrl);

  // 3) folio
  html = injectFolio(html, p.folio);

  // 4) datos básicos
  html = injectBasics(html, p);

  // 5) detalle/refacciones/cargo/código
  html = injectDetalleRefacciones(html, p);

  // 6) firma cliente
  html = injectFirma(html, p);

  // 7) checklist (columna OK = última por plantilla)
  const okColIndex = p.tipo === 'elevador' ? 7 : 6;
  html = injectChecklistMatrix(html, p, { okColIndex });

  return html;
}
