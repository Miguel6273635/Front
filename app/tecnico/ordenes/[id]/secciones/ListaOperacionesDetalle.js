// app/ordenes/[id]/secciones/ListaOperacionesDetalle.js
import React, { useMemo, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* ============================ Helpers ============================ */
function safeStr(v) {
  return String(v ?? "").trim();
}

function normalizeUsr02(op) {
  const v = safeStr(op?.Usr02 ?? op?.usr02);
  return v || "SIN UBICACIÓN";
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
 * ✅ Detecta la categoría visual de la operación.
 * Principalmente usa StandardTextKey porque es el texto que ya muestras abajo.
 * Si no viene, intenta usar otros posibles campos.
 */
function normalizeCategoria(op) {
  const categoria =
    safeStr(op?.standardTextKey ?? op?.StandardTextKey) ||
    safeStr(op?.categoria ?? op?.Categoria) ||
    safeStr(op?.category ?? op?.Category) ||
    safeStr(op?.controlKey ?? op?.ControlKey) ||
    "SIN CATEGORÍA";

  return categoria.toUpperCase();
}

/**
 * ✅ Paleta suave para categorías.
 * Son colores ligeros para que el texto siga siendo legible.
 */
const CATEGORY_COLORS = [
  {
    bg: "#EEF6FF",
    border: "#B9D9F5",
    chipBg: "#DCEEFF",
    text: "#0B4F8A",
  },
  {
    bg: "#F1FAF5",
    border: "#BFE8D0",
    chipBg: "#DDF5E7",
    text: "#0B6B3A",
  },
  {
    bg: "#FFF8E8",
    border: "#F2D59A",
    chipBg: "#FFF0C7",
    text: "#8A5A00",
  },
  {
    bg: "#F7F0FF",
    border: "#D7C2F0",
    chipBg: "#EFE1FF",
    text: "#5A2E91",
  },
  {
    bg: "#FFF0F3",
    border: "#F2B8C6",
    chipBg: "#FFE0E7",
    text: "#9A2F4A",
  },
  {
    bg: "#EFFBFB",
    border: "#B7E3E3",
    chipBg: "#D9F4F4",
    text: "#0B666A",
  },
  {
    bg: "#F4F6FA",
    border: "#C9D3E3",
    chipBg: "#E8EDF5",
    text: "#32445E",
  },
  {
    bg: "#FFF4EC",
    border: "#F1C4A3",
    chipBg: "#FFE5D3",
    text: "#8A3F0B",
  },
];

/**
 * ✅ Convierte texto a un índice estable.
 * Así, la misma categoría siempre recibe el mismo color.
 */
function hashTextToIndex(text, max) {
  const s = safeStr(text).toUpperCase();
  let hash = 0;

  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }

  return hash % max;
}

function getCategoryColor(categoria) {
  const idx = hashTextToIndex(categoria || "SIN CATEGORÍA", CATEGORY_COLORS.length);
  return CATEGORY_COLORS[idx];
}

/**
 * ✅ ID estable "fallback" si no viene id del backend
 * - Si viene op.id real, se respeta
 * - Si NO viene, genera MISMO FORMATO que tu index:
 *   `${orderId}-${activity}-${subactivity?}`
 */
function opStableId(orderId, op, idx) {
  const existing = safeStr(op?.id);
  if (existing) return existing;

  const activity = normalizeActivity(op);
  const sub = normalizeSubActivity(op);

  const oid = safeStr(orderId);
  const key = `${oid}-${activity}${sub ? `-${sub}` : ""}`.trim();

  return key && key !== "-" ? key : `fallback__${idx}`;
}

/**
 * ✅ Agrupar SOLO por Usr02
 * - Devuelve:
 *   { grupos: [usr02...], porGrupo: { usr02: [ops...] } }
 */
function agruparPorUsr02(ops = []) {
  const porGrupo = {};

  for (const op of ops || []) {
    const grp = normalizeUsr02(op);
    if (!porGrupo[grp]) porGrupo[grp] = [];
    porGrupo[grp].push(op);
  }

  const grupos = Object.keys(porGrupo).sort((a, b) => a.localeCompare(b));

  // Orden interno de operaciones dentro del grupo: Activity, luego SubActivity
  for (const grp of grupos) {
    porGrupo[grp].sort((x, y) => {
      const ax = normalizeActivity(x);
      const ay = normalizeActivity(y);
      if (ax !== ay) return ax.localeCompare(ay);
      return normalizeSubActivity(x).localeCompare(normalizeSubActivity(y));
    });
  }

  return { grupos, porGrupo };
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

  // ✅ para fallback id consistente
  orderId,
}) {
  const grouped = useMemo(() => agruparPorUsr02(operaciones), [operaciones]);

  /**
   * ✅ Iniciar TODO cerrado.
   */
  const [groupOpen, setGroupOpen] = useState({});

  /**
   * ✅ Mantener estados existentes y agregar nuevos grupos cerrados.
   */
  useEffect(() => {
    const grupos = grouped.grupos || [];
    if (!grupos.length) {
      setGroupOpen({});
      return;
    }

    setGroupOpen((prev) => {
      const next = { ...(prev || {}) };

      for (const g of grupos) {
        if (typeof next[g] === "undefined") next[g] = false;
      }

      for (const key of Object.keys(next)) {
        if (!grupos.includes(key)) delete next[key];
      }

      return next;
    });
  }, [grouped.grupos]);

  if (!grouped.grupos?.length) {
    return (
      <View style={{ paddingVertical: 10 }}>
        <Text style={{ color: FIORI.textMuted }}>
          No hay operaciones para mostrar.
        </Text>
      </View>
    );
  }

  const toggleGroup = (grp) =>
    setGroupOpen((prev) => ({ ...(prev || {}), [grp]: !prev?.[grp] }));

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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              flex: 1,
            }}
          >
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
            <Text
              style={{
                fontWeight: "900",
                color: FIORI.err,
                fontSize: 12,
              }}
            >
              Cancelar
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        {grouped.grupos.map((grp) => {
          const isOpen = !!groupOpen?.[grp];
          const opsGroup = grouped.porGrupo?.[grp] || [];

          const opIds = opsGroup.map((op, idx) => opStableId(orderId, op, idx));

          const checkedCount = opIds.filter((id) => isOpChecked(id)).length;
          const allChecked = opIds.length > 0 && checkedCount === opIds.length;
          const someChecked = checkedCount > 0 && !allChecked;

          const groupCheckIcon = allChecked
            ? "checkbox"
            : someChecked
              ? "remove-circle-outline"
              : "square-outline";

          return (
            <View key={grp} style={styles?.grupoCard}>
              {/* Header del grupo Usr02 */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => toggleGroup(grp)}
                style={styles?.grupoHeader}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles?.grupoTitle}>{grp}</Text>
                  <Text
                    style={{
                      color: FIORI.textMuted,
                      fontWeight: "700",
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {opsGroup.length} operación{opsGroup.length === 1 ? "" : "es"}
                  </Text>
                </View>

                <Ionicons
                  name={isOpen ? "chevron-up-outline" : "chevron-down-outline"}
                  size={18}
                  color={FIORI.textMuted}
                />
              </TouchableOpacity>

              {isOpen && (
                <View style={{ paddingTop: 10, gap: 10 }}>
                  {/* Botón “marcar todo el grupo” */}
                  {finalizeMode ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
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
                          backgroundColor: allChecked
                            ? FIORI.brandSoft
                            : FIORI.surface,
                        }}
                      >
                        <Ionicons
                          name={groupCheckIcon}
                          size={20}
                          color={
                            allChecked || someChecked
                              ? FIORI.brand
                              : FIORI.textMuted
                          }
                        />
                        <Text
                          style={{
                            fontWeight: "900",
                            color: FIORI.text,
                            fontSize: 12,
                          }}
                        >
                          Marcar todas las operaciones ({checkedCount}/
                          {opIds.length})
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {/* Operaciones del grupo */}
                  <View style={{ gap: 8 }}>
                    {opsGroup.map((op, idx) => {
                      const realId = opStableId(orderId, op, idx);
                      const checked = isOpChecked(realId);

                      return (
                        <ItemOperacionDetalle
                          key={realId}
                          op={{
                            ...op,
                            activity: normalizeActivity(op),
                            subactivity: normalizeSubActivity(op),
                            description: normalizeDescription(op),
                            standardTextKey: normalizeStandardTextKey(op),
                            categoria: normalizeCategoria(op),
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
  const categoria = normalizeCategoria(op);
  const categoryColor = getCategoryColor(categoria);

  const descNorm = desc.toLowerCase().trim();
  const stkNorm = stk.toLowerCase().trim();

  /**
   * Ya no mostramos StandardTextKey como texto suelto abajo,
   * porque ahora lo mostramos como chip de categoría.
   */
  const showDesc = !!descNorm;

  const act = safeStr(op?.activity ?? op?.Activity) || "—";
  const sub = safeStr(op?.subactivity ?? op?.SubActivity);

  const cardBg = checked ? FIORI.brandSoft : categoryColor.bg;
  const cardBorder = checked ? FIORI.brand : categoryColor.border;

  return (
    <View
      style={[
        styles.operCardSmall,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
          borderWidth: checked ? 1.5 : 1,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
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
              borderColor: checked ? FIORI.brand : categoryColor.border,
              backgroundColor: checked ? FIORI.surface : "rgba(255,255,255,0.65)",
              marginTop: 2,
            }}
          >
            <Ionicons
              name={checked ? "checkbox" : "square-outline"}
              size={20}
              color={checked ? FIORI.brand : FIORI.textMuted}
            />
          </TouchableOpacity>
        ) : null}

        <View
          style={[
            styles.badgeSmall,
            {
              backgroundColor: badgeBg,
              borderColor: FIORI.borderSoft,
              marginTop: 2,
            },
          ]}
        >
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

          {/* ✅ Categoría visual */}
          <View
            style={{
              alignSelf: "flex-start",
              marginTop: 8,
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: categoryColor.border,
              backgroundColor: categoryColor.chipBg,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Ionicons
              name="pricetag-outline"
              size={12}
              color={categoryColor.text}
            />
            <Text
              numberOfLines={1}
              style={{
                maxWidth: 220,
                color: categoryColor.text,
                fontWeight: "900",
                fontSize: 11,
              }}
            >
              {stkNorm ? stk : categoria}
            </Text>
          </View>
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