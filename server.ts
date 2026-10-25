import { initSocket } from "./src/utils/socket.js";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { saveDatabase } from "./src/store/db.js";
import mediaRouter from "./src/routes/media.js";
import { loadDatabase } from "./src/store/db.js";
import apiRouter from "./src/routes/api.js";
var __defProp = Object.defineProperty;
import { clientAuthGuard, authGuard, apiAuthGuard, checkPermission } from "./src/middleware/auth.js";
var __name = (target, value) =>
  __defProp(target, "name", { value, configurable: true });
import fs from "fs";
import express from "express";
import compression from "compression";
import "express-async-errors";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import morgan from "morgan";
import xss from "xss-clean";
import bcrypt from "bcrypt";
import { body, validationResult } from "express-validator";
import cookieSession from "cookie-session";
import path from "path";
import multer from "multer";
import xlsx from "xlsx";
import * as jalaali from "jalaali-js";
import momentHijri from "moment-hijri";


import { db } from "./src/db/index.js";
import { doc, getDoc, setDoc, deleteDoc, getDocs, collection } from "firebase/firestore";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 800 * 1024 }, // Limited to < 1MB for Firestore
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! Shutting down...", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! Shutting down...", err);
  process.exit(1);
});
const app = express();
app.use(compression());
const PORT = 3e3;
app.use(xss());
app.use(hpp());
app.use(morgan("combined"));
const limiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 5e3,
  message: {
    status: "error",
    message: "Too many requests from this IP, please try again later.",
  },
});
app.use(limiter);
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1e3,
  max: 10,
  message: {
    status: "error",
    message: "Too many login attempts, please try again after an hour.",
  },
});
app.use("/api/login", loginLimiter);
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 50,
  message: {
    status: "error",
    message:
      "درخواست‌های آپلود بیش از حد مجاز است. لطفا بعدا تلاش کنید.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/upload_image", uploadLimiter);
