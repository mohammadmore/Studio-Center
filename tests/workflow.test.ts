import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import request from "supertest";
import { PASSWORD, seedData, useTempDataDir } from "./helpers.js";

const dataDir = useTempDataDir();
const seed: any = seedData();
seed.roles.push({ id: 4, name: "مدیر هنری", permissions: ["depot", "approve_content"] });
seed.colleagues.push({ id: 4, username: "artdir", passwordHash: seed.colleagues[0].passwordHash, full_name: "مدیر هنری", role_id: 4, is_active: 1 });
seed.contents.push({ id: 3, title: "ویدیو معرفی", org_id: 1, status: "in_progress", stages: ["سناریو", "تدوین"], assigned_colleagues: ["علی"], project_manager: "مدیر" });
seed.leaves = [{ id: 1, user_id: 2, start_date: "1405/03/10", end_date: "1405/03/12", status: "approved" }];
fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify(seed));

const { initDatabase, closeDatabase } = await import("../src/store/db.js");
const { createApp } = await import("../src/app.js");
const state = await import("../src/store/state.js");
const { checkStageDeadlines } = await import("../src/utils/workflowUtils.js");
const { plannedDeliveries, updateIntegrationConfig } = await import("../src/utils/notifiers.js");
const { decryptSecret, encryptSecret } = await import("../src/utils/secrets.js");
const { resetLoginLockouts } = await import("../src/routes/api_routes/auth.js");

let app: any;

async function login(username: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/login").send({ username, password: PASSWORD });
  assert.equal(res.status, 200, `login ${username}: ${JSON.stringify(res.body)}`);
  return agent;
}

const card = (id: number) => state.contents.find((c: any) => c.id === id)!;
const lastNotification = () => state.notifications[state.notifications.length - 1];

before(async () => {
  await initDatabase();
  app = createApp();
});
after(async () => {
  await closeDatabase();
});

describe("chunked uploads", () => {
  it("assembles pieces, resumes after a retried piece and streams with Range", async () => {
    const agent = await login("ali");
    const data = Buffer.alloc(9 * 1024 * 1024 + 123, 7);
    const init = await agent.post("/api/upload_init").send({ name: "clip.mp4", size: data.length });
    assert.equal(init.body.status, "success");
    const { upload_id, chunk_size } = init.body;
    for (let offset = 0; offset < data.length; offset += chunk_size) {
      const piece = data.subarray(offset, offset + chunk_size);
      const r = await agent
        .post(`/api/upload_chunk?upload_id=${upload_id}&offset=${offset}`)
        .set("Content-Type", "application/octet-stream")
        .send(piece);
      assert.equal(r.body.status, "success", JSON.stringify(r.body));
      if (offset === 0) {
        // The same piece sent twice is acknowledged, not appended again.
        const again = await agent
          .post(`/api/upload_chunk?upload_id=${upload_id}&offset=0`)
          .set("Content-Type", "application/octet-stream")
          .send(piece);
        assert.equal(again.body.received, piece.length);
      }
    }
    const done = await agent.post("/api/upload_complete").send({ upload_id });
    assert.equal(done.body.status, "success");
    assert.match(done.body.url, /^\/uploads\/file_.*\.mp4$/);
    const ranged = await request(app).get(done.body.url).set("Range", "bytes=0-99");
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers["content-length"], "100");
  });

  it("refuses executable types and other users' uploads", async () => {
    const agent = await login("ali");
    const bad = await agent.post("/api/upload_init").send({ name: "x.html", size: 10 });
    assert.equal(bad.status, 400);
    const init = await agent.post("/api/upload_init").send({ name: "a.pdf", size: 10 });
    const other = await login("admin");
    const r = await other.post("/api/upload_complete").send({ upload_id: init.body.upload_id });
    assert.equal(r.status, 404);
  });
});

describe("requests and briefs", () => {
  it("lets a brand send a brief that the studio turns into a card", async () => {
    const client = await login("brand1");
    const created = await client.post("/api/requests").send({
      action: "create",
      title: "کمپین نوروز",
      goal: "فروش",
      audience: "جوانان",
      deadline: "۱۴۰۵/۱/۱۵",
      org_id: 2, // ignored: clients always write to their own brand
    });
    assert.equal(created.body.status, "success");
    assert.equal(created.body.data.org_id, 1);
    assert.equal(created.body.data.deadline, "1405/01/15");
    assert.equal(lastNotification().type, "request_new");

    const other = await login("brand2");
    const list2 = await other.get("/api/requests");
    assert.equal(list2.body.data.length, 0);

    const admin = await login("admin");
    const conv = await admin.post("/api/requests").send({ action: "convert", id: created.body.data.id, project_manager_id: 1, stages: ["ایده"] });
    assert.equal(conv.body.status, "success");
    const c = card(conv.body.content.id);
    assert.equal(c.brief.goal, "فروش");
    assert.equal(c.publish_date, "1405/01/15");
    const again = await admin.post("/api/requests").send({ action: "convert", id: created.body.data.id });
    assert.equal(again.status, 400);
    const mine = await client.get("/api/requests");
    assert.equal(mine.body.data[0].status, "converted");
  });

  it("keeps staff without the permission out", async () => {
    const res = await request(app).get("/api/requests");
    assert.equal(res.status, 401);
  });
});

