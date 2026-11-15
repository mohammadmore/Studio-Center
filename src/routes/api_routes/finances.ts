import express from "express";
import { contents, expenses, invoices, organizations, settings } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission, clientOrgId } from "../../middleware/auth.js";
import { hasPermission, stripSecrets } from "../../utils/authUtils.js";
import { moveToRecycleBin } from "../../utils/contentUtils.js";
import { addNotification } from "../../utils/logger.js";
import { nextId, normalizeJalaliDate, toLatinDigits, todayJalali } from "../../utils/helpers.js";

export function priceOf(type: string) {
  const list = Array.isArray(settings.content_type) ? settings.content_type : [];
  const setting = list.find((t: any) => t.setting_key === type);
  return setting ? Number(setting.price) || 0 : 0;
}

export function toNumber(value: unknown) {
  const n = parseFloat(toLatinDigits(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const INVOICE_STATUSES = ["draft", "issued", "paid", "cancelled"];
const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "converted"];

export function docType(inv: any) {
  return inv?.doc_type === "quote" ? "quote" : "invoice";
}

/** Creates the invoice that follows an accepted quote. */
export function convertQuote(quote: any, actor: string) {
  const id = nextId(invoices);
  const inv = {
    ...JSON.parse(JSON.stringify(quote)),
    id,
    invoice_number: 1e3 + id,
    doc_type: "invoice",
    status: "issued",
    quote_id: quote.id,
    issue_date: todayJalali(),
    paid_amount: 0,
    created_at: new Date().toISOString(),
    created_by: actor,
  };
  delete inv.client_decision;
  // The quote's "sent" time must not carry over: the invoice reaches the client only when sent.
  delete inv.sent_at;
  delete inv.versions;
  delete inv.updated_at;
  delete inv.updated_by;
  inv.version = 1;
  invoices.push(inv);
  quote.status = "converted";
  quote.invoice_id = id;
  return inv;
}

/** What the client portal may show: quotes once sent, invoices only after "send". */
export function visibleToClient(inv: any) {
  if (!inv) return false;
  return docType(inv) === "quote" ? inv.status !== "draft" : !!inv.sent_at;
}

const PRINT_FLAGS = ["show_logo", "show_platform", "show_notes", "show_payment", "show_signature", "show_words", "show_due", "show_page_numbers"];

/** Per-invoice print choices (theme, paper, custom title and which parts to show). */
export function cleanPrintOptions(v: any) {
  const o: Record<string, any> = {};
  if (!v || typeof v !== "object") return o;
  if (v.theme === "glass" || v.theme === "plain") o.theme = v.theme;
  if (v.paper === "A4" || v.paper === "A5") o.paper = v.paper;
  if (typeof v.title === "string") o.title = v.title.trim().slice(0, 80);
  for (const k of PRINT_FLAGS) if (typeof v[k] === "boolean") o[k] = v[k];
  return o;
}

/** The parts of an invoice that make up one "version" of it. */
const VERSION_FIELDS = ["org_id", "issue_date", "due_date", "status", "items", "subtotal", "tax", "discount", "total", "notes", "paid_amount", "doc_type", "currency", "free", "bank_account_id"];
export function invoiceSnapshot(inv: any) {
  const s: Record<string, any> = {};
  for (const k of VERSION_FIELDS) if (inv[k] !== undefined) s[k] = inv[k];
  return JSON.parse(JSON.stringify(s));
}
const MAX_VERSIONS = 50;
const cleanAccountId = (v: unknown) => (typeof v === "string" ? v.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) : "");

const subRouter = express.Router();

subRouter.get(
  "/get_finance_report",
  checkPermission("finance"),
  (req, res) => {
    let total_revenue = 0;
    contents.forEach((c) => {
      const comps = c.components_count || {};
      const compKeys = Object.keys(comps);
      if (compKeys.length > 0) {
        compKeys.forEach((k) => {
          const count = Math.max(0, parseInt(comps[k]) || 0);
          if (count > 0) {
            total_revenue += priceOf(k) * count;
          }
        });
      }
    });
    const total_expenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const net_profit = total_revenue - total_expenses;
    res.json({
      status: "success",
      data: { total_revenue, total_expenses, net_profit, expenses },
      recent_expenses: expenses,
    });
  },
);

subRouter.post("/save_expense", checkPermission("finance"), (req, res) => {
  const { description, project_name, amount, date } = req.body;
  const value = toNumber(amount);
  if (value <= 0) {
    return res.status(400).json({ status: "error", message: "مبلغ هزینه نامعتبر است" });
  }
  expenses.push({
    id: nextId(expenses),
    description: description || "هزینه تولید محتوا",
    project_name: project_name || "بدون پروژه",
    amount: value,
    date: normalizeJalaliDate(date) || todayJalali(),
  });
  saveDatabase();
  res.json({ status: "success", message: "هزینه ثبت شد" });
});

subRouter.get("/invoices", checkPermission("invoice"), (req, res) => {
  res.json({ status: "success", data: invoices });
});

subRouter.post("/invoices", checkPermission("invoice"), (req, res) => {
  const {
    action,
    id,
    org_id,
    issue_date,
    due_date,
    status,
    items,
    subtotal,
    tax,
    discount,
    total,
    notes,
    paid_amount,
  } = req.body;
  const existing = id ? invoices.find((i) => i.id == id) : null;
  const kind = req.body.doc_type === "quote" || (!req.body.doc_type && docType(existing) === "quote") ? "quote" : "invoice";
  const allowed = kind === "quote" ? QUOTE_STATUSES : INVOICE_STATUSES;
  if (status !== undefined && status !== "" && !allowed.includes(status)) {
    return res.status(400).json({ status: "error", message: "وضعیت سند نامعتبر است" });
  }
  if (action === "save") {
    if (org_id && !organizations.some((o) => o.id == org_id)) {
      return res.status(400).json({ status: "error", message: "سازمان یافت نشد" });
    }
    if (items !== undefined && !Array.isArray(items)) {
      return res.status(400).json({ status: "error", message: "اقلام فاکتور نامعتبر است" });
    }
    if (id) {
      const inv2 = invoices.find((i) => i.id == id);
      if (inv2 && req.body.as_new) {
        // "Issue as a new invoice": the original stays as it is; the copy gets its own number.
        return createInvoice(inv2);
      }
      if (inv2) {
        const before = invoiceSnapshot(inv2);
        inv2.org_id = org_id;
        inv2.issue_date = issue_date;
        inv2.due_date = normalizeJalaliDate(due_date) || due_date;
        inv2.status = status || inv2.status;
        inv2.items = items;
        inv2.subtotal = subtotal;
        inv2.tax = tax;
        inv2.discount = discount;
        inv2.total = total;
        inv2.notes = notes;
        inv2.paid_amount = toNumber(paid_amount);
        inv2.doc_type = kind;
        if (req.body.currency === "rial" || req.body.currency === "toman") inv2.currency = req.body.currency;
        if (typeof req.body.free === "boolean") inv2.free = req.body.free;
        if (req.body.print_options !== undefined) inv2.print_options = cleanPrintOptions(req.body.print_options);
        if (req.body.bank_account_id !== undefined) inv2.bank_account_id = cleanAccountId(req.body.bank_account_id);
        // Saving over the same invoice keeps the previous content as an earlier version.
        const changed = JSON.stringify(before) !== JSON.stringify(invoiceSnapshot(inv2));
        if (changed) {
          inv2.versions = [
            ...(Array.isArray(inv2.versions) ? inv2.versions : []),
            { no: inv2.version || 1, saved_at: inv2.updated_at || inv2.created_at || null, saved_by: inv2.updated_by || inv2.created_by || "", data: before },
          ].slice(-MAX_VERSIONS);
          inv2.version = (inv2.version || 1) + 1;
          inv2.updated_at = new Date().toISOString();
          inv2.updated_by = (req as any).user?.full_name || (req as any).user?.username || "";
        }
        saveDatabase();
        return res.json({
          status: "success",
          message: changed ? `فاکتور ذخیره شد (نسخه‌ی ${(inv2.version || 1).toLocaleString("fa-IR", { useGrouping: false })})` : "تغییری برای ذخیره نبود",
          data: inv2,
        });
      }
    }
    return createInvoice(null);
  }
  function createInvoice(source: any) {
    const newId =
      nextId(invoices);
    const inv: any = {
      id: newId,
      invoice_number: 1e3 + newId,
      org_id,
      issue_date,
      due_date: normalizeJalaliDate(due_date) || due_date,
      status: status || "draft",
      items,
      subtotal,
      tax,
      discount,
      total,
      notes,
      paid_amount: toNumber(paid_amount),
      doc_type: kind,
      currency: req.body.currency === "rial" ? "rial" : "toman",
      free: req.body.free === true || !!source?.free,
      print_options: req.body.print_options !== undefined ? cleanPrintOptions(req.body.print_options) : cleanPrintOptions(source?.print_options),
      bank_account_id: cleanAccountId(req.body.bank_account_id ?? source?.bank_account_id),
      version: 1,
      created_at: new Date().toISOString(),
      created_by: (req as any).user?.full_name || (req as any).user?.username || "",
    };
    if (source) inv.based_on = source.id;
    invoices.push(inv);
    saveDatabase();
    return res.json({
      status: "success",
      message: source ? `${kind === "quote" ? "پیش‌فاکتور" : "فاکتور"} جدید با شماره ${inv.invoice_number.toLocaleString("fa-IR", { useGrouping: false })} صادر شد` : "فاکتور ذخیره شد",
      data: inv,
    });
  }

  if (action === "delete") {
    const idx = invoices.findIndex((i) => i.id == id);
    if (idx === -1) return res.status(404).json({ status: "error", message: "فاکتور یافت نشد" });
    const inv = invoices[idx];
    const binId = moveToRecycleBin("invoices", inv, `${docType(inv) === "quote" ? "پیش‌فاکتور" : "فاکتور"} ${inv.invoice_number}`, (req as any).user);
    invoices.splice(idx, 1);
    saveDatabase();
    return res.json({ status: "success", message: "فاکتور به سطل زباله منتقل شد", bin_id: binId });
  }
  if (action === "update_status") {
    const inv = invoices.find((i) => i.id == id);
    if (inv) {
      inv.status = status;
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "وضعیت تغییر کرد",
      });
    }
  }
  if (action === "send_quote") {
    const quote = invoices.find((i) => i.id == id && docType(i) === "quote");
    if (!quote) return res.status(404).json({ status: "error", message: "پیش‌فاکتور یافت نشد" });
    if (!quote.org_id) return res.status(400).json({ status: "error", message: "کارفرمای پیش‌فاکتور مشخص نیست" });
    quote.status = "sent";
    quote.sent_at = new Date().toISOString();
    addNotification(
      "پیش‌فاکتور جدید",
      `پیش‌فاکتور شماره ${quote.invoice_number} به مبلغ ${toNumber(quote.total).toLocaleString("fa-IR")} تومان برای بررسی و تایید شما ارسال شد.`,
      "client",
      quote.org_id,
      "/client-quotes",
      "quote_sent",
      quote.id,
    );
    saveDatabase();
    return res.json({ status: "success", message: "پیش‌فاکتور برای کارفرما ارسال شد" });
  }
  if (action === "send_invoice") {
    const inv = invoices.find((i) => i.id == id && docType(i) === "invoice");
    if (!inv) return res.status(404).json({ status: "error", message: "فاکتور یافت نشد" });
    if (!inv.org_id) return res.status(400).json({ status: "error", message: "کارفرمای فاکتور مشخص نیست" });
    if (inv.status === "cancelled") return res.status(400).json({ status: "error", message: "فاکتور لغو شده را نمی‌توان ارسال کرد" });
    if (inv.status === "draft") inv.status = "issued";
    const again = !!inv.sent_at;
    inv.sent_at = new Date().toISOString();
    addNotification(
      again ? "فاکتور به‌روز شد" : "فاکتور جدید",
      `فاکتور شماره ${inv.invoice_number} به مبلغ ${toNumber(inv.total).toLocaleString("fa-IR")} ${inv.currency === "rial" ? "ریال" : "تومان"} برای شما ارسال شد.`,
      "client",
      inv.org_id,
      "/client-quotes",
      "invoice_sent",
      inv.id,
    );
    saveDatabase();
    return res.json({ status: "success", message: again ? "فاکتور دوباره برای کارفرما ارسال شد" : "فاکتور برای کارفرما ارسال شد", data: inv });
  }
  if (action === "set_bank_account") {
    const inv = invoices.find((i) => i.id == id);
    if (!inv) return res.status(404).json({ status: "error", message: "سند یافت نشد" });
    inv.bank_account_id = cleanAccountId(req.body.bank_account_id);
    saveDatabase();
    return res.json({ status: "success", message: "حساب بانکی این سند تغییر کرد", data: { bank_account_id: inv.bank_account_id } });
  }
  if (action === "save_print_options") {
    const inv = invoices.find((i) => i.id == id);
    if (!inv) return res.status(404).json({ status: "error", message: "سند یافت نشد" });
    inv.print_options = cleanPrintOptions(req.body.print_options);
    saveDatabase();
    return res.json({ status: "success", message: "تنظیمات چاپ این سند ذخیره شد", data: inv.print_options });
  }
  if (action === "convert_quote") {
    const quote = invoices.find((i) => i.id == id && docType(i) === "quote");
    if (!quote) return res.status(404).json({ status: "error", message: "پیش‌فاکتور یافت نشد" });
    if (quote.status === "converted") return res.status(400).json({ status: "error", message: "این پیش‌فاکتور قبلا به فاکتور تبدیل شده است" });
    const inv = convertQuote(quote, (req as any).user?.username);
    saveDatabase();
    return res.json({ status: "success", message: "فاکتور صادر شد", data: inv });
  }
  if (action === "add_payment") {
    const inv = invoices.find((i) => i.id == id);
    if (inv) {
      const amount = toNumber(req.body.amount);
      if (amount <= 0) {
        return res.status(400).json({ status: "error", message: "مبلغ پرداخت نامعتبر است" });
      }
      inv.paid_amount = toNumber(inv.paid_amount) + amount;
      if (inv.paid_amount >= toNumber(inv.total) && toNumber(inv.total) > 0) inv.status = "paid";
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "پرداخت ثبت شد",
      });
    }
  }
  return res
    .status(404)
    .json({
      status: "error",
      message:
        "عملیات نامعتبر",
    });
});

