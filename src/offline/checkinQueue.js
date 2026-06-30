// src/offline/checkinQueue.js

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

const MAX_TRIES = 8;
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

function safeStr(v) {
  return String(v ?? "").trim();
}

function normalizeCode(code) {
  const s = safeStr(code);
  if (!s) return "";
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;
  return String(n).padStart(4, "0");
}

function resolveUserEmail(userOrEmail) {
  if (typeof userOrEmail === "string") {
    return safeStr(userOrEmail).toLowerCase();
  }

  return safeStr(
    userOrEmail?.correo ||
      userOrEmail?.email ||
      userOrEmail?.username ||
      userOrEmail?.preferred_username ||
      userOrEmail?.upn ||
      "",
  ).toLowerCase();
}

export function makeCheckinQueueKey(userEmail) {
  const safe =
    safeStr(userEmail)
      .toLowerCase()
      .trim() || "anon";

  return `checkin_queue_v1_${safe}`;
}

export async function loadCheckinQueue(userEmail) {
  try {
    const key = makeCheckinQueueKey(userEmail);
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.log("[CHECKIN QUEUE] load error:", e?.message || e);
    return [];
  }
}

async function saveCheckinQueue(userEmail, items = []) {
  try {
    const key = makeCheckinQueueKey(userEmail);
    await AsyncStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : []));
    return true;
  } catch (e) {
    console.log("[CHECKIN QUEUE] save error:", e?.message || e);
    return false;
  }
}

export async function enqueueCheckin(userEmail, item = {}) {
  const cleanEmail = resolveUserEmail(userEmail);
  const orderId = safeStr(item?.orderId);
  const photoBase64 = safeStr(item?.photoBase64);

  if (!cleanEmail || !orderId || !photoBase64) {
    console.log("[CHECKIN QUEUE] No se puede encolar. Datos incompletos:", {
      hasEmail: !!cleanEmail,
      orderId,
      hasPhoto: !!photoBase64,
    });

    return await loadCheckinQueue(cleanEmail);
  }

  const q = await loadCheckinQueue(cleanEmail);

  const nextItem = {
    ...item,
    orderId,
    photoBase64,
    statusCode: normalizeCode(item?.statusCode) || "0100",
    lastValidStatus: normalizeCode(item?.lastValidStatus) || "0100",
    createdAt: Number(item?.createdAt || Date.now()),
    updatedAt: Date.now(),
    tries: Number(item?.tries || 0),
    lastError: item?.lastError || null,
  };

  const idx = q.findIndex(
    (x) => safeStr(x?.orderId) === orderId,
  );

  if (idx >= 0) {
    q[idx] = {
      ...q[idx],
      ...nextItem,
      createdAt: q[idx]?.createdAt || nextItem.createdAt,
      tries: Number(q[idx]?.tries || 0),
      lastError: null,
      updatedAt: Date.now(),
    };
  } else {
    q.push(nextItem);
  }

  await saveCheckinQueue(cleanEmail, q);

  console.log("[CHECKIN QUEUE] Encolado:", {
    orderId,
    statusCode: nextItem.statusCode,
    total: q.length,
  });

  return q;
}

export async function removeCheckinFromQueue(userEmail, orderId) {
  const cleanEmail = resolveUserEmail(userEmail);
  const cleanOrderId = safeStr(orderId);

  const q = await loadCheckinQueue(cleanEmail);

  const next = q.filter(
    (x) => safeStr(x?.orderId) !== cleanOrderId,
  );

  await saveCheckinQueue(cleanEmail, next);

  return next;
}