describe("stage owners and deadlines", () => {
  it("assigns stages, warns about leave and hands work over", async () => {
    const admin = await login("admin");
    const res = await admin.post("/api/update_stage_plan").send({
      id: 3,
      plan: { "سناریو": { owner_id: 1, due_date: "1405/03/01" }, "تدوین": { owner_id: 2, due_date: "1405/03/11" } },
    });
    assert.equal(res.body.status, "success");
    assert.ok(res.body.warnings.some((w: string) => w.includes("مرخصی")), JSON.stringify(res.body.warnings));
    const before = state.notifications.length;
    await admin.post("/api/toggle_stage").send({ id: 3, stage: "سناریو", isChecked: true });
    const handoff = state.notifications.slice(before).find((n: any) => n.type === "stage_handoff");
    assert.ok(handoff);
    assert.equal(handoff.user_id, 2);
  });

  it("reminds and escalates overdue stages once a day", () => {
    const before = state.notifications.length;
    assert.equal(checkStageDeadlines("1405/03/14"), true);
    const fresh = state.notifications.slice(before);
    assert.ok(fresh.some((n: any) => n.type === "stage_overdue" && n.role_target === "colleague" && n.user_id === 2));
    assert.ok(fresh.some((n: any) => n.type === "stage_overdue" && n.role_target === "admin"));
    assert.equal(checkStageDeadlines("1405/03/14"), false);
  });
});

describe("review versions and internal approval", () => {
  it("blocks sending to the client until approved internally", async () => {
    const admin = await login("admin");
    await admin.post("/api/workflow_settings").send({ internal_approval_required: true });
    const ali = await login("ali");
    const blocked = await ali.post("/api/add_content").send({ action: "update_status", id: 1, status: "client_review" });
    assert.equal(blocked.status, 400);

    const sub = await ali.post("/api/review_versions").send({ action: "submit", id: 1, files: [{ name: "v1.mp4", url: "/uploads/file_1.mp4" }] });
    assert.equal(sub.body.status, "success");
    assert.equal(card(1).status, "review");

    const client = await login("brand1");
    const hidden = await client.get("/api/review_detail?id=1");
    assert.equal(hidden.body.data.versions.length, 0);

    const notApprover = await ali.post("/api/review_versions").send({ action: "internal", id: 1, decision: "approve" });
    assert.equal(notApprover.status, 403);
    const art = await login("artdir");
    const ok = await art.post("/api/review_versions").send({ action: "internal", id: 1, decision: "approve" });
    assert.equal(ok.body.status, "success");
    assert.equal(card(1).status, "client_review");

    const visible = await client.get("/api/review_detail?id=1");
    assert.equal(visible.body.data.versions.length, 1);
    assert.equal(visible.body.data.versions[0].internal, undefined);
  });

  it("keeps time-coded feedback and every decision, and counts revision rounds", async () => {
    state.organizations.find((o: any) => o.id === 1)!.contract = { revision_limit: 1, quotas: [] };
    const client = await login("brand1");
    const fb = await client.post("/api/review_feedback").send({ id: 1, text: "لوگو کوچک است", timecode: 12.5, x: 40, y: 20 });
    assert.equal(fb.body.feedback.timecode, 12.5);
    const r1 = await client.post("/api/client_review").send({ content_id: 1, action: "reject", comment: "اول" });
    assert.equal(r1.body.over_limit, false);

    const ali = await login("ali");
    await ali.post("/api/review_versions").send({ action: "submit", id: 1, files: [{ name: "v2.mp4", url: "/uploads/file_2.mp4" }] });
    const art = await login("artdir");
    await art.post("/api/review_versions").send({ action: "internal", id: 1, decision: "approve" });
    const r2 = await client.post("/api/client_review").send({ content_id: 1, action: "reject", comment: "دوم" });
    assert.equal(r2.body.revision_rounds, 2);
    assert.equal(r2.body.over_limit, true);
    assert.equal(card(1).client_reviews.length, 2);
    assert.equal(card(1).client_reviews[0].comment, "اول");

    const other = await login("brand2");
    const denied = await other.post("/api/review_feedback").send({ id: 1, text: "x" });
    assert.equal(denied.status, 403);
    const admin = await login("admin");
    await admin.post("/api/workflow_settings").send({ internal_approval_required: false });
  });

  it("asks for caption approval again after the text changes", async () => {
    const client = await login("brand1");
    await client.post("/api/caption_review").send({ id: 1, decision: "approve" });
    assert.equal(card(1).caption_approval.status, "approved");
    const ali = await login("ali");
    const r = await ali.post("/api/update_captions").send({ id: 1, captions: { "اینستاگرام": "متن جدید #نوروز" } });
    assert.equal(r.body.status, "success");
    assert.equal(card(1).platform_captions["اینستاگرام"], "متن جدید #نوروز");
    assert.equal(card(1).caption_approval.status, "pending");
  });

  it("delivers final files to the brand only", async () => {
    const ali = await login("ali");
    await ali.post("/api/deliverables").send({ action: "add", id: 1, files: [{ name: "final.mp4", url: "/uploads/file_9.mp4" }] });
    const d = await ali.post("/api/deliverables").send({ action: "deliver", id: 1 });
    assert.ok(d.body.delivered_at);
    assert.equal(lastNotification().type, "delivery");
    const client = await login("brand1");
    const files = await client.get("/api/client_deliverables");
    assert.equal(files.body.data[0].files[0].name, "final.mp4");
    const other = await login("brand2");
    assert.equal((await other.get("/api/client_deliverables")).body.data.length, 0);
  });
});

