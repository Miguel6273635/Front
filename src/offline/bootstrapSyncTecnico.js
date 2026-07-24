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

import {
  getLocalStatusPatch,
  applyStatusPatchToOrdenes,
  reconcileStatusPatchesWithSap,
} from "./ordenesTecnicoLocalPatch";

import { prefetchOrdenesTecnicoDetalles } from "./prefetchOrdenesTecnico";

import api from "../services/api";

/**
 * Normaliza las propiedades de cada orden.
 *
 * SAP y el backend pueden mandar propiedades con nombres distintos.
 * Esta función crea una estructura consistente.
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
 * Obtiene todos los OrderId válidos de una lista.
 */
function getOrderIds(orders = []) {
  return Array.from(
    new Set(
      (Array.isArray(orders) ? orders : [])
        .map((item) =>
          String(
            item?.Orderid ||
              item?.OrderId ||
              item?.orderid ||
              "",
          ).trim(),
        )
        .filter(Boolean),
    ),
  );
}

/**
 * Aplica los cambios locales pendientes a una lista.
 *
 * Esto evita que una respuesta atrasada de SAP haga retroceder:
 *
 * 0300 -> 0200
 * 0300 -> 0100
 * 0400 -> 0200
 * 0200 -> 0100
 */
async function applyLocalStatuses(userEmail, orders = []) {
  try {
    const patchMap = await getLocalStatusPatch(userEmail);

    return applyStatusPatchToOrdenes(
      Array.isArray(orders) ? orders : [],
      patchMap,
    );
  } catch (error) {
    console.log(
      "[BOOTSTRAP TECNICO] No se pudieron aplicar parches locales:",
      error?.message || error,
    );

    return Array.isArray(orders) ? orders : [];
  }
}

/**
 * Inicia la precarga de detalles sin detener la carga de la lista.
 *
 * La función de precarga revisa cuáles detalles ya existen y solamente
 * descarga los faltantes o vencidos.
 */
function startDetailsPrefetch({
  orderIds,
  statusByOrderId = {},
  ttlMs,
  reason,
  force = false,
}) {
  if (!Array.isArray(orderIds) || !orderIds.length) {
    return;
  }

  console.log("[BOOTSTRAP TECNICO] Iniciando precarga:", {
    reason,
    total: orderIds.length,
  });

  prefetchOrdenesTecnicoDetalles({
    orderIds,
    statusByOrderId,
    concurrency: 3,
    force,
    ttlMs,
  })
    .then((result) => {
      console.log(
        "[BOOTSTRAP TECNICO] Resultado precarga:",
        {
          reason,
          ...result,
        },
      );
    })
    .catch((error) => {
      console.log(
        "[BOOTSTRAP TECNICO] Error precargando detalles:",
        {
          reason,
          error: error?.message || error,
        },
      );
    });
}

/**
 * Sincroniza las órdenes del técnico.
 *
 * force=false:
 *   Respeta la caché de una hora para la lista.
 *
 * force=true:
 *   Consulta SAP aunque la lista sea reciente.
 *
 * prefetchDetails=true:
 *   Revisa y precarga los detalles faltantes en segundo plano.
 */
