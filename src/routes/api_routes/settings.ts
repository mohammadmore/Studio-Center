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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ALLOWED = ['font/woff', 'font/woff2', 'font/ttf', 'application/font-woff'];
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!ALLOWED.includes(file.mimetype) || !['woff', 'woff2', 'ttf'].includes(ext)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// We need to handle `__dirname` in ESM if used, but let's just dump the code first.
const subRouter = express.Router();

subRouter.get("/manage_settings", (req, res) => {
  const activeSettings = {};
  for (let key in settings) {
    if (Array.isArray(settings[key])) {
      if (key === "routine_holidays") {
        activeSettings[key] = settings[key];
      } else {
        activeSettings[key] = settings[key].filter((s) => s.is_active === 1);
      }
    } else {
      activeSettings[key] = settings[key];
    }
  }
  res.json({ status: "success", data: activeSettings });
});

subRouter.post(
  "/manage_settings",
  checkPermission("settings"),
  (req, res) => {
    let { action, id, group, name, key, price, icon, logo_url } = req.body;
    const itemName = name || key;
    if (group && !settings[group]) settings[group] = [];
    if (id !== void 0 && id !== null && id !== "") {
      id = parseInt(id, 10);
    }
    if (action === "delete") {
      if (group && settings[group] && Array.isArray(settings[group])) {
        const item = settings[group].find((i) => i.id === id);
        if (item) {
          item.is_active = 0;
          saveDatabase();
          return res.json({
            status: "success",
            message: "\u0622\u06CC\u062A\u0645 \u062D\u0630\u0641 \u0634\u062F",
          });
        }
      }
      return res
        .status(404)
        .json({
          status: "error",
          message:
            "\u0622\u06CC\u062A\u0645 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
        });
    }
    if (action === "edit") {
      if (group && settings[group] && Array.isArray(settings[group])) {
        const item = settings[group].find((i) => i.id === id);
        if (item) {
          if (itemName) item.setting_key = itemName;
          if (price !== void 0 && price !== "") {
            (item as any).price = parseInt(price) || 0;
            (item as any).base_price = parseInt(price) || 0;
          }
          if (icon !== void 0) (item as any).icon = icon;
          if (logo_url !== void 0) (item as any).logo_url = logo_url;
          if (req.body.is_active !== void 0)
            item.is_active = req.body.is_active;
          saveDatabase();
          return res.json({
            status: "success",
            message:
              "\u062A\u063A\u06CC\u06CC\u0631\u0627\u062A \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F",
          });
        }
      }
      return res
        .status(404)
        .json({
          status: "error",
          message:
            "\u0622\u06CC\u062A\u0645 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
        });
    }
    if (action === "add" || !action) {
      let maxId = 0;
      for (let k in settings) {
        if (Array.isArray(settings[k])) {
          settings[k].forEach((i) => {
            if (i.id > maxId) maxId = i.id;
          });
        }
      }
      const newItem: any = { id: maxId + 1, setting_key: itemName, is_active: 1 };
      if (price !== void 0 && price !== "") {
        newItem.price = parseInt(price) || 0;
        newItem.base_price = parseInt(price) || 0;
      }
      if (icon !== void 0) {
        newItem.icon = icon;
      }
      if (logo_url !== void 0) {
        newItem.logo_url = logo_url;
      }
      if (group && Array.isArray(settings[group])) {
        settings[group].push(newItem);
      } else if (group) {
        settings[group] = [newItem];
      }
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0622\u06CC\u062A\u0645 \u0627\u0641\u0632\u0648\u062F\u0647 \u0634\u062F",
      });
    }
    if (action === "reorder") {
      if (group && settings[group] && Array.isArray(settings[group])) {
        const activeItems = settings[group].filter((i) => i.is_active !== 0);
        const activeIndex = activeItems.findIndex((i) => i.id === id);
        if (activeIndex !== -1) {
          let targetActiveIndex = -1;
          if (req.body.direction === "up" && activeIndex > 0) {
            targetActiveIndex = activeIndex - 1;
          } else if (
            req.body.direction === "down" &&
            activeIndex < activeItems.length - 1
          ) {
            targetActiveIndex = activeIndex + 1;
          }
          if (targetActiveIndex !== -1) {
            const targetId = activeItems[targetActiveIndex].id;
            const realIndex = settings[group].findIndex((i) => i.id === id);
            const targetRealIndex = settings[group].findIndex(
              (i) => i.id === targetId,
            );
            const temp = settings[group][realIndex];
            settings[group][realIndex] = settings[group][targetRealIndex];
            settings[group][targetRealIndex] = temp;
            saveDatabase();
            return res.json({
              status: "success",
              message:
                "\u062A\u0631\u062A\u06CC\u0628 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F",
            });
          }
        }
      }
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "\u0627\u0645\u06A9\u0627\u0646 \u062C\u0627\u0628\u062C\u0627\u06CC\u06CC \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F",
        });
    }
  },
);