describe("contracts and quotes", () => {
  it("compares the package with what was delivered and bills the difference", async () => {
    const admin = await login("admin");
    await admin.post("/api/manage_contract").send({
      org_id: 2,
      contract: { title: "پکیج طلایی", monthly_fee: 1000, quotas: [{ content_type: "پوستر", count: 2, unit_price: 100 }], credit_shortfall: true },
    });
    state.contents.push(
      { id: 50, title: "p1", org_id: 2, content_type: "پوستر", status: "published", publish_date: "1405/02/03" },
      { id: 51, title: "p2", org_id: 2, content_type: "پوستر", status: "todo", publish_date: "1405/02/09" },
    );
    const usage = await admin.get("/api/contract_usage?org_id=2&year=1405&month=2");
    const row = usage.body.data.rows.find((r: any) => r.content_type === "پوستر");
    assert.equal(row.delivered, 1);
    assert.equal(row.planned, 1);
    assert.equal(row.shortfall, 1);
    const inv = await admin.post("/api/contract_invoice").send({ org_id: 2, year: 1405, month: 2, doc_type: "quote" });
    assert.equal(inv.body.status, "success");
    assert.equal(inv.body.data.total, 900);

    const sent = await admin.post("/api/invoices").send({ action: "send_quote", id: inv.body.data.id });
    assert.equal(sent.body.status, "success");
    const client = await login("brand2");
    const quotes = await client.get("/api/client_quotes");
    assert.equal(quotes.body.data[0].doc_type, "quote");
    const acc = await client.post("/api/client_quotes").send({ id: inv.body.data.id, decision: "accept" });
    assert.equal(acc.body.status, "success");
    const invoice = state.invoices.find((i: any) => i.id === acc.body.invoice_id)!;
    assert.equal(invoice.doc_type, "invoice");
    assert.equal(invoice.quote_id, inv.body.data.id);
    const twice = await client.post("/api/client_quotes").send({ id: inv.body.data.id, decision: "accept" });
    assert.equal(twice.status, 400);
  });
});

describe("timesheet, workload and profitability", () => {
  it("logs time by hand and with a timer", async () => {
    const ali = await login("ali");
    const add = await ali.post("/api/time_entries").send({ action: "add", content_id: 1, minutes: 90, date: "1405/02/05" });
    assert.equal(add.body.data.org_id, 1);
    await ali.post("/api/timer").send({ action: "start", content_id: 1 });
    const me = state.colleagues.find((c: any) => c.id === 2)!;
    me.running_timer.started_at = new Date(Date.now() - 30 * 60000).toISOString();
    const stop = await ali.post("/api/timer").send({ action: "stop" });
    assert.equal(stop.body.data.minutes, 30);
    const list = await ali.get("/api/time_entries?content_id=1");
    assert.equal(list.body.total_minutes, 120);
  });

  it("reports profit per brand and team workload", async () => {
    const admin = await login("admin");
    await admin.post("/api/hourly_cost").send({ colleague_id: 2, hourly_cost: 200 });
    const p = await admin.get("/api/profitability?from=1405/02/01&to=1405/02/31");
    const brand1 = p.body.data.find((r: any) => r.org_id === 1);
    assert.equal(brand1.labor_cost, 300);
    const ali = await login("ali");
    assert.equal((await ali.get("/api/profitability")).status, 403);
    const w = await admin.get("/api/workload?from=1405/03/10&to=1405/03/12");
    const aliRow = w.body.data.find((r: any) => r.colleague_id === 2);
    assert.equal(aliRow.days[0].on_leave, true);
    assert.ok(aliRow.open_cards >= 1);
  });
});

describe("shoots and equipment", () => {
  it("refuses double-booked equipment and warns about crew clashes", async () => {
    const admin = await login("admin");
    const cam = await admin.post("/api/equipment").send({ action: "save", name: "Sony FX3" });
    const base = { action: "save", date: "1405/04/01", start_time: "10:00", end_time: "14:00", equipment_ids: [cam.body.data.id], crew: [{ colleague_id: 2, role: "فیلمبردار" }] };
    const s1 = await admin.post("/api/shoots").send({ ...base, title: "شوت یک" });
    assert.equal(s1.body.status, "success");
    assert.equal(lastNotification().type, "shoot_assigned");
    const clash = await admin.post("/api/shoots").send({ ...base, title: "شوت دو", start_time: "13:00", end_time: "15:00" });
    assert.equal(clash.status, 409);
    const crewOnly = await admin.post("/api/shoots").send({ ...base, title: "شوت سه", equipment_ids: [], start_time: "12:00" });
    assert.equal(crewOnly.body.status, "warning");
    const forced = await admin.post("/api/shoots").send({ ...base, title: "شوت سه", equipment_ids: [], start_time: "12:00", force: true });
    assert.equal(forced.body.status, "success");
    const later = await admin.post("/api/shoots").send({ ...base, title: "شوت عصر", start_time: "15:00", end_time: "18:00", crew: [] });
    assert.equal(later.body.status, "success");
  });
});

describe("brand kit, snippets, saved views", () => {
  it("stores a brand kit the brand can read but not change", async () => {
    const admin = await login("admin");
    const r = await admin.post("/api/brand_kit").send({ org_id: 1, kit: { colors: [{ name: "اصلی", hex: "#ff0000" }, { hex: "red;background:url(x)" }], dos: ["لحن صمیمی"], logos: [{ name: "logo", url: "javascript:alert(1)" }] } });
    assert.equal(r.body.data.colors.length, 1);
    assert.equal(r.body.data.logos.length, 0);
    const client = await login("brand1");
    const kit = await client.get("/api/brand_kit?org_id=2");
    assert.equal(kit.body.data.org_id, 1);
    assert.equal(kit.body.can_edit, false);
    assert.equal((await client.post("/api/brand_kit").send({ org_id: 1, kit: {} })).status, 403);
  });

  it("keeps snippets and per-user saved views", async () => {
    const ali = await login("ali");
    const s = await ali.post("/api/snippets").send({ action: "save", text: "#نوروز #عید", kind: "hashtag", org_id: 1 });
    assert.equal(s.body.data.kind, "hashtag");
    const v = await ali.post("/api/saved_views").send({ page: "depot", name: "ریلز هفته", filters: { org: "1" } });
    assert.equal(v.body.data.length, 1);
    const admin = await login("admin");
    assert.equal((await admin.get("/api/saved_views?page=depot")).body.data.length, 0);
  });
});

