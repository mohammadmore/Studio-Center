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
    assert.equal(state.integrations[0].sms.api_key, "SECRET-KEY-1234");
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
