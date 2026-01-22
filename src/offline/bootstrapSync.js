// src/offline/bootstrapSync.js
import { isOnline } from "./net";
import { fetchOrdenesSupervisor } from "../services/ordenesSupervisor";

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function bootstrapPrefetchOrdenesSupervisor() {
  const online = await isOnline();
  if (!online) return { ok: false, reason: "offline" };

  const t = new Date();
  const s = new Date(t);
  const e = new Date(t);
  s.setDate(s.getDate() - 8);
  e.setDate(e.getDate() + 8);

  const start = ymd(s);
  const end = ymd(e);

  const arr = await fetchOrdenesSupervisor(start, end, "range");

  return { ok: true, start, end, count: Array.isArray(arr) ? arr.length : 0 };
}
