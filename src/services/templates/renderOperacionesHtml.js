// src/templates/renderOperacionesHtml.js

const safeStr = (v) => String(v ?? "").trim();

function escapeHtml(str) {
  return safeStr(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const getUsr02 = (op) => safeStr(op?.Usr02 ?? op?.usr02) || "SIN UBICACIÓN";
const getActivity = (op) => safeStr(op?.activity ?? op?.Activity);
const getSub = (op) => safeStr(op?.subactivity ?? op?.SubActivity);
const getDesc = (op) => safeStr(op?.description ?? op?.Description);
const getSTK = (op) => safeStr(op?.StandardTextKey ?? op?.standardTextKey);

// ID estable como el de tu app (si ya tienes id úsalo)
function getOpId(orderid, op, idx) {
  const existing = safeStr(op?.id);
  if (existing) return existing;

  const a = getActivity(op);
  const s = getSub(op);
  const oid = safeStr(orderid);

  const key = `${oid}-${a}${s ? `-${s}` : ""}`.trim();
  return key && key !== "-" ? key : `fallback__${idx}`;
}

export function renderOperacionesAgrupadasHtml({
  orderid,
  operaciones = [],
  checkedMap = {},
}) {
  // agrupar por Usr02
  const groups = {};
  for (const op of operaciones || []) {
    const ubic = getUsr02(op);
    if (!groups[ubic]) groups[ubic] = [];
    groups[ubic].push(op);
  }

  const ubicaciones = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  if (!ubicaciones.length) {
    return `<div class="opsEmpty">No hay operaciones.</div>`;
  }

  const html = ubicaciones
    .map((ubic) => {
      const ops = groups[ubic];

      const items = ops
        .map((op, idx) => {
          const id = getOpId(orderid, op, idx);
          const checked = !!checkedMap[id];

          const a = getActivity(op) || "—";
          const s = getSub(op);
          const desc = getDesc(op);
          const stk = getSTK(op);

          // línea 1 = código + descripción
          const code = `${escapeHtml(a)}${s ? "-" + escapeHtml(s) : ""}`;
          const line1 = desc ? `${code} · ${escapeHtml(desc)}` : code;

          // mostrar STK si existe
          const descNorm = safeStr(desc).toLowerCase();
          const stkNorm = safeStr(stk).toLowerCase();
          const showStkBold = stk && stkNorm && !descNorm.includes(stkNorm);

          return `
            <div class="opItem ${checked ? "checked" : ""}">
              <div class="cb">${checked ? "☑" : "☐"}</div>
              <div class="opBody">
                <div class="opLine1">${line1}</div>
                ${
                  stk
                    ? showStkBold
                      ? `<div class="opStk"><b>${escapeHtml(stk)}</b></div>`
                      : `<div class="opStk">${escapeHtml(stk)}</div>`
                    : ""
                }
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="ubicCard">
          <div class="ubicTitle">${escapeHtml(ubic)}</div>
          <div class="ubicItems">
            ${items}
          </div>
        </div>
      `;
    })
    .join("");

  return `<div class="opsWrap">${html}</div>`;
}
