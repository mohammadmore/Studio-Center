import fs from "fs";
import path from "path";
import type { StorageDriver } from "./types.js";
import { createLocalBlobStore } from "./localBlobs.js";

const BACKUPS_TO_KEEP = 5;

/**
 * Keeps the whole database in one JSON file. Writes go to a temp file that is
 * fsynced and then renamed over the old one, so a crash mid-write never leaves a
 * half written database behind. The previous versions are kept as backups.
 */
export function createJsonDriver(file: string, dataDir: string): StorageDriver {
  const dir = path.dirname(file);
  const backupDir = path.join(dir, "backups");

  async function rotateBackups() {
    if (!fs.existsSync(file)) return;
    await fs.promises.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 13).replace(/[-:T]/g, "");
    const target = path.join(backupDir, `db-${stamp}.json`);
    // One backup per hour is plenty; the newest file of the hour is overwritten.
    await fs.promises.copyFile(file, target);
    const all = (await fs.promises.readdir(backupDir))
      .filter((f) => /^db-\d+\.json$/.test(f))
      .sort();
    for (const old of all.slice(0, Math.max(0, all.length - BACKUPS_TO_KEEP))) {
      await fs.promises.rm(path.join(backupDir, old), { force: true });
    }
  }

  return {
    name: "json",
    blobs: createLocalBlobStore(dataDir),
    async load() {
      if (!fs.existsSync(file)) return null;
      const text = await fs.promises.readFile(file, "utf8");
      // A corrupt file must stop the server instead of silently starting empty.
      return JSON.parse(text);
    },
    async save(data) {
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      const handle = await fs.promises.open(tmp, "w");
      try {
        await handle.writeFile(JSON.stringify(data));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rotateBackups();
      await fs.promises.rename(tmp, file);
    },
  };
}