subRouter.post("/save_token", checkPermission("settings"), (req, res) => {
  const { org_id, org_name, platform_name, account_username, access_token } =
    req.body;
  tokens.push({
    id: tokens.length > 0 ? tokens.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1 : 1,
    org_id: parseInt(org_id),
    org_name,
    platform_name,
    account_username,
    access_token,
    status: "active",
    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1e3).toISOString(),
  });
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u062A\u0648\u06A9\u0646 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0645\u062A\u0635\u0644 \u0634\u062F",
  });
});

subRouter.get("/get_tokens", (req, res) => {
  res.json({ status: "success", tokens });
});

subRouter.get("/get_fonts", async (req, res) => {
  
    let fontDocs: string[] = [];
    const fontsDir = path.join(process.cwd(), 'center', 'assets', 'fonts');
    if (fs.existsSync(fontsDir)) {
      fontDocs = fs.readdirSync(fontsDir);
    }

  let fontsList = [
    {
      filename: "vazirmatn",
      fa_name:
        "\u0648\u0632\u06CC\u0631\u0645\u062A\u0646 (\u067E\u06CC\u0634\u0641\u0631\u0636)",
      en_name: "vazirmatn",
    },
  ];
  if (settings.fonts && settings.fonts["vazirmatn"]) {
    fontsList[0] = { ...fontsList[0], ...settings.fonts["vazirmatn"] };
  }
  fontDocs.forEach((file) => {
    let fontData = { filename: file, fa_name: file, en_name: file };
    if (settings.fonts && settings.fonts[file]) {
      fontData = { ...fontData, ...settings.fonts[file] };
    }
    fontsList.push(fontData);
  });
  if (settings.font_order) {
    fontsList.sort((a, b) => {
      let idxA = settings.font_order.indexOf(a.filename);
      let idxB = settings.font_order.indexOf(b.filename);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  }
  res.json({ status: "success", fonts: fontsList });
});

subRouter.post(
  "/reorder_fonts",
  checkPermission("settings"),
  (req, res) => {
    const { filename, direction, current_order } = req.body;
    let order = settings.font_order || current_order || [];
    if (current_order && Array.isArray(current_order)) {
      current_order.forEach((f) => {
        if (!order.includes(f)) order.push(f);
      });
    }
    if (!order.includes(filename)) order.push(filename);
    const index = order.indexOf(filename);
    if (index !== -1) {
      let targetIndex = -1;
      if (direction === "up" && index > 0) targetIndex = index - 1;
      else if (direction === "down" && index < order.length - 1)
        targetIndex = index + 1;
      if (targetIndex !== -1) {
        const temp = order[index];
        order[index] = order[targetIndex];
        order[targetIndex] = temp;
        settings.font_order = order;
        saveDatabase().catch(console.error);
        return res.json({ status: "success" });
      }
    }
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0627\u0645\u06A9\u0627\u0646 \u062C\u0627\u0628\u062C\u0627\u06CC\u06CC \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F",
      });
  },
);

