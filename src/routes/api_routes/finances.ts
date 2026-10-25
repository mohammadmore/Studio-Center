import express from "express";
import { contents, expenses, invoices, organizations, settings } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission } from "../../middleware/auth.js";
import { stripSecrets } from "../../utils/authUtils.js";
import { nextId, normalizeJalaliDate, toLatinDigits, todayJalali } from "../../utils/helpers.js";

function priceOf(type: string) {
  const list = Array.isArray(settings.content_type) ? settings.content_type : [];
  const setting = list.find((t) => t.setting_key === type);
  return setting ? Number(setting.price) || 0 : 0;
}

function toNumber(value: unknown) {
  const n = parseFloat(toLatinDigits(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const INVOICE_STATUSES = ["draft", "issued", "paid", "cancelled"];

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
  if (status !== undefined && status !== "" && !INVOICE_STATUSES.includes(status)) {
    return res.status(400).json({ status: "error", message: "وضعیت فاکتور نامعتبر است" });
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
      if (inv2) {
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
        saveDatabase();
        return res.json({
          status: "success",
          message:
            "فاکتور ویرایش شد",
          data: inv2,
        });
      }
    }
    const newId =
      nextId(invoices);
    const inv = {
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
      created_at: new Date().toISOString(),
    };
    invoices.push(inv);
    saveDatabase();
    return res.json({
      status: "success",
      message:
        "فاکتور ذخیره شد",
      data: inv,
    });
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
        organization: org2 ? stripSecrets(org2) : null,
        items: inv.items,
        subtotal: inv.subtotal,
        tax: inv.tax,
        discount: inv.discount,
        total_amount: inv.total,
        paid_amount: inv.paid_amount,
        notes: inv.notes,
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
    const items = [];
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

export default subRouter;