describe("external notifications, calendars and reports", () => {
  it("masks secrets and routes notifications to the right contacts", async () => {
    const admin = await login("admin");
    await admin.post("/api/integrations").send({ config: { sms: { enabled: true, api_key: "SECRET-KEY-1234" } } });
    const cfg = await admin.get("/api/integrations");
    assert.equal(cfg.body.data.sms.api_key, "••••1234");
    await admin.post("/api/integrations").send({ config: { sms: { api_key: "••••1234" } } });
    // Stored encrypted, kept when the masked value comes back, and readable by the server.
    assert.match(state.integrations[0].sms.api_key, /^enc:v1:/);
    assert.doesNotMatch(JSON.stringify(state.integrations), /SECRET-KEY-1234/);
    assert.equal(decryptSecret(state.integrations[0].sms.api_key), "SECRET-KEY-1234");
    state.organizations.find((o: any) => o.id === 1)!.phone_number = "۰۹۱۲۱۲۳۴۵۶۷";
    const planned = plannedDeliveries({ role_target: "client", user_id: 1, type: "client_review" });
    assert.deepEqual(planned, [{ channel: "sms", to: "09121234567" }]);
    assert.deepEqual(plannedDeliveries({ role_target: "client", user_id: 1, type: "something_else" }), []);
    const ali = await login("ali");
    assert.equal((await ali.get("/api/integrations")).status, 403);
    updateIntegrationConfig({ sms: { enabled: false } });
  });

  it("serves a private calendar feed", async () => {
    const ali = await login("ali");
    const link = await ali.get("/api/ics_link");
    const url = new URL(link.body.url);
    const feed = await request(app).get(url.pathname);
    assert.equal(feed.status, 200);
    assert.match(feed.headers["content-type"], /text\/calendar/);
    assert.match(feed.text, /BEGIN:VEVENT/);
    assert.match(feed.text, /DTSTART;TZID=Asia\/Tehran:20260622T100000/);
    assert.equal((await request(app).get("/ics/not-a-real-token-at-all-xx.ics")).status, 404);
  });

  it("keeps calendar tokens and labour cost out of lists", async () => {
    const admin = await login("admin");
    await admin.get("/api/ics_link");
    const orgs = await admin.get("/api/get_orgs");
    assert.ok(orgs.body.data.every((o: any) => !("ics_token" in o)));
    const ali = await login("ali");
    await ali.get("/api/ics_link");
    const list = await ali.get("/api/get_colleagues");
    assert.ok(list.body.users.every((c: any) => !("hourly_cost" in c) && !("ics_token" in c) && !("saved_views" in c)));
    const full = await admin.get("/api/get_colleagues");
    assert.equal(full.body.users.find((c: any) => c.id === 2).hourly_cost, 200);
  });

  it("builds the monthly report for the brand", async () => {
    card(50).platform_metrics = { "اینستاگرام": { views: 1200, likes: 30 } };
    const client = await login("brand2");
    const r = await client.get("/api/monthly_report_data?year=1405&month=2&org_id=1");
    assert.equal(r.body.data.org.id, 2);
    assert.equal(r.body.data.delivered.length, 1);
    assert.equal(r.body.data.totals.views, 1200);
    assert.equal(r.body.data.next_month.length, 0);
  });
});

describe("settings page", () => {
  it("lists every permission as a checkbox in the role editor", async () => {
    const admin = await login("admin");
    const res = await admin.get("/settings");
    assert.equal(res.status, 200);
    for (const perm of ["depot", "approve_content", "requests", "integrations"]) {
      assert.match(res.text, new RegExp(`name="perms" value="${perm}"`), perm);
    }
    assert.match(res.text, /گردش کار تولید/);
  });

  it("always offers the seven week days as days off, Friday by default", async () => {
    const admin = await login("admin");
    const res = await admin.get("/api/manage_settings");
    const days = res.body.data.routine_holidays;
    assert.equal(days.length, 7);
    assert.equal(days[0].setting_key, "شنبه");
    assert.deepEqual(days.filter((d: any) => d.is_active === 1).map((d: any) => d.id), [5]);
    await admin.post("/api/manage_settings").send({ action: "edit", group: "routine_holidays", id: 6, key: "شنبه", is_active: 1 });
    const after = await admin.get("/api/manage_settings");
    assert.equal(after.body.data.routine_holidays.find((d: any) => d.id === 6).is_active, 1);
  });
});

describe("brand panel preview", () => {
  it("lets studio managers see a brand's panel read-only and come back", async () => {
    const admin = await login("admin");
    const start = await admin.get("/client-preview/1");
    assert.equal(start.headers.location, "/client-dashboard");
    const dash = await admin.get("/client-dashboard");
    assert.equal(dash.status, 200);
    assert.match(dash.text, /در حال مشاهده‌ی پنل «برند یک»/);
    const data = await admin.get("/api/get_client_data");
    assert.ok(data.body.pending.every((c: any) => c.org_id == 1));
    const write = await admin.post("/api/client_review").send({ content_id: 1, action: "approve" });
    assert.equal(write.status, 403);
    const exit = await admin.get("/client-preview/exit");
    assert.equal(exit.headers.location, "/client-portal");
    assert.equal((await admin.get("/depot")).status, 200);
  });

  it("is refused to staff without client permissions", async () => {
    const ali = await login("ali");
    assert.equal((await ali.get("/client-preview/1")).status, 403);
    const dash = await ali.get("/client-dashboard");
    assert.notEqual(dash.status, 200);
  });
});

