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

subRouter.get("/get_logs", checkPermission("audit"), (req, res) => {
  res.json({ status: "success", data: audit_logs });
});

subRouter.get("/get_notifications", (req, res) => {
  const session2 = req.session;
  if (!session2 || !session2.user)
    return res.status(401).json({ status: "error" });
  const user = session2.user;
  let userNotifs = notifications
    .filter((n) => {
      if (!n.role_target) return true;
      if (n.role_target === "client" && user?.role_id === "client") {
        return !n.user_id || n.user_id === user.id;
      }
      if (n.role_target === "colleague" && user?.role_id !== "client") {
        return !n.user_id || n.user_id === user.id;
      }
      if (n.role_target === "admin" && user?.role_id === 1) {
        return true;
      }
      return false;
    })
    .reverse()
    .slice(0, 50);
  const unread_count = userNotifs.filter((n) => n.status === "unread").length;
  res.json({ status: "success", notifications: userNotifs, unread_count });
});

subRouter.post("/read_notifications", (req, res) => {
  const session2 = req.session;
  if (!session2 || !session2.user)
    return res.status(401).json({ status: "error" });
  const user = session2.user;
  notifications.forEach((n) => {
    let isMine = false;
    if (!n.role_target) isMine = true;
    else if (
      n.role_target === "client" &&
      user?.role_id === "client" &&
      (!n.user_id || n.user_id === user.id)
    )
      isMine = true;
    else if (
      n.role_target === "colleague" &&
      user?.role_id !== "client" &&
      (!n.user_id || n.user_id === user.id)
    )
      isMine = true;
    else if (n.role_target === "admin" && user?.role_id === 1) isMine = true;
    if (isMine) n.status = "read";
  });
  saveDatabase();
  res.json({ status: "success" });
});

export default subRouter;
