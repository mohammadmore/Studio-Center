import express from "express";
import bcrypt from "bcrypt";
import { colleagues, organizations, roles } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission } from "../../middleware/auth.js";
import { getRoleInfoForUser, isAdmin, stripSecrets } from "../../utils/authUtils.js";
import { nextId, safeUrl, sanitizeIcon, toInt } from "../../utils/helpers.js";

const subRouter = express.Router();

const ADMIN_ROLE_ID = 1;
const DEFAULT_ROLE_ID = 3;
const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200";

function fail(res: any, status: number, message: string) {
  return res.status(status).json({ status: "error", message });
}

export function isUsernameTaken(username: string, except?: { colleagueId?: any; orgId?: any }) {
  const wanted = username.trim().toLowerCase();
  if (!wanted) return false;
  const same = (u: unknown) => typeof u === "string" && u.trim().toLowerCase() === wanted;
  return (
    colleagues.some((c) => same(c.username) && c.id != except?.colleagueId) ||
    organizations.some((o) => same(o.username) && o.id != except?.orgId)
  );
}

function roleGrantsAdmin(roleId: any) {
  if (roleId == ADMIN_ROLE_ID) return true;
  const role = roles.find((r) => r.id == roleId);
  return Array.isArray(role?.permissions) && role.permissions.includes("admin");
}

function withRoleName(c: any) {
  const role = roles.find((r) => r.id == c?.role_id);
  return { ...stripSecrets(c), role_name: role ? role.name : "کارشناس" };
}

function profileFields(body: any) {
  const fields: Record<string, any> = {};
  const map: [string, string[]][] = [
    ["phone", ["phone"]],
    ["email", ["email"]],
    ["portfolio", ["portfolio"]],
    ["work_type", ["workType", "work_type"]],
    ["capacity", ["capacity"]],
    ["start_date", ["startDate", "start_date"]],
    ["shaba", ["shaba"]],
    ["gender", ["gender"]],
  ];
  for (const [field, keys] of map) {
    const key = keys.find((k) => body[k] !== undefined);
    if (key) fields[field] = body[key];
  }
  return fields;
}

/** Shared by "add" in /manage_users and /save_user. */
function createColleague(req: any, res: any) {
  const body = req.body;
  const password = typeof body.password === "string" ? body.password.trim() : "";
  const username = String(body.username || body.email || `user_${Date.now()}`).trim();
  if (isUsernameTaken(username)) return fail(res, 400, "این نام کاربری قبلا ثبت شده است.");
  if (password && password.length < 6) return fail(res, 400, "رمز عبور باید حداقل ۶ کاراکتر باشد.");
  const roleId = toInt(body.role_id) ?? DEFAULT_ROLE_ID;
  if (roleGrantsAdmin(roleId) && !isAdmin(req.user)) {
    return fail(res, 403, "فقط مدیر کل می‌تواند نقش مدیریتی اختصاص دهد.");
  }
  const profile = profileFields(body);
  colleagues.push({
    id: nextId(colleagues),
    username,
    passwordHash: password ? bcrypt.hashSync(password, 10) : "",
    full_name: String(body.full_name || body.fullName || "").trim() || "همکار جدید",
    role_id: roleId,
    phone: "",
    email: "",
    portfolio: "",
    work_type: "تمام‌وقت (حضوری)",
    capacity: "",
    start_date: "",
    shaba: "",
    ...profile,
    is_active: 1,
    avatar_url: safeUrl(body.avatar_url) || DEFAULT_AVATAR,
    status: "active",
  });
  saveDatabase();
  res.json({ status: "success", message: "حساب کاربری با موفقیت ساخته شد" });
}

subRouter.get("/manage_roles", checkPermission("manage_roles"), (req, res) => {
  res.json({ status: "success", data: roles });
});