subRouter.get(
  "/generate_invoice",
  checkPermission("invoice"),
  (req, res) => {
    const org_id = req.query.org_id;
    const invoice_id = req.query.invoice_id;
    if (invoice_id) {
      const inv = invoices.find((i) => i.id == invoice_id);
      if (!inv)
        return res.json({
          status: "error",
          message:
            "فاکتور یافت نشد",
        });
      const org2 = organizations.find((o) => o.id == inv.org_id);
      return res.json({
        status: "success",
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        date: inv.issue_date,
        due_date: inv.due_date,
        status_name: inv.status,
        doc_type: docType(inv),
        organization: org2 ? stripSecrets(org2) : null,
        items: inv.items,
        subtotal: inv.subtotal,
        tax: inv.tax,
        discount: inv.discount,
        total_amount: inv.total,
        paid_amount: inv.paid_amount,
        notes: inv.notes,
        currency: inv.currency === "rial" ? "rial" : "toman",
        print_options: inv.print_options || {},
        sent_at: inv.sent_at || null,
        free: !!inv.free,
        bank_account_id: inv.bank_account_id || "",
        version: inv.version || 1,
        updated_at: inv.updated_at || inv.created_at || null,
        updated_by: inv.updated_by || inv.created_by || "",
        based_on: inv.based_on || null,
        versions: (Array.isArray(inv.versions) ? inv.versions : []).map((v: any) => ({ no: v.no, saved_at: v.saved_at, saved_by: v.saved_by, total: toNumber(v.data?.total), items: Array.isArray(v.data?.items) ? v.data.items.length : 0 })),
      });
    }
    if (!org_id)
      return res.json({
        status: "error",
        message: "org_id is missing",
        items: [],
      });
    const org = organizations.find((o) => o.id == org_id);
    if (!org)
      return res.json({
        status: "error",
        message:
          "سازمان یافت نشد",
      });
    const col_id = req.query.col_id;
    const status = req.query.status;
    const platformFilter = req.query.platform;
    const start_date = normalizeJalaliDate(req.query.start_date);
    const end_date = normalizeJalaliDate(req.query.end_date);
    const orgContents = contents.filter((c) => {
      if (c.org_id != org_id) return false;
      if (col_id && c.collection_id != col_id) return false;
      if (status && c.status != status) return false;
      if (platformFilter) {
        if (
          platformFilter ===
          "بدون پلتفرم"
        ) {
          if (c.publish_platforms && c.publish_platforms.length > 0)
            return false;
        } else {
          if (
            !c.publish_platforms ||
            !c.publish_platforms.includes(platformFilter)
          )
            return false;
        }
      }
      const date = normalizeJalaliDate(c.publish_date);
      if (start_date && date && date < start_date) return false;
      if (end_date && date && date > end_date) return false;
      return true;
    });
    const items: any[] = [];
    let total_amount = 0;
    orgContents.forEach((c) => {
      let platform = c.publish_platforms
        ? Array.isArray(c.publish_platforms)
          ? c.publish_platforms.join("، ")
          : c.publish_platforms
        : "بدون پلتفرم";
      let content_type =
        c.content_type || "نامشخص";
      const comps = c.components_count || {};
      const compKeys = Object.keys(comps);
      if (compKeys.length > 0) {
        compKeys.forEach((k) => {
          const count = Math.max(0, parseInt(comps[k]) || 0);
          if (count > 0) {
            const price = priceOf(k);
            const row_total = price * count;
            total_amount += row_total;
            items.push({
              type: `${c.title} (بخش: ${k})`,
              platform,
              qty: count,
              unit_price: price,
              row_total,
            });
          }
        });
      } else {
        const price = priceOf(content_type);
        total_amount += price;
        items.push({
          type: `${c.title} (${content_type})`,
          platform,
          qty: 1,
          unit_price: price,
          row_total: price,
        });
      }
    });
    res.json({
      status: "success",
      invoice_number: "---",
      date: todayJalali(),
      organization: stripSecrets(org),
      items,
      subtotal: total_amount,
      tax: 0,
      discount: 0,
      total_amount,
      paid_amount: 0,
    });
  },
);