describe("bulk imports", () => {
  it("skip items that already exist and can be undone from the history", async () => {
    const admin = await login("admin");
    const cols = [{ title: "مجموعه الف", org_username: "brand1" }, { title: "مجموعه ب" }];
    const first = await admin.post("/api/manage_collections").send({ action: "batch_add", cols });
    assert.equal(first.body.added, 2);
    const again = await admin.post("/api/manage_collections").send({ action: "batch_add", cols });
    assert.equal(again.body.added, 0);
    assert.equal(again.body.duplicates, 2);
    assert.equal(state.collections.filter((c: any) => c.title === "مجموعه الف").length, 1);

    const ops = await admin.get("/api/get_batch_operations");
    const op = ops.body.data.find((o: any) => o.type === "bulk_add" && o.table === "collections");
    assert.ok(op, "the import is in the activity history");
    assert.deepEqual(op.item_titles, ["مجموعه الف", "مجموعه ب"]);
    await admin.post("/api/undo_batch_operation").send({ batch_id: op.id });
    assert.equal(state.collections.some((c: any) => c.title === "مجموعه الف"), false);
    assert.ok(state.recycle_bin.some((b: any) => b.table === "collections" && b.item_title === "مجموعه الف"));
    await admin.post("/api/redo_batch_operation").send({ batch_id: op.id });
    assert.equal(state.collections.filter((c: any) => c.title === "مجموعه الف").length, 1);
  });

  it("records template, media and organisation imports too", async () => {
    const admin = await login("admin");
    await admin.post("/api/manage_content_template").send({ action: "batch_add", templates: [{ name: "قالب گروهی", items: [{ type: "پوستر", count: 2 }] }] });
    await admin.post("/api/save_media").send({ action: "batch_add", media: [{ asset_name: "لوگو گروهی", file_url: "https://example.com/l.png" }] });
    await admin.post("/api/manage_orgs").send({ action: "batch_add", orgs: [{ org_name: "برند گروهی" }] });
    const ops = (await admin.get("/api/get_batch_operations")).body.data.filter((o: any) => o.type === "bulk_add");
    for (const table of ["contentTemplates", "mediaAssets", "organizations"]) assert.ok(ops.some((o: any) => o.table === table), table);
    const media = ops.find((o: any) => o.table === "mediaAssets");
    await admin.post("/api/undo_batch_operation").send({ batch_id: media.id });
    assert.equal(state.mediaAssets.some((m: any) => m.asset_name === "لوگو گروهی"), false);
    await admin.post("/api/redo_batch_operation").send({ batch_id: media.id });
    assert.equal(state.mediaAssets.some((m: any) => m.asset_name === "لوگو گروهی"), true);
  });
});

describe("comment threads", () => {
  it("notifies the author of the comment that was answered", async () => {
    const ali = await login("ali");
    const first = await ali.post("/api/contents/1/comments").send({ text: "نظر اول" });
    const admin = await login("admin");
    await admin.post("/api/contents/1/comments").send({ text: "پاسخ", parent_id: first.body.comment.id });
    const n = lastNotification();
    assert.equal(n.user_id, 2);
    assert.equal(card(1).comments[1].parent_id, first.body.comment.id);
  });
});

describe("first-run setup checklist", () => {
  it("lists the remaining steps for admins and can be hidden", async () => {
    const admin = await login("admin");
    const res = await admin.get("/api/setup_status");
    assert.equal(res.status, 200);
    const steps = res.body.data.steps;
    assert.ok(steps.find((s: any) => s.id === "orgs").done);
    assert.ok(steps.find((s: any) => s.id === "content_types").done);
    assert.equal(steps.find((s: any) => s.id === "integrations").done, false);
    assert.equal(res.body.data.dismissed, false);
    await admin.post("/api/save_studio_info").send({ setup_dismissed: true }).expect(200);
    assert.equal((await admin.get("/api/setup_status")).body.data.dismissed, true);
    await admin.post("/api/save_studio_info").send({ setup_dismissed: false }).expect(200);
  });
  it("is not shown to staff without the settings permission", async () => {
    const ali = await login("ali");
    assert.equal((await ali.get("/api/setup_status")).status, 403);
  });
});

describe("activity log", () => {
  it("names the action in Persian and skips page assets and unknown paths", async () => {
    const admin = await login("admin");
    const before = state.audit_logs.length;
    await admin.get("/assets/js/core.js");
    await admin.get("/api/get_orgs");
    await admin.post("/api/requests").send({ action: "create", org_id: 1, title: "درخواست تست لاگ" }).expect(200);
    const added = state.audit_logs.slice(before);
    assert.equal(added.length, 1, JSON.stringify(added));
    assert.doesNotMatch(JSON.stringify(added[0]), /\/api\/requests/);
  });
});