subRouter.post("/manage_roles", checkPermission("manage_roles"), (req: any, res) => {
  const { action, id, name, permissions } = req.body;
  const perms = Array.isArray(permissions)
    ? permissions.filter((p) => typeof p === "string")
    : undefined;
  // Only an administrator may create or extend a role with full access.
  if (perms?.includes("admin") && !isAdmin(req.user)) {
    return fail(res, 403, "فقط مدیر کل می‌تواند دسترسی کامل اعطا کند.");
  }
  if (action === "add") {
    if (!name || typeof name !== "string") return fail(res, 400, "نام نقش الزامی است");
    roles.push({
      id: nextId(roles),
      name: name.trim(),
      permissions: perms || [],
      icon: sanitizeIcon(req.body.icon),
    });
    saveDatabase();
    return res.json({ status: "success", message: "نقش جدید اضافه شد" });
  }
  if (action === "edit") {
    if (id == ADMIN_ROLE_ID) return fail(res, 403, "نقش سیستمی مدیر کل قابل ویرایش نیست");
    const role = roles.find((r) => r.id == id);
    if (!role) return fail(res, 404, "نقش پیدا نشد");
    if (roleGrantsAdmin(role.id) && !isAdmin(req.user)) {
      return fail(res, 403, "فقط مدیر کل می‌تواند این نقش را ویرایش کند.");
    }
    if (name) role.name = String(name).trim();
    if (perms) role.permissions = perms;
    if (req.body.icon !== undefined) role.icon = sanitizeIcon(req.body.icon);
    saveDatabase();
    return res.json({ status: "success", message: "نقش به‌روزرسانی شد" });
  }
  if (action === "delete") {
    if (id == ADMIN_ROLE_ID) return fail(res, 400, "شما نمی‌توانید نقش مدیر کل را حذف کنید");
    const idx = roles.findIndex((r) => r.id == id);
    if (idx === -1) return fail(res, 404, "نقش پیدا نشد");
    if (roleGrantsAdmin(roles[idx].id) && !isAdmin(req.user)) {
      return fail(res, 403, "فقط مدیر کل می‌تواند این نقش را حذف کند.");
    }
    roles.splice(idx, 1);
    const fallback = roles.find((r) => r.id == DEFAULT_ROLE_ID && !roleGrantsAdmin(r.id));
    colleagues.forEach((c) => {
      if (c.role_id == id) c.role_id = fallback ? fallback.id : 0;
    });
    saveDatabase();
    return res.json({ status: "success", message: "نقش حذف شد" });
  }
  if (action === "reorder") {
    const index = roles.findIndex((r) => r.id == id);
    const target =
      req.body.direction === "up" ? index - 1 : req.body.direction === "down" ? index + 1 : -1;
    if (index === -1 || target < 0 || target >= roles.length) {
      return fail(res, 400, "امکان جابجایی وجود ندارد");
    }
    [roles[index], roles[target]] = [roles[target], roles[index]];
    saveDatabase();
    return res.json({ status: "success" });
  }
  return fail(res, 400, "عملیات نامعتبر");
});

subRouter.get("/get_roles", (req, res) => {
  const mappedRoles = roles.map((r) => ({
    id: r.id,
    name: r.name,
    role_name: r.name,
    permissions: r.permissions,
    icon: r.icon || "",
  }));
  res.json({ status: "success", roles: mappedRoles, data: mappedRoles });
});

subRouter.get("/manage_users", checkPermission(["add-user", "team"]), (req, res) => {
  const includeInactive = req.query.include_inactive === "1" || req.query.all === "1";
  const mapped = colleagues
    .filter((c) => (includeInactive ? true : c.is_active !== 0))
    .map(withRoleName);
  res.json({ status: "success", data: mapped, users: mapped });
});

