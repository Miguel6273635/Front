import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function fmtHMS(ms) {
  if (!Number.isFinite(ms)) return '00:00:00';
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export default function EtiquetaCronometro({
  FIORI,
  styles,
  opId,
  label,
  limitMin,
  workedMs = 0,
  resumeAtMs,
  onNeedStartLocal,
  onNearingEnd,
  onExpire,
}) {
  const [now, setNow] = useState(Date.now());
  const nearingShownRef = useRef(false);
  const expiredShownRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (resumeAtMs == null) onNeedStartLocal?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAtMs]);

  const tramoMs = resumeAtMs ? Math.max(0, now - resumeAtMs) : 0;
  const elapsedMs = (Number.isFinite(workedMs) ? workedMs : 0) + tramoMs;

  const hasLimit = Number.isFinite(limitMin);
  const limitMs = hasLimit ? limitMin * 60 * 1000 : null;
  const remainingMs = hasLimit ? Math.max(0, limitMs - elapsedMs) : null;

  useEffect(() => {
    if (!hasLimit) return;

    if (remainingMs > 0 && remainingMs <= 60000 && !nearingShownRef.current) {
      nearingShownRef.current = true;
      onNearingEnd?.();
    }
    if (remainingMs === 0 && !expiredShownRef.current) {
      expiredShownRef.current = true;
      onExpire?.();
    }
  }, [hasLimit, remainingMs, onNearingEnd, onExpire]);

  return (
    <View style={styles.timerRow}>
      <View style={styles.timerPill}>
        <Ionicons name="time-outline" size={14} color={FIORI.text} />
        <Text style={styles.timerText}> Transcurrido: {fmtHMS(elapsedMs)}</Text>
      </View>

      {hasLimit && (
        <View
          style={[
            styles.timerPill,
            {
              backgroundColor: remainingMs === 0 ? '#FDECEA' : FIORI.brandSoft,
              borderColor: FIORI.border,
            },
          ]}
        >
          <Ionicons name="hourglass-outline" size={14} color={FIORI.text} />
          <Text style={styles.timerText}>
            {remainingMs === 0 ? ' ¡Tiempo agotado!' : ` Restante: ${fmtHMS(remainingMs)}`}
          </Text>
        </View>
      )}
    </View>
  );
}
