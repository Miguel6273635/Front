import api from "../services/api";
import { saveOrdenTecnicoDetail } from "./ordenesTecnicoCache";

function pickSecondAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results.length >= 2 ? results[1] : results[0];
}

function mapDireccionLikeBackend(addr) {
  if (!addr) return { cliente: "", direccion: "" };

  const Name1 = addr.Name1 ?? "";
  const Name2 = addr.Name2 ?? "";
  const Street = addr.Street ?? addr.StreetName ?? "";
  const HouseNum1 = addr.HouseNum1 ?? "";
  const StrSuppl3 = addr.StrSuppl3 ?? "";
  const Location = addr.Location ?? "";
  const City1 = addr.City1 ?? "";
  const Region = addr.Region ?? "";
  const PostCode1 = addr.PostCode1 ?? "";
  const Country = addr.Country ?? "";

  const cliente = [Name1, Name2].filter(Boolean).join(" ").trim();
  const direccion = [
    `${Street} ${HouseNum1}`.trim(),
    StrSuppl3,
    Location,
    City1,
    Region,
    PostCode1,
    Country,
  ]
    .filter((x) => x && String(x).trim().length > 0)
    .join(", ");

  return { cliente, direccion };
}

function normalizeOpsFromBackend(ops = []) {
  if (!Array.isArray(ops)) return [];
  return ops.map((op) => {
    const Activity = op.Activity || op.activity || op.Vornr || "";
    const SubActivity = op.SubActivity || op.subactivity || op.Uvorn || "";
    const Description = op.Description || op.description || op.Ltxa1 || "";
    const StandardTextKey = op.StandardTextKey || op.standardTextKey || "";

    return {
      ...op,
      activity: String(Activity || ""),
      subactivity: String(SubActivity || ""),
      description: String(Description || ""),
      standardTextKey: String(StandardTextKey || ""),
      Activity: String(Activity || ""),
      SubActivity: String(SubActivity || ""),
      Description: String(Description || ""),
      StandardTextKey: String(StandardTextKey || ""),
    };
  });
}

export async function prefetchOrdenesTecnicoDetalles({ orderIds = [], token, concurrency = 3 }) {
  const ids = [...new Set(orderIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return { ok: 0, fail: 0 };

  let ok = 0, fail = 0;
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const orderId = ids[idx];

      try {
        // 1) detalle base
        const resOrden = await api.get(`/api/ordenes/sap/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const baseOrden = resOrden.data || {};

        // 2) addresses (cliente + direccion)
        let direccionSap = "";
        let clienteSap = "";
        try {
          const resAddr = await api.get(`/api/ordenes/sap/${orderId}/addresses`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const results = resAddr?.data?.results || resAddr?.data?.d?.results || [];
          const chosen = pickSecondAddress(results);
          const mapped = mapDireccionLikeBackend(chosen);
          direccionSap = mapped.direccion || "";
          clienteSap = mapped.cliente || "";
        } catch {}

        // 3) operaciones
        let ops = [];
        try {
          const resOps = await api.get(`/api/operaciones/sap/${orderId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          ops = normalizeOpsFromBackend(resOps.data);
        } catch {
          ops = normalizeOpsFromBackend(baseOrden?.operaciones || []);
        }

        // shape final (como DetalleOrden)
        const detail = {
          ...baseOrden,
          Orderid: String(baseOrden?.Orderid || baseOrden?.OrderId || orderId),
          cliente:
            clienteSap ||
            baseOrden?.cliente ||
            `${baseOrden?.Name1 ?? ""} ${baseOrden?.Name2 ?? ""}`.trim(),
          direccion:
            direccionSap ||
            baseOrden?.direccion ||
            baseOrden?.address ||
            baseOrden?.partner_address ||
            "",
          operaciones: ops,
        };

        await saveOrdenTecnicoDetail(orderId, detail);
        ok++;
      } catch {
        fail++;
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return { ok, fail };
}
