import { body, validationResult } from "express-validator";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import * as jalaali from "jalaali-js";
import bcrypt from "bcrypt";
import xlsx from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { 
  roles, colleagues, organizations, collections, contents, settings, leaves, audit_logs, 
  recycle_bin, batch_operations, notifications, tokens, templatesData, 
  contentTemplates, templateSuggestions, expenses, invoices, mediaAssets, 
  smartEventsBank, clientSelections 
} from "../../store/state.js";
import { addDaysToJalali, toPersianDigits } from "../../utils/helpers.js";
import { getRoleInfoForUser, getPermissionCategories } from "../../utils/authUtils.js";
import { addAuditLog, logContentActivity, addNotification } from "../../utils/logger.js";
import { apiAuthGuard, checkPermission } from "../../middleware/auth.js";
import { saveDatabase } from "../../store/db.js"; // Assuming saveDatabase will be here, or we can just import it from server.js for now.

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// We need to handle `__dirname` in ESM if used, but let's just dump the code first.
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
            const typeSetting = settings.content_type.find(
              (t) => t.setting_key === k,
            );
            const price = typeSetting ? typeSetting.price || 0 : 0;
            total_revenue += price * count;
          }
        });
      }
    });
    const total_expenses = expenses.reduce((sum, e) => sum + e.amount, 0);
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
  const newExp = {
    id: expenses.length > 0 ? Math.max(...expenses.map((x) => x.id)) + 1 : 1,
    description:
      description ||
      "هزینه تولید محتوا",
    project_name:
      project_name || "بدون پروژه",
    amount: amount ? parseInt(amount) : 5e5,
    date:
      typeof date !== "undefined"
        ? date
        : new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
  };
  expenses.push(newExp);
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message: "هزینه ثبت شد",
  });
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
  if (action === "save") {
    if (id) {
      const inv2 = invoices.find((i) => i.id == id);
      if (inv2) {
        inv2.org_id = org_id;
        inv2.issue_date = issue_date;
        inv2.due_date = due_date;
        inv2.status = status || inv2.status;
        inv2.items = items;
        inv2.subtotal = subtotal;
        inv2.tax = tax;
        inv2.discount = discount;
        inv2.total = total;
        inv2.notes = notes;
        inv2.paid_amount = paid_amount;
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
      invoices.length > 0 ? Math.max(...invoices.map((i) => i.id)) + 1 : 1;
    const inv = {
      id: newId,
      invoice_number: 1e3 + newId,
      org_id,
      issue_date,
      due_date,
      status: status || "draft",
      items,
      subtotal,
      tax,
      discount,
      total,
      notes,
      paid_amount: paid_amount || 0,
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
      inv.paid_amount =
        (inv.paid_amount || 0) + parseFloat(req.body.amount || 0);
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
        organization: org2,
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
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;
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
      if (start_date && c.publish_date && c.publish_date < start_date)
        return false;
      if (end_date && c.publish_date && c.publish_date > end_date) return false;
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
            const typeSetting = settings.content_type.find(
              (t) => t.setting_key === k,
            );
            const price = typeSetting ? typeSetting.price || 0 : 0;
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
        const typeSetting = settings.content_type.find(
          (t) => t.setting_key === content_type,
        );
        const price = typeSetting ? typeSetting.price || 0 : 0;
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
      date: new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
      organization: org,
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
