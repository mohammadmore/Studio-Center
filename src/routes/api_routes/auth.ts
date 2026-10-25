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
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// We need to handle `__dirname` in ESM if used, but let's just dump the code first.
const subRouter = express.Router();

subRouter.post(
  "/login",
  [
    body("username")
      .trim()
      .isLength({ min: 3 })
      .withMessage(
        "نام کاربری نامعتبر است",
      ),
    body("password")
      .trim()
      .isLength({ min: 6 })
      .withMessage(
        "رمز عبور باید حداقل ۶ کاراکتر باشد",
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
            "نام کاربری و رمز عبور الزامی است.",
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
            "نام کاربری یا رمز عبور اشتباه است.",
        });
    }
    if (orgUser && !(await bcrypt.compare(password, orgUser.passwordHash))) {
      return res
        .status(401)
        .json({
          status: "error",
          message:
            "نام کاربری یا رمز عبور اشتباه است.",
        });
    }
    if (!user && !orgUser) {
      return res
        .status(401)
        .json({
          status: "error",
          message:
            "نام کاربری یا رمز عبور اشتباه است.",
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
        "ورود موفق به پنل کاربری",
        req.ip || "127.0.0.1",
      );
      console.log("User matched, saving session for:", user.username);
      console.log("Session saved successfully.");
        res.json({
          status: "success",
          message: "ورود موفق",
          redirect: "dashboard",
        });
    } else if (orgUser) {
      req.session.user = {
        id: orgUser.id,
        full_name: orgUser.org_name,
        role_id: "client",
        avatar_url: orgUser.logo_url,
      };
      addAuditLog(
        orgUser.username,
        "ورود موفق نماینده کارفرما",
        req.ip || "127.0.0.1",
      );
      console.log("Org User matched, saving session for:", orgUser.username);
      console.log("Session saved successfully.");
        res.json({
          status: "success",
          message: "ورود موفق",
          redirect: "client-dashboard",
        });
    } else {
      res.json({
        status: "error",
        message:
          "نام کاربری/رمز عبور اشتباه است یا حساب غیرفعال شده.",
      });
    }
  },
);

subRouter.get("/logout", (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  req.session = null;
  res.redirect("/");
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
