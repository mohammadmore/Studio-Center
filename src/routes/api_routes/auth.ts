import express from "express";
import crypto from "crypto";
import { config } from "../../config.js";
import bcrypt from "bcrypt";
import { body, validationResult } from "express-validator";
import { colleagues, organizations } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import {
  getRoleInfoForUser,
  landingPageFor,
  normalizePasswordInput,
  passwordFingerprint,
  stripSecrets,
} from "../../utils/authUtils.js";
import { addAuditLog, addNotification } from "../../utils/logger.js";
import { hasPermission } from "../../utils/authUtils.js";

const subRouter = express.Router();

// Compared against when the username is unknown, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const INVALID_CREDENTIALS = "نام کاربری یا رمز عبور اشتباه است.";

// ───── Login lockout that an attacker cannot use against the account owner ─────
// Five failed logins in 15 minutes lock a username for 15 minutes, but only for browsers that are
// not "trusted devices": a browser where this user already logged in successfully carries a signed
// cookie and keeps working with the right password, so knowing someone's username is not enough to
// lock them out. A trusted browser that fails 5 times itself is limited on its own.
const LOCK_AFTER = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_FOR_MS = 15 * 60 * 1000;
const DEVICE_COOKIE = "asva_td";
const DEVICE_DAYS = 180;
const failedLogins = new Map<string, { fails: number[]; lockedUntil: number }>();

const sign = (payload: string) => crypto.createHmac("sha256", "trusted-device:" + config.sessionSecret).update(payload).digest("base64url");

function readCookie(req: any, name: string) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

/** The trusted-device cookie: a random device id and the usernames that logged in on it. */
function readDevice(req: any): { d: string; u: string[] } | null {
  const raw = readCookie(req, DEVICE_COOKIE);
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof data?.d === "string" && Array.isArray(data.u) ? data : null;
  } catch {
    return null;
  }
}

/** A login from a browser where this username already signed in (used to skip the per-IP limit). */
export function isTrustedLogin(req: any) {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const device = readDevice(req);
  return !!username && !!device && device.u.includes(username);
}

function rememberDevice(req: any, res: any, username: string) {
  const current = readDevice(req) || { d: crypto.randomBytes(12).toString("base64url"), u: [] };
  current.u = [username, ...current.u.filter((x) => x !== username)].slice(0, 8);
  const body = Buffer.from(JSON.stringify(current)).toString("base64url");
  res.cookie(DEVICE_COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure && req.secure !== false,
    path: config.basePath || "/",
    maxAge: DEVICE_DAYS * 24 * 60 * 60 * 1000,
  });
}

function lockState(key: string) {
  const entry = failedLogins.get(key);
  const now = Date.now();
  if (entry && entry.lockedUntil > now) return { locked: true, minutes: Math.ceil((entry.lockedUntil - now) / 60000) };
  return { locked: false, minutes: 0 };
}

/** Records a failed attempt; returns true when this attempt locked the key. */
function recordFailure(key: string) {
  const now = Date.now();
  if (failedLogins.size > 10000) {
    for (const [k, v] of failedLogins) if (v.lockedUntil < now && !v.fails.some((t) => now - t < LOCK_WINDOW_MS)) failedLogins.delete(k);
  }
  const entry = failedLogins.get(key) || { fails: [], lockedUntil: 0 };
  entry.fails = entry.fails.filter((t) => now - t < LOCK_WINDOW_MS);
  entry.fails.push(now);
  let lockedNow = false;
  if (entry.fails.length >= LOCK_AFTER) {
    entry.lockedUntil = now + LOCK_FOR_MS;
    entry.fails = [];
    lockedNow = true;
  }
  failedLogins.set(key, entry);
  return lockedNow;
}

export function resetLoginLockouts() {
  failedLogins.clear();
}

/** Usernames whose login from unknown devices is locked right now. */
export function lockedUsernames() {
  const now = Date.now();
  const out: { username: string; minutes: number }[] = [];
  for (const [key, v] of failedLogins) {
    if (!key.includes("|") && v.lockedUntil > now) out.push({ username: key, minutes: Math.ceil((v.lockedUntil - now) / 60000) });
  }
  return out;
}

