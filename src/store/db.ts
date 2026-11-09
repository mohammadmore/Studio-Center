import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { createDriver } from "./drivers/index.js";
import type { BlobStore, StorageDriver } from "./drivers/types.js";
import {
  applySnapshot,
  colleagues,
  contents,
  integrations,
  mediaAssets,
  organizations,
  roles,
  settings,
  snapshotState,
} from "./state.js";
import { sanitizeIcon, safeColor, safeUrl } from "../utils/helpers.js";
import { encryptSecret, isEncrypted } from "../utils/secrets.js";
import { tokens } from "./state.js";

const SAVE_DELAY_MS = 500;

let driver: StorageDriver | null = null;
let ready = false;
let saveTimer: NodeJS.Timeout | null = null;
let saving: Promise<void> | null = null;
let dirty = false;

export function isDatabaseReady() {
  return ready;
}

export function getBlobStore(): BlobStore {
  if (!driver) throw new Error("Database is not initialised");
  return driver.blobs;
}

// Ids are JavaScript weekday numbers (Sunday = 0), which the calendars compare against.
const WEEK_DAYS: [number, string][] = [
  [6, "شنبه"],
  [0, "یک‌شنبه"],
  [1, "دوشنبه"],
  [2, "سه‌شنبه"],
  [3, "چهارشنبه"],
  [4, "پنج‌شنبه"],
  [5, "جمعه"],
];

/** The weekly days off list; a fresh install had none, so no day could be chosen. */
function ensureWeekDays() {
  const list = Array.isArray(settings.routine_holidays) ? settings.routine_holidays : [];
  for (const [id, name] of WEEK_DAYS) {
    if (!list.some((d: any) => d && d.id === id)) list.push({ id, setting_key: name, is_active: id === 5 ? 1 : 0 });
  }
  list.sort((a: any, b: any) => WEEK_DAYS.findIndex(([id]) => id === a.id) - WEEK_DAYS.findIndex(([id]) => id === b.id));
  settings.routine_holidays = list;
}

function seedInitialData() {
  if (!roles.some((r) => r.id == 1)) {
    roles.unshift({ id: 1, name: "مدیر کل", permissions: ["admin"] });
  }
  const password = config.initialAdminPassword || crypto.randomBytes(9).toString("base64url");
  colleagues.push({
    id: 1,
    username: "admin",
    passwordHash: bcrypt.hashSync(password, 10),
    full_name: "مدیر کل",
    role_id: 1,
    is_active: 1,
    status: "active",
  });
  if (!config.initialAdminPassword) {
    console.log("=".repeat(60));
    console.log(`Created the initial admin account: admin / ${password}`);
    console.log("Change this password after the first login.");
    console.log("=".repeat(60));
  }
}

/** Repairs records written by older versions so the rest of the code can rely on them. */
function normalizeLoadedData() {
  ensureWeekDays();
  for (const org of organizations) {
    if (org.color !== undefined) org.color = safeColor(org.color);
    if (org.is_active === undefined) org.is_active = 1;
    if (org.logo_url) org.logo_url = safeUrl(org.logo_url);
  }
  for (const c of colleagues) {
    if (c.avatar_url) c.avatar_url = safeUrl(c.avatar_url);
  }
  for (const role of roles) {
    if (role.icon) role.icon = sanitizeIcon(role.icon);
  }
  for (const value of Object.values(settings)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && item.icon) item.icon = sanitizeIcon(item.icon);
      if (item && item.logo_url) item.logo_url = safeUrl(item.logo_url);
    }
  }
  for (const asset of mediaAssets) {
    if (asset.file_url) asset.file_url = safeUrl(asset.file_url);
  }
  const info = settings.studio_info;
  if (info && typeof info === "object") {
    for (const key of Object.keys(info)) if (/^logo/.test(key)) info[key] = safeUrl(info[key]);
  }
  for (const card of contents) {
    if (card.org_color !== undefined) card.org_color = safeColor(card.org_color, "#4f46e5");
  }
}

const INTEGRATION_SECRET_FIELDS = ["api_key", "pass", "bot_token"];

