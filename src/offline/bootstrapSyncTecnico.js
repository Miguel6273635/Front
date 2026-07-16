// src/offline/bootstrapSyncTecnico.js

import { isOnline } from "./net";

import {
  buildOfflineWindow,
  filterOrdenesByWindow,
  saveOrdenesTecnicoList,
  loadOrdenesTecnicoList,
  pruneDetallesNoUsados,
  isCacheFresh,
  ORDENES_CACHE_TTL_MS,
} from "./ordenesTecnicoCache";

import { prefetchOrdenesTecnicoDetalles } from "./prefetchOrdenesTecnico";

import api from "../services/api";

/**
 * Normaliza las propiedades de cada orden.
 *
 * SAP y el backend pueden mandar algunas propiedades con nombres
 * diferentes. Esta función crea una estructura consistente.
 */
function normalizeOrdenFromList(row) {
  if (!row) return null;

  const Orderid = String(
    row?.Orderid ||
      row?.OrderId ||
      row?.OrderID ||
      "",
  ).trim();

  if (!Orderid) return null;

  return {
    ...row,

    Orderid,

    order_type:
      row?.order_type ||
      row?.OrderType ||
      row?.OrderTypeTxt ||
      null,

    equipment:
      row?.equipment ||
      row?.Equipment ||
      null,

    plant:
      row?.plant ||
      row?.Plant ||
      null,

    start_date:
      row?.start_date ||
      row?.StartDate ||
      row?.BasicStartDate ||
      null,

    finish_date:
      row?.finish_date ||
      row?.FinishDate ||
      row?.BasicFinDate ||
      null,

    short_text:
      row?.short_text ||
      row?.ShortText ||
      row?.shorttext ||
      null,

    userstatus:
      row?.userstatus ||
      row?.Userstatus ||
      row?.UserStatus ||
      row?.UserSt ||
      null,

    estatus_code:
      row?.estatus_code ||
      row?.EstatusCode ||
      row?.StatusCode ||
      null,

    estatus_label:
      row?.estatus_label ||
      row?.EstatusLabel ||
      row?.StatusText ||
      null,
  };
}

/**
 * Sincroniza las órdenes del técnico.
 *
 * force=false:
 *   Respeta la caché de una hora.
 *
 * force=true:
 *   Intenta consultar SAP aunque la caché sea reciente.
 *
 * prefetchDetails=true:
 *   Precarga direcciones, partners y operaciones en segundo plano.
 */
