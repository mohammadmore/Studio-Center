import path from 'path';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

let db: any;
try {
  const dbPath = process.env.DB_NAME || path.join(process.cwd(), 'database.sqlite');
  const sqliteDb = new DatabaseSync(dbPath);
  
  // Wrap to emulate better-sqlite3 API (e.g. transaction())
  db = {
    exec: (sql: string) => sqliteDb.exec(sql),
    prepare: (sql: string) => {
      const stmt = sqliteDb.prepare(sql);
      return {
        run: (...args: any[]) => stmt.run(...args),
        get: (...args: any[]) => stmt.get(...args),
        all: (...args: any[]) => stmt.all(...args),
      };
    },
    transaction: (fn: Function) => {
      return (...args: any[]) => {
        sqliteDb.exec('BEGIN TRANSACTION;');
        try {
          const result = fn(...args);
          sqliteDb.exec('COMMIT;');
          return result;
        } catch (ex) {
          sqliteDb.exec('ROLLBACK;');
          throw ex;
        }
      };
    }
  };
} catch (err: any) {
  const errorMsg = `CRITICAL ERROR: Failed to load database layer (node:sqlite). ${err.message}`;
  console.error(errorMsg);
  fs.appendFileSync('boot-error.log', `[${new Date().toISOString()}] ${errorMsg}\n`);
  process.exit(1);
}

export default db;
