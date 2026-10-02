// app/tecnico/RH/index.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  StatusBar,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

const COLORS = {
  bg: "#F5F6F7",
  card: "#FFFFFF",
  soft: "#F6F7F8",
  border: "#E8EAED",
  text: "#202022",
  secondary: "#6E737A",
  red: "#E60012",
  redSoft: "#FFF0F1",
  green: "#1C9159",
  greenSoft: "#EAF7F0",
  amber: "#D18C1F",
  amberSoft: "#FFF7E8",
  blue: "#355C7D",
  blueSoft: "#EDF3F7",
  danger: "#C83838",
  dangerSoft: "#FCEEEE",
};

const VIEWS = {
  INICIAL: "INICIAL",
  TEMPRANO: "TEMPRANO",
  GPS: "GPS",
  INICIADO: "INICIADO",
  RETARDO: "RETARDO",
  JORNADA: "JORNADA",
  PAUSA: "PAUSA",
  REGRESO: "REGRESO",
  SALIDA: "SALIDA",
  FINALIZADA: "FINALIZADA",
  MODALIDAD: "MODALIDAD",
  RESUMEN: "RESUMEN",
  HISTORIAL: "HISTORIAL",
  DETALLE: "DETALLE",
};

const DEMO_VIEWS = [
  { key: VIEWS.INICIAL, label: "Inicio" },
  { key: VIEWS.TEMPRANO, label: "Antes de hora" },
  { key: VIEWS.GPS, label: "GPS" },
  { key: VIEWS.INICIADO, label: "Entrada" },
  { key: VIEWS.RETARDO, label: "Retardo" },
  { key: VIEWS.JORNADA, label: "Jornada" },
  { key: VIEWS.PAUSA, label: "Comida" },
  { key: VIEWS.REGRESO, label: "Regreso" },
  { key: VIEWS.SALIDA, label: "Salida" },
  { key: VIEWS.FINALIZADA, label: "Final" },
  { key: VIEWS.MODALIDAD, label: "Modalidad" },
  { key: VIEWS.RESUMEN, label: "Resumen" },
  { key: VIEWS.HISTORIAL, label: "Historial" },
  { key: VIEWS.DETALLE, label: "Detalle" },
];

const EMPLOYEE = {
  name: "Mauricio Contreras Vega",
  payroll: "000123",
  area: "Recursos Humanos",
  schedule: "08:00 AM - 05:00 PM",
  shift: "Turno administrativo",
};

function Header() {
  return (
    <View style={styles.header}>
      <Pressable style={styles.headerIcon} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color={COLORS.text} />
      </Pressable>

      <View style={styles.headerLogo}>
        <Text style={styles.headerLogoText}>RH</Text>
      </View>

      <View style={styles.headerText}>
        <Text style={styles.headerEyebrow}>ASISTENCIA</Text>
        <Text style={styles.headerTitle}>Hola, Mauricio</Text>
      </View>

      <View style={styles.headerMore}>
        <Ionicons name="ellipsis-horizontal" size={19} color={COLORS.text} />
      </View>
    </View>
  );
}

