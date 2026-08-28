import { organizations } from '../store/state.js';
import { colleagues } from "../store/state.js";
import { getRoleInfoForUser } from "../utils/authUtils.js";

// Helper for naming functions if needed by the current setup
const __name = (fn: any, name: string) => {
  Object.defineProperty(fn, "name", { value: name, configurable: true });
  return fn;
};

export const clientAuthGuard = __name((req: any, res: any, next: any) => {
  const session = req.session;
  if (!session || !session.user) {
    return res.redirect("/login");
  }
  if (session.user.role_id !== "client") {
    return res.redirect("/dashboard");
  }
  
  const orgs = organizations || [];
  const org = orgs.find(
    (o: any) =>
      o.id == session.user.org_id ||
      (o.username &&
        session.user.username &&
        o.username.toLowerCase() === session.user.username.toLowerCase()),
  );
  if (!org) {
    return res
      .status(403)
      .send("عدم دسترسی به این سازمان");
  }
  res.locals.user = {
    ...session.user,
    role_name: "نماینده برند (کارفرما)",
  };
  next();
}, "clientAuthGuard");

export const authGuard = __name((req: any, res: any, next: any) => {
  const session = req.session;
  if (session && session.user) {
    if (session.user?.role_id === "client") {
      return res.redirect("/client-dashboard");
    }
    const roleInfo = getRoleInfoForUser(session.user);
    res.locals.userPermissions = roleInfo.permissions;
    const colleague = colleagues.find(
      (c) =>
        (session.user.id !== void 0 && c.id == session.user.id) ||
        (session.user.username &&
          c.username?.toLowerCase() === session.user.username.toLowerCase()),
    );
    res.locals.user = {
      ...session.user,
      full_name: colleague?.full_name || session.user.full_name,
      avatar_url: colleague?.avatar_url || session.user.avatar_url,
      role_id: roleInfo?.role_id,
      role_name: roleInfo.role_name,
    };
    next();
  } else {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.redirect("/");
  }
}, "authGuard");

export const apiAuthGuard = __name((req: any, res: any, next: any) => {
  const publicRoutes = [
    "/login",
    "/logout",
    "/check_auth",
    "/save_onboarding",
  ];
  if (publicRoutes.includes(req.path)) {
    return next();
  }
  const session = req.session;
  if (session && session.user) {
    if (session.user?.role_id === "client") {
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
      ];
      if (allowedForClients.includes(req.path)) {
        return next();
      }
      return res
        .status(403)
        .json({ status: "error", message: "عدم دسترسی (مخصوص استودیو)" });
    }
    next();
  } else {
    res.status(401).json({ status: "error", message: "نشست شما منقضی شده است" });
  }
}, "apiAuthGuard");

export const checkPermission = __name((perm: string) => {
  return __name((req: any, res: any, next: any) => {
    if (req.session?.user?.role_id === "client") {
      return res
        .status(403)
        .json({ status: "error", message: "عدم دسترسی" });
    }
    const roleInfo = getRoleInfoForUser(req.session?.user);
    if (roleInfo.permissions.includes("admin") || roleInfo.permissions.includes(perm)) {
      return next();
    }
    if (perm === "collections" && roleInfo.permissions.includes("depot")) {
      return next();
    }
    if (perm === "archive" && roleInfo.permissions.includes("depot")) {
      return next();
    }
    if (perm === "recycle_bin" && roleInfo.permissions.includes("audit")) {
      return next();
    }
    return res
      .status(403)
      .json({ status: "error", message: "عدم دسترسی" });
  }, "permissionHandler");
}, "checkPermission");
