import express from "express";
import bcrypt from "bcrypt";
import * as jalaali from "jalaali-js";
import {
  clientSelections,
  collections,
  contents,
  organizations,
} from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission, clientOrgId, isClient } from "../../middleware/auth.js";
import { hasPermission, stripSecrets } from "../../utils/authUtils.js";
import { nextId, toInt } from "../../utils/helpers.js";
import { moveToRecycleBin } from "../../utils/contentUtils.js";
import { isUsernameTaken } from "./users.js";

const subRouter = express.Router();

const persianDate = () =>
  new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

subRouter.get("/get_collections", (req, res) => {
  const orgId = isClient(req) ? clientOrgId(req) : req.query.org_id;
  let cols = collections;
  if (orgId) cols = cols.filter((c) => c.org_id == orgId);
  const data = cols.map((c) => {
    const org = organizations.find((o) => o.id == c.org_id);
    return {
      ...c,
      org_name: org ? org.org_name : "بدون سازمان",
      org_color: org ? org.color : "#3b82f6",
      org_logo: org ? org.logo_url : "",
    };
  });
  res.json({ status: "success", data });
});

subRouter.post("/manage_collections", checkPermission("collections"), (req: any, res) => {
  const { action, id, title, org_id, cols } = req.body;
  if (action === "batch_add") {
    if (!Array.isArray(cols)) {
      return res.status(400).json({ status: "error", message: "اطلاعات نامعتبر" });
    }
    let currentId = nextId(collections);
    for (const col of cols) {
      if (!col || !col.title) continue;
      let numericOrgId = null;
      if (col.org_username) {
        const org = organizations.find((o) => o.username === col.org_username);
        if (org) numericOrgId = org.id;
      } else if (col.org_id) {
        numericOrgId = toInt(col.org_id);
      }
      collections.push({
        id: currentId++,
        title: String(col.title),
        org_id: numericOrgId,
        created_at: persianDate(),
        is_active: 1,
      });
    }
    saveDatabase();
    return res.json({ status: "success", message: "مجموعه‌ها با موفقیت اضافه شدند" });
  }
  if (action === "add") {
    if (!title || typeof title !== "string") {
      return res.status(400).json({ status: "error", message: "عنوان مجموعه الزامی است" });
    }
    collections.push({
      id: nextId(collections),
      title: title.trim(),
      org_id: org_id ? toInt(org_id) : null,
      parent_id: req.body.parent_id ? toInt(req.body.parent_id) : null,
      created_at: persianDate(),
      is_active: 1,
    });
    saveDatabase();
    return res.json({ status: "success", message: "مجموعه اضافه شد" });
  }
  if (action === "edit") {
    const col = collections.find((c) => c.id == id);
    if (!col) return res.status(404).json({ status: "error", message: "مجموعه یافت نشد" });
    const { parent_id } = req.body;
    if (title) col.title = String(title);
    if (parent_id !== undefined) {
      const parentId = parent_id ? toInt(parent_id) : null;
      // A collection can't become its own (grand)parent.
      let cursor = parentId;
      for (let depth = 0; cursor && depth < 100; depth++) {
        if (cursor == col.id) {
          return res.status(400).json({ status: "error", message: "مجموعه والد نامعتبر است" });
        }
        cursor = collections.find((c) => c.id == cursor)?.parent_id ?? null;
      }
      col.parent_id = parentId;
    }
    if (org_id !== undefined) {
      const parsedOrgId = org_id ? toInt(org_id) : null;
      col.org_id = parsedOrgId;
      contents.forEach((c) => {
        if (c.collection_id == col.id) c.org_id = parsedOrgId;
      });
    }
    saveDatabase();
    return res.json({ status: "success", message: "مجموعه ویرایش شد" });
  }
  if (action === "delete") {
    const idx = collections.findIndex((c) => c.id == id);
    if (idx === -1) return res.status(404).json({ status: "error", message: "مجموعه یافت نشد" });
    const col = collections[idx];
    const binId = moveToRecycleBin("collections", col, col.title || "مجموعه", req.user);
    collections.splice(idx, 1);
    collections.forEach((c) => {
      if (c.parent_id == col.id) c.parent_id = null;
    });
    saveDatabase();
    return res.json({ status: "success", message: "مجموعه حذف شد", bin_id: binId });
  }
  res.status(400).json({ status: "error", message: "عملیات نامعتبر" });
});

const PUBLIC_ORG_FIELDS = ["id", "org_name", "industry", "logo_url", "color", "is_active"];

