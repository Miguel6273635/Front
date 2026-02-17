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
   * ✅ CAMBIO: iniciar TODO cerrado
   * Antes abrías el primer grupo automáticamente.
   */
  const [groupOpen, setGroupOpen] = useState({});

  /**
   * ✅ CAMBIO: NO reabrir nada cuando cambie la data.
   * (Si quieres que se mantenga el estado previo cuando llegan nuevas ops,
   * lo hacemos con "merge" abajo.)
   */
  useEffect(() => {
    const grupos = grouped.grupos || [];
    if (!grupos.length) {
      setGroupOpen({});
      return;
    }

    // Mantener estados existentes y agregar nuevos grupos cerrados
    setGroupOpen((prev) => {
      const next = { ...(prev || {}) };
      for (const g of grupos) {
        if (typeof next[g] === "undefined") next[g] = false; // nuevos grupos cerrados
      }
      // si desapareció algún grupo, lo quitamos
      for (const key of Object.keys(next)) {
        if (!grupos.includes(key)) delete next[key];
      }
      return next;
    });
  }, [grouped.grupos]);

  if (!grouped.grupos?.length) {
    return (
      <View style={{ paddingVertical: 10 }}>
        <Text style={{ color: FIORI.textMuted }}>No hay operaciones para mostrar.</Text>
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
        {grouped.grupos.map((grp) => {
          const isOpen = !!groupOpen?.[grp];
          const opsGroup = grouped.porGrupo?.[grp] || [];

          // IDs consistentes
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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
                          name={groupCheckIcon}
                          size={20}
                          color={allChecked || someChecked ? FIORI.brand : FIORI.textMuted}
                        />
                        <Text style={{ fontWeight: "900", color: FIORI.text, fontSize: 12 }}>
                          Marcar todo ({checkedCount}/{opIds.length})
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
