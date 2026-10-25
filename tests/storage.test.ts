import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { useTempDataDir } from "./helpers.js";

useTempDataDir();
const { createJsonDriver } = await import("../src/store/drivers/json.js");
const { createSqliteDriver } = await import("../src/store/drivers/sqlite.js");
const db = await import("../src/store/db.js");
const state = await import("../src/store/state.js");
const helpers = await import("../src/utils/helpers.js");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "asva-store-"));

describe("json driver", () => {
  it("round-trips data and keeps backups", async () => {
    const dir = tmp();
    const driver = createJsonDriver(path.join(dir, "db.json"), dir);
    assert.equal(await driver.load(), null);
    await driver.save({ contents: [{ id: 1 }] });
    await driver.save({ contents: [{ id: 2 }] });
    assert.deepEqual(await driver.load(), { contents: [{ id: 2 }] });
    assert.ok(fs.readdirSync(path.join(dir, "backups")).length >= 1);
    assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith(".tmp")));
  });

  it("fails loudly on a corrupt file instead of starting empty", async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "db.json"), "{not json");
    const driver = createJsonDriver(path.join(dir, "db.json"), dir);
    await assert.rejects(() => db.initDatabase(driver));
  });

  it("rejects unsafe blob names", async () => {
    const dir = tmp();
    const driver = createJsonDriver(path.join(dir, "db.json"), dir);
    await assert.rejects(() => driver.blobs.put("uploads", "../evil.js", Buffer.from("x"), "text/plain"));
    assert.equal(await driver.blobs.get("uploads", "../db.json"), null);
  });
});

describe("database lifecycle", () => {
  it("ignores saves before the data was loaded", async () => {
    const dir = tmp();
    const file = path.join(dir, "db.json");
    fs.writeFileSync(file, JSON.stringify({ colleagues: [{ id: 1, username: "a" }] }));
    await db.closeDatabase().catch(() => {});
    await db.saveDatabase();
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).colleagues.length, 1);
  });

  it("creates an admin account in an empty database", async () => {
    const dir = tmp();
    const driver = createJsonDriver(path.join(dir, "db.json"), dir);
    await db.initDatabase(driver);
    assert.equal(state.colleagues[0].username, "admin");
    assert.ok(state.colleagues[0].passwordHash);
    assert.ok(fs.existsSync(path.join(dir, "db.json")));
    await db.closeDatabase();
  });
});

describe("sqlite driver", { skip: !process.versions.node.match(/^(2[2-9]|[3-9]\d)\./) }, () => {
  it("round-trips data and imports the old row-per-item layout", async () => {
    const dir = tmp();
    const file = path.join(dir, "database.sqlite");
    const { DatabaseSync } = await import("node:sqlite" as string);
    const legacy = new DatabaseSync(file);
    legacy.exec(`CREATE TABLE store (table_name TEXT, id TEXT, data TEXT, PRIMARY KEY (table_name, id));
                 CREATE TABLE store_settings (key TEXT PRIMARY KEY, data TEXT);`);
    legacy.prepare("INSERT INTO store VALUES (?, ?, ?)").run("contents", "1", JSON.stringify({ id: 1, title: "old" }));
    legacy.prepare("INSERT INTO store_settings VALUES ('settings', ?)").run(JSON.stringify({ a: 1 }));
    legacy.close();

    const driver = await createSqliteDriver(file, dir);
    const loaded = await driver.load();
    assert.equal(loaded!.contents[0].title, "old");
    assert.deepEqual(loaded!.settings, { a: 1 });
    await driver.save({ ...loaded, contents: [{ id: 2 }] });
    assert.deepEqual((await driver.load())!.contents, [{ id: 2 }]);
    await driver.close!();
  });
});

describe("helpers", () => {
  it("normalises Jalali dates", () => {
    assert.equal(helpers.normalizeJalaliDate("۱۴۰۵/۲/۵"), "1405/02/05");
    assert.equal(helpers.normalizeJalaliDate("1405-12-29"), "1405/12/29");
    assert.equal(helpers.normalizeJalaliDate("garbage"), "");
    assert.equal(helpers.addDaysToJalali("1405/01/31", 1), "1405/02/01");
    assert.equal(helpers.jalaliDiffDays("1405/01/28", "1405/02/02"), 5);
  });

  it("computes ids without spreading large arrays", () => {
    const big = Array.from({ length: 200_000 }, (_, i) => ({ id: i }));
    assert.equal(helpers.nextId(big), 200_000);
    assert.equal(helpers.nextId([]), 1);
  });

  it("sanitises colours, urls and icons", () => {
    assert.equal(helpers.safeColor("#abc"), "#abc");
    assert.equal(helpers.safeColor("red;background:url(x)"), "#6366F1");
    assert.equal(helpers.safeUrl("javascript:alert(1)"), "");
    assert.equal(helpers.safeUrl("/uploads/a.png"), "/uploads/a.png");
    assert.equal(helpers.sanitizeIcon("📷"), "📷");
    assert.equal(helpers.sanitizeIcon('<svg viewBox="0 0 1 1"><path d="M0"/></svg>'), '<svg viewBox="0 0 1 1"><path d="M0"/></svg>');
    assert.equal(helpers.sanitizeIcon("<svg onload=alert(1)></svg>"), "");
    assert.equal(helpers.sanitizeIcon("<img src=x onerror=alert(1)>"), "");
  });
});