app.use("/api/bulk_import_contents", uploadLimiter);
app.use("/api/upload_smart_events", uploadLimiter);
app.use("/api/upload_font", uploadLimiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
import { roles, colleagues, organizations, collections, contents, settings, leaves, audit_logs, recycle_bin, batch_operations, notifications, tokens, templatesData, contentTemplates, templateSuggestions, expenses, invoices, mediaAssets, smartEventsBank, clientSelections } from "./src/store/state.js";



















const router = express.Router();
const BASE_URL = process.env.BASE_URL || "/";
function addAuditLog(username, action, ip) {
  audit_logs.unshift({
    id:
      audit_logs.length > 0 ? Math.max(...audit_logs.map((x) => x.id)) + 1 : 1,
    username,
    action,
    ip,
    created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
  });
  if (audit_logs.length > 1e3) {
    audit_logs.splice(1000);
  }
}

function logContentActivity(card, req, actionDesc) {
  if (!card.activity_log) {
    card.activity_log = [];
  }
  const userObj = req.session && req.session.user ? req.session.user : null;
  const username = userObj
    ? userObj.full_name || userObj.username
    : "سیستم";
  const timestamp = new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const statusNames = {
    raw: "ورودی خام",
    todo: "در صف",
    doing: "در حال انجام",
    in_progress:
      "در حال انجام",
    done: "تکمیل شده",
    review:
      "ارزیابی استودیو",
    client_review:
      "ارزیابی کارفرما",
    needs_revision:
      "نیاز به بازبینی",
    approved_by_client:
      "تایید کارفرما",
    ready_to_publish:
      "آماده انتشار",
    published: "منتشر شده",
    scheduled:
      "زمان‌بندی شده",
    archived: "آرشیو شده",
    pending: "در انتظار",
  };
  let translatedAction = actionDesc;
  for (const [key, value] of Object.entries(statusNames)) {
    const regex = new RegExp(`\\b${key}\\b`, "g");
    translatedAction = translatedAction.replace(regex, value);
  }
  card.activity_log.unshift({
    user: username,
    action: translatedAction,
    timestamp,
  });
}

function addNotification(
  title,
  description,
  role_target,
  user_id,
  link,
  type = "general",
  target_id = null,
) {
  const newId =
    notifications.length > 0
      ? Math.max(...notifications.map((n) => n.id)) + 1
      : 1;
  const jalaaliDate = new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  notifications.push({
    id: newId,
    title,
    description,
    status: "unread",
    created_at: jalaaliDate,
    role_target,
    user_id,
    link,
    type,
    target_id,
  });
}







loadDatabase().catch(console.error);

// Realtime sync for multiple Cloud Run instances
// setTimeout(() => {
//   onSnapshot(doc(db, "database", "main_meta"), async (docSnap) => {
//     if (docSnap.exists()) {
//       const remoteTimestamp = docSnap.data().timestamp || 0;
//       if (remoteTimestamp > localDbTimestamp + 5000) { // 5s buffer to prevent self-trigger
//         console.log("Remote database changed in another instance, syncing to memory...");
//         await loadDatabase();
//       }
//     }
//   });
// }, 5000);

app.set("trust proxy", 1);
app.use((req, res, next) => {
  req.headers["x-forwarded-proto"] = "https";
  next();
});
app.set("view engine", "ejs");
console.log("VIEW ENGINE SET TO:", app.get("view engine"));
app.use(express.static(path.join(process.cwd(), "center")));
app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'fallback_secret_key_for_asva_studio'],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: true,
    sameSite: "none",
    httpOnly: true,
  }),
);
app.use((req, res, next) => {
  res.locals.STUDIO_NAME =
    settings?.studio_info?.name ||
    "استودیو اسوا";
  res.locals.STUDIO_LOGO =
    settings?.studio_info?.logo_light || settings?.studio_info?.logo || "";
  res.locals.settings = settings;
  const originalRender = res.render;
  // @ts-ignore
  res.render = function (view: string, options?: any, callback?: any) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    originalRender.call(this, view, options, (err, html) => {
      if (err) return callback ? callback(err, "") : next(err);
      if (html && typeof html === "string") {
        const font = settings?.active_font;
        let injection = "";
        if (font && font !== "vazirmatn") {
          injection = `
<link rel="preload" href="/fonts/${font}" as="font" crossorigin>
<style>
@font-face {
    font-family: 'AppCustomFont';
    src: url('/fonts/${font}');
    font-display: swap;
}
*, body, button, input, select, textarea, .asva-menu-link, .btn-primary, .btn-outline, .form-control, .s-tab, .tab-btn {
    font-family: 'AppCustomFont', Tahoma, sans-serif !important;
}
</style>`;
        } else {
          injection = `
<style>
*, body, button, input, select, textarea, .asva-menu-link, .btn-primary, .btn-outline, .form-control, .s-tab, .tab-btn {
    font-family: 'Vazirmatn', Tahoma, sans-serif !important;
}
</style>`;
        }
        if (html.includes("</head>")) {
          html = html.replace("</head>", injection + "</head>");
        } else {
          html = injection + html;
        }
      }
      if (callback) {
        callback(null, html);
      } else {
        res.send(html);
      }
    });
  };
  res.on("finish", () => {
    if (req.method === "POST" && req.path.startsWith("/api/") && !req.path.includes("auth")) {
        saveDatabase();
    }

    if (req.session && req.session.user && req.path !== "/api/auth/status") {
      const isStatic = req.path.startsWith('/assets') || req.path.startsWith('/fonts') || req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i);
      const isPolling = req.method === 'GET' && (req.path === '/api/get_notifications' || req.path === '/api/get_leaves' || req.path === '/api/get_logs' || req.path === '/api/get_colleagues' || req.path === '/api/get_recent_contents');
      
      if (!isStatic && !isPolling) {
        let finalDesc = "";
        let userDesc = req.session.user;

        if (req.path.startsWith("/api/")) {
            if (!req.path.includes("auth")) {
                let action = req.body?.action || req.query?.action || req.method;
                let endpoint = req.path.replace("/api/", "").replace("", "");
                
                if (endpoint === 'toggle_stage') action = 'update_stage';
                
                const epNames = {
                  manage_team: "مدیریت کاربران/همکاران",
                  manage_organizations: "مدیریت سازمان‌ها",
                  manage_contents: "مدیریت دپوی محتوا",
                  manage_smart_events: "تقویم و مناسبت‌ها",
                  manage_leaves: "مدیریت مرخصی‌ها",
                  manage_roles: "مدیریت نقش‌ها",
                  upload_excel: "آپلود اکسل محتوا",
                  upload_smart_events: "آپلود اکسل مناسبت‌ها",
                  upload_users: "آپلود اکسل کاربران",
                  save_settings: "تنظیمات سیستم",
                  client_action: "اقدامات کارفرما",
                  add_comment: "ثبت کامنت",
                  update_profile: "ویرایش پروفایل",
                  add_content: "محتوا",
                  batch_edit_contents: "محتوا (گروهی)",
                  update_leave: "وضعیت مرخصی",
                  delete_leave: "حذف مرخصی",
                  save_leave: "درخواست مرخصی",
                  save_user: "کاربر",
                  upload_image: "آپلود تصویر",
                  upload_file: "آپلود فایل",
                  save_token: "توکن",
                  save_media: "رسانه",
                  save_onboarding: "آنبوردینگ",
                  save_expense: "مالی/هزینه",
                  client_review: "بررسی کارفرما",
                  confirm_events: "تایید مناسبت‌ها",
                  toggle_stage: "مراحل محتوا",
                  rename_font: "فونت",
                  invoices: "فاکتور",
                  undo_batch_operation: "لغو عملیات",
                  apply_template: "قالب",
                  dismiss_template_suggestion: "رد پیشنهاد قالب",
                  fulfill_template_suggestion: "تایید پیشنهاد قالب",
                  unlock_events: "باز کردن قفل تقویم"
                };
                let actionFa = action;
                if (action === "add") actionFa = "افزودن";
                else if (action === "edit" || action === "update") actionFa = "ویرایش";
                else if (action === "delete") actionFa = "حذف";
                else if (action === "batch_delete") actionFa = "حذف گروهی";
                else if (action === "update_status") actionFa = "تغییر وضعیت";
                else if (action === "approve") actionFa = "تایید";
                else if (action === "reject") actionFa = "رد";
                else if (action === "archive") actionFa = "آرشیو";
                else if (action === "update_stage") actionFa = "تغییر مرحله";
                else if (action === "POST") actionFa = "ذخیره/ثبت";
                
                let epFa = epNames[endpoint] || endpoint;
                
                let extraInfo = "";
                const titleStr = req.body?.title || req.body?.item_title || req.body?.name || req.body?.org_name || req.body?.full_name;
                if (titleStr && typeof titleStr === 'string' && titleStr.length < 50) {
                    extraInfo = ` ("${titleStr}")`;
                }
                
                finalDesc = `${actionFa} ${epFa}${extraInfo}`;
            }
        } else {
            const viewNames = {
                "/": "داشبورد",
                "/dashboard": "داشبورد",
                "/archive": "آرشیو محتوا",
                "/smart-events": "تقویم هوشمند",
                "/team": "تیم و همکاران",
                "/organizations": "سازمان‌ها",
                "/leaves": "مرخصی‌ها",
                "/reports": "گزارشات",
                "/settings": "تنظیمات",
                "/audit": "تاریخچه فعالیت‌ها",
                "/recycle_bin": "سطل زباله",
                "/finance": "امور مالی"
            };
            if (req.method === "GET") {
                let vName = viewNames[req.path];
                if (vName) {
                    finalDesc = `بازدید از صفحه ${vName}`;
                } else {
                    finalDesc = `بازدید از ${req.path}`;
                }
            } else {
                finalDesc = `درخواست ${req.method} به ${req.path}`;
            }
        }

        if (finalDesc) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              addAuditLog(userDesc, finalDesc + " (موفق)", req.ip || "127.0.0.1");
            } else {
              addAuditLog(userDesc, finalDesc + ` (خطا ${res.statusCode})`, req.ip || "127.0.0.1");
            }
        }
      }
    }
  });
  next();
});






