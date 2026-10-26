import express from "express";
import { contents, invoices, organizations } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission, clientOrgId, isClient } from "../../middleware/auth.js";
import { hasPermission } from "../../utils/authUtils.js";
import { addNotification } from "../../utils/logger.js";
import { nextId, normalizeJalaliDate, todayJalali, toInt } from "../../utils/helpers.js";
import { DELIVERED_STATUSES } from "../../utils/workflowUtils.js";
import { convertQuote, docType, priceOf, toNumber } from "./finances.js";

/** Monthly packages per brand ("12 posts, 8 stories and 4 reels a month") and their usage. */
const subRouter = express.Router();

const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function fail(res: any, code: number, message: string) {
  return res.status(code).json({ status: "error", message });
}

function cleanContract(input: any) {
  const quotas = Array.isArray(input?.quotas)
    ? input.quotas
        .map((q: any) => ({
          content_type: text(q?.content_type, 100),
          count: Math.max(0, toInt(q?.count) || 0),
          unit_price: Math.max(0, toNumber(q?.unit_price)),
        }))
        .filter((q: any) => q.content_type && q.count > 0)
    : [];
  return {
    title: text(input?.title, 200) || "پکیج ماهانه",
    start_date: normalizeJalaliDate(input?.start_date),
    end_date: normalizeJalaliDate(input?.end_date),
    monthly_fee: Math.max(0, toNumber(input?.monthly_fee)),
    revision_limit: Math.max(0, toInt(input?.revision_limit) || 0),
    quotas,
    charge_overage: input?.charge_overage !== false && input?.charge_overage !== "false",
    credit_shortfall: input?.credit_shortfall === true || input?.credit_shortfall === "true",
    notes: text(input?.notes),
    updated_at: new Date().toISOString(),
  };
}

function monthRange(year: number, month: number) {
  const m = String(month).padStart(2, "0");
  return { from: `${year}/${m}/01`, to: `${year}/${m}/31` };
}

function currentMonth() {
  const [y, m] = todayJalali().split("/").map(Number);
  return { year: y, month: m };
}

/** Promised vs. delivered per content type for one month. */
export function contractUsage(org: any, year: number, month: number) {
  const contract = org?.contract;
  const { from, to } = monthRange(year, month);
  const inMonth = contents.filter((c) => {
    if (c.org_id != org.id || c.count_in_stats === false) return false;
    const d = normalizeJalaliDate(c.publish_date);
    return d && d >= from && d <= to;
  });
  const types = new Map<string, any>();
  const row = (type: string) => {
    if (!types.has(type)) types.set(type, { content_type: type, quota: 0, unit_price: 0, delivered: 0, planned: 0 });
    return types.get(type);
  };
  for (const q of contract?.quotas || []) {
    const r = row(q.content_type);
    r.quota += q.count;
    r.unit_price = q.unit_price || priceOf(q.content_type);
  }
  for (const c of inMonth) {
    const r = row(c.content_type || "نامشخص");
    if (DELIVERED_STATUSES.includes(c.status)) r.delivered++;
    else if (c.status !== "archived") r.planned++;
    if (!r.unit_price) r.unit_price = priceOf(r.content_type);
  }
  const rows = [...types.values()].map((r) => ({
    ...r,
    remaining: Math.max(0, r.quota - r.delivered),
    overage: Math.max(0, r.delivered - r.quota),
    shortfall: Math.max(0, r.quota - r.delivered),
    progress: r.quota ? Math.round((r.delivered / r.quota) * 100) : null,
  }));
  const totals = rows.reduce(
    (t, r) => ({
      quota: t.quota + r.quota,
      delivered: t.delivered + r.delivered,
      planned: t.planned + r.planned,
      overage_amount: t.overage_amount + r.overage * r.unit_price,
      shortfall_amount: t.shortfall_amount + r.shortfall * r.unit_price,
    }),
    { quota: 0, delivered: 0, planned: 0, overage_amount: 0, shortfall_amount: 0 },
  );
  const active =
    !!contract &&
    (!contract.start_date || contract.start_date <= to) &&
    (!contract.end_date || contract.end_date >= from);
  return { org_id: org.id, org_name: org.org_name, year, month, contract: contract || null, active, rows, totals };
}

subRouter.get("/contracts", checkPermission("contracts"), (req, res) => {
  const { year, month } = { ...currentMonth(), ...pickMonth(req.query) };
  const data = organizations
    .filter((o) => o.is_active !== 0)
    .map((o) => contractUsage(o, year, month));
  res.json({ status: "success", year, month, data });
});

function pickMonth(q: any) {
  const year = toInt(q.year);
  const month = toInt(q.month);
  return year && month && month >= 1 && month <= 12 ? { year, month } : {};
}

subRouter.post("/manage_contract", checkPermission("contracts"), (req, res) => {
  const org = organizations.find((o) => o.id == req.body.org_id);
  if (!org) return fail(res, 404, "سازمان یافت نشد");
  if (req.body.action === "delete") {
    delete org.contract;
  } else {
    org.contract = cleanContract(req.body.contract);
  }
  saveDatabase();
  res.json({ status: "success", message: "قرارداد ذخیره شد", contract: org.contract || null });
});

subRouter.get("/contract_usage", (req: any, res) => {
  const orgId = isClient(req) ? clientOrgId(req) : toInt(req.query.org_id);
  if (!isClient(req) && !hasPermission(req.user, ["contracts", "client-portal", "organizations", "dashboard"])) {
    return fail(res, 403, "عدم دسترسی");
  }
  const org = organizations.find((o) => o.id == orgId);
  if (!org) return fail(res, 404, "سازمان یافت نشد");
  const { year, month } = { ...currentMonth(), ...pickMonth(req.query) };
  const usage = contractUsage(org, year, month);
  if (isClient(req) && usage.contract) {
    // Prices of extra items stay internal; the brand sees counts.
    usage.contract = { ...usage.contract, notes: undefined };
  }
  res.json({ status: "success", data: usage });
});

