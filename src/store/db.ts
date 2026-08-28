import db from './db_sqlite.js';
import {
  roles, colleagues, organizations, collections, contents, leaves, audit_logs,
  recycle_bin, batch_operations, notifications, tokens, templatesData,
  contentTemplates, templateSuggestions, expenses, invoices, mediaAssets,
  smartEventsBank, clientSelections, settings
} from "./state.js";
import fs from 'fs';

const tables = {
  roles, colleagues, organizations, collections, contents, leaves, audit_logs,
  recycle_bin, batch_operations, notifications, tokens, templatesData,
  contentTemplates, templateSuggestions, expenses, invoices, mediaAssets,
  smartEventsBank, clientSelections
};

// Initialize SQLite tables
db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    table_name TEXT,
    id TEXT,
    data TEXT,
    PRIMARY KEY (table_name, id)
  );
  CREATE TABLE IF NOT EXISTS store_settings (
    key TEXT PRIMARY KEY,
    data TEXT
  );
`);

const stateHashes = new Map<string, string>();

function hashObj(obj: any) {
  return JSON.stringify(obj);
}

let saveTimeout: NodeJS.Timeout | null = null;
export let localDbTimestamp = 0;

export async function saveDatabase() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      db.transaction(() => {
        // Sync tables
        for (const [tableName, array] of Object.entries(tables)) {
          const currentIds = new Set<string>();
          for (const item of array) {
            const id = String(item.id);
            currentIds.add(id);
            const h = hashObj(item);
            const key = `${tableName}_${id}`;
            if (stateHashes.get(key) !== h) {
              db.prepare(`INSERT INTO store (table_name, id, data) VALUES (?, ?, ?) ON CONFLICT(table_name, id) DO UPDATE SET data = excluded.data`).run(tableName, id, h);
              stateHashes.set(key, h);
            }
          }
          // Deletions
          const toDelete = [];
          for (const key of stateHashes.keys()) {
            if (key.startsWith(tableName + '_')) {
              const id = key.substring(tableName.length + 1);
              if (!currentIds.has(id)) {
                toDelete.push(id);
                stateHashes.delete(key);
              }
            }
          }
          if (toDelete.length > 0) {
            const stmt = db.prepare(`DELETE FROM store WHERE table_name = ? AND id = ?`);
            for (const id of toDelete) {
              stmt.run(tableName, id);
            }
          }
        }
        
        // Sync settings
        const settingsStr = JSON.stringify(settings);
        db.prepare(`INSERT INTO store_settings (key, data) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data`).run(settingsStr);
      })();
      localDbTimestamp = Date.now();
    } catch (e) {
      console.error("Error saving DB to SQLite:", e);
    }
  }, 100);
}

export async function loadDatabase() {
  try {
    const rows = db.prepare(`SELECT table_name, id, data FROM store`).all() as { table_name: string, id: string, data: string }[];
    const grouped: any = {};
    for (const row of rows) {
      if (!grouped[row.table_name]) grouped[row.table_name] = [];
      grouped[row.table_name].push(JSON.parse(row.data));
      stateHashes.set(`${row.table_name}_${row.id}`, row.data);
    }

    if (grouped.roles) { roles.length = 0; roles.push(...grouped.roles); }
    if (grouped.colleagues) { colleagues.length = 0; colleagues.push(...grouped.colleagues); }
    if (grouped.organizations) { organizations.length = 0; organizations.push(...grouped.organizations); }
    if (grouped.collections) { collections.length = 0; collections.push(...grouped.collections); }
    if (grouped.contents) { contents.length = 0; contents.push(...grouped.contents); }
    if (grouped.leaves) { leaves.length = 0; leaves.push(...grouped.leaves); }
    if (grouped.audit_logs) { audit_logs.length = 0; audit_logs.push(...grouped.audit_logs); }
    if (grouped.recycle_bin) { recycle_bin.length = 0; recycle_bin.push(...grouped.recycle_bin); }
    if (grouped.batch_operations) { batch_operations.length = 0; batch_operations.push(...grouped.batch_operations); }
    if (grouped.notifications) { notifications.length = 0; notifications.push(...grouped.notifications); }
    if (grouped.tokens) { tokens.length = 0; tokens.push(...grouped.tokens); }
    if (grouped.templatesData) { templatesData.length = 0; templatesData.push(...grouped.templatesData); }
    if (grouped.contentTemplates) { contentTemplates.length = 0; contentTemplates.push(...grouped.contentTemplates); }
    if (grouped.templateSuggestions) { templateSuggestions.length = 0; templateSuggestions.push(...grouped.templateSuggestions); }
    if (grouped.expenses) { expenses.length = 0; expenses.push(...grouped.expenses); }
    if (grouped.invoices) { invoices.length = 0; invoices.push(...grouped.invoices); }
    if (grouped.mediaAssets) { mediaAssets.length = 0; mediaAssets.push(...grouped.mediaAssets); }
    if (grouped.smartEventsBank) { smartEventsBank.length = 0; smartEventsBank.push(...grouped.smartEventsBank); }
    if (grouped.clientSelections) { clientSelections.length = 0; clientSelections.push(...grouped.clientSelections); }

    const settingRow = db.prepare(`SELECT data FROM store_settings WHERE key = 'settings'`).get() as { data: string } | undefined;
    if (settingRow) {
      Object.assign(settings, JSON.parse(settingRow.data));
    }
    console.log("Database fully loaded from SQLite");
  } catch (error) {
    console.error("Error loading data from SQLite", error);
  }
}
