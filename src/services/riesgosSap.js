import api from "./api";
import {
  buildWorkOrderBulkId,
} from "../utils/workOrderBulkId";

const WORK_ORDER_BULK_ENDPOINT =
  "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderBulkSet";

function buildWorkOrderRepSet(trabajadores = []) {
  if (!Array.isArray(trabajadores)) return [];

  // trabajadores[0] es el tecnico principal: no se envia como auxiliar.
  // Una nomina precargada (Z2) sin nombre tampoco es un auxiliar capturado.
  return trabajadores
    .slice(1)
    .map((trabajador) => ({
      NumNomina: String(trabajador?.nomina ?? "").trim(),
      Nombre: String(trabajador?.nombre ?? "").trim(),
    }))
    .filter((trabajador) => trabajador.NumNomina && trabajador.Nombre);
}

export function buildTbmkyBulkPayload({
  orderId,
  pdfBase64,
  pdfLocalRef = null,
  fileName,
  trabajadores = [],
}) {
  const cleanOrderId = String(orderId || "").trim();
  // Online: cadena Base64. Offline: marcador de archivo que sapQueue.js
  // convertira a Base64 UNICAMENTE al sincronizar.
  const isOfflineFile =
    pdfLocalRef?.__sapQueueLocalFileV1 === true &&
    typeof pdfLocalRef?.uri === "string" &&
    pdfLocalRef.uri.startsWith("file://");

  const originalBase64 = typeof pdfBase64 === "string" ? pdfBase64 : "";
  const noPrefix = originalBase64.startsWith("data:application/pdf;base64,")
    ? originalBase64.slice("data:application/pdf;base64,".length)
    : originalBase64;
  // Evitar crear otra copia de la cadena si no hay espacios que limpiar.
  const cleanBase64 = /\s/.test(noPrefix)
    ? noPrefix.replace(/\s/g, "")
    : noPrefix;
  const cleanFileName = String(
    fileName || `TBMKY_${cleanOrderId}.pdf`,
  ).trim();

  if (!cleanOrderId) throw new Error("subirPdfOrden: falta orderId");
  if (!isOfflineFile && (!cleanBase64 || cleanBase64.length < 200)) {
    throw new Error("subirPdfOrden: PDF Base64 vacio o muy corto");
  }

  return {
    BulkId: buildWorkOrderBulkId({
      firstOrderId: cleanOrderId,
    }),
    WorkOrderSet: [
      {
        OrderId: cleanOrderId,
        WorkOrderHeader: { Orderid: cleanOrderId },
        WorkOrderUserStatusSet: [
          { UserStText: "0200", Langu: "ES", Inactive: "" },
          { UserStText: "0100", Langu: "ES", Inactive: "X" },
        ],
        Attachments: [
          {
            DocId: cleanOrderId,
            FileName: cleanFileName,
            MimeType: "application/pdf",
            Base64: isOfflineFile ? pdfLocalRef : cleanBase64,
          },
        ],
        Return: [],
        WorkOrderRepSet: buildWorkOrderRepSet(trabajadores),
      },
    ],
  };
}


// Solo metadatos: NUNCA JSON.stringify del payload entero, ya que el
// attachment contiene todo el PDF Base64 y una copia eleva el pico de RAM.
function logBulkPayload(label, payload) {
  try {
    const ordenes = (payload?.WorkOrderSet || []).map((orden) => ({
      OrderId: orden?.OrderId,
      estatus: (orden?.WorkOrderUserStatusSet || [])
        .map((item) => item.UserStText),
      cantidadAuxiliares: orden?.WorkOrderRepSet?.length || 0,
      archivos: (orden?.Attachments || []).map((archivo) => ({
        FileName: archivo?.FileName,
        MimeType: archivo?.MimeType,
        bytesBase64: typeof archivo?.Base64 === "string"
          ? archivo.Base64.length
          : null,
        desdeArchivoLocal: archivo?.Base64?.__sapQueueLocalFileV1 === true,
      })),
    }));
    console.log(label, { BulkId: payload?.BulkId, ordenes });
  } catch (error) {
    console.warn("[TBMKY] No se pudo registrar resumen:", error?.message);
  }
}

export async function subirPdfOrden({
  orderId,
  pdfBase64,
  fileName,
  trabajadores = [],
}) {
  const bulkPayload = buildTbmkyBulkPayload({
    orderId,
    pdfBase64,
    fileName,
    trabajadores,
  });

  console.log(
    "[TBMKY][BULK][URL]",
    WORK_ORDER_BULK_ENDPOINT,
  );

  logBulkPayload(
    "[TBMKY][BULK][PAYLOAD FINAL]",
    bulkPayload,
  );

  try {
    const response = await api.post(
      WORK_ORDER_BULK_ENDPOINT,
      bulkPayload,
      {
        timeout: 300000,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log("[TBMKY][BULK][RESPUESTA SAP]", {
      orderId: String(orderId || "").trim(),
      BulkId: bulkPayload.BulkId,
      httpStatus: response?.status,
    });

    return {
      ok: true,
      orderId: String(orderId || "").trim(),
      BulkId: bulkPayload.BulkId,
      sap: response?.data ?? null,
    };
  } catch (error) {
    console.warn("[TBMKY][BULK][ERROR]", {
      message: error?.message,
      code: error?.code,
      httpStatus: error?.response?.status,
    });

    throw error;
  }
}