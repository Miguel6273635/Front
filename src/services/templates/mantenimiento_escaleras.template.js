export const HTML_ESCALERAS = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte de Mantenimiento - Escaleras</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #111; }
    @page { size: letter; margin: 14mm 12mm 16mm 12mm; }

    .pagina { width: 100%; }

    .header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .logoBox { width: 160px; }
    .logoBox img { width:100%; height:auto; object-fit:contain; display:block; }

    .titleBox { flex:1; text-align:right; }
    .titleBox .titulo { font-size:16px; font-weight:800; margin:0; }
    .titleBox .sub { font-size:12px; margin-top:4px; color:#444; }

    .divider { height:1px; background:#000; margin:10px 0; }

    .coberturaBar{
      border:1px solid #000; border-radius:10px; padding:8px 10px;
      font-size:12px; font-weight:900; text-transform:uppercase;
      margin-bottom:10px;
    }

    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }

    .field { border:1px solid #000; border-radius:10px; padding:8px; }
    .label { font-size:11px; font-weight:800; margin-bottom:4px; }
    .value { font-size:12px; font-weight:700; }

    .sectionTitle { font-size:13px; font-weight:900; margin:12px 0 8px; }
    .box { border:1px solid #000; border-radius:10px; padding:10px; }

    .muted { color:#555; font-weight:700; }

    .opsWrap { display:flex; flex-direction:column; gap:10px; }
    .ubicCard { border:1px solid #D0D0D0; border-radius:10px; padding:10px; }
    .ubicTitle { font-size:12px; font-weight:900; margin-bottom:8px; }
    .ubicItems { display:flex; flex-direction:column; gap:6px; }

    .opItem { display:flex; gap:8px; align-items:flex-start; }
    .cb { width:18px; font-size:14px; line-height:18px; }
    .opBody { flex:1; }
    .opLine1 { font-size:11px; font-weight:800; }
    .opStk { font-size:11px; color:#333; font-weight:700; margin-top:2px; }

    .field, .box, .ubicCard, .firmaWrap, .consumiblesBox { page-break-inside: avoid; break-inside: avoid; }

    .consumiblesBox { margin-top:10px; }

    .firmaWrap { margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .firmaBox { border:1px solid #000; border-radius:10px; padding:10px; min-height:130px; }
    .firmaLabel { font-size:11px; font-weight:900; margin-bottom:8px; }
    .firmaImg { width:100%; height:80px; object-fit:contain; border-top:1px dashed #999; padding-top:8px; }
    .firmaEmpty { font-size:12px; color:#666; border-top:1px dashed #999; padding-top:10px; }

    .footerNote { margin-top:10px; font-size:9px; color:#777; text-align:center; }
  </style>
</head>
<body>
  <div class="pagina">
    <div class="header">
      <div class="logoBox">
        <img src="{{LOGO_DATA_URI}}" alt="Logo" />
      </div>
      <div class="titleBox">
        <p class="titulo">REPORTE DE MANTENIMIENTO</p>
        <p class="sub">ESCALERAS</p>
      </div>
    </div>

    <div class="divider"></div>

    <div class="coberturaBar">{{COBERTURA_TIPO}}</div>

    <div class="grid2">
      <div class="field">
        <div class="label">ORDEN</div>
        <div class="value">{{ORDERID}}</div>
      </div>
      <div class="field">
        <div class="label">EQUIPO</div>
        <div class="value">{{EQUIPMENT}}</div>
      </div>

      <div class="field">
        <div class="label">CLIENTE / EMPRESA</div>
        <div class="value">{{CLIENTE}}</div>
      </div>
      <div class="field">
        <div class="label">TÉCNICO</div>
        <div class="value">{{TECNICO}}</div>
      </div>
    </div>

    <div style="margin-top:10px;" class="grid3">
      <div class="field">
        <div class="label">FECHA</div>
        <div class="value">{{FECHA}}</div>
      </div>
      <div class="field">
        <div class="label">HORA INICIO</div>
        <div class="value">{{HORA_INICIO}}</div>
      </div>
      <div class="field">
        <div class="label">HORA FIN</div>
        <div class="value">{{HORA_FIN}}</div>
      </div>
    </div>

    <div style="margin-top:10px;" class="field">
      <div class="label">TIEMPO TOTAL</div>
      <div class="value">{{TIEMPO_TOTAL}}</div>
    </div>

    <div class="sectionTitle">OPERACIONES REALIZADAS</div>
    <div class="box">
      {{OPERACIONES_HTML}}
    </div>

    <div class="sectionTitle">COMENTARIOS</div>
    <div class="box">
      <div class="label">COMENTARIO DEL CLIENTE</div>
      <div class="value muted" style="white-space:pre-wrap;">{{AVISO_CLIENTE}}</div>
      <div style="height:8px;"></div>
      <div class="label">ACTIVIDADES / DESCRIPCIÓN DEL TÉCNICO</div>
      <div class="value muted" style="white-space:pre-wrap;">{{NOTA_TECNICO}}</div>
    </div>

    <div class="sectionTitle">CONSUMIBLES</div>
    <div class="box consumiblesBox">
      {{CONSUMIBLES_HTML}}
    </div>

    <div class="firmaWrap">
      <div class="firmaBox">
        <div class="firmaLabel">FIRMA DEL CLIENTE</div>
        {{FIRMA_CLIENTE_HTML}}
      </div>
      <div class="firmaBox">
        <div class="firmaLabel">NOMBRE / CARGO / CORREO</div>
        <div class="value muted">Nombre: {{CLIENTE_NOMBRE}}</div>
        <div class="value muted">Cargo: {{CLIENTE_CARGO}}</div>
        <div class="value muted">Correo: {{CLIENTE_EMAIL}}</div>
      </div>
    </div>

    <div class="footerNote">Documento generado desde MitsuApp</div>
  </div>
</body>
</html>`;