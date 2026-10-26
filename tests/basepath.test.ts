import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import request from "supertest";
import { PASSWORD, seedData, useTempDataDir } from "./helpers.js";

// Served as https://example.com/studio
const dataDir = useTempDataDir();
process.env.BASE_PATH = "/studio/";
fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify(seedData()));

const { initDatabase, closeDatabase } = await import("../src/store/db.js");
const { createApp } = await import("../src/app.js");

let app: any;

async function login(username: string) {
  const agent = request.agent(app);
  const res = await agent.post("/studio/api/login").send({ username, password: PASSWORD });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { agent, res };
}

// An absolute app link in the page that is missing the prefix.
const UNPREFIXED = /["'(=]\/(api|assets|uploads|fonts|socket\.io|depot|calendar|client-dashboard|requests)[/?"'#)]/;

before(async () => {
  await initDatabase();
  app = createApp();
});
after(async () => {
  await closeDatabase();
  delete process.env.BASE_PATH;
});

describe("serving under a sub-path", () => {
  it("renders pages with prefixed links, assets and base tag", async () => {
    const res = await request(app).get("/studio/");
    assert.equal(res.status, 200);
    assert.match(res.text, /<base href="\/studio\/">/);
    assert.match(res.text, /window\.ASVA_BASE="\/studio"/);
    assert.match(res.text, /src="\/studio\/assets\/js\/core\.js\?v=/);
    assert.doesNotMatch(res.text, UNPREFIXED);
    const asset = await request(app).get("/studio/assets/js/core.js");
    assert.equal(asset.status, 200);
  });

  it("prefixes redirects, including the return address", async () => {
    const res = await request(app).get("/studio/depot");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/studio/?next=%2Fstudio%2Fdepot");
    const unknown = await request(app).get("/studio/nope");
    assert.equal(unknown.headers.location, "/studio/");
  });

  it("scopes the session cookie to the sub-path", async () => {
    const { res } = await login("admin");
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] || []);
    assert.ok(cookies.length && cookies.every((c) => /;\s*path=\/studio(;|$)/i.test(c)), cookies.join(" | "));
  });

  it("serves logged-in pages without unprefixed app links", async () => {
    const { agent } = await login("admin");
    for (const page of ["/studio/depot", "/studio/requests", "/studio/calendar", "/studio/invoices_list"]) {
      const res = await agent.get(page);
      assert.equal(res.status, 200, page);
      const bad = UNPREFIXED.exec(res.text);
      assert.equal(bad, null, `${page}: ${bad && res.text.slice(Math.max(0, bad.index - 60), bad.index + 40)}`);
    }
    const client = await login("brand1");
    const dash = await client.agent.get("/studio/depot");
    assert.equal(dash.headers.location, "/studio/client-dashboard");
  });

  it("still answers when a proxy already removed the prefix", async () => {
    const { agent } = await login("admin");
    const res = await agent.get("/api/check_auth");
    assert.equal(res.status, 200);
  });

  it("puts the prefix into calendar links", async () => {
    const { agent } = await login("ali");
    const link = await agent.get("/studio/api/ics_link");
    const url = new URL(link.body.url);
    assert.match(url.pathname, /^\/studio\/ics\/.+\.ics$/);
    const feed = await request(app).get(url.pathname);
    assert.equal(feed.status, 200);
  });
});