subRouter.get("/get_orgs", (req: any, res) => {
  let list = organizations.filter((o) => o.is_active === 1 || o.is_active === true);
  if (isClient(req)) {
    list = list.filter((o) => o.id == clientOrgId(req));
  }
  // Contact details and login names are only for organisation managers.
  const full = !isClient(req) && hasPermission(req.user, ["organizations", "invoice", "client-portal", "reports", "media"]);
  const data = list.map((o) =>
    full
      ? stripSecrets(o)
      : Object.fromEntries(PUBLIC_ORG_FIELDS.map((k) => [k, o[k]])),
  );
  res.json({ status: "success", data });
});

subRouter.get(
  "/manage_orgs",
  checkPermission("organizations"),
  (req, res) => {
    const now = jalaali.toJalaali(new Date());
    let currentYear = now.jy;
    let currentMonth = now.jm;
    let nextMonth = currentMonth + 1;
    let nextYear = currentYear;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    const safeData = organizations.map((o) => {
      const { passwordHash, ...safeO } = o;
      const currentSelection = clientSelections.find(
        (cs) =>
          cs.org_id == o.id &&
          cs.year == currentYear &&
          cs.month == currentMonth,
      );
      const nextSelection = clientSelections.find(
        (cs) =>
          cs.org_id == o.id && cs.year == nextYear && cs.month == nextMonth,
      );
      safeO.current_month_locked = currentSelection
        ? currentSelection.is_final
        : false;
      safeO.next_month_locked = nextSelection ? nextSelection.is_final : false;
      return safeO;
    });
    res.json({ status: "success", data: safeData });
  },
);

const ORG_FIELDS = [
  "org_name",
  "industry",
  "logo_url",
  "color",
  "contact_name",
  "phone_number",
  "has_telegram",
  "telegram_number",
  "extra_phones",
  "emails",
  "addresses",
];

function buildOrg(input: any, id: number) {
  const password = typeof input.password === "string" ? input.password.trim() : "";
  return {
    id,
    org_name: input.org_name || "بدون نام",
    industry: input.industry || "سایر",
    logo_url: input.logo_url || "",
    color: input.color || "#6366F1",
    contact_name: input.contact_name || "",
    phone_number: input.phone_number || "",
    has_telegram: input.has_telegram || false,
    telegram_number: input.telegram_number || "",
    extra_phones: input.extra_phones || [],
    emails: input.emails || [],
    addresses: input.addresses || [],
    username: String(input.username || "").trim(),
    passwordHash: password ? bcrypt.hashSync(password, 10) : "",
    is_active: 1,
  };
}

subRouter.post("/manage_orgs", checkPermission("organizations"), (req: any, res) => {
  const { action, id, username, password, orgs } = req.body;
  const pw = typeof password === "string" ? password.trim() : "";
  if (action === "batch_add") {
    if (!Array.isArray(orgs)) {
      return res.status(400).json({ status: "error", message: "اطلاعات نامعتبر" });
    }
    let currentId = nextId(organizations);
    let skipped = 0;
    for (const org of orgs) {
      const orgPw = typeof org?.password === "string" ? org.password.trim() : "";
      if (!org || (org.username && isUsernameTaken(String(org.username))) || (orgPw && orgPw.length < 6)) {
        skipped++;
        continue;
      }
      organizations.unshift(buildOrg(org, currentId++));
    }
    saveDatabase();
    return res.json({
      status: "success",
      message: skipped
        ? `سازمان‌ها اضافه شدند (${skipped} ردیف به دلیل نام کاربری تکراری یا رمز نامعتبر رد شد)`
        : "سازمان‌ها با موفقیت اضافه شدند",
    });
  }
  if (action === "add") {
    if (username && isUsernameTaken(String(username))) {
      return res.status(400).json({ status: "error", message: "این نام کاربری قبلا ثبت شده است." });
    }
    if (pw && pw.length < 6) {
      return res.status(400).json({ status: "error", message: "رمز عبور باید حداقل ۶ کاراکتر باشد." });
    }
    organizations.unshift(buildOrg(req.body, nextId(organizations)));
    saveDatabase();
    return res.json({ status: "success" });
  }
  const org = organizations.find((o) => o.id == id);
  if (!org) return res.status(404).json({ status: "error", message: "سازمان یافت نشد" });
  if (action === "delete") {
    // The organisation's content goes to the recycle bin with it, so restoring brings it back.
    const related = contents.filter((c) => c.org_id == org.id);
    const binId = moveToRecycleBin("organizations", org, org.org_name || "سازمان", req.user, {
      related_contents: related,
    });
    organizations.splice(organizations.indexOf(org), 1);
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].org_id == org.id) contents.splice(i, 1);
    }
    saveDatabase();
    return res.json({ status: "success", message: "به سطل زباله منتقل شد", bin_id: binId });
  }
  if (action === "toggle_active") {
    const active = req.body.is_active;
    org.is_active = active === true || active === 1 || active === "1" ? 1 : 0;
    saveDatabase();
    return res.json({ status: "success" });
  }
  if (action === "edit") {
    if (username !== undefined && String(username).trim() !== (org.username || "")) {
      const newUsername = String(username).trim();
      if (newUsername && isUsernameTaken(newUsername, { orgId: org.id })) {
        return res.status(400).json({ status: "error", message: "این نام کاربری قبلا ثبت شده است." });
      }
      org.username = newUsername;
    }
    if (pw) {
      if (pw.length < 6) {
        return res.status(400).json({ status: "error", message: "رمز عبور باید حداقل ۶ کاراکتر باشد." });
      }
      org.passwordHash = bcrypt.hashSync(pw, 10);
    }
    for (const field of ORG_FIELDS) {
      const value = req.body[field];
      if (value === undefined) continue;
      // Empty name / logo / color in the form mean "unchanged".
      if (["org_name", "logo_url", "color"].includes(field) && !value) continue;
      org[field] = value;
    }
    saveDatabase();
    return res.json({ status: "success" });
  }
  res.status(400).json({ status: "error", message: "عملیات نامعتبر" });
});

