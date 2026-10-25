import fs from "fs";
import path from "path";
import type { StorageDriver } from "./types.js";
import { createLocalBlobStore } from "./localBlobs.js";
import type { Snapshot } from "../state.js";

const LEGACY_TABLES = [
  "roles", "colleagues", "organizations", "collections", "contents", "leaves",
  "audit_logs", "recycle_bin", "batch_operations", "notifications", "tokens",
  "templatesData", "contentTemplates", "templateSuggestions", "expenses",
  "invoices", "mediaAssets", "smartEventsBank", "clientSelections",
];

/**
 * SQLite storage using Node's built-in `node:sqlite` (Node 22.5+, no native build
 * step, so it works on shared hosting). Each top-level collection is one row and
 * every save runs in a single transaction.
 */
export async function createSqliteDriver(file: string, dataDir: string): Promise<StorageDriver> {
  let DatabaseSync: any;
  try {
    DatabaseSync = (await import("node:sqlite" as string)).DatabaseSync;
  } catch {
    throw new Error(
      "STORAGE_DRIVER=sqlite needs Node.js 22.5 or newer (node:sqlite). Use STORAGE_DRIVER=json on older versions.",
    );
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_state (
      name TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const lastWritten = new Map<string, string>();

  // Databases created by the pre-Firebase version used a row-per-item layout.
  function loadLegacy(): Snapshot | null {
    const hasLegacy = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='store'`)
      .get();
    if (!hasLegacy) return null;
    const data: Snapshot = {};
    for (const name of LEGACY_TABLES) data[name] = [];
    const rows = db
      .prepare(`SELECT table_name, data FROM store ORDER BY rowid`)
      .all() as { table_name: string; data: string }[];
    for (const row of rows) {
      if (!data[row.table_name]) data[row.table_name] = [];
      data[row.table_name].push(JSON.parse(row.data));
    }
    const settingsRow = db
      .prepare(`SELECT data FROM store_settings WHERE key = 'settings'`)
      .get() as { data: string } | undefined;
    data.settings = settingsRow ? JSON.parse(settingsRow.data) : {};
    return rows.length > 0 || settingsRow ? data : null;
  }

  return {
    name: "sqlite",
    blobs: createLocalBlobStore(dataDir),
    async load() {
      const rows = db.prepare(`SELECT name, data FROM app_state`).all() as {
        name: string;
        data: string;
      }[];
      if (rows.length === 0) return loadLegacy();
      const data: Snapshot = {};
      for (const row of rows) {
        data[row.name] = JSON.parse(row.data);
        lastWritten.set(row.name, row.data);
      }
      return data;
    },
    async save(data) {
      const upsert = db.prepare(
        `INSERT INTO app_state (name, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      );
      const changed: [string, string][] = [];
      for (const [name, value] of Object.entries(data)) {
        const text = JSON.stringify(value);
        if (lastWritten.get(name) !== text) changed.push([name, text]);
      }
      if (changed.length === 0) return;
      db.exec("BEGIN IMMEDIATE");
      try {
        const now = Date.now();
        for (const [name, text] of changed) upsert.run(name, text, now);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      for (const [name, text] of changed) lastWritten.set(name, text);
    },
    async close() {
      db.close();
    },
  };
}
