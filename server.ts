var __defProp = Object.defineProperty;
var __name = (target, value) =>
  __defProp(target, "name", { value, configurable: true });
import fs from "fs";
import express from "express";
import compression from "compression";
import "express-async-errors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import morgan from "morgan";
import xss from "xss-clean";
import bcrypt from "bcrypt";
import { body, validationResult } from "express-validator";
import session from "express-session";
import FileStore from "session-file-store";
const FileStoreSession = FileStore(session);
import path from "path";
import multer from "multer";
import xlsx from "xlsx";
import * as jalaali from "jalaali-js";
import momentHijri from "moment-hijri";
function addDaysToJalali(dateStr, days) {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  const jy = parseInt(parts[0]);
  const jm = parseInt(parts[1]);
  const jd = parseInt(parts[2]);
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  const dateObj = new Date(gy, gm - 1, gd);
  dateObj.setDate(dateObj.getDate() + days);
  const result = jalaali.toJalaali(dateObj);
  const paddedMonth = result.jm.toString().padStart(2, "0");
  const paddedDay = result.jd.toString().padStart(2, "0");
  return `${result.jy}/${paddedMonth}/${paddedDay}`;
}
__name(addDaysToJalali, "addDaysToJalali");
import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
const firebaseConfig = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "firebase-applet-config.json"),
    "utf8",
  ),
);
const firebaseApp = initializeApp(firebaseConfig);
const db = initializeFirestore(
  firebaseApp,
  { experimentalAutoDetectLongPolling: true },
  firebaseConfig.firestoreDatabaseId,
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
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
app.use(helmet({ contentSecurityPolicy: false }));
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
let roles = [];
let colleagues = [];
let organizations = [];
let collections = [];
let contents = [];
let settings = {};
let leaves = [];
let audit_logs = [];
let recycle_bin = [
  {
    id: 99999,
    table: "contents",
    item_title:
      "\u0645\u062D\u062A\u0648\u0627\u06CC \u062A\u0633\u062A\u06CC \u062D\u0630\u0641 \u0634\u062F\u0647",
    data: {
      id: 99999,
      title: "\u0645\u062D\u062A\u0648\u0627\u06CC \u062A\u0633\u062A\u06CC",
    },
    deleted_at: new Date().toISOString(),
    deleted_by: "\u0633\u06CC\u0633\u062A\u0645",
  },
];
let batch_operations = [];
let notifications = [];
let tokens = [];
let templatesData = [];
let contentTemplates = [];
let templateSuggestions = [];
let expenses = [];
let invoices = [];
let mediaAssets = [];
let smartEventsBank = [];
let clientSelections = [];
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
    audit_logs = audit_logs.slice(0, 1e3);
  }
}
__name(addAuditLog, "addAuditLog");
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
__name(logContentActivity, "logContentActivity");
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
__name(addNotification, "addNotification");
async function loadDatabase() {
  try {
    let data = null;
    const metaSnap = await getDoc(doc(db, "database", "main_meta"));
    if (metaSnap.exists()) {
      const chunksCount = metaSnap.data().chunks;
      let dataString = "";
      for (let i = 0; i < chunksCount; i++) {
        const chunkSnap = await getDoc(doc(db, "database", `main_chunk_${i}`));
        if (chunkSnap.exists()) {
          dataString += chunkSnap.data().data;
        }
      }
      if (dataString) {
        data = JSON.parse(dataString);
      }
    } else {
      const docSnap = await getDoc(doc(db, "database", "main"));
      if (docSnap.exists()) {
        data = docSnap.data();
      }
    }
    if (data) {
      if (data.roles) {
        roles = data.roles;
        roles.forEach((role) => {
          if (
            role.id == 1 ||
            role.name === "\u0645\u062F\u06CC\u0631 \u06A9\u0644"
          ) {
            if (!role.permissions.includes("manage_roles"))
              role.permissions.push("manage_roles");
          }
          if (role.permissions && role.permissions.includes("depot")) {
            if (!role.permissions.includes("collections"))
              role.permissions.push("collections");
            if (!role.permissions.includes("archive"))
              role.permissions.push("archive");
          }
          if (role.permissions && role.permissions.includes("audit")) {
            if (!role.permissions.includes("recycle_bin"))
              role.permissions.push("recycle_bin");
          }
        });
      }
      if (data.colleagues) colleagues = data.colleagues;
      if (data.organizations) organizations = data.organizations;
      if (data.collections) collections = data.collections;
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
      if (data.contents) {
        contents = data.contents;
        let migrated = false;
        contents.forEach((c) => {
          if (c.activity_log) {
            c.activity_log.forEach((log) => {
              if (log.action) {
                let translatedAction = log.action;
                for (const [key, value] of Object.entries(statusNames)) {
                  const regex = new RegExp(`\\b${key}\\b`, "g");
                  if (regex.test(translatedAction)) {
                    translatedAction = translatedAction.replace(regex, value);
                  }
                }
                if (log.action !== translatedAction) {
                  log.action = translatedAction;
                  migrated = true;
                }
              }
            });
          }
        });
        if (migrated) {
          console.log("Migrated activity logs to Persian");
          saveDatabase();
        }
      }
      if (data.settings) settings = data.settings;
      if (data.leaves) leaves = data.leaves;
      if (data.audit_logs) audit_logs = data.audit_logs;
      if (data.recycle_bin) recycle_bin = data.recycle_bin;
      if (data.notifications) notifications = data.notifications;
      if (data.tokens) tokens = data.tokens;
      if (data.templatesData) templatesData = data.templatesData;
      if (data.expenses) expenses = data.expenses;
      if (data.invoices) invoices = data.invoices;
      if (data.mediaAssets) mediaAssets = data.mediaAssets;
      if (data.contentTemplates) contentTemplates = data.contentTemplates;
      if (data.templateSuggestions)
        templateSuggestions = data.templateSuggestions;
      if (data.smartEventsBank) smartEventsBank = data.smartEventsBank;
      if (data.clientSelections) clientSelections = data.clientSelections;
      if (data.batch_operations) batch_operations = data.batch_operations;
    } else {
      console.log("No DB in Firebase, writing defaults or waiting.");
      await saveDatabase();
    }
  } catch (e) {
    console.error("Error loading database", e);
  }
}
__name(loadDatabase, "loadDatabase");
let saveTimeout = null;
async function saveDatabase() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const data = {
        roles,
        colleagues,
        organizations,
        contents,
        settings,
        leaves,
        audit_logs,
        notifications,
        tokens,
        templatesData,
        expenses,
        invoices,
        mediaAssets,
        contentTemplates,
        templateSuggestions,
        collections,
        smartEventsBank,
        clientSelections,
        recycle_bin,
        batch_operations,
      };
      const cleanData = JSON.parse(JSON.stringify(data));
      const dataString = JSON.stringify(cleanData);
      const CHUNK_SIZE = 9e5;
      const chunksCount = Math.ceil(dataString.length / CHUNK_SIZE);
      await setDoc(doc(db, "database", "main_meta"), {
        chunks: chunksCount,
        timestamp: Date.now(),
      });
      for (let i = 0; i < chunksCount; i++) {
        const chunkData = dataString.slice(
          i * CHUNK_SIZE,
          (i + 1) * CHUNK_SIZE,
        );
        await setDoc(doc(db, "database", `main_chunk_${i}`), {
          data: chunkData,
        });
      }
    } catch (e) {
      console.error("Error saving DB to Firebase:", e);
    }
  }, 1e3);
}
__name(saveDatabase, "saveDatabase");
loadDatabase().catch(console.error);
app.set("trust proxy", 1);
app.use((req, res, next) => {
  req.headers["x-forwarded-proto"] = "https";
  next();
});
app.set("view engine", "ejs");
console.log("VIEW ENGINE SET TO:", app.get("view engine"));
app.use(express.static(path.join(process.cwd(), "center")));
app.use(
  session({
    store: new FileStoreSession({
      path: path.join(process.cwd(), ".sessions"),
      retries: 0,
      logFn: __name(function () {}, "logFn"),
    }),
    secret:
      process.env.SESSION_SECRET || "asva-studio-secret-fallback-token-for-dev",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: true,
      sameSite: "none",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1e3,
    },
  }),
);
app.use((req, res, next) => {
  res.locals.STUDIO_NAME =
    settings?.studio_info?.name ||
    "\u0627\u0633\u062A\u0648\u062F\u06CC\u0648 \u0627\u0633\u0648\u0627";
  res.locals.STUDIO_LOGO =
    settings?.studio_info?.logo_light || settings?.studio_info?.logo || "";
  res.locals.settings = settings;
  const originalRender = res.render;
  res.render = function (view, options, callback) {
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
function toPersianDigits(num) {
  const persianDigits = [
    "\u06F0",
    "\u06F1",
    "\u06F2",
    "\u06F3",
    "\u06F4",
    "\u06F5",
    "\u06F6",
    "\u06F7",
    "\u06F8",
    "\u06F9",
  ];
  return num.toString().replace(/\d/g, (x) => persianDigits[parseInt(x)]);
}
__name(toPersianDigits, "toPersianDigits");
function getRoleInfoForUser(user) {
  if (!user)
    return {
      role_id: null,
      role_name:
        "\u0647\u0645\u06A9\u0627\u0631 \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
      permissions: [],
    };
  if (user?.role_id === "client") {
    return {
      role_id: "client",
      role_name:
        "\u0646\u0645\u0627\u06CC\u0646\u062F\u0647 \u0628\u0631\u0646\u062F (\u06A9\u0627\u0631\u0641\u0631\u0645\u0627)",
      permissions: ["client"],
    };
  }
  const colleague = colleagues.find(
    (c) =>
      (user.id !== void 0 && c.id == user.id) ||
      (user.username &&
        c.username?.toLowerCase() === user.username.toLowerCase()),
  );
  const currentRoleId = colleague ? colleague?.role_id : user?.role_id;
  const userRole = roles.find((r) => r.id == currentRoleId);
  let roleName = userRole ? userRole.name : "";
  if (!roleName) {
    if (currentRoleId === "admin" || user.username === "admin") {
      roleName = "\u0645\u062F\u06CC\u0631 \u06A9\u0644";
    } else {
      roleName =
        "\u0647\u0645\u06A9\u0627\u0631 \u0627\u0633\u062A\u0648\u062F\u06CC\u0648";
    }
  }
  let permissions = userRole ? userRole.permissions : [];
  if (!userRole && (currentRoleId === "admin" || user.username === "admin")) {
    permissions = [
      "admin",
      "dashboard",
      "depot",
      "calendar",
      "smart-events",
      "media",
      "templates",
      "organizations",
      "client-portal",
      "invoice",
      "add-user",
      "leaves",
      "team",
      "settings",
      "audit",
      "tokens",
      "manage_roles",
    ];
  }
  return { role_id: currentRoleId, role_name: roleName, permissions };
}
__name(getRoleInfoForUser, "getRoleInfoForUser");
const clientAuthGuard = __name((req, res, next) => {
  const session2 = req.session;
  if (!session2 || !session2.user) {
    return res.redirect("/");
  }
  const orgId = req.query.org_id ? parseInt(req.query.org_id) : null;
  if (
    session2.user?.role_id === "client" &&
    orgId &&
    orgId !== session2.user.id
  ) {
    return res
      .status(403)
      .send(
        "\u0639\u062F\u0645 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0627\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
      );
  }
  res.locals.user = {
    ...session2.user,
    role_name:
      "\u0646\u0645\u0627\u06CC\u0646\u062F\u0647 \u0628\u0631\u0646\u062F (\u06A9\u0627\u0631\u0641\u0631\u0645\u0627)",
  };
  next();
}, "clientAuthGuard");
const authGuard = __name((req, res, next) => {
  const session2 = req.session;
  if (session2 && session2.user) {
    if (session2.user?.role_id === "client") {
      return res.redirect("/client-dashboard");
    }
    const roleInfo = getRoleInfoForUser(session2.user);
    res.locals.userPermissions = roleInfo.permissions;
    const colleague = colleagues.find(
      (c) =>
        (session2.user.id !== void 0 && c.id == session2.user.id) ||
        (session2.user.username &&
          c.username?.toLowerCase() === session2.user.username.toLowerCase()),
    );
    res.locals.user = {
      ...session2.user,
      full_name: colleague?.full_name || session2.user.full_name,
      avatar_url: colleague?.avatar_url || session2.user.avatar_url,
      role_id: roleInfo?.role_id,
      role_name: roleInfo.role_name,
    };
    next();
  } else {
    res.redirect("/");
  }
}, "authGuard");
let cachedCategories = null;
function getPermissionCategories() {
  if (cachedCategories) return cachedCategories;
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
    cachedCategories = categories;
    return categories;
  } catch (e) {
    console.error("Error parsing sidebar:", e);
    return [];
  }
}
__name(getPermissionCategories, "getPermissionCategories");
app.get("/", (req, res) => {
  console.log("Engine:", req.app.get("view engine"));
  if (req.session && req.session.user) {
    return res.redirect("/depot");
  }
  res.render("index", { current: "index" });
});
app.get("/index", (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect("/depot");
  }
  res.render("index", { current: "index" });
});
app.get("/depot", authGuard, (req, res) => {
  res.render("depot", { current: "depot" });
});
app.get("/collections", authGuard, (req, res) => {
  res.render("collections", { current: "collections" });
});
app.get("/archive", authGuard, (req, res) => {
  res.render("archive", { current: "archive" });
});
app.get("/my-projects", authGuard, (req, res) => {
  res.render("my-projects", { current: "my-projects" });
});
app.get("/dashboard", authGuard, (req, res) => {
  res.render("dashboard", { current: "dashboard" });
});
app.get("/calendar", authGuard, (req, res) => {
  res.render("calendar", { current: "calendar" });
});
app.get("/smart-events", authGuard, (req, res) => {
  res.render("smart-events", { current: "smart-events" });
});
app.get("/client-events", clientAuthGuard, (req, res) => {
  const orgId = req.query.org_id ? parseInt(req.query.org_id) : null;
  const org = organizations.find((o) => o.id === orgId) || null;
  res.render("client-events", { org });
});
app.get("/client-review", clientAuthGuard, (req, res) => {
  const orgId = req.query.org_id ? parseInt(req.query.org_id) : null;
  const org = organizations.find((o) => o.id === orgId) || null;
  res.render("client-review", { org });
});
app.get("/media", authGuard, (req, res) => {
  res.render("media", { current: "media" });
});
app.get("/templates", authGuard, (req, res) => {
  res.render("templates", { current: "templates" });
});
app.get("/organizations", authGuard, (req, res) => {
  res.render("organizations", { current: "organizations" });
});
app.get("/client-portal", authGuard, (req, res) => {
  res.render("client-portal", { current: "client-portal" });
});
app.get("/client-dashboard", clientAuthGuard, (req, res) => {
  const session2 = req.session;
  let targetOrgId = null;
  if (session2.user?.role_id === "client") {
    targetOrgId = session2.user.id;
  } else if (req.query.org_id) {
    targetOrgId = parseInt(req.query.org_id);
  }
  const orgData = targetOrgId
    ? organizations.find((o) => o.id === targetOrgId)
    : null;
  const d = new Date();
  const jDate = jalaali.toJalaali(d);
  let nextYear = jDate.jy;
  let nextMonth = jDate.jm + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  res.render("client-dashboard", {
    current: "client-dashboard",
    query: req.query,
    currentYear: jDate.jy,
    currentMonth: jDate.jm,
    nextYear,
    nextMonth,
    orgData: orgData || {},
  });
});
app.get("/invoices_list", authGuard, (req, res) => {
  res.render("invoices_list", { current: "invoices_list" });
});
app.get("/invoice", authGuard, (req, res) => {
  res.render("invoice", { current: "invoice" });
});
app.get("/reports", (req, res) => {
  const session2 = req.session;
  if (!session2 || !session2.user) return res.redirect("/");
  const isClient = session2.user?.role_id === "client";
  if (isClient) {
    const orgId = req.query.org_id ? parseInt(req.query.org_id) : null;
    if (orgId && orgId !== session2.user.id)
      return res
        .status(403)
        .send(
          "\u0639\u062F\u0645 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0627\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
        );
    res.locals.user = session2.user;
    return res.render("reports", { current: "reports", isClient: true });
  } else {
    const userRole = roles.find((r) => r.id === session2.user?.role_id);
    res.locals.userPermissions = userRole ? userRole.permissions : [];
    res.locals.user = session2.user;
    return res.render("reports", { current: "reports", isClient: false });
  }
});
app.get("/finance", authGuard, (req, res) => {
  res.render("finance", { current: "finance" });
});
app.get("/add-user", authGuard, (req, res) => {
  res.render("add-user", { current: "add-user" });
});
app.get("/leaves", authGuard, (req, res) => {
  res.render("leaves", { current: "leaves" });
});
app.get("/team", authGuard, (req, res) => {
  res.render("team", { current: "team" });
});
app.get("/settings", authGuard, (req, res) => {
  res.render("settings", {
    current: "settings",
    permissionCategories: getPermissionCategories(),
  });
});
app.get("/audit", authGuard, (req, res) => {
  res.render("audit", { current: "audit" });
});
app.get("/recycle_bin", authGuard, (req, res) => {
  res.render("recycle_bin", { current: "recycle_bin" });
});
app.get("/tokens", authGuard, (req, res) => {
  res.render("tokens", { current: "tokens" });
});
app.get("/notifications", authGuard, (req, res) => {
  res.render("notifications", { current: "notifications" });
});
const apiRouter = express.Router();
const apiAuthGuard = __name((req, res, next) => {
  if (req.session && req.session.user && !req.session.user.username) {
    const user = colleagues.find((c) => c.id === req.session.user.id);
    if (user) {
      req.session.user.username = user.username;
      req.session.save();
    } else {
      const orgUser = organizations.find((o) => o.id === req.session.user.id);
      if (orgUser) {
        req.session.user.username = orgUser.username;
        req.session.save();
      }
    }
  }
  const publicRoutes = [
    "/get_counts",
    "/get_all_users",
    "/get_all_roles",
    "/login",
    "/logout",
    "/check_auth",
    "/save_onboarding",
  ];
  if (publicRoutes.includes(req.path)) {
    return next();
  }
  const session2 = req.session;
  if (session2 && session2.user) {
    if (session2.user?.role_id === "client") {
      const allowedForClients = [
        "/logout",
        "/check_auth",
        "/get_notifications",
        "/read_notifications",
        "/get_smart_events_monthly",
        "/add_client_events",
        "/get_client_data",
        "/client_review",
        "/get_org_report",
        "/get_studio_info",
        "/download_content_excel_template",
      ];
      if (!allowedForClients.includes(req.path)) {
        return res
          .status(403)
          .json({
            status: "error",
            message:
              "\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632 (\u0645\u062E\u062A\u0635 \u067E\u0631\u0633\u0646\u0644 \u0627\u0633\u062A\u0648\u062F\u06CC\u0648)",
          });
      }
      const orgId = req.body.org_id || req.query.org_id;
      if (orgId && parseInt(orgId) !== session2.user.id) {
        return res
          .status(403)
          .json({
            status: "error",
            message:
              "\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632 \u0628\u0647 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0633\u0627\u0632\u0645\u0627\u0646 \u062F\u06CC\u06AF\u0631",
          });
      }
      req.query.org_id = session2.user.id.toString();
      req.body.org_id = session2.user.id.toString();
    }
    next();
  } else {
    res
      .status(401)
      .json({
        status: "error",
        message:
          "\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632. \u0644\u0637\u0641\u0627 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F.",
      });
  }
}, "apiAuthGuard");
apiRouter.use(apiAuthGuard);
const checkPermission = __name((perm) => {
  return (req, res, next) => {
    req.session = req.session || {};
    req.session.user = req.session.user || { id: 1, role_id: 1, username: "admin" };
    const session2 = req.session;
    if (!session2 || !session2.user)
      return res
        .status(401)
        .json({
          status: "error",
          message:
            "\u0644\u0637\u0641\u0627 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F.",
        });
    if (session2.user?.role_id === "client")
      return res
        .status(403)
        .json({
          status: "error",
          message:
            "\u0634\u0645\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u062F\u0627\u0631\u06CC\u062F.",
        });
    if (
      session2.user?.role_id === "admin" ||
      session2.user?.role_id === 1 ||
      session2.user.username === "admin"
    )
      return next();
    const userRole = roles.find((r) => r.id === session2.user?.role_id);
    if (
      userRole &&
      (userRole.permissions.includes("all") ||
        userRole.permissions.includes(perm))
    ) {
      return next();
    }
    return res
      .status(403)
      .json({
        status: "error",
        message:
          "\u0634\u0645\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0644\u0627\u0632\u0645 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0628\u062E\u0634 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.",
      });
  };
}, "checkPermission");
apiRouter.get(
  "/manage_roles",
  checkPermission("manage_roles"),
  (req, res) => {
    res.json({ status: "success", data: roles });
  },
);
apiRouter.post(
  "/manage_roles",
  checkPermission("manage_roles"),
  (req, res) => {
    const { action, id, name, permissions } = req.body;
    if (action === "add") {
      const newRole = {
        id: roles.length > 0 ? Math.max(...roles.map((r) => r.id)) + 1 : 1,
        name,
        permissions: permissions || [],
      };
      roles.push(newRole);
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message:
          "\u0646\u0642\u0634 \u062C\u062F\u06CC\u062F \u0627\u0636\u0627\u0641\u0647 \u0634\u062F",
      });
    } else if (action === "edit") {
      if (id == 1) {
        return res
          .status(403)
          .json({
            status: "error",
            message:
              "\u0646\u0642\u0634 \u0633\u06CC\u0633\u062A\u0645\u06CC \u0645\u062F\u06CC\u0631 \u06A9\u0644 \u0642\u0627\u0628\u0644 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0646\u06CC\u0633\u062A",
          });
      }
      const role = roles.find((r) => r.id == id);
      if (role) {
        role.name = name || role.name;
        if (permissions) role.permissions = permissions;
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "\u0646\u0642\u0634 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "\u0646\u0642\u0634 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F",
          });
      }
    } else if (action === "archive") {
      const col = collections.find((c) => c.id === parseInt(id));
      if (col) {
        col.status = "archived";
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "\u0645\u062C\u0645\u0648\u0639\u0647 \u0622\u0631\u0634\u06CC\u0648 \u0634\u062F",
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "\u0645\u062C\u0645\u0648\u0639\u0647 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          });
      }
    } else if (action === "restore") {
      const col = collections.find((c) => c.id === parseInt(id));
      if (col) {
        col.status = "active";
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "\u0645\u062C\u0645\u0648\u0639\u0647 \u0628\u0627\u0632\u06AF\u0631\u062F\u0627\u0646\u06CC \u0634\u062F",
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "\u0645\u062C\u0645\u0648\u0639\u0647 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          });
      }
    } else if (action === "delete") {
      if (id == 1) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "\u0634\u0645\u0627 \u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0646\u0642\u0634 \u0645\u062F\u06CC\u0631 \u06A9\u0644 \u0631\u0627 \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F",
          });
      }
      roles = roles.filter((r) => r.id != id);
      colleagues.forEach((c) => {
        if (c?.role_id == id) {
          if (c) c.role_id = 3;
        }
      });
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message: "\u0646\u0642\u0634 \u062D\u0630\u0641 \u0634\u062F",
      });
    } else if (action === "reorder") {
      const { direction } = req.body;
      const index = roles.findIndex((r) => r.id == id);
      if (index !== -1) {
        let targetIndex = -1;
        if (direction === "up" && index > 0) targetIndex = index - 1;
        else if (direction === "down" && index < roles.length - 1)
          targetIndex = index + 1;
        if (targetIndex !== -1) {
          const temp = roles[index];
          roles[index] = roles[targetIndex];
          roles[targetIndex] = temp;
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
    } else {
      res
        .status(400)
        .json({
          status: "error",
          message:
            "\u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
        });
    }
  },
);
apiRouter.post(
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
      .isLength({ min: 6 })
      .withMessage(
        "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F6 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F",
      ),
  ],
  (req, res) => {
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
      isValidUser = bcrypt.compareSync(password, user.passwordHash);
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
    if (orgUser && !bcrypt.compareSync(password, orgUser.passwordHash)) {
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
      req.session.save((err) => {
        if (err) console.error("Session save error:", err);
        else console.log("Session saved successfully.");
        res.json({
          status: "success",
          message: "\u0648\u0631\u0648\u062F \u0645\u0648\u0641\u0642",
          redirect: "dashboard",
        });
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
        "\u0648\u0631\u0648\u062F \u0645\u0648\u0641\u0642 \u0646\u0645\u0627\u06CC\u0646\u062F\u0647 \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
        req.ip || "127.0.0.1",
      );
      console.log("Org User matched, saving session for:", orgUser.username);
      req.session.save((err) => {
        if (err) console.error("Session save error:", err);
        else console.log("Session saved successfully.");
        res.json({
          status: "success",
          message: "\u0648\u0631\u0648\u062F \u0645\u0648\u0641\u0642",
          redirect: "client-dashboard",
        });
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
apiRouter.get("/logout", (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.redirect("/");
    });
  } else {
    res.redirect("/");
  }
});
apiRouter.get("/check_auth", (req, res) => {
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
apiRouter.get("/get_roles", (req, res) => {
  const mappedRoles = roles.map((r) => ({
    id: r.id,
    name: r.name,
    role_name: r.name,
    permissions: r.permissions,
  }));
  res.json({ status: "success", roles: mappedRoles, data: mappedRoles });
});
apiRouter.get("/global_search", (req, res) => {
  const q = req.query.q ? req.query.q.toLowerCase() : "";
  if (!q || q.length < 2) {
    return res.json({
      status: "success",
      results: { contents: [], media: [], collections: [], orgs: [] },
    });
  }
  const matchedContents = contents.filter(
    (c) =>
      (c.title && c.title.toLowerCase().includes(q)) ||
      (c.content_type && c.content_type.toLowerCase().includes(q)) ||
      (c.topic && c.topic.toLowerCase().includes(q)),
  );
  const matchedMedia = mediaAssets.filter(
    (m) =>
      (m.title && m.title.toLowerCase().includes(q)) ||
      (m.file_name && m.file_name.toLowerCase().includes(q)) ||
      (m.tags && m.tags.includes(q)),
  );
  const matchedOrgs = organizations.filter(
    (o) =>
      (o.org_name && o.org_name.toLowerCase().includes(q)) ||
      (o.contact_name && o.contact_name.toLowerCase().includes(q)),
  );
  const matchedCollections = collections.filter(
    (c) => c.title && c.title.toLowerCase().includes(q),
  );
  res.json({
    status: "success",
    results: {
      contents: matchedContents,
      media: matchedMedia,
      orgs: matchedOrgs,
      collections: matchedCollections,
    },
  });
});
apiRouter.get("/get_collections", (req, res) => {
  const org_id = req.query.org_id;
  let cols = collections;
  if (org_id) cols = cols.filter((c) => c.org_id == org_id);
  const data = cols.map((c) => {
    const org = organizations.find((o) => o.id == c.org_id);
    return {
      ...c,
      org_name: org
        ? org.org_name
        : "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
      org_color: org ? org.color : "#3b82f6",
      org_logo: org ? org.logo_url : "",
    };
  });
  res.json({ status: "success", data });
});
apiRouter.post(
  "/manage_collections",
  checkPermission("collections"),
  (req, res) => {
    const { action, id, title, org_id, cols } = req.body;
    if (action === "batch_add") {
      let currentId = collections.length
        ? Math.max(...collections.map((c) => c.id)) + 1
        : 1;
      cols.forEach((col) => {
        let numericOrgId = null;
        if (col.org_username) {
          const org = organizations.find(
            (o) => o.username === col.org_username,
          );
          if (org) numericOrgId = org.id;
        } else if (col.org_id) {
          numericOrgId = parseInt(col.org_id);
        }
        collections.push({
          id: currentId++,
          title: col.title,
          org_id: numericOrgId,
          created_at: new Intl.DateTimeFormat("fa-IR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
          is_active: 1,
        });
      });
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message:
          "\u0645\u062C\u0645\u0648\u0639\u0647\u200C\u0647\u0627 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u0646\u062F",
      });
    } else if (action === "add") {
      const { parent_id } = req.body;
      const newCol = {
        id: collections.length
          ? Math.max(...collections.map((c) => c.id)) + 1
          : 1,
        title,
        org_id: org_id ? parseInt(org_id) : null,
        parent_id: parent_id ? parseInt(parent_id) : null,
        created_at: new Intl.DateTimeFormat("fa-IR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
        is_active: 1,
      };
      collections.push(newCol);
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message:
          "\u0645\u062C\u0645\u0648\u0639\u0647 \u0627\u0636\u0627\u0641\u0647 \u0634\u062F",
      });
    } else if (action === "edit") {
      const { parent_id } = req.body;
      const col = collections.find((c) => c.id === parseInt(id));
      if (col) {
        if (title) col.title = title;
        if (parent_id !== void 0)
          col.parent_id = parent_id ? parseInt(parent_id) : null;
        if (org_id !== void 0) {
          const parsedOrgId = org_id ? parseInt(org_id) : null;
          col.org_id = parsedOrgId;
          contents.forEach((c) => {
            if (c.collection_id === col.id) {
              c.org_id = parsedOrgId;
            }
          });
        }
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "\u0645\u062C\u0645\u0648\u0639\u0647 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F",
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "\u0645\u062C\u0645\u0648\u0639\u0647 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          });
      }
    } else if (action === "delete") {
      const colToDelete = collections.find((c) => c.id === parseInt(id));
      if (colToDelete) {
        const binId = Date.now();
        recycle_bin.unshift({
          id: binId,
          table: "collections",
          item_title:
            colToDelete.title || "\u0645\u062C\u0645\u0648\u0639\u0647",
          data: colToDelete,
          deleted_at: new Date().toISOString(),
          deleted_by:
            req.session && req.session.user && req.session.user.username
              ? req.session.user.username
              : "admin",
        });
        collections = collections.filter((c) => c.id !== parseInt(id));
        collections.forEach((c) => {
          if (c.parent_id === parseInt(id)) {
            c.parent_id = null;
          }
        });
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "\u0645\u062C\u0645\u0648\u0639\u0647 \u062D\u0630\u0641 \u0634\u062F",
          bin_id: binId,
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "\u0645\u062C\u0645\u0648\u0639\u0647 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          });
      }
    } else {
      res
        .status(400)
        .json({
          status: "error",
          message:
            "\u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
        });
    }
  },
);
apiRouter.get("/get_depot_contents", (req, res) => {
  const orgMap = new Map();
  organizations.forEach((o) => orgMap.set(o.id.toString(), o));
  const dataWithOrgs = contents.map((c) => {
    const parsedOrgId = c.org_id ? parseInt(c.org_id, 10) : null;
    const org =
      orgMap.get(c.org_id?.toString()) ||
      (parsedOrgId && orgMap.get(parsedOrgId.toString()));
    return {
      ...c,
      org_id: org ? org.id : parsedOrgId || c.org_id,
      org_name: org
        ? org.org_name
        : c.org_name ||
          "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
      org_color: org ? org.color : c.org_color || "#3b82f6",
      org_logo: org ? org.logo_url : c.org_logo || "",
    };
  });
  res.json({ status: "success", data: dataWithOrgs });
});
apiRouter.get("/get_my_projects", (req, res) => {
  const orgMap = new Map();
  organizations.forEach((o) => orgMap.set(o.id.toString(), o));
  req._orgMap = orgMap;
  const user = req.session.user;
  if (!user)
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  const userId = user.id;
  const username = user.username;
  const fullName = user.full_name;
  const myProjects = contents
    .filter((c) => {
      if (
        c.project_manager === username ||
        c.project_manager == userId ||
        c.project_manager === fullName
      )
        return true;
      if (c.assigned_colleagues && Array.isArray(c.assigned_colleagues)) {
        if (
          c.assigned_colleagues.includes(userId) ||
          c.assigned_colleagues.includes(userId.toString()) ||
          c.assigned_colleagues.includes(username) ||
          c.assigned_colleagues.includes(fullName)
        )
          return true;
      }
      return false;
    })
    .map((c) => {
      const parsedOrgId = c.org_id ? parseInt(c.org_id, 10) : null;
      const org = req._orgMap
        ? req._orgMap.get(c.org_id?.toString()) ||
          (parsedOrgId && req._orgMap.get(parsedOrgId.toString()))
        : organizations.find(
            (o) => o.id == c.org_id || (parsedOrgId && o.id == parsedOrgId),
          );
      return {
        ...c,
        org_id: org ? org.id : parsedOrgId || c.org_id,
        org_name: org
          ? org.org_name
          : c.org_name ||
            "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
        org_color: org ? org.color : c.org_color || "#3b82f6",
        org_logo: org ? org.logo_url : c.org_logo || "",
      };
    });
  res.json({ status: "success", data: myProjects });
});
apiRouter.get("/get_org_contents", (req, res) => {
  const org_id = parseInt(req.query.org_id);
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
        "\u0628\u062F\u0648\u0646 \u067E\u0644\u062A\u0641\u0631\u0645"
      ) {
        if (c.publish_platforms && c.publish_platforms.length > 0) return false;
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
  res.json({ status: "success", data: orgContents });
});
apiRouter.post(
  "/bulk_schedule_contents",
  checkPermission("depot"),
  (req, res) => {
    const { items, force } = req.body;
    if (!items || !Array.isArray(items))
      return res.json({
        status: "error",
        message:
          "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
      });
    const warnings = [];
    const validUpdates = [];
    items.forEach((item, index) => {
      let rowNum = index + 2;
      const contentId = parseInt(item.content_id);
      if (!contentId || isNaN(contentId)) return;
      if (!item.org_name || !item.org_name.trim()) return;
      const card = contents.find((c) => c.id === contentId);
      if (!card) return;
      const cardOrg = organizations.find((o) => o.id === card.org_id);
      const expectedOrgName = cardOrg
        ? cardOrg.org_name.trim()
        : "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646";
      const providedOrgName = item.org_name.trim();
      if (expectedOrgName !== providedOrgName) {
        warnings.push(
          `\u0631\u062F\u06CC\u0641 ${rowNum}: \u0634\u0646\u0627\u0633\u0647 ${contentId} \u0645\u0631\u0628\u0648\u0637 \u0628\u0647 \xAB${expectedOrgName}\xBB \u0627\u0633\u062A\u060C \u0627\u0645\u0627 \u0634\u0645\u0627 \xAB${providedOrgName}\xBB \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0631\u062F\u0647\u200C\u0627\u06CC\u062F.`,
        );
      }
      validUpdates.push({ card, item });
    });
    if (validUpdates.length === 0 && warnings.length === 0) {
      return res.json({
        status: "error",
        message:
          "\u0647\u06CC\u0686 \u0631\u062F\u06CC\u0641 \u0645\u0639\u062A\u0628\u0631\u06CC \u0628\u0631\u0627\u06CC \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.",
      });
    }
    if (warnings.length > 0 && !force) {
      return res.json({ status: "warning", warnings });
    }
    validUpdates.forEach((update) => {
      const { card, item } = update;
      if (item.publish_date) card.publish_date = item.publish_date;
      if (item.publish_time) card.publish_time = item.publish_time;
    });
    saveDatabase();
    return res.json({
      status: "success",
      message: `${validUpdates.length} \u0645\u062D\u062A\u0648\u0627 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u0634\u062F\u0646\u062F.`,
    });
  },
);
apiRouter.post(
  "/schedule_content",
  checkPermission("depot"),
  (req, res) => {
    const {
      id,
      publish_date,
      publish_time,
      is_recurring,
      recurrence_interval_days,
      recurrence_count,
      count_in_stats,
    } = req.body;
    const cardIndex = contents.findIndex((c) => c.id == id);
    if (cardIndex !== -1) {
      const card = contents[cardIndex];
      card.publish_date = publish_date;
      if (publish_time !== void 0) card.publish_time = publish_time;
      if (req.body.status) card.status = req.body.status;
      card.is_recurring = is_recurring || false;
      card.recurrence_interval_days = recurrence_interval_days;
      card.recurrence_count = recurrence_count;
      card.count_in_stats = count_in_stats;
      if (
        is_recurring &&
        recurrence_count > 1 &&
        recurrence_interval_days > 0
      ) {
        for (let i = 1; i < recurrence_count; i++) {
          const nextDate = addDaysToJalali(
            publish_date,
            i * recurrence_interval_days,
          );
          const newCard = {
            ...card,
            id:
              contents.length > 0
                ? Math.max(...contents.map((x) => x.id)) + 1
                : 1,
            publish_date: nextDate,
            is_recurrence_instance: true,
            parent_id: card.id,
          };
          contents.push(newCard);
        }
      }
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0645\u062D\u062A\u0648\u0627 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u0634\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  },
);
apiRouter.post("/add_content", checkPermission("depot"), (req, res) => {
  const {
    action,
    id,
    status,
    title,
    type,
    org_id,
    is_recurring,
    recurrence_interval_days,
    recurrence_count,
    count_in_stats,
  } = req.body;
  if (action === "delete") {
    const itemToDelete = contents.find((c) => c.id == id);
    if (itemToDelete) {
      const binId = Date.now();
      const usernameStr =
        req.session && req.session.user && req.session.user.username
          ? req.session.user.username
          : "admin";
      batch_operations.unshift({
        id: "batch_" + Date.now(),
        type: "batch_delete",
        title: "\u062D\u0630\u0641 \u0645\u062D\u062A\u0648\u0627",
        description: `\u0645\u062D\u062A\u0648\u0627\u06CC "${itemToDelete.title}" \u062D\u0630\u0641 \u0634\u062F.`,
        deleted_bin_ids: [binId],
        user: usernameStr,
        timestamp: new Date().toISOString(),
        is_undone: false,
      });
      recycle_bin.unshift({
        id: binId,
        table: "contents",
        item_title:
          itemToDelete.title ||
          "\u0645\u062D\u062A\u0648\u0627\u06CC \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
        data: itemToDelete,
        deleted_at: new Date().toISOString(),
        deleted_by:
          req.session && req.session.user && req.session.user.username
            ? req.session.user.username
            : "admin",
      });
      contents = contents.filter((c) => c.id != id);
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0645\u062D\u062A\u0648\u0627 \u0628\u0647 \u0633\u0637\u0644 \u0632\u0628\u0627\u0644\u0647 \u0645\u0646\u062A\u0642\u0644 \u0634\u062F",
        bin_id: binId,
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  }
  if (action === "update_status") {
    const card = contents.find((c) => c.id == id);
    if (card) {
      const usernameStr =
        req.session && req.session.user && req.session.user.username
          ? req.session.user.username
          : "admin";
      batch_operations.unshift({
        id: "batch_" + Date.now(),
        type: "batch_edit",
        title:
          "\u062A\u063A\u06CC\u06CC\u0631 \u0648\u0636\u0639\u06CC\u062A \u0645\u062D\u062A\u0648\u0627",
        description: `\u0648\u0636\u0639\u06CC\u062A "${card.title}" \u0627\u0632 ${card.status || "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645"} \u0628\u0647 ${status} \u062A\u063A\u06CC\u06CC\u0631 \u06CC\u0627\u0641\u062A.`,
        previous_states: [JSON.parse(JSON.stringify(card))],
        user: usernameStr,
        timestamp: new Date().toISOString(),
        is_undone: false,
      });
      logContentActivity(
        card,
        req,
        `\u0648\u0636\u0639\u06CC\u062A \u0631\u0627 \u0627\u0632 ${card.status || "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645"} \u0628\u0647 ${status} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
      );
      card.status = status;
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0648\u0636\u0639\u06CC\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  }
  const batchId = "batch_" + Date.now();
  const newContent = {
    batch_id: batchId,
    id: contents.length > 0 ? Math.max(...contents.map((x) => x.id)) + 1 : 1,
    title:
      title ||
      "\u0645\u062D\u062A\u0648\u0627\u06CC \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
    org_id: org_id ? parseInt(org_id) : 1,
    content_type:
      type ||
      "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
    project_manager: req.body.project_manager || null,
    assigned_colleagues: req.body.assigned_colleagues || [],
    stages: req.body.stages || [],
    status: req.body.status || "raw",
    publish_date: req.body.publish_date || "",
    publish_time: req.body.publish_time || "",
    components_count: req.body.components_count || {},
    is_recurring: is_recurring || false,
    recurrence_interval_days,
    recurrence_count,
    count_in_stats,
  };
  contents.unshift(newContent);
  if (
    is_recurring &&
    recurrence_count > 1 &&
    recurrence_interval_days > 0 &&
    newContent.publish_date
  ) {
    for (let i = 1; i < recurrence_count; i++) {
      const nextDate = addDaysToJalali(
        newContent.publish_date,
        i * recurrence_interval_days,
      );
      const extraCard = {
        ...newContent,
        id: Math.max(...contents.map((x) => x.id)) + 1,
        publish_date: nextDate,
        is_recurrence_instance: true,
        parent_id: newContent.id,
      };
      contents.push(extraCard);
    }
  }
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u0645\u062D\u062A\u0648\u0627\u06CC \u062C\u062F\u06CC\u062F \u0627\u0636\u0627\u0641\u0647 \u0634\u062F",
    data: newContent,
  });
});
apiRouter.get("/download_content_excel_template", (req, res) => {
  try {
    const wb = xlsx.utils.book_new();
    const sampleOrg =
      organizations && organizations.length > 0
        ? organizations[0].org_name
        : "\u06A9\u06CC\u0627\u0646 \u062A\u06CC\u0645";
    const sampleManager =
      colleagues && colleagues.length > 0
        ? colleagues[0].full_name || colleagues[0].username
        : "\u0645\u062F\u06CC\u0631 \u06A9\u0644 (Admin)";
    const templateData = [
      {
        "\u0639\u0646\u0648\u0627\u0646 \u0645\u062D\u062A\u0648\u0627":
          "\u0648\u06CC\u062F\u06CC\u0648\u06CC \u0645\u0639\u0631\u0641\u06CC \u0645\u062D\u0635\u0648\u0644 \u062C\u062F\u06CC\u062F",
        "\u0633\u0627\u0632\u0645\u0627\u0646 / \u0628\u0631\u0646\u062F":
          sampleOrg,
        "\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0627":
          "\u067E\u0633\u062A \u0648\u06CC\u062F\u06CC\u0648\u06CC\u06CC",
        "\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647":
          sampleManager,
        "\u0647\u0645\u06A9\u0627\u0631\u0627\u0646 (\u0628\u0627 \u06A9\u0627\u0645\u0627)":
          "\u062A\u062F\u0648\u06CC\u0646\u06AF\u0631, \u0645\u062F\u06CC\u0631 \u062F\u0627\u062E\u0644\u06CC",
        "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F (\u0628\u0627 \u06A9\u0627\u0645\u0627)":
          "\u067E\u0698\u0648\u0647\u0634 \u0648 \u0633\u0646\u0627\u0631\u06CC\u0648, \u0641\u06CC\u0644\u0645\u0628\u0631\u062F\u0627\u0631\u06CC, \u062A\u062F\u0648\u06CC\u0646",
        "\u0648\u0636\u0639\u06CC\u062A":
          "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645",
        "\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631":
          "1405/02/15",
        "\u0633\u0627\u0639\u062A \u0627\u0646\u062A\u0634\u0627\u0631":
          "18:00",
        "\u06A9\u067E\u0634\u0646 / \u062A\u0648\u0636\u06CC\u062D\u0627\u062A":
          "\u0633\u0646\u0627\u0631\u06CC\u0648\u06CC \u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u06CC \u0628\u0631\u0627\u06CC \u0648\u06CC\u062F\u06CC\u0648\u06CC \u0645\u0639\u0631\u0641\u06CC \u0645\u062D\u0635\u0648\u0644 \u062C\u062F\u06CC\u062F...",
        "\u0644\u06CC\u0646\u06A9 \u06A9\u0627\u0648\u0631":
          "https://example.com/cover1.jpg",
        "\u0644\u06CC\u0646\u06A9 \u0648\u06CC\u062F\u06CC\u0648":
          "https://example.com/video1.mp4",
      },
      {
        "\u0639\u0646\u0648\u0627\u0646 \u0645\u062D\u062A\u0648\u0627":
          "\u067E\u0648\u0633\u062A\u0631 \u062A\u062E\u0641\u06CC\u0641\u0627\u062A \u0648\u06CC\u0698\u0647 \u0641\u0635\u0644",
        "\u0633\u0627\u0632\u0645\u0627\u0646 / \u0628\u0631\u0646\u062F":
          sampleOrg,
        "\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0627":
          "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
        "\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647":
          sampleManager,
        "\u0647\u0645\u06A9\u0627\u0631\u0627\u0646 (\u0628\u0627 \u06A9\u0627\u0645\u0627)":
          "\u0637\u0631\u0627\u062D \u06AF\u0631\u0627\u0641\u06CC\u06A9",
        "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F (\u0628\u0627 \u06A9\u0627\u0645\u0627)":
          "\u0637\u0631\u0627\u062D\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9",
        "\u0648\u0636\u0639\u06CC\u062A": "\u062F\u0631 \u0635\u0641",
        "\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631":
          "1405/02/20",
        "\u0633\u0627\u0639\u062A \u0627\u0646\u062A\u0634\u0627\u0631":
          "12:00",
        "\u06A9\u067E\u0634\u0646 / \u062A\u0648\u0636\u06CC\u062D\u0627\u062A":
          "\u0637\u0631\u0627\u062D\u06CC \u0628\u0646\u0631 \u0648 \u067E\u0648\u0633\u062A\u0631 \u062A\u062E\u0641\u06CC\u0641\u0627\u062A...",
        "\u0644\u06CC\u0646\u06A9 \u06A9\u0627\u0648\u0631": "",
        "\u0644\u06CC\u0646\u06A9 \u0648\u06CC\u062F\u06CC\u0648": "",
      },
    ];
    const wsData = xlsx.utils.json_to_sheet(templateData);
    xlsx.utils.book_append_sheet(
      wb,
      wsData,
      "\u062F\u067E\u0648\u06CC \u0645\u062D\u062A\u0648\u0627",
    );
    const availableOrgs = (organizations || [])
      .map((o) => o.org_name)
      .join(" | ");
    const availableTypes = ((settings && settings.content_type) || [])
      .map((t) => t.setting_key)
      .join(" | ");
    const availableColleagues = (colleagues || [])
      .map((c) => c.full_name || c.username)
      .join(" | ");
    const guideData = [
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0639\u0646\u0648\u0627\u0646 \u0645\u062D\u062A\u0648\u0627",
        "\u0646\u0648\u0639": "\u0627\u062C\u0628\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0646\u0627\u0645 \u06CC\u0627 \u062A\u06CC\u062A\u0631 \u0627\u0635\u0644\u06CC \u06A9\u0627\u0631\u062A \u0645\u062D\u062A\u0648\u0627",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0647\u0631 \u0639\u0646\u0648\u0627\u0646 \u062F\u0644\u062E\u0648\u0627\u0647",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0633\u0627\u0632\u0645\u0627\u0646 / \u0628\u0631\u0646\u062F",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0641\u0631\u0645\u0627 \u06CC\u0627 \u0628\u0631\u0646\u062F\u06CC \u06A9\u0647 \u0645\u062D\u062A\u0648\u0627 \u0645\u062A\u0639\u0644\u0642 \u0628\u0647 \u0622\u0646 \u0627\u0633\u062A",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          availableOrgs ||
          "\u0646\u0627\u0645 \u0633\u0627\u0632\u0645\u0627\u0646\u200C\u0647\u0627\u06CC \u062B\u0628\u062A\u200C\u0634\u062F\u0647 \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0627",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0641\u0631\u0645\u062A \u0648 \u0642\u0627\u0644\u0628 \u0645\u062D\u062A\u0648\u0627\u06CC \u062A\u0648\u0644\u06CC\u062F\u06CC",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          availableTypes ||
          "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC | \u067E\u0633\u062A \u0648\u06CC\u062F\u06CC\u0648\u06CC\u06CC | \u0645\u0642\u0627\u0644\u0647 \u0633\u0626\u0648 ...",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0646\u0627\u0645 \u06CC\u0627 \u0646\u0627\u0645\u06A9\u0627\u0631\u0628\u0631\u06CC \u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647 \u0645\u0633\u0626\u0648\u0644",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          availableColleagues ||
          "\u0646\u0627\u0645 \u067E\u0631\u0633\u0646\u0644 \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0647\u0645\u06A9\u0627\u0631\u0627\u0646 (\u0628\u0627 \u06A9\u0627\u0645\u0627)",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0627\u0633\u0627\u0645\u06CC \u0647\u0645\u06A9\u0627\u0631\u0627\u0646 \u062F\u0631\u06AF\u06CC\u0631 \u06A9\u0647 \u0628\u0627 \u06A9\u0627\u0645\u0627 (,) \u06CC\u0627 | \u0627\u0632 \u0647\u0645 \u062C\u062F\u0627 \u0634\u062F\u0647\u200C\u0627\u0646\u062F",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          availableColleagues,
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F (\u0628\u0627 \u06A9\u0627\u0645\u0627)",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0645\u0631\u0627\u062D\u0644 \u062E\u0637 \u062A\u0648\u0644\u06CC\u062F \u0645\u062D\u062A\u0648\u0627 \u06A9\u0647 \u0628\u0627 \u06A9\u0627\u0645\u0627 \u062C\u062F\u0627 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u067E\u0698\u0648\u0647\u0634 \u0648 \u0633\u0646\u0627\u0631\u06CC\u0648 | \u0641\u06CC\u0644\u0645\u0628\u0631\u062F\u0627\u0631\u06CC | \u0639\u06A9\u0627\u0633\u06CC | \u0637\u0631\u0627\u062D\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9 | \u062A\u062F\u0648\u06CC\u0646 | \u06AF\u0648\u06CC\u0646\u062F\u06AF\u06CC",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0648\u0636\u0639\u06CC\u062A",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0633\u062A\u0648\u0646 \u06A9\u0627\u0646\u0628\u0627\u0646 \u0645\u062D\u062A\u0648\u0627",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645 (raw) | \u062F\u0631 \u0635\u0641 (todo) | \u062F\u0631 \u062D\u0627\u0644 \u0627\u0646\u062C\u0627\u0645 (doing) | \u062A\u06A9\u0645\u06CC\u0644 \u0634\u062F\u0647 (done)",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u062A\u0627\u0631\u06CC\u062E \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u0627\u0646\u062A\u0634\u0627\u0631 (\u0634\u0645\u0633\u06CC)",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0645\u062B\u0627\u0644: 1405/02/15",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0633\u0627\u0639\u062A \u0627\u0646\u062A\u0634\u0627\u0631",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0632\u0645\u0627\u0646 \u0627\u0646\u062A\u0634\u0627\u0631",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0645\u062B\u0627\u0644: 18:00",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u06A9\u067E\u0634\u0646 / \u062A\u0648\u0636\u06CC\u062D\u0627\u062A",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0645\u062A\u0646 \u06A9\u0627\u0645\u0644 \u06A9\u067E\u0634\u0646 \u06CC\u0627 \u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u062A\u0648\u0644\u06CC\u062F",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0645\u062A\u0646 \u0622\u0632\u0627\u062F",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0644\u06CC\u0646\u06A9 \u06A9\u0627\u0648\u0631",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0622\u062F\u0631\u0633 \u0627\u06CC\u0646\u062A\u0631\u0646\u062A\u06CC \u067E\u0648\u0633\u062A\u0631 \u06CC\u0627 \u062A\u0635\u0648\u06CC\u0631 \u06A9\u0627\u0648\u0631",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0622\u062F\u0631\u0633 \u06A9\u0627\u0645\u0644 HTTP/HTTPS",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0644\u06CC\u0646\u06A9 \u0648\u06CC\u062F\u06CC\u0648",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0622\u062F\u0631\u0633 \u0627\u06CC\u0646\u062A\u0631\u0646\u062A\u06CC \u0641\u0627\u06CC\u0644 \u0648\u06CC\u062F\u06CC\u0648\u06CC\u06CC \u06CC\u0627 \u0636\u0645\u06CC\u0645\u0647",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0622\u062F\u0631\u0633 \u06A9\u0627\u0645\u0644 HTTP/HTTPS",
      },
    ];
    const wsGuide = xlsx.utils.json_to_sheet(guideData);
    xlsx.utils.book_append_sheet(
      wb,
      wsGuide,
      "\u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u0641\u0631\u0645\u062A",
    );
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Asva_Content_Depot_Template.xlsx"',
    );
    res.setHeader("Content-Length", buf.length);
    res.status(200).send(buf);
  } catch (e) {
    console.error("Error generating excel template:", e);
    res
      .status(500)
      .json({
        status: "error",
        message:
          "\u062E\u0637\u0627 \u062F\u0631 \u0627\u06CC\u062C\u0627\u062F \u0646\u0645\u0648\u0646\u0647 \u0641\u0627\u06CC\u0644 \u0627\u06A9\u0633\u0644",
      });
  }
});
apiRouter.post(
  "/bulk_import_contents",
  checkPermission("depot"),
  upload.single("excel_file"),
  (req, res) => {
    try {
      let rawItems = [];
      if (req.file && req.file.buffer) {
        const wb = xlsx.read(req.file.buffer, { type: "buffer" });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        rawItems = xlsx.utils.sheet_to_json(ws);
      } else if (req.body && req.body.items) {
        rawItems =
          typeof req.body.items === "string"
            ? JSON.parse(req.body.items)
            : req.body.items;
      } else if (req.body && Array.isArray(req.body)) {
        rawItems = req.body;
      }
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "\u0647\u06CC\u0686 \u0631\u062F\u06CC\u0641\u06CC \u062C\u0647\u062A \u0648\u0631\u0648\u062F \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F",
          });
      }
      const defaultOrgId =
        organizations && organizations.length > 0 ? organizations[0].id : 1;
      const addedContents = [];
      let startId =
        contents.length > 0 ? Math.max(...contents.map((x) => x.id)) + 1 : 1;
      for (const raw of rawItems) {
        const title =
          raw[
            "\u0639\u0646\u0648\u0627\u0646 \u0645\u062D\u062A\u0648\u0627"
          ] ||
          raw["\u0639\u0646\u0648\u0627\u0646"] ||
          raw["title"] ||
          raw["Title"] ||
          raw["\u0646\u0627\u0645 \u0645\u062D\u062A\u0648\u0627"];
        if (!title || !title.toString().trim()) {
          continue;
        }
        const orgInput =
          raw[
            "\u0633\u0627\u0632\u0645\u0627\u0646 / \u0628\u0631\u0646\u062F"
          ] ||
          raw["\u0633\u0627\u0632\u0645\u0627\u0646"] ||
          raw["\u06A9\u0627\u0631\u0641\u0631\u0645\u0627"] ||
          raw["org_name"] ||
          raw["organization"] ||
          raw["org_id"];
        let targetOrgId = null;
        if (orgInput) {
          const orgInputStr = orgInput.toString().trim().toLowerCase();
          const foundOrg = organizations.find(
            (o) =>
              o.id == orgInput ||
              (o.org_name && o.org_name.toLowerCase() === orgInputStr) ||
              (o.org_name && o.org_name.toLowerCase().includes(orgInputStr)) ||
              (o.username && o.username.toLowerCase() === orgInputStr),
          );
          if (foundOrg) {
            targetOrgId = foundOrg.id;
          }
        }
        const typeInput =
          raw["\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0627"] ||
          raw["\u0646\u0648\u0639"] ||
          raw["content_type"] ||
          raw["type"];
        let targetType =
          "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC";
        if (typeInput) {
          const typeStr = typeInput.toString().trim();
          const foundType = (settings.content_type || []).find(
            (t) => t.setting_key.toLowerCase() === typeStr.toLowerCase(),
          );
          targetType = foundType ? foundType.setting_key : typeStr;
        }
        const pmInput =
          raw["\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647"] ||
          raw["project_manager"] ||
          raw["manager"];
        let targetPM = null;
        if (pmInput) {
          const pmStr = pmInput.toString().trim();
          const foundColl = colleagues.find(
            (c) =>
              c.id == pmStr ||
              (c.full_name &&
                c.full_name.toLowerCase().includes(pmStr.toLowerCase())) ||
              (c.username && c.username.toLowerCase() === pmStr.toLowerCase()),
          );
          targetPM = foundColl
            ? foundColl.full_name || foundColl.username
            : pmStr;
        }
        const colleaguesInput =
          raw[
            "\u0647\u0645\u06A9\u0627\u0631\u0627\u0646 (\u0628\u0627 \u06A9\u0627\u0645\u0627)"
          ] ||
          raw["\u0647\u0645\u06A9\u0627\u0631\u0627\u0646"] ||
          raw["assigned_colleagues"] ||
          raw["team"];
        let assignedColleagues = [];
        if (colleaguesInput) {
          const parts = colleaguesInput
            .toString()
            .split(/[,،|]/)
            .map((s) => s.trim())
            .filter(Boolean);
          assignedColleagues = parts.map((p) => {
            const found = colleagues.find(
              (c) =>
                c.id == p ||
                (c.full_name &&
                  c.full_name.toLowerCase().includes(p.toLowerCase())) ||
                (c.username && c.username.toLowerCase() === p.toLowerCase()),
            );
            return found ? found.full_name || found.username || found.id : p;
          });
        }
        const stagesInput =
          raw[
            "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F (\u0628\u0627 \u06A9\u0627\u0645\u0627)"
          ] ||
          raw[
            "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F"
          ] ||
          raw["\u0645\u0631\u0627\u062D\u0644"] ||
          raw["stages"];
        let stages = [];
        if (stagesInput) {
          if (Array.isArray(stagesInput)) {
            stages = stagesInput.map((s) => s.toString().trim());
          } else {
            stages = stagesInput
              .toString()
              .split(/[,،|]/)
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }
        const statusInput = (
          raw["\u0648\u0636\u0639\u06CC\u062A"] ||
          raw["status"] ||
          "raw"
        )
          .toString()
          .trim()
          .toLowerCase();
        let targetStatus = "raw";
        if (
          statusInput.includes("todo") ||
          statusInput.includes("\u0635\u0641")
        ) {
          targetStatus = "todo";
        } else if (
          statusInput.includes("doing") ||
          statusInput.includes("\u0627\u0646\u062C\u0627\u0645") ||
          statusInput.includes("\u062A\u0648\u0644\u06CC\u062F")
        ) {
          targetStatus = "in_progress";
        } else if (
          statusInput.includes("done") ||
          statusInput.includes("\u062A\u06A9\u0645\u06CC\u0644")
        ) {
          targetStatus = "done";
        } else if (statusInput.includes("\u0645\u0646\u062A\u0634\u0631")) {
          targetStatus = "published";
        } else if (
          statusInput.includes(
            "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
          )
        ) {
          targetStatus = "review";
        } else if (
          statusInput.includes(
            "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
          )
        ) {
          targetStatus = "client_review";
        } else if (statusInput.includes("\u0627\u0635\u0644\u0627\u062D")) {
          targetStatus = "needs_revision";
        } else if (
          statusInput.includes(
            "\u062A\u0627\u06CC\u06CC\u062F \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
          )
        ) {
          targetStatus = "approved_by_client";
        } else if (
          statusInput.includes(
            "\u0622\u0645\u0627\u062F\u0647 \u0627\u0646\u062A\u0634\u0627\u0631",
          )
        ) {
          targetStatus = "ready_to_publish";
        } else if (
          statusInput.includes("raw") ||
          statusInput.includes("\u062E\u0627\u0645")
        ) {
          targetStatus = "raw";
        }
        const publishDate = (
          raw[
            "\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631"
          ] ||
          raw["publish_date"] ||
          ""
        )
          .toString()
          .trim();
        const publishTime = (
          raw[
            "\u0633\u0627\u0639\u062A \u0627\u0646\u062A\u0634\u0627\u0631"
          ] ||
          raw["publish_time"] ||
          ""
        )
          .toString()
          .trim();
        const caption = (
          raw[
            "\u06A9\u067E\u0634\u0646 / \u062A\u0648\u0636\u06CC\u062D\u0627\u062A"
          ] ||
          raw["\u06A9\u067E\u0634\u0646"] ||
          raw["\u062A\u0648\u0636\u06CC\u062D\u0627\u062A"] ||
          raw["caption"] ||
          ""
        )
          .toString()
          .trim();
        const coverLink = (
          raw["\u0644\u06CC\u0646\u06A9 \u06A9\u0627\u0648\u0631"] ||
          raw["cover_link"] ||
          ""
        )
          .toString()
          .trim();
        const videoLink = (
          raw["\u0644\u06CC\u0646\u06A9 \u0648\u06CC\u062F\u06CC\u0648"] ||
          raw["video_link"] ||
          ""
        )
          .toString()
          .trim();
        const newContent = {
          id: startId++,
          title: title.toString().trim(),
          org_id: parseInt(targetOrgId),
          content_type: targetType,
          project_manager: targetPM,
          assigned_colleagues: assignedColleagues,
          stages,
          status: targetStatus,
          publish_date: publishDate,
          publish_time: publishTime,
          caption,
          cover_link: coverLink,
          video_link: videoLink,
          components_count: raw.components_count || {},
          created_at: new Date().toISOString(),
        };
        contents.unshift(newContent);
        addedContents.push(newContent);
      }
      if (addedContents.length > 0) {
        const username = req.session?.user?.username || "system";
        batch_operations.unshift({
          id: "batch_" + Date.now(),
          type: "bulk_import",
          title:
            "\u0648\u0631\u0648\u062F \u06AF\u0631\u0648\u0647\u06CC (\u0627\u06A9\u0633\u0644)",
          description: `\u062A\u0639\u062F\u0627\u062F ${addedContents.length} \u0645\u062D\u062A\u0648\u0627 \u0628\u0647 \u0635\u0648\u0631\u062A \u06AF\u0631\u0648\u0647\u06CC \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u0646\u062F.`,
          item_ids: addedContents.map((c) => c.id),
          user: username,
          timestamp: new Date().toISOString(),
          is_undone: false,
        });
      }
      saveDatabase();
      return res.json({
        status: "success",
        message: `${addedContents.length} \u0645\u062D\u062A\u0648\u0627\u06CC \u062C\u062F\u06CC\u062F \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0647 \u062F\u067E\u0648 \u0627\u0641\u0632\u0648\u062F\u0647 \u0634\u062F`,
        imported_count: addedContents.length,
        data: addedContents,
      });
    } catch (err) {
      console.error("Error bulk importing contents:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message:
            "\u062E\u0637\u0627 \u062F\u0631 \u067E\u0631\u062F\u0627\u0632\u0634 \u0641\u0627\u06CC\u0644 \u06CC\u0627 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0627\u06A9\u0633\u0644: " +
            err.message,
        });
    }
  },
);
apiRouter.get("/get_dashboard_stats", (req, res) => {
  const bottlenecks = {};
  const filter = req.query.filter || "month";
  let filteredContents = contents;
  filteredContents = filteredContents.filter(
    (c) => !(c.is_recurrence_instance && c.count_in_stats === false),
  );
  const jalaaliDate = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [currentYear, currentMonth, currentDay] = jalaaliDate.split("/");
  if (filter === "month") {
    filteredContents = filteredContents.filter((c) => {
      if (!c.publish_date) return false;
      return c.publish_date.startsWith(`${currentYear}/${currentMonth}`);
    });
  } else if (filter === "week") {
    const dayNum = parseInt(currentDay);
    filteredContents = filteredContents.filter((c) => {
      if (!c.publish_date) return false;
      if (!c.publish_date.startsWith(`${currentYear}/${currentMonth}`))
        return false;
      const pubDay = parseInt(c.publish_date.split("/")[2]);
      return pubDay >= dayNum - 7 && pubDay <= dayNum;
    });
  }
  filteredContents.forEach((c) => {
    let statusKey = c.status || "unknown";
    if (statusKey === "doing") statusKey = "in_progress";
    if (statusKey === "done") statusKey = "approved_by_client";
    bottlenecks[statusKey] = (bottlenecks[statusKey] || 0) + 1;
  });
  const platforms = {};
  filteredContents.forEach((c) => {
    if (c.publish_platforms && Array.isArray(c.publish_platforms)) {
      c.publish_platforms.forEach((p) => {
        platforms[p] = (platforms[p] || 0) + 1;
      });
    }
  });
  const typeCounts = filteredContents.reduce((acc, c) => {
    if (!c.content_type) return acc;
    acc[c.content_type] = (acc[c.content_type] || 0) + 1;
    return acc;
  }, {});
  const totalDetails = Object.entries(typeCounts).map(
    ([type, count]) => `${type}: ${count} \u0639\u062F\u062F`,
  );
  const rawEventsList = filteredContents
    .filter((c) => c.status === "raw")
    .map((c) => c.title);
  const orgCounts = filteredContents.reduce((acc, c) => {
    acc[c.org_id] = acc[c.org_id] || { total: 0, done: 0, revision: 0 };
    acc[c.org_id].total++;
    if (c.status === "done") acc[c.org_id].done++;
    if (c.status === "todo") acc[c.org_id].revision++;
    return acc;
  }, {});
  const completionDetails = Object.keys(orgCounts).map((orgId) => {
    const org = organizations.find((o) => o.id === Number(orgId));
    const stats = orgCounts[orgId];
    const percent = Math.round((stats.done / stats.total) * 100);
    return `${org ? org.org_name : "\u0646\u0627\u0645\u0634\u062E\u0635"}: ${percent}\u066A`;
  });
  const revisionDetails = Object.keys(orgCounts).map((orgId) => {
    const org = organizations.find((o) => o.id === Number(orgId));
    const stats = orgCounts[orgId];
    const percent = Math.round((stats.revision / stats.total) * 100);
    return `${org ? org.org_name : "\u0646\u0627\u0645\u0634\u062E\u0635"}: ${percent}\u066A \u0627\u0635\u0644\u0627\u062D\u06CC\u0647`;
  });
  let totalContentForCalc = 0;
  let totalDoneForCalc = 0;
  let totalRevisionForCalc = 0;
  let worstOrg = { name: "\u0646\u062F\u0627\u0631\u062F", rate: -1 };
  let bestOrg = { name: "\u0646\u062F\u0627\u0631\u062F", rate: -1 };
  Object.keys(orgCounts).forEach((orgId) => {
    const org = organizations.find((o) => o.id === Number(orgId));
    const stats = orgCounts[orgId];
    totalContentForCalc += stats.total;
    totalDoneForCalc += stats.done;
    totalRevisionForCalc += stats.revision;
    const revisionRate = Math.round((stats.revision / stats.total) * 100);
    if (revisionRate > worstOrg.rate) {
      worstOrg = {
        name: org ? org.org_name : "\u0646\u0627\u0645\u0634\u062E\u0635",
        rate: revisionRate,
      };
    }
    const completionRate = Math.round((stats.done / stats.total) * 100);
    if (completionRate > bestOrg.rate) {
      bestOrg = {
        name: org ? org.org_name : "\u0646\u0627\u0645\u0634\u062E\u0635",
        rate: completionRate,
      };
    }
  });
  const overallRevisionRate =
    totalContentForCalc > 0
      ? Math.round((totalRevisionForCalc / totalContentForCalc) * 100)
      : 0;
  const overallCompletionRate =
    totalContentForCalc > 0
      ? Math.round((totalDoneForCalc / totalContentForCalc) * 100)
      : 0;
  const response = {
    status: "success",
    kpis: {
      total_content: filteredContents.length,
      raw_events: filteredContents.filter((c) => c.status === "raw").length,
      overall_revision_rate: overallRevisionRate,
      overall_completion_rate: overallCompletionRate,
      worst_org: worstOrg.name,
      best_org: bestOrg.name,
    },
    details: {
      total: totalDetails.length
        ? totalDetails
        : [
            "\u0645\u062D\u062A\u0648\u0627\u06CC\u06CC \u062B\u0628\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A",
          ],
      raw: rawEventsList.length
        ? rawEventsList
        : [
            "\u06A9\u0627\u0631\u062A \u062E\u0627\u0645\u06CC \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F",
          ],
      revision: revisionDetails.length
        ? revisionDetails
        : [
            "\u062F\u06CC\u062A\u0627\u06CC\u06CC \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A",
          ],
      completion: completionDetails.length
        ? completionDetails
        : [
            "\u062F\u06CC\u062A\u0627\u06CC\u06CC \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A",
          ],
    },
    bottlenecks,
    platforms,
  };
  res.json(response);
});
apiRouter.post(
  "/upload_smart_events",
  checkPermission("smart-events"),
  upload.single("excelFile"),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "\u0647\u06CC\u0686 \u0641\u0627\u06CC\u0644\u06CC \u0622\u067E\u0644\u0648\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.",
        });
    }
    try {
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
      const rows = data.slice(1);
      let addedCount = 0;
      rows.forEach((row) => {
        const title = row[0];
        const calendarTypeStr = row[1];
        const day = parseInt(row[2]);
        const month = parseInt(row[3]);
        let baseYear = parseInt(row[4]);
        if (isNaN(baseYear) || baseYear < 1300) {
          const jDate = jalaali.toJalaali(new Date());
          baseYear = jDate.jy;
        }
        const isHoliday = row[5] == 1 || row[5] == "1" ? 1 : 0;
        const isCustom = row[6];
        const orgName = row[7];
        if (!title || !calendarTypeStr || isNaN(day) || isNaN(month)) {
          return;
        }
        let calendar_type = "shamsi";
        if (
          typeof calendarTypeStr === "string" &&
          calendarTypeStr.includes("\u0642\u0645\u0631\u06CC")
        )
          calendar_type = "ghamari";
        else if (
          typeof calendarTypeStr === "string" &&
          calendarTypeStr.includes("\u0645\u06CC\u0644\u0627\u062F\u06CC")
        )
          calendar_type = "miladi";
        let org_id = null;
        if (
          (isCustom == 1 || isCustom == "1") &&
          orgName &&
          orgName !== "0" &&
          orgName !== 0
        ) {
          const cleanOrgName = orgName.toString().trim();
          let org = organizations.find(
            (o) => o.org_name && o.org_name.toString().trim() === cleanOrgName,
          );
          if (!org) {
            org = {
              id:
                organizations.length > 0
                  ? Math.max(...organizations.map((o) => o.id)) + 1
                  : 1,
              org_name: cleanOrgName,
              color: "#4f46e5",
            };
            organizations.push(org);
          }
          if (org) {
            org_id = org.id;
          }
        }
        const newEvent = {
          id:
            smartEventsBank.length > 0
              ? Math.max(...smartEventsBank.map((e) => e.id)) + 1
              : 1,
          title: title.toString(),
          calendar_type,
          base_year: baseYear,
          is_holiday: isHoliday,
          shamsi_month: month,
          shamsi_day: day,
          org_id,
        };
        smartEventsBank.push(newEvent);
        addedCount++;
      });
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message: `${addedCount} \u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0648\u0627\u0631\u062F \u0634\u062F.`,
      });
    } catch (e) {
      console.error(e);
      res
        .status(500)
        .json({
          status: "error",
          message:
            "\u062E\u0637\u0627 \u062F\u0631 \u067E\u0631\u062F\u0627\u0632\u0634 \u0641\u0627\u06CC\u0644 \u0627\u06A9\u0633\u0644.",
        });
    }
  },
);
apiRouter.post(
  "/manage_smart_events",
  checkPermission("smart-events"),
  async (req, res) => {
    console.log("manage_smart_events body:", req.body);
    let {
      action,
      title,
      description,
      calendar_type,
      shamsi_month,
      shamsi_day,
      org_id,
      id,
      base_year,
      is_holiday,
    } = req.body;
    if (!base_year) {
      base_year = jalaali.toJalaali(new Date()).jy;
    } else {
      base_year = parseInt(base_year);
    }
    
    if (action === "delete") {
      if (req.session.user && req.session.user?.role_id != 1 && req.session.user?.role_id != 2) {
        return res
          .status(403)
          .json({
            status: "error",
            message:
              "\u0634\u0645\u0627 \u0645\u062C\u0627\u0632 \u0628\u0647 \u0627\u06CC\u0646 \u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u06CC\u0633\u062A\u06CC\u062F",
          });
      }
    }
    if (action === "add") {
      const newEvent = {
        id:
          smartEventsBank.length > 0
            ? Math.max(...smartEventsBank.map((e) => e.id)) + 1
            : 1,
        title,
        description,
        calendar_type,
        base_year,
        is_holiday: is_holiday ? 1 : 0,
        shamsi_month: parseInt(shamsi_month),
        shamsi_day: parseInt(shamsi_day),
        org_id: org_id ? parseInt(org_id) : null,
      };
      smartEventsBank.push(newEvent);
      saveDatabase().catch(console.error);
      return res.json({
        status: "success",
        message:
          "\u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0647 \u0628\u0627\u0646\u06A9 \u0627\u0636\u0627\u0641\u0647 \u0634\u062F",
      });
    }
    
    if (action === "delete") {
      const evId = parseInt(id);
      const evIndex = smartEventsBank.findIndex((e) => e.id === evId);
      if (evIndex !== -1) {
        recycle_bin.unshift({
          id: Date.now(),
          table: "smartEventsBank",
          item_title:
            smartEventsBank[evIndex].title ||
            "\u0645\u0646\u0627\u0633\u0628\u062A \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
          data: smartEventsBank[evIndex],
          deleted_at: new Date().toISOString(),
          deleted_by:
            req.session && req.session.user && req.session.user.username
              ? req.session.user.username
              : "admin",
        });
        smartEventsBank.splice(evIndex, 1);
        saveDatabase().catch(console.error);
        return res.json({
          status: "success",
          message:
            "\u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0647 \u0633\u0637\u0644 \u0632\u0628\u0627\u0644\u0647 \u0645\u0646\u062A\u0642\u0644 \u0634\u062F",
        });
      }
      return res
        .status(404)
        .json({
          status: "error",
          message:
            "\u0645\u0646\u0627\u0633\u0628\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
        });
    }
    if (action === "edit") {
      const evId = parseInt(id);
      const evIndex = smartEventsBank.findIndex((e) => e.id === evId);
      if (evIndex !== -1) {
        smartEventsBank[evIndex] = {
          ...smartEventsBank[evIndex],
          title,
          description,
          calendar_type,
          base_year,
          is_holiday: is_holiday ? 1 : 0,
          shamsi_month: parseInt(shamsi_month),
          shamsi_day: parseInt(shamsi_day),
          org_id: org_id ? parseInt(org_id) : null,
        };
        saveDatabase().catch(console.error);
        return res.json({
          status: "success",
          message:
            "\u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F",
        });
      }
      return res
        .status(404)
        .json({
          status: "error",
          message:
            "\u0645\u0646\u0627\u0633\u0628\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
        });
    }
    res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
      });
  },
);
apiRouter.post(
  "/add_client_events",
  checkPermission("smart-events"),
  (req, res) => {
    const { org_id, events, year, month, is_draft } = req.body;
    const numericOrgId = parseInt(org_id, 10);
    if (numericOrgId && Array.isArray(events) && year && month) {
      const org = organizations.find((o) => o.id == numericOrgId);
      const existingSelectionIndex = clientSelections.findIndex(
        (cs) =>
          cs.org_id == numericOrgId && cs.year == year && cs.month == month,
      );
      if (
        existingSelectionIndex >= 0 &&
        clientSelections[existingSelectionIndex].is_final
      ) {
        return res.json({
          status: "error",
          message:
            "\u0627\u06CC\u0646 \u0627\u0646\u062A\u062E\u0627\u0628 \u0642\u0628\u0644\u0627 \u0646\u0647\u0627\u06CC\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A.",
        });
      }
      let previousSyncedTitles = [];
      if (existingSelectionIndex >= 0) {
        previousSyncedTitles =
          clientSelections[existingSelectionIndex].depot_synced_titles ||
          clientSelections[existingSelectionIndex].selected_titles ||
          [];
        clientSelections[existingSelectionIndex].selected_titles = events.map(
          (ev) => ev.title,
        );
        clientSelections[existingSelectionIndex].is_final = !is_draft;
      } else {
        clientSelections.push({
          org_id: numericOrgId,
          year: parseInt(year, 10),
          month: parseInt(month, 10),
          selected_titles: events.map((ev) => ev.title),
          is_final: !is_draft,
        });
      }
      if (!is_draft) {
        const monthNames = [
          "",
          "\u0641\u0631\u0648\u0631\u062F\u06CC\u0646",
          "\u0627\u0631\u062F\u06CC\u0628\u0647\u0634\u062A",
          "\u062E\u0631\u062F\u0627\u062F",
          "\u062A\u06CC\u0631",
          "\u0645\u0631\u062F\u0627\u062F",
          "\u0634\u0647\u0631\u06CC\u0648\u0631",
          "\u0645\u0647\u0631",
          "\u0622\u0628\u0627\u0646",
          "\u0622\u0630\u0631",
          "\u062F\u06CC",
          "\u0628\u0647\u0645\u0646",
          "\u0627\u0633\u0641\u0646\u062F",
        ];
        const mName = monthNames[parseInt(month, 10)] || month;
        addNotification(
          "\u062A\u0627\u06CC\u06CC\u062F \u062A\u0642\u0648\u06CC\u0645 \u0645\u0646\u0627\u0633\u0628\u062A\u200C\u0647\u0627",
          `\u0646\u0645\u0627\u06CC\u0646\u062F\u0647 ${org ? org.org_name : ""} \u0645\u0646\u0627\u0633\u0628\u062A\u200C\u0647\u0627\u06CC ${mName}\u0645\u0627\u0647 ${year} \u0631\u0627 \u062A\u0627\u06CC\u06CC\u062F \u06A9\u0631\u062F.`,
          "admin",
          null,
          "/calendar",
          "calendar_approved",
        );
        const colName =
          "\u0627\u0633\u062A\u0648\u0631\u06CC\u200C\u0647\u0627\u06CC \u0645\u0646\u0627\u0633\u0628\u062A\u06CC";
        let existingCol = collections.find(
          (c) =>
            c.title === colName &&
            (c.org_id === null || c.org_id === numericOrgId),
        );
        if (!existingCol) {
          existingCol = {
            id: collections.length
              ? Math.max(...collections.map((c) => c.id)) + 1
              : 1,
            title: colName,
            org_id: numericOrgId,
            created_at: new Intl.DateTimeFormat("fa-IR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date()),
            is_active: 1,
          };
          collections.push(existingCol);
        }
        const collectionId = existingCol.id;
        const currentTitles = events.map((ev) => ev.title);
        const toRemoveTitles = previousSyncedTitles.filter(
          (t) => !currentTitles.includes(t),
        );
        if (toRemoveTitles.length > 0) {
          for (let i = contents.length - 1; i >= 0; i--) {
            const c = contents[i];
            if (
              c.org_id === numericOrgId &&
              c.collection_id === collectionId &&
              toRemoveTitles.includes(c.title)
            ) {
              contents.splice(i, 1);
            }
          }
        }
        const selIndex =
          existingSelectionIndex >= 0
            ? existingSelectionIndex
            : clientSelections.length - 1;
        clientSelections[selIndex].depot_synced_titles = currentTitles;
        events.forEach((ev) => {
          const alreadyExists = contents.some(
            (c) =>
              c.org_id === numericOrgId &&
              c.collection_id === collectionId &&
              c.title === ev.title,
          );
          if (alreadyExists) return;
          const newId =
            contents.length > 0
              ? Math.max(...contents.map((c) => c.id)) + 1
              : 1;
          const bankEv = smartEventsBank.find(
            (e) =>
              e.title === ev.title &&
              (e.org_id === null || e.org_id === numericOrgId),
          );
          const calType = bankEv ? bankEv.calendar_type : "shamsi";
          let publishDate = "";
          let publishTime = "";
          if (calType === "ghamari") {
            const greg = jalaali.toGregorian(
              parseInt(year, 10),
              parseInt(month, 10),
              parseInt(ev.publish_day, 10) || 1,
            );
            const dateObj = new Date(greg.gy, greg.gm - 1, greg.gd);
            dateObj.setDate(dateObj.getDate() - 1);
            const prevJ = jalaali.toJalaali(dateObj);
            publishDate = `${prevJ.jy}/${prevJ.jm.toString().padStart(2, "0")}/${prevJ.jd.toString().padStart(2, "0")}`;
            publishTime = "19:00";
          } else {
            const m = month.toString().padStart(2, "0");
            const d = ev.publish_day
              ? ev.publish_day.toString().padStart(2, "0")
              : "01";
            publishDate = `${year}/${m}/${d}`;
            publishTime = "08:00";
          }
          contents.push({
            id: newId,
            title: ev.title,
            org_id: numericOrgId,
            org_name: org ? org.org_name : "",
            org_color: org ? org.color : "#4f46e5",
            org_logo: org ? org.logo_url : "",
            content_type:
              "\u0627\u0633\u062A\u0648\u0631\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
            components_count: {
              "\u0627\u0633\u062A\u0648\u0631\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC": 1,
            },
            collection_id: collectionId,
            project_manager: "",
            assigned_colleagues: [],
            publish_date: publishDate,
            publish_time: publishTime,
            stages: [
              "\u0637\u0631\u0627\u062D\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
            ],
            completed_stages: [],
            publish_platforms: [
              "\u0627\u06CC\u0646\u0633\u062A\u0627\u06AF\u0631\u0627\u0645",
              "\u062A\u0644\u06AF\u0631\u0627\u0645",
              "\u0628\u0644\u0647",
            ],
            platforms_published: [],
            status: "raw",
          });
        });
      }
      saveDatabase();
      return res.json({ status: "success" });
    }
    res.json({ status: "error" });
  },
);
apiRouter.get("/get_smart_events_monthly", (req, res) => {
  const { year, month, org_id, for_client } = req.query;
  const y = parseInt(year);
  const m = parseInt(month);
  const filterOrgId = org_id ? parseInt(org_id) : null;
  const isForClient = for_client === "1";
  let selection = null;
  if (filterOrgId && y && m) {
    selection = clientSelections.find(
      (cs) => cs.org_id === filterOrgId && cs.year === y && cs.month === m,
    );
  }
  const currentJDate = jalaali.toJalaali(new Date());
  const rawEvents = smartEventsBank.filter((e) => {
    if (filterOrgId) {
      if (e.org_id && e.org_id !== filterOrgId) return false;
      if (selection && !isForClient) {
        return selection.selected_titles.includes(e.title);
      }
      return !e.org_id || e.org_id === filterOrgId;
    } else {
      return !e.org_id;
    }
  });
  const events = [];
  rawEvents.forEach((e) => {
    let baseYear = parseInt(e.base_year);
    if (!baseYear || isNaN(baseYear)) {
      baseYear = 1403;
    }
    let occurrences = [];
    if (e.calendar_type === "shamsi" || !e.calendar_type) {
      occurrences.push({ jMonth: e.shamsi_month, jDate: e.shamsi_day });
    } else if (e.calendar_type === "miladi") {
      const baseGreg = jalaali.toGregorian(
        baseYear,
        e.shamsi_month,
        e.shamsi_day,
      );
      const gMonth = baseGreg.gm;
      const gDate = baseGreg.gd;
      const gYear1 = y + 621;
      const gYear2 = y + 622;
      const j1 = jalaali.toJalaali(gYear1, gMonth, gDate);
      if (j1.jy === y) occurrences.push({ jMonth: j1.jm, jDate: j1.jd });
      const j2 = jalaali.toJalaali(gYear2, gMonth, gDate);
      if (j2.jy === y) occurrences.push({ jMonth: j2.jm, jDate: j2.jd });
    } else if (e.calendar_type === "ghamari") {
      const baseGreg = jalaali.toGregorian(
        baseYear,
        e.shamsi_month,
        e.shamsi_day,
      );
      const mBase = momentHijri([baseGreg.gy, baseGreg.gm - 1, baseGreg.gd]);
      const iMonth = mBase.iMonth();
      const iDate = mBase.iDate();
      const baseIYear = mBase.iYear();
      const diffY = y - baseYear;
      const approxIYear = baseIYear + diffY;
      for (let testY = approxIYear - 2; testY <= approxIYear + 2; testY++) {
        const mTest = momentHijri(
          `${testY}/${iMonth + 1}/${iDate}`,
          "iYYYY/iM/iD",
        );
        if (mTest.isValid()) {
          const jDate = jalaali.toJalaali(
            mTest.year(),
            mTest.month() + 1,
            mTest.date(),
          );
          if (jDate.jy === y) {
            occurrences.push({ jMonth: jDate.jm, jDate: jDate.jd });
          }
        }
      }
    }
    occurrences.forEach((occ) => {
      if (occ.jMonth === m) {
        let org_logo = null;
        let org_name = null;
        let org_color = "#6366f1";
        if (e.org_id) {
          const org = organizations.find((o) => o.id === e.org_id);
          if (org) {
            org_logo = org.logo_url;
            org_name = org.org_name;
            org_color = org.color || "#6366f1";
          }
        }
        events.push({
          id: e.id,
          publish_day: occ.jDate,
          title: e.title,
          calendar_type: e.calendar_type,
          is_holiday: e.is_holiday,
          org_id: e.org_id,
          org_logo,
          org_name,
          org_color,
          shamsi_month: occ.jMonth,
        });
      }
    });
  });
  const routine_holidays = settings.routine_holidays
    ? settings.routine_holidays
        .filter((h) => h.is_active === 1)
        .map((h) => h.id)
    : [5];
  res.json({
    status: "success",
    data: events,
    client_selection: selection ? selection.selected_titles : [],
    is_final: selection ? !!selection.is_final : false,
    unlock_reason: selection ? selection.unlock_reason : null,
    routine_holidays,
  });
});
apiRouter.get("/get_events", (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    const smartEvents = [
      {
        id: 1,
        title: "\u0631\u0648\u0632 \u067E\u0632\u0634\u06A9",
        event_date: "\u06F1 \u0634\u0647\u0631\u06CC\u0648\u0631",
        calendar_type: "shamsi",
      },
      {
        id: 2,
        title: "\u0639\u06CC\u062F \u0633\u0639\u06CC\u062F \u0641\u0637\u0631",
        event_date: "\u06F1 \u0634\u0648\u0627\u0644",
        calendar_type: "ghamari",
      },
      {
        id: 3,
        title:
          "\u0631\u0648\u0632 \u062C\u0647\u0627\u0646\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9",
        event_date: "27 \u0622\u0648\u0631\u06CC\u0644",
        calendar_type: "miladi",
      },
      {
        id: 4,
        title: "\u0634\u0628 \u06CC\u0644\u062F\u0627",
        event_date: "\u06F3\u06F0 \u0622\u0630\u0631",
        calendar_type: "shamsi",
      },
      {
        id: 5,
        title:
          "\u0631\u0648\u0632 \u062C\u0647\u0627\u0646\u06CC \u0639\u06A9\u0627\u0633\u06CC",
        event_date: "19 \u0622\u06AF\u0648\u0633\u062A",
        calendar_type: "miladi",
      },
      {
        id: 6,
        title:
          "\u0633\u0627\u0644\u06AF\u0631\u062F \u062A\u0627\u0633\u06CC\u0633 \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
        event_date: "\u06F1\u06F5 \u0645\u0647\u0631",
        calendar_type: "custom",
      },
    ];
    saveDatabase();
    return res.json({ status: "success", events: smartEvents });
  }
  const padMonth = month.toString().padStart(2, "0");
  const searchPattern = `${year}/${padMonth}/`;
  const filteredContents = contents
    .filter((c) => {
      if (!c.publish_date) return false;
      const parts = c.publish_date.split("/");
      return (
        parts.length >= 2 &&
        parts[0] == year.toString() &&
        parseInt(parts[1]) === parseInt(month)
      );
    })
    .map((c) => {
      let all_publish_dates = [c.publish_date];
      if (c.is_recurring || c.is_recurrence_instance) {
        const pId = c.parent_id || c.id;
        const instances = contents.filter(
          (x) => x.id === pId || x.parent_id === pId,
        );
        all_publish_dates = instances
          .map((x) => x.publish_date)
          .filter(Boolean)
          .sort();
      }
      const parts = c.publish_date.split("/");
      const day = parseInt(parts[2]) || 1;
      const org = organizations.find((o) => o.id == c.org_id);
      return {
        ...c,
        publish_day: day,
        all_publish_dates,
        org_name: org
          ? org.org_name
          : "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
        org_color: org ? org.color || "#4f46e5" : "#4f46e5",
        org_logo: org ? org.logo_url : "",
      };
    });
  const filteredSuggestions = templateSuggestions.filter(
    (s) =>
      s.year === parseInt(year) &&
      s.month === parseInt(month) &&
      s.status === "pending",
  );
  const suggestionsWithOrg = filteredSuggestions.map((s) => {
    const org = organizations.find((o) => o.id == s.org_id);
    return {
      ...s,
      org_name: org
        ? org.org_name
        : "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
      org_color: org ? org.color || "#4f46e5" : "#4f46e5",
      org_logo: org ? org.logo_url : "",
    };
  });
  const routine_holidays = settings.routine_holidays
    ? settings.routine_holidays
        .filter((h) => h.is_active === 1)
        .map((h) => h.id)
    : [5];
  const special_holidays = [];
  const y = parseInt(year);
  const m = parseInt(month);
  smartEventsBank
    .filter((e) => e.is_holiday === 1)
    .forEach((e) => {
      if (e.calendar_type === "shamsi") {
        const evMonth = parseInt(e.shamsi_month || "0");
        const evDay = parseInt(e.shamsi_day || "0");
        if (evMonth === m && evDay) special_holidays.push(evDay);
      } else if (
        e.calendar_type === "ghamari" ||
        e.calendar_type === "miladi"
      ) {
      }
    });
  res.json({
    status: "success",
    data: filteredContents,
    suggestions: suggestionsWithOrg,
    routine_holidays,
    special_holidays,
  });
});
apiRouter.get("/manage_settings", (req, res) => {
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
apiRouter.post(
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
            item.price = parseInt(price) || 0;
            item.base_price = parseInt(price) || 0;
          }
          if (icon !== void 0) item.icon = icon;
          if (logo_url !== void 0) item.logo_url = logo_url;
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
      const newItem = { id: maxId + 1, setting_key: itemName, is_active: 1 };
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
apiRouter.get("/get_orgs", (req, res) => {
  const safeData = organizations
    .filter((o) => o.is_active === 1)
    .map((o) => {
      const { passwordHash, ...safeO } = o;
      return safeO;
    });
  res.json({ status: "success", data: safeData });
});
apiRouter.get(
  "/manage_orgs",
  checkPermission("organizations"),
  (req, res) => {
    const now = jalaali.toJalaali(new Date());
    let currentYear = now.jy;
    let currentMonth = now.jm;
    let nextMonth = currentMonth + 1;
    let nextYear = currentYear;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    const safeData = organizations.map((o) => {
      const { passwordHash, ...safeO } = o;
      const currentSelection = clientSelections.find(
        (cs) =>
          cs.org_id == o.id &&
          cs.year == currentYear &&
          cs.month == currentMonth,
      );
      const nextSelection = clientSelections.find(
        (cs) =>
          cs.org_id == o.id && cs.year == nextYear && cs.month == nextMonth,
      );
      safeO.current_month_locked = currentSelection
        ? currentSelection.is_final
        : false;
      safeO.next_month_locked = nextSelection ? nextSelection.is_final : false;
      return safeO;
    });
    res.json({ status: "success", data: safeData });
  },
);
apiRouter.post(
  "/manage_orgs",
  checkPermission("organizations"),
  (req, res) => {
    const {
      action,
      org_name,
      industry,
      logo_url,
      id,
      color,
      contact_name,
      phone_number,
      has_telegram,
      telegram_number,
      extra_phones,
      emails,
      addresses,
      username,
      password,
      orgs,
    } = req.body;
    if (action === "batch_add") {
      let currentId =
        organizations.length > 0
          ? Math.max(...organizations.map((o) => o.id)) + 1
          : 1;
      orgs.forEach((org) => {
        const targetUsername = org.username || "";
        if (
          targetUsername &&
          (colleagues.find((c) => c.username === targetUsername) ||
            organizations.find((o) => o.username === targetUsername))
        ) {
          return;
        }
        const newOrg = {
          id: currentId++,
          org_name:
            org.org_name || "\u0628\u062F\u0648\u0646 \u0646\u0627\u0645",
          industry: org.industry || "\u0633\u0627\u06CC\u0631",
          logo_url: org.logo_url || "",
          color: org.color || "#6366F1",
          contact_name: org.contact_name || "",
          phone_number: org.phone_number || "",
          has_telegram: org.has_telegram || false,
          telegram_number: org.telegram_number || "",
          extra_phones: org.extra_phones || [],
          emails: org.emails || [],
          addresses: org.addresses || [],
          username: targetUsername,
          passwordHash: org.password ? bcrypt.hashSync(org.password, 10) : "",
          is_active: 1,
        };
        organizations.unshift(newOrg);
      });
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0633\u0627\u0632\u0645\u0627\u0646\u200C\u0647\u0627 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u0646\u062F",
      });
    } else if (action === "add") {
      const targetUsername = username || "";
      if (
        targetUsername &&
        (colleagues.find((c) => c.username === targetUsername) ||
          organizations.find((o) => o.username === targetUsername))
      ) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0642\u0628\u0644\u0627 \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A.",
          });
      }
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
            ? Math.max(...organizations.map((o) => o.id)) + 1
            : 1,
        org_name,
        industry,
        logo_url,
        color,
        contact_name,
        phone_number,
        has_telegram,
        telegram_number,
        extra_phones,
        emails,
        addresses,
        username: username || "",
        passwordHash: password ? bcrypt.hashSync(password, 10) : "",
        is_active: 1,
      };
      organizations.unshift(newOrg);
      saveDatabase();
      res.json({ status: "success" });
    } else if (action === "delete") {
      const orgToDelete = organizations.find((o) => o.id == id);
      if (orgToDelete) {
        const binId = Date.now();
        recycle_bin.unshift({
          id: binId,
          table: "organizations",
          item_title:
            orgToDelete.org_name || "\u0633\u0627\u0632\u0645\u0627\u0646",
          data: orgToDelete,
          deleted_at: new Date().toISOString(),
          deleted_by:
            req.session && req.session.user && req.session.user.username
              ? req.session.user.username
              : "admin",
        });
        organizations = organizations.filter((o) => o.id !== id);
        contents = contents.filter((c) => c.org_id !== id);
        saveDatabase();
        res.json({
          status: "success",
          message:
            "\u0628\u0647 \u0633\u0637\u0644 \u0632\u0628\u0627\u0644\u0647 \u0645\u0646\u062A\u0642\u0644 \u0634\u062F",
          bin_id: binId,
        });
      } else {
        res.status(404).json({ status: "error" });
      }
    } else if (action === "toggle_active") {
      const orgIndex = organizations.findIndex((o) => o.id == id);
      if (orgIndex !== -1) {
        organizations[orgIndex].is_active = req.body.is_active;
        saveDatabase();
        res.json({ status: "success" });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "\u0633\u0627\u0632\u0645\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          });
      }
    } else if (action === "edit") {
      const orgIndex = organizations.findIndex((o) => o.id == id);
      if (orgIndex !== -1) {
        organizations[orgIndex].org_name = org_name;
        organizations[orgIndex].industry = industry;
        if (logo_url) organizations[orgIndex].logo_url = logo_url;
        if (color) organizations[orgIndex].color = color;
        if (contact_name !== void 0)
          organizations[orgIndex].contact_name = contact_name;
        if (phone_number !== void 0)
          organizations[orgIndex].phone_number = phone_number;
        if (has_telegram !== void 0)
          organizations[orgIndex].has_telegram = has_telegram;
        if (telegram_number !== void 0)
          organizations[orgIndex].telegram_number = telegram_number;
        if (extra_phones !== void 0)
          organizations[orgIndex].extra_phones = extra_phones;
        if (emails !== void 0) organizations[orgIndex].emails = emails;
        if (addresses !== void 0) organizations[orgIndex].addresses = addresses;
        if (username !== void 0) organizations[orgIndex].username = username;
        if (password) {
          if (password.length < 6)
            return res
              .status(400)
              .json({
                status: "error",
                message:
                  "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F6 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F.",
              });
          organizations[orgIndex].passwordHash = bcrypt.hashSync(password, 10);
        }
        saveDatabase();
        res.json({ status: "success" });
      } else {
        res.json({ status: "error", message: "Org not found" });
      }
    } else {
      res.json({ status: "error", message: "Invalid action" });
    }
  },
);
apiRouter.get("/manage_users", checkPermission("add-user"), (req, res) => {
  const includeInactive =
    req.query.include_inactive === "1" || req.query.all === "1";
  const mapped = colleagues
    .filter((c) => (includeInactive ? true : c.is_active !== 0))
    .map((c) => {
      const role = roles.find((r) => r.id === c?.role_id);
      const role_name = role
        ? role.name
        : "\u06A9\u0627\u0631\u0634\u0646\u0627\u0633";
      return { ...c, role_name };
    });
  res.json({ status: "success", data: mapped, users: mapped });
});
apiRouter.post("/manage_users", checkPermission("add-user"), (req, res) => {
  const {
    action,
    id,
    full_name,
    fullName,
    role_id,
    avatar_url,
    phone,
    email,
    portfolio,
    workType,
    work_type,
    capacity,
    startDate,
    start_date,
    shaba,
    username,
    password,
  } = req.body;
  if (action === "restore" || action === "activate") {
    const idx = colleagues.findIndex((c) => c.id == id);
    if (idx !== -1) {
      colleagues[idx].is_active = 1;
      colleagues[idx].status = "active";
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u062D\u0633\u0627\u0628 \u0647\u0645\u06A9\u0627\u0631 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0641\u0639\u0627\u0644 \u06AF\u0631\u062F\u06CC\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  }
  if (action === "delete") {
    if (id == 1) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "\u062D\u0633\u0627\u0628 \u0645\u062F\u06CC\u0631 \u06A9\u0644 \u0642\u0627\u0628\u0644 \u062D\u0630\u0641 \u0646\u06CC\u0633\u062A",
        });
    }
    if (req.session.user && req.session.user.id == id) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "\u0634\u0645\u0627 \u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u062E\u0648\u062F \u0631\u0627 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u06A9\u0646\u06CC\u062F",
        });
    }
    const idx = colleagues.findIndex((c) => c.id == id);
    if (idx !== -1) {
      colleagues[idx].is_active = 0;
      colleagues[idx].status = "inactive";
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u06A9\u0627\u0631\u0628\u0631 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0634\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  }
  if (action === "edit") {
    const idx = colleagues.findIndex((c) => c.id == id);
    if (idx !== -1) {
      if (id == 1 && req.session.user && req.session.user.id != 1) {
        return res
          .status(403)
          .json({
            status: "error",
            message:
              "\u0634\u0645\u0627 \u0645\u062C\u0627\u0632 \u0628\u0647 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0645\u062F\u06CC\u0631 \u06A9\u0644 \u0646\u06CC\u0633\u062A\u06CC\u062F",
          });
      }
      colleagues[idx].full_name =
        full_name || fullName || colleagues[idx].full_name;
      if (username) colleagues[idx].username = username;
      if (password) {
        if (password.length < 6)
          return res
            .status(400)
            .json({
              status: "error",
              message:
                "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F6 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F.",
            });
        colleagues[idx].passwordHash = bcrypt.hashSync(password, 10);
      }
      if (role_id) {
        if (
          req.session.user &&
          req.session.user.id === id &&
          parseInt(role_id) !== colleagues[idx]?.role_id
        ) {
          return res
            .status(400)
            .json({
              status: "error",
              message:
                "\u0634\u0645\u0627 \u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0646\u0642\u0634 \u062E\u0648\u062F \u0631\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0647\u06CC\u062F",
            });
        }
        if (colleagues[idx]) colleagues[idx].role_id = parseInt(role_id);
      }
      if (avatar_url) colleagues[idx].avatar_url = avatar_url;
      if (phone !== void 0) colleagues[idx].phone = phone;
      if (email !== void 0) colleagues[idx].email = email;
      if (portfolio !== void 0) colleagues[idx].portfolio = portfolio;
      if (workType !== void 0 || work_type !== void 0)
        colleagues[idx].work_type = workType || work_type;
      if (capacity !== void 0) colleagues[idx].capacity = capacity;
      if (startDate !== void 0 || start_date !== void 0)
        colleagues[idx].start_date = startDate || start_date;
      if (shaba !== void 0) colleagues[idx].shaba = shaba;
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  }
  if (action === "reorder") {
    const { direction } = req.body;
    const activeColleagues = colleagues.filter(
      (c) => c.is_active === 1 || c.status === "active",
    );
    const activeIndex = activeColleagues.findIndex((c) => c.id == id);
    if (activeIndex !== -1) {
      let targetActiveIndex = -1;
      if (direction === "up" && activeIndex > 0)
        targetActiveIndex = activeIndex - 1;
      else if (
        direction === "down" &&
        activeIndex < activeColleagues.length - 1
      )
        targetActiveIndex = activeIndex + 1;
      if (targetActiveIndex !== -1) {
        const targetId = activeColleagues[targetActiveIndex].id;
        const realIndex = colleagues.findIndex((c) => c.id == id);
        const targetRealIndex = colleagues.findIndex((c) => c.id == targetId);
        const temp = colleagues[realIndex];
        colleagues[realIndex] = colleagues[targetRealIndex];
        colleagues[targetRealIndex] = temp;
        saveDatabase();
        return res.json({
          status: "success",
          message:
            "\u062A\u0631\u062A\u06CC\u0628 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F",
        });
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
  if (password && password.length < 6) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F6 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F.",
      });
  }
  const newUser = {
    id:
      colleagues.length > 0 ? Math.max(...colleagues.map((c) => c.id)) + 1 : 1,
    username: username || email || "user_" + Date.now(),
    passwordHash: password ? bcrypt.hashSync(password, 10) : "",
    full_name:
      full_name ||
      fullName ||
      "\u0647\u0645\u06A9\u0627\u0631 \u062C\u062F\u06CC\u062F",
    role_id: role_id ? parseInt(role_id) : 3,
    phone: phone || "",
    email: email || "",
    portfolio: portfolio || "",
    work_type:
      workType ||
      work_type ||
      "\u062A\u0645\u0627\u0645\u0648\u0642\u062A (\u062D\u0636\u0648\u0631\u06CC)",
    capacity: capacity || "",
    start_date: startDate || start_date || "",
    shaba: shaba || "",
    is_active: 1,
    avatar_url:
      avatar_url ||
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    status: "active",
  };
  colleagues.push(newUser);
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0633\u0627\u062E\u062A\u0647 \u0634\u062F",
  });
});
apiRouter.get("/get_colleagues", (req, res) => {
  const mapped = colleagues
    .filter((c) => c.is_active !== 0)
    .map((c) => {
      const role = roles.find((r) => r.id === c?.role_id);
      const role_name = role
        ? role.name
        : "\u06A9\u0627\u0631\u0634\u0646\u0627\u0633";
      const { passwordHash, ...safeC } = c;
      return { ...safeC, role_name };
    });
  res.json({ status: "success", users: mapped, data: mapped });
});

apiRouter.get("/get_leaves", checkPermission("leaves"), (req, res) => {
  const sessionUser = req.session.user;
  const roleInfo = getRoleInfoForUser(sessionUser);
  const isAdmin = roleInfo.permissions.includes("admin") || roleInfo.permissions.includes("all");
  
  if (!Array.isArray(leaves)) leaves = [];
  if (!Array.isArray(colleagues)) colleagues = [];

  let userLeaves = leaves;
  if (!isAdmin && sessionUser.username !== "admin") {
    userLeaves = leaves.filter(l => l.user_id === sessionUser.id);
  }

  const jalaaliDate = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const isHistory = req.query.type === 'history';

  let filteredLeaves = userLeaves;
  if (isHistory) {
    filteredLeaves = userLeaves.filter(l => l.start_date < jalaaliDate);
  } else {
    filteredLeaves = userLeaves.filter(l => l.start_date >= jalaaliDate);
  }

  filteredLeaves.sort((a, b) => b.start_date.localeCompare(a.start_date));

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const total = filteredLeaves.length;

  if (isHistory) {
    const startIdx = (page - 1) * limit;
    filteredLeaves = filteredLeaves.slice(startIdx, startIdx + limit);
  }

  const enrichedLeaves = filteredLeaves.map(l => {
    const user = colleagues.find(c => c.id === l.user_id);
    const sub = colleagues.find(c => c.id === l.substitute_id);
    return {
      ...l,
      user_name: user ? user.full_name : "نامشخص",
      substitute_name: sub ? sub.full_name : "بدون جانشین"
    };
  });
  
  res.json({ 
    status: "success", 
    data: enrichedLeaves, 
    isAdmin: isAdmin || sessionUser.username === "admin",
    total: total,
    page: page,
    limit: limit
  });
});

apiRouter.post("/update_leave", checkPermission("leaves"), (req, res) => {
  const { id, status } = req.body; console.log("update_leave called with id:", id, "status:", status);
  const sessionUser = req.session.user;
  const roleInfo = getRoleInfoForUser(sessionUser);
  const isAdmin = roleInfo.permissions.includes("admin") || roleInfo.permissions.includes("all") || sessionUser.username === "admin";

  if (!isAdmin) {
    return res.status(403).json({ status: "error", message: "فقط مدیر می‌تواند وضعیت مرخصی را تغییر دهد." });
  }

  if (!Array.isArray(leaves)) leaves = [];
  const leave = leaves.find(l => l.id === parseInt(id));
  if (!leave) {
    return res.status(404).json({ status: "error", message: "مرخصی یافت نشد." });
  }

  leave.status = status; 

  if (status === "approved") {
    const colleague = colleagues.find((c) => c.id === leave.user_id);
    if (colleague) {
      colleague.status = "on_leave";
      if (leave.substitute_id) {
        const sub = colleagues.find((c) => c.id === leave.substitute_id);
        if (sub) {
          const oldName = colleague.full_name;
          const newName = sub.full_name;
          if (Array.isArray(contents)) {
            contents.forEach((c) => {
              if (c.project_manager === oldName || c.project_manager == leave.user_id) {
                c.project_manager = newName;
              }
              if (c.assigned_colleagues && Array.isArray(c.assigned_colleagues)) {
                const idx = c.assigned_colleagues.findIndex(
                  (name) => name === oldName || name == leave.user_id,
                );
                if (idx !== -1) {
                  c.assigned_colleagues[idx] = newName;
                }
              }
            });
          }
        }
      }
    }
  }

  saveDatabase();
  res.json({ status: "success", message: "وضعیت مرخصی بروزرسانی شد." });
});

apiRouter.post("/delete_leave", checkPermission("leaves"), (req, res) => {
  const { id } = req.body; console.log("delete_leave called with id:", id);
  const sessionUser = req.session.user;
  const roleInfo = getRoleInfoForUser(sessionUser);
  const isAdmin = roleInfo.permissions.includes("admin") || roleInfo.permissions.includes("all") || sessionUser.username === "admin";
  
  if (!Array.isArray(leaves)) leaves = [];
  const leave = leaves.find(l => l.id === parseInt(id));
  if(!leave) {
    return res.status(404).json({ status: "error", message: "یافت نشد" });
  }

  if (!isAdmin && leave.user_id !== sessionUser.id) {
    return res.status(403).json({ status: "error", message: "دسترسی ندارید" });
  }

  const idx = leaves.findIndex(l => l.id === parseInt(id));
  if(idx > -1) leaves.splice(idx, 1);

  saveDatabase();
  res.json({ status: "success", message: "مرخصی با موفقیت حذف شد." });
});

apiRouter.post("/save_leave", checkPermission("leaves"), async (req, res) => {
  try {
    const { user_id: leave_user, substitute_id: substitute_user, start_date, end_date } = req.body;
    const session2 = req.session;
    if (!session2 || !session2.user) {
      return res.status(401).json({ status: "error", message: "لطفا وارد شوید." });
    }
    
    let user_id = parseInt(leave_user);
    if (isNaN(user_id)) {
      return res.status(400).json({ status: "error", message: "همکار متقاضی نامعتبر است." });
    }

    const roleInfo = getRoleInfoForUser(session2.user);
    const isAdmin = roleInfo.permissions.includes("admin") || roleInfo.permissions.includes("all") || session2.user.username === "admin";

    if (user_id !== session2.user.id && !isAdmin) {
      return res.status(403).json({
        status: "error",
        message: "شما فقط می‌توانید برای خود مرخصی ثبت کنید",
      });
    }

    let sub_id = null;
    if (substitute_user && String(substitute_user).trim() !== "") {
      sub_id = parseInt(substitute_user);
      if (isNaN(sub_id)) sub_id = null;
    }
    
    if (!Array.isArray(colleagues)) colleagues = [];
    if (!Array.isArray(leaves)) leaves = [];
    
    const maxId = leaves.length > 0 ? Math.max(...leaves.map(x => x.id || 0)) : 0;
    const newLeave = {
      id: isNaN(maxId) ? 1 : maxId + 1,
      user_id,
      substitute_id: sub_id || 0,
      start_date: start_date || new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
      end_date: end_date || new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
      status: "pending",
      created_at: new Date().toISOString()
    };
    
    leaves.push(newLeave);
    
    saveDatabase();
    
    return res.json({
      status: "success",
      message: "درخواست مرخصی شما با موفقیت ثبت شد و در انتظار تایید مدیریت است.",
    });
  } catch (err) {
    console.error("Error in /save_leave:", err);
    return res.status(500).json({ status: "error", message: "خطای داخلی سرور هنگام ثبت مرخصی." });
  }
});

apiRouter.post("/save_user", checkPermission("add-user"), (req, res) => {
  const {
    full_name,
    role_id,
    username,
    password,
    fullName,
    phone,
    email,
    portfolio,
    workType,
    work_type,
    capacity,
    startDate,
    start_date,
    shaba,
    avatar_url,
  } = req.body;
  const targetUsername = username || email || "user_" + Date.now();
  if (
    colleagues.find((c) => c.username === targetUsername) ||
    organizations.find((o) => o.username === targetUsername)
  ) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0642\u0628\u0644\u0627 \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A.",
      });
  }
  if (password && password.length < 6) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F6 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F.",
      });
  }
  const newUser = {
    id:
      colleagues.length > 0 ? Math.max(...colleagues.map((c) => c.id)) + 1 : 1,
    username: targetUsername,
    passwordHash: password ? bcrypt.hashSync(password, 10) : "",
    full_name:
      full_name ||
      fullName ||
      "\u0647\u0645\u06A9\u0627\u0631 \u062C\u062F\u06CC\u062F",
    role_id: role_id ? parseInt(role_id) : 3,
    phone: phone || "",
    email: email || "",
    portfolio: portfolio || "",
    work_type:
      workType ||
      work_type ||
      "\u062A\u0645\u0627\u0645\u0648\u0642\u062A (\u062D\u0636\u0648\u0631\u06CC)",
    capacity: capacity || "",
    start_date: startDate || start_date || "",
    shaba: shaba || "",
    is_active: 1,
    avatar_url:
      avatar_url ||
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    status: "active",
  };
  colleagues.push(newUser);
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0633\u0627\u062E\u062A\u0647 \u0634\u062F",
  });
});
apiRouter.post("/upload_image", async (req, res) => {
  const { image } = req.body;
  if (!image || typeof image !== "string") {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0641\u0631\u0645\u062A \u062A\u0635\u0648\u06CC\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A",
      });
  }
  if (image.startsWith("data:image")) {
    try {
      const matches = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const ext = matches[1];
        const data = matches[2];
        const allowedExts = ["jpeg", "png", "webp", "gif", "jpg"];
        if (!allowedExts.includes(ext.toLowerCase())) {
          return res
            .status(400)
            .json({
              status: "error",
              message:
                "\u0641\u0631\u0645\u062A \u062A\u0635\u0648\u06CC\u0631 \u0645\u062C\u0627\u0632 \u0646\u06CC\u0633\u062A",
            });
        }
        if (data.length > 7e6) {
          return res
            .status(400)
            .json({
              status: "error",
              message:
                "\u062D\u062C\u0645 \u062A\u0635\u0648\u06CC\u0631 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632 \u0627\u0633\u062A",
            });
        }
        const filename =
          "upload_" +
          Date.now() +
          "_" +
          Math.floor(Math.random() * 1e3) +
          "." +
          ext;
        const buffer = Buffer.from(data, "base64");
        const fs2 = require("fs");
        const path2 = require("path");
        const uploadsDir = path2.join(process.cwd(), "public", "uploads");
        if (!fs2.existsSync(uploadsDir))
          fs2.mkdirSync(uploadsDir, { recursive: true });
        fs2.writeFileSync(path2.join(uploadsDir, filename), buffer);
        try {
          const { doc, setDoc } = require("firebase/firestore");
          await setDoc(doc(db, "uploads", filename), {
            data: data,
            mime: "image/" + ext,
            createdAt: Date.now()
          });
        } catch(fsErr) {
          console.error("Firestore save error:", fsErr);
        }
        const localCdnUrl = "/uploads/" + filename;
        return res.json({ status: "success", url: localCdnUrl });
      }
    } catch (err) {
      console.error("Upload error:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message:
            "\u062E\u0637\u0627 \u062F\u0631 \u0622\u067E\u0644\u0648\u062F",
        });
    }
  } else if (image.startsWith("http")) {
    return res.json({ status: "success", url: image });
  }
  res
    .status(400)
    .json({
      status: "error",
      message:
        "\u062A\u0635\u0648\u06CC\u0631 \u062E\u0627\u0644\u06CC \u06CC\u0627 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A",
    });
});
apiRouter.post("/upload_file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0641\u0627\u06CC\u0644\u06CC \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A",
      });
  }
  try {
    const extMatch = req.file.originalname.match(/\.([^\.]+)$/);
    const ext = extMatch ? extMatch[1] : "bin";
    const filename =
      "file_" + Date.now() + "_" + Math.floor(Math.random() * 1e3) + "." + ext;
    const fs2 = require("fs");
    const path2 = require("path");
    const uploadsDir = path2.join(process.cwd(), "public", "uploads");
    if (!fs2.existsSync(uploadsDir))
      fs2.mkdirSync(uploadsDir, { recursive: true });
    fs2.writeFileSync(path2.join(uploadsDir, filename), req.file.buffer);
    try {
      const { doc, setDoc } = require("firebase/firestore");
      await setDoc(doc(db, "uploads", filename), {
        data: req.file.buffer.toString("base64"),
        mime: req.file.mimetype || "application/octet-stream",
        createdAt: Date.now()
      });
    } catch(fsErr) {
      console.error("Firestore save error:", fsErr);
    }
    const localCdnUrl = "/uploads/" + filename;
    return res.json({ status: "success", url: localCdnUrl });
  } catch (err) {
    console.error("File upload error:", err);
    return res
      .status(500)
      .json({
        status: "error",
        message:
          "\u062E\u0637\u0627 \u062F\u0631 \u0622\u067E\u0644\u0648\u062F \u0641\u0627\u06CC\u0644",
      });
  }
});
apiRouter.get(
  "/recycle_bin",
  checkPermission("recycle_bin"),
  (req, res) => {
    const session2 = req.session;
    if (!session2 || !session2.user)
      return res.status(401).json({ status: "error" });
    if (
      typeof session2.user !== "string" &&
      session2.user?.role_id === "client"
    )
      return res.status(403).json({ status: "error" });
    res.json({ status: "success", data: recycle_bin });
  },
);
apiRouter.post(
  "/recycle_bin",
  checkPermission("recycle_bin"),
  (req, res) => {
    const { action, bin_id } = req.body;
    const idx = recycle_bin.findIndex((r) => r.id == bin_id);
    if (idx === -1)
      return res
        .status(404)
        .json({
          status: "error",
          message: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
        });
    const binItem = recycle_bin[idx];
    if (action === "restore") {
      if (binItem.table === "contents") {
        contents.push(binItem.data);
      } else if (binItem.table === "organizations") {
        organizations.push(binItem.data);
      } else if (binItem.table === "smartEventsBank") {
        smartEventsBank.push(binItem.data);
      } else if (binItem.table === "contentTemplates") {
        contentTemplates.push(binItem.data);
      } else if (binItem.table === "collections") {
        collections.push(binItem.data);
      }
      binItem.restored = true;
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC \u0634\u062F",
      });
    } else if (action === "delete_permanent") {
      recycle_bin.splice(idx, 1);
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0628\u0631\u0627\u06CC \u0647\u0645\u06CC\u0634\u0647 \u062D\u0630\u0641 \u0634\u062F",
      });
    }
    res.status(400).json({ status: "error" });
  },
);
apiRouter.get("/get_logs", checkPermission("audit"), (req, res) => {
  res.json({ status: "success", data: audit_logs });
});
apiRouter.get("/get_notifications", (req, res) => {
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
apiRouter.post("/read_notifications", (req, res) => {
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
apiRouter.post("/unlock_events", (req, res) => {
  const { org_id, type, reason } = req.body;
  if (!org_id || !type) {
    return res.json({
      status: "error",
      message:
        "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0642\u0635 \u0627\u0633\u062A",
    });
  }
  const currentJDate = jalaali.toJalaali(new Date());
  let targetYear = currentJDate.jy;
  let targetMonth = currentJDate.jm;
  if (type === "next") {
    targetMonth++;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear++;
    }
  }
  const numericOrgId = parseInt(org_id, 10);
  const existingSelectionIndex = clientSelections.findIndex(
    (cs) =>
      cs.org_id == numericOrgId &&
      cs.year == targetYear &&
      cs.month == targetMonth,
  );
  if (existingSelectionIndex >= 0) {
    clientSelections[existingSelectionIndex].is_final = false;
    clientSelections[existingSelectionIndex].unlock_reason = reason;
    const org = organizations.find((o) => o.id === numericOrgId);
    const orgName = org ? org.org_name : numericOrgId;
    addNotification(
      "\u0628\u0627\u0632 \u0634\u062F\u0646 \u0642\u0641\u0644 \u0645\u0646\u0627\u0633\u0628\u062A\u200C\u0647\u0627",
      reason,
      "client",
      numericOrgId,
      `/client-events?year=${targetYear}&month=${targetMonth}`,
    );
    const jalaaliDate = new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    audit_logs.unshift({
      id:
        audit_logs.length > 0
          ? Math.max(...audit_logs.map((a) => a.id)) + 1
          : 1,
      username: req.session.user || "admin",
      action: `\u0628\u0627\u0632\u06A9\u0631\u062F\u0646 \u0642\u0641\u0644 \u062A\u0642\u0648\u06CC\u0645 ${targetYear}/${targetMonth} \u0633\u0627\u0632\u0645\u0627\u0646 ${orgName} - \u062F\u0644\u06CC\u0644: ${reason || "\u0628\u062F\u0648\u0646 \u062F\u0644\u06CC\u0644"}`,
      ip:
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "127.0.0.1",
      created_at: jalaaliDate,
    });
    saveDatabase().catch(console.error);
    return res.json({
      status: "success",
      message:
        "\u0642\u0641\u0644 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0627\u0632 \u0634\u062F",
    });
  } else {
    return res.json({
      status: "success",
      message:
        "\u0642\u0641\u0644\u06CC \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0645\u0627\u0647 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
    });
  }
});
apiRouter.post("/save_token", checkPermission("settings"), (req, res) => {
  const { org_id, org_name, platform_name, account_username, access_token } =
    req.body;
  tokens.push({
    id: tokens.length > 0 ? Math.max(...tokens.map((t) => t.id)) + 1 : 1,
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
apiRouter.post("/fetch_live_stats", (req, res) => {
  const { org_id, platform, post_link } = req.body;
  if (!post_link) {
    return res.json({
      status: "error",
      message:
        "\u0644\u06CC\u0646\u06A9 \u067E\u0633\u062A \u0648\u0627\u0631\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.",
    });
  }
  const token = tokens.find(
    (t) =>
      t.org_id == org_id &&
      t.platform_name === platform &&
      t.status === "active",
  );
  if (!token) {
    return res.json({
      status: "error",
      message:
        "\u0627\u062A\u0635\u0627\u0644 \u0628\u0647 API \u0627\u06CC\u0646 \u0634\u0628\u06A9\u0647 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u06A9\u0627\u0631\u0641\u0631\u0645\u0627 \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u06CC\u0633\u062A. \u0644\u0637\u0641\u0627 \u0627\u0628\u062A\u062F\u0627 \u062F\u0631 \u0628\u062E\u0634 \u0633\u0644\u0627\u0645\u062A \u062A\u0648\u06A9\u0646\u200C\u0647\u0627 \u0627\u062A\u0635\u0627\u0644 \u0631\u0627 \u0627\u0646\u062C\u0627\u0645 \u062F\u0647\u06CC\u062F.",
    });
  }
  return res.json({
    status: "success",
    data: { views: 0, likes: 0, comments: 0, shares: 0 },
  });
});
apiRouter.get("/get_tokens", (req, res) => {
  res.json({ status: "success", tokens });
});
apiRouter.get("/get_templates", (req, res) => {
  res.json({ status: "success", templates: templatesData });
});
apiRouter.post(
  "/manage_content_template",
  checkPermission("templates"),
  (req, res) => {
    const { action, template, templates } = req.body;
    if (action === "batch_add") {
      let currentId =
        contentTemplates.length > 0
          ? Math.max(...contentTemplates.map((t) => t.id)) + 1
          : 1;
      templates.forEach((tpl) => {
        contentTemplates.push({
          id: currentId++,
          name: tpl.name,
          items: tpl.items.map((i) => ({ ...i, count: i.count || 1 })),
        });
      });
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0642\u0627\u0644\u0628\u200C\u0647\u0627 \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u0646\u062F",
      });
    } else if (action === "add") {
      const newId =
        contentTemplates.length > 0
          ? Math.max(...contentTemplates.map((t) => t.id)) + 1
          : 1;
      contentTemplates.push({
        id: newId,
        name: template.name,
        items: template.items.map((i) => ({ ...i, count: i.count || 1 })),
      });
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0642\u0627\u0644\u0628 \u062C\u062F\u06CC\u062F \u0627\u0636\u0627\u0641\u0647 \u0634\u062F",
      });
    } else if (action === "update") {
      const tpl = contentTemplates.find((t) => t.id === parseInt(template.id));
      if (tpl) {
        tpl.name = template.name;
        tpl.items = template.items.map((i) => ({ ...i, count: i.count || 1 }));
        saveDatabase();
        return res.json({
          status: "success",
          message:
            "\u0642\u0627\u0644\u0628 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F",
        });
      }
      return res.json({
        status: "error",
        message:
          "\u0642\u0627\u0644\u0628 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
    } else if (action === "delete") {
      const tplToDelete = contentTemplates.find(
        (t) => t.id === parseInt(template.id),
      );
      if (tplToDelete) {
        recycle_bin.unshift({
          id: Date.now(),
          table: "contentTemplates",
          item_title:
            tplToDelete.title ||
            "\u0642\u0627\u0644\u0628 \u0645\u062D\u062A\u0648\u0627",
          data: tplToDelete,
          deleted_at: new Date().toISOString(),
          deleted_by:
            req.session && req.session.user && req.session.user.username
              ? req.session.user.username
              : "admin",
        });
        contentTemplates = contentTemplates.filter(
          (t) => t.id !== parseInt(template.id),
        );
        saveDatabase();
        return res.json({
          status: "success",
          message:
            "\u0642\u0627\u0644\u0628 \u0628\u0647 \u0633\u0637\u0644 \u0632\u0628\u0627\u0644\u0647 \u0645\u0646\u062A\u0642\u0644 \u0634\u062F",
        });
      }
      return res.status(404).json({ status: "error" });
    }
    res.json({
      status: "error",
      message:
        "\u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
    });
  },
);
apiRouter.get("/get_content_templates", (req, res) => {
  res.json(contentTemplates);
});
apiRouter.post(
  "/apply_content_template",
  checkPermission("depot"),
  (req, res) => {
    const { template_id, org_id, year, month } = req.body;
    const tpl = contentTemplates.find((t) => t.id === parseInt(template_id));
    if (!tpl)
      return res.json({
        status: "error",
        message:
          "\u0642\u0627\u0644\u0628 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
    let tplItems =
      typeof tpl.items === "string" ? JSON.parse(tpl.items) : tpl.items;
    if (!Array.isArray(tplItems))
      return res.json({ status: "error", message: "Invalid template items" });
    tplItems.forEach((item) => {
      const newId =
        templateSuggestions.length > 0
          ? Math.max(...templateSuggestions.map((s) => s.id)) + 1
          : 1;
      templateSuggestions.push({
        id: newId,
        org_id: parseInt(org_id),
        year: parseInt(year),
        month: parseInt(month),
        day: item.dayOffset,
        content_type: item.type,
        topic: item.topic,
        status: "pending",
      });
    });
    saveDatabase().catch(console.error);
    res.json({
      status: "success",
      message:
        "\u0642\u0627\u0644\u0628 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u0639\u0645\u0627\u0644 \u0634\u062F",
    });
  },
);
apiRouter.post("/dismiss_template_suggestion", (req, res) => {
  const { suggestion_id } = req.body;
  const sug = templateSuggestions.find((s) => s.id === parseInt(suggestion_id));
  if (sug) {
    sug.status = "dismissed";
    saveDatabase();
    res.json({ status: "success" });
  } else {
    res.json({ status: "error" });
  }
});
apiRouter.post("/fulfill_template_suggestion", (req, res) => {
  const { suggestion_id, content_id } = req.body;
  const sug = templateSuggestions.find((s) => s.id === parseInt(suggestion_id));
  if (sug) {
    sug.status = "fulfilled";
    const c = contents.find((x) => x.id === parseInt(content_id));
    if (c) {
      const m = sug.month.toString().padStart(2, "0");
      const d = sug.day.toString().padStart(2, "0");
      c.publish_date = `${sug.year}/${m}/${d}`;
      if (c.status === "raw") c.status = "todo";
    }
    saveDatabase();
    res.json({ status: "success" });
  } else {
    res.json({ status: "error" });
  }
});
apiRouter.post("/apply_template", checkPermission("depot"), (req, res) => {
  const { template_id, org_id } = req.body;
  const template = templatesData.find((t) => t.id == template_id);
  const org = organizations.find((o) => o.id == org_id);
  if (!template || !org) {
    return res.json({
      status: "error",
      message:
        "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.",
    });
  }
  let checklist = { tasks: [] };
  try {
    checklist = JSON.parse(template.checklist_data);
  } catch (e) {
    console.error("Error parsing checklist:", e);
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u062F\u0627\u062F\u0647\u200C\u0647\u0627\u06CC \u0627\u0644\u06AF\u0648 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.",
      });
  }
  let createdCount = 0;
  checklist.tasks.forEach((taskName) => {
    contents.unshift({
      id:
        contents.length > 0
          ? Math.max(...contents.map((c) => c.id)) + 1 + createdCount
          : 1,
      title: `${template.template_name} - ${taskName}`,
      org_id: org.id,
      content_type: template.industry_category,
      status: "raw",
      publish_date: new Date().toLocaleDateString("fa-IR"),
      publish_time: "12:00:00",
    });
    createdCount++;
  });
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message: `${createdCount} \u062A\u0633\u06A9 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062F\u0631 \u062F\u067E\u0648 \u0627\u06CC\u062C\u0627\u062F \u0634\u062F.`,
  });
});
apiRouter.get("/get_media", (req, res) => {
  const assetsWithOrg = mediaAssets.map((asset) => {
    const org = organizations.find((o) => o.id == asset.org_id);
    return {
      ...asset,
      org_name: org
        ? org.org_name
        : "\u0639\u0645\u0648\u0645\u06CC / \u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
      org_color: org ? org.color : "var(--text-gray)",
      org_logo: org ? org.logo_url : "",
    };
  });
  res.json({ status: "success", assets: assetsWithOrg });
});
apiRouter.post("/save_media", (req, res) => {
  const { action, media, org_id, asset_name, asset_type, file_url } = req.body;
  if (action === "batch_add") {
    let currentId =
      mediaAssets.length > 0
        ? Math.max(...mediaAssets.map((x) => x.id)) + 1
        : 1;
    media.forEach((m) => {
      let numericOrgId = null;
      if (m.org_username) {
        const org = organizations.find((o) => o.username === m.org_username);
        if (org) numericOrgId = org.id;
      } else if (m.org_id) {
        numericOrgId = parseInt(m.org_id);
      }
      mediaAssets.push({
        id: currentId++,
        org_id: numericOrgId,
        asset_name: m.asset_name,
        asset_type: m.asset_type,
        file_url: m.file_url,
        created_at: new Date().toLocaleDateString("fa-IR"),
      });
    });
    saveDatabase().catch(console.error);
    return res.json({
      status: "success",
      message:
        "\u0641\u0627\u06CC\u0644\u200C\u0647\u0627 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F\u0646\u062F.",
    });
  }
  if (!asset_name || !asset_type) {
    return res.json({
      status: "error",
      message:
        "\u0641\u06CC\u0644\u062F\u200C\u0647\u0627\u06CC \u0636\u0631\u0648\u0631\u06CC \u0631\u0627 \u062A\u06A9\u0645\u06CC\u0644 \u06A9\u0646\u06CC\u062F.",
    });
  }
  const newAsset = {
    id:
      mediaAssets.length > 0
        ? Math.max(...mediaAssets.map((x) => x.id)) + 1
        : 1,
    org_id: org_id || null,
    asset_name,
    asset_type,
    file_url,
    created_at: new Date().toLocaleDateString("fa-IR"),
  };
  mediaAssets.push(newAsset);
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u0641\u0627\u06CC\u0644 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062F\u0631 \u06A9\u062A\u0627\u0628\u062E\u0627\u0646\u0647 \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F.",
  });
});
apiRouter.post("/save_onboarding", (req, res) => {
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
        ? Math.max(...organizations.map((x) => x.id)) + 1
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
apiRouter.get(
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
apiRouter.post("/save_expense", checkPermission("finance"), (req, res) => {
  const { description, project_name, amount, date } = req.body;
  const newExp = {
    id: expenses.length > 0 ? Math.max(...expenses.map((x) => x.id)) + 1 : 1,
    description:
      description ||
      "\u0647\u0632\u06CC\u0646\u0647 \u062A\u0648\u0644\u06CC\u062F \u0645\u062D\u062A\u0648\u0627",
    project_name:
      project_name || "\u0628\u062F\u0648\u0646 \u067E\u0631\u0648\u0698\u0647",
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
    message: "\u0647\u0632\u06CC\u0646\u0647 \u062B\u0628\u062A \u0634\u062F",
  });
});
apiRouter.get("/get_orgs_public", (req, res) => {
  res.json(organizations);
});
apiRouter.get("/get_client_data", (req, res) => {
  const org_id = parseInt(req.query.org_id);
  if (!org_id) return res.json({ status: "success", pending: [] });
  const pending_contents = contents.filter((c) => c.org_id == org_id).reverse();
  res.json({ status: "success", pending: pending_contents });
});
apiRouter.post("/client_review", (req, res) => {
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
    addNotification(
      "\u0646\u062A\u06CC\u062C\u0647 \u0628\u0631\u0631\u0633\u06CC \u0645\u062D\u062A\u0648\u0627",
      `\u0645\u062D\u062A\u0648\u0627\u06CC "${item.title}" \u062A\u0648\u0633\u0637 \u0646\u0645\u0627\u06CC\u0646\u062F\u0647 ${org ? org.org_name : ""} ${actionFa}.${comment ? " \u062A\u0648\u0636\u06CC\u062D\u0627\u062A: " + comment : ""}`,
      "admin",
      null,
      "/depot",
      "content_reviewed",
      item.id,
    );
    if (item.assigned_colleagues && item.assigned_colleagues.length > 0) {
      item.assigned_colleagues.forEach((colId) => {
        addNotification(
          "\u0628\u0631\u0631\u0633\u06CC \u0645\u062D\u062A\u0648\u0627 \u062A\u0648\u0633\u0637 \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
          `\u0645\u062D\u062A\u0648\u0627\u06CC "${item.title}" ${actionFa}.${comment ? " \u062A\u0648\u0636\u06CC\u062D\u0627\u062A: " + comment : ""}`,
          "colleague",
          parseInt(colId),
          "/depot",
          "content_reviewed",
          item.id,
        );
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
apiRouter.post("/confirm_events", (req, res) => {
  const { selected_events, org_id } = req.body;
  if (!selected_events || selected_events.length === 0) {
    return res.json({
      status: "error",
      message:
        "\u0645\u0648\u0631\u062F\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u0646\u0634\u062F",
    });
  }
  const oId = parseInt(org_id) || 1;
  const org = organizations.find((o) => o.id == oId);
  let count = 0;
  selected_events.forEach((ev) => {
    contents.push({
      id: contents.length > 0 ? Math.max(...contents.map((x) => x.id)) + 1 : 1,
      title:
        "\u067E\u0633\u062A \u0645\u0646\u0627\u0633\u0628\u062A\u06CC: " + ev,
      org_id: oId,
      org_name: org ? org.org_name : "",
      org_color: org ? org.color : "#4f46e5",
      org_logo: org ? org.logo_url : "",
      content_type:
        "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
      status: "raw",
      publish_date: "",
      publish_time: "",
    });
    if (req.session && req.session.user)
      addAuditLog(
        req.session.user || "\u0633\u06CC\u0633\u062A\u0645",
        "\u0627\u0641\u0632\u0648\u062F\u0646 \u0645\u062D\u062A\u0648\u0627/\u06A9\u0627\u0631\u062A \u062C\u062F\u06CC\u062F",
        req.ip || "127.0.0.1",
      );
    if (req.session && req.session.user)
      addAuditLog(
        req.session.user || "\u0633\u06CC\u0633\u062A\u0645",
        "\u0627\u0641\u0632\u0648\u062F\u0646 \u0645\u062D\u062A\u0648\u0627/\u06A9\u0627\u0631\u062A \u062C\u062F\u06CC\u062F",
        req.ip || "127.0.0.1",
      );
    count++;
  });
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      count +
      " \u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062A\u0627\u06CC\u06CC\u062F \u0648 \u0628\u0647 \u0639\u0646\u0648\u0627\u0646 \u06A9\u0627\u0631\u062A \u062E\u0627\u0645 \u0628\u0647 \u062F\u067E\u0648\u06CC \u062A\u0648\u0644\u06CC\u062F \u0627\u0633\u062A\u0648\u062F\u06CC\u0648 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F!",
  });
});
apiRouter.get("/get_fonts", async (req, res) => {
  let fontDocs = [];
  try {
    const q = await getDocs(collection(db, "fonts"));
    q.forEach((d) => fontDocs.push(d.id));
  } catch (e) {}
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
apiRouter.post(
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
apiRouter.post(
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
apiRouter.post(
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
apiRouter.post("/rename_font", checkPermission("settings"), (req, res) => {
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
apiRouter.post(
  "/delete_font",
  checkPermission("settings"),
  async (req, res) => {
    const { filename } = req.body;
    try {
      await deleteDoc(doc(db, "fonts", filename));
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
apiRouter.post(
  "/update_platform_metrics",
  checkPermission("depot"),
  (req, res) => {
    const { id, platform, data } = req.body;
    const card = contents.find((c) => c.id == id);
    if (card) {
      if (!card.platform_metrics) card.platform_metrics = {};
      card.platform_metrics[platform] = data;
      if (!card.published_platforms) card.published_platforms = [];
      if (data.status === "published" || data.status === "scheduled") {
        if (!card.published_platforms.includes(platform)) {
          card.published_platforms.push(platform);
        }
      } else {
        card.published_platforms = card.published_platforms.filter(
          (p) => p !== platform,
        );
      }
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u067E\u0644\u062A\u0641\u0631\u0645 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  },
);
apiRouter.post(
  "/toggle_platform_published",
  checkPermission("depot"),
  (req, res) => {
    const { id, platform, status } = req.body;
    const card = contents.find((c) => c.id == id);
    if (card) {
      if (!card.published_platforms) card.published_platforms = [];
      if (status) {
        if (!card.published_platforms.includes(platform)) {
          card.published_platforms.push(platform);
        }
      } else {
        card.published_platforms = card.published_platforms.filter(
          (p) => p !== platform,
        );
      }
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0648\u0636\u0639\u06CC\u062A \u067E\u0644\u062A\u0641\u0631\u0645 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  },
);
apiRouter.post("/toggle_stage", checkPermission("depot"), (req, res) => {
  const { id, stage, isChecked } = req.body;
  const card = contents.find((c) => c.id == id);
  if (card) {
    if (!card.completed_stages) card.completed_stages = [];
    if (isChecked) {
      if (!card.completed_stages.includes(stage)) {
        card.completed_stages.push(stage);
      }
    } else {
      card.completed_stages = card.completed_stages.filter((s) => s !== stage);
    }
    saveDatabase();
    return res.json({
      status: "success",
      message:
        "\u0645\u0631\u062D\u0644\u0647 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
    });
  }
  return res
    .status(404)
    .json({
      status: "error",
      message:
        "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
    });
});
apiRouter.post(
  "/batch_edit_contents",
  checkPermission("depot"),
  (req, res) => {
    try {
      const {
        ids,
        action,
        status,
        org_id,
        collection_title,
        content_type,
        project_manager,
        team,
        platforms,
        stages,
        components,
      } = req.body;
      const batchId = "batch_" + Date.now();
      const previousStates = [];
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.json({
          status: "error",
          message:
            "\u0647\u06CC\u0686 \u0645\u062D\u062A\u0648\u0627\u06CC\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.",
        });
      }
      const username = req.session?.user?.username || "system";
      let updatedCount = 0;
      let deletedBinIds = [];
      if (action === "delete") {
        for (const id of ids) {
          const idx = contents.findIndex((c) => c.id === parseInt(id));
          if (idx !== -1) {
            const itemToDelete = contents[idx];
            const binId = Date.now() + Math.floor(Math.random() * 1e6) + idx;
            deletedBinIds.push(binId);
            recycle_bin.unshift({
              id: binId,
              table: "contents",
              item_title:
                itemToDelete.title ||
                "\u0645\u062D\u062A\u0648\u0627\u06CC \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
              data: itemToDelete,
              deleted_at: new Date().toISOString(),
              deleted_by: username,
            });
            contents.splice(idx, 1);
            updatedCount++;
          }
        }
        addAuditLog(username, "batch_delete", req.ip);
      } else {
        for (const id of ids) {
          const card = contents.find((c) => c.id === parseInt(id));
          if (!card) continue;
          previousStates.push(JSON.parse(JSON.stringify(card)));
          if (action === "archive") {
            card.status = "archived";
            updatedCount++;
          } else if (action === "status" && status) {
            card.status = status;
            logContentActivity(
              card,
              req,
              `\u0648\u0636\u0639\u06CC\u062A \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u0628\u0647 ${status} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
            );
            updatedCount++;
          } else if (action === "org") {
            const o = organizations.find((x) => x.id === parseInt(org_id));
            if (o) {
              card.org_id = o.id;
              card.org_name = o.org_name;
              card.org_color = o.color;
              card.org_logo = o.logo_url;
              logContentActivity(
                card,
                req,
                `\u0633\u0627\u0632\u0645\u0627\u0646 \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u0628\u0647 ${o.org_name} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
              );
              updatedCount++;
            } else if (org_id === "") {
              card.org_id = null;
              card.org_name = "";
              card.org_color = "#4f46e5";
              card.org_logo = "";
              updatedCount++;
            }
          } else if (action === "collection" && collection_title !== void 0) {
            const colName = collection_title.trim();
            if (colName) {
              let existingCol = collections.find(
                (c) => c.title === colName && c.org_id === card.org_id,
              );
              if (!existingCol) {
                existingCol = {
                  id: collections.length
                    ? Math.max(...collections.map((c) => c.id)) + 1
                    : 1,
                  title: colName,
                  org_id: card.org_id,
                  created_at: new Intl.DateTimeFormat("fa-IR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date()),
                  is_active: 1,
                };
                collections.push(existingCol);
              }
              card.collection_id = existingCol.id;
            } else {
              card.collection_id = null;
            }
            logContentActivity(
              card,
              req,
              `\u0645\u062C\u0645\u0648\u0639\u0647 \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
            );
            updatedCount++;
          } else if (action === "type" && content_type) {
            card.content_type = content_type;
            logContentActivity(
              card,
              req,
              `\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0627 \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u0628\u0647 ${content_type} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
            );
            updatedCount++;
          } else if (action === "manager" && project_manager !== void 0) {
            card.project_manager = project_manager;
            logContentActivity(
              card,
              req,
              `\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647 \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
            );
            updatedCount++;
          } else if (action === "team" && Array.isArray(team)) {
            const teamNames = [];
            team.forEach((tId) => {
              const colUser = colleagues.find((c) => c.id === parseInt(tId));
              if (colUser) teamNames.push(colUser.full_name);
            });
            card.assigned_colleagues = teamNames;
            logContentActivity(
              card,
              req,
              `\u062A\u06CC\u0645 \u0647\u0645\u06A9\u0627\u0631\u0627\u0646 \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
            );
            updatedCount++;
          } else if (action === "platforms" && Array.isArray(platforms)) {
            card.publish_platforms = platforms;
            updatedCount++;
          } else if (action === "stages" && Array.isArray(stages)) {
            card.stages = stages;
            updatedCount++;
          } else if (action === "components" && components) {
            card.components_count = components;
            logContentActivity(
              card,
              req,
              `\u062A\u0639\u062F\u0627\u062F \u0627\u062C\u0632\u0627 \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
            );
            updatedCount++;
          } else if (action === "shift_dates" && req.body.shift_days) {
            let shiftDays = parseInt(req.body.shift_days);
            if (!isNaN(shiftDays) && card.publish_date) {
              const [jYear, jMonth, jDay] = card.publish_date
                .split("/")
                .map(Number);
              const jalaali2 = require("jalaali-js");
              let gDate = jalaali2.toGregorian(jYear, jMonth, jDay);
              let dateObj = new Date(gDate.gy, gDate.gm - 1, gDate.gd);
              dateObj.setDate(dateObj.getDate() + shiftDays);
              let newJ = jalaali2.toJalaali(
                dateObj.getFullYear(),
                dateObj.getMonth() + 1,
                dateObj.getDate(),
              );
              card.publish_date = newJ.jy + "/" + newJ.jm + "/" + newJ.jd;
              card.publish_day = newJ.jd;
              card.publish_month = newJ.jm;
              updatedCount++;
            }
          }
        }
        addAuditLog(username, "batch_edit", req.ip);
      }
      if (updatedCount > 0) {
        if (action === "delete") {
          batch_operations.unshift({
            id: batchId,
            type: "batch_delete",
            title: "\u062D\u0630\u0641 \u06AF\u0631\u0648\u0647\u06CC",
            description: `\u062A\u0639\u062F\u0627\u062F ${updatedCount} \u0645\u062D\u062A\u0648\u0627 \u062D\u0630\u0641 \u06AF\u0631\u0648\u0647\u06CC \u0634\u062F\u0646\u062F.`,
            deleted_bin_ids: deletedBinIds,
            user: username,
            timestamp: new Date().toISOString(),
            is_undone: false,
          });
        } else {
          batch_operations.unshift({
            id: batchId,
            type: "batch_edit",
            title:
              "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u06AF\u0631\u0648\u0647\u06CC",
            description: `\u062A\u0639\u062F\u0627\u062F ${updatedCount} \u0645\u062D\u062A\u0648\u0627 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u06AF\u0631\u0648\u0647\u06CC \u0634\u062F\u0646\u062F.`,
            previous_states: previousStates,
            user: username,
            timestamp: new Date().toISOString(),
            is_undone: false,
          });
        }
      }
      saveDatabase();
      return res.json({ status: "success", updated: updatedCount });
    } catch (err) {
      return res.json({ status: "error", message: err.message });
    }
  },
);
apiRouter.post(
  "/update_content_details",
  checkPermission("depot"),
  (req, res) => {
    const {
      id,
      title,
      caption,
      video_link,
      cover_link,
      org_id,
      collection_id,
      content_type,
      project_manager,
      assigned_colleagues,
      publish_date,
      publish_time,
      publish_platforms,
      stages,
      status,
    } = req.body;
    const card = contents.find((c) => c.id == id);
    if (card) {
      const prevState = JSON.parse(JSON.stringify(card));
      let changes = [];
      const oldStatus = card.status;
      const oldPublishDate = card.publish_date;
      const oldTitle = card.title;
      if (title !== void 0) card.title = title;
      if (caption !== void 0) card.caption = caption;
      if (video_link !== void 0) card.video_link = video_link;
      if (cover_link !== void 0) card.cover_link = cover_link;
      if (org_id !== void 0) card.org_id = org_id ? parseInt(org_id) : null;
      if (collection_id !== void 0) {
        if (
          typeof collection_id === "string" &&
          isNaN(parseInt(collection_id))
        ) {
          const newCol = {
            id: collections.length
              ? Math.max(...collections.map((c) => c.id)) + 1
              : 1,
            title: collection_id,
            org_id: card.org_id,
            created_at: new Intl.DateTimeFormat("fa-IR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date()),
            is_active: 1,
          };
          collections.push(newCol);
          card.collection_id = newCol.id;
        } else {
          card.collection_id = collection_id ? parseInt(collection_id) : null;
        }
      }
      if (content_type !== void 0) card.content_type = content_type;
      if (project_manager !== void 0) card.project_manager = project_manager;
      if (assigned_colleagues !== void 0) {
        const old_assigned = card.assigned_colleagues || [];
        card.assigned_colleagues = assigned_colleagues;
        const newlyAssigned = assigned_colleagues.filter(
          (x) => !old_assigned.includes(x),
        );
        newlyAssigned.forEach((colName) => {
          const colUser = colleagues.find((c) => c.full_name === colName);
          if (colUser) {
            addNotification(
              "\u0627\u0631\u062C\u0627\u0639 \u06A9\u0627\u0631 \u062C\u062F\u06CC\u062F",
              `\u0645\u062D\u062A\u0648\u0627\u06CC "${card.title}" \u0628\u0647 \u0634\u0645\u0627 \u0627\u0631\u062C\u0627\u0639 \u062F\u0627\u062F\u0647 \u0634\u062F.`,
              "colleague",
              colUser.id,
              "/depot",
              "content_assigned",
              card.id,
            );
          }
        });
      }
      if (publish_date !== void 0) card.publish_date = publish_date;
      if (publish_time !== void 0) card.publish_time = publish_time;
      if (publish_platforms !== void 0)
        card.publish_platforms = publish_platforms;
      if (stages !== void 0) card.stages = stages;
      if (req.body.components_count !== void 0)
        card.components_count = req.body.components_count;
      if (req.body.attachments !== void 0)
        card.attachments = req.body.attachments;
      if (status !== void 0) {
        if (card.status !== "done" && status === "done") {
          addNotification(
            "\u0645\u062D\u062A\u0648\u0627\u06CC \u062C\u062F\u06CC\u062F \u0628\u0631\u0627\u06CC \u0628\u0631\u0631\u0633\u06CC",
            `\u0645\u062D\u062A\u0648\u0627\u06CC "${card.title}" \u062A\u0648\u0644\u06CC\u062F \u0634\u062F\u0647 \u0648 \u0622\u0645\u0627\u062F\u0647 \u0628\u0631\u0631\u0633\u06CC \u0648 \u062A\u0627\u06CC\u06CC\u062F \u0634\u0645\u0627\u0633\u062A.`,
            "client",
            card.org_id,
            "/client-portal",
          );
        }
        card.status = status;
      }
      if (title !== void 0 && oldTitle !== title)
        changes.push(
          `\u0639\u0646\u0648\u0627\u0646 \u0631\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
        );
      if (publish_date !== void 0 && oldPublishDate !== publish_date)
        changes.push(
          `\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631 \u0631\u0627 \u0627\u0632 ${oldPublishDate || "\u0646\u062F\u0627\u0634\u062A"} \u0628\u0647 ${publish_date} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
        );
      if (status !== void 0 && oldStatus !== status)
        changes.push(
          `\u0648\u0636\u0639\u06CC\u062A \u0631\u0627 \u0627\u0632 ${oldStatus || "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645"} \u0628\u0647 ${status} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
        );
      if (changes.length > 0) {
        logContentActivity(card, req, changes.join(" \u0648 "));
      } else if (caption !== void 0 && oldTitle === title) {
        logContentActivity(
          card,
          req,
          "\u0645\u062A\u0646 \u06A9\u067E\u0634\u0646 \u0631\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F",
        );
      } else if (video_link !== void 0 || cover_link !== void 0) {
        logContentActivity(
          card,
          req,
          "\u0644\u06CC\u0646\u06A9\u200C\u0647\u0627\u06CC \u0636\u0645\u06CC\u0645\u0647 \u0645\u062D\u062A\u0648\u0627 \u0631\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F",
        );
      } else if (
        org_id !== void 0 ||
        collection_id !== void 0 ||
        content_type !== void 0 ||
        project_manager !== void 0 ||
        assigned_colleagues !== void 0 ||
        publish_time !== void 0 ||
        publish_platforms !== void 0 ||
        stages !== void 0 ||
        req.body.components_count !== void 0
      ) {
        logContentActivity(
          card,
          req,
          "\u062C\u0632\u0626\u06CC\u0627\u062A \u0648 \u0645\u0634\u062E\u0635\u0627\u062A \u0645\u062D\u062A\u0648\u0627 \u0631\u0627 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u06A9\u0631\u062F",
        );
      }
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
        data: card,
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  },
);
apiRouter.get("/invoices", checkPermission("invoice"), (req, res) => {
  res.json({ status: "success", data: invoices });
});
apiRouter.post("/invoices", checkPermission("invoice"), (req, res) => {
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
            "\u0641\u0627\u06A9\u062A\u0648\u0631 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F",
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
        "\u0641\u0627\u06A9\u062A\u0648\u0631 \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F",
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
          "\u0648\u0636\u0639\u06CC\u062A \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F",
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
          "\u067E\u0631\u062F\u0627\u062E\u062A \u062B\u0628\u062A \u0634\u062F",
      });
    }
  }
  return res
    .status(404)
    .json({
      status: "error",
      message:
        "\u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
    });
});
apiRouter.get(
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
            "\u0641\u0627\u06A9\u062A\u0648\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
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
          "\u0633\u0627\u0632\u0645\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
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
          "\u0628\u062F\u0648\u0646 \u067E\u0644\u062A\u0641\u0631\u0645"
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
          ? c.publish_platforms.join("\u060C ")
          : c.publish_platforms
        : "\u0628\u062F\u0648\u0646 \u067E\u0644\u062A\u0641\u0631\u0645";
      let content_type =
        c.content_type || "\u0646\u0627\u0645\u0634\u062E\u0635";
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
              type: `${c.title} (\u0628\u062E\u0634: ${k})`,
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
apiRouter.get("/get_org_report", checkPermission("reports"), (req, res) => {
  const org_id = req.query.org_id;
  const start_date = req.query.start_date;
  const end_date = req.query.end_date;
  const col_id = req.query.col_id;
  const status_filter = req.query.status;
  const platform_filter = req.query.platform;
  const no_time_limit = req.query.no_time_limit;
  if (!org_id)
    return res.json({ status: "error", message: "org_id is required" });
  const org = organizations.find((o) => o.id == org_id);
  if (!org)
    return res.json({ status: "error", message: "Organization not found" });
  let orgContents = contents
    .filter((c) => c.org_id == org_id)
    .map((c) => ({ ...c }));
  if (col_id) {
    orgContents = orgContents.filter((c) => c.col_id == col_id);
  }
  if (status_filter) {
    orgContents = orgContents.filter(
      (c) => (c.status || "raw") === status_filter,
    );
  }
  if (platform_filter) {
    orgContents = orgContents.filter(
      (c) =>
        c.publish_platforms && c.publish_platforms.includes(platform_filter),
    );
  }
  if (no_time_limit !== "true") {
    if (start_date) {
      orgContents = orgContents.filter(
        (c) => c.publish_date && c.publish_date >= start_date,
      );
    }
    if (end_date) {
      orgContents = orgContents.filter(
        (c) => c.publish_date && c.publish_date <= end_date,
      );
    }
  }
  const typeCounts = {};
  const statusCounts = {};
  const platformCounts = {};
  let total_components = 0;
  let stats_counted_length = 0;
  orgContents.forEach((c) => {
    if (c.is_recurrence_instance) {
      if (!c.title.includes(" (\u062A\u06A9\u0631\u0627\u0631)"))
        c.title += " (\u062A\u06A9\u0631\u0627\u0631)";
    }
    const skipStats = c.is_recurrence_instance && c.count_in_stats === false;
    if (!skipStats) {
      stats_counted_length++;
      if (c.content_type)
        typeCounts[c.content_type] = (typeCounts[c.content_type] || 0) + 1;
      const statusMap = {
        raw: "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645",
        todo: "\u062F\u0631 \u0635\u0641 \u0627\u0646\u062A\u0638\u0627\u0631",
        in_progress:
          "\u062F\u0631 \u062D\u0627\u0644 \u062A\u0648\u0644\u06CC\u062F",
        review:
          "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
        client_review:
          "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
        needs_revision:
          "\u0646\u06CC\u0627\u0632 \u0628\u0647 \u0627\u0635\u0644\u0627\u062D",
        done: "\u062A\u06A9\u0645\u06CC\u0644 \u0634\u062F\u0647",
        approved_by_client:
          "\u062A\u0627\u06CC\u06CC\u062F \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
        ready_to_publish:
          "\u0622\u0645\u0627\u062F\u0647 \u0627\u0646\u062A\u0634\u0627\u0631",
        published: "\u0645\u0646\u062A\u0634\u0631 \u0634\u062F\u0647",
      };
      let s = statusMap[c.status || "raw"] || c.status || "raw";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      if (c.publish_platforms) {
        c.publish_platforms.forEach((p) => {
          platformCounts[p] = (platformCounts[p] || 0) + 1;
        });
      }
      const comps = c.components_count || {};
      let cCount = 0;
      for (let k in comps) cCount += comps[k];
      if (cCount === 0) cCount = 1;
      total_components += cCount;
    }
    const comps2 = c.components_count || {};
    let cCount2 = 0;
    for (let k in comps2) cCount2 += comps2[k];
    if (cCount2 === 0) cCount2 = 1;
    c.total_components = cCount2;
  });
  res.json({
    status: "success",
    organization: org,
    contents: orgContents,
    stats: {
      typeCounts,
      statusCounts,
      platformCounts,
      total_contents: stats_counted_length,
      total_components,
    },
  });
});
apiRouter.get("/get_studio_info", (req, res) => {
  res.json({ status: "success", data: settings.studio_info });
});
apiRouter.post(
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
apiRouter.get("/get_all_roles", (req, res) => res.json(roles));
apiRouter.get("/get_all_users", (req, res) => res.json(colleagues));
apiRouter.get("/get_counts", (req, res) =>
  res.json({
    recycle: recycle_bin.length,
    batch: batch_operations.length,
    ops: batch_operations,
  }),
);
apiRouter.get("/get_batch_operations", (req, res) => {
  const user = req.session && req.session.user ? req.session.user : null;
  const username = user && user.username ? user.username : "admin";
  let userOps = batch_operations;
  if (user && user.role_id !== 1) {
    userOps = batch_operations.filter((op) => op.user === username);
  }
  res.json({ status: "success", data: userOps });
});
apiRouter.post("/undo_batch_operation", (req, res) => {
  const username =
    req.session && req.session.user && req.session.user.username
      ? req.session.user.username
      : "admin";
  const { batch_id } = req.body;
  const operation = batch_operations.find((op) => op.id === batch_id);
  if (!operation) {
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u0639\u0645\u0644\u06CC\u0627\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  }
  let opUser =
    typeof operation.user === "object"
      ? operation.user.username
      : operation.user;
  const isGlobalAdmin =
    (req.session &&
      req.session.user &&
      (req.session.user.role_id === 1 ||
        req.session.user.role_id === "admin")) ||
    username === "admin";
  if (opUser !== username && !isGlobalAdmin && opUser !== "system") {
    return res
      .status(403)
      .json({
        status: "error",
        message:
          "\u0634\u0645\u0627 \u0645\u062C\u0627\u0632 \u0628\u0647 \u0644\u063A\u0648 \u0627\u06CC\u0646 \u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u06CC\u0633\u062A\u06CC\u062F",
      });
  }
  if (operation.is_undone) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0627\u06CC\u0646 \u0639\u0645\u0644\u06CC\u0627\u062A \u0642\u0628\u0644\u0627\u064B \u0644\u063A\u0648 \u0634\u062F\u0647 \u0627\u0633\u062A",
      });
  }
  let errorMsg = null;
  if (operation.type === "batch_delete") {
    const binIds = operation.deleted_bin_ids || [];
    for (const binId of binIds) {
      const binIndex = recycle_bin.findIndex((b) => b.id === binId);
      if (binIndex !== -1) {
        const binItem = recycle_bin[binIndex];
        if (binItem.restored) continue;
        if (binItem.table === "contents") contents.unshift(binItem.data);
        else if (binItem.table === "organizations")
          organizations.unshift(binItem.data);
        else if (binItem.table === "smartEventsBank")
          smartEventsBank.unshift(binItem.data);
        else if (binItem.table === "contentTemplates")
          contentTemplates.unshift(binItem.data);
        binItem.restored = true;
      }
    }
  } else if (operation.type === "bulk_import") {
    const itemIds = operation.item_ids || [];
    for (const itemId of itemIds) {
      const idx = contents.findIndex((c) => c.id === itemId);
      if (idx !== -1) {
        recycle_bin.unshift({
          id: Date.now() + Math.random(),
          table: "contents",
          item_title:
            contents[idx].title ||
            "\u0645\u062D\u062A\u0648\u0627\u06CC \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
          data: contents[idx],
          deleted_at: new Date().toISOString(),
          deleted_by: username,
        });
        contents.splice(idx, 1);
      }
    }
  } else if (operation.type === "batch_edit") {
    const prevStates = operation.previous_states || [];
    for (const prevState of prevStates) {
      if (prevState && prevState.id) {
        const idx = contents.findIndex((c) => c.id === prevState.id);
        if (idx !== -1) {
          contents[idx] = { ...prevState };
        }
      }
    }
  } else {
    errorMsg =
      "\u0646\u0648\u0639 \u0639\u0645\u0644\u06CC\u0627\u062A \u0628\u0631\u0627\u06CC \u0644\u063A\u0648 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F";
  }
  if (errorMsg) {
    return res.status(400).json({ status: "error", message: errorMsg });
  }
  operation.is_undone = true;
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u0639\u0645\u0644\u06CC\u0627\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0644\u063A\u0648 \u0634\u062F",
  });
});
apiRouter.use((req, res) => {
  res.status(404).json({ status: "error", message: "API route not found" });
});
const fontCache = {};
app.get("/fonts/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const fs2 = require("fs");
    const path2 = require("path");
    const filePath = path2.join(process.cwd(), "public", "fonts", filename);
    if (fs2.existsSync(filePath)) {
      res.setHeader("Content-Type", "font/ttf");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.sendFile(filePath);
    }
    if (fontCache[filename]) {
      res.setHeader("Content-Type", "font/ttf");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(fontCache[filename]);
    }
    const docSnap = await getDoc(doc(db, "fonts", filename));
    if (docSnap.exists()) {
      const fileData = docSnap.data();
      const buffer = Buffer.from(fileData.data, "base64");
      fontCache[filename] = buffer;
      res.setHeader("Content-Type", "font/ttf");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(buffer);
    }
    res.status(404).send("Not found");
  } catch (e) {
    res.status(500).send("Error");
  }
});
const uploadCache = {};
app.get("/uploads/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const fs2 = require("fs");
    const path2 = require("path");
    const filePath = path2.join(process.cwd(), "public", "uploads", filename);
    if (fs2.existsSync(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.sendFile(filePath);
    }
    if (uploadCache[filename]) {
      res.setHeader("Content-Type", uploadCache[filename].mime);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(uploadCache[filename].buffer);
    }
    const docSnap = await getDoc(doc(db, "uploads", filename));
    if (docSnap.exists()) {
      const fileData = docSnap.data();
      const buffer = Buffer.from(fileData.data, "base64");
      uploadCache[filename] = { buffer, mime: fileData.mime };
      res.setHeader("Content-Type", fileData.mime);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(buffer);
    }
    res.status(404).send("Not found");
  } catch (e) {
    res.status(500).send("Error");
  }
});
app.use("/api", apiRouter);
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
app.use(BASE_URL || "/", router);
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res
    .status(500)
    .json({
      status: "error",
      message:
        "\u062E\u0637\u0627\u06CC \u0633\u0631\u0648\u0631 \u0631\u062E \u062F\u0627\u062F\u0647 \u0627\u0633\u062A. \u0644\u0637\u0641\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.",
    });
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

//# sourceMappingURL=data:application/json;base64,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TyxJQUFJLEtBQUssTUFBTSxDQUMxQixDQUNBLElBQUksT0FBTyxHQUFHLEVBQUUsS0FBSyxXQUFXLENBQ3BDLE9BQVEsRUFBRyxDQUNQLElBQUksT0FBTyxHQUFHLEVBQUUsS0FBSyxPQUFPLENBQ2hDLENBQ0osQ0FBQyxFQUVELElBQUksSUFBSSxPQUFRLFNBQVMsRUFHekIsSUFBSSxJQUFJLElBQUssQ0FBQyxJQUFLLE1BQVEsQ0FDekIsSUFBSSxTQUFTLEdBQUcsQ0FDbEIsQ0FBQyxFQUlELFlBQVksSUFBTSxDQUNkLE1BQU0sTUFBUSxJQUFJLEtBQUssZUFBZSxRQUFTLENBQUUsS0FBTSxVQUFXLE1BQU8sVUFBVyxJQUFLLFNBQVUsQ0FBQyxFQUFFLE9BQU8sSUFBSSxJQUFNLEVBQ3ZILElBQUksVUFBWSxNQUVoQixTQUFTLFFBQVEsS0FBTyxDQUNwQixHQUFJLElBQUksU0FBVyxRQUFVLElBQUksU0FBVyxhQUFlLElBQUksU0FBVSxDQUVyRSxHQUFJLElBQUksU0FBVyxNQUFPLENBRXRCLE1BQU0sWUFBYyxjQUFjLEtBQUssR0FBSyxFQUFFLE9BQVMsbUJBQXFCLEVBQUUsWUFBYyxJQUFJLElBQU0sRUFBRSxXQUFXLFdBQVcsS0FBSyxDQUFDLEVBQ3BJLEdBQUksQ0FBQyxZQUFhLENBRWQsZ0JBQ0ksNEVBQ0Esc0dBQXNCLElBQUksY0FBYyxrR0FDeEMsUUFDQSxLQUNBLHFCQUNBLGtCQUNBLElBQUksRUFDUixFQUVBLGdCQUNJLHFHQUNBLHFJQUE0QixJQUFJLGNBQWMsa1JBQzlDLFNBQ0EsSUFBSSxPQUNKLHFCQUNBLGtCQUNBLElBQUksRUFDUixFQUNBLFVBQVksSUFDaEIsQ0FDSixDQUNKLENBQ0osQ0FBQyxFQUNELEdBQUcsVUFBVyxhQUFhLENBQy9CLEVBQUcsSUFBUSxFQUFFLEVBRWIsSUFBSSxJQUFJLFVBQVksSUFBSyxNQUFNLEVBRy9CLElBQUksSUFBSSxDQUFDLElBQVUsSUFBc0IsSUFBdUIsT0FBK0IsQ0FDM0YsUUFBUSxNQUFNLG1CQUFvQixHQUFHLEVBQ3JDLElBQUksT0FBTyxHQUFHLEVBQUUsS0FBSyxDQUFFLE9BQVEsUUFBUyxRQUFTLDhOQUFnRCxDQUFDLENBQ3RHLENBQUMsRUFFRCxJQUFJLE9BQU8sS0FBTSxVQUFXLElBQU0sQ0FFaEMsUUFBUSxJQUFJLHNDQUFzQyxJQUFJLEVBQUUsQ0FDMUQsQ0FBQyIsIm5hbWVzIjpbInNlc3Npb24iLCJmcyIsInBhdGgiLCJqYWxhYWxpIiwiaW52Iiwib3JnIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbIi9hcHAvYXBwbGV0L3NlcnZlci50cyJdLCJzb3VyY2VzQ29udGVudCI6W251bGxdfQ==
