import "dotenv/config";
import crypto from "crypto";
import path from "path";

const env = process.env;
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

const dataDir = path.resolve(env.DATA_DIR || path.join(process.cwd(), "data"));

export const config = {
  isProduction,
  port: parseInt(env.PORT || "3000", 10),
  sessionSecret,
  dataDir,
  // json | sqlite | firebase
  storageDriver: (env.STORAGE_DRIVER || "json").toLowerCase(),
  jsonDbPath: path.resolve(env.JSON_DB_PATH || path.join(dataDir, "db.json")),
  sqliteDbPath: path.resolve(env.DB_NAME || path.join(dataDir, "database.sqlite")),
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
