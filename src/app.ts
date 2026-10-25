import crypto from "crypto";
import express from "express";
import fs from "fs";
import "express-async-errors";
import compression from "compression";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";
import path from "path";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import apiRouter from "./routes/api.js";
import mediaRouter from "./routes/media.js";
import viewsRouter from "./routes/views.js";
import { loadSessionUser } from "./middleware/auth.js";
import { sessionMiddleware } from "./middleware/session.js";
import { auditRequest } from "./middleware/audit.js";
import { isDatabaseReady, saveDatabase } from "./store/db.js";
import { settings } from "./store/state.js";
import { isSafeFileName } from "./utils/files.js";

/** Changes whenever a file under center/assets changes, so browsers can cache assets for long. */
function computeAssetVersion() {
  const hash = crypto.createHash("sha1");
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const stat = fs.statSync(full);
        hash.update(`${full}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  };
  walk(path.join(config.appRoot, "center", "assets"));
  return hash.digest("hex").slice(0, 10);
}
const ASSET_VERSION = computeAssetVersion();

/** Points every asset reference at the current version and loads core.js first. */
function prepareHtml(html: string) {
  html = html.replace(
    /((?:src|href)=["'])\/?assets\/([^"'?#]+)(?:\?[^"'#]*)?(["'])/g,
    (_m, start, file, end) => `${start}/assets/${file}?v=${ASSET_VERSION}${end}`,
  );
  // style.css used to be linked twice on some pages.
  let seenStyle = false;
  html = html.replace(/<link[^>]+assets\/css\/style\.css[^>]*>\s*/g, (tag) => {
    if (seenStyle) return "";
    seenStyle = true;
    return tag;
  });
  const core = `<script src="/assets/js/core.js?v=${ASSET_VERSION}"></script>`;
  if (/<meta charset="UTF-8">/i.test(html)) return html.replace(/<meta charset="UTF-8">/i, (m) => m + core);
  if (html.includes("<head>")) return html.replace("<head>", `<head><meta charset="UTF-8">${core}`);
  return core + html;
}

function fontInjection() {
  const font = settings?.active_font;
  const families =
    "*, body, button, input, select, textarea, .asva-menu-link, .btn-primary, .btn-outline, .form-control, .s-tab, .tab-btn";
  if (font && font !== "vazirmatn" && isSafeFileName(font)) {
    return `
<link rel="preload" href="/fonts/${font}" as="font" crossorigin>
<style>
@font-face { font-family: 'AppCustomFont'; src: url('/fonts/${font}'); font-display: swap; }
${families} { font-family: 'AppCustomFont', Tahoma, sans-serif !important; }
</style>`;
  }
  return `
<style>
${families} { font-family: 'Vazirmatn', Tahoma, sans-serif !important; }
</style>`;
}

/** Rejects cross-site state-changing requests (CSRF) based on Origin / Referer. */
function sameOriginGuard(req: any, res: any, next: any) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const source = req.get("origin") || req.get("referer");
  if (!source) return next();
  let origin: string;
  try {
    origin = new URL(source).origin;
  } catch {
    return res.status(403).json({ status: "error", message: "درخواست نامعتبر" });
  }
  const host = req.get("x-forwarded-host") || req.get("host");
  const allowed =
    origin === `${req.protocol}://${host}` ||
    origin === `https://${host}` ||
    origin === `http://${host}` ||
    config.allowedOrigins.includes(origin);
  if (!allowed) {
    return res.status(403).json({ status: "error", message: "درخواست از مبدأ غیرمجاز" });
  }
  next();
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  const trustProxy = config.trustProxy;
  app.set(
    "trust proxy",
    trustProxy === "true" ? true : trustProxy === "false" ? false : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
  );
  app.set("view engine", "ejs");
  app.set("views", path.join(config.appRoot, "views"));

  const frameAncestors = config.allowPreviewFrame
    ? ["'self'", "https://aistudio.google.com"]
    : ["'self'"];
  app.use(
    helmet({
      frameguard: config.allowPreviewFrame ? false : { action: "sameorigin" },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          // The views rely on inline scripts and handlers.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          mediaSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'"],
          workerSrc: ["'self'", "blob:"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors,
          ...(config.cookieSecure ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      hsts: config.cookieSecure,
    }),
  );
  app.use(compression());
  if (process.env.NODE_ENV !== "test") app.use(morgan("combined"));

  app.get("/healthz", (req, res) => {
    res.status(isDatabaseReady() ? 200 : 503).send(isDatabaseReady() ? "OK" : "starting");
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: "error", message: "تعداد درخواست‌ها بیش از حد مجاز است. لطفا بعدا تلاش کنید." },
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req: any, res) => {
      const reset = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : Date.now() + 15 * 60 * 1000;
      const minutes = Math.max(1, Math.ceil((reset - Date.now()) / 60000));
      res.status(429).json({
        status: "error",
        message: `تلاش‌های ناموفق ورود بیش از حد مجاز است. ${minutes.toLocaleString("fa-IR")} دقیقه دیگر دوباره تلاش کنید.`,
        retry_after_minutes: minutes,
      });
    },
  });
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: "error", message: "درخواست‌های آپلود بیش از حد مجاز است. لطفا بعدا تلاش کنید." },
  });
  app.use("/api", apiLimiter);
  app.use("/api/login", loginLimiter);
  for (const p of [
    "/api/upload_image",
    "/api/upload_file",
    "/api/upload_font",
    "/api/bulk_import_contents",
    "/api/upload_smart_events",
  ]) {
    app.use(p, uploadLimiter);
  }

  // Versioned asset URLs never change content, so they can be cached for a year.
  app.use("/assets", (req, res, next) => {
    res.setHeader(
      "Cache-Control",
      req.query.v ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    );
    next();
  });
  app.use(express.static(path.join(config.appRoot, "center"), { index: false, cacheControl: false }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  app.use(hpp());

  app.use(sessionMiddleware());
  app.use(loadSessionUser);
  app.use("/api", sameOriginGuard);

  app.use((req, res, next) => {
    res.locals.STUDIO_NAME = settings?.studio_info?.name || "استودیو اسوا";
    res.locals.STUDIO_LOGO = settings?.studio_info?.logo_light || settings?.studio_info?.logo || "";
    res.locals.settings = settings;
    const originalRender = res.render.bind(res);
    (res as any).render = (view: string, options?: any, callback?: any) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      originalRender(view, options, (err: any, html: string) => {
        if (err) return callback ? callback(err, "") : next(err);
        if (typeof html === "string") {
          const injection = fontInjection();
          html = prepareHtml(
            html.includes("</head>") ? html.replace("</head>", injection + "</head>") : injection + html,
          );
        }
        if (callback) callback(null, html);
        else res.send(html);
      });
    };
    next();
  });

  app.use(auditRequest);
  app.use((req, res, next) => {
    res.on("finish", () => {
      if (req.method !== "GET" && req.path.startsWith("/api/") && res.statusCode < 500) {
        saveDatabase();
      }
    });
    next();
  });

  app.use("/api", apiRouter);
  app.all("/api/*", (req, res) =>
    res.status(404).json({ status: "error", message: "API route not found" }),
  );
  app.use("/", mediaRouter);
  app.use("/", viewsRouter);
  app.get("*", (req, res) => res.redirect("/"));

  app.use((err: any, req: any, res: any, next: any) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ status: "error", message: "حجم فایل بیش از حد مجاز است" });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ status: "error", message: "حجم درخواست بیش از حد مجاز است" });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ status: "error", message: "داده ارسالی نامعتبر است" });
    }
    console.error("Unhandled Error:", err);
    if (res.headersSent) return next(err);
    res.status(500).json({
      status: "error",
      message: "خطای سرور رخ داده است. لطفا دوباره تلاش کنید.",
    });
  });

  return app;
}
