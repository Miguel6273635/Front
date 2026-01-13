import api from "./api";

export async function subirPdfOrden({ orderId, pdfBase64, fileName }) {
  const oid = String(orderId || "").trim();
  const b64 = String(pdfBase64 || "").trim();
  const fn = String(fileName || `TBMKY_${oid}.pdf`).trim();

  if (!oid) throw new Error("subirPdfOrden: falta orderId");
  if (!b64 || b64.length < 200) throw new Error("subirPdfOrden: pdfBase64 vacío o muy corto");

  const body = { orderId: oid, pdfBase64: b64, fileName: fn };

  // (opcional) debug:
  // console.log("[TBMKY] submit", { orderId: oid, fileName: fn, base64Len: b64.length });

  return (
    await api.post("/api/formulario-riesgos/submit", body, {
      headers: { "Content-Type": "application/json" },
    })
  ).data;
}
