import crypto from "crypto";
import express from "express";
import { colleagues, contents, invoices, organizations, outbox } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission, clientOrgId, isClient } from "../../middleware/auth.js";
import { hasPermission } from "../../utils/authUtils.js";
import { addNotification } from "../../utils/logger.js";
import { normalizeJalaliDate, todayJalali, toInt } from "../../utils/helpers.js";
import {
  CHANNELS,
  DEFAULT_EVENTS,
  EVENT_LABELS,
  publicIntegrationConfig,
  sendOne,
  updateIntegrationConfig,
  type Channel,
} from "../../utils/notifiers.js";
import { DELIVERED_STATUSES } from "../../utils/workflowUtils.js";
import { contractUsage } from "./contracts.js";
import { docType, toNumber } from "./finances.js";

const subRouter = express.Router();

const text = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function fail(res: any, code: number, message: string) {
  return res.status(code).json({ status: "error", message });
}

// ───────────────────────────── External notification channels ─────────────────────────────

subRouter.get("/integrations", checkPermission("integrations"), (req, res) => {
  const contacts = {
    colleagues: colleagues
      .filter((c) => c.is_active !== 0)
      .map((c) => ({
        id: c.id,
        name: c.full_name || c.username,
        phone: c.phone || "",
        email: c.email || "",
        telegram_chat_id: c.telegram_chat_id || "",
        bale_chat_id: c.bale_chat_id || "",
        notify_opt_out: c.notify_opt_out || [],
      })),
    organizations: organizations
      .filter((o) => o.is_active !== 0)
      .map((o) => ({
        id: o.id,
        name: o.org_name,
        phone: o.phone_number || "",
        email: Array.isArray(o.emails) ? (typeof o.emails[0] === "string" ? o.emails[0] : o.emails[0]?.email || "") : "",
        telegram_chat_id: o.telegram_chat_id || "",
        bale_chat_id: o.bale_chat_id || "",
        notify_opt_out: o.notify_opt_out || [],
      })),
  };
  res.json({
    status: "success",
    data: publicIntegrationConfig(),
    events: DEFAULT_EVENTS.map((id) => ({ id, label: EVENT_LABELS[id] || id })),
    contacts,
  });
});

subRouter.post("/integrations", checkPermission("integrations"), (req, res) => {
  updateIntegrationConfig(req.body.config || {});
  saveDatabase();
  res.json({ status: "success", message: "تنظیمات اعلان‌های خارجی ذخیره شد", data: publicIntegrationConfig() });
});

function applyContact(target: any, body: any, isOrg: boolean) {
  for (const key of ["telegram_chat_id", "bale_chat_id"]) {
    if (body[key] !== undefined) target[key] = text(body[key], 64);
  }
  if (body.phone !== undefined) target[isOrg ? "phone_number" : "phone"] = text(body.phone, 30);
  if (body.email !== undefined) {
    const email = text(body.email, 200);
    if (isOrg) target.emails = email ? [email, ...(Array.isArray(target.emails) ? target.emails.slice(1) : [])] : [];
    else target.email = email;
  }
  if (Array.isArray(body.notify_opt_out)) {
    target.notify_opt_out = body.notify_opt_out.filter((c: any) => CHANNELS.includes(c));
  }
}

subRouter.post("/integration_contacts", checkPermission("integrations"), (req, res) => {
  const isOrg = req.body.type === "organization";
  const target = (isOrg ? organizations : colleagues).find((x) => x.id == req.body.id);
  if (!target) return fail(res, 404, "یافت نشد");
  applyContact(target, req.body, isOrg);
  saveDatabase();
  res.json({ status: "success", message: "اطلاعات تماس ذخیره شد" });
});

subRouter.post("/integration_test", checkPermission("integrations"), async (req, res) => {
  const channel = req.body.channel as Channel;
  const to = text(req.body.to, 200);
  if (!CHANNELS.includes(channel) || !to) return fail(res, 400, "کانال و گیرنده را مشخص کنید");
  const result = await sendOne(channel, to, "پیام آزمایشی", "اتصال این کانال با موفقیت برقرار است.");
  saveDatabase();
  if (!result.ok) return fail(res, 400, `ارسال ناموفق: ${result.error}`);
  res.json({ status: "success", message: "پیام آزمایشی ارسال شد" });
});

subRouter.get("/outbox", checkPermission("integrations"), (req, res) => {
  res.json({ status: "success", data: outbox.slice(0, 200) });
});

/** Each user (or brand) can set their own messenger ids and opt out of channels. */
subRouter.get("/my_channels", (req: any, res) => {
  const target = isClient(req) ? req.account : colleagues.find((c) => c.id == req.user.id);
  if (!target) return fail(res, 404, "یافت نشد");
  res.json({
    status: "success",
    data: {
      telegram_chat_id: target.telegram_chat_id || "",
      bale_chat_id: target.bale_chat_id || "",
      notify_opt_out: target.notify_opt_out || [],
    },
  });
});

