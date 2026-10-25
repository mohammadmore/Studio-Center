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
import { addAuditLog } from "../../utils/logger.js";

const subRouter = express.Router();

// Compared against when the username is unknown, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const INVALID_CREDENTIALS = "نام کاربری یا رمز عبور اشتباه است.";

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

    const user = colleagues.find((u) => sameUsername(u.username, username) && isActive(u));
    const orgUser = user
      ? undefined
      : organizations.find((o) => sameUsername(o.username, username) && isActive(o));
    const account = user || orgUser;
    const hash = account?.passwordHash || DUMMY_HASH;
    const valid = (await bcrypt.compare(password, hash)) && !!account?.passwordHash;
    if (!account || !valid) {
      return res.status(401).json({ status: "error", message: INVALID_CREDENTIALS });
    }

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