function EmployeeCard() {
  return (
    <View style={styles.employeeCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>MC</Text>
      </View>

      <View style={styles.employeeInfo}>
        <Text style={styles.employeeName}>{EMPLOYEE.name}</Text>
        <Text style={styles.employeeMeta}>
          Nómina: {EMPLOYEE.payroll} · Área: {EMPLOYEE.area}
        </Text>
        <Text style={styles.scheduleText}>
          {EMPLOYEE.shift} · {EMPLOYEE.schedule}
        </Text>

        <View style={styles.employeeBadges}>
          <View style={[styles.pill, styles.redPill]}>
            <Text style={[styles.pillText, { color: COLORS.red }]}>
              Datos turno y horario
            </Text>
          </View>

          <View style={[styles.pill, styles.amberPill]}>
            <Text style={[styles.pillText, { color: COLORS.amber }]}>
              2 retardos
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function ClockCard({ time = "07:52 AM", label = "Hora actual" }) {
  return (
    <View style={styles.clockCard}>
      <Text style={styles.clockLabel}>{label}</Text>
      <Text style={styles.clockValue}>{time}</Text>
    </View>
  );
}

function StatusCard({
  icon = "checkmark",
  title,
  description,
  tone = "green",
}) {
  const tones = {
    green: {
      bg: COLORS.greenSoft,
      iconBg: "#DDF3E8",
      color: COLORS.green,
    },
    amber: {
      bg: COLORS.amberSoft,
      iconBg: "#FCECCB",
      color: COLORS.amber,
    },
    red: {
      bg: COLORS.dangerSoft,
      iconBg: "#F8DEDE",
      color: COLORS.danger,
    },
    blue: {
      bg: COLORS.blueSoft,
      iconBg: "#DEEAF1",
      color: COLORS.blue,
    },
  };

  const palette = tones[tone] || tones.green;

  return (
    <View style={[styles.statusCard, { backgroundColor: palette.bg }]}>
      <View style={[styles.statusIcon, { backgroundColor: palette.iconBg }]}>
        <Ionicons name={icon} size={18} color={palette.color} />
      </View>

      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusDescription}>{description}</Text>
      </View>
    </View>
  );
}

function PrimaryButton({
  children,
  onPress,
  disabled = false,
  icon,
  tone = "red",
}) {
  const background =
    tone === "dark" ? COLORS.text : tone === "green" ? COLORS.green : COLORS.red;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: disabled ? "#E7E9EC" : background },
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={disabled ? COLORS.secondary : "#FFFFFF"}
        />
      ) : null}

      <Text
        style={[
          styles.primaryButtonText,
          disabled && { color: COLORS.secondary },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({ children, onPress, icon, danger = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        danger && { borderColor: "#F0C9CD", backgroundColor: "#FFF8F8" },
        pressed && styles.buttonPressed,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={danger ? COLORS.danger : COLORS.text}
        />
      ) : null}
      <Text
        style={[
          styles.secondaryButtonText,
          danger && { color: COLORS.danger },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function TimelineRow({ icon, title, time, last = false, active = false }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineVisual}>
        <View
          style={[
            styles.timelineDot,
            active && {
              borderColor: COLORS.red,
              backgroundColor: COLORS.redSoft,
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={14}
            color={active ? COLORS.red : COLORS.secondary}
          />
        </View>
        {!last ? <View style={styles.timelineLine} /> : null}
      </View>

      <View style={styles.timelineCopy}>
        <Text style={styles.timelineTitle}>{title}</Text>
        <Text style={styles.timelineTime}>{time}</Text>
      </View>
    </View>
  );
}

function SummaryItem({ label, value, icon }) {
  return (
    <View style={styles.summaryItem}>
      <View style={styles.summaryIcon}>
        <Ionicons name={icon} size={18} color={COLORS.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

function ModalCard({
  visible,
  title,
  description,
  icon = "help",
  confirmText = "Confirmar",
  onCancel,
  onConfirm,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIcon}>
            <Ionicons name={icon} size={26} color={COLORS.red} />
          </View>

          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalDescription}>{description}</Text>

          <View style={styles.modalButtons}>
            <Pressable style={styles.modalCancel} onPress={onCancel}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.modalConfirm} onPress={onConfirm}>
              <Text style={styles.modalConfirmText}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Toast({ tone = "success", title, description }) {
  const toneData = {
    success: {
      bg: "#EFF9F4",
      border: "#CDEADB",
      icon: "checkmark",
      color: COLORS.green,
    },
    warning: {
      bg: "#FFF8E9",
      border: "#F2DFB4",
      icon: "alert",
      color: COLORS.amber,
    },
    error: {
      bg: "#FFF1F2",
      border: "#F0C9CE",
      icon: "close",
      color: COLORS.danger,
    },
    info: {
      bg: "#EFF5F9",
      border: "#D8E6EF",
      icon: "information",
      color: COLORS.blue,
    },
  };

  const current = toneData[tone];

  return (
    <View
      style={[
        styles.toast,
        { backgroundColor: current.bg, borderColor: current.border },
      ]}
    >
      <View style={[styles.toastIcon, { backgroundColor: "#FFFFFF" }]}>
        <Ionicons name={current.icon} size={18} color={current.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toastTitle}>{title}</Text>
        <Text style={styles.toastDescription}>{description}</Text>
      </View>
    </View>
  );
}

function InitialView({ setView, openModal }) {
  return (
    <>
      <EmployeeCard />
      <ClockCard />

      <StatusCard
        icon="checkmark"
        title="Listo para iniciar"
        description="Horario y ubicación validados."
      />

      <PrimaryButton onPress={() => openModal("start")}>
        Registrar inicio de labores
      </PrimaryButton>

      <PrimaryButton disabled>
        Fin de labores · No disponible
      </PrimaryButton>

      <SecondaryButton
        icon="time-outline"
        onPress={() => setView(VIEWS.HISTORIAL)}
      >
        Ver historial de asistencia
      </SecondaryButton>
    </>
  );
}

function TooEarlyView({ setView }) {
  return (
    <>
      <EmployeeCard />
      <ClockCard time="07:10 AM" />

      <StatusCard
        icon="time-outline"
        title="Inicio aún no disponible"
        description="Podrás registrar tu entrada dentro de la ventana permitida."
        tone="amber"
      />

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Horario de entrada</Text>
        <Text style={styles.infoBig}>08:00 AM</Text>
        <Text style={styles.infoText}>
          La ventana de registro estará disponible unos minutos antes del inicio
          de tu jornada.
        </Text>
      </View>

      <PrimaryButton disabled>Registrar inicio de labores</PrimaryButton>
      <SecondaryButton onPress={() => setView(VIEWS.INICIAL)}>
        Volver a estado disponible
      </SecondaryButton>
    </>
  );
}

function GpsView({ setView }) {
  return (
    <>
      <EmployeeCard />
      <ClockCard />

      <StatusCard
        icon="location-outline"
        title="Ubicación requerida"
        description="Activa la ubicación del dispositivo para validar tu registro."
        tone="red"
      />

      <View style={styles.infoCard}>
        <View style={styles.bigIcon}>
          <Ionicons name="location" size={30} color={COLORS.red} />
        </View>
        <Text style={styles.centerTitle}>Necesitamos tu ubicación</Text>
        <Text style={styles.centerText}>
          Para esta demostración no se solicitará ningún permiso real.
        </Text>
      </View>

      <PrimaryButton onPress={() => setView(VIEWS.INICIAL)} icon="location">
        Simular ubicación activa
      </PrimaryButton>
    </>
  );
}

function StartedView({ setView }) {
  return (
    <>
      <EmployeeCard />
      <ClockCard time="08:01 AM" />

      <Toast
        title="Inicio registrado"
        description="Tu entrada fue registrada correctamente."
      />

      <StatusCard
        icon="checkmark"
        title="Jornada iniciada"
        description="Inicio de labores registrado a las 08:01 AM."
      />

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Entrada</Text>
          <Text style={styles.metricValue}>08:01</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Tiempo laborado</Text>
          <Text style={styles.metricValue}>00:00</Text>
        </View>
      </View>

      <PrimaryButton onPress={() => setView(VIEWS.JORNADA)}>
        Continuar a jornada en curso
      </PrimaryButton>
    </>
  );
}

function LateView({ setView }) {
  const [reason, setReason] = useState("");

  return (
    <>
      <EmployeeCard />
      <ClockCard time="08:18 AM" />

      <Toast
        tone="warning"
        title="Entrada con retardo"
        description="Tu entrada fue registrada con retardo."
      />

      <StatusCard
        icon="alert-outline"
        title="Justificación requerida"
        description="Agrega una breve explicación para continuar."
        tone="amber"
      />

      <Text style={styles.fieldLabel}>Motivo del retardo</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Ej. Tráfico intenso en el trayecto"
        placeholderTextColor="#9AA0A6"
        multiline
        style={styles.textArea}
      />

      <PrimaryButton onPress={() => setView(VIEWS.JORNADA)}>
        Guardar justificación
      </PrimaryButton>
    </>
  );
}

function WorkdayView({ setView, openModal }) {
  return (
    <>
      <EmployeeCard />

      <View style={styles.workdayHero}>
        <Text style={styles.workdayEyebrow}>JORNADA EN CURSO</Text>
        <Text style={styles.workdayTime}>03 h 42 min</Text>
        <Text style={styles.workdaySub}>
          Inicio de labores · 08:01 AM
        </Text>
      </View>

      <StatusCard
        icon="briefcase-outline"
        title="Trabajando"
        description="Tu jornada se encuentra activa."
        tone="blue"
      />

      <PrimaryButton onPress={() => openModal("pause")} icon="restaurant-outline">
        Registrar pausa de comida
      </PrimaryButton>

      <SecondaryButton
        danger
        icon="log-out-outline"
        onPress={() => openModal("finish")}
      >
        Registrar fin de labores
      </SecondaryButton>

      <SecondaryButton onPress={() => setView(VIEWS.RESUMEN)} icon="stats-chart">
        Ver resumen
      </SecondaryButton>
    </>
  );
}

function LunchView({ setView }) {
  return (
    <>
      <EmployeeCard />

      <Toast
        title="Pausa registrada"
        description="Tu pausa de comida inició a las 01:30 PM."
      />

      <View style={styles.workdayHero}>
        <Text style={styles.workdayEyebrow}>PAUSA DE COMIDA</Text>
        <Text style={styles.workdayTime}>00 h 18 min</Text>
        <Text style={styles.workdaySub}>Inicio de pausa · 01:30 PM</Text>
      </View>

      <StatusCard
        icon="restaurant-outline"
        title="En pausa de comida"
        description="Cuando regreses, registra tu regreso a labores."
        tone="amber"
      />

      <PrimaryButton onPress={() => setView(VIEWS.REGRESO)}>
        Registrar regreso de comida
      </PrimaryButton>
    </>
  );
}

function ReturnView({ setView }) {
  return (
    <>
      <EmployeeCard />

      <Toast
        title="Regreso registrado"
        description="Tu regreso de comida se registró correctamente."
      />

      <StatusCard
        icon="checkmark"
        title="Jornada reanudada"
        description="Regreso de comida registrado a las 02:05 PM."
      />

      <View style={styles.timelineCard}>
        <TimelineRow icon="log-in-outline" title="Entrada" time="08:01 AM" />
        <TimelineRow icon="restaurant-outline" title="Inicio comida" time="01:30 PM" />
        <TimelineRow
          icon="play-outline"
          title="Regreso comida"
          time="02:05 PM"
          active
          last
        />
      </View>

      <PrimaryButton onPress={() => setView(VIEWS.SALIDA)}>
        Continuar jornada
      </PrimaryButton>
    </>
  );
}

function FinishView({ setView }) {
  const [reason, setReason] = useState("");

  return (
    <>
      <EmployeeCard />
      <ClockCard time="04:35 PM" />

      <StatusCard
        icon="alert-outline"
        title="Salida anticipada"
        description="Tu horario termina a las 05:00 PM. Agrega una justificación."
        tone="amber"
      />

      <Text style={styles.fieldLabel}>Motivo de salida anticipada</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Escribe el motivo"
        placeholderTextColor="#9AA0A6"
        multiline
        style={styles.textArea}
      />

      <PrimaryButton onPress={() => setView(VIEWS.FINALIZADA)}>
        Confirmar fin de labores
      </PrimaryButton>
    </>
  );
}

function FinishedView({ setView }) {
  return (
    <>
      <EmployeeCard />

      <Toast
        title="Fin de labores registrado"
        description="Tu jornada se cerró correctamente."
      />

      <StatusCard
        icon="checkmark-done-outline"
        title="Jornada finalizada"
        description="Salida registrada a las 05:03 PM."
      />

      <View style={styles.summaryCard}>
        <SummaryItem label="Entrada" value="08:01 AM" icon="log-in-outline" />
        <SummaryItem label="Comida" value="01:30 - 02:05 PM" icon="restaurant-outline" />
        <SummaryItem label="Salida" value="05:03 PM" icon="log-out-outline" />
        <SummaryItem label="Total registrado" value="8 h 27 min" icon="time-outline" />
      </View>

      <PrimaryButton onPress={() => setView(VIEWS.RESUMEN)}>
        Ver resumen de jornada
      </PrimaryButton>
    </>
  );
}

function ModalityView() {
  const [selected, setSelected] = useState("Presencial");

  const options = [
    { label: "Presencial", icon: "business-outline" },
    { label: "Home Office", icon: "home-outline" },
    { label: "Viaje de negocios", icon: "airplane-outline" },
    { label: "Vacaciones", icon: "sunny-outline" },
    { label: "Incapacidad", icon: "medkit-outline" },
    { label: "Cumpleaños", icon: "gift-outline" },
  ];

  return (
    <>
      <EmployeeCard />

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Modalidad de jornada</Text>
        <Text style={styles.sectionSubtitle}>
          Selecciona cómo se registrará tu jornada de hoy.
        </Text>
      </View>

      {options.map((item) => {
        const active = selected === item.label;
        return (
          <Pressable
            key={item.label}
            onPress={() => setSelected(item.label)}
            style={[
              styles.optionCard,
              active && {
                borderColor: COLORS.red,
                backgroundColor: COLORS.redSoft,
              },
            ]}
          >
            <View
              style={[
                styles.optionIcon,
                active && { backgroundColor: "#FFFFFF" },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={21}
                color={active ? COLORS.red : COLORS.secondary}
              />
            </View>
            <Text style={styles.optionTitle}>{item.label}</Text>
            <Ionicons
              name={active ? "checkmark-circle" : "ellipse-outline"}
              size={21}
              color={active ? COLORS.red : "#C6CBD1"}
            />
          </Pressable>
        );
      })}

      <PrimaryButton>Guardar modalidad</PrimaryButton>
    </>
  );
}

function SummaryView({ setView }) {
  return (
    <>
      <EmployeeCard />

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Resumen de jornada</Text>
        <Text style={styles.sectionSubtitle}>Miércoles, 30 de septiembre</Text>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total registrado</Text>
        <Text style={styles.totalValue}>8 h 20 min</Text>
        <View style={styles.totalLine} />
        <Text style={styles.totalHint}>Jornada completa</Text>
      </View>

      <View style={styles.timelineCard}>
        <TimelineRow icon="log-in-outline" title="Entrada" time="08:01 AM" />
        <TimelineRow icon="restaurant-outline" title="Inicio comida" time="01:30 PM" />
        <TimelineRow icon="play-outline" title="Regreso comida" time="02:05 PM" />
        <TimelineRow
          icon="log-out-outline"
          title="Salida"
          time="05:03 PM"
          last
        />
      </View>

      <PrimaryButton onPress={() => setView(VIEWS.HISTORIAL)}>
        Ver historial de asistencia
      </PrimaryButton>
    </>
  );
}

function HistoryView({ setView }) {
  const days = [
    { date: "Mié 30 Sep", time: "8 h 20 min", status: "Completa" },
    { date: "Mar 29 Sep", time: "8 h 05 min", status: "Completa" },
    { date: "Lun 28 Sep", time: "7 h 46 min", status: "Retardo" },
    { date: "Vie 25 Sep", time: "8 h 12 min", status: "Completa" },
  ];

  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Historial de asistencia</Text>
        <Text style={styles.sectionSubtitle}>
          Consulta tus últimos registros.
        </Text>
      </View>

      {days.map((item, index) => (
        <Pressable
          key={item.date}
          onPress={() => setView(VIEWS.DETALLE)}
          style={styles.historyCard}
        >
          <View style={styles.historyDateIcon}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.historyDate}>{item.date}</Text>
            <Text style={styles.historyTime}>{item.time}</Text>
          </View>
          <View
            style={[
              styles.historyStatus,
              item.status === "Retardo" && { backgroundColor: COLORS.amberSoft },
            ]}
          >
            <Text
              style={[
                styles.historyStatusText,
                item.status === "Retardo" && { color: COLORS.amber },
              ]}
            >
              {item.status}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A8ADB3" />
        </Pressable>
      ))}
    </>
  );
}

function DetailView({ setView }) {
  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Detalle del día</Text>
        <Text style={styles.sectionSubtitle}>Miércoles, 30 de septiembre</Text>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total registrado</Text>
        <Text style={styles.totalValue}>8 h 20 min</Text>
      </View>

      <View style={styles.timelineCard}>
        <TimelineRow icon="log-in-outline" title="Entrada" time="08:01 AM" />
        <TimelineRow icon="restaurant-outline" title="Inicio comida" time="01:30 PM" />
        <TimelineRow icon="play-outline" title="Regreso comida" time="02:05 PM" />
        <TimelineRow icon="log-out-outline" title="Salida" time="05:03 PM" last />
      </View>

      <StatusCard
        icon="checkmark"
        title="Jornada completa"
        description="Todos los movimientos fueron registrados."
      />

      <SecondaryButton onPress={() => setView(VIEWS.HISTORIAL)}>
        Regresar al historial
      </SecondaryButton>
    </>
  );
}

export default function RHPrototype() {
  const [view, setView] = useState(VIEWS.INICIAL);
  const [modalType, setModalType] = useState(null);

  const title = useMemo(
    () => DEMO_VIEWS.find((item) => item.key === view)?.label || "Asistencia",
    [view],
  );

  const openModal = (type) => setModalType(type);

  const confirmModal = () => {
    const current = modalType;
    setModalType(null);

    if (current === "start") {
      setView(VIEWS.INICIADO);
      return;
    }

    if (current === "pause") {
      setView(VIEWS.PAUSA);
      return;
    }

    if (current === "finish") {
      setView(VIEWS.SALIDA);
    }
  };

  const renderView = () => {
    switch (view) {
      case VIEWS.TEMPRANO:
        return <TooEarlyView setView={setView} />;
      case VIEWS.GPS:
        return <GpsView setView={setView} />;
      case VIEWS.INICIADO:
        return <StartedView setView={setView} />;
      case VIEWS.RETARDO:
        return <LateView setView={setView} />;
      case VIEWS.JORNADA:
        return <WorkdayView setView={setView} openModal={openModal} />;
      case VIEWS.PAUSA:
        return <LunchView setView={setView} />;
      case VIEWS.REGRESO:
        return <ReturnView setView={setView} />;
      case VIEWS.SALIDA:
        return <FinishView setView={setView} />;
      case VIEWS.FINALIZADA:
        return <FinishedView setView={setView} />;
      case VIEWS.MODALIDAD:
        return <ModalityView />;
      case VIEWS.RESUMEN:
        return <SummaryView setView={setView} />;
      case VIEWS.HISTORIAL:
        return <HistoryView setView={setView} />;
      case VIEWS.DETALLE:
        return <DetailView setView={setView} />;
      case VIEWS.INICIAL:
      default:
        return (
          <InitialView
            setView={setView}
            openModal={openModal}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.bg}
      />

      <View style={styles.screen}>
        <Header />

        {/* SOLO PARA PRUEBA VISUAL.
            Puedes eliminar este bloque cuando conectes la lógica real. */}
        <View style={styles.demoBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.demoLabel}>PROTOTIPO RH</Text>
            <Text style={styles.demoCurrent} numberOfLines={1}>{title}</Text>
          </View>
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>DEMO</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.demoTabsScroll}
          contentContainerStyle={styles.demoTabs}
        >
          {DEMO_VIEWS.map((item) => {
            const active = item.key === view;
            return (
              <Pressable
                key={item.key}
                onPress={() => setView(item.key)}
                style={[
                  styles.demoTab,
                  active && styles.demoTabActive,
                ]}
              >
                <Text
                  style={[
                    styles.demoTabText,
                    active && styles.demoTabTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {renderView()}
        </ScrollView>

        <View style={styles.bottomNav}>
          <Pressable style={styles.navItem} onPress={() => router.back()}>
            <Ionicons name="home-outline" size={22} color={COLORS.secondary} />
            <Text style={styles.navLabel}>Inicio</Text>
          </Pressable>

          <Pressable
            style={styles.navItem}
            onPress={() => setView(VIEWS.INICIAL)}
          >
            <Ionicons name="time" size={22} color={COLORS.red} />
            <Text style={[styles.navLabel, styles.navLabelActive]}>
              Asistencia
            </Text>
          </Pressable>

          <Pressable
            style={styles.navItem}
            onPress={() => setView(VIEWS.HISTORIAL)}
          >
            <Ionicons name="person-outline" size={22} color={COLORS.secondary} />
            <Text style={styles.navLabel}>Perfil</Text>
          </Pressable>
        </View>
      </View>

      <ModalCard
        visible={modalType === "start"}
        title="Confirmar registro"
        description="¿Deseas registrar el inicio de labores?"
        confirmText="Confirmar"
        onCancel={() => setModalType(null)}
        onConfirm={confirmModal}
      />

      <ModalCard
        visible={modalType === "pause"}
        title="Confirmar pausa"
        description="¿Deseas registrar el inicio de tu pausa de comida?"
        confirmText="Registrar"
        icon="restaurant-outline"
        onCancel={() => setModalType(null)}
        onConfirm={confirmModal}
      />

      <ModalCard
        visible={modalType === "finish"}
        title="Confirmar salida"
        description="¿Deseas registrar el fin de labores?"
        confirmText="Continuar"
        icon="log-out-outline"
        onCancel={() => setModalType(null)}
        onConfirm={confirmModal}
      />
    </SafeAreaView>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#111111",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  android: {
    elevation: 1,
  },
  default: {},
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  header: {
    marginHorizontal: 16,
    marginTop: 8,
    minHeight: 70,
    borderRadius: 20,
    backgroundColor: "#F6F7F7",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF0F2",
  },

  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.red,
    alignItems: "center",
    justifyContent: "center",
  },

  headerLogoText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  headerText: {
    flex: 1,
    marginLeft: 12,
  },

  headerEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.red,
    letterSpacing: 0.7,
  },

  headerTitle: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
  },

  headerMore: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  demoBar: {
    marginHorizontal: 16,
    marginTop: 10,
    minHeight: 52,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  demoLabel: {
    fontSize: 9,
    color: COLORS.red,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  demoCurrent: {
    marginTop: 2,
    paddingRight: 10,
    fontSize: 13,
    lineHeight: 17,
    color: COLORS.text,
    fontWeight: "800",
  },

  demoBadge: {
    minWidth: 48,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  demoBadgeText: {
    color: COLORS.red,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  demoTabsScroll: {
    flexGrow: 0,
    marginTop: 8,
  },

  demoTabs: {
    paddingHorizontal: 16,
    paddingBottom: 3,
    gap: 7,
  },

  demoTab: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  demoTabActive: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.redSoft,
  },

  demoTabText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.secondary,
  },

  demoTabTextActive: {
    color: COLORS.red,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 104,
    gap: 11,
  },

  employeeCard: {
    minHeight: 124,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    flexDirection: "row",
    ...cardShadow,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: COLORS.redSoft,
    borderWidth: 1,
    borderColor: "#F6D4D8",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.red,
  },

  employeeInfo: {
    flex: 1,
    marginLeft: 12,
    paddingTop: 1,
  },

  employeeName: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },

  employeeMeta: {
    marginTop: 6,
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 14,
  },

  scheduleText: {
    marginTop: 3,
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 14,
    lineHeight: 14,
    fontWeight: "600",
  },

  employeeBadges: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  pill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  redPill: {
    backgroundColor: COLORS.redSoft,
  },

  amberPill: {
    backgroundColor: COLORS.amberSoft,
  },

  pillText: {
    fontSize: 10,
    fontWeight: "700",
  },

  clockCard: {
    minHeight: 82,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
    ...cardShadow,
  },

  clockLabel: {
    color: "#3D4754",
    fontSize: 11,
    fontWeight: "700",
  },

  clockValue: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "900",
  },

  statusCard: {
    minHeight: 80,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
  },

  statusIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  statusCopy: {
    flex: 1,
    marginLeft: 12,
  },

  statusTitle: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },

  statusDescription: {
    marginTop: 3,
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 14,
    lineHeight: 15,
  },

  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    textAlign: "center",
  },

  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textAlign: "center",
  },

  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },

  infoCard: {
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    ...cardShadow,
  },

  infoTitle: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: "700",
  },

  infoBig: {
    marginTop: 7,
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },

  infoText: {
    marginTop: 8,
    color: COLORS.secondary,
    fontSize: 11,
    lineHeight: 17,
  },

  bigIcon: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  centerTitle: {
    marginTop: 14,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },

  centerText: {
    marginTop: 7,
    color: COLORS.secondary,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },

  metricRow: {
    flexDirection: "row",
    gap: 10,
  },

  metricCard: {
    flex: 1,
    minHeight: 88,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },

  metricLabel: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: "700",
  },

  metricValue: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "900",
  },

  fieldLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },

  textArea: {
    minHeight: 104,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 18,
    textAlignVertical: "top",
  },

  workdayHero: {
    minHeight: 132,
    borderRadius: 20,
    backgroundColor: COLORS.text,
    paddingHorizontal: 18,
    paddingVertical: 17,
    justifyContent: "center",
  },

  workdayEyebrow: {
    color: "#FFB9BF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
  },

  workdayTime: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
  },

  workdaySub: {
    marginTop: 7,
    color: "#D4D6D9",
    fontSize: 11,
    lineHeight: 15,
  },

  timelineCard: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...cardShadow,
  },

  timelineRow: {
    minHeight: 68,
    flexDirection: "row",
  },

  timelineVisual: {
    width: 42,
    alignItems: "center",
  },

  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.soft,
    alignItems: "center",
    justifyContent: "center",
  },

  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: "#ECEEF0",
    marginVertical: 4,
  },

  timelineCopy: {
    flex: 1,
    paddingLeft: 10,
    paddingTop: 4,
  },

  timelineTitle: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },

  timelineTime: {
    marginTop: 3,
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 14,
  },

  summaryCard: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },

  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
  },

  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  summaryLabel: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: "700",
  },

  summaryValue: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },

  sectionHead: {
    marginBottom: 2,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },

  sectionSubtitle: {
    marginTop: 4,
    color: COLORS.secondary,
    fontSize: 11,
    lineHeight: 16,
  },

  optionCard: {
    minHeight: 64,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.soft,
    alignItems: "center",
    justifyContent: "center",
  },

  optionTitle: {
    flex: 1,
    marginLeft: 12,
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },

  totalCard: {
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    ...cardShadow,
  },

  totalLabel: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: "700",
  },

  totalValue: {
    marginTop: 6,
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },

  totalLine: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 13,
  },

  totalHint: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: "800",
  },

  historyCard: {
    minHeight: 76,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    ...cardShadow,
  },

  historyDateIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  historyDate: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },

  historyTime: {
    marginTop: 3,
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 14,
  },

  historyStatus: {
    borderRadius: 999,
    backgroundColor: COLORS.greenSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginRight: 7,
  },

  historyStatusText: {
    color: COLORS.green,
    fontSize: 9,
    fontWeight: "800",
  },

  toast: {
    minHeight: 66,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
  },

  toastIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  toastTitle: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },

  toastDescription: {
    marginTop: 3,
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 14,
    lineHeight: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(18, 20, 23, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  modalCard: {
    width: "100%",
    maxWidth: 330,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 20,
    alignItems: "center",
  },

  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  modalTitle: {
    marginTop: 14,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },

  modalDescription: {
    marginTop: 8,
    color: COLORS.secondary,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },

  modalButtons: {
    marginTop: 22,
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },

  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.soft,
    alignItems: "center",
    justifyContent: "center",
  },

  modalCancelText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
  },

  modalConfirm: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.red,
    alignItems: "center",
    justifyContent: "center",
  },

  modalConfirmText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },

  bottomNav: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 10,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    ...cardShadow,
  },

  navItem: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },

  navLabel: {
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 13,
  },

  navLabelActive: {
    color: COLORS.red,
    fontWeight: "800",
  },
});