describe("Excel imports follow their guides", () => {
  it("contents: exact status names, collection, platforms and exact colleague names", async () => {
    state.settings.platform = [{ id: 9, setting_key: "Instagram", is_active: 1 }];
    const admin = await login("admin");
    const res = await admin.post("/api/bulk_import_contents").send({
      items: [
        { title: "ایمپورت ۱", org_name: "برند یک", collection: "کمپین تست", publish_platforms: ["instagram"], status: "ارزیابی کارفرما", assigned_colleagues: ["علی"], publish_date: "۱۴۰۵/۲/۵" },
        { title: "ایمپورت ۲", status: "در صف انتظار" },
        { title: "ایمپورت ۳", status: "تایید کارفرما" },
      ],
    });
    assert.equal(res.body.status, "success", JSON.stringify(res.body));
    const [c1, c2, c3] = ["ایمپورت ۱", "ایمپورت ۲", "ایمپورت ۳"].map((t) => state.contents.find((c: any) => c.title === t)!);
    assert.equal(c1.status, "client_review");
    assert.equal(c2.status, "todo");
    assert.equal(c3.status, "approved_by_client");
    assert.deepEqual(c1.publish_platforms, ["Instagram"]);
    assert.deepEqual(c1.assigned_colleagues, ["علی"]);
    assert.equal(c1.publish_date, "1405/02/05");
    const col = state.collections.find((c: any) => c.id === c1.collection_id);
    assert.equal(col?.title, "کمپین تست");
    assert.equal(col?.org_id, 1);
  });

  it("collections: brand by name and parent by title, even when the parent comes later", async () => {
    const admin = await login("admin");
    const res = await admin.post("/api/manage_collections").send({
      action: "batch_add",
      cols: [
        { title: "زیر پوشه", org: "برند دو", parent: "پوشه اصلی" },
        { title: "پوشه اصلی", org: "brand2" },
        { title: "بی‌برند", org: "ناموجود" },
      ],
    });
    assert.equal(res.body.status, "success");
    assert.match(res.body.message, /پیدا نشد/);
    const child = state.collections.find((c: any) => c.title === "زیر پوشه")!;
    const parent = state.collections.find((c: any) => c.title === "پوشه اصلی")!;
    assert.equal(child.org_id, 2);
    assert.equal(parent.org_id, 2);
    assert.equal(child.parent_id, parent.id);
    assert.equal(state.collections.find((c: any) => c.title === "بی‌برند")!.org_id, null);
  });

  it("smart events: header rows with Persian digits, no duplicates, unknown brands are not created", async () => {
    const admin = await login("admin");
    const orgCount = state.organizations.length;
    const rows = [
      { title: "روز تست", calendar: "شمسی", day: "۱", month: "۶", holiday: false },
      { title: "سالگرد برند", calendar: "میلادی", day: 15, month: 8, org: "برند یک", holiday: true },
      { title: "مناسبت برند ناموجود", calendar: "قمری", day: 2, month: 3, org: "برندی که نیست" },
      { title: "بد", calendar: "شمسی", day: 40, month: 1 },
    ];
    const first = await admin.post("/api/upload_smart_events").send({ rows });
    assert.equal(first.body.status, "success", JSON.stringify(first.body));
    assert.equal(first.body.added, 3);
    assert.equal(state.organizations.length, orgCount);
    const ev = state.smartEventsBank.find((e: any) => e.title === "سالگرد برند")!;
    assert.equal(ev.org_id, 1);
    assert.equal(ev.calendar_type, "miladi");
    assert.equal(ev.is_holiday, 1);
    assert.equal(state.smartEventsBank.find((e: any) => e.title === "مناسبت برند ناموجود")!.org_id, null);
    const again = await admin.post("/api/upload_smart_events").send({ rows });
    assert.equal(again.body.added, 0);
    assert.match(again.body.message, /تکراری/);
  });

  it("media: brand by name", async () => {
    const admin = await login("admin");
    await admin.post("/api/save_media").send({ action: "batch_add", media: [{ asset_name: "لوگوی تست", asset_type: "تصویر / لوگو 🖼️", file_url: "https://example.com/l.png", org: "برند یک" }] }).expect(200);
    assert.equal(state.mediaAssets.find((m: any) => m.asset_name === "لوگوی تست")!.org_id, 1);
  });
});

describe("collections as folders", () => {
  it("deleting a folder takes its sub-folders and content to the recycle bin, and restore brings all back", async () => {
    const admin = await login("admin");
    const mk = async (title: string, parent_id?: number) =>
      (await admin.post("/api/manage_collections").send({ action: "add", title, org_id: 1, parent_id: parent_id ?? "" })).body.data.id as number;
    const a = await mk("پوشه الف");
    const b = await mk("پوشه ب", a);
    const c = await mk("پوشه ج", b);
    state.contents.push({ id: 9001, title: "در ب", org_id: 1, collection_id: b, status: "raw" }, { id: 9002, title: "در ج", org_id: 1, collection_id: c, status: "raw" }, { id: 9003, title: "در الف", org_id: 1, collection_id: a, status: "raw" });
    // A folder cannot move into its own sub-folder.
    const loop = await admin.post("/api/manage_collections").send({ action: "edit", id: a, parent_id: c });
    assert.equal(loop.status, 400);
    const del = await admin.post("/api/manage_collections").send({ action: "delete", id: b });
    assert.equal(del.body.status, "success");
    assert.equal(del.body.removed_collections, 1);
    assert.equal(del.body.removed_contents, 2);
    assert.ok(!state.collections.some((x: any) => x.id === b || x.id === c));
    assert.ok(!state.contents.some((x: any) => x.id === 9001 || x.id === 9002));
    assert.ok(state.contents.some((x: any) => x.id === 9003), "content of the parent folder stays");
    const restore = await admin.post("/api/recycle_bin").send({ action: "restore", bin_id: del.body.bin_id });
    assert.equal(restore.body.status, "success", JSON.stringify(restore.body));
    assert.equal(state.collections.find((x: any) => x.id === c)?.parent_id, b);
    assert.equal(state.collections.find((x: any) => x.id === b)?.parent_id, a);
    assert.ok(state.contents.some((x: any) => x.id === 9001) && state.contents.some((x: any) => x.id === 9002));
  });
  it("a sub-folder needs an existing parent", async () => {
    const admin = await login("admin");
    const res = await admin.post("/api/manage_collections").send({ action: "add", title: "یتیم", parent_id: 999999 });
    assert.equal(res.status, 400);
  });
});

