import api from '../services/api';
import { execAsync, rowsToArray } from './db';
import { isOnline } from './net';

function toMillis(d){ return d ? new Date(d).getTime() : null; }
function fromAPIrow(o){
  return [
    o.Orderid,
    o.order_type ?? o.OrderType,
    o.equipment ?? o.Equipment,
    toMillis(o.start_date ?? o.StartDate),
    toMillis(o.finish_date ?? o.FinishDate),
    o.estatus ?? null,
    null,                 // direccion_json se llena al pedir detalle
    Date.now()
  ];
}

export async function cacheOrders(apiRows){
  if(!apiRows?.length) return;
  const txs = apiRows.map(r => execAsync(
    `INSERT INTO orders (Orderid, order_type, equipment, start_date, finish_date, estatus, direccion_json, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(Orderid) DO UPDATE SET 
       order_type=excluded.order_type,
       equipment=excluded.equipment,
       start_date=excluded.start_date,
       finish_date=excluded.finish_date,
       estatus=excluded.estatus,
       updated_at=excluded.updated_at`,
    fromAPIrow(r)
  ));
  await Promise.all(txs);
}

export async function listOrdersOffline(){
  const res = await execAsync(`SELECT * FROM orders ORDER BY start_date DESC NULLS LAST`);
  return rowsToArray(res).map(r => ({
    Orderid: r.Orderid,
    order_type: r.order_type,
    equipment: r.equipment,
    start_date: r.start_date,
    finish_date: r.finish_date,
    estatus: r.estatus
  }));
}

export async function fetchOrdersSmart(token){
  if(isOnline()){
    try{
      const { data } = await api.get('/ordenes', { headers:{ Authorization:`Bearer ${token}` }});
      await cacheOrders(data);
      return data;
    }catch{ /* si falla, caemos a offline */ }
  }
  return await listOrdersOffline();
}

// ====== Detalle ======
function opFromAPI(op){
  return [
    String(op.id),
    String(op.Orderid),
    op.activity ?? op.Activity,
    op.subactivity ?? op.SubActivity,
    op.description ?? op.Description,
    op.estatus ?? null,
    toMillis(op.Strttimcon),
    toMillis(op.Fintimcons),
    op.duracion_minutos ?? null,
    Date.now()
  ];
}

export async function cacheOrderDetail(order){
  // guarda cabecera + direccion
  await execAsync(
    `INSERT INTO orders (Orderid, order_type, equipment, start_date, finish_date, estatus, direccion_json, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(Orderid) DO UPDATE SET 
       order_type=excluded.order_type,
       equipment=excluded.equipment,
       start_date=excluded.start_date,
       finish_date=excluded.finish_date,
       estatus=excluded.estatus,
       direccion_json=excluded.direccion_json,
       updated_at=excluded.updated_at`,
    [
      order.Orderid,
      order.order_type,
      order.equipment,
      toMillis(order.start_date),
      toMillis(order.finish_date),
      order.estatus ?? null,
      JSON.stringify(order.direccion || null),
      Date.now()
    ]
  );

  // limpia y re‑inserta operaciones y partners
  await execAsync(`DELETE FROM operations WHERE Orderid=?`, [order.Orderid]);
  await execAsync(`DELETE FROM partners   WHERE Orderid=?`, [order.Orderid]);

  if(Array.isArray(order.operaciones) && order.operaciones.length){
    for(const op of order.operaciones){
      await execAsync(
        `INSERT OR REPLACE INTO operations
         (id, Orderid, activity, subactivity, description, estatus, Strttimcon, Fintimcons, duracion_minutos, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        opFromAPI({ ...op, Orderid: order.Orderid })
      );
    }
  }

  if(Array.isArray(order.partners) && order.partners.length){
    for(const p of order.partners){
      await execAsync(
        `INSERT INTO partners (Orderid, role, partner, updated_at) VALUES (?,?,?,?)`,
        [order.Orderid, p.role ?? p.PartnRoleOld, p.partner ?? p.PartnerOld, Date.now()]
      );
    }
  }
}

export async function getOrderDetailOffline(Orderid){
  const headRes = await execAsync(`SELECT * FROM orders WHERE Orderid=? LIMIT 1`, [Orderid]);
  if(!headRes.rows.length) return null;
  const h = headRes.rows.item(0);

  const opsRes = await execAsync(`SELECT * FROM operations WHERE Orderid=? ORDER BY updated_at DESC`, [Orderid]);
  const partnersRes = await execAsync(`SELECT role, partner FROM partners WHERE Orderid=?`, [Orderid]);

  return {
    Orderid: h.Orderid,
    order_type: h.order_type,
    equipment: h.equipment,
    start_date: h.start_date,
    finish_date: h.finish_date,
    estatus: h.estatus,
    direccion: h.direccion_json ? JSON.parse(h.direccion_json) : null,
    operaciones: rowsToArray(opsRes).map(o => ({
      id: o.id, activity: o.activity, subactivity: o.subactivity, description: o.description,
      estatus: o.estatus, Strttimcon: o.Strttimcon, Fintimcons: o.Fintimcons, duracion_minutos: o.duracion_minutos
    })),
    partners: rowsToArray(partnersRes)
  };
}

export async function fetchOrderDetailSmart(token, Orderid){
  if(isOnline()){
    try{
      const { data } = await api.get(`/ordenes/${Orderid}`, { headers:{ Authorization:`Bearer ${token}` }});
      await cacheOrderDetail(data);
      return data;
    }catch{ /* fallback abajo */ }
  }
  return await getOrderDetailOffline(Orderid);
}