/** Lifts every lock on a username (unknown devices and each trusted device). */
export function unlockUsername(username: string) {
  const name = String(username || "").trim().toLowerCase();
  let found = false;
  for (const key of [...failedLogins.keys()]) {
    if (key === name || key.startsWith(name + "|")) {
      failedLogins.delete(key);
      found = true;
    }
  }
  return found;
}

const lockedMessage = (minutes: number) =>
  `به دلیل چند تلاش ناموفق، ورود به این حساب از این دستگاه برای ${minutes.toLocaleString("fa-IR")} دقیقه بسته شده است. اگر قبلاً با دستگاه دیگری وارد شده‌اید، از همان دستگاه وارد شوید یا از مدیر سیستم بخواهید قفل را باز کند.`;

const sameUsername = (stored: unknown, username: string) =>
  typeof stored === "string" && stored.trim().toLowerCase() === username;
const isActive = (record: any) => record.is_active === 1 || record.is_active === true;

subRouter.post(
  "/login",
  [
    body("username").isString().trim().isLength({ min: 3, max: 100 }).withMessage("نام کاربری نامعتبر است"),
    body("password").isString().isLength({ min: 6, max: 200 }).withMessage("رمز عبور باید حداقل ۶ کاراکتر باشد"),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: "error", message: errors.array()[0].msg });
    }
    const username = String(req.body.username).trim().toLowerCase();
    // Hashes are made from the trimmed password with Persian/Arabic digits turned into Latin ones;
    // the password exactly as typed is also tried, for ones set before that rule.
    const typed = String(req.body.password).trim();
    const password = normalizePasswordInput(typed);

    // Locks are checked before the password (known and unknown names alike). A browser where this
    // user already logged in is only held back by its own failures, not by other people's attempts.
    const device = readDevice(req);
    const trusted = !!device && device.u.includes(username);
    const lockKey = trusted ? `${username}|${device!.d}` : username;
    const lock = lockState(lockKey);
    if (lock.locked) return res.status(429).json({ status: "error", message: lockedMessage(lock.minutes) });

    const user = colleagues.find((u) => sameUsername(u.username, username) && isActive(u));
    const orgUser = user
      ? undefined
      : organizations.find((o) => sameUsername(o.username, username) && isActive(o));
    const account = user || orgUser;
    const hash = account?.passwordHash || DUMMY_HASH;
    // Passwords set before that rule may hold Persian digits (typed with the Persian layout):
    // also try the typed text as is and with its digits in Persian.
    const persianDigits = password.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
    const candidates = [...new Set([password, typed, persianDigits])];
    let valid = false;
    if (account?.passwordHash) {
      for (const candidate of candidates) {
        if (await bcrypt.compare(candidate, hash)) {
          valid = true;
          // Store it in the normalized form from now on.
          if (candidate !== password) {
            account.passwordHash = bcrypt.hashSync(password, 10);
            saveDatabase();
          }
          break;
        }
      }
    }
    if (!account?.passwordHash) await bcrypt.compare(password, DUMMY_HASH);
    if (!account || !valid) {
      if (recordFailure(lockKey)) {
        if (account && !trusted) {
          const who = user ? user.full_name || user.username : orgUser.org_name;
          addAuditLog(account.username, `قفل موقت ورود از دستگاه‌های ناشناس پس از ${LOCK_AFTER.toLocaleString("fa-IR")} تلاش ناموفق`, req.ip);
          addNotification(
            "قفل موقت حساب کاربری",
            `ورود به حساب «${who}» از دستگاه‌های ناشناس به دلیل ${LOCK_AFTER.toLocaleString("fa-IR")} تلاش ناموفق پشت سر هم، ۱۵ دقیقه بسته شد. دستگاه‌هایی که او قبلاً با آن‌ها وارد شده همچنان کار می‌کنند. اگر لازم است، قفل را از صفحه‌ی ${user ? "تیم" : "سازمان‌ها"} باز کنید.`,
            "admin",
            null,
            user ? "/team" : "/organizations",
            "security",
          );
          // The account owner hears about it too (in the panel and, if enabled, by SMS/email/bots).
          addNotification(
            "تلاش ناموفق برای ورود به حساب شما",
            `برای حساب شما ${LOCK_AFTER.toLocaleString("fa-IR")} بار رمز اشتباه وارد شد و ورود از دستگاه‌های ناشناس ۱۵ دقیقه بسته شد. دستگاه‌هایی که قبلاً با آن‌ها وارد شده‌اید همچنان کار می‌کنند. اگر خودتان نبودید، رمز عبورتان را عوض کنید.`,
            user ? "colleague" : "client",
            account.id,
            "",
            "security",
          );
        }
        return res.status(429).json({ status: "error", message: lockedMessage(Math.ceil(LOCK_FOR_MS / 60000)) });
      }
      return res.status(401).json({ status: "error", message: INVALID_CREDENTIALS });
    }
    failedLogins.delete(lockKey);
    rememberDevice(req, res, username);

    if (user) {
      req.session.user = {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role_id: user.role_id,
        pw: passwordFingerprint(user.passwordHash),
      };
      addAuditLog(user.username, "ورود موفق به پنل کاربری", req.ip);
    } else {
      req.session.user = {
        id: orgUser.id,
        org_id: orgUser.id,
        username: orgUser.username,
        full_name: orgUser.org_name,
        role_id: "client",
        pw: passwordFingerprint(orgUser.passwordHash),
      };
      addAuditLog(orgUser.username, "ورود موفق نماینده کارفرما", req.ip);
    }
    res.json({
      status: "success",
      message: "ورود موفق",
      redirect: landingPageFor(req.session.user).slice(1),
    });
  },
);

