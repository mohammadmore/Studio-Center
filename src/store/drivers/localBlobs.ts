import fs from "fs";
import path from "path";
import type { BlobKind, BlobStore } from "./types.js";
import { isSafeFileName, mimeForFile } from "../../utils/files.js";

/** Stores uploaded files and fonts as plain files under the data directory. */
export function createLocalBlobStore(dataDir: string): BlobStore {
  const dirFor = (kind: BlobKind) => {
    const dir = path.join(dataDir, kind);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  const fileFor = (kind: BlobKind, name: string) => {
    if (!isSafeFileName(name)) throw new Error("Invalid file name");
    return path.join(dirFor(kind), name);
  };

  return {
    async put(kind, name, buffer) {
      const file = fileFor(kind, name);
      const tmp = file + ".tmp";
      await fs.promises.writeFile(tmp, buffer);
      await fs.promises.rename(tmp, file);
    },
    async get(kind, name) {
      if (!isSafeFileName(name)) return null;
      try {
        const buffer = await fs.promises.readFile(fileFor(kind, name));
        return { buffer, mime: mimeForFile(name) };
      } catch (e: any) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(kind, name) {
      if (!isSafeFileName(name)) return;
      await fs.promises.rm(fileFor(kind, name), { force: true });
    },
    async list(kind) {
      return (await fs.promises.readdir(dirFor(kind))).filter(
        (f) => isSafeFileName(f) && !f.endsWith(".tmp"),
      );
    },
  };
}
