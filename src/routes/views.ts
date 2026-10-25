import express from "express";
import * as jalaali from "jalaali-js";
import { authGuard, clientAuthGuard, limitSettingsForClient, loginRedirect } from "../middleware/auth.js";
import { getPermissionCategories, landingPageFor, stripSecrets } from "../utils/authUtils.js";

const viewsRouter = express.Router();

function loginPage(req: any, res: any) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (req.user) return res.redirect(landingPageFor(req.user));
  res.render("index", { current: "index" });
}
viewsRouter.get("/", loginPage);
viewsRouter.get("/index", loginPage);
viewsRouter.get("/login", loginPage);

// [path, view, permission]; a missing permission means any logged-in staff member.
const STAFF_PAGES: [string, string, string | string[] | undefined][] = [
  ["/depot", "depot", "depot"],
  ["/collections", "collections", "collections"],
  ["/archive", "archive", "archive"],
  ["/my-projects", "my-projects", undefined],
  ["/dashboard", "dashboard", "dashboard"],
  ["/calendar", "calendar", "calendar"],
  ["/smart-events", "smart-events", "smart-events"],
  ["/media", "media", "media"],
  ["/templates", "templates", "templates"],
  ["/organizations", "organizations", "organizations"],
  ["/client-portal", "client-portal", "client-portal"],
  ["/invoices_list", "invoices_list", "invoice"],
  ["/invoice", "invoice", "invoice"],
  ["/finance", "finance", "finance"],
  ["/add-user", "add-user", "add-user"],
  ["/leaves", "leaves", "leaves"],
  ["/team", "team", "team"],
  ["/audit", "audit", "audit"],
  ["/recycle_bin", "recycle_bin", "recycle_bin"],
  ["/tokens", "tokens", "tokens"],
  ["/notifications", "notifications", undefined],
];

for (const [route, view, perm] of STAFF_PAGES) {
  viewsRouter.get(route, authGuard(perm), (req, res) => {
    res.render(view, { current: view });
  });
}

viewsRouter.get("/settings", authGuard("settings"), (req, res) => {
  res.render("settings", {
    current: "settings",
    permissionCategories: getPermissionCategories(),
  });
});

function nextJalaliMonth() {
  const jDate = jalaali.toJalaali(new Date());
  const nextMonth = jDate.jm === 12 ? 1 : jDate.jm + 1;
  const nextYear = jDate.jm === 12 ? jDate.jy + 1 : jDate.jy;
  return { currentYear: jDate.jy, currentMonth: jDate.jm, nextYear, nextMonth };
}

// Client pages always show the client's own organisation, whatever the URL says.
viewsRouter.get("/client-dashboard", clientAuthGuard, (req: any, res) => {
  res.render("client-dashboard", {
    current: "client-dashboard",
    query: { ...req.query, org_id: req.account.id },
    ...nextJalaliMonth(),
    orgData: stripSecrets(req.account),
  });
});
viewsRouter.get("/client-events", clientAuthGuard, (req: any, res) => {
  const org = stripSecrets(req.account);
  res.render("client-events", { org, orgData: org });
});
viewsRouter.get("/client-review", clientAuthGuard, (req: any, res) => {
  const org = stripSecrets(req.account);
  res.render("client-review", { org, orgData: org });
});

viewsRouter.get("/reports", (req: any, res, next) => {
  const user = req.user;
  if (!user) return loginRedirect(req, res);
  if (user.role_id === "client") {
    limitSettingsForClient(res);
    res.locals.user = { ...user, full_name: req.account.org_name };
    return res.render("reports", { current: "reports", isClient: true, orgData: stripSecrets(req.account) });
  }
  authGuard("reports")(req, res, () =>
    res.render("reports", { current: "reports", isClient: false }),
  );
});

export default viewsRouter;