subRouter.get("/logout", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  // "Logout" inside a brand-panel preview just ends the preview.
  if ((req as any).previewBy && req.session) {
    delete req.session.preview;
    return res.redirect("/client-portal");
  }
  req.session = null;
  res.redirect("/");
});

subRouter.get("/check_auth", (req: any, res) => {
  const user = req.user;
  if (!user) return res.json({ status: "error", message: "Unauthorized" });
  const roleInfo = getRoleInfoForUser(user);
  const account = req.account || {};
  const { pw, ...safeUser } = stripSecrets(user);
  res.json({
    status: "success",
    user: {
      ...safeUser,
      full_name: account.full_name || account.org_name || user.full_name,
      avatar_url: account.avatar_url || account.logo_url || "",
      role_id: roleInfo.role_id,
      role_name: roleInfo.role_name,
      permissions: roleInfo.permissions,
    },
  });
});

/** Accounts whose login from unknown devices is locked, limited to the people this user manages. */
subRouter.get("/login_locks", (req: any, res) => {
  if (!req.user || req.user.role_id === "client") return res.status(403).json({ status: "error", message: "دسترسی ندارید" });
  const canTeam = hasPermission(req.user, ["add-user", "team"]);
  const canOrgs = hasPermission(req.user, "organizations");
  const data = lockedUsernames()
    .map(({ username, minutes }) => {
      const c = colleagues.find((u) => sameUsername(u.username, username));
      if (c && canTeam) return { username: c.username, name: c.full_name || c.username, kind: "colleague", minutes };
      const o = c ? undefined : organizations.find((x) => sameUsername(x.username, username));
      if (o && canOrgs) return { username: o.username, name: o.org_name, kind: "client", minutes };
      return null;
    })
    .filter(Boolean);
  res.json({ status: "success", data });
});

subRouter.post("/unlock_login", (req: any, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const isColleague = colleagues.some((u) => sameUsername(u.username, username));
  const isOrg = !isColleague && organizations.some((o) => sameUsername(o.username, username));
  const allowed = req.user && req.user.role_id !== "client" &&
    ((isColleague && hasPermission(req.user, "add-user")) || (isOrg && hasPermission(req.user, "organizations")));
  if (!allowed) return res.status(403).json({ status: "error", message: "دسترسی ندارید" });
  unlockUsername(username);
  addAuditLog(req.user.username, `باز کردن قفل ورود حساب ${username}`, req.ip);
  res.json({ status: "success", message: "قفل ورود این حساب باز شد" });
});

export default subRouter;
