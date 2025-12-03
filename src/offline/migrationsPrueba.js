import { execAsync } from "./db";

export async function runMigrations() {

    //TABLA DE LAS WORKORDERS
    await execAsync(`CREATE TABLE IF NOT EXISTS orders(
            Orderid TEXT PRIMARY KEY,
            order_type TEXT,
            equipment TEXT,
            start_date INTEGER,
            finish_date INTEGER,
            estatus TEXT,
            direccion_json TEXT, 
            updated_at INTEGER
        );`)
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(estatus);`);


    //TABLA OPERACIONES DE LA ORDEN 
    await execAsync(`CREATE TABLE IF NOT EXISTS operations(
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

    //PARTNERS
    await execAsync(`CREATE TABLE IF NOT EXISTS partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Orderid TEXT,
        role TEXT,
        partner TEXT,
        updated_at INTEGER
        );`);
    await execAsync(`CREATE INDEX IF NOT EXISTS idx_partners_orders_order ON partners(Orderid)`)
    

    //NOTIFICACIONES
    await execAsync(`CREATE TABLE IF NOT EXISTS notifications(
        NotifNo TEXT PRIMARY KEY,
        NotifType TEXT,
        Planplant TEXT,
        Equipment TEXT, 
        ShortText TEXT,
        NotifDate INTEGER DEFAULT 0,
        updated_at INTEGER
        );`)

        await execAsync (`CREATE TABLE IF NOT EXISTS notification_detail (
            usuario_id INTEGER,
            NotifNo TEXT,
            leido_en INTEGER, 
            PRIMARY KEY (usuario_id, NotifNo);`)
}