subRouter.post("/manage_users", checkPermission("add-user"), (req: any, res) => {
  const { action, id } = req.body;
  const idx = colleagues.findIndex((c) => c.id == id);
  const target = idx === -1 ? null : colleagues[idx];
  const actorIsAdmin = isAdmin(req.user);
  const targetIsAdmin = target ? getRoleInfoForUser(target).permissions.includes("admin") : false;

  if (action === "restore" || action === "activate" || action === "delete") {
    if (!target) return fail(res, 404, "کاربر یافت نشد");
    if (targetIsAdmin && !actorIsAdmin) return fail(res, 403, "شما مجاز به تغییر حساب مدیر کل نیستید");
    if (action === "delete") {
      if (target.id == 1) return fail(res, 400, "حساب مدیر کل قابل حذف نیست");
      if (req.user.id == target.id) return fail(res, 400, "شما نمی‌توانید حساب کاربری خود را غیرفعال کنید");
      target.is_active = 0;
      target.status = "inactive";
      saveDatabase();
      return res.json({ status: "success", message: "کاربر غیرفعال شد" });
    }
    target.is_active = 1;
    target.status = "active";
    saveDatabase();
    return res.json({ status: "success", message: "حساب همکار با موفقیت فعال گردید" });
  }

  if (action === "edit") {
    if (!target) return fail(res, 404, "کاربر یافت نشد");
    if (targetIsAdmin && !actorIsAdmin) return fail(res, 403, "شما مجاز به ویرایش اطلاعات مدیر کل نیستید");
    const { full_name, fullName, username, password, role_id, avatar_url } = req.body;
    if (username !== undefined && String(username).trim()) {
      const newUsername = String(username).trim();
      if (isUsernameTaken(newUsername, { colleagueId: target.id })) {
        return fail(res, 400, "این نام کاربری قبلا ثبت شده است.");
      }
      target.username = newUsername;
    }
    if (password) {
      const pw = String(password).trim();
      if (pw.length < 6) return fail(res, 400, "رمز عبور باید حداقل ۶ کاراکتر باشد.");
      target.passwordHash = bcrypt.hashSync(pw, 10);
    }
    if (role_id !== undefined && role_id !== "") {
      const newRole = toInt(role_id);
      if (newRole !== null && newRole != target.role_id) {
        if (req.user.id == target.id) return fail(res, 400, "شما نمی‌توانید نقش خود را تغییر دهید");
        if (roleGrantsAdmin(newRole) && !actorIsAdmin) {
          return fail(res, 403, "فقط مدیر کل می‌تواند نقش مدیریتی اختصاص دهد.");
        }
        target.role_id = newRole;
      }
    }
    const name = String(full_name || fullName || "").trim();
    if (name) target.full_name = name;
    if (avatar_url && safeUrl(avatar_url)) target.avatar_url = safeUrl(avatar_url);
    Object.assign(target, profileFields(req.body));
    saveDatabase();
    return res.json({ status: "success", message: "اطلاعات با موفقیت به‌روزرسانی شد" });
  }

  if (action === "reorder") {
    const active = colleagues.filter((c) => c.is_active === 1 || c.status === "active");
    const pos = active.findIndex((c) => c.id == id);
    const targetPos =
      req.body.direction === "up" ? pos - 1 : req.body.direction === "down" ? pos + 1 : -1;
    if (pos === -1 || targetPos < 0 || targetPos >= active.length) {
      return fail(res, 400, "امکان جابجایی وجود ندارد");
    }
    const a = colleagues.indexOf(active[pos]);
    const b = colleagues.indexOf(active[targetPos]);
    [colleagues[a], colleagues[b]] = [colleagues[b], colleagues[a]];
    saveDatabase();
    return res.json({ status: "success", message: "ترتیب تغییر کرد" });
  }

  if (action === "add" || !action) return createColleague(req, res);
  return fail(res, 400, "عملیات نامعتبر");
});

subRouter.get("/get_colleagues", (req, res) => {
  const mapped = colleagues.filter((c) => c.is_active !== 0).map((c) => {
    // Bank and contact details are only needed by user managers.
    const { shaba, ...rest } = withRoleName(c) as any;
    return rest;
  });
  res.json({ status: "success", users: mapped, data: mapped });
});

subRouter.post("/save_user", checkPermission("add-user"), createColleague);

export default subRouter;
