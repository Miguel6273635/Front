// src/offline/db.js
// Adaptador compatible con expo-sqlite NUEVO (openDatabaseSync/*Async) y LEGACY (openDatabase)
import * as SQLite from 'expo-sqlite';

let db;
const isNewAPI = !!SQLite.openDatabaseSync;

if (isNewAPI) {
  // API NUEVA (SDKs recientes)
  db = SQLite.openDatabaseSync('mitsu.db');
} else if (SQLite.openDatabase) {
  // API LEGACY
  db = SQLite.openDatabase('mitsu.db');
} else {
  throw new Error(
    '[SQLite] No se encontró ni openDatabaseSync ni openDatabase. Verifica que expo-sqlite esté instalado correctamente.'
  );
}

// Helper que emula el shape { rows } que tu código espera
function rowsWrapper(array) {
  return {
    length: array.length,
    item: (i) => array[i],
  };
}

// Ejecuta una sentencia y devuelve un objeto con .rows (para SELECT) o metadatos (INSERT/UPDATE)
export async function execAsync(sql, params = []) {
  const isSelect = /^\s*select/i.test(sql);

  if (isNewAPI) {
    if (isSelect) {
      const rows = await db.getAllAsync(sql, params);
      return { rows: rowsWrapper(rows) };
    } else {
      const res = await db.runAsync(sql, params);
      return {
        rows: rowsWrapper([]),
        insertId: res?.lastInsertRowId ?? null,
        rowsAffected: res?.changes ?? 0,
      };
    }
  }

  // LEGACY
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result),
        (_, err) => {
          console.log('[SQL ERROR]', err, sql);
          reject(err);
          return true;
        }
      );
    });
  });
}

// Lote de sentencias en transacción
export async function execBatch(statements) {
  if (!Array.isArray(statements) || !statements.length) return true;

  if (isNewAPI) {
    await db.withTransactionAsync(async (tx) => {
      for (const { sql, params = [] } of statements) {
        await tx.runAsync(sql, params);
      }
    });
    return true;
  }

  // LEGACY
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx) => {
        statements.forEach(({ sql, params = [] }) => tx.executeSql(sql, params));
      },
      (err) => reject(err),
      () => resolve(true)
    );
  });
}

// Útil para convertir result a array en tu código existente
export function rowsToArray(result) {
  const out = [];
  for (let i = 0; i < result.rows.length; i++) out.push(result.rows.item(i));
  return out;
}

export { db };
