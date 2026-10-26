// src/services/pdf/generarPdfMantenimiento.js
// Un punto de generación para PDFs de mantenimiento individuales y múltiples.
// Conserva el texto de numeración existente (Página X de Y).
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import { addPageNumbersToPdfBase64 } from "./addPageNumbersToPdf";

export async function generarPdfMantenimiento({ html, incluirBase64 = false } = {}) {
  const contenido = String(html || "");
  if (!contenido.trim()) throw new Error("No hay contenido para el PDF de mantenimiento.");

  const inicio = Date.now();
  // pdf-lib necesita leer el PDF para numerarlo. Se conserva esta conversión,
  // pero NO devolvemos Base64 a la pantalla cuando solo requiere el archivo.
  const resultado = await Print.printToFileAsync({ html: contenido, base64: true });
  if (!resultado?.uri || !resultado?.base64) {
    throw new Error("No se pudo generar el PDF de mantenimiento.");
  }

  const pdfNumerado = await addPageNumbersToPdfBase64(resultado.base64);
  if (!pdfNumerado || pdfNumerado.length < 200) {
    throw new Error("No se pudo numerar el PDF de mantenimiento.");
  }

  await FileSystem.writeAsStringAsync(resultado.uri, pdfNumerado, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let bytes = 0;
  try {
    const info = await FileSystem.getInfoAsync(resultado.uri);
    if (!info.exists) throw new Error("No se encontró el PDF final.");
    bytes = Number(info.size || 0);
  } catch (error) {
    console.warn("[PDF MANTTO] No se pudo medir el tamaño:", error?.message || error);
  }

  console.log("[PDF MANTTO] Documento listo", {
    sizeKB: bytes ? Math.round(bytes / 1024) : Math.round(pdfNumerado.length * 0.75 / 1024),
    tiempoMs: Date.now() - inicio,
    entregaBase64: !!incluirBase64,
  });

  return {
    uri: resultado.uri,
    base64: incluirBase64 ? pdfNumerado : null,
    sizeBytes: bytes,
  };
}