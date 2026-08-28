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
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const BLOCKED = ['application/x-msdownload', 'application/x-sh', 'text/x-php', 'application/x-httpd-php', 'application/x-executable'];
    if (BLOCKED.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

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
          "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F6 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F.",
      });
  }
  const newOrg = {
    id:
      organizations.length > 0
        ? organizations.reduce((m, x) => (x.id > m ? x.id : m), 0) + 1
        : 1,
    org_name:
      org_name ||
      "\u0633\u0627\u0632\u0645\u0627\u0646 \u062C\u062F\u06CC\u062F",
    industry:
      industry ||
      "\u067E\u0632\u0634\u06A9\u06CC \u0648 \u0632\u06CC\u0628\u0627\u06CC\u06CC",
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
      "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0647\u0645\u06A9\u0627\u0631\u06CC \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062B\u0628\u062A \u0634\u062F!",
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
            "\u0634\u0645\u0627 \u0645\u062C\u0627\u0632 \u0628\u0647 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0645\u062D\u062A\u0648\u0627\u06CC \u0627\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646 \u0646\u06CC\u0633\u062A\u06CC\u062F",
        });
    }
    item.status =
      action === "approve" ? "approved_by_client" : "needs_revision";
    const org = organizations.find((o) => o.id == item.org_id);
    const actionFa =
      action === "approve"
        ? "\u062A\u0627\u06CC\u06CC\u062F \u0634\u062F"
        : "\u0631\u062F \u0634\u062F (\u0646\u06CC\u0627\u0632\u0645\u0646\u062F \u0627\u0635\u0644\u0627\u062D)";
    if (comment) item.client_comment = comment;
    addNotification("\u0646\u062A\u06CC\u062C\u0647 \u0628\u0631\u0631\u0633\u06CC \u0645\u062D\u062A\u0648\u0627", `\u0645\u062D\u062A\u0648\u0627\u06CC "${item.title}" \u062A\u0648\u0633\u0637 \u0646\u0645\u0627\u06CC\u0646\u062F\u0647 ${org ? org.org_name : ""} ${actionFa}.${comment ? " \u062A\u0648\u0636\u06CC\u062D\u0627\u062A: " + comment : ""}`, "admin", "");
    if (item.assigned_colleagues && item.assigned_colleagues.length > 0) {
      item.assigned_colleagues.forEach((colId) => {
        addNotification("\u0628\u0631\u0631\u0633\u06CC \u0645\u062D\u062A\u0648\u0627 \u062A\u0648\u0633\u0637 \u06A9\u0627\u0631\u0641\u0631\u0645\u0627", `\u0645\u062D\u062A\u0648\u0627\u06CC "${item.title}" ${actionFa}.${comment ? " \u062A\u0648\u0636\u06CC\u062D\u0627\u062A: " + comment : ""}`, "colleague", "");
      });
    }
    saveDatabase().catch(console.error);
    res.json({
      status: "success",
      message:
        "\u0648\u0636\u0639\u06CC\u062A \u0622\u067E\u062F\u06CC\u062A \u0634\u062F",
    });
  } else {
    res.json({
      status: "error",
      message:
        "\u0645\u062D\u062A\u0648\u0627 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
    });
  }
});

export default subRouter;