describe("security hardening", () => {
  it("encrypts social tokens and never returns them", async () => {
    const admin = await login("admin");
    await admin.post("/api/save_token").send({ org_id: 1, platform_name: "instagram", account_username: "brand", access_token: "IGQVJ-very-secret-token-9876" }).expect(200);
    const t = state.tokens[state.tokens.length - 1];
    assert.match(t.access_token, /^enc:v1:/);
    assert.equal(decryptSecret(t.access_token), "IGQVJ-very-secret-token-9876");
    const list = await admin.get("/api/get_tokens");
    assert.doesNotMatch(JSON.stringify(list.body), /very-secret|enc:v1/);
    assert.match(JSON.stringify(list.body), /IGQV••••9876/);
  });

  it("an unreadable stored secret reads as empty instead of breaking", () => {
    assert.equal(decryptSecret("enc:v1:AAAAinvalid"), "");
    assert.equal(decryptSecret(encryptSecret("abc")), "abc");
    assert.equal(decryptSecret("plain-old-value"), "plain-old-value");
  });

  it("refuses short, simple or username-equal passwords for new and changed accounts", async () => {
    const admin = await login("admin");
    for (const [password, why] of [["Ab12345", /۸ کاراکتر/], ["12345678", /ساده/], ["aaaaaaaaaa", /ساده/], ["newperson1", /نام کاربری/]]) {
      const r = await admin.post("/api/save_user").send({ username: "newperson1", password, full_name: "تست", role_id: 3 });
      assert.equal(r.status, 400, String(password));
      assert.match(r.body.message, why as RegExp);
    }
    const ok = await admin.post("/api/save_user").send({ username: "newperson1", password: "Studio-Pass-2026", full_name: "تست", role_id: 3 });
    assert.equal(ok.body.status, "success", JSON.stringify(ok.body));
    const org = await admin.post("/api/manage_orgs").send({ action: "add", org_name: "برند رمز کوتاه", username: "shortpw", password: "abc123" });
    assert.equal(org.status, 400);
  });

  it("locks unknown devices after 5 wrong passwords, but the owner's own devices keep working", async () => {
    resetLoginLockouts();
    // Ali logged in from his laptop before: that browser is a trusted device for "ali".
    const laptop = request.agent(app);
    assert.equal((await laptop.post("/api/login").set("X-Forwarded-For", "10.30.0.1").send({ username: "ali", password: PASSWORD })).status, 200);
    // Someone else, knowing only the username, tries 5 wrong passwords from several addresses.
    let last: any;
    for (let i = 0; i < 5; i++) {
      last = await request(app).post("/api/login").set("X-Forwarded-For", `10.20.0.${i}`).send({ username: "ali", password: "wrong-pass-" + i });
    }
    assert.equal(last.status, 429);
    assert.match(last.body.message, /بسته شده/);
    // Unknown devices stay locked even with the right password...
    assert.equal((await request(app).post("/api/login").set("X-Forwarded-For", "10.20.1.1").send({ username: "ali", password: PASSWORD })).status, 429);
    // ...but Ali's laptop still gets in.
    assert.equal((await laptop.post("/api/login").set("X-Forwarded-For", "10.30.0.1").send({ username: "ali", password: PASSWORD })).status, 200);
    // A forged or edited device cookie is ignored.
    const forged = await request(app).post("/api/login").set("X-Forwarded-For", "10.20.2.1").set("Cookie", "asva_td=eyJkIjoieCIsInUiOlsiYWxpIl19.fake").send({ username: "ali", password: PASSWORD });
    assert.equal(forged.status, 429);
    // Admins and Ali himself are told.
    assert.ok(state.notifications.some((n: any) => n.title === "قفل موقت حساب کاربری" && n.role_target === "admin"));
    assert.ok(state.notifications.some((n: any) => n.type === "security" && n.role_target === "colleague" && n.user_id === 2));
    // A trusted device that keeps getting the password wrong is limited on its own.
    for (let i = 0; i < 5; i++) last = await laptop.post("/api/login").set("X-Forwarded-For", "10.30.0.1").send({ username: "ali", password: "typo-" + i });
    assert.equal(last.status, 429);
    // An unknown username behaves the same, so the lock does not reveal which names exist.
    for (let i = 0; i < 5; i++) last = await request(app).post("/api/login").set("X-Forwarded-For", `10.21.0.${i}`).send({ username: "ghost-user", password: "wrong-pass" });
    assert.equal(last.status, 429);
  });

  it("typos by others on a shared office IP do not block a colleague's trusted browser", async () => {
    resetLoginLockouts();
    const office = "10.50.0.1";
    const laptop = request.agent(app);
    assert.equal((await laptop.post("/api/login").set("X-Forwarded-For", office).send({ username: "artdir", password: PASSWORD })).status, 200);
    let last: any;
    for (let i = 0; i < 12; i++) last = await request(app).post("/api/login").set("X-Forwarded-For", office).send({ username: "someone" + (i % 3), password: "typo-" + i });
    assert.equal(last.status, 429, "the office IP is limited for unknown browsers");
    assert.equal((await laptop.post("/api/login").set("X-Forwarded-For", office).send({ username: "artdir", password: PASSWORD })).status, 200);
  });

  it("lets user managers see and lift login locks, nobody else", async () => {
    resetLoginLockouts();
    for (let i = 0; i < 5; i++) await request(app).post("/api/login").set("X-Forwarded-For", `10.40.0.${i}`).send({ username: "ali", password: "wrong-" + i });
    const admin = await login("admin");
    const locks = await admin.get("/api/login_locks");
    assert.deepEqual(locks.body.data.map((x: any) => [x.username, x.kind]), [["ali", "colleague"]]);
    const artdir = await login("artdir");
    assert.equal((await artdir.post("/api/unlock_login").send({ username: "ali" })).status, 403);
    assert.equal((await admin.post("/api/unlock_login").send({ username: "ali" })).status, 200);
    assert.equal((await admin.get("/api/login_locks")).body.data.length, 0);
    assert.equal((await request(app).post("/api/login").set("X-Forwarded-For", "10.40.1.1").send({ username: "ali", password: PASSWORD })).status, 200);
  });

  it("makes backups that only admins can list and download", async () => {
    const admin = await login("admin");
    const made = await admin.post("/api/backups").send({});
    assert.equal(made.body.status, "success", JSON.stringify(made.body));
    const list = await admin.get("/api/backups");
    assert.ok(list.body.data.some((b: any) => b.name === made.body.data.name));
    const dl = await admin.get("/api/backups/download?name=" + made.body.data.name).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); });
    assert.equal(dl.status, 200);
    const zlib = await import("zlib");
    const parsed = JSON.parse(zlib.gunzipSync(dl.body).toString("utf8"));
    assert.equal(parsed.format, "asva-studio-backup");
    assert.ok(parsed.data.contents.length > 0);
    assert.doesNotMatch(JSON.stringify(parsed), /IGQVJ-very-secret/, "credentials stay encrypted inside backups");
    assert.equal((await admin.get("/api/backups/download?name=../db.json")).status, 404);
    const ali = await login("ali");
    assert.equal((await ali.get("/api/backups")).status, 403);
    assert.equal((await ali.post("/api/backups").send({})).status, 403);
  });
});

