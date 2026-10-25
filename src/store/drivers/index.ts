import { config } from "../../config.js";
import type { StorageDriver } from "./types.js";
import { createJsonDriver } from "./json.js";
import { createSqliteDriver } from "./sqlite.js";

export async function createDriver(name = config.storageDriver): Promise<StorageDriver> {
  switch (name) {
    case "json":
      return createJsonDriver(config.jsonDbPath, config.dataDir);
    case "sqlite":
      return createSqliteDriver(config.sqliteDbPath, config.dataDir);
    case "firebase": {
      const { createFirebaseDriver } = await import("./firebase.js");
      return createFirebaseDriver();
    }
    default:
      throw new Error(`Unknown STORAGE_DRIVER "${name}" (expected json, sqlite or firebase)`);
  }
}
