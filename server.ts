import 'dotenv/config';
import fs from "fs";
import path from "path";

const envExamplePath = path.join(process.cwd(), '.env.example');
if (fs.existsSync(envExamplePath)) {
  const exampleEnv = fs.readFileSync(envExamplePath, 'utf8');
  const lines = exampleEnv.split('\n');
  const requiredKeys: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '# REQUIRED' && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine && !nextLine.startsWith('#')) {
        requiredKeys.push(nextLine.split('=')[0].trim());
      }
    }
  }
    
  const missingKeys = requiredKeys.filter(key => !process.env[key] && process.env[key] !== '');
  if (missingKeys.length > 0) {
    const errorMsg = `CRITICAL ERROR: Missing required environment variables: ${missingKeys.join(', ')}`;
    console.error(errorMsg);
    fs.appendFileSync('boot-error.log', `[${new Date().toISOString()}] ${errorMsg}\n`);
    process.exit(1);
  }
}

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
import bcrypt from "bcrypt";
import { body, validationResult } from "express-validator";
import session from "express-session";
import FileStoreFactory from "session-file-store";
import helmet from "helmet";
import crypto from "crypto";
const FileStore = FileStoreFactory(session as any);
import path from "path";
import multer from "multer";
import xlsx from "xlsx";
import * as jalaali from "jalaali-js";
import momentHijri from "moment-hijri";



const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});


process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  if (err.message && err.message.includes('EADDRINUSE')) {
     process.exit(1);
  }
});

let rejectionCount = 0;
let rejectionResetTimer = null;
process.on("unhandledRejection", (err) => {
  rejectionCount++;
  if (!rejectionResetTimer) {
    rejectionResetTimer = setTimeout(() => {
      rejectionCount = 0;
      rejectionResetTimer = null;
    }, 60000);
  }
  console.error("UNHANDLED REJECTION:", err);
  try {
    fs.appendFileSync('error.log', `[${new Date().toISOString()}] UNHANDLED REJECTION: ${(err as any)?.stack || err}\n`);
  } catch (e) {}
  if (rejectionCount > 10) {
    console.error("Too many unhandled rejections. Exiting...");
    process.exit(1);
  }
});


const app = express();
app.use(compression());
const PORT = process.env.NODE_ENV === 'development' ? 3000 : (process.env.PORT || 3000);
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res: any) => `'nonce-${res.locals.nonce}'`, "'unsafe-eval'"],
      styleSrc: ["'self'", (req, res: any) => `'nonce-${res.locals.nonce}'`],
      fontSrc: ["'self'", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    }
  }
}));
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
      "\u062F\u0631\u062E\u0648\u0627\u0633\u062A\u200C\u0647\u0627\u06CC \u0622\u067E\u0644\u0648\u062F \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632 \u0627\u0633\u062A. \u0644\u0637\u0641\u0627 \u0628\u0639\u062F\u0627 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.",
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



















