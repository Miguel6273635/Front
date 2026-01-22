// app/ordenes/[id]/secciones/ListaOperacionesDetalle.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* ============================ Helpers ============================ */
function safeStr(v) {
  return String(v ?? "").trim();
}
function normalizeUsr00(op) {
  const v = safeStr(op?.Usr00 ?? op?.usr00);
  return v || "SIN CATEGORÍA";
}
function normalizeUsr01(op) {
  const v = safeStr(op?.Usr01 ?? op?.usr01);
  return v || "0";
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
function normalizeEstatus(op) {
  return safeStr(op?.estatus ?? op?.Estatus ?? "").toLowerCase() || "pendiente";
}

/** Agrupa por Usr00 -> Usr01 */
function agruparOperaciones(ops = []) {
  const porCategoria = {};

  for (const op of ops || []) {
    const cat = normalizeUsr00(op);
    const item = normalizeUsr01(op);

    if (!porCategoria[cat]) porCategoria[cat] = { porItem: {}, items: [] };
    if (!porCategoria[cat].porItem[item]) {
      porCategoria[cat].porItem[item] = [];
      porCategoria[cat].items.push(item);
    }
    porCategoria[cat].porItem[item].push(op);
  }

  const categorias = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b));

  for (const cat of categorias) {
    porCategoria[cat].items.sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      const aIsNum = Number.isFinite(na);
      const bIsNum = Number.isFinite(nb);
      if (aIsNum && bIsNum) return na - nb;
      return String(a).localeCompare(String(b));
    });

    for (const item of porCategoria[cat].items) {
      porCategoria[cat].porItem[item].sort((x, y) =>
        normalizeActivity(x).localeCompare(normalizeActivity(y))
      );
    }
  }

  return { categorias, porCategoria };
}

function calcGroupStats(ops = []) {
  const total = ops.length;
  const fin = ops.filter((o) => normalizeEstatus(o) === "finalizada").length;
  const proc = ops.filter((o) => normalizeEstatus(o) === "en_proceso").length;
  const paus = ops.filter((o) => normalizeEstatus(o) === "pausada").length;
  const pend = total - fin - proc - paus;
  return { total, fin, proc, paus, pend };
}

function getGroupActionMode(stats) {
  if (!stats?.total) return "none";
  if (stats.fin === stats.total) return "finalizado";
  if (stats.proc > 0) return "en_proceso";
  return "pendiente_o_pausada";
}

function countDistinctOps(opsDelGrupo = []) {
  const s = new Set();
  for (const op of opsDelGrupo) {
    const act = normalizeActivity(op);
    const sub = normalizeSubActivity(op);
    s.add(`${act}-${sub}`);
  }
  return s.size;
}

