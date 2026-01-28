// src/services/mantenimientoPdfSap.js
import api from "./api";
import * as FileSystem from "expo-file-system/legacy";

export async function subirPdfMantElevadoresASap({
  orderid,
  pdfUri,
  fileName = "mantenimiento_elevadores.pdf",
}) {
  if (!orderid) throw new Error("orderid requerido");
  if (!pdfUri) throw new Error("pdfUri requerido");

  // Lee el PDF generado (file://...) a base64 (SIN el prefijo data:...)
  const base64 = await FileSystem.readAsStringAsync(pdfUri, { encoding: "base64" });

  const body = {
    WorkOrderHeader: {
      Orderid: String(orderid), // número de orden
    },
    Attachments: [
      {
        DocId: String(orderid),
        FileName: fileName,
        MimeType: "pdf", // como tú lo quieres
        Base64: base64,
      },
    ],
    Return: [],
  };

  // OJO: tu baseURL ya está en api.js, aquí solo ponemos la ruta
  const { data } = await api.post(
    "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
    body,
    { headers: { "Content-Type": "application/json" } }
  );

  return data;
}
