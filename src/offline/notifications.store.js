import api from '../services/api';
import { execAsync, rowsToArray } from './db';
import { isOnline } from './net';

function toMillis(d){ return d ? new Date(d).getTime() : null; }

export async function cacheNotifications(list){
  if(!Array.isArray(list)) return;
  for(const n of list){
    await execAsync(
      `INSERT INTO notifications (NotifNo, NotifType, Planplant, Equipment, ShortText, NotifDate, Orderid, leida, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(NotifNo) DO UPDATE SET
         NotifType=excluded.NotifType, Planplant=excluded.Planplant, Equipment=excluded.Equipment,
         ShortText=excluded.ShortText, NotifDate=excluded.NotifDate, Orderid=excluded.Orderid,
         leida=excluded.leida, updated_at=excluded.updated_at`,
      [
        String(n.NotifNo), n.NotifType ?? null, n.Planplant ?? null, n.Equipment ?? null,
        n.ShortText ?? null, toMillis(n.NotifDate), n.Orderid ?? null, n.leida ? 1 : 0, Date.now()
      ]
    );

    // guarda detalle completo (items/activities/partners) como JSON (tu API ya los trae)
    await execAsync(
      `INSERT INTO notification_detail (NotifNo, payload_json, updated_at)
       VALUES (?,?,?)
       ON CONFLICT(NotifNo) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
      [String(n.NotifNo), JSON.stringify(n), Date.now()]
    );
  }
}

export async function listNotificationsOffline(){
  const r = await execAsync(`SELECT * FROM notifications ORDER BY NotifDate DESC NULLS LAST`);
  return rowsToArray(r).map(x => ({
    NotifNo: x.NotifNo, NotifType: x.NotifType, Planplant: x.Planplant,
    Equipment: x.Equipment, ShortText: x.ShortText, NotifDate: x.NotifDate,
    Orderid: x.Orderid, leida: !!x.leida
  }));
}

export async function getNotificationOffline(NotifNo){
  const r = await execAsync(`SELECT payload_json FROM notification_detail WHERE NotifNo=? LIMIT 1`, [String(NotifNo)]);
  if(!r.rows.length) return null;
  return JSON.parse(r.rows.item(0).payload_json);
}

export async function fetchNotificationsSmart(token){
  if(isOnline()){
    try{
      const { data } = await api.get('/notificaciones', { headers:{ Authorization:`Bearer ${token}` }});
      await cacheNotifications(data);
      return data;
    }catch{ /* fallback */ }
  }
  return await listNotificationsOffline();
}

export async function markReadLocal(usuario_id, NotifNo){
  await execAsync(
    `INSERT OR REPLACE INTO notifications_read (usuario_id, NotifNo, leido_en) VALUES (?,?,?)`,
    [usuario_id, String(NotifNo), Date.now()]
  );
  await execAsync(`UPDATE notifications SET leida=1 WHERE NotifNo=?`, [String(NotifNo)]);
}

export async function fetchNotificationDetailSmart(token, NotifNo){
  // Tu API no tiene endpoint /notificaciones/:id; ya vino en la lista.
  // Intentamos leer de cache; si online y la lista ya se pidió, ya está.
  const cached = await getNotificationOffline(NotifNo);
  if(cached) return cached;

  // Si quisieras forzar refetch del listado:
  if(isOnline()){
    try{
      const { data } = await api.get('/notificaciones', { headers:{ Authorization:`Bearer ${token}` }});
      await cacheNotifications(data);
      return await getNotificationOffline(NotifNo);
    }catch{}
  }
  return null;
}
