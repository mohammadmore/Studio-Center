import express from "express";
import bcrypt from "bcrypt";
import { body, validationResult } from "express-validator";
import { colleagues, organizations } from "../../store/state.js";
import {
  getRoleInfoForUser,
  landingPageFor,
  passwordFingerprint,
  stripSecrets,
} from "../../utils/authUtils.js";
import { addAuditLog, addNotification } from "../../utils/logger.js";

const subRouter = express.Router();

// Compared against when the username is unknown, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const INVALID_CREDENTIALS = "نام کاربری یا رمز عبور اشتباه است.";

// ───── Per-account lockout: on top of the per-IP limit, so guessing from many addresses fails too. ─────
const LOCK_AFTER = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_FOR_MS = 15 * 60 * 1000;
const failedLogins = new Map<string, { fails: number[]; lockedUntil: number }>();

function lockState(username: string) {
  const now = Date.now();
  const entry = failedLogins.get(username);
  if (!entry) return { locked: false, minutes: 0 };
  if (entry.lockedUntil > now) return { locked: true, minutes: Math.ceil((entry.lockedUntil - now) / 60000) };
  return { locked: false, minutes: 0 };
}

/** Records a failed attempt; returns true when this attempt locked the account. */
function recordFailure(username: string) {
  const now = Date.now();
  if (failedLogins.size > 10000) {
    for (const [k, v] of failedLogins) if (v.lockedUntil < now && !v.fails.some((t) => now - t < LOCK_WINDOW_MS)) failedLogins.delete(k);
  }
  const entry = failedLogins.get(username) || { fails: [], lockedUntil: 0 };
  entry.fails = entry.fails.filter((t) => now - t < LOCK_WINDOW_MS);
  entry.fails.push(now);
  let lockedNow = false;
  if (entry.fails.length >= LOCK_AFTER) {
    entry.lockedUntil = now + LOCK_FOR_MS;
    entry.fails = [];
    lockedNow = true;
  }
  failedLogins.set(username, entry);
  return lockedNow;
}

export function resetLoginLockouts() {
  failedLogins.clear();
}

const lockedMessage = (minutes: number) =>
  `به دلیل چند تلاش ناموفق، ورود به این حساب برای ${minutes.toLocaleString("fa-IR")} دقیقه قفل شده است. بعداً دوباره تلاش کنید یا با مدیر سیستم تماس بگیرید.`;

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
    // Existing hashes were created from the trimmed password.
    const password = String(req.body.password).trim();

    // Locked usernames are refused before the password is checked (known and unknown names alike).
    const lock = lockState(username);
    if (lock.locked) return res.status(429).json({ status: "error", message: lockedMessage(lock.minutes) });

    const user = colleagues.find((u) => sameUsername(u.username, username) && isActive(u));
    const orgUser = user
      ? undefined
      : organizations.find((o) => sameUsername(o.username, username) && isActive(o));
    const account = user || orgUser;
    const hash = account?.passwordHash || DUMMY_HASH;
    const valid = (await bcrypt.compare(password, hash)) && !!account?.passwordHash;
    if (!account || !valid) {
      if (recordFailure(username)) {
        if (account) {
          addAuditLog(account.username, `قفل موقت حساب پس از ${LOCK_AFTER.toLocaleString("fa-IR")} تلاش ناموفق ورود`, req.ip);
          addNotification(
            "قفل موقت حساب کاربری",
            `ورود به حساب «${user ? user.full_name || user.username : orgUser.org_name}» به دلیل ${LOCK_AFTER.toLocaleString("fa-IR")} تلاش ناموفق پشت سر هم، برای ۱۵ دقیقه قفل شد. اگر این تلاش‌ها از طرف خود او نبوده، رمز عبورش را عوض کنید.`,
            "admin",
            null,
            "/audit",
            "security",
          );
        }
        return res.status(429).json({ status: "error", message: lockedMessage(Math.ceil(LOCK_FOR_MS / 60000)) });
      }
      return res.status(401).json({ status: "error", message: INVALID_CREDENTIALS });
    }
    failedLogins.delete(username);

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

export default subRouter;