describe("passwords and keyboard layouts", () => {
  it("treats Persian and Latin digits in a password as the same", async () => {
    resetLoginLockouts();
    const admin = await login("admin");
    const made = await admin.post("/api/save_user").send({ username: "layout1", password: "Asva-۱۴۰۵-pass", full_name: "تست", role_id: 3 });
    assert.equal(made.body.status, "success", JSON.stringify(made.body));
    for (const pw of ["Asva-1405-pass", "Asva-۱۴۰۵-pass", "  Asva-1405-pass  "]) {
      const r = await request(app).post("/api/login").set("X-Forwarded-For", "10.60.0.1").send({ username: "layout1", password: pw });
      assert.equal(r.status, 200, pw);
    }
  });

  it("still accepts a password saved with Persian digits by an older version, and upgrades it", async () => {
    resetLoginLockouts();
    const bcrypt = (await import("bcrypt")).default;
    state.colleagues.push({ id: 77, username: "legacy1", passwordHash: bcrypt.hashSync("Studio۱۲۳۴", 4), full_name: "قدیمی", role_id: 3, is_active: 1 });
    const r = await request(app).post("/api/login").set("X-Forwarded-For", "10.61.0.1").send({ username: "legacy1", password: "Studio1234" });
    assert.equal(r.status, 200);
    const acc = state.colleagues.find((c: any) => c.id === 77);
    assert.ok(bcrypt.compareSync("Studio1234", acc.passwordHash), "stored again in the normalized form");
  });

  it("changing your own password keeps you signed in", async () => {
    resetLoginLockouts();
    const admin = await login("admin");
    const r = await admin.post("/api/manage_users").send({ action: "edit", id: 1, password: "Fresh-Admin-77" });
    assert.equal(r.body.status, "success", JSON.stringify(r.body));
    assert.equal((await admin.get("/api/get_colleagues")).status, 200, "same browser stays signed in");
    assert.equal((await request(app).post("/api/login").set("X-Forwarded-For", "10.62.0.1").send({ username: "admin", password: "Fresh-Admin-77" })).status, 200);
    const bcrypt = (await import("bcrypt")).default;
    state.colleagues.find((c: any) => c.id === 1).passwordHash = bcrypt.hashSync(PASSWORD, 4);
  });
});

describe("password repeat field", () => {
  it("refuses a new password when its repeat does not match", async () => {
    const admin = await login("admin");
    const bad = await admin.post("/api/save_user").send({ username: "twice1", password: "Twice-Pass-11", password_confirm: "Twice-Pass-12", full_name: "تست", role_id: 3 });
    assert.equal(bad.status, 400);
    assert.match(bad.body.message, /تکرار/);
    const good = await admin.post("/api/save_user").send({ username: "twice1", password: "Twice-Pass-۱۱", password_confirm: "Twice-Pass-11", full_name: "تست", role_id: 3 });
    assert.equal(good.body.status, "success", JSON.stringify(good.body));
    const orgBad = await admin.post("/api/manage_orgs").send({ action: "add", org_name: "برند تکرار", username: "twiceorg", password: "Brand-Pass-77", password_confirm: "Brand-Pass-78" });
    assert.equal(orgBad.status, 400);
  });
});