subRouter.get("/get_org_report", checkPermission("reports", { allowClients: true }), (req, res) => {
  const org_id = isClient(req) ? clientOrgId(req) : req.query.org_id;
  const start_date = req.query.start_date;
  const end_date = req.query.end_date;
  const col_id = req.query.col_id;
  const status_filter = req.query.status;
  const platform_filter = req.query.platform;
  const no_time_limit = req.query.no_time_limit;
  if (!org_id)
    return res.json({ status: "error", message: "org_id is required" });
  const org = organizations.find((o) => o.id == org_id);
  if (!org)
    return res.json({ status: "error", message: "Organization not found" });
  let orgContents = contents
    .filter((c) => c.org_id == org_id)
    .map((c) => {
      if (!isClient(req)) return { ...c };
      // Internal notes and history stay inside the studio.
      const { activity_log, version_history, comments, ...rest } = c;
      return rest;
    });
  if (col_id) {
    orgContents = orgContents.filter((c) => c.collection_id == col_id);
  }
  if (status_filter) {
    orgContents = orgContents.filter(
      (c) => (c.status || "raw") === status_filter,
    );
  }
  if (platform_filter) {
    orgContents = orgContents.filter(
      (c) =>
        c.publish_platforms && c.publish_platforms.includes(platform_filter),
    );
  }
  if (no_time_limit !== "true") {
    if (start_date) {
      orgContents = orgContents.filter(
        (c) => c.publish_date && c.publish_date >= start_date,
      );
    }
    if (end_date) {
      orgContents = orgContents.filter(
        (c) => c.publish_date && c.publish_date <= end_date,
      );
    }
  }
  const typeCounts = {};
  const statusCounts = {};
  const platformCounts = {};
  let total_components = 0;
  let stats_counted_length = 0;
  orgContents.forEach((c) => {
    if (c.is_recurrence_instance) {
      if (!c.title.includes(" (تکرار)"))
        c.title += " (تکرار)";
    }
    const skipStats = c.is_recurrence_instance && c.count_in_stats === false;
    if (!skipStats) {
      stats_counted_length++;
      if (c.content_type)
        typeCounts[c.content_type] = (typeCounts[c.content_type] || 0) + 1;
      const statusMap = {
        raw: "ورودی خام",
        todo: "در صف انتظار",
        in_progress:
          "در حال تولید",
        review:
          "ارزیابی استودیو",
        client_review:
          "ارزیابی کارفرما",
        needs_revision:
          "نیاز به اصلاح",
        done: "تکمیل شده",
        approved_by_client:
          "تایید کارفرما",
        ready_to_publish:
          "آماده انتشار",
        published: "منتشر شده",
      };
      let s = statusMap[c.status || "raw"] || c.status || "raw";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      if (c.publish_platforms) {
        c.publish_platforms.forEach((p) => {
          platformCounts[p] = (platformCounts[p] || 0) + 1;
        });
      }
      const comps = c.components_count || {};
      let cCount = 0;
      for (let k in comps) cCount += comps[k];
      if (cCount === 0) cCount = 1;
      total_components += cCount;
    }
    const comps2 = c.components_count || {};
    let cCount2 = 0;
    for (let k in comps2) cCount2 += comps2[k];
    if (cCount2 === 0) cCount2 = 1;
    c.total_components = cCount2;
  });
  res.json({
    status: "success",
    organization: stripSecrets(org),
    contents: orgContents,
    stats: {
      typeCounts,
      statusCounts,
      platformCounts,
      total_contents: stats_counted_length,
      total_components,
    },
  });
});

export default subRouter;
