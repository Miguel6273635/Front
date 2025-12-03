// app/tecnico/ordenes/[orderid]/mantto-cables.js
// Registro de mantenimiento de cables — Frontend (Expo Router + React Native)
// - Auto-llenado (solo lectura) desde GET /api/mantenimiento-cables/datos/:orderid
// - Captura del técnico (listo para POST /api/mantenimiento-cables/guardar)
// - Diseño: Header/Footer de tus componentes + grid responsive para "Diámetros y desgaste"

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import Header from '../../../../src/components/Header';
import Footer from '../../../../src/components/Footer';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../../../src/services/api';

// -------- Utilitarios UI --------
const SectionTitle = ({ children }) => (
  <Text style={styles.section}>{children}</Text>
);

const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const Label = ({ children }) => (
  <Text style={styles.label}>{children}</Text>
);

const Readonly = ({ children }) => (
  <View style={styles.readonly}>
    <Text style={styles.readonlyText}>{String(children ?? '—')}</Text>
  </View>
);

const Input = (props) => (
  <TextInput {...props} style={[styles.input, props.style]} />
);

const Chip = ({ active, children, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <Text style={[styles.chipText, active && styles.chipTextOn]}>{children}</Text>
  </TouchableOpacity>
);

const Toggle = ({ value, onValueChange }) => (
  <Switch value={!!value} onValueChange={onValueChange} />
);

// -------- Card por cable (grid responsive) --------
function CableCard({ row, onChange }) {
  // Mantiene un estado local para calcular % en vivo y evitar parpadeos
  const [local, setLocal] = useState(row);

  useEffect(() => setLocal(row), [row]);

  useEffect(() => {
    const desg = Number(local?.parte_desgaste_mm);
    const intc = Number(local?.parte_intacta_mm);
    if (!isNaN(desg) && !isNaN(intc) && intc > 0) {
      const pct = Math.round((desg / intc) * 1000) / 10; // 1 decimal
      onChange({ ...local, desgaste_pct: pct });
    } else {
      onChange({ ...local, desgaste_pct: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.parte_desgaste_mm, local.parte_intacta_mm]);

  return (
    <View style={styles.cableCard}>
      <View style={styles.cableCardHeader}>
        <Text style={styles.cableCardTitle}>Cable #{local.cable_no}</Text>
        <View style={styles.badgePct}>
          <Text style={styles.badgePctText}>
            {local?.desgaste_pct != null ? `${local.desgaste_pct}%` : '—'}
          </Text>
        </View>
      </View>

      <View style={styles.cableGrid}>
        <View style={styles.cableCol}>
          <Label>Ø (mm)</Label>
          <Input
            keyboardType="numeric"
            value={local?.diametro_mm?.toString() ?? ''}
            onChangeText={(t) =>
              setLocal((s) => ({ ...s, diametro_mm: t.replace(',', '.') }))
            }
            placeholder="0.00"
          />
        </View>

        <View style={styles.cableCol}>
          <Label>Desgaste (mm)</Label>
          <Input
            keyboardType="numeric"
            value={local?.parte_desgaste_mm?.toString() ?? ''}
            onChangeText={(t) =>
              setLocal((s) => ({
                ...s,
                parte_desgaste_mm: t.replace(',', '.'),
              }))
            }
            placeholder="0.00"
          />
        </View>

        <View style={styles.cableCol}>
          <Label>Intacta (mm)</Label>
          <Input
            keyboardType="numeric"
            value={local?.parte_intacta_mm?.toString() ?? ''}
            onChangeText={(t) =>
              setLocal((s) => ({
                ...s,
                parte_intacta_mm: t.replace(',', '.'),
              }))
            }
            placeholder="0.00"
          />
        </View>

        <View style={[styles.cableCol, { alignItems: 'flex-start' }]}>
          <Label>Marca “Peor”</Label>
          <View style={styles.peorRow}>
            <Text style={styles.peorText}>Peor</Text>
            <Toggle
              value={!!local?.peor}
              onValueChange={(v) => setLocal((s) => ({ ...s, peor: v }))}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

// -------- Pantalla principal --------
export default function ManttoCablesScreen() {
  const { orderid } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auto, setAuto] = useState(null);

  const [form, setForm] = useState({
    orderid: '',
    created_by: null,
    tipo_reporte: 'overhaul',
    cantidad_cables: 8,
    diametro_estandar_mm: null,
    seccion_diametros: Array.from({ length: 8 }, (_, i) => ({ cable_no: i + 1 })),
    seccion_rupturas: Array.from({ length: 8 }, (_, i) => ({ cable_no: i + 1, hay: false })),
    seccion_longitud: { encontrado: false },
    seccion_oxido: { encontrado: false, alcance: 'no' },
    seccion_tension: { estado: 'bien' },
    seccion_deformaciones: { encontrado: false },
    seccion_terminales: { estado: 'sin_anomalias' },
    resultado_total: { bien: true, tipos_problema: [] },
  });

  const update = (patch) => setForm((s) => ({ ...s, ...patch }));
  const updateArrayItem = (key, idx, patch) => {
    setForm((s) => {
      const arr = [...(s[key] || [])];
      arr[idx] = { ...(arr[idx] || {}), ...patch };
      return { ...s, [key]: arr };
    });
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;

      const { data, status } = await api.get(
        `/mantenimiento-cables/datos/${orderid}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        }
      );

      if (status >= 400) throw { response: { status, data } };

      let autoFromApi = data?.auto;
      // Fallback por si algún día llega plano:
      if (!autoFromApi && data) {
        autoFromApi = {
          cliente: data?.cliente ?? data?.Client ?? '',
          equipo: data?.equipo ?? data?.Equipment ?? '',
          start_date: data?.start_date ?? data?.StartDate ?? '',
          tecnico_nombre: data?.tecnico_nombre ?? data?.nombre ?? '',
          partner_rol: data?.partner_rol ?? data?.PartnRoleOld ?? '',
          partner_id: data?.partner_id ?? data?.PartnerOld ?? '',
        };
      }

      if (!autoFromApi) {
        throw { response: { status: 404, data: { error: 'Sin datos de la orden' } } };
      }

      setAuto(autoFromApi);

      const existing = data?.form || {};
      setForm((s) => ({
        ...s,
        orderid: orderid?.toString(),
        created_by: user?.id ?? s.created_by,
        ...existing,
        seccion_diametros: (existing.seccion_diametros ?? s.seccion_diametros)
          .slice(0, 8)
          .concat(
            Array.from(
              { length: Math.max(0, 8 - (existing.seccion_diametros?.length || 0)) },
              (_, i) => ({ cable_no: (existing.seccion_diametros?.length || 0) + i + 1 })
            )
          ),
        seccion_rupturas: (existing.seccion_rupturas ?? s.seccion_rupturas)
          .slice(0, 8)
          .concat(
            Array.from(
              { length: Math.max(0, 8 - (existing.seccion_rupturas?.length || 0)) },
              (_, i) => ({ cable_no: (existing.seccion_rupturas?.length || 0) + i + 1, hay: false })
            )
          ),
      }));
    } catch (e) {
      console.error('[ManttoCables] load error', e?.response?.status, e?.response?.data || e?.message);
      const status = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message || 'Error desconocido';
      Alert.alert('Error al cargar', `(${status || '??'}) ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [orderid]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('token');
      const payload = {
        ...form,
        diametro_estandar_mm: form.diametro_estandar_mm ? Number(form.diametro_estandar_mm) : null,
        cantidad_cables: form.cantidad_cables ? Number(form.cantidad_cables) : 8,
        seccion_diametros: (form.seccion_diametros || []).map((r) => ({
          ...r,
          diametro_mm: r.diametro_mm != null && r.diametro_mm !== '' ? Number(r.diametro_mm) : null,
          parte_desgaste_mm:
            r.parte_desgaste_mm != null && r.parte_desgaste_mm !== '' ? Number(r.parte_desgaste_mm) : null,
          parte_intacta_mm:
            r.parte_intacta_mm != null && r.parte_intacta_mm !== '' ? Number(r.parte_intacta_mm) : null,
          desgaste_pct: r.desgaste_pct != null && r.desgaste_pct !== '' ? Number(r.desgaste_pct) : null,
        })),
      };

      // Cuando tengas endpoint real:
      // const { data, status } = await api.post('/mantenimiento-cables/guardar', payload, {
      //   headers: { Authorization: `Bearer ${token}` },
      //   validateStatus: () => true,
      // });

      // Simulación:
      const status = 200;
      const data = { ok: true };

      if (status >= 400) {
        if (data?.detail) return Alert.alert('Validación', JSON.stringify(data.detail, null, 2));
        return Alert.alert('Error', data?.error || 'No se pudo guardar el formulario');
      }

      if (data?.ok) {
        Alert.alert('Guardado', 'El formulario se guardó correctamente', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Atención', 'No se pudo confirmar el guardado');
      }
    } catch (e) {
      console.error('[ManttoCables] save error', e?.response?.status, e?.response?.data || e?.message);
      if (e?.response?.data?.detail) {
        Alert.alert('Validación', JSON.stringify(e.response.data.detail, null, 2));
      } else {
        Alert.alert('Error', e?.response?.data?.error || 'No se pudo guardar el formulario');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Cargando…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Registro de mantenimiento de cables" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* Resumen rápido */}
        <SectionTitle>Resumen de la orden</SectionTitle>
        <Card>
          <View style={styles.quickGrid}>
            <View style={styles.quickItem}>
              <Label>Orden</Label>
              <Readonly>{orderid?.toString()}</Readonly>
            </View>
            <View style={styles.quickItem}>
              <Label>Cliente</Label>
              <Readonly>{auto?.cliente}</Readonly>
            </View>
            <View style={styles.quickItem}>
              <Label>Equipo</Label>
              <Readonly>{auto?.equipo}</Readonly>
            </View>
            <View style={styles.quickItem}>
              <Label>Técnico</Label>
              <Readonly>{auto?.tecnico_nombre}</Readonly>
            </View>
          </View>
          <View style={styles.quickGrid}>
            <View style={styles.quickItem}>
              <Label>Fecha inicio</Label>
              <Readonly>{(auto?.start_date ?? '').toString()}</Readonly>
            </View>
            <View style={styles.quickItem}>
              <Label>Partner (rol / id)</Label>
              <Readonly>{`${auto?.partner_rol ?? '—'} / ${auto?.partner_id ?? '—'}`}</Readonly>
            </View>
          </View>
        </Card>

        {/* Configuración básica */}
        <SectionTitle>Configuración del reporte</SectionTitle>
        <Card>
          <Label>Tipo de reporte</Label>
          <View style={styles.chipsWrap}>
            {['overhaul', 'ajuste_reparacion_sustitucion'].map((t) => {
              const active = form.tipo_reporte === t;
              return (
                <Chip key={t} active={active} onPress={() => update({ tipo_reporte: t })}>
                  {t === 'overhaul' ? 'Overhaul' : 'Ajuste/Rep./Sust.'}
                </Chip>
              );
            })}
          </View>

          <View style={styles.row2}>
            <View style={styles.col}>
              <Label>Cantidad de cables</Label>
              <Input
                keyboardType="numeric"
                value={String(form.cantidad_cables ?? 8)}
                onChangeText={(t) => update({ cantidad_cables: Number(t || 8) })}
                placeholder="8"
                editable={false}
              />
            </View>
            <View style={styles.col}>
              <Label>Diámetro estándar (mm)</Label>
              <Input
                keyboardType="numeric"
                value={form.diametro_estandar_mm?.toString() ?? ''}
                onChangeText={(t) => update({ diametro_estandar_mm: t })}
                placeholder="0.00"
              />
            </View>
          </View>
        </Card>

        {/* Sección: Diámetros y desgaste (GRID RESPONSIVE) */}
        <SectionTitle>1) Diámetros y desgaste por cable</SectionTitle>
        <View style={styles.cablesWrap}>
          {(form.seccion_diametros || [])
            .slice(0, form.cantidad_cables || 8)
            .map((row, idx) => (
              <CableCard
                key={row.cable_no}
                row={row}
                onChange={(patch) => updateArrayItem('seccion_diametros', idx, patch)}
              />
            ))}
        </View>

        {/* Sección: Rupturas */}
        <SectionTitle>2) Rupturas, nudos, empalmes</SectionTitle>
        <Card>
          {(form.seccion_rupturas || [])
            .slice(0, form.cantidad_cables || 8)
            .map((r, idx) => (
              <View key={r.cable_no} style={styles.block}>
                <Text style={styles.blockTitle}>Cable #{r.cable_no}</Text>

                <Label>¿Hay ruptura/nudo/empalme?</Label>
                <View style={{ marginBottom: 8 }}>
                  <Toggle
                    value={r.hay}
                    onValueChange={(v) =>
                      updateArrayItem('seccion_rupturas', idx, { hay: v })
                    }
                  />
                </View>

                {r.hay && (
                  <>
                    <View style={styles.row2}>
                      <View style={styles.col}>
                        <Label>Rupturas por paso</Label>
                        <Input
                          keyboardType="numeric"
                          value={r.rupturas_por_paso?.toString() ?? ''}
                          onChangeText={(t) =>
                            updateArrayItem('seccion_rupturas', idx, {
                              rupturas_por_paso: Number(t || 0),
                            })
                          }
                          placeholder="0"
                        />
                      </View>
                      <View style={styles.col}>
                        <Label>Posición en cabina</Label>
                        <Input
                          value={r.posicion_cabina ?? ''}
                          onChangeText={(t) =>
                            updateArrayItem('seccion_rupturas', idx, {
                              posicion_cabina: t,
                            })
                          }
                          placeholder="Ej. izquierda 2"
                        />
                      </View>
                    </View>

                    <Label>¿Requiere cambio?</Label>
                    <View>
                      <Toggle
                        value={!!r.cambio}
                        onValueChange={(v) =>
                          updateArrayItem('seccion_rupturas', idx, { cambio: v })
                        }
                      />
                    </View>
                  </>
                )}
                <View style={styles.hr} />
              </View>
            ))}
        </Card>

        {/* Sección: Longitud desigual */}
        <SectionTitle>3) Longitud desigual</SectionTitle>
        <Card>
          <Label>¿Se detectó?</Label>
          <View style={{ marginBottom: 8 }}>
            <Toggle
              value={form.seccion_longitud?.encontrado}
              onValueChange={(v) =>
                update({
                  seccion_longitud: { ...(form.seccion_longitud || {}), encontrado: v },
                })
              }
            />
          </View>

          {form.seccion_longitud?.encontrado && (
            <View style={styles.row2}>
              <View style={styles.col}>
                <Label>Cable #</Label>
                <Input
                  keyboardType="numeric"
                  value={form.seccion_longitud?.cable_no?.toString() ?? ''}
                  onChangeText={(t) =>
                    update({
                      seccion_longitud: {
                        ...(form.seccion_longitud || {}),
                        cable_no: Number(t || 0),
                      },
                    })
                  }
                  placeholder="1"
                />
              </View>
              <View style={styles.col}>
                <Label>Posición en cabina</Label>
                <Input
                  value={form.seccion_longitud?.posicion_cabina ?? ''}
                  onChangeText={(t) =>
                    update({
                      seccion_longitud: {
                        ...(form.seccion_longitud || {}),
                        posicion_cabina: t,
                      },
                    })
                  }
                  placeholder="Ej. derecha 1"
                />
              </View>
              <View style={styles.col}>
                <Label>Longitud (mm)</Label>
                <Input
                  keyboardType="numeric"
                  value={form.seccion_longitud?.longitud_mm?.toString() ?? ''}
                  onChangeText={(t) =>
                    update({
                      seccion_longitud: {
                        ...(form.seccion_longitud || {}),
                        longitud_mm: Number(t || 0),
                      },
                    })
                  }
                  placeholder="0"
                />
              </View>
            </View>
          )}
        </Card>

        {/* Sección: Óxido */}
        <SectionTitle>4) Óxido</SectionTitle>
        <Card>
          <Label>¿Se detectó?</Label>
          <View style={{ marginBottom: 8 }}>
            <Toggle
              value={form.seccion_oxido?.encontrado}
              onValueChange={(v) =>
                update({
                  seccion_oxido: { ...(form.seccion_oxido || {}), encontrado: v },
                })
              }
            />
          </View>

          {form.seccion_oxido?.encontrado && (
            <>
              <Label>Alcance</Label>
              <View style={styles.chipsWrap}>
                {['completo', 'parcial', 'no'].map((opt) => {
                  const active = form.seccion_oxido?.alcance === opt;
                  return (
                    <Chip
                      key={opt}
                      active={active}
                      onPress={() =>
                        update({
                          seccion_oxido: { ...(form.seccion_oxido || {}), alcance: opt },
                        })
                      }
                    >
                      {opt}
                    </Chip>
                  );
                })}
              </View>

              <View style={styles.row2}>
                <View style={styles.col}>
                  <Label>Cable #</Label>
                  <Input
                    keyboardType="numeric"
                    value={form.seccion_oxido?.cable_no?.toString() ?? ''}
                    onChangeText={(t) =>
                      update({
                        seccion_oxido: {
                          ...(form.seccion_oxido || {}),
                          cable_no: Number(t || 0),
                        },
                      })
                    }
                    placeholder="1"
                  />
                </View>
                <View style={styles.col}>
                  <Label>Posición en cabina</Label>
                  <Input
                    value={form.seccion_oxido?.posicion_cabina ?? ''}
                    onChangeText={(t) =>
                      update({
                        seccion_oxido: {
                          ...(form.seccion_oxido || {}),
                          posicion_cabina: t,
                        },
                      })
                    }
                    placeholder="Ej. centro"
                  />
                </View>
              </View>
            </>
          )}
        </Card>

        {/* Sección: Tensión */}
        <SectionTitle>5) Tensión</SectionTitle>
        <Card>
          <Label>Estado</Label>
          <View style={styles.chipsWrap}>
            {['bien', 'pendiente_corregir', 'corregido'].map((opt) => {
              const active = form.seccion_tension?.estado === opt;
              return (
                <Chip
                  key={opt}
                  active={active}
                  onPress={() => update({ seccion_tension: { estado: opt } })}
                >
                  {opt}
                </Chip>
              );
            })}
          </View>
        </Card>

        {/* Sección: Dobleces / Deformaciones */}
        <SectionTitle>6) Dobleces / Deformaciones</SectionTitle>
        <Card>
          <Label>¿Se detectó?</Label>
          <View style={{ marginBottom: 8 }}>
            <Toggle
              value={form.seccion_deformaciones?.encontrado}
              onValueChange={(v) =>
                update({
                  seccion_deformaciones: {
                    ...(form.seccion_deformaciones || {}),
                    encontrado: v,
                  },
                })
              }
            />
          </View>

          {form.seccion_deformaciones?.encontrado && (
            <View style={styles.row3}>
              <View style={styles.col}>
                <Label>Cable #</Label>
                <Input
                  keyboardType="numeric"
                  value={form.seccion_deformaciones?.cable_no?.toString() ?? ''}
                  onChangeText={(t) =>
                    update({
                      seccion_deformaciones: {
                        ...(form.seccion_deformaciones || {}),
                        cable_no: Number(t || 0),
                      },
                    })
                  }
                  placeholder="1"
                />
              </View>
              <View style={styles.col}>
                <Label>Posición en cabina</Label>
                <Input
                  value={form.seccion_deformaciones?.posicion_cabina ?? ''}
                  onChangeText={(t) =>
                    update({
                      seccion_deformaciones: {
                        ...(form.seccion_deformaciones || {}),
                        posicion_cabina: t,
                      },
                    })
                  }
                  placeholder="Ej. atrás"
                />
              </View>
              <View style={styles.col}>
                <Label>Problema</Label>
                <Input
                  value={form.seccion_deformaciones?.problema ?? ''}
                  onChangeText={(t) =>
                    update({
                      seccion_deformaciones: {
                        ...(form.seccion_deformaciones || {}),
                        problema: t,
                      },
                    })
                  }
                  placeholder="Describe…"
                />
              </View>
            </View>
          )}
        </Card>

        {/* Sección: Terminales */}
        <SectionTitle>7) Terminales</SectionTitle>
        <Card>
          <Label>Estado</Label>
          <View style={styles.chipsWrap}>
            {['grietas', 'grasa', 'sin_anomalias'].map((opt) => {
              const active = form.seccion_terminales?.estado === opt;
              return (
                <Chip
                  key={opt}
                  active={active}
                  onPress={() => update({ seccion_terminales: { estado: opt } })}
                >
                  {opt}
                </Chip>
              );
            })}
          </View>
        </Card>

        {/* Resultado total */}
        <SectionTitle>Resultado total</SectionTitle>
        <Card>
          <View style={styles.chipsWrap}>
            <Chip
              active={!!form.resultado_total?.bien}
              onPress={() =>
                update({ resultado_total: { ...(form.resultado_total || {}), bien: true } })
              }
            >
              Bien
            </Chip>
            <Chip
              active={!!form.resultado_total?.cambio_inmediato}
              onPress={() =>
                update({
                  resultado_total: {
                    ...(form.resultado_total || {}),
                    cambio_inmediato: !(form.resultado_total?.cambio_inmediato),
                  },
                })
              }
            >
              Cambio inmediato
            </Chip>
            <Chip
              active={!!form.resultado_total?.programar_cambio}
              onPress={() =>
                update({
                  resultado_total: {
                    ...(form.resultado_total || {}),
                    programar_cambio: !(form.resultado_total?.programar_cambio),
                  },
                })
              }
            >
              Programar cambio
            </Chip>
          </View>

          <Label style={{ marginTop: 12 }}>Tipos de problema</Label>
          <View style={styles.chipsWrap}>
            {['diametro', 'tension', 'rupturas', 'dobleces', 'desgaste', 'terminales', 'oxido', 'otros'].map(
              (opt) => {
                const active = form.resultado_total?.tipos_problema?.includes(opt);
                return (
                  <Chip
                    key={opt}
                    active={active}
                    onPress={() => {
                      const cur = new Set(form.resultado_total?.tipos_problema || []);
                      if (active) cur.delete(opt);
                      else cur.add(opt);
                      update({
                        resultado_total: {
                          ...(form.resultado_total || {}),
                          tipos_problema: Array.from(cur),
                        },
                      });
                    }}
                  >
                    {opt}
                  </Chip>
                );
              }
            )}
          </View>

          <Label style={{ marginTop: 12 }}>Detalle</Label>
          <Input
            multiline
            style={{ height: 120, textAlignVertical: 'top' }}
            placeholder="Notas, observaciones, medidas…"
            value={form.resultado_total?.detalle ?? ''}
            onChangeText={(t) =>
              update({ resultado_total: { ...(form.resultado_total || {}), detalle: t } })
            }
          />
        </Card>

        <TouchableOpacity style={styles.primary} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Guardar</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Footer />
    </View>
  );
}

// -------- Estilos --------
const styles = StyleSheet.create({
  section: { marginTop: 18, fontSize: 18, fontWeight: '800', color: '#1f2937' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },

  label: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  readonly: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
  },
  readonlyText: { fontSize: 16, color: '#111827' },

  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#111827',
  },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  chip: {
    borderWidth: 1,
    borderColor: '#c7cdd6',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { color: '#111827', fontWeight: '700' },
  chipTextOn: { color: '#fff' },

  row2: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  row3: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  col: { flexGrow: 1, minWidth: 220, flexBasis: 0 },

  // -------- Resumen rápido --------
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickItem: { flexGrow: 1, minWidth: 220, flexBasis: 0 },

  // -------- Grid de cables (responsive) --------
  cablesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  cableCard: {
    flexGrow: 1,
    minWidth: 260,     // en móvil 1 por fila
    maxWidth: 360,     // en desktop cabe 2-3 por fila
    flexBasis: '48%',  // ayuda a que sean 2 por fila en anchos medianos
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  cableCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cableCardTitle: { fontWeight: '800', fontSize: 16, color: '#111827' },
  badgePct: {
    minWidth: 64,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    alignItems: 'center',
  },
  badgePctText: { fontWeight: '800', color: '#374151' },

  cableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cableCol: { flexGrow: 1, minWidth: 160, flexBasis: 0 },

  peorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  peorText: { fontSize: 14, color: '#111827' },

  block: { marginBottom: 6 },
  blockTitle: { fontWeight: '800', color: '#111827', marginBottom: 6 },
  hr: {
    height: 1,
    backgroundColor: '#eceff3',
    marginTop: 12,
    marginBottom: 6,
  },

  primary: {
    marginTop: 18,
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