export async function bootstrapPrefetchOrdenesTecnico(
  userEmail,
  {
    force = false,
    prefetchDetails = true,
    ttlMs = ORDENES_CACHE_TTL_MS,
  } = {},
) {
  const cleanEmail = String(userEmail || "").trim();

  if (!cleanEmail) {
    return {
      ok: false,
      reason: "missing_user",
      source: "none",
      data: [],
    };
  }

  /**
   * Primero intentamos obtener la última información guardada.
   */
  const cached = await loadOrdenesTecnicoList(cleanEmail);

  const hasCachedList =
    cached &&
    Array.isArray(cached.data);

  const cachedData = hasCachedList
    ? cached.data
    : [];

  const cachedIsFresh = isCacheFresh(
    cached?.updatedAt,
    ttlMs,
  );

  /**
   * La lista ya existe y tiene menos de una hora.
   * No consultamos nuevamente SAP.
   */
  if (!force && hasCachedList && cachedIsFresh) {
    console.log("[BOOTSTRAP TECNICO] Usando caché vigente:", {
      count: cachedData.length,
      updatedAt: cached?.updatedAt,
    });

    /**
     * Revisamos los detalles en segundo plano.
     *
     * prefetchOrdenesTecnicoDetalles ya sabe que no debe volver
     * a descargar detalles que tengan menos de una hora.
     */
    if (prefetchDetails && cachedData.length > 0) {
      const orderIds = cachedData
        .map((item) =>
          String(
            item?.Orderid ||
              item?.OrderId ||
              "",
          ).trim(),
        )
        .filter(Boolean);

      prefetchOrdenesTecnicoDetalles({
        orderIds,
        concurrency: 3,
        force: false,
        ttlMs,
      }).catch((error) => {
        console.log(
          "[BOOTSTRAP TECNICO] Error revisando detalles:",
          error?.message || error,
        );
      });
    }

    return {
      ok: true,
      reason: "cache_fresh",
      source: "cache",
      updatedAt: cached?.updatedAt || null,
      count: cachedData.length,
      data: cachedData,
      window: cached?.window || null,
    };
  }

  /**
   * La caché no existe, está vencida o el usuario solicitó
   * una actualización manual.
   */
  const online = await isOnline();

  /**
   * Sin conexión no borramos nada.
   * Regresamos la última lista guardada.
   */
  if (!online) {
    console.log("[BOOTSTRAP TECNICO] Sin conexión:", {
      hasCachedList,
      count: cachedData.length,
    });

    return {
      ok: hasCachedList,
      reason: "offline",
      source: hasCachedList ? "cache" : "none",
      updatedAt: cached?.updatedAt || null,
      count: cachedData.length,
      data: cachedData,
      window: cached?.window || null,
    };
  }

  /**
   * Ventana que ya maneja tu aplicación:
   * ocho días anteriores y ocho posteriores.
   */
  const window = buildOfflineWindow(new Date());

  const params = new URLSearchParams({
    start: window.startStr,
    end: window.endStr,
    mode: "range",
  });

  console.log("[BOOTSTRAP TECNICO] Consultando SAP:", {
    start: window.startStr,
    end: window.endStr,
    force,
  });

  try {
    /**
     * No mandamos user por query.
     * El backend debe obtener el correo desde el token Azure.
     */
    const response = await api.get(
      `/api/ordenes/sap/list?${params.toString()}`,
    );

    const rawRows = Array.isArray(response?.data)
      ? response.data
      : [];

    const normalizedRows = rawRows
      .map(normalizeOrdenFromList)
      .filter(Boolean);

    /**
     * Segunda validación de fechas del lado de la aplicación.
     */
    const ordersInWindow = filterOrdenesByWindow(
      normalizedRows,
      window.start,
      window.end,
    );

    /**
     * La respuesta fue correcta.
     * Ahora sí reemplazamos la lista guardada.
     */
    await saveOrdenesTecnicoList(
      cleanEmail,
      ordersInWindow,
      window,
    );

    const orderIds = ordersInWindow
      .map((item) =>
        String(
          item?.Orderid ||
            item?.OrderId ||
            "",
        ).trim(),
      )
      .filter(Boolean);

    /**
     * Elimina detalles que ya no pertenecen a la ventana actual.
     */
    await pruneDetallesNoUsados(orderIds);

    /**
     * Comienza la precarga de detalles.
     *
     * No usamos await porque no queremos bloquear el regreso de la lista.
     */
    if (prefetchDetails && orderIds.length > 0) {
      prefetchOrdenesTecnicoDetalles({
        orderIds,
        concurrency: 3,
        force: false,
        ttlMs,
      })
        .then((result) => {
          console.log(
            "[BOOTSTRAP TECNICO] Detalles precargados:",
            result,
          );
        })
        .catch((error) => {
          console.log(
            "[BOOTSTRAP TECNICO] Error precargando detalles:",
            error?.message || error,
          );
        });
    }

    console.log("[BOOTSTRAP TECNICO] Lista actualizada:", {
      count: ordersInWindow.length,
    });

    return {
      ok: true,
      reason: "sap_updated",
      source: "sap",
      updatedAt: Date.now(),
      count: ordersInWindow.length,
      data: ordersInWindow,
      orderIds,
      window,
    };
  } catch (error) {
    /**
     * Si SAP o la API fallan, conservamos la caché anterior.
     */
    const errorDetail =
      error?.response?.data ||
      error?.message ||
      String(error);

    console.log(
      "[BOOTSTRAP TECNICO] Error consultando SAP:",
      errorDetail,
    );

    return {
      ok: hasCachedList,
      reason: "sap_error",
      source: hasCachedList ? "cache" : "none",
      updatedAt: cached?.updatedAt || null,
      count: cachedData.length,
      data: cachedData,
      window: cached?.window || null,
      error: errorDetail,
    };
  }
}