import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const env = process.env;

// The folder holding views/ and center/. Hosting panels don't always start the
// app from its own directory, so fall back to the location of the entry script.
function findAppRoot() {
  if (env.APP_ROOT) return path.resolve(env.APP_ROOT);
  const candidates = [process.cwd()];
  if (process.argv[1]) {
    const scriptDir = path.dirname(path.resolve(process.argv[1]));
    candidates.push(scriptDir, path.dirname(scriptDir));
  }
  return candidates.find((dir) => fs.existsSync(path.join(dir, "views"))) || process.cwd();
}

const appRoot = findAppRoot();

// .env next to the app (or in the working directory) fills in unset variables.
dotenv.config({ path: [path.join(appRoot, ".env"), path.resolve(".env")], quiet: true });

const isProduction = env.NODE_ENV === "production";

function bool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
}

let sessionSecret = env.SESSION_SECRET || "";
if (!sessionSecret || sessionSecret.length < 32) {
  if (isProduction) {
    console.error(
      "CRITICAL: SESSION_SECRET must be set to a random string of at least 32 characters.",
    );
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn(
    "WARNING: SESSION_SECRET is not set; using a random secret. Sessions will not survive restarts.",
  );
}

const dataDir = path.resolve(appRoot, env.DATA_DIR || "data");

// The pre-Firebase version kept database.sqlite in the project root; keep using it if it's there.
function findSqliteFile() {
  const configured = path.resolve(dataDir, env.DB_NAME || "database.sqlite");
  const legacy = path.join(appRoot, env.DB_NAME || "database.sqlite");
  return !fs.existsSync(configured) && fs.existsSync(legacy) ? legacy : configured;
}

export const config = {
  isProduction,
  appRoot,
  port: parseInt(env.PORT || "3000", 10),
  sessionSecret,
  dataDir,
  // json | sqlite | firebase
  storageDriver: (env.STORAGE_DRIVER || "json").toLowerCase(),
  jsonDbPath: path.resolve(dataDir, env.JSON_DB_PATH || "db.json"),
  sqliteDbPath: findSqliteFile(),
  // Behind cPanel/Passenger, nginx or Cloud Run there is one proxy hop.
  trustProxy: env.TRUST_PROXY !== undefined ? env.TRUST_PROXY : "1",
  cookieSecure: bool(env.FORCE_HTTPS ?? env.COOKIE_SECURE, isProduction),
  allowPreviewFrame: bool(env.ALLOW_PREVIEW_FRAME, false),
  // Comma separated list of extra origins allowed to send state-changing requests.
  allowedOrigins: (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  initialAdminPassword: env.ADMIN_PASSWORD || "",
};