/** Builds the month's draft invoice (or quote) from the package: fee + extras − shortfall. */
subRouter.post("/contract_invoice", checkPermission(["contracts", "invoice"]), (req: any, res) => {
  const org = organizations.find((o) => o.id == req.body.org_id);
  if (!org) return fail(res, 404, "سازمان یافت نشد");
  if (!org.contract) return fail(res, 400, "برای این برند قراردادی ثبت نشده است");
  const { year, month } = { ...currentMonth(), ...pickMonth(req.body) };
  const usage = contractUsage(org, year, month);
  const c = org.contract;
  const items: any[] = [];
  const label = `${year}/${String(month).padStart(2, "0")}`;
  if (c.monthly_fee) {
    items.push({ type: `${c.title} — ماه ${label}`, platform: "پکیج", qty: 1, unit_price: c.monthly_fee, row_total: c.monthly_fee });
  }
  for (const r of usage.rows) {
    if (c.charge_overage && r.overage > 0) {
      items.push({ type: `مازاد ${r.content_type} (${r.overage} عدد بیش از پکیج)`, platform: "مازاد", qty: r.overage, unit_price: r.unit_price, row_total: r.overage * r.unit_price });
    }
    if (c.credit_shortfall && r.shortfall > 0) {
      items.push({ type: `کسری ${r.content_type} (${r.shortfall} عدد تحویل نشده)`, platform: "کسر از مبلغ", qty: r.shortfall, unit_price: -r.unit_price, row_total: -r.shortfall * r.unit_price });
    }
  }
  if (!items.length) return fail(res, 400, "قلمی برای صدور وجود ندارد");
  const subtotal = items.reduce((s, i) => s + i.row_total, 0);
  const id = nextId(invoices);
  const kind = req.body.doc_type === "quote" ? "quote" : "invoice";
  const inv = {
    id,
    invoice_number: 1e3 + id,
    doc_type: kind,
    org_id: org.id,
    issue_date: todayJalali(),
    due_date: "",
    status: "draft",
    items,
    subtotal,
    tax: 0,
    discount: 0,
    total: subtotal,
    notes: `صادر شده بر اساس قرارداد «${c.title}» برای ماه ${label}`,
    paid_amount: 0,
    contract_month: label,
    created_at: new Date().toISOString(),
  };
  invoices.push(inv);
  saveDatabase();
  res.json({ status: "success", message: kind === "quote" ? "پیش‌فاکتور ساخته شد" : "فاکتور پیش‌نویس ساخته شد", data: inv });
});

// ───────────────────────────── Client side: quotes & invoices ─────────────────────────────

subRouter.get("/client_quotes", (req: any, res) => {
  if (!isClient(req)) return fail(res, 403, "عدم دسترسی");
  const orgId = clientOrgId(req);
  const data = invoices
    .filter((i) => i.org_id == orgId && ((docType(i) === "quote" && i.status !== "draft") || (docType(i) === "invoice" && i.status !== "draft")))
    .map((i) => ({
      id: i.id,
      doc_type: docType(i),
      invoice_number: i.invoice_number,
      issue_date: i.issue_date,
      due_date: i.due_date,
      status: i.status,
      items: i.items,
      subtotal: i.subtotal,
      tax: i.tax,
      discount: i.discount,
      total: i.total,
      paid_amount: i.paid_amount,
      notes: i.notes,
      client_decision: i.client_decision || null,
      invoice_id: i.invoice_id || null,
    }))
    .reverse();
  res.json({ status: "success", data });
});

subRouter.post("/client_quotes", (req: any, res) => {
  if (!isClient(req)) return fail(res, 403, "عدم دسترسی");
  const quote = invoices.find((i) => i.id == req.body.id && i.org_id == clientOrgId(req) && docType(i) === "quote");
  if (!quote) return fail(res, 404, "پیش‌فاکتور یافت نشد");
  if (quote.status !== "sent") return fail(res, 400, "این پیش‌فاکتور در انتظار تصمیم شما نیست");
  const decision = req.body.decision === "accept" ? "accepted" : req.body.decision === "reject" ? "rejected" : "";
  if (!decision) return fail(res, 400, "تصمیم نامعتبر");
  const comment = text(req.body.comment);
  quote.client_decision = { decision, comment, at: new Date().toISOString(), by: req.account?.contact_name || req.account?.org_name };
  quote.status = decision;
  let invoice = null;
  if (decision === "accepted") invoice = convertQuote(quote, "client");
  addNotification(
    decision === "accepted" ? "پیش‌فاکتور تایید شد" : "پیش‌فاکتور رد شد",
    `${req.account?.org_name || "کارفرما"} پیش‌فاکتور ${quote.invoice_number} را ${decision === "accepted" ? `تایید کرد و فاکتور ${invoice?.invoice_number} صادر شد` : "رد کرد"}.${comment ? ` توضیح: ${comment}` : ""}`,
    "admin",
    null,
    "/invoices_list",
    "quote_sent",
    quote.id,
  );
  saveDatabase();
  res.json({
    status: "success",
    message: decision === "accepted" ? "پیش‌فاکتور تایید شد و فاکتور صادر شد" : "پیش‌فاکتور رد شد",
    invoice_id: invoice?.id || null,
  });
});

export default subRouter;
