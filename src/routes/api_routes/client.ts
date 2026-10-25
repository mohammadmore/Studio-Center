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

subRouter.post("/save_onboarding", (req, res) => {
  const { org_name, industry, rep_name, rep_phone, logo_url, password } =
    req.body;
  if (password && password.length < 6) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "رمز عبور باید حداقل ۶ کاراکتر باشد.",
      });
  }
  const newOrg = {
    id:
      organizations.length > 0
        ? Math.max(...organizations.map((x) => x.id)) + 1
        : 1,
    org_name:
      org_name ||
      "سازمان جدید",
    industry:
      industry ||
      "پزشکی و زیبایی",
    logo_url:
      logo_url ||
      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=200",
    is_active: 1,
  };
  organizations.push(newOrg);
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "درخواست همکاری با موفقیت ثبت شد!",
  });
});

subRouter.get("/get_client_data", (req, res) => {
  const org_id = parseInt(req.query.org_id as string);
  if (!org_id) return res.json({ status: "success", pending: [] });
  const pending_contents = contents.filter((c) => c.org_id == org_id).reverse();
  res.json({ status: "success", pending: pending_contents });
});

subRouter.post("/client_review", (req, res) => {
  const { content_id, action, comment } = req.body;
  const item = contents.find((c) => c.id === parseInt(content_id));
  if (item) {
    const session2 = req.session;
    if (
      session2 &&
      session2.user &&
      session2.user?.role_id === "client" &&
      item.org_id != session2.user.id
    ) {
      return res
        .status(403)
        .json({
          status: "error",
          message:
            "شما مجاز به دسترسی به محتوای این سازمان نیستید",
        });
    }
    item.status =
      action === "approve" ? "approved_by_client" : "needs_revision";
    const org = organizations.find((o) => o.id == item.org_id);
    const actionFa =
      action === "approve"
        ? "تایید شد"
        : "رد شد (نیازمند اصلاح)";
    if (comment) item.client_comment = comment;
    addNotification("نتیجه بررسی محتوا", `محتوای "${item.title}" توسط نماینده ${org ? org.org_name : ""} ${actionFa}.${comment ? " توضیحات: " + comment : ""}`, "admin", "");
    if (item.assigned_colleagues && item.assigned_colleagues.length > 0) {
      item.assigned_colleagues.forEach((colId) => {
        addNotification("بررسی محتوا توسط کارفرما", `محتوای "${item.title}" ${actionFa}.${comment ? " توضیحات: " + comment : ""}`, "colleague", "");
      });
    }
    saveDatabase().catch(console.error);
    res.json({
      status: "success",
      message:
        "وضعیت آپدیت شد",
    });
  } else {
    res.json({
      status: "error",
      message:
        "محتوا یافت نشد",
    });
  }
});

export default subRouter;