function getPermissionCategories() {
  if (global.cachedCategories) return global.cachedCategories;
  try {
    const sidebarPath = path.join(process.cwd(), "views", "sidebar.ejs");
    if (!fs.existsSync(sidebarPath)) return [];
    const sidebar = fs.readFileSync(sidebarPath, "utf-8");
    const categories = [];
    const catBlocks = sidebar.split(/<li style="margin-bottom: 8px;">/);
    for (let i = 1; i < catBlocks.length; i++) {
      const block = catBlocks[i];
      const titleMatch = block.match(
        /class="asva-menu-title"[^>]*>([\s\S]*?)<\/div>/,
      );
      if (!titleMatch) continue;
      const textMatch = block.match(
        /<div class="asva-menu-title-label">[\s\S]*?<span>(.*?)<\/span>/,
      );
      let title = textMatch ? textMatch[1].trim() : "بخش " + i;
      const perms = [];
      const addedIds = new Set();
      const items = block.split(/<% if/);
      for (let j = 1; j < items.length; j++) {
        const item = items[j];
        const permMatch = item.match(/userPermissions\.includes\('([^']+)'\)/);
        if (permMatch) {
          const id = permMatch[1];
          const aEndIndex = item.indexOf("</a>");
          if (aEndIndex !== -1) {
            const aStartIndex = item.lastIndexOf(">", aEndIndex) + 1;
            const label = item.substring(aStartIndex, aEndIndex).trim();
            if (label && !addedIds.has(id)) {
              perms.push({ id, label });
              addedIds.add(id);
            }
          }
        }
      }
      if (perms.length > 0) {
        categories.push({ title, perms });
      }
    }
    global.cachedCategories = categories;
    return categories;
  } catch (e) {
    console.error("Error parsing sidebar:", e);
    return [];
  }
}

