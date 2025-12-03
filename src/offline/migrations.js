import { execAsync } from './db';

export async function runMigrations() {
  // Órdenes (solo campos que usa tu UI)
  await execAsync(`CREATE TABLE IF NOT EXISTS orders (
    Orderid TEXT PRIMARY KEY,
    order_type TEXT,
    equipment TEXT,
    start_date INTEGER,
    finish_date INTEGER,
    estatus TEXT,
    direccion_json TEXT,  -- para detalle
    updated_at INTEGER
  );`);
  await execAsync(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(estatus);`);

  // Operaciones por orden (para detalle)
  await execAsync(`CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    Orderid TEXT,
    activity TEXT,
    subactivity TEXT,
    description TEXT,
    estatus TEXT,
    Strttimcon INTEGER,
    Fintimcons INTEGER,
    duracion_minutos INTEGER,
    updated_at INTEGER
  );`);
  await execAsync(`CREATE INDEX IF NOT EXISTS idx_ops_order ON operations(Orderid);`);

  // Partners por orden (para detalle)
  await execAsync(`CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Orderid TEXT,
    role TEXT,
    partner TEXT,
    updated_at INTEGER
  );`);
  await execAsync(`CREATE INDEX IF NOT EXISTS idx_partners_order ON partners(Orderid);`);



  
  // Notificaciones (lista)
  await execAsync(`CREATE TABLE IF NOT EXISTS notifications (
    NotifNo TEXT PRIMARY KEY,
    NotifType TEXT,
    Planplant TEXT,
    Equipment TEXT,
    ShortText TEXT,
    NotifDate INTEGER,
    Orderid TEXT,
    leida INTEGER DEFAULT 0,
    updated_at INTEGER
  );`);

  // Detalle completo de la notif como JSON para simplificar
  await execAsync(`CREATE TABLE IF NOT EXISTS notification_detail (
    NotifNo TEXT PRIMARY KEY,
    payload_json TEXT,
    updated_at INTEGER
  );`);

  // Leídas por usuario (tu API ya las maneja; lo guardamos para offline UI)
  await execAsync(`CREATE TABLE IF NOT EXISTS notifications_read (
    usuario_id INTEGER,
    NotifNo TEXT,
    leido_en INTEGER,
    PRIMARY KEY (usuario_id, NotifNo)
  );`);
}