/** Encrypts plain-text credentials inside a database object (live state or a backup copy). */
function encryptSecretsIn(cfgList: any[], tokenList: any[]) {
  let changed = false;
  const cfg = Array.isArray(cfgList) ? cfgList[0] : null;
  if (cfg && typeof cfg === "object") {
    for (const ch of ["sms", "email", "telegram", "bale"]) {
      const section = cfg[ch];
      if (!section || typeof section !== "object") continue;
      for (const f of INTEGRATION_SECRET_FIELDS) {
        if (typeof section[f] === "string" && section[f] && !isEncrypted(section[f])) {
          section[f] = encryptSecret(section[f]);
          changed = true;
        }
      }
    }
  }
  for (const t of Array.isArray(tokenList) ? tokenList : []) {
    if (t && typeof t.access_token === "string" && t.access_token && !isEncrypted(t.access_token)) {
      t.access_token = encryptSecret(t.access_token);
      changed = true;
    }
  }
  return changed;
}

/** Credentials saved by older versions in plain text are encrypted on startup. Returns true if any changed. */
function encryptStoredSecrets() {
  return encryptSecretsIn(integrations, tokens);
}

/**
 * The JSON driver keeps rolling copies of db.json (data/backups/db-*.json). Copies made before
 * credentials were encrypted would still hold them in plain text, so they are encrypted too.
 */
async function encryptSecretsInRollingCopies() {
  const dir = path.join(path.dirname(config.jsonDbPath), "backups");
  let names: string[] = [];
  try {
    names = (await fs.promises.readdir(dir)).filter((n) => /^db-\d+\.json$/.test(n));
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      const data = JSON.parse(await fs.promises.readFile(file, "utf8"));
      if (encryptSecretsIn(data.integrations, data.tokens)) {
        const tmp = file + ".tmp";
        await fs.promises.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
        await fs.promises.rename(tmp, file);
      }
    } catch (e) {
      console.warn(`Could not check ${name} for plain-text credentials:`, (e as Error).message);
    }
  }
}

/**
 * Loads the stored state. Must finish before the server accepts requests: if
 * loading fails we throw instead of running on an empty state that the next
 * save would write over the real data.
 */
export async function initDatabase(customDriver?: StorageDriver) {
  driver = customDriver || (await createDriver());
  const data = await driver.load();
  if (data) {
    applySnapshot(data);
    normalizeLoadedData();
    console.log(`Database loaded (${driver.name})`);
  } else {
    applySnapshot({});
    seedInitialData();
    ensureWeekDays();
    console.log(`Initialised an empty database (${driver.name})`);
    ready = true;
    await flushDatabase(true);
    return;
  }
  ready = true;
  // Rewrite the file at once so no plain-text credential stays on disk.
  if (encryptStoredSecrets()) {
    await flushDatabase(true);
    await encryptSecretsInRollingCopies();
  }
  if (colleagues.length === 0) {
    // Without any staff account nobody could ever log in again.
    seedInitialData();
    await flushDatabase(true);
  }
}

async function writeNow() {
  if (!driver || !ready) return;
  dirty = false;
  await driver.save(snapshotState());
}

function runSave() {
  saveTimer = null;
  if (saving) {
    // A write is in flight; queue one more once it finishes.
    dirty = true;
    return;
  }
  saving = writeNow()
    .catch((e) => {
      dirty = true;
      console.error(`Error saving database (${driver?.name}):`, e);
    })
    .finally(() => {
      saving = null;
      if (dirty) scheduleSave();
    });
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(runSave, SAVE_DELAY_MS);
}

/** Debounced save of the whole in-memory state. Ignored until the state was loaded. */
export async function saveDatabase() {
  if (!ready) return;
  dirty = true;
  scheduleSave();
}

/** Writes pending changes immediately (used on shutdown and in tests). */
export async function flushDatabase(force = false) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (saving) await saving;
  if (dirty || force) {
    dirty = false;
    await writeNow();
  }
}

export async function closeDatabase() {
  await flushDatabase();
  await driver?.close?.();
  ready = false;
  driver = null;
}
