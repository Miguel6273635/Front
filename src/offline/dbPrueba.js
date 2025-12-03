import * as SQLite from 'expo-sqlite';

let db;
const isNewAPI = !!SQLite.openDatabaseSync;

if(isNewAPI){
    db = SQLite.openDatabaseSync('mitsu.db');
}else if(SQLite.openDatabase){
    db= SQLite.openDatabaseAsync('mitsu.db');
}else{
    throw new Error (
        '[SQLite] No se encontró ni openDatabaseSync ni openDatabase. Verifica que expo-sqlite esté instalado correctamente.'
    );
}

function rowsWrapper(array){
    return{
        length: array.length,
        item: (i) => array[i],
    };
}

export async function execAsync(sql, params = []) {
    const isSelect = /^\s*select/i.test(sql);

    if(isNewAPI){
        if(isSelect){
            const rows = await db.getAllAsync(sql, params);
            return{rows: rowsWrapper(rows)}
        }else{
            const res = await db.runAsync(sql, params);
            return{
                rows: rowsWrapper([]),
                insertId: res?.lastInsertRowId ?? null,
                rowsAffected: res?.changes ?? 0,
            }
        }
    }

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

export async function execBatch(statements) {
    if(!Array.isArray(statements) || !statements.length) return true;

    if(isNewAPI){
        await db.withTransactionAsync(async(tx) => {
            for(const{sql, params = []} of statements) {
                await tx.runAsync(sql, params);
            }
        });
        return true;
    }
    

    return new Promise((resolve, reject) => {
        db.transaction(
            (tx) => {
                statements.forEach(({sql, params = []}) => tx.executeSql(sql, params));
            },
            (err) => reject(err),
            () => resolve(true)
        );
    });
}

export function rowsToArray(result){
    const out = [];
    for(let i = 0; i < result.rows.length; i++) out.push(result.rows.item(i));
    return out;
}

export {db} ;