subRouter.post("/my_channels", (req: any, res) => {
  const target = isClient(req) ? req.account : colleagues.find((c) => c.id == req.user.id);
  if (!target) return fail(res, 404, "یافت نشد");
  const { phone, email, ...rest } = req.body;
  applyContact(target, rest, isClient(req));
  saveDatabase();
  res.json({ status: "success", message: "تنظیمات اعلان شما ذخیره شد" });
});

// ───────────────────────────── Saved views (filters) ─────────────────────────────

subRouter.get("/saved_views", (req: any, res) => {
  if (isClient(req)) return fail(res, 403, "عدم دسترسی");
  const me = colleagues.find((c) => c.id == req.user.id);
  const page = text(req.query.page, 50);
  res.json({ status: "success", data: (me?.saved_views || []).filter((v: any) => !page || v.page === page) });
});

subRouter.post("/saved_views", (req: any, res) => {
  if (isClient(req)) return fail(res, 403, "عدم دسترسی");
  const me = colleagues.find((c) => c.id == req.user.id);
  if (!me) return fail(res, 404, "یافت نشد");
  me.saved_views = Array.isArray(me.saved_views) ? me.saved_views : [];
  if (req.body.action === "delete") {
    me.saved_views = me.saved_views.filter((v: any) => v.id !== req.body.id);
  } else {
    const name = text(req.body.name, 60);
    const page = text(req.body.page, 50);
    if (!name || !page) return fail(res, 400, "نام نما الزامی است");
    const filters = req.body.filters && typeof req.body.filters === "object" ? req.body.filters : {};
    if (JSON.stringify(filters).length > 5000) return fail(res, 400, "فیلترها بیش از حد بزرگ است");
    const existing = me.saved_views.find((v: any) => v.page === page && v.name === name);
    if (existing) existing.filters = filters;
    else {
      if (me.saved_views.length >= 50) return fail(res, 400, "حداکثر ۵۰ نما مجاز است");
      me.saved_views.push({ id: crypto.randomBytes(6).toString("hex"), page, name, filters, created_at: new Date().toISOString() });
    }
  }
  saveDatabase();
  res.json({ status: "success", data: me.saved_views });
});

// ───────────────────────────── Calendar subscription links ─────────────────────────────

function baseUrl(req: any) {
  return `${req.protocol}://${req.get("x-forwarded-host") || req.get("host")}`;
}

subRouter.get("/ics_link", (req: any, res) => {
  const target = isClient(req) ? req.account : colleagues.find((c) => c.id == req.user.id);
  if (!target) return fail(res, 404, "یافت نشد");
  if (!target.ics_token) {
    target.ics_token = crypto.randomBytes(18).toString("base64url");
    saveDatabase();
  }
  const url = `${baseUrl(req)}/ics/${target.ics_token}.ics`;
  res.json({ status: "success", url, webcal: url.replace(/^https?:/, "webcal:") });
});

subRouter.post("/ics_link", (req: any, res) => {
  const target = isClient(req) ? req.account : colleagues.find((c) => c.id == req.user.id);
  if (!target) return fail(res, 404, "یافت نشد");
  target.ics_token = crypto.randomBytes(18).toString("base64url");
  saveDatabase();
  const url = `${baseUrl(req)}/ics/${target.ics_token}.ics`;
  res.json({ status: "success", message: "لینک جدید ساخته شد؛ لینک قبلی دیگر کار نمی‌کند", url, webcal: url.replace(/^https?:/, "webcal:") });
});

// ───────────────────────────── Monthly client report ─────────────────────────────

function reportOrgId(req: any) {
  if (isClient(req)) return clientOrgId(req);
  if (!hasPermission(req.user, ["reports", "client-portal", "organizations", "contracts"])) return null;
  return toInt(req.query.org_id ?? req.body.org_id);
}

function pickMonth(src: any) {
  const [cy, cm] = todayJalali().split("/").map(Number);
  const year = toInt(src.year) || cy;
  const month = toInt(src.month) || cm;
  return { year, month: month >= 1 && month <= 12 ? month : cm };
}