export async function bootstrapPrefetchOrdenesTecnico(
  userEmail,
  {
    force = false,
    prefetchDetails = true,
    ttlMs = ORDENES_CACHE_TTL_MS,
  } = {},
) {
  const cleanEmail = String(userEmail || "")
    .trim()
    .toLowerCase();

  if (!cleanEmail) {
    return {
      ok: false,
      reason: "missing_user",
      source: "none",
      data: [],
    };
  }

  /*
   * Primero obtenemos la lista guardada.
   */
  const cached = await loadOrdenesTecnicoList(cleanEmail);

  const hasCachedList =
    cached &&
    Array.isArray(cached.data);

  const rawCachedData = hasCachedList
    ? cached.data
    : [];

  /*
   * Incluso la caché debe combinarse con los parches locales.
   */
  const cachedData = await applyLocalStatuses(
    cleanEmail,
    rawCachedData,
  );

  const cachedIsFresh = isCacheFresh(
    cached?.updatedAt,
    ttlMs,
  );

  /*
   * Si la lista tiene menos de una hora, no consultamos SAP.
   *
   * Sin embargo, sí revisamos todos los detalles. Esto permite
   * continuar una precarga que haya quedado incompleta.
   */
  if (!force && hasCachedList && cachedIsFresh) {
    console.log(
      "[BOOTSTRAP TECNICO] Usando caché vigente:",
      {
        count: cachedData.length,
        updatedAt: cached?.updatedAt,
      },
    );

    const orderIds = getOrderIds(cachedData);

    if (prefetchDetails) {
      startDetailsPrefetch({
        orderIds,
        ttlMs,
        reason: "cache_fresh",
      });
    }

    return {
      ok: true,
      reason: "cache_fresh",
      source: "cache",
      updatedAt: cached?.updatedAt || null,
      count: cachedData.length,
      data: cachedData,
      orderIds,
      window: cached?.window || null,
    };
  }

  /*
   * La lista no existe, está vencida o el usuario solicitó
   * una actualización manual.
   */
  const online = await isOnline();

  /*
   * Sin conexión no borramos nada.
   *
   * Regresamos la lista guardada con los estatus locales aplicados.
   */
  if (!online) {
    console.log(
      "[BOOTSTRAP TECNICO] Sin conexión:",
      {
        hasCachedList,
        count: cachedData.length,
      },
    );

    return {
      ok: hasCachedList,
      reason: "offline",
      source: hasCachedList ? "cache" : "none",
      updatedAt: cached?.updatedAt || null,
      count: cachedData.length,
      data: cachedData,
      orderIds: getOrderIds(cachedData),
      window: cached?.window || null,
    };
  }

  /*
   * Ventana offline:
   * 30 días anteriores y 8 días posteriores.
   */
  const window = buildOfflineWindow(new Date());

  const params = new URLSearchParams({
    start: window.startStr,
    end: window.endStr,
    mode: "range",
  });

  console.log(
    "[BOOTSTRAP TECNICO] Consultando SAP:",
    {
      start: window.startStr,
      end: window.endStr,
      force,
    },
  );

  try {
    /*
     * No enviamos el usuario por query.
     * El backend obtiene el correo desde el token Azure.
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

    /*
     * Segunda validación de fechas en la aplicación.
     */
    const sapOrdersInWindow = filterOrdenesByWindow(
      normalizedRows,
      window.start,
      window.end,
    );

    /*
     * Paso importante:
     *
     * La respuesta de SAP se reconcilia contra la cola real.
     * Solo un cambio todavía pendiente o dentro de la breve gracia
     * posterior al envío puede conservar prioridad sobre SAP.
     */
    const effectiveOrders = await reconcileStatusPatchesWithSap(
      cleanEmail,
      sapOrdersInWindow,
    );

    /*
     * Guardamos la lista ya reconciliada.
     */
    await saveOrdenesTecnicoList(
      cleanEmail,
      effectiveOrders,
      window,
    );

    const orderIds = getOrderIds(effectiveOrders);

    /*
     * Conserva exactamente el estatus efectivo que acaba de quedar en
     * el index. La precarga puede consultar un endpoint de detalle que
     * todavía devuelva un estado anterior; estas pistas impiden que ese
     * resultado vuelva a sobrescribir el estado ya reconciliado.
     */
    const statusByOrderId = Object.fromEntries(
      effectiveOrders
        .map((order) => {
          const orderId = String(
            order?.Orderid || order?.OrderId || order?.orderid || "",
          ).trim();

          if (!orderId) return null;

          return [
            orderId,
            {
              estatus_code: order?.estatus_code ?? null,
              userstatus:
                order?.userstatus ??
                order?.Userstatus ??
                order?.UserStatus ??
                order?.UserStText ??
                null,
              estatus_label: order?.estatus_label ?? null,
              isPendingSignature: order?.isPendingSignature,
              isFinal: order?.isFinal,
              checkin_done: order?.checkin_done,
            },
          ];
        })
        .filter(Boolean),
    );

    /*
     * Elimina detalles que ya no pertenecen a la ventana actual.
     */
    await pruneDetallesNoUsados(orderIds);

    /*
     * Precarga detalles en segundo plano.
     *
     * No usamos await porque la lista debe aparecer inmediatamente.
     */
    if (prefetchDetails) {
      startDetailsPrefetch({
        orderIds,
        statusByOrderId,
        ttlMs,
        reason: "sap_updated",
        force,
      });
    }

    console.log(
      "[BOOTSTRAP TECNICO] Lista actualizada:",
      {
        count: effectiveOrders.length,
        start: window.startStr,
        end: window.endStr,
      },
    );

    return {
      ok: true,
      reason: "sap_updated",
      source: "sap",
      updatedAt: Date.now(),
      count: effectiveOrders.length,
      data: effectiveOrders,
      orderIds,
      window,
    };
  } catch (error) {
    /*
     * Si SAP o la API fallan, conservamos la lista anterior
     * y también conservamos sus estatus locales.
     */
    const errorDetail =
      error?.response?.data ||
      error?.message ||
      String(error);

    console.log(
      "[BOOTSTRAP TECNICO] Error consultando SAP:",
      errorDetail,
    );

    /*
     * Aunque la lista SAP falle, intentamos continuar la precarga
     * de los detalles que todavía falten si existe conexión parcial.
     */
    const orderIds = getOrderIds(cachedData);

    if (prefetchDetails && orderIds.length > 0) {
      startDetailsPrefetch({
        orderIds,
        ttlMs,
        reason: "sap_error_cached_list",
      });
    }

    return {
      ok: hasCachedList,
      reason: "sap_error",
      source: hasCachedList ? "cache" : "none",
      updatedAt: cached?.updatedAt || null,
      count: cachedData.length,
      data: cachedData,
      orderIds,
      window: cached?.window || null,
      error: errorDetail,
    };
  }
}