subRouter.post(
  "/upload_font",
  checkPermission("settings"),
  async (req, res) => {
    const { font, filename } = req.body;
    if (!font || !filename) {
      return res
        .status(400)
        .json({ status: "error", message: "No font provided" });
    }
    const base64Data = font
      .replace(/^data:font\/\w+;base64,/, "")
      .replace(/^data:application\/octet-stream;base64,/, "");
    try {
      const fs2 = require("fs");
      const path2 = require("path");
      const buffer = Buffer.from(base64Data, "base64");
      const fontsDir = path2.join(process.cwd(), "public", "fonts");
      if (!fs2.existsSync(fontsDir))
        fs2.mkdirSync(fontsDir, { recursive: true });
      fs2.writeFileSync(path2.join(fontsDir, filename), buffer);
      if (!settings.fonts) settings.fonts = {};
      settings.fonts[filename] = { fa_name: filename, en_name: filename };
      settings.active_font = filename;
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message:
          "\u0641\u0648\u0646\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0622\u067E\u0644\u0648\u062F \u0648 \u0641\u0639\u0627\u0644 \u0634\u062F",
      });
    } catch (err) {
      res
        .status(500)
        .json({
          status: "error",
          message:
            "\u062E\u0637\u0627 \u062F\u0631 \u0630\u062E\u06CC\u0631\u0647 \u0641\u0648\u0646\u062A",
        });
    }
  },
);

subRouter.post(
  "/set_active_font",
  checkPermission("settings"),
  (req, res) => {
    const { filename } = req.body;
    try {
      settings.active_font = filename;
      saveDatabase().catch(console.error);
      return res.json({
        status: "success",
        message:
          filename === "vazirmatn"
            ? "\u0641\u0648\u0646\u062A \u067E\u06CC\u0634\u0641\u0631\u0636 \u0641\u0639\u0627\u0644 \u0634\u062F"
            : "\u0641\u0648\u0646\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0641\u0639\u0627\u0644 \u0634\u062F",
      });
    } catch (err) {
      res
        .status(500)
        .json({
          status: "error",
          message:
            "\u062E\u0637\u0627 \u062F\u0631 \u062A\u063A\u06CC\u06CC\u0631 \u0641\u0648\u0646\u062A",
        });
    }
  },
);

subRouter.post("/rename_font", checkPermission("settings"), (req, res) => {
  const { filename, fa_name, en_name } = req.body;
  if (!filename)
    return res
      .status(400)
      .json({ status: "error", message: "Missing filename" });
  if (!settings.fonts) settings.fonts = {};
  if (!settings.fonts[filename]) settings.fonts[filename] = {};
  settings.fonts[filename].fa_name = fa_name || filename;
  settings.fonts[filename].en_name = en_name || filename;
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u0646\u0627\u0645 \u0641\u0648\u0646\u062A \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F",
  });
});

subRouter.post(
  "/delete_font",
  checkPermission("settings"),
  async (req, res) => {
    const { filename } = req.body;
    try {
      
    const fontsDir = path.join(process.cwd(), 'center', 'assets', 'fonts');
    const fp = path.join(fontsDir, filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);

      if (settings.fonts && settings.fonts[filename]) {
        delete settings.fonts[filename];
      }
      if (settings.active_font === filename) {
        settings.active_font = "vazirmatn";
      }
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message: "\u0641\u0648\u0646\u062A \u062D\u0630\u0641 \u0634\u062F",
      });
    } catch (err) {
      res
        .status(500)
        .json({
          status: "error",
          message:
            "\u062E\u0637\u0627 \u062F\u0631 \u062D\u0630\u0641 \u0641\u0648\u0646\u062A",
        });
    }
  },
);

subRouter.get("/get_studio_info", (req, res) => {
  res.json({ status: "success", data: settings.studio_info });
});

subRouter.post(
  "/save_studio_info",
  checkPermission("settings"),
  (req, res) => {
    if (req.body) {
      settings.studio_info = { ...settings.studio_info, ...req.body };
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0627\u0633\u062A\u0648\u062F\u06CC\u0648 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F",
        data: settings.studio_info,
      });
    }
    return res.json({ status: "error", message: "No data provided" });
  },
);

export default subRouter;