async function postCheckinEvidence(apiInstance, orderId, base64) {
  const cleanOrderId = safeStr(orderId);

  const payload = {
    WorkOrderHeader: {
      Orderid: cleanOrderId,
    },
    Attachments: [
      {
        DocId: cleanOrderId,
        FileName: `CHECKIN_${cleanOrderId}.jpg`,
        MimeType: "image/jpeg",
        Base64: safeStr(base64),
      },
    ],
    Return: [],
  };

  await apiInstance.post(
    "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet?sap-client=400&sap-language=ES",
    payload,
    {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

async function postCheckinStatus(apiInstance, orderId, statusCode = "0100") {
  const cleanOrderId = safeStr(orderId);
  const finalStatus = normalizeCode(statusCode) || "0100";

  /*
    Miguel Ángel Hernández Álvarez - 30/06/2026

    Cambio importante:
    Ya no usamos WorkOrderBulkSet para check-in.
    Usamos WorkOrderSet single order, igual que los otros flujos nuevos.
  */
  const payload = {
    OrderId: cleanOrderId,
    WorkOrderHeader: {
      Orderid: cleanOrderId,
    },
    WorkOrderUserStatusSet: [
      {
        UserStText: finalStatus,
        Langu: "ES",
        Inactive: "",
      },
    ],
    Return: [],
  };

  await apiInstance.post(
    "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet?sap-client=400&sap-language=ES",
    payload,
    {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

export async function getCheckinQueueCount(userEmail) {
  const q = await loadCheckinQueue(userEmail);

  return {
    total: q.length,
    pending: q.filter((x) => Number(x?.tries || 0) < MAX_TRIES).length,
    maxTries: q.filter((x) => Number(x?.tries || 0) >= MAX_TRIES).length,
  };
}

export async function processCheckinQueueForUser(userOrEmail, options = {}) {
  const userEmail = resolveUserEmail(userOrEmail);
  const { apiInstance, ensureValidToken } = options || {};

  if (!userEmail) {
    return {
      ok: false,
      reason: "missing_user_email",
      processed: 0,
      remaining: 0,
    };
  }

  if (!apiInstance) {
    return {
      ok: false,
      reason: "missing_apiInstance",
      processed: 0,
      remaining: 0,
    };
  }

  const net = await NetInfo.fetch();
  const online = !!(net?.isConnected && net?.isInternetReachable !== false);

  if (!online) {
    const q = await loadCheckinQueue(userEmail);

    return {
      ok: false,
      reason: "offline",
      processed: 0,
      remaining: q.length,
    };
  }

  try {
    const tokenOk = await ensureValidToken?.();

    if (tokenOk === false || tokenOk?.ok === false) {
      const q = await loadCheckinQueue(userEmail);

      return {
        ok: false,
        reason: "invalid_token",
        processed: 0,
        remaining: q.length,
      };
    }
  } catch (e) {
    console.log("[CHECKIN QUEUE] ensureValidToken error:", e?.message || e);
  }

  const q = await loadCheckinQueue(userEmail);

  if (!q.length) {
    return {
      ok: true,
      processed: 0,
      failed: 0,
      remaining: 0,
    };
  }

  const ordered = [...q].sort(
    (a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0),
  );

  const keep = [];
  let processed = 0;
  let failed = 0;
  let skippedMaxTries = 0;

  for (const rawItem of ordered) {
    const orderId = safeStr(rawItem?.orderId);
    const photoBase64 = safeStr(rawItem?.photoBase64);
    const tries = Number(rawItem?.tries || 0);

    if (!orderId || !photoBase64) {
      console.log("[CHECKIN QUEUE] Item inválido, se elimina:", {
        orderId,
        hasPhoto: !!photoBase64,
      });
      continue;
    }

    if (tries >= MAX_TRIES) {
      skippedMaxTries++;

      keep.push({
        ...rawItem,
        tries,
        lastError: rawItem?.lastError || "max_tries_reached",
        updatedAt: Date.now(),
      });

      continue;
    }

    try {
      const statusToSend =
        normalizeCode(rawItem?.statusCode) ||
        normalizeCode(rawItem?.lastValidStatus) ||
        "0100";

      console.log("[CHECKIN QUEUE] Enviando check-in:", {
        orderId,
        statusToSend,
        b64Length: photoBase64.length,
        tries,
      });

      await postCheckinEvidence(apiInstance, orderId, photoBase64);
      await postCheckinStatus(apiInstance, orderId, statusToSend);

      processed++;

      console.log("[CHECKIN QUEUE] OK:", {
        orderId,
        statusToSend,
      });
    } catch (e) {
      failed++;

      const lastError =
        e?.response?.data?.error?.message?.value ||
        e?.response?.data?.message ||
        e?.message ||
        "checkin_sync_error";

      console.log("[CHECKIN QUEUE] ERROR:", {
        orderId,
        tries: tries + 1,
        lastError,
      });

      keep.push({
        ...rawItem,
        tries: tries + 1,
        lastError,
        updatedAt: Date.now(),
      });

      /*
        Cortamos en el primer error para no mandar muchas peticiones
        si SAP, token o red están fallando.
      */
      break;
    }
  }

  await saveCheckinQueue(userEmail, keep);

  return {
    ok: true,
    processed,
    failed,
    remaining: keep.length,
    skippedMaxTries,
  };
}