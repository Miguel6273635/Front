// app/ordenes/[id]/secciones/ListaOperacionesDetalle.js
import React, { useMemo, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* ============================ Helpers ============================ */
function safeStr(v) {
  return String(v ?? "").trim();
}

function normalizeUsr00(op) {
  const v = safeStr(op?.Usr00 ?? op?.usr00);
  return v || "SIN IDENTIFICADOR";
}

function normalizeUsr01(op) {
  const v = safeStr(op?.Usr01 ?? op?.usr01);
  return v || "SIN ITEM";
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

/**
 * ✅ Orden inteligente para item:
 * - si es número, ordena numérico
 * - si no, ordena alfabético
 */
function sortItemKey(a, b) {
  const an = Number(a);
  const bn = Number(b);
  const aIsNum = Number.isFinite(an) && String(an) === a;
  const bIsNum = Number.isFinite(bn) && String(bn) === b;

  if (aIsNum && bIsNum) return an - bn;
  if (aIsNum && !bIsNum) return -1;
  if (!aIsNum && bIsNum) return 1;
  return a.localeCompare(b);
}

/**
 * ✅ ID estable "fallback" si no viene id del backend
 * - Si viene op.id real, se respeta
 * - Si NO viene, genera MISMO FORMATO que tu index:
 *   `${orderId}-${activity}-${subactivity?}`
 *
 * Esto evita que en OFFLINE los checks guarden ids que luego NO hacen match
 * al finalizar (prorrateo).
 */
function opStableId(orderId, op, idx) {
  const existing = safeStr(op?.id);
  if (existing) return existing;

  const activity = normalizeActivity(op);
  const sub = normalizeSubActivity(op);

  const oid = safeStr(orderId);
  const key = `${oid}-${activity}${sub ? `-${sub}` : ""}`.trim();

  // Fallback extremo (si viniera activity vacío)
  return key && key !== "-" ? key : `fallback__${idx}`;
}

/** ==========================================================
 * ✅ Agrupar:
 *  1) Usr00 (identificador global)
 *  2) Usr01 (ITEM)
 * ========================================================== */
function agruparPorUsr00YUsr01(ops = []) {
  const porCategoria = {};

  for (const op of ops || []) {
    const cat = normalizeUsr00(op); //Usr00 (Global)
    const item = normalizeUsr01(op); //Usr01 (ITEM)

    if (!porCategoria[cat]) porCategoria[cat] = {};
    if (!porCategoria[cat][item]) porCategoria[cat][item] = [];
    porCategoria[cat][item].push(op);
  }

  const categorias = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b));

  for (const cat of categorias) {
    const itemsObj = porCategoria[cat];
    const itemKeys = Object.keys(itemsObj).sort(sortItemKey);

    const ordered = {};
    for (const itemKey of itemKeys) {
      const arr = itemsObj[itemKey] || [];

      arr.sort((x, y) => {
        const ax = normalizeActivity(x);
        const ay = normalizeActivity(y);
        if (ax !== ay) return ax.localeCompare(ay);
        return normalizeSubActivity(x).localeCompare(normalizeSubActivity(y));
      });

      ordered[itemKey] = arr;
    }
    porCategoria[cat] = ordered;
  }

  return { categorias, porCategoria };
}

