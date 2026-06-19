// src/offline/syncEngine.js
import {
  outboxList,
  outboxMarkSending,
  outboxMarkSent,
  outboxMarkError,
  outboxDeleteSent,
} from "./db";

import { isStableNetwork } from "./net";

// apiInstance = tu axios de src/services/api.js
export async function runOutboxSync(apiInstance, { limit = 10 } = {}) {
  const stable = await isStableNetwork();

  if (!stable) {
    return {
      ok: false,
      reason: "network_not_stable",
      processed: 0,
    };
  }

  const items = await outboxList(limit);

  if (!items.length) {
    return {
      ok: true,
      processed: 0,
      reason: "empty_outbox",
    };
  }

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    const req = item.request;

    if (!req?.method || !req?.url) {
      await outboxMarkError(item.id, "request inválido");
      failed += 1;
      continue;
    }

    try {
      await outboxMarkSending(item.id);

      const method = String(req.method).toLowerCase();

      // Quitamos Authorization viejo.
      // El interceptor de api.js pondrá el token actual.
      const cleanHeaders = req.headers ? { ...req.headers } : {};

      delete cleanHeaders.Authorization;
      delete cleanHeaders.authorization;

      const config = {
        url: req.url,
        method,
        data: req.body ?? undefined,
        params: req.params ?? undefined,
        headers: Object.keys(cleanHeaders).length > 0 ? cleanHeaders : undefined,
      };

      await apiInstance.request(config);

      await outboxMarkSent(item.id);
      processed += 1;
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;

      const msg = status
        ? `HTTP ${status} ${JSON.stringify(data).slice(0, 300)}`
        : e?.message || "error";

      await outboxMarkError(item.id, msg);
      failed += 1;

      if (!status) {
        console.log(
          "[SYNC ENGINE] Red inestable o petición no llegó al servidor. Se detiene la cola.",
        );
        break;
      }

      if (status === 401) {
        console.log("[SYNC ENGINE] 401 detectado. Se detiene la cola.");
        break;
      }
    }
  }

  await outboxDeleteSent();

  return {
    ok: true,
    processed,
    failed,
  };
}