function msToHHMMSS(ms) {
  const n = Math.max(0, Number(ms) || 0);
  const totalSec = Math.floor(n / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Suma tiempo de un grupo usando:
 * - workedMs[id] (acumulado)
 * - resumeAtMs[id] (si está en proceso -> corre)
 */
function calcGroupTimeMs({ ordenId, opsDelGrupo, workedMs, resumeAtMs }) {
  const now = Date.now();
  let sum = 0;

  for (const op of opsDelGrupo || []) {
    const activity = normalizeActivity(op);
    const sub = normalizeSubActivity(op);
    const id = `${ordenId}-${activity}${sub ? `-${sub}` : ""}`.replace(/-+$/, "");

    const base = Number(workedMs?.[id] || 0);

    const est = normalizeEstatus(op);
    const runningFrom = est === "en_proceso" ? Number(resumeAtMs?.[id] || 0) : 0;

    const extra = runningFrom ? Math.max(0, now - runningFrom) : 0;
    sum += base + extra;
  }

  return sum;
}

/* ============================ Lista Agrupada (Acordeón) ============================ */
export function ListaOperacionesAgrupadas({
  operaciones = [],
  ordenId,
  styles,
  FIORI,

  userRolId,
  isOpsLocked,
  isNoMant,
  isOrderSinEmpezar,
  isOrderPendiente0100,

  onOpenComponentsView,

  // ✅ tiempos (ya los pasas desde index.js)
  workedMs = {},
  resumeAtMs = {},

  // callbacks ITEM
  onIniciarItem,
  onPausarItem,
  onFinalizarItem,

  // ✅ loading flags (vienen de index.js)
  finalizandoOp,
  sendingPause,
}) {
  const grouped = useMemo(() => agruparOperaciones(operaciones), [operaciones]);

  // tick para que el cronómetro actualice cuando haya ops en proceso
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const hasRunning = (operaciones || []).some((o) => normalizeEstatus(o) === "en_proceso");
    if (!hasRunning) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [operaciones]);

  const [catOpen, setCatOpen] = useState(() => {
    const first = grouped.categorias?.[0] || null;
    return first ? { [first]: true } : {};
  });

  const [itemOpen, setItemOpen] = useState({});

  useEffect(() => {
    const cats = grouped.categorias || [];
    if (!cats.length) return;
    const anyOpen = cats.some((c) => catOpen?.[c]);
    if (!anyOpen) setCatOpen({ [cats[0]]: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.categorias.join("|")]);

  if (!grouped.categorias?.length) {
    return (
      <View style={{ paddingVertical: 10 }}>
        <Text style={{ color: FIORI.textMuted }}>No hay operaciones para mostrar.</Text>
      </View>
    );
  }

  const toggleCat = (cat) => setCatOpen((prev) => ({ ...(prev || {}), [cat]: !prev?.[cat] }));
  const toggleItem = (cat, item) => {
    const key = `${cat}::${item}`;
    setItemOpen((prev) => ({ ...(prev || {}), [key]: !prev?.[key] }));
  };

  const canActions = userRolId === 3 && !isOpsLocked;
  const showLockedHint = !isNoMant && (isOrderSinEmpezar || isOrderPendiente0100);

  const safeCall = (fn, payload, fallbackMsg) => {
    if (typeof fn !== "function") {
      Alert.alert("Falta callback", fallbackMsg || "No hay callback configurado.");
      return;
    }
    try {
      fn(payload);
    } catch (e) {
      console.warn("Callback error:", e);
      Alert.alert("Error", "Ocurrió un error al ejecutar la acción del ITEM.");
    }
  };

  // ✅ busy global (simple) — bloquea mientras pausa/finaliza
  const isBusyGlobal = !!finalizandoOp || !!sendingPause;

  return (
    <View style={{ marginTop: 6 }}>
      <Text style={styles.sectionKicker}>OPERACIONES ASIGNADAS</Text>

      <View style={{ gap: 10 }}>
        {grouped.categorias.map((cat) => {
          const isOpen = !!catOpen?.[cat];
          const catData = grouped.porCategoria[cat];

          const allOpsInCat = catData?.items?.flatMap((it) => catData.porItem[it] || []) || [];
          const statsCat = calcGroupStats(allOpsInCat);

          return (
            <View key={cat} style={styles?.grupoCard}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => toggleCat(cat)}
                style={styles?.grupoHeader}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles?.grupoTitle}>{cat}</Text>
                  <Text style={styles?.grupoMeta}>
                    {statsCat.total} ops · {statsCat.fin} fin · {statsCat.proc} proc · {statsCat.paus} paus
                  </Text>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={styles?.grupoBadge}>
                    <Ionicons name="layers-outline" size={14} color={FIORI.text} />
                    <Text style={styles?.grupoBadgeText}>{statsCat.total}</Text>
                  </View>
                  <Ionicons
                    name={isOpen ? "chevron-up-outline" : "chevron-down-outline"}
                    size={18}
                    color={FIORI.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {isOpen && (
                <View style={{ paddingTop: 8, gap: 10 }}>
                  {(catData?.items || []).map((item) => {
                    const opsDelGrupoRaw = catData.porItem[item] || [];

                    // de-dupe por Activity/SubActivity
                    const seen = new Set();
                    const opsDelGrupo = [];
                    for (const o of opsDelGrupoRaw) {
                      const a = normalizeActivity(o);
                      const s = normalizeSubActivity(o);
                      const k = `${a}::${s}`;
                      if (seen.has(k)) continue;
                      seen.add(k);
                      opsDelGrupo.push(o);
                    }

                    const stats = calcGroupStats(opsDelGrupo);
                    const mode = getGroupActionMode(stats);

                    const itemKey = `${cat}::${item}`;
                    const open = !!itemOpen?.[itemKey];
                    const distinctOps = countDistinctOps(opsDelGrupo);

                    // ✅ tiempo total (re-render con tick)
                    void tick;
                    const totalMs = calcGroupTimeMs({
                      ordenId,
                      opsDelGrupo,
                      workedMs,
                      resumeAtMs,
                    });

                    // ✅ para texto en botones mientras carga
                    const busyLabel =
                      finalizandoOp ? "Finalizando…" : sendingPause ? "Pausando…" : "Procesando…";

                    return (
                      <View
                        key={itemKey}
                        style={[styles?.itemCard, { borderColor: FIORI.borderSoft, borderWidth: 1 }]}
                      >
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => toggleItem(cat, item)}
                          style={styles?.itemHeader}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles?.itemTitle}>ITEM {item}</Text>

                            <Text style={styles?.itemMeta}>
                              {stats.total} ops ({distinctOps} únicas) · {stats.fin} fin · {stats.proc} proc · {stats.paus} paus
                            </Text>

                            <Text
                              style={[
                                styles?.itemMeta,
                                { marginTop: 4, fontWeight: "900", color: FIORI.text },
                              ]}
                            >
                              Tiempo total: {msToHHMMSS(totalMs)}
                              {stats.proc > 0 ? "  (corriendo)" : ""}
                            </Text>
                          </View>

                          <Ionicons
                            name={open ? "chevron-up-outline" : "chevron-down-outline"}
                            size={18}
                            color={FIORI.textMuted}
                          />
                        </TouchableOpacity>

                        {/* Botones únicos por ITEM */}
                        <View style={{ marginTop: 10 }}>
                          {!canActions ? (
                            <View
                              style={[
                                styles.btnPrimary,
                                {
                                  backgroundColor: FIORI.surfaceAlt,
                                  borderWidth: 1,
                                  borderColor: FIORI.border,
                                  opacity: 0.9,
                                },
                              ]}
                            >
                              <Ionicons name="lock-closed-outline" size={16} color={FIORI.textMuted} />
                              <Text style={[styles.btnPrimaryText, { color: FIORI.textMuted }]}>
                                Operaciones bloqueadas
                              </Text>
                            </View>
                          ) : mode === "finalizado" ? (
                            <View
                              style={[
                                styles.btnPrimary,
                                {
                                  backgroundColor: FIORI.surfaceAlt,
                                  borderWidth: 1,
                                  borderColor: FIORI.border,
                                },
                              ]}
                            >
                              <Ionicons name="checkmark-done-outline" size={16} color={FIORI.ok} />
                              <Text style={[styles.btnPrimaryText, { color: FIORI.textMuted }]}>
                                ITEM finalizado
                              </Text>
                            </View>
                          ) : mode === "en_proceso" ? (
                            <View style={{ flexDirection: "row", gap: 10 }}>
                              <TouchableOpacity
                                disabled={isBusyGlobal}
                                style={[
                                  styles.btnPrimary,
                                  {
                                    backgroundColor: FIORI.pause,
                                    flex: 1,
                                    opacity: isBusyGlobal ? 0.6 : 1,
                                  },
                                ]}
                                onPress={() => {
                                  if (isBusyGlobal) return;

                                  Alert.alert(
                                    "Pausar ITEM",
                                    `¿Pausar todas las actividades del ITEM ${item}?`,
                                    [
                                      { text: "Cancelar", style: "cancel" },
                                      {
                                        text: "Pausar",
                                        onPress: () =>
                                          safeCall(
                                            onPausarItem,
                                            { categoria: cat, item, opsDelGrupo },
                                            "No se pasó onPausarItem desde index.js"
                                          ),
                                      },
                                    ]
                                  );
                                }}
                              >
                                {isBusyGlobal ? (
                                  <>
                                    <ActivityIndicator size="small" color="#fff" />
                                    <Text style={styles.btnPrimaryText}>{busyLabel}</Text>
                                  </>
                                ) : (
                                  <>
                                    <Ionicons name="pause-circle-outline" size={16} color="#fff" />
                                    <Text style={styles.btnPrimaryText}>Pausar ITEM</Text>
                                  </>
                                )}
                              </TouchableOpacity>

                              <TouchableOpacity
                                disabled={isBusyGlobal}
                                style={[
                                  styles.btnPrimary,
                                  {
                                    backgroundColor: FIORI.ok,
                                    flex: 1,
                                    opacity: isBusyGlobal ? 0.6 : 1,
                                  },
                                ]}
                                onPress={() => {
                                  if (isBusyGlobal) return;

                                  Alert.alert(
                                    "Finalizar ITEM",
                                    `¿Finalizar todas las actividades del ITEM ${item}?`,
                                    [
                                      { text: "Cancelar", style: "cancel" },
                                      {
                                        text: "Finalizar",
                                        onPress: () =>
                                          safeCall(
                                            onFinalizarItem,
                                            { categoria: cat, item, opsDelGrupo },
                                            "No se pasó onFinalizarItem desde index.js"
                                          ),
                                      },
                                    ]
                                  );
                                }}
                              >
                                {isBusyGlobal ? (
                                  <>
                                    <ActivityIndicator size="small" color="#fff" />
                                    <Text style={styles.btnPrimaryText}>{busyLabel}</Text>
                                  </>
                                ) : (
                                  <>
                                    <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
                                    <Text style={styles.btnPrimaryText}>Finalizar ITEM</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              disabled={isBusyGlobal}
                              style={[styles.btnPrimary, { opacity: isBusyGlobal ? 0.6 : 1 }]}
                              onPress={() => {
                                if (isBusyGlobal) return;

                                const label = stats.paus > 0 ? "Reanudar" : "Iniciar";
                                Alert.alert(
                                  `${label} ITEM`,
                                  `¿Deseas ${label.toLowerCase()} todas las actividades del ITEM ${item}?`,
                                  [
                                    { text: "Cancelar", style: "cancel" },
                                    {
                                      text: label,
                                      onPress: () =>
                                        safeCall(
                                          onIniciarItem,
                                          { categoria: cat, item, opsDelGrupo },
                                          "No se pasó onIniciarItem desde index.js"
                                        ),
                                    },
                                  ]
                                );
                              }}
                            >
                              {isBusyGlobal ? (
                                <>
                                  <ActivityIndicator size="small" color="#fff" />
                                  <Text style={styles.btnPrimaryText}>Procesando…</Text>
                                </>
                              ) : (
                                <>
                                  <Ionicons name="play-outline" size={16} color="#fff" />
                                  <Text style={styles.btnPrimaryText}>
                                    {stats.paus > 0 ? "Reanudar ITEM" : "Iniciar ITEM"}
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Operaciones (compactas) */}
                        {open && (
                          <View style={{ marginTop: 10, gap: 8 }}>
                            {opsDelGrupo.map((op, idx) => {
                              const activity = normalizeActivity(op);
                              const sub = normalizeSubActivity(op);
                              const effId = `${ordenId}-${activity}${sub ? `-${sub}` : ""}`.replace(/-+$/, "");

                              return (
                                <ItemOperacionDetalle
                                  key={effId || `${cat}-${item}-${idx}`}
                                  op={{
                                    ...op,
                                    activity,
                                    subactivity: sub,
                                    description: normalizeDescription(op),
                                  }}
                                  index={idx}
                                  styles={styles}
                                  FIORI={FIORI}
                                  onOpenComponentsView={onOpenComponentsView}
                                />
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {showLockedHint && (
        <Text style={styles.operLocked}>
          Las operaciones están bloqueadas mientras la orden esté en estatus pendiente (0100).
        </Text>
      )}
    </View>
  );
}

/* ============================ Operación compacta ============================ */
export function ItemOperacionDetalle({ op, index, styles, FIORI, onOpenComponentsView }) {
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

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => onOpenComponentsView?.(op)}
      style={[styles.operCardSmall, isFinal && { opacity: 0.9 }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={[styles.badgeSmall, { backgroundColor: badgeBg, borderColor: FIORI.borderSoft }]}>
          <Text style={styles.badgeSmallText}>{badgeText}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.operTitleSmall}>
            #{index + 1} · {normalizeActivity(op)}
          </Text>

          {!!normalizeDescription(op) && (
            <Text style={styles.operDescSmall} numberOfLines={2}>
              {normalizeDescription(op)}
            </Text>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <Ionicons name="pricetags-outline" size={13} color={FIORI.textMuted} />
            <Text style={styles.operHintSmall}>Ver materiales</Text>
          </View>
        </View>

        <Ionicons name="chevron-forward-outline" size={18} color={FIORI.textMuted} />
      </View>
    </TouchableOpacity>
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
