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
  invoices,
  mediaAssets,
  organizations,
  roles,
  settings,
  snapshotState,
} from "./state.js";
import { sanitizeIcon, safeColor, safeUrl } from "../utils/helpers.js";
import { encryptSecret, isEncrypted } from "../utils/secrets.js";
import { normalizePasswordInput, passwordProblem } from "../utils/authUtils.js";
import { tokens } from "./state.js";
import { tidyAll } from "../utils/tidy.js";

const SAVE_DELAY_MS = 500;

let driver: StorageDriver | null = null;
let ready = false;
let saveTimer: NodeJS.Timeout | null = null;
let saving: Promise<void> | null = null;
let dirty = false;
/** Storage version this process last loaded or wrote (see syncFromStorage). */
let knownVersion: string | null = null;

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
 * Emergency access: with RESET_ADMIN_PASSWORD set in the host's environment, the admin account
 * (RESET_ADMIN_USERNAME, default "admin") gets that password on startup and is re-enabled.
 * Meant for a locked-out owner. Each value is applied once; remove the variable afterwards.
 */
/**
 * Invoices now reach the client only after "send". Invoices that clients could already see
 * (anything past draft) are marked as sent once, so nothing disappears from their portal.
 */
function markLegacyInvoicesSent() {
  if (settings.invoice_send_rule) return false;
  for (const inv of invoices) {
    if (inv && inv.doc_type !== "quote" && inv.status && inv.status !== "draft" && !inv.sent_at) {
      inv.sent_at = inv.created_at || new Date().toISOString();
    }
  }
  settings.invoice_send_rule = 1;
  return true;
}

/** Work types saved without the half-space are rewritten in the one spelling the forms use. */
function normalizeStoredWorkTypes() {
  const fix: Record<string, string> = { "تماموقت (حضوری)": "تمام‌وقت (حضوری)", "پارهوقت / ریموت": "پاره‌وقت / ریموت" };
  let changed = false;
  for (const c of colleagues) {
    const v = typeof c?.work_type === "string" ? fix[c.work_type.trim()] : undefined;
    if (v) { c.work_type = v; changed = true; }
  }
  return changed;
}

function applyEmergencyAdminReset() {
  const newPassword = normalizePasswordInput(process.env.RESET_ADMIN_PASSWORD || "");
  if (!newPassword) return false;
  const username = String(process.env.RESET_ADMIN_USERNAME || "admin").trim().toLowerCase();
  const account = colleagues.find((c) => String(c.username || "").trim().toLowerCase() === username);
  if (!account) {
    console.error(`RESET_ADMIN_PASSWORD: no colleague with username "${username}". Set RESET_ADMIN_USERNAME.`);
    return false;
  }
  const problem = passwordProblem(newPassword, account.username);
  if (problem) {
    console.error(`RESET_ADMIN_PASSWORD was not applied: ${problem}`);
    return false;
  }
  // Each value is applied once: a later restart with the variable still set must not undo a
  // password the admin chose afterwards (hosts restart idle processes on their own).
  const marker = crypto.createHmac("sha256", "admin-reset:" + config.sessionSecret).update(`${username}\n${newPassword}`).digest("hex");
  if (settings.admin_reset_applied === marker) {
    console.warn("WARNING: RESET_ADMIN_PASSWORD is still set (already applied, ignored). Remove it from the environment.");
    return false;
  }
  account.passwordHash = bcrypt.hashSync(newPassword, 10);
  account.is_active = 1;
  account.status = "active";
  settings.admin_reset_applied = marker;
  console.warn("=".repeat(60));
  console.warn(`The password of "${account.username}" was reset from RESET_ADMIN_PASSWORD.`);
  console.warn("Log in, then REMOVE RESET_ADMIN_PASSWORD from the environment and restart.");
  console.warn("=".repeat(60));
  return true;
}

/**
 * Loads the stored state. Must finish before the server accepts requests: if
 * loading fails we throw instead of running on an empty state that the next
 * save would write over the real data.
 */
export async function initDatabase(customDriver?: StorageDriver) {
  driver = customDriver || (await createDriver());
  const data = await driver.load();
  knownVersion = await currentVersion();
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
  if (applyEmergencyAdminReset()) await flushDatabase(true);
  if (markLegacyInvoicesSent()) await flushDatabase(true);
  if (normalizeStoredWorkTypes()) await flushDatabase(true);
  // Names and choices with stray spaces, dates with Persian digits (older data).
  if (tidyAll()) await flushDatabase(true);
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
  tidyAll();
  await driver.save(snapshotState());
  knownVersion = await currentVersion();
}

