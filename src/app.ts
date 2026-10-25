import express from "express";
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

// Exposed to every page: escapes text before it is put into innerHTML.
export const CLIENT_HELPERS = `<script>window.escapeHtml=function(v){return String(v==null?"":v).replace(/[&<>"'\`]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","\`":"&#96;"}[c]})};window.jsAttr=function(v){return window.escapeHtml(JSON.stringify(String(v==null?"":v)))};window.safeColor=function(c){c=String(c==null?"":c).trim();return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\\([\\d\\s.,%]+\\)|var\\(--[a-z0-9-]+\\)|[a-z]{3,20})$/i.test(c)?c:""};window.safeUrl=function(u){u=String(u==null?"":u).trim();return /^(https?:|\\/(?!\\/)|data:image\\/(png|jpe?g|gif|webp);|blob:)/i.test(u)?u:""};</script>`;

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
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
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
    message: { status: "error", message: "تلاش‌های ناموفق ورود بیش از حد مجاز است. ۱۵ دقیقه دیگر تلاش کنید." },
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

  app.use(express.static(path.join(config.appRoot, "center"), { index: false }));
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
        const injection = CLIENT_HELPERS + fontInjection();
        if (typeof html === "string") {
          html = html.includes("</head>")
            ? html.replace("</head>", injection + "</head>")
            : injection + html;
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