import viewsRouter from "./src/routes/views.js";
app.use("/api", apiRouter);
app.use("/", mediaRouter);
app.use("/", viewsRouter);
app.get("*", (req, res) => {
  res.redirect("/");
});
setInterval(() => {
  const today = new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  let triggered = false;
  invoices.forEach((inv) => {
    if (inv.status !== "paid" && inv.status !== "cancelled" && inv.due_date) {
      if (inv.due_date < today) {
        const notifExists = notifications.find(
          (n) =>
            n.type === "invoice_overdue" &&
            n.target_id === inv.id &&
            n.created_at.startsWith(today),
        );
        if (!notifExists) {
          addNotification(
            "سررسید فاکتور",
            `مهلت پرداخت فاکتور ${inv.invoice_number} به پایان رسیده است.`,
            "admin",
            null,
            "/invoices_list",
            "invoice_overdue",
            inv.id,
          );
          addNotification(
            "یادآوری تسویه حساب",
            `مهلت پرداخت فاکتور شماره ${inv.invoice_number} به پایان رسیده است. لطفا نسبت به تسویه آن اقدام نمایید.`,
            "client",
            inv.org_id,
            "/invoices_list",
            "invoice_overdue",
            inv.id,
          );
          triggered = true;
        }
      }
    }
  });
  if (triggered) saveDatabase();
}, 6e4 * 60);
app.use(BASE_URL || "/", router);
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res
    .status(500)
    .json({
      status: "error",
      message:
        "خطای سرور رخ داده است. لطفا دوباره تلاش کنید.",
    });
});


const httpServer = createServer(app);
initSocket(httpServer);
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


