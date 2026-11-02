import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import request from "supertest";
import sharp from "sharp";
import { PASSWORD, seedData, useTempDataDir } from "./helpers.js";

const dataDir = useTempDataDir();
const seed: any = seedData();
seed.settings.platform = [{ id: 7, setting_key: "اینستاگرام", is_active: 1, logo_url: "/uploads/old_icon.png" }];
seed.colleagues[1].avatar_url = "/uploads/old_avatar.jpg";
fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify(seed));

const { initDatabase, closeDatabase } = await import("../src/store/db.js");
const { createApp } = await import("../src/app.js");
const { shrinkOldImages } = await import("../src/jobs.js");
const state = await import("../src/store/state.js");

let app: any;
const big = (w: number, h: number, alpha = false) =>
  sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: alpha ? { r: 200, g: 20, b: 60, alpha: 0.5 } : { r: 30, g: 120, b: 200 } } })
    .png()
    .toBuffer();

before(async () => {
  fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "uploads", "old_icon.png"), await big(1200, 1200, true));
  fs.writeFileSync(
    path.join(dataDir, "uploads", "old_avatar.jpg"),
    await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#888" } }).jpeg().toBuffer(),
  );
  await initDatabase();
  app = createApp();
});
after(async () => {
  await closeDatabase();
});

async function upload(agent: any, buffer: Buffer, purpose?: string) {
  const res = await agent.post("/api/upload_image").send({ image: "data:image/png;base64," + buffer.toString("base64"), purpose });
  assert.equal(res.body.status, "success", JSON.stringify(res.body));
  const file = path.join(dataDir, "uploads", res.body.url.replace("/uploads/", ""));
  return { url: res.body.url as string, meta: await sharp(fs.readFileSync(file)).metadata(), bytes: fs.statSync(file).size };
}

describe("picture optimisation", () => {
  it("shrinks avatars, logos and icons to the size they are shown at", async () => {
    const agent = request.agent(app);
    await agent.post("/api/login").send({ username: "admin", password: PASSWORD });
    const source = await big(3000, 2000, true);
    const avatar = await upload(agent, source, "avatar");
    assert.equal(avatar.meta.format, "webp");
    assert.ok(Math.max(avatar.meta.width!, avatar.meta.height!) <= 256);
    assert.ok(avatar.meta.hasAlpha, "transparency is kept");
    const logo = await upload(agent, source, "logo");
    assert.equal(Math.max(logo.meta.width!, logo.meta.height!), 512);
    const icon = await upload(agent, source, "icon");
    assert.equal(Math.max(icon.meta.width!, icon.meta.height!), 128);
    const other = await upload(agent, source);
    assert.equal(Math.max(other.meta.width!, other.meta.height!), 1600);
    assert.ok(avatar.bytes < source.length / 10);
  });

  it("keeps small pictures untouched", async () => {
    const agent = request.agent(app);
    await agent.post("/api/login").send({ username: "admin", password: PASSWORD });
    const small = await big(100, 100);
    const res = await upload(agent, small, "logo");
    assert.equal(res.meta.format, "png");
    assert.equal(res.bytes, small.length);
  });

  it("shrinks pictures uploaded before, once, under the same name", async () => {
    const before = fs.statSync(path.join(dataDir, "uploads", "old_avatar.jpg")).size;
    assert.equal(await shrinkOldImages(), true);
    const avatar = await sharp(fs.readFileSync(path.join(dataDir, "uploads", "old_avatar.jpg"))).metadata();
    assert.equal(avatar.format, "jpeg");
    assert.equal(avatar.width, 256);
    assert.ok(fs.statSync(path.join(dataDir, "uploads", "old_avatar.jpg")).size < before);
    const icon = await sharp(fs.readFileSync(path.join(dataDir, "uploads", "old_icon.png"))).metadata();
    assert.equal(icon.width, 128);
    assert.equal(state.settings.images_optimized, "v1");
    assert.equal(await shrinkOldImages(), false);
  });

  it("shows the role's default avatar for members without a picture", async () => {
    const agent = request.agent(app);
    await agent.post("/api/login").send({ username: "admin", password: PASSWORD });
    await agent.post("/api/manage_roles").send({ action: "edit", id: 3, default_female_avatar: "/uploads/f.webp", default_male_avatar: "javascript:alert(1)" });
    const role = state.roles.find((r: any) => r.id === 3)!;
    assert.equal(role.default_male_avatar, "");
    const ali = state.colleagues.find((c: any) => c.id === 2)!;
    ali.avatar_url = "";
    ali.gender = "female";
    const list = await agent.get("/api/get_colleagues");
    assert.equal(list.body.users.find((c: any) => c.id === 2).avatar_url, "/uploads/f.webp");
  });
});
