import {
  findClientOrg,
  findColleague,
  getRoleInfoForUser,
  hasPermission,
  landingPageFor,
  passwordFingerprint,
} from "../utils/authUtils.js";

/**
 * Re-validates the session against the stored account on every request, so a
 * deactivated account, a deleted organisation or a changed password ends the
 * session immediately instead of when the cookie expires.
 */
export function loadSessionUser(req: any, res: any, next: any) {
  const user = req.session?.user;
  if (!user) return next();
  const account = user.role_id === "client" ? findClientOrg(user) : findColleague(user);
  const valid =
    account &&
    account.is_active !== 0 &&
    account.is_active !== false &&
    (user.pw === undefined || user.pw === passwordFingerprint(account.passwordHash));
  if (!valid) {
    req.session = null;
    return next();
  }
  req.user = user;
  req.account = account;
  next();
}

/** Clients only get the lists used to label content, not studio-internal settings. */
export function limitSettingsForClient(res: any) {
  const all = res.locals.settings || {};
  res.locals.settings = Object.fromEntries(Object.entries(all).filter(([, v]) => Array.isArray(v)));
}

export function clientAuthGuard(req: any, res: any, next: any) {
  const user = req.user;
  if (!user) return res.redirect("/");
  if (user.role_id !== "client") return res.redirect(landingPageFor(user));
  const org = req.account;
  limitSettingsForClient(res);
  res.locals.user = {
    ...user,
    full_name: org.org_name || user.full_name,
    avatar_url: org.logo_url || user.avatar_url,
    role_name: "نماینده برند (کارفرما)",
  };
  next();
}

/** Guards a staff page; with `perm` it also requires that permission. */
export function authGuard(perm?: string | string[]) {
  return (req: any, res: any, next: any) => {
    const user = req.user;
    if (!user) {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      return res.redirect("/");
    }
    if (user.role_id === "client") return res.redirect("/client-dashboard");
    if (perm && !hasPermission(user, perm)) {
      const landing = landingPageFor(user);
      if (landing !== req.path) return res.redirect(landing);
      return res.status(403).send("عدم دسترسی");
    }
    const roleInfo = getRoleInfoForUser(user);
    const colleague = req.account;
    res.locals.userPermissions = roleInfo.permissions;
    res.locals.user = {
      ...user,
      full_name: colleague?.full_name || user.full_name,
      avatar_url: colleague?.avatar_url || user.avatar_url,
      role_id: roleInfo.role_id,
      role_name: roleInfo.role_name,
    };
    next();
  };
}

const PUBLIC_API_ROUTES = ["/login", "/logout", "/check_auth"];

// Endpoints a client (brand representative) may call. Each one scopes its data to
// the client's own organisation.
const CLIENT_API_ROUTES = [
  "/logout",
  "/check_auth",
  "/get_notifications",
  "/read_notifications",
  "/get_smart_events_monthly",
  "/add_client_events",
  "/get_client_data",
  "/client_review",
  "/get_org_report",
  "/get_orgs",
  "/get_collections",
  "/get_studio_info",
  "/manage_settings",
];

export function apiAuthGuard(req: any, res: any, next: any) {
  if (PUBLIC_API_ROUTES.includes(req.path)) return next();
  const user = req.user;
  if (!user) {
    return res.status(401).json({ status: "error", message: "نشست شما منقضی شده است" });
  }
  if (user.role_id === "client" && !CLIENT_API_ROUTES.includes(req.path)) {
    return res
      .status(403)
      .json({ status: "error", message: "عدم دسترسی (مخصوص استودیو)" });
  }
  next();
}

export function isClient(req: any) {
  return req.user?.role_id === "client";
}

/** The organisation id a client is bound to (null for staff). */
export function clientOrgId(req: any): number | null {
  return isClient(req) ? Number(req.account?.id ?? req.user.org_id ?? req.user.id) : null;
}

/**
 * Requires one of the given staff permissions. With `allowClients` a client may
 * pass as well; such handlers must scope data with clientOrgId().
 */
export function checkPermission(perm: string | string[], options: { allowClients?: boolean } = {}) {
  return (req: any, res: any, next: any) => {
    if (isClient(req)) {
      if (options.allowClients) return next();
      return res.status(403).json({ status: "error", message: "عدم دسترسی" });
    }
    if (hasPermission(req.user, perm)) return next();
    return res.status(403).json({ status: "error", message: "عدم دسترسی" });
  };
}