// ───────── Several processes on the same data ─────────
// Some hosts (LiteSpeed / Passenger) start more than one copy of the app. Each keeps the
// data in memory, so without care one copy shows old data and its next save writes that
// old copy over what another copy saved. To prevent this every change runs under a lock
// shared by all processes (a lock directory next to the data), first reloading the data
// if another process wrote it since, and is written to storage before the response goes
// out. Reads reload changed data too.
async function currentVersion() {
  try {
    return driver?.version ? await driver.version() : null;
  } catch {
    return null;
  }
}

/** Reloads the stored data when another process changed it. Returns true if it did. */
export async function syncFromStorage() {
  if (!driver?.version || !ready || saving || localLocks > 0) return false;
  return reloadIfChanged();
}

/**
 * Every change made under the lock is stored before the lock is released, so changes still
 * pending here are incidental ones made outside it (a read that tidied something up).
 * Another process's stored change wins over those.
 */
async function reloadIfChanged() {
  const v = await currentVersion();
  if (v === null || v === knownVersion) return false;
  const data = await driver!.load();
  if (!data) return false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  dirty = false;
  applySnapshot(data);
  normalizeLoadedData();
  knownVersion = v;
  return true;
}

const LOCK_STALE_MS = 20_000;
const LOCK_WAIT_MS = 10_000;
let localLocks = 0;
let localQueue: Promise<void> = Promise.resolve();

function lockDir() {
  return path.join(config.dataDir, "run", "write.lock");
}

async function acquireFileLock() {
  const dir = lockDir();
  await fs.promises.mkdir(path.dirname(dir), { recursive: true }).catch(() => {});
  const start = Date.now();
  for (;;) {
    try {
      await fs.promises.mkdir(dir);
      return true;
    } catch (e: any) {
      if (e?.code !== "EEXIST") return false;
      try {
        const st = await fs.promises.stat(dir);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          await fs.promises.rmdir(dir).catch(() => {});
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - start > LOCK_WAIT_MS) {
        console.warn("Storage lock is busy for too long; continuing without it.");
        return false;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

/**
 * Takes the write lock (one holder at a time in this process and, for drivers shared by
 * several processes, across processes). Returns the release function.
 */
export async function acquireStorageLock(): Promise<() => void> {
  let releaseLocal!: () => void;
  const previous = localQueue;
  localQueue = new Promise<void>((r) => (releaseLocal = r));
  await previous;
  localLocks++;
  const shared = !!driver?.version;
  const haveFile = shared ? await acquireFileLock() : false;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (haveFile) fs.promises.rmdir(lockDir()).catch(() => {});
    localLocks--;
    releaseLocal();
    if (localLocks === 0) runStoredCallbacks();
  };
}

let storedCallbacks: (() => void)[] = [];
function runStoredCallbacks() {
  const list = storedCallbacks;
  storedCallbacks = [];
  for (const cb of list) {
    try {
      cb();
    } catch (e) {
      console.error(e);
    }
  }
}

/**
 * Runs cb once the change being made is stored (right away when none is). Live updates to
 * open pages use it: a page that reloads on such a message must find the change stored,
 * whichever process answers it.
 */
export function whenStored(cb: () => void) {
  if (localLocks > 0) storedCallbacks.push(cb);
  else cb();
}

/** True when the storage can be shared by several processes (changes then need the lock). */
export function isSharedStorage() {
  return !!driver?.version;
}

/** Runs a change under the lock: fresh data first, written to storage before returning. */
export async function withStorageLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const release = await acquireStorageLock();
  try {
    await syncWithin();
    const result = await fn();
    await flushDatabase();
    return result;
  } finally {
    release();
  }
}

/** Like syncFromStorage, but for the lock holder itself. */
export async function syncWithin() {
  if (!driver?.version || !ready) return false;
  if (saving) await saving;
  return reloadIfChanged();
}

function runSave() {
  saveTimer = null;
  if (saving) {
    // A write is in flight; queue one more once it finishes.
    dirty = true;
    return;
  }
  saving = (driver?.version ? backgroundWrite() : writeNow())
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

/**
 * A save that was not part of a locked change (a page visit log, a scheduled job). If
 * another process wrote in the meantime, this copy is out of date: writing it would undo
 * that change, so the stored data is loaded instead and the small local change is dropped.
 */
async function backgroundWrite() {
  const release = await acquireStorageLock();
  try {
    const v = await currentVersion();
    if (v !== null && knownVersion !== null && v !== knownVersion) {
      console.warn("Another process changed the data; reloading instead of writing an old copy.");
      dirty = false;
      const data = await driver!.load();
      if (data) {
        applySnapshot(data);
        normalizeLoadedData();
      }
      knownVersion = v;
      return;
    }
    await writeNow();
  } finally {
    release();
  }
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
