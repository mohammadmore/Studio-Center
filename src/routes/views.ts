import { roles, organizations } from "../store/state.js";
import * as jalaali from "jalaali-js";
import express from "express";
import { authGuard, clientAuthGuard } from "../middleware/auth.js";
import { getPermissionCategories } from "../utils/authUtils.js";
import { invoices } from "../store/state.js";

const viewsRouter = express.Router();

// Helper to replace app.get with viewsRouter.get
viewsRouter.get("/", (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  console.log("Engine:", req.app.get("view engine"));
  if (req.session && req.session.user) {
    return res.redirect("/depot");
  }
  res.render("index", { current: "index" });
});
viewsRouter.get("/index", (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  if (req.session && req.session.user) {
    return res.redirect("/depot");
  }
  res.render("index", { current: "index" });
});
viewsRouter.get("/depot", authGuard, (req, res) => {
  res.render("depot", { current: "depot" });
});
viewsRouter.get("/collections", authGuard, (req, res) => {
  res.render("collections", { current: "collections" });
});
viewsRouter.get("/archive", authGuard, (req, res) => {
  res.render("archive", { current: "archive" });
});
viewsRouter.get("/my-projects", authGuard, (req, res) => {
  res.render("my-projects", { current: "my-projects" });
});
viewsRouter.get("/dashboard", authGuard, (req, res) => {
  res.render("dashboard", { current: "dashboard" });
});
viewsRouter.get("/calendar", authGuard, (req, res) => {
  res.render("calendar", { current: "calendar" });
});
viewsRouter.get("/smart-events", authGuard, (req, res) => {
  res.render("smart-events", { current: "smart-events" });
});
viewsRouter.get("/client-events", clientAuthGuard, (req, res) => {
  const orgId = req.query.org_id ? parseInt(req.query.org_id as string) : null;
  const org = organizations.find((o) => o.id === orgId) || null;
  res.render("client-events", { org });
});
viewsRouter.get("/client-review", clientAuthGuard, (req, res) => {
  const orgId = req.query.org_id ? parseInt(req.query.org_id as string) : null;
  const org = organizations.find((o) => o.id === orgId) || null;
  res.render("client-review", { org });
});
viewsRouter.get("/media", authGuard, (req, res) => {
  res.render("media", { current: "media" });
});
viewsRouter.get("/templates", authGuard, (req, res) => {
  res.render("templates", { current: "templates" });
});
viewsRouter.get("/organizations", authGuard, (req, res) => {
  res.render("organizations", { current: "organizations" });
});
viewsRouter.get("/client-portal", authGuard, (req, res) => {
  res.render("client-portal", { current: "client-portal" });
});
viewsRouter.get("/client-dashboard", clientAuthGuard, (req, res) => {
  const session2 = req.session;
  let targetOrgId = null;
  if (session2.user?.role_id === "client") {
    targetOrgId = session2.user.id;
  } else if (req.query.org_id) {
    targetOrgId = parseInt(req.query.org_id as string);
  }
  const orgData = targetOrgId
    ? organizations.find((o) => o.id === targetOrgId)
    : null;
  const d = new Date();
  const jDate = jalaali.toJalaali(d);
  let nextYear = jDate.jy;
  let nextMonth = jDate.jm + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  res.render("client-dashboard", {
    current: "client-dashboard",
    query: req.query,
    currentYear: jDate.jy,
    currentMonth: jDate.jm,
    nextYear,
    nextMonth,
    orgData: orgData || {},
  });
});
viewsRouter.get("/invoices_list", authGuard, (req, res) => {
  res.render("invoices_list", { current: "invoices_list" });
});
viewsRouter.get("/invoice", authGuard, (req, res) => {
  res.render("invoice", { current: "invoice" });
});
viewsRouter.get("/reports", (req, res) => {
  const session2 = req.session;
  if (!session2 || !session2.user) return res.redirect("/");
  const isClient = session2.user?.role_id === "client";
  if (isClient) {
    const orgId = req.query.org_id ? parseInt(req.query.org_id as string) : null;
    if (orgId && orgId !== session2.user.id)
      return res
        .status(403)
        .send(
          "\u0639\u062F\u0645 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0627\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
        );
    res.locals.user = session2.user;
    return res.render("reports", { current: "reports", isClient: true });
  } else {
    const userRole = roles.find((r) => r.id === session2.user?.role_id);
    res.locals.userPermissions = userRole ? userRole.permissions : [];
    res.locals.user = session2.user;
    return res.render("reports", { current: "reports", isClient: false });
  }
});
viewsRouter.get("/finance", authGuard, (req, res) => {
  res.render("finance", { current: "finance" });
});
viewsRouter.get("/add-user", authGuard, (req, res) => {
  res.render("add-user", { current: "add-user" });
});
viewsRouter.get("/leaves", authGuard, (req, res) => {
  res.render("leaves", { current: "leaves" });
});
viewsRouter.get("/team", authGuard, (req, res) => {
  res.render("team", { current: "team" });
});
viewsRouter.get("/settings", authGuard, (req, res) => {
  res.render("settings", {
    current: "settings",
    permissionCategories: getPermissionCategories(),
  });
});
viewsRouter.get("/audit", authGuard, (req, res) => {
  res.render("audit", { current: "audit" });
});
viewsRouter.get("/recycle_bin", authGuard, (req, res) => {
  res.render("recycle_bin", { current: "recycle_bin" });
});
viewsRouter.get("/tokens", authGuard, (req, res) => {
  res.render("tokens", { current: "tokens" });
});
viewsRouter.get("/notifications", authGuard, (req, res) => {
  res.render("notifications", { current: "notifications" });
});


export default viewsRouter;