/* ============================ Lista Agrupada ============================ */
export function ListaOperacionesAgrupadas({
  operaciones = [],
  styles,
  FIORI,

  finalizeMode = false,
  onRequestCancelFinalize,

  // ✅ vienen del padre
  checkedMap = {},
  setCheckedMap,

  // ✅ NUEVO: para que el fallback id tenga el formato correcto
  orderId,
}) {
  const grouped = useMemo(() => agruparPorUsr00YUsr01(operaciones), [operaciones]);

  const [catOpen, setCatOpen] = useState(() => {
    const first = grouped.categorias?.[0] || null;
    return first ? { [first]: true } : {};
  });

  const [itemOpen, setItemOpen] = useState(() => {
    const firstCat = grouped.categorias?.[0];
    if (!firstCat) return {};
    const itemsObj = grouped.porCategoria?.[firstCat] || {};
    const firstItem = Object.keys(itemsObj)?.[0];
    if (!firstItem) return {};
    return { [`${firstCat}__${firstItem}`]: true };
  });

  // ✅ si sales de finalizeMode => NO limpiamos aquí forzosamente (el padre decide)
  useEffect(() => {
    if (!finalizeMode) {
      // opcional: el padre normalmente limpia al cancelar
      // setCheckedMap?.({});
    }
  }, [finalizeMode, setCheckedMap]);

  // Rehidratar open states
  useEffect(() => {
    const firstCat = grouped.categorias?.[0];
    if (!firstCat) return;

    setCatOpen((prev) => {
      if (prev && Object.keys(prev).length) return prev;
      return { [firstCat]: true };
    });

    const itemsObj = grouped.porCategoria?.[firstCat] || {};
    const firstItem = Object.keys(itemsObj)?.[0];
    if (!firstItem) return;

    setItemOpen((prev) => {
      if (prev && Object.keys(prev).length) return prev;
      return { [`${firstCat}__${firstItem}`]: true };
    });
  }, [grouped.categorias, grouped.porCategoria]);

  if (!grouped.categorias?.length) {
    return (
      <View style={{ paddingVertical: 10 }}>
        <Text style={{ color: FIORI.textMuted }}>No hay operaciones para mostrar.</Text>
      </View>
    );
  }

  const toggleCat = (cat) => setCatOpen((prev) => ({ ...(prev || {}), [cat]: !prev?.[cat] }));

  const toggleItem = (cat, item) => {
    const k = `${cat}__${item}`;
    setItemOpen((prev) => ({ ...(prev || {}), [k]: !prev?.[k] }));
  };

  const isOpChecked = (opId) => !!checkedMap?.[opId];

  const setManyChecked = (opIds, value) => {
    setCheckedMap?.((prev) => {
      const next = { ...(prev || {}) };
      for (const id of opIds) {
        if (value) next[id] = true;
        else delete next[id];
      }
      return next;
    });
  };

  const toggleOpChecked = (opId) => {
    setCheckedMap?.((prev) => {
      const next = { ...(prev || {}) };
      if (next[opId]) delete next[opId];
      else next[opId] = true;
      return next;
    });
  };

  const confirmCancelFinalize = () => {
    Alert.alert(
      "Cancelar finalización",
      "Esto quitará todos los checks marcados. El cronómetro seguirá normal. ¿Deseas continuar?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: () => {
            setCheckedMap?.({});
            onRequestCancelFinalize?.();
          },
        },
      ]
    );
  };

  return (
    <View style={{ marginTop: 6 }}>
      {finalizeMode ? (
        <View
          style={{
            marginTop: 8,
            marginBottom: 8,
            padding: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: FIORI.borderSoft,
            backgroundColor: FIORI.brandSoft,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Ionicons name="checkbox-outline" size={18} color={FIORI.brand} />
            <Text style={{ fontWeight: "900", color: FIORI.text }}>
              Modo finalizar: marca las actividades realizadas
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={confirmCancelFinalize}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: FIORI.borderSoft,
              backgroundColor: "#FFECEC",
            }}
          >
            <Text style={{ fontWeight: "900", color: FIORI.err, fontSize: 12 }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        {grouped.categorias.map((cat) => {
          const isCatOpen = !!catOpen?.[cat];
          const itemsObj = grouped.porCategoria[cat] || {};
          const itemKeys = Object.keys(itemsObj);

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

                <Ionicons
                  name={isCatOpen ? "chevron-up-outline" : "chevron-down-outline"}
                  size={18}
                  color={FIORI.textMuted}
                />
              </TouchableOpacity>

              {isCatOpen && (
                <View style={{ paddingTop: 10, gap: 10 }}>
                  {itemKeys.map((itemKey) => {
                    const opsItem = itemsObj[itemKey] || [];
                    const k = `${cat}__${itemKey}`;
                    const isItemOpen = !!itemOpen?.[k];

                    // ✅ IDs SIEMPRE consistentes:
                    // - si op.id existe => se usa
                    // - si NO existe => fallback = `${orderId}-${activity}-${sub}`
                    const opIds = opsItem.map((op, idx) => opStableId(orderId, op, idx));

                    const checkedCount = opIds.filter((id) => isOpChecked(id)).length;
                    const allChecked = opIds.length > 0 && checkedCount === opIds.length;
                    const someChecked = checkedCount > 0 && !allChecked;

                    const itemCheckIcon = allChecked
                      ? "checkbox"
                      : someChecked
                      ? "remove-circle-outline"
                      : "square-outline";

                    return (
                      <View
                        key={k}
                        style={{
                          borderWidth: 1,
                          borderColor: FIORI.borderSoft,
                          backgroundColor: FIORI.surfaceAlt,
                          borderRadius: 12,
                          padding: 10,
                        }}
                      >
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => toggleItem(cat, itemKey)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: "900", color: FIORI.text, fontSize: 13 }}>
                              ITEM {itemKey}
                            </Text>
                          </View>

                          <Ionicons
                            name={isItemOpen ? "chevron-up-outline" : "chevron-down-outline"}
                            size={18}
                            color={FIORI.textMuted}
                          />
                        </TouchableOpacity>

                        {finalizeMode ? (
                          <View
                            style={{
                              marginTop: 10,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              gap: 10,
                            }}
                          >
                            <TouchableOpacity
                              activeOpacity={0.9}
                              onPress={() => setManyChecked(opIds, !allChecked)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: FIORI.borderSoft,
                                backgroundColor: allChecked ? FIORI.brandSoft : FIORI.surface,
                              }}
                            >
                              <Ionicons
                                name={itemCheckIcon}
                                size={20}
                                color={allChecked || someChecked ? FIORI.brand : FIORI.textMuted}
                              />
                              <Text style={{ fontWeight: "900", color: FIORI.text, fontSize: 12 }}>
                                Marcar todo el ITEM
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}

                        {isItemOpen && (
                          <View style={{ paddingTop: 10, gap: 8 }}>
                            {opsItem.map((op, idx) => {
                              const realId = opStableId(orderId, op, idx);
                              const checked = isOpChecked(realId);

                              return (
                                <ItemOperacionDetalle
                                  key={realId}
                                  op={{
                                    ...op,
                                    // ✅ normalizamos campos para UI, pero NO tocamos op.id
                                    activity: normalizeActivity(op),
                                    subactivity: normalizeSubActivity(op),
                                    description: normalizeDescription(op),
                                    standardTextKey: normalizeStandardTextKey(op),
                                  }}
                                  index={idx}
                                  styles={styles}
                                  FIORI={FIORI}
                                  allowChecks={finalizeMode}
                                  checked={checked}
                                  onToggleCheck={() => toggleOpChecked(realId)}
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
    </View>
  );
}

/* ============================ Operación compacta ============================ */
export function ItemOperacionDetalle({
  op,
  index,
  styles,
  FIORI,
  allowChecks = false,
  checked = false,
  onToggleCheck,
}) {
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

  const desc = normalizeDescription(op);
  const stk = normalizeStandardTextKey(op);

  const descNorm = desc.toLowerCase().trim();
  const stkNorm = stk.toLowerCase().trim();

  const showStkBold = !!stkNorm && !descNorm.includes(stkNorm);
  const showDesc = !!descNorm;

  const act = safeStr(op?.activity ?? op?.Activity) || "—";
  const sub = safeStr(op?.subactivity ?? op?.SubActivity);

  const cardBg = checked ? FIORI.brandSoft : FIORI.surface;

  return (
    <View
      style={[
        styles.operCardSmall,
        {
          backgroundColor: cardBg,
          borderColor: checked ? FIORI.brand : FIORI.borderSoft,
          borderWidth: 1,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {allowChecks ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onToggleCheck}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: checked ? FIORI.brand : FIORI.borderSoft,
              backgroundColor: checked ? FIORI.surface : FIORI.surfaceAlt,
            }}
          >
            <Ionicons
              name={checked ? "checkbox" : "square-outline"}
              size={20}
              color={checked ? FIORI.brand : FIORI.textMuted}
            />
          </TouchableOpacity>
        ) : null}

        <View style={[styles.badgeSmall, { backgroundColor: badgeBg, borderColor: FIORI.borderSoft }]}>
          <Text style={styles.badgeSmallText}>{badgeText}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.operTitleSmall}>
            #{index + 1} · {act}
            {sub ? `-${sub}` : ""}
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
 */
export default function _RouteShim() {
  return null;
}
