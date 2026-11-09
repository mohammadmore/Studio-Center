import fs from "fs";
import path from "path";
import zlib from "zlib";
import { config } from "../config.js";
import { snapshotState } from "../store/state.js";

/**
 * Automatic database backups: a gzipped JSON snapshot of every table, written once a day
 * (and on demand by an admin) into DATA_DIR/backups, keeping the newest KEEP files.
 * Uploaded files are not included. Credentials inside stay encrypted, and the encryption
 * key (.secrets.key / SECRETS_KEY) is never copied into a backup.
 */
const KEEP = 14;
const NAME = /^backup-(\d{8})-(\d{6})(-manual)?\.json\.gz$/;

export function backupDir() {
  return path.resolve(process.env.BACKUP_DIR || path.join(config.dataDir, "backups"));
}

export function isBackupName(name: unknown): name is string {
  return typeof name === "string" && NAME.test(name);
}

export function listBackups() {
  const dir = backupDir();
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => isBackupName(n));
  } catch {
    return [];
  }
  return names
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, created_at: st.mtime.toISOString(), manual: name.includes("-manual") };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function createBackup(manual = false) {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = `backup-${stamp()}${manual ? "-manual" : ""}.json.gz`;
  const payload = { format: "asva-studio-backup", version: 1, created_at: new Date().toISOString(), data: snapshotState() };
  const file = path.join(dir, name);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(payload)), { mode: 0o600 });
  fs.renameSync(tmp, file);
  pruneBackups();
  return listBackups().find((b) => b.name === name)!;
}

function pruneBackups() {
  const all = listBackups();
  for (const old of all.slice(KEEP)) {
    try {
      fs.unlinkSync(path.join(backupDir(), old.name));
    } catch {
      /* ignore */
    }
  }
}

/** Called from the hourly job: makes the day's backup if the newest one is older than ~a day. */
export function runDailyBackup() {
  const newest = listBackups()[0];
  if (newest && Date.now() - new Date(newest.created_at).getTime() < 22 * 60 * 60 * 1000) return null;
  return createBackup(false);
}

export function backupPath(name: string) {
  if (!isBackupName(name)) return null;
  const file = path.join(backupDir(), name);
  return fs.existsSync(file) ? file : null;
}
