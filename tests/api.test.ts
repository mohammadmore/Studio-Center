import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import request from "supertest";
import { PASSWORD, seedData, useTempDataDir } from "./helpers.js";

const dataDir = useTempDataDir();
fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify(seedData()));

const { initDatabase, closeDatabase, flushDatabase } = await import("../src/store/db.js");
const { createApp } = await import("../src/app.js");
const state = await import("../src/store/state.js");

let app: any;

async function login(username: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/login").send({ username, password: PASSWORD });
  assert.equal(res.status, 200, `login ${username}: ${JSON.stringify(res.body)}`);
  return agent;
}

before(async () => {
  await initDatabase();
  app = createApp();
});
after(async () => {
  await closeDatabase();
});

describe("authentication", () => {
  it("rejects a wrong password and unknown users the same way", async () => {
    const wrong = await request(app).post("/api/login").send({ username: "admin", password: "wrong-pass" });
    const unknown = await request(app).post("/api/login").send({ username: "nobody", password: "wrong-pass" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
  });

  it("does not crash on organisations without a username", async () => {
    const res = await request(app).post("/api/login").send({ username: "brand1", password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.redirect, "client-dashboard");
  });

  it("refuses deactivated accounts", async () => {
    const res = await request(app).post("/api/login").send({ username: "gone", password: PASSWORD });
    assert.equal(res.status, 401);
  });

  it("ends the session when the account is deactivated", async () => {
    const agent = await login("ali");
    assert.equal((await agent.get("/api/get_colleagues")).status, 200);
    state.colleagues.find((c) => c.id === 2)!.is_active = 0;
    try {
      assert.equal((await agent.get("/api/get_colleagues")).status, 401);
    } finally {
      state.colleagues.find((c) => c.id === 2)!.is_active = 1;
    }
  });

  it("requires login for the API", async () => {
    assert.equal((await request(app).get("/api/get_colleagues")).status, 401);
  });
});

describe("no secrets in responses", () => {
  it("never returns password hashes", async () => {
    const agent = await login("admin");
    for (const url of ["/api/get_colleagues", "/api/manage_users", "/api/get_orgs", "/api/manage_orgs", "/api/global_search?q=برند", "/api/get_org_report?org_id=1"]) {
      const res = await agent.get(url);
      assert.equal(res.status, 200, url);
      assert.ok(!JSON.stringify(res.body).includes("passwordHash"), url);
    }
  });

  it("removed the unauthenticated user / org dumps", async () => {
    const agent = await login("admin");
    assert.equal((await agent.get("/api/get_all_users")).status, 404);
    assert.equal((await agent.get("/api/get_orgs_public")).status, 404);
  });

  it("masks social media access tokens", async () => {
    const agent = await login("admin");
    const res = await agent.get("/api/get_tokens");
    assert.ok(!JSON.stringify(res.body).includes("SECRET-ACCESS-TOKEN"));
  });
});

describe("client portal", () => {
  it("renders the client dashboard (used to always be 403)", async () => {
    const agent = await login("brand1");
    const res = await agent.get("/client-dashboard");
    assert.equal(res.status, 200);
    assert.match(res.text, /برند یک/);
  });

  it("only shows the client its own organisation's content", async () => {
    const agent = await login("brand1");
    const res = await agent.get("/api/get_client_data?org_id=2");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.pending.map((c: any) => c.org_id), [1]);
    const report = await agent.get("/api/get_org_report?org_id=2");
    assert.equal(report.body.organization.id, 1);
  });

  it("cannot review content of another organisation", async () => {
    const agent = await login("brand1");
    const res = await agent.post("/api/client_review").send({ content_id: 2, action: "approve" });
    assert.equal(res.status, 403);
  });

  it("is kept away from studio endpoints and pages", async () => {
    const agent = await login("brand1");
    assert.equal((await agent.get("/api/get_depot_contents")).status, 403);
    const page = await agent.get("/depot");
    assert.equal(page.status, 302);
    assert.equal(page.headers.location, "/client-dashboard");
  });
});

describe("permissions", () => {
  it("blocks staff without the permission", async () => {
    const agent = await login("ali");
    assert.equal((await agent.post("/api/manage_settings").send({ action: "add", group: "platform", name: "x" })).status, 403);
    assert.equal((await agent.get("/api/get_logs")).status, 403);
    const page = await agent.get("/settings");
    assert.equal(page.status, 302);
  });

  it("does not let a user manager create administrators", async () => {
    state.roles.push({ id: 5, name: "مدیر کاربران", permissions: ["add-user"] });
    state.colleagues.push({ id: 9, username: "hrman", passwordHash: state.colleagues[0].passwordHash, full_name: "HR", role_id: 5, is_active: 1 });
    const agent = await login("hrman");
    const create = await agent.post("/api/save_user").send({ username: "evil", password: "123456", role_id: 1 });
    assert.equal(create.status, 403);
    const self = await agent.post("/api/manage_users").send({ action: "edit", id: "9", role_id: 1 });
    assert.equal(self.status, 400);
  });

  it("rejects duplicate usernames on edit", async () => {
    const agent = await login("admin");
    const res = await agent.post("/api/manage_users").send({ action: "edit", id: 2, username: "ADMIN" });
    assert.equal(res.status, 400);
  });
});

describe("request safety", () => {
  it("rejects cross-site POST requests", async () => {
    const agent = await login("admin");
    const res = await agent
      .post("/api/manage_collections")
      .set("Origin", "https://evil.example")
      .send({ action: "add", title: "x" });
    assert.equal(res.status, 403);
  });

  it("refuses dangerous upload types", async () => {
    const agent = await login("admin");
    const res = await agent.post("/api/upload_file").attach("file", Buffer.from("<script>alert(1)</script>"), "x.html");
    assert.equal(res.status, 400);
    const img = await agent.post("/api/upload_image").send({ image: "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64") });
    assert.equal(img.status, 400);
  });

  it("stores uploads safely and serves them back", async () => {
    const agent = await login("admin");
    const res = await agent.post("/api/upload_file").attach("file", Buffer.from("%PDF-1.4 test"), "doc.pdf");
    assert.equal(res.status, 200);
    const file = await request(app).get(res.body.url);
    assert.equal(file.status, 200);
    assert.equal(file.headers["x-content-type-options"], "nosniff");
    assert.equal(file.headers["content-type"], "application/pdf");
  });

  it("does not allow path traversal", async () => {
    for (const url of ["/uploads/..%2F..%2Fpackage.json", "/fonts/..%2Fdb.json", "/uploads/..%2Fdb.json"]) {
      const res = await request(app).get(url);
      assert.equal(res.status, 404, url);
      assert.ok(!res.text.includes("asva-studio") && !res.text.includes("colleagues"), url);
    }
    const agent = await login("admin");
    const font = await agent.post("/api/upload_font").send({ font: "data:font/ttf;base64,AAEAAAAA", filename: "../../server.ts" });
    assert.equal(font.status, 400);
  });

  it("refuses to overwrite non-list settings", async () => {
    const agent = await login("admin");
    const res = await agent.post("/api/manage_settings").send({ action: "add", group: "studio_info", name: "x" });
    assert.equal(res.status, 400);
  });
});

describe("data handling", () => {
  it("restores a recycle bin item only once", async () => {
    const agent = await login("admin");
    const del = await agent.post("/api/add_content").send({ action: "delete", id: 1 });
    assert.equal(del.status, 200);
    const first = await agent.post("/api/recycle_bin").send({ action: "restore", bin_id: del.body.bin_id });
    const second = await agent.post("/api/recycle_bin").send({ action: "restore", bin_id: del.body.bin_id });
    assert.equal(first.status, 200);
    assert.equal(second.status, 400);
    assert.equal(state.contents.filter((c) => c.id === 1).length, 1);
  });

  it("brings an organisation's content back with it", async () => {
    const agent = await login("admin");
    const del = await agent.post("/api/manage_orgs").send({ action: "delete", id: "2" });
    assert.equal(del.status, 200);
    assert.ok(!state.contents.some((c) => c.org_id === 2));
    await agent.post("/api/recycle_bin").send({ action: "restore", bin_id: del.body.bin_id });
    assert.ok(state.organizations.some((o) => o.id === 2));
    assert.ok(state.contents.some((c) => c.org_id === 2));
  });

  it("notifies only the assigned colleague", async () => {
    const admin = await login("admin");
    await admin.post("/api/update_content_details").send({ id: 2, assigned_colleagues: ["علی"] });
    const ali = await login("ali");
    const mine = await ali.get("/api/get_notifications");
    assert.ok(mine.body.notifications.some((n: any) => n.title === "ارجاع کار جدید"));
    const brand = await login("brand2");
    const theirs = await brand.get("/api/get_notifications");
    assert.equal(theirs.body.notifications.length, 0);
  });

  it("undo and redo of a batch edit", async () => {
    const agent = await login("admin");
    await agent.post("/api/batch_edit_contents").send({ ids: [2], action: "status", status: "done" });
    const op = state.batch_operations[0];
    await agent.post("/api/undo_batch_operation").send({ batch_id: op.id });
    assert.equal(state.contents.find((c) => c.id === 2)!.status, "raw");
    const redo = await agent.post("/api/redo_batch_operation").send({ batch_id: op.id });
    assert.equal(redo.status, 200);
    assert.equal(state.contents.find((c) => c.id === 2)!.status, "done");
  });

  it("persists changes to disk", async () => {
    const agent = await login("admin");
    await agent.post("/api/manage_collections").send({ action: "add", title: "ذخیره روی دیسک" });
    await flushDatabase();
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
    assert.ok(stored.collections.some((c: any) => c.title === "ذخیره روی دیسک"));
  });
});