function nextMonthOf(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

const key = (y: number, m: number) => `${y}/${String(m).padStart(2, "0")}`;

export function monthlyReport(org: any, year: number, month: number, forClient: boolean) {
  const prefix = key(year, month);
  const next = nextMonthOf(year, month);
  const nextPrefix = key(next.year, next.month);
  const ofOrg = contents.filter((c) => c.org_id == org.id && c.status !== "archived");
  const inMonth = ofOrg.filter((c) => normalizeJalaliDate(c.publish_date).startsWith(prefix));
  const delivered = inMonth.filter((c) => DELIVERED_STATUSES.includes(c.status));
  const metrics: Record<string, any> = {};
  const totals = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 };
  for (const c of delivered) {
    for (const [platform, m] of Object.entries<any>(c.platform_metrics || {})) {
      const row = (metrics[platform] = metrics[platform] || { platform, posts: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 });
      row.posts++;
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
        const v = Number(m?.[k]) || 0;
        row[k] += v;
        totals[k] += v;
      }
    }
  }
  const monthInvoices = invoices
    .filter((i) => i.org_id == org.id && docType(i) === "invoice" && i.status !== "draft" && normalizeJalaliDate(i.issue_date).startsWith(prefix))
    .map((i) => ({ id: i.id, invoice_number: i.invoice_number, total: toNumber(i.total), paid_amount: toNumber(i.paid_amount), status: i.status }));
  const notes = org.monthly_reports?.[prefix] || {};
  const item = (c: any) => ({
    id: c.id,
    title: c.title,
    content_type: c.content_type,
    status: c.status,
    publish_date: c.publish_date,
    publish_platforms: c.publish_platforms || [],
    metrics: c.platform_metrics || {},
    revision_rounds: (c.review_versions || []).filter((v: any) => v.client?.status === "rejected").length,
  });
  return {
    org: { id: org.id, org_name: org.org_name, logo_url: org.logo_url || "", color: org.color || "" },
    year,
    month,
    period: prefix,
    usage: contractUsage(org, year, month),
    delivered: delivered.map(item),
    not_delivered: inMonth.filter((c) => !DELIVERED_STATUSES.includes(c.status)).map(item),
    next_month: ofOrg.filter((c) => normalizeJalaliDate(c.publish_date).startsWith(nextPrefix)).map(item),
    metrics: Object.values(metrics),
    totals,
    invoices: forClient ? monthInvoices.map(({ id, invoice_number, total, status }) => ({ id, invoice_number, total, status })) : monthInvoices,
    summary: notes.summary || "",
    next_plan: notes.next_plan || "",
    sent_at: notes.sent_at || null,
  };
}

subRouter.get("/monthly_report_data", (req: any, res) => {
  const orgId = reportOrgId(req);
  const org = organizations.find((o) => o.id == orgId);
  if (!org) return fail(res, isClient(req) || orgId ? 404 : 403, "سازمان یافت نشد");
  const { year, month } = pickMonth(req.query);
  res.json({ status: "success", data: monthlyReport(org, year, month, isClient(req)) });
});

subRouter.post("/monthly_report", checkPermission(["reports", "client-portal", "organizations", "contracts"]), (req: any, res) => {
  const org = organizations.find((o) => o.id == req.body.org_id);
  if (!org) return fail(res, 404, "سازمان یافت نشد");
  const { year, month } = pickMonth(req.body);
  const k = key(year, month);
  org.monthly_reports = org.monthly_reports || {};
  const entry = (org.monthly_reports[k] = org.monthly_reports[k] || {});
  if (req.body.summary !== undefined) entry.summary = text(req.body.summary, 10000);
  if (req.body.next_plan !== undefined) entry.next_plan = text(req.body.next_plan, 10000);
  if (req.body.action === "send") {
    entry.sent_at = new Date().toISOString();
    sendMonthlyReportNotice(org, year, month);
  }
  saveDatabase();
  res.json({ status: "success", message: req.body.action === "send" ? "گزارش برای کارفرما ارسال شد" : "ذخیره شد" });
});

export function sendMonthlyReportNotice(org: any, year: number, month: number) {
  addNotification(
    "گزارش ماهانه آماده است",
    `گزارش عملکرد ماه ${key(year, month)} برند ${org.org_name} آماده مشاهده و دریافت (PDF) است.`,
    "client",
    org.id,
    `/monthly-report?year=${year}&month=${month}`,
    "monthly_report",
    org.id,
  );
}

/** On the first days of a month, tells brands with a contract that last month's report is ready. */
export function autoSendMonthlyReports(today = todayJalali()) {
  const [y, m, d] = today.split("/").map(Number);
  if (d > 3) return false;
  const prev = m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
  const k = key(prev.year, prev.month);
  let changed = false;
  for (const org of organizations) {
    if (!org.contract || org.is_active === 0) continue;
    org.monthly_reports = org.monthly_reports || {};
    const entry = (org.monthly_reports[k] = org.monthly_reports[k] || {});
    if (entry.sent_at || entry.auto_sent) continue;
    entry.auto_sent = true;
    entry.sent_at = new Date().toISOString();
    sendMonthlyReportNotice(org, prev.year, prev.month);
    changed = true;
  }
  return changed;
}

export default subRouter;
