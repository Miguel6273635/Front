// Simple store en memoria para pruebas
let _seq = 1;

const initialAvisos = [
  {
    id: `AV-${String(_seq++).padStart(4, '0')}`,
    fechaISO: new Date().toISOString(),
    status: 'Pendiente',
    cliente: {
      razonSocial: 'Condominio Reforma 123',
      mx: 'MX-001',
      cm: 'CM-045',
      direccion: 'Av. Reforma 123, CDMX',
      solicitante: 'Juan Pérez',
      email: 'juan.perez@cliente.com',
      contrato: 'vigente', // vigente | postventa | recuperacion
      puesto: 'Administrador',
      telefono: '55-1234-5678',
      cobertura: 'CDMX'
    },
    equipo: {
      tipo: ['Elevador'],
      maquina: 'Gearless',
      control: 'Mitsubishi',
      capacidad: '1000 kg',
      velocidad: '1.5 m/s',
      voltaje: '220V',
      pisosServicio: 'PB-10',
      modelo: 'NEXIEZ',
      numeroEquipo: 'ELV-09',
      ubicacion: ['Cabina', 'Cubo']
    },
    reporte: {
      observaciones: 'Golpeteo esporádico al arrancar.',
      funcionando: false
    },
    partesElectronicas: [
      { concepto: 'Tarjeta control principal', partePlano: 'CTRL-001', cantidad: '1', analisisFalla: 'Pruebas cruzadas y registro de errores.' }
    ],
    partesMecanicas: [
      { concepto: 'Rodamiento cabina', partePlano: 'MEC-201', cantidad: '2' }
    ],
    software: { cambios: 'Ajuste parámetros de aceleración', concepto: 'Parametrización VFD' },
    fotos: []
  }
];

let _avisos = [...initialAvisos];

export function listAvisos() {
  // Lo más reciente primero
  return [..._avisos].sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
}

export function getAviso(id) {
  return _avisos.find(a => a.id === id) || null;
}

export function addAviso(payload) {
  const id = `AV-${String(_seq++).padStart(4, '0')}`;
  const nuevo = {
    id,
    status: 'Pendiente',
    fechaISO: new Date().toISOString(),
    ...payload
  };
  _avisos.unshift(nuevo);
  return id;
}

export function updateAviso(id, patch) {
  const ix = _avisos.findIndex(a => a.id === id);
  if (ix >= 0) _avisos[ix] = { ..._avisos[ix], ...patch };
}

export const STATUS_COLORS = {
  Pendiente: '#FFA000',
  'En proceso': '#0277BD',
  Cerrado: '#2E7D32'
};
