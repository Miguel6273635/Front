// app/ordenes/[id]/secciones/ListaOperacionesDetalle.js
import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* ============================ Helpers ============================ */
function safeStr(v) {
  return String(v ?? "").trim();
}
function normalizeUsr00(op) {
  const v = safeStr(op?.Usr00 ?? op?.usr00);
  return v || "SIN CATEGORÍA";
}
function normalizeActivity(op) {
  return safeStr(op?.activity ?? op?.Activity);
}
function normalizeSubActivity(op) {
  return safeStr(op?.subactivity ?? op?.SubActivity);
}
function normalizeDescription(op) {
  return safeStr(op?.description ?? op?.Description);
}
function normalizeStandardTextKey(op) {
  return safeStr(op?.standardTextKey ?? op?.StandardTextKey);
}
function normalizeEstatus(op) {
  return safeStr(op?.estatus ?? op?.Estatus ?? "").toLowerCase() || "pendiente";
}

/** ✅ Agrupa SOLO por Usr00 */
function agruparPorUsr00(ops = []) {
  const porCategoria = {};

  for (const op of ops || []) {
    const cat = normalizeUsr00(op);
    if (!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push(op);
  }

  const categorias = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b));

  // orden interno: Activity/SubActivity
  for (const cat of categorias) {
    porCategoria[cat].sort((x, y) => {
      const ax = normalizeActivity(x);
      const ay = normalizeActivity(y);
      if (ax !== ay) return ax.localeCompare(ay);
      return normalizeSubActivity(x).localeCompare(normalizeSubActivity(y));
    });
  }

  return { categorias, porCategoria };
}

function calcCatStats(ops = []) {
  const total = ops.length;
  const fin = ops.filter((o) => normalizeEstatus(o) === "finalizada").length;
  const proc = ops.filter((o) => normalizeEstatus(o) === "en_proceso").length;
  const paus = ops.filter((o) => normalizeEstatus(o) === "pausada").length;
  const pend = total - fin - proc - paus;
  return { total, fin, proc, paus, pend };
}

/* ============================ Lista Agrupada (Acordeón) ============================ */
export function ListaOperacionesAgrupadas({ operaciones = [], styles, FIORI }) {
  const grouped = useMemo(() => agruparPorUsr00(operaciones), [operaciones]);

  const [catOpen, setCatOpen] = useState(() => {
    const first = grouped.categorias?.[0] || null;
    return first ? { [first]: true } : {};
  });

  if (!grouped.categorias?.length) {
    return (
      <View style={{ paddingVertical: 10 }}>
        <Text style={{ color: FIORI.textMuted }}>No hay operaciones para mostrar.</Text>
      </View>
    );
  }

  const toggleCat = (cat) => setCatOpen((prev) => ({ ...(prev || {}), [cat]: !prev?.[cat] }));

  return (
    <View style={{ marginTop: 6 }}>
      <Text style={styles.sectionKicker}>OPERACIONES ASIGNADAS</Text>

      <View style={{ gap: 10 }}>
        {grouped.categorias.map((cat) => {
          const isOpen = !!catOpen?.[cat];
          const opsCat = grouped.porCategoria[cat] || [];
          const stats = calcCatStats(opsCat); // (lo dejas por si luego lo usas)

          return (
            <View key={cat} style={styles?.grupoCard}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => toggleCat(cat)}
                style={styles?.grupoHeader}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles?.grupoTitle}>{cat}</Text>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons
                    name={isOpen ? "chevron-up-outline" : "chevron-down-outline"}
                    size={18}
                    color={FIORI.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {isOpen && (
                <View style={{ paddingTop: 10, gap: 8 }}>
                  {opsCat.map((op, idx) => {
                    const activity = normalizeActivity(op);
                    const standardTextKey = normalizeStandardTextKey(op);
                    const sub = normalizeSubActivity(op);
                    const id = op?.id || `${activity}${sub ? `-${sub}` : ""}` || `${cat}-${idx}`;

                    return (
                      <ItemOperacionDetalle
                        key={id}
                        op={{
                          ...op,
                          subactivity: sub,
                          description: normalizeDescription(op),
                          standardTextKey,
                        }}
                        index={idx}
                        styles={styles}
                        FIORI={FIORI}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ============================ Operación compacta (SOLO VISUAL) ============================ */
export function ItemOperacionDetalle({ op, index, styles, FIORI }) {
  const est = normalizeEstatus(op);
  const isFinal = est === "finalizada";
  const isProc = est === "en_proceso";
  const isPause = est === "pausada";

  const badgeBg = isFinal
    ? FIORI.brandSoft
    : isProc
    ? "#E8F5FF"
    : isPause
    ? "#FFF4E5"
    : FIORI.surfaceAlt;

  const badgeText = isFinal ? "FIN" : isProc ? "PROC" : isPause ? "PAUS" : "PEND";

  // ✅ Evitar duplicado: si la descripción ya contiene el StandardTextKey, no lo pintamos aparte
  const desc = normalizeDescription(op);
  const stk = normalizeStandardTextKey(op);

  const descNorm = desc.toLowerCase().trim();
  const stkNorm = stk.toLowerCase().trim();

  // Mostrar STK en negritas solo si existe y NO está ya en la descripción
  const showStkBold = !!stkNorm && !descNorm.includes(stkNorm);

  // Línea “normal” (solo descripción)
  const showDesc = !!descNorm;

  return (
    <View style={[styles.operCardSmall, isFinal && { opacity: 0.95 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.operTitleSmall}>
            #{index + 1} · {safeStr(op?.activity ?? op?.Activity) || "—"}
            {safeStr(op?.subactivity ?? op?.SubActivity)
              ? `-${safeStr(op?.subactivity ?? op?.SubActivity)}`
              : ""}
          </Text>

          {showDesc ? (
            <Text style={styles.operDescSmall} numberOfLines={2}>
              {desc}
            </Text>
          ) : null}

          {showStkBold ? (
            <Text style={[styles.operDescSmall, { fontWeight: "900" }]} numberOfLines={1}>
              {stk}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * ✅ Default export requerido porque está dentro de /app/
 * Expo Router lo interpreta como ruta, aunque sea "secciones".
 * Este componente NO se usa en tu UI; solo evita el warning.
 */
export default function _RouteShim() {
  return null;
}
