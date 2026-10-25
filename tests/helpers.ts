import fs from "fs";
import os from "os";
import path from "path";
import bcrypt from "bcrypt";

export const PASSWORD = "secret123";

/** Points the app at a throw-away data directory; must run before importing src/. */
export function useTempDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asva-test-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_DRIVER = "json";
  process.env.SESSION_SECRET = "test-secret-that-is-definitely-long-enough-123";
  process.env.NODE_ENV = "test";
  return dir;
}

export function seedData() {
  const hash = bcrypt.hashSync(PASSWORD, 4);
  return {
    roles: [
      { id: 1, name: "مدیر کل", permissions: ["admin"] },
      { id: 3, name: "طراح", permissions: ["depot"] },
    ],
    colleagues: [
      { id: 1, username: "admin", passwordHash: hash, full_name: "مدیر", role_id: 1, is_active: 1 },
      { id: 2, username: "ali", passwordHash: hash, full_name: "علی", role_id: 3, is_active: 1 },
      { id: 3, username: "gone", passwordHash: hash, full_name: "رفته", role_id: 3, is_active: 0 },
    ],
    organizations: [
      { id: 1, org_name: "برند یک", username: "brand1", passwordHash: hash, is_active: 1 },
      { id: 2, org_name: "برند دو", username: "brand2", passwordHash: hash, is_active: 1 },
      // Created by the smart-events importer: no login fields at all.
      { id: 3, org_name: "بدون حساب", color: "#fff" },
    ],
    contents: [
      { id: 1, title: "محتوای یک", org_id: 1, status: "raw", assigned_colleagues: ["علی"] },
      { id: 2, title: "محتوای دو", org_id: 2, status: "raw" },
    ],
    settings: { content_type: [{ id: 1, setting_key: "پوستر", price: 100, is_active: 1 }] },
    tokens: [{ id: 1, org_id: 1, platform_name: "x", access_token: "SECRET-ACCESS-TOKEN", status: "active" }],
    notifications: [],
    recycle_bin: [],
    batch_operations: [],
  };
}
