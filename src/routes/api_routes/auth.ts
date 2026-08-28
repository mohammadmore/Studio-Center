import * as repo from "../../db/repository.js";
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
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// We need to handle `__dirname` in ESM if used, but let's just dump the code first.
const subRouter = express.Router();

subRouter.post(
  "/login",
  [
    body("username")
      .trim()
      .isLength({ min: 3 })
      .withMessage(
        "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A",
      ),
    body("password")
      .trim()
      .isLength({ min: 3 })
      .withMessage(
        "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F6 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F",
      ),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ status: "error", message: errors.array()[0].msg });
    }
    const username = (req.body.username || "").trim().toLowerCase();
    const password = (req.body.password || "").trim();
    if (!username || !password) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0648 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A.",
        });
    }
    const user = colleagues.find(
      (u) => u.username.toLowerCase() === username && u.is_active === 1,
    );
    const orgUser = organizations.find(
      (o) => o.username.toLowerCase() === username && o.is_active === 1,
    );
    let isValidUser = false;
    if (user) {
      isValidUser = await bcrypt.compare(password, user.passwordHash);
    }
    if (user && !isValidUser) {
      return res
        .status(401)
        .json({
          status: "error",
          message:
            "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A.",
        });
    }
    if (orgUser && !(await bcrypt.compare(password, orgUser.passwordHash))) {
      return res
        .status(401)
        .json({
          status: "error",
          message:
            "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A.",
        });
    }
    if (!user && !orgUser) {
      return res
        .status(401)
        .json({
          status: "error",
          message:
            "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A.",
        });
    }
    if (user) {
      req.session.user = {
        id: user.id,
        full_name: user.full_name,
        role_id: user?.role_id,
        avatar_url: user.avatar_url,
        username: user.username,
      };
      addAuditLog(
        user.username,
        "\u0648\u0631\u0648\u062F \u0645\u0648\u0641\u0642 \u0628\u0647 \u067E\u0646\u0644 \u06A9\u0627\u0631\u0628\u0631\u06CC",
        req.ip || "127.0.0.1",
      );
      console.log("User matched, saving session for:", user.username);
      console.log("Session saved successfully.");
        res.json({
          status: "success",
          message: "\u0648\u0631\u0648\u062F \u0645\u0648\u0641\u0642",
          redirect: "dashboard",
        });
    } else if (orgUser) {
      req.session.user = {
        id: orgUser.id,
        org_id: orgUser.id,
        username: orgUser.username,
        full_name: orgUser.org_name,
        role_id: "client",
        avatar_url: orgUser.logo_url,
      };
      addAuditLog(
        orgUser.username,
        "\u0648\u0631\u0648\u062F \u0645\u0648\u0641\u0642 \u0646\u0645\u0627\u06CC\u0646\u062F\u0647 \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
        req.ip || "127.0.0.1",
      );
      console.log("Org User matched, saving session for:", orgUser.username);
      console.log("Session saved successfully.");
        res.json({
          status: "success",
          message: "\u0648\u0631\u0648\u062F \u0645\u0648\u0641\u0642",
          redirect: "client-dashboard",
        });
    } else {
      res.json({
        status: "error",
        message:
          "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC/\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A \u06CC\u0627 \u062D\u0633\u0627\u0628 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0634\u062F\u0647.",
      });
    }
  },
);

subRouter.get("/logout", (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  req.session.destroy((err) => {
    res.redirect("/");
  });
});

subRouter.get("/check_auth", async (req, res) => {
  const session2 = req.session;
  if (session2 && session2.user) {
    const roleInfo = getRoleInfoForUser(session2.user);
    const colleague = colleagues.find(
      (c) =>
        (session2.user.id !== void 0 && c.id == session2.user.id) ||
        (session2.user.username &&
          c.username?.toLowerCase() === session2.user.username.toLowerCase()),
    );
    const { passwordHash, ...safeUser } = session2.user;
    const fullUser = {
      ...safeUser,
      full_name: colleague?.full_name || session2.user.full_name,
      avatar_url: colleague?.avatar_url || session2.user.avatar_url,
      role_id: roleInfo?.role_id,
      role_name: roleInfo.role_name,
      permissions: roleInfo.permissions,
    };
    res.json({ status: "success", user: fullUser });
  } else {
    res.json({ status: "error", message: "Unauthorized" });
  }
});

export default subRouter;