/**
 * Item descriptions used on earlier invoices, for suggestions while typing: each with how
 * often it was used and its latest unit price. Items of free invoices (events, promotional
 * gifts...) come first.
 */
subRouter.get("/invoice_item_suggestions", checkPermission("invoice"), (req, res) => {
  const map = new Map<string, any>();
  for (const inv of invoices) {
    const at = String(inv.created_at || "");
    for (const it of Array.isArray(inv.items) ? inv.items : []) {
      const text = String(it?.type ?? it?.title ?? "").trim();
      if (!text || text === "آیتم سفارشی جدید" || text.length > 300) continue;
      const key = text.replace(/\s+/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();
      const e = map.get(key) || { type: text, count: 0, free: false, at: "", unit_price: 0, currency: "toman" };
      e.count++;
      if (inv.free) e.free = true;
      if (at >= e.at) {
        e.at = at;
        e.type = text;
        e.unit_price = toNumber(it.unit_price);
        e.currency = inv.currency === "rial" ? "rial" : "toman";
      }
      map.set(key, e);
    }
  }
  const data = [...map.values()]
    .sort((a, b) => Number(b.free) - Number(a.free) || b.count - a.count || (b.at > a.at ? 1 : b.at < a.at ? -1 : 0))
    .slice(0, 1500)
    .map(({ type, count, unit_price, currency, free }) => ({ type, count, unit_price, currency, free }));
  res.json({ status: "success", data });
});

/** Earlier versions of an invoice (each saved over the same invoice), newest first. */
subRouter.get("/invoice_versions", checkPermission("invoice"), (req, res) => {
  const inv = invoices.find((i) => i.id == req.query.id);
  if (!inv) return res.status(404).json({ status: "error", message: "سند یافت نشد" });
  res.json({
    status: "success",
    current: { no: inv.version || 1, saved_at: inv.updated_at || inv.created_at || null, saved_by: inv.updated_by || inv.created_by || "", data: invoiceSnapshot(inv) },
    data: (Array.isArray(inv.versions) ? inv.versions : []).slice().reverse(),
  });
});

/** Everything the printable invoice needs. Clients get only their own, sent documents. */
subRouter.get("/invoice_print_data", (req: any, res) => {
  const inv = invoices.find((i) => i.id == req.query.id);
  const user = req.user;
  if (!user) return res.status(401).json({ status: "error", message: "ابتدا وارد شوید" });
  if (user.role_id === "client") {
    if (!inv || inv.org_id != clientOrgId(req) || !visibleToClient(inv)) return res.status(404).json({ status: "error", message: "سند یافت نشد" });
  } else if (!hasPermission(user, "invoice")) {
    return res.status(403).json({ status: "error", message: "عدم دسترسی" });
  } else if (!inv) {
    return res.status(404).json({ status: "error", message: "سند یافت نشد" });
  }
  // Staff may open an earlier version (read-only); clients always get the latest one.
  let src: any = inv;
  let viewing: any = null;
  if (req.query.version && user.role_id !== "client") {
    const v = (Array.isArray(inv.versions) ? inv.versions : []).find((x: any) => String(x.no) === String(req.query.version));
    if (!v) return res.status(404).json({ status: "error", message: "این نسخه پیدا نشد" });
    src = { ...inv, ...v.data };
    viewing = { no: v.no, saved_at: v.saved_at, saved_by: v.saved_by, latest: inv.version || 1 };
  }
  const org = organizations.find((o) => o.id == src.org_id);
  res.json({
    status: "success",
    viewing_version: viewing,
    data: {
      id: inv.id,
      invoice_number: inv.invoice_number,
      doc_type: docType(src),
      status: src.status,
      issue_date: src.issue_date || "",
      due_date: src.due_date || "",
      items: Array.isArray(src.items) ? src.items : [],
      subtotal: toNumber(src.subtotal),
      tax: toNumber(src.tax),
      discount: toNumber(src.discount),
      total: toNumber(src.total),
      paid_amount: toNumber(src.paid_amount),
      notes: src.notes || "",
      currency: src.currency === "rial" ? "rial" : "toman",
      print_options: src.print_options || {},
      sent_at: src.sent_at || null,
      bank_account_id: src.bank_account_id || "",
      version: inv.version || 1,
    },
    organization: org
      ? { id: org.id, org_name: org.org_name, contact_name: org.contact_name || "", phone: org.phone_number || "", logo_url: org.logo_url || "", color: org.color || "" }
      : null,
  });
});

export default subRouter;
