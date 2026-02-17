// src/templates/mantenimiento_elevadores.template.js

export const HTML_ELEVADORES = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte de Mantenimiento - Elevadores</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #111; }
    .pagina { width: 612px; margin: 0 auto; padding: 18px 20px; }

    /* Header */
    .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .logoBox { width: 170px; }
    .logoBox img { width: 100%; height: auto; object-fit: contain; display: block; }

    .titleBox { flex: 1; text-align: right; }
    .titleBox .titulo { font-size: 16px; font-weight: 800; margin: 0; }
    .titleBox .sub { font-size: 12px; margin-top: 4px; color: #444; }

    .divider { height: 1px; background: #000; margin: 12px 0; }

    .rowGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .field { border: 1px solid #000; padding: 8px; border-radius: 6px; }
    .label { font-size: 11px; font-weight: 800; margin-bottom: 4px; }
    .value { font-size: 12px; font-weight: 700; }

    /* Operaciones */
    .opsTitle { font-size: 13px; font-weight: 900; margin: 12px 0 8px; }
    .opsBox { border: 1px solid #000; border-radius: 6px; padding: 10px; }

    /* Firma */
    .firmaWrap { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .firmaBox { border: 1px solid #000; border-radius: 6px; padding: 10px; min-height: 120px; }
    .firmaLabel { font-size: 11px; font-weight: 900; margin-bottom: 6px; }
    .firmaImg { width: 100%; height: 80px; object-fit: contain; border-top: 1px dashed #999; padding-top: 8px; }

    /* Para que Print/PDF respete tamaño */
    @page { size: letter; margin: 0; }
  </style>
</head>
<body>
  <div class="pagina">
    <div class="header">
      <div class="logoBox">
        <img src="{{LOGO_SRC}}" alt="Logo" />
      </div>
      <div class="titleBox">
        <p class="titulo">REPORTE DE MANTENIMIENTO</p>
        <p class="sub">ELEVADORES</p>
      </div>
    </div>

    <div class="divider"></div>

    <div class="rowGrid">
      <div class="field">
        <div class="label">ORDEN</div>
        <div class="value">{{ORDERID}}</div>
      </div>
      <div class="field">
        <div class="label">FECHA</div>
        <div class="value">{{FECHA}}</div>
      </div>

      <div class="field">
        <div class="label">CLIENTE</div>
        <div class="value">{{CLIENTE}}</div>
      </div>
      <div class="field">
        <div class="label">TÉCNICO</div>
        <div class="value">{{TECNICO}}</div>
      </div>
    </div>

    <div class="opsTitle">OPERACIONES REALIZADAS</div>
    <div class="opsBox">
      {{OPERACIONES_APP}}
    </div>

    <div class="firmaWrap">
      <div class="firmaBox">
        <div class="firmaLabel">FIRMA DEL CLIENTE</div>
        {{FIRMA_IMG}}
      </div>
      <div class="firmaBox">
        <div class="firmaLabel">NOMBRE Y CARGO</div>
        <div style="font-size:12px; font-weight:700; color:#333;">
          (se llenará en el siguiente paso si lo agregas al template)
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