const BASE_URL = process.env.BASE_URL || "/";
function addAuditLog(username, action, ip) {
  audit_logs.unshift({
    id:
      audit_logs.length > 0 ? audit_logs.reduce((m, x) => (x.id > m ? x.id : m), 0) + 1 : 1,
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
    : "\u0633\u06CC\u0633\u062A\u0645";
  const timestamp = new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const statusNames = {
    raw: "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645",
    todo: "\u062F\u0631 \u0635\u0641",
    doing: "\u062F\u0631 \u062D\u0627\u0644 \u0627\u0646\u062C\u0627\u0645",
    in_progress:
      "\u062F\u0631 \u062D\u0627\u0644 \u0627\u0646\u062C\u0627\u0645",
    done: "\u062A\u06A9\u0645\u06CC\u0644 \u0634\u062F\u0647",
    review:
      "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
    client_review:
      "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
    needs_revision:
      "\u0646\u06CC\u0627\u0632 \u0628\u0647 \u0628\u0627\u0632\u0628\u06CC\u0646\u06CC",
    approved_by_client:
      "\u062A\u0627\u06CC\u06CC\u062F \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
    ready_to_publish:
      "\u0622\u0645\u0627\u062F\u0647 \u0627\u0646\u062A\u0634\u0627\u0631",
    published: "\u0645\u0646\u062A\u0634\u0631 \u0634\u062F\u0647",
    scheduled:
      "\u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC \u0634\u062F\u0647",
    archived: "\u0622\u0631\u0634\u06CC\u0648 \u0634\u062F\u0647",
    pending: "\u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631",
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
      ? notifications.reduce((m, n) => (n.id > m ? n.id : m), 0) + 1
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

app.set("view engine", "ejs");
console.log("VIEW ENGINE SET TO:", app.get("view engine"));

const sessionStore = new FileStore({
  path: path.join(process.cwd(), 'sessions'),
  ttl: 7 * 24 * 60 * 60,
  retries: 0
});

app.use((session as any)({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'sid',
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.FORCE_HTTPS === 'true',
    sameSite: 'lax'
  },
  rolling: true
}));

app.use(express.static(path.join(process.cwd(), "center")));

app.use((req, res, next) => {
  res.locals.STUDIO_NAME =
    settings?.studio_info?.name ||
    "\u0627\u0633\u062A\u0648\u062F\u06CC\u0648 \u0627\u0633\u0648\u0627";
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
<style nonce="${res.locals.nonce}">
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
<style nonce="${res.locals.nonce}">
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
                  manage_team: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u06A9\u0627\u0631\u0628\u0631\u0627\u0646/\u0647\u0645\u06A9\u0627\u0631\u0627\u0646",
                  manage_organizations: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u200C\u0647\u0627",
                  manage_contents: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u062F\u067E\u0648\u06CC \u0645\u062D\u062A\u0648\u0627",
                  manage_smart_events: "\u062A\u0642\u0648\u06CC\u0645 \u0648 \u0645\u0646\u0627\u0633\u0628\u062A\u200C\u0647\u0627",
                  manage_leaves: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u0645\u0631\u062E\u0635\u06CC\u200C\u0647\u0627",
                  manage_roles: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u0646\u0642\u0634\u200C\u0647\u0627",
                  upload_excel: "\u0622\u067E\u0644\u0648\u062F \u0627\u06A9\u0633\u0644 \u0645\u062D\u062A\u0648\u0627",
                  upload_smart_events: "\u0622\u067E\u0644\u0648\u062F \u0627\u06A9\u0633\u0644 \u0645\u0646\u0627\u0633\u0628\u062A\u200C\u0647\u0627",
                  upload_users: "\u0622\u067E\u0644\u0648\u062F \u0627\u06A9\u0633\u0644 \u06A9\u0627\u0631\u0628\u0631\u0627\u0646",
                  save_settings: "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u06CC\u0633\u062A\u0645",
                  client_action: "\u0627\u0642\u062F\u0627\u0645\u0627\u062A \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
                  add_comment: "\u062B\u0628\u062A \u06A9\u0627\u0645\u0646\u062A",
                  update_profile: "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u067E\u0631\u0648\u0641\u0627\u06CC\u0644",
                  add_content: "\u0645\u062D\u062A\u0648\u0627",
                  batch_edit_contents: "\u0645\u062D\u062A\u0648\u0627 (\u06AF\u0631\u0648\u0647\u06CC)",
                  update_leave: "\u0648\u0636\u0639\u06CC\u062A \u0645\u0631\u062E\u0635\u06CC",
                  delete_leave: "\u062D\u0630\u0641 \u0645\u0631\u062E\u0635\u06CC",
                  save_leave: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0631\u062E\u0635\u06CC",
                  save_user: "\u06A9\u0627\u0631\u0628\u0631",
                  upload_image: "\u0622\u067E\u0644\u0648\u062F \u062A\u0635\u0648\u06CC\u0631",
                  upload_file: "\u0622\u067E\u0644\u0648\u062F \u0641\u0627\u06CC\u0644",
                  save_token: "\u062A\u0648\u06A9\u0646",
                  save_media: "\u0631\u0633\u0627\u0646\u0647",
                  save_onboarding: "\u0622\u0646\u0628\u0648\u0631\u062F\u06CC\u0646\u06AF",
                  save_expense: "\u0645\u0627\u0644\u06CC/\u0647\u0632\u06CC\u0646\u0647",
                  client_review: "\u0628\u0631\u0631\u0633\u06CC \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
                  confirm_events: "\u062A\u0627\u06CC\u06CC\u062F \u0645\u0646\u0627\u0633\u0628\u062A\u200C\u0647\u0627",
                  toggle_stage: "\u0645\u0631\u0627\u062D\u0644 \u0645\u062D\u062A\u0648\u0627",
                  rename_font: "\u0641\u0648\u0646\u062A",
                  invoices: "\u0641\u0627\u06A9\u062A\u0648\u0631",
                  undo_batch_operation: "\u0644\u063A\u0648 \u0639\u0645\u0644\u06CC\u0627\u062A",
                  apply_template: "\u0642\u0627\u0644\u0628",
                  dismiss_template_suggestion: "\u0631\u062F \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0642\u0627\u0644\u0628",
                  fulfill_template_suggestion: "\u062A\u0627\u06CC\u06CC\u062F \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0642\u0627\u0644\u0628",
                  unlock_events: "\u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u0642\u0641\u0644 \u062A\u0642\u0648\u06CC\u0645"
                };
                let actionFa = action;
                if (action === "add") actionFa = "\u0627\u0641\u0632\u0648\u062F\u0646";
                else if (action === "edit" || action === "update") actionFa = "\u0648\u06CC\u0631\u0627\u06CC\u0634";
                else if (action === "delete") actionFa = "\u062D\u0630\u0641";
                else if (action === "batch_delete") actionFa = "\u062D\u0630\u0641 \u06AF\u0631\u0648\u0647\u06CC";
                else if (action === "update_status") actionFa = "\u062A\u063A\u06CC\u06CC\u0631 \u0648\u0636\u0639\u06CC\u062A";
                else if (action === "approve") actionFa = "\u062A\u0627\u06CC\u06CC\u062F";
                else if (action === "reject") actionFa = "\u0631\u062F";
                else if (action === "archive") actionFa = "\u0622\u0631\u0634\u06CC\u0648";
                else if (action === "update_stage") actionFa = "\u062A\u063A\u06CC\u06CC\u0631 \u0645\u0631\u062D\u0644\u0647";
                else if (action === "POST") actionFa = "\u0630\u062E\u06CC\u0631\u0647/\u062B\u0628\u062A";
                
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
                "/": "\u062F\u0627\u0634\u0628\u0648\u0631\u062F",
                "/dashboard": "\u062F\u0627\u0634\u0628\u0648\u0631\u062F",
                "/archive": "\u0622\u0631\u0634\u06CC\u0648 \u0645\u062D\u062A\u0648\u0627",
                "/smart-events": "\u062A\u0642\u0648\u06CC\u0645 \u0647\u0648\u0634\u0645\u0646\u062F",
                "/team": "\u062A\u06CC\u0645 \u0648 \u0647\u0645\u06A9\u0627\u0631\u0627\u0646",
                "/organizations": "\u0633\u0627\u0632\u0645\u0627\u0646\u200C\u0647\u0627",
                "/leaves": "\u0645\u0631\u062E\u0635\u06CC\u200C\u0647\u0627",
                "/reports": "\u06AF\u0632\u0627\u0631\u0634\u0627\u062A",
                "/settings": "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A",
                "/audit": "\u062A\u0627\u0631\u06CC\u062E\u0686\u0647 \u0641\u0639\u0627\u0644\u06CC\u062A\u200C\u0647\u0627",
                "/recycle_bin": "\u0633\u0637\u0644 \u0632\u0628\u0627\u0644\u0647",
                "/finance": "\u0627\u0645\u0648\u0631 \u0645\u0627\u0644\u06CC"
            };
            if (req.method === "GET") {
                let vName = viewNames[req.path];
                if (vName) {
                    finalDesc = `\u0628\u0627\u0632\u062F\u06CC\u062F \u0627\u0632 \u0635\u0641\u062D\u0647 ${vName}`;
                } else {
                    finalDesc = `\u0628\u0627\u0632\u062F\u06CC\u062F \u0627\u0632 ${req.path}`;
                }
            } else {
                finalDesc = `\u062F\u0631\u062E\u0648\u0627\u0633\u062A ${req.method} \u0628\u0647 ${req.path}`;
            }
        }

        if (finalDesc) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              addAuditLog(userDesc, finalDesc + " (\u0645\u0648\u0641\u0642)", req.ip || "127.0.0.1");
            } else {
              addAuditLog(userDesc, finalDesc + ` (\u062E\u0637\u0627 ${res.statusCode})`, req.ip || "127.0.0.1");
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
      let title = textMatch ? textMatch[1].trim() : "\u0628\u062E\u0634 " + i;
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
app.get("/healthz", (req, res) => res.send("OK"));
app.use("/api", apiRouter);
app.use("/", mediaRouter);
app.use("/", viewsRouter);

app.all('/api/*', (req, res) => res.status(404).json({status: 'error', message: 'API route not found'}));
app.get("*", (req, res) => {
  if (req.session?.user) return res.redirect("/");
  res.redirect("/login");
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
            "\u0633\u0631\u0631\u0633\u06CC\u062F \u0641\u0627\u06A9\u062A\u0648\u0631",
            `\u0645\u0647\u0644\u062A \u067E\u0631\u062F\u0627\u062E\u062A \u0641\u0627\u06A9\u062A\u0648\u0631 ${inv.invoice_number} \u0628\u0647 \u067E\u0627\u06CC\u0627\u0646 \u0631\u0633\u06CC\u062F\u0647 \u0627\u0633\u062A.`,
            "admin",
            null,
            "/invoices_list",
            "invoice_overdue",
            inv.id,
          );
          addNotification(
            "\u06CC\u0627\u062F\u0622\u0648\u0631\u06CC \u062A\u0633\u0648\u06CC\u0647 \u062D\u0633\u0627\u0628",
            `\u0645\u0647\u0644\u062A \u067E\u0631\u062F\u0627\u062E\u062A \u0641\u0627\u06A9\u062A\u0648\u0631 \u0634\u0645\u0627\u0631\u0647 ${inv.invoice_number} \u0628\u0647 \u067E\u0627\u06CC\u0627\u0646 \u0631\u0633\u06CC\u062F\u0647 \u0627\u0633\u062A. \u0644\u0637\u0641\u0627 \u0646\u0633\u0628\u062A \u0628\u0647 \u062A\u0633\u0648\u06CC\u0647 \u0622\u0646 \u0627\u0642\u062F\u0627\u0645 \u0646\u0645\u0627\u06CC\u06CC\u062F.`,
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
app.use((err, req, res, next) => {
  if (err && err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ status: 'error', message: 'فرمت فایل نامعتبر است' });
  }
  console.error("Unhandled Error:", err);
  res.status(500).json({
    status: "error",
    message: "خطای سرور رخ داده است. لطفا دوباره تلاش کنید."
  });
});


const httpServer = createServer(app);
initSocket(httpServer);
// @ts-ignore
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


