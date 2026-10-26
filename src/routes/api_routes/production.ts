import express from "express";
import { colleagues, contents, equipment, organizations, shoots, snippets } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission, clientOrgId, isClient } from "../../middleware/auth.js";
import { hasPermission } from "../../utils/authUtils.js";
import { addNotification } from "../../utils/logger.js";
import { nextId, normalizeJalaliDate, safeColor, safeUrl, toInt } from "../../utils/helpers.js";
import { colleagueName, leaveOn } from "../../utils/workflowUtils.js";

/** Shoot planning with crew and equipment booking, brand kits and caption snippets. */
const subRouter = express.Router();

const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

function fail(res: any, code: number, message: string, extra: any = {}) {
  return res.status(code).json({ status: "error", message, ...extra });
}

function toMinutes(t: string, fallback: number) {
  if (!TIME.test(t || "")) return fallback;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(a: any, b: any) {
  if (normalizeJalaliDate(a.date) !== normalizeJalaliDate(b.date)) return false;
  const as = toMinutes(a.start_time, 0);
  const ae = toMinutes(a.end_time, 24 * 60);
  const bs = toMinutes(b.start_time, 0);
  const be = toMinutes(b.end_time, 24 * 60);
  return as < be && bs < ae;
}

function shootView(s: any) {
  const org = organizations.find((o) => o.id == s.org_id);
  return {
    ...s,
    org_name: org?.org_name || "",
    org_color: org?.color || "",
    crew: (s.crew || []).map((m: any) => ({ ...m, name: colleagueName(m.colleague_id) })),
    equipment_items: (s.equipment_ids || []).map((id: any) => equipment.find((e) => e.id == id)).filter(Boolean),
    contents: (s.content_ids || [])
      .map((id: any) => contents.find((c) => c.id == id))
      .filter(Boolean)
      .map((c: any) => ({ id: c.id, title: c.title, content_type: c.content_type })),
  };
}

/** Equipment double-bookings block; crew clashes and leave are warnings. */
export function shootConflicts(candidate: any) {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const other of shoots) {
    if (other.id == candidate.id || other.status === "cancelled" || !overlaps(candidate, other)) continue;
    for (const eqId of candidate.equipment_ids || []) {
      if ((other.equipment_ids || []).includes(eqId)) {
        const eq = equipment.find((e) => e.id == eqId);
        errors.push(`«${eq?.name || eqId}» در همین زمان برای «${other.title}» (${other.start_time || ""}-${other.end_time || ""}) رزرو شده است.`);
      }
    }
    for (const m of candidate.crew || []) {
      if ((other.crew || []).some((o: any) => o.colleague_id == m.colleague_id)) {
        warnings.push(`${colleagueName(m.colleague_id)} در همین زمان در تصویربرداری «${other.title}» است.`);
      }
    }
  }
  for (const m of candidate.crew || []) {
    const leave = leaveOn(m.colleague_id, candidate.date);
    if (leave) warnings.push(`${colleagueName(m.colleague_id)} در ${candidate.date} ${leave.status === "approved" ? "مرخصی" : "درخواست مرخصی"} دارد.`);
  }
  for (const eqId of candidate.equipment_ids || []) {
    const eq = equipment.find((e) => e.id == eqId);
    if (eq && eq.is_active === 0) errors.push(`«${eq.name}» غیرفعال یا در تعمیر است.`);
  }
  return { errors, warnings };
}

subRouter.get("/shoots", checkPermission("shoots"), (req, res) => {
  const from = normalizeJalaliDate(req.query.from);
  const to = normalizeJalaliDate(req.query.to);
  const data = shoots
    .filter((s) => (!from || normalizeJalaliDate(s.date) >= from) && (!to || normalizeJalaliDate(s.date) <= to))
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`))
    .map(shootView);
  res.json({ status: "success", data });
});

subRouter.get("/shoot", (req: any, res) => {
  const s = shoots.find((x) => x.id == req.query.id);
  if (!s) return fail(res, 404, "یافت نشد");
  const onCrew = (s.crew || []).some((m: any) => m.colleague_id == req.user.id);
  if (!hasPermission(req.user, "shoots") && !onCrew) return fail(res, 403, "عدم دسترسی");
  const view: any = shootView(s);
  const org = organizations.find((o) => o.id == s.org_id);
  view.crew = view.crew.map((m: any) => {
    const c = colleagues.find((x) => x.id == m.colleague_id);
    return { ...m, phone: c?.phone || "" };
  });
  view.org_contact = org ? { name: org.contact_name || "", phone: org.phone_number || "" } : null;
  res.json({ status: "success", data: view });
});

subRouter.post("/shoots", checkPermission("shoots"), (req: any, res) => {
  const { action } = req.body;
  if (action === "delete") {
    const idx = shoots.findIndex((s) => s.id == req.body.id);
    if (idx === -1) return fail(res, 404, "یافت نشد");
    shoots.splice(idx, 1);
    saveDatabase();
    return res.json({ status: "success", message: "حذف شد" });
  }
  if (action !== "save") return fail(res, 400, "عملیات نامعتبر");
  const b = req.body;
  const date = normalizeJalaliDate(b.date);
  if (!text(b.title)) return fail(res, 400, "عنوان الزامی است");
  if (!date) return fail(res, 400, "تاریخ تصویربرداری الزامی است");
  const existing = b.id ? shoots.find((s) => s.id == b.id) : null;
  const candidate: any = {
    id: existing?.id ?? nextId(shoots),
    title: text(b.title, 200),
    org_id: toInt(b.org_id),
    content_ids: (Array.isArray(b.content_ids) ? b.content_ids : []).map(toInt).filter((id: any) => contents.some((c) => c.id == id)),
    date,
    start_time: TIME.test(b.start_time || "") ? b.start_time : "",
    end_time: TIME.test(b.end_time || "") ? b.end_time : "",
    call_time: TIME.test(b.call_time || "") ? b.call_time : "",
    location: text(b.location, 300),
    location_url: safeUrl(b.location_url),
    crew: (Array.isArray(b.crew) ? b.crew : [])
      .map((m: any) => ({ colleague_id: toInt(m?.colleague_id), role: text(m?.role, 100) }))
      .filter((m: any) => colleagues.some((c) => c.id == m.colleague_id)),
    equipment_ids: (Array.isArray(b.equipment_ids) ? b.equipment_ids : []).map(toInt).filter((id: any) => equipment.some((e) => e.id == id)),
    talent: text(b.talent, 1000),
    schedule: text(b.schedule, 5000),
    notes: text(b.notes, 5000),
    status: ["planned", "done", "cancelled"].includes(b.status) ? b.status : "planned",
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (candidate.status !== "cancelled") {
    const { errors, warnings } = shootConflicts(candidate);
    if (errors.length) return fail(res, 409, "تداخل رزرو تجهیزات", { errors, warnings });
    if (warnings.length && !b.force) return res.json({ status: "warning", warnings });
  }
  const previousCrew = new Set((existing?.crew || []).map((m: any) => m.colleague_id));
  if (existing) Object.assign(existing, candidate);
  else shoots.push(candidate);
  for (const m of candidate.crew) {
    if (previousCrew.has(m.colleague_id) || m.colleague_id == req.user.id) continue;
    addNotification(
      "برنامه تصویربرداری",
      `شما در تصویربرداری «${candidate.title}» در تاریخ ${date}${candidate.call_time || candidate.start_time ? ` ساعت ${candidate.call_time || candidate.start_time}` : ""}${candidate.location ? ` (${candidate.location})` : ""}${m.role ? ` به عنوان ${m.role}` : ""} حضور دارید.`,
      "colleague",
      m.colleague_id,
      `/call-sheet?id=${candidate.id}`,
      "shoot_assigned",
      candidate.id,
    );
  }
  saveDatabase();
  res.json({ status: "success", message: "برنامه تصویربرداری ذخیره شد", data: shootView(candidate) });
});

subRouter.get("/equipment", checkPermission("shoots"), (req, res) => {
  const date = normalizeJalaliDate(req.query.date);
  const data = equipment.map((e) => {
    const bookings = date
      ? shoots
          .filter((s) => s.status !== "cancelled" && normalizeJalaliDate(s.date) === date && (s.equipment_ids || []).includes(e.id))
          .map((s) => ({ id: s.id, title: s.title, start_time: s.start_time, end_time: s.end_time }))
      : [];
    return { ...e, bookings };
  });
  res.json({ status: "success", data });
});

subRouter.post("/equipment", checkPermission("shoots"), (req, res) => {
  const { action } = req.body;
  if (action === "delete") {
    const idx = equipment.findIndex((e) => e.id == req.body.id);
    if (idx === -1) return fail(res, 404, "یافت نشد");
    if (shoots.some((s) => s.status === "planned" && (s.equipment_ids || []).includes(equipment[idx].id))) {
      return fail(res, 400, "این تجهیز در برنامه‌های آینده رزرو شده است؛ ابتدا آن را غیرفعال کنید");
    }
    equipment.splice(idx, 1);
    saveDatabase();
    return res.json({ status: "success", message: "حذف شد" });
  }
  if (action !== "save") return fail(res, 400, "عملیات نامعتبر");
  const name = text(req.body.name, 200);
  if (!name) return fail(res, 400, "نام تجهیز الزامی است");
  const existing = req.body.id ? equipment.find((e) => e.id == req.body.id) : null;
  const item = {
    id: existing?.id ?? nextId(equipment),
    name,
    category: text(req.body.category, 100),
    serial: text(req.body.serial, 100),
    notes: text(req.body.notes, 1000),
    is_active: req.body.is_active === 0 || req.body.is_active === "0" || req.body.is_active === false ? 0 : 1,
  };
  if (existing) Object.assign(existing, item);
  else equipment.push(item);
  saveDatabase();
  res.json({ status: "success", message: "ذخیره شد", data: item });
});

// ───────────────────────────── Brand kit ─────────────────────────────

function cleanList(list: unknown, max = 50) {
  return Array.isArray(list) ? list.map((x) => text(x, 500)).filter(Boolean).slice(0, max) : [];
}

function cleanFiles(list: unknown) {
  return Array.isArray(list)
    ? list
        .slice(0, 100)
        .map((f: any) => ({ name: text(f?.name, 200) || "فایل", url: safeUrl(f?.url), size: Number(f?.size) || 0 }))
        .filter((f) => f.url && !f.url.startsWith("data:"))
    : [];
}

function brandKitOf(org: any) {
  const kit = org.brand_kit || {};
  return {
    org_id: org.id,
    org_name: org.org_name,
    org_logo: org.logo_url || "",
    org_color: org.color || "",
    logos: kit.logos || [],
    fonts: kit.fonts || [],
    colors: kit.colors || [],
    files: kit.files || [],
    guidelines: kit.guidelines || "",
    tone: kit.tone || "",
    audience: kit.audience || "",
    dos: kit.dos || [],
    donts: kit.donts || [],
    accounts: kit.accounts || [],
    updated_at: kit.updated_at || null,
  };
}

subRouter.get("/brand_kit", (req: any, res) => {
  const orgId = isClient(req) ? clientOrgId(req) : toInt(req.query.org_id);
  const org = organizations.find((o) => o.id == orgId);
  if (!org) return fail(res, 404, "سازمان یافت نشد");
  res.json({ status: "success", data: brandKitOf(org), can_edit: !isClient(req) && hasPermission(req.user, "brand_kit") });
});

subRouter.post("/brand_kit", checkPermission("brand_kit"), (req, res) => {
  const org = organizations.find((o) => o.id == req.body.org_id);
  if (!org) return fail(res, 404, "سازمان یافت نشد");
  const b = req.body.kit || {};
  org.brand_kit = {
    logos: cleanFiles(b.logos),
    fonts: cleanFiles(b.fonts),
    files: cleanFiles(b.files),
    colors: (Array.isArray(b.colors) ? b.colors : [])
      .map((c: any) => ({ name: text(c?.name, 100), hex: safeColor(c?.hex, "") }))
      .filter((c: any) => c.hex)
      .slice(0, 30),
    guidelines: text(b.guidelines, 20000),
    tone: text(b.tone, 2000),
    audience: text(b.audience, 2000),
    dos: cleanList(b.dos),
    donts: cleanList(b.donts),
    accounts: (Array.isArray(b.accounts) ? b.accounts : [])
      .map((a: any) => ({ platform: text(a?.platform, 100), handle: text(a?.handle, 200), url: safeUrl(a?.url) }))
      .filter((a: any) => a.platform || a.handle)
      .slice(0, 30),
    updated_at: new Date().toISOString(),
  };
  saveDatabase();
  res.json({ status: "success", message: "کیت برند ذخیره شد", data: brandKitOf(org) });
});

// ───────────────────────────── Caption snippets ─────────────────────────────

const SNIPPET_KINDS = ["hashtag", "phrase", "cta"];

subRouter.get("/snippets", (req: any, res) => {
  if (isClient(req)) return fail(res, 403, "عدم دسترسی");
  const orgId = toInt(req.query.org_id);
  const data = snippets.filter((s) => !s.org_id || !orgId || s.org_id == orgId || req.query.all);
  res.json({ status: "success", data });
});

subRouter.post("/snippets", checkPermission(["depot", "calendar", "brand_kit", "templates"]), (req, res) => {
  const { action } = req.body;
  if (action === "delete") {
    const idx = snippets.findIndex((s) => s.id == req.body.id);
    if (idx === -1) return fail(res, 404, "یافت نشد");
    snippets.splice(idx, 1);
    saveDatabase();
    return res.json({ status: "success", message: "حذف شد" });
  }
  if (action !== "save") return fail(res, 400, "عملیات نامعتبر");
  const body = text(req.body.text, 3000);
  if (!body) return fail(res, 400, "متن الزامی است");
  const existing = req.body.id ? snippets.find((s) => s.id == req.body.id) : null;
  const item = {
    id: existing?.id ?? nextId(snippets),
    title: text(req.body.title, 100) || body.slice(0, 40),
    text: body,
    kind: SNIPPET_KINDS.includes(req.body.kind) ? req.body.kind : "phrase",
    org_id: toInt(req.body.org_id),
    platform: text(req.body.platform, 100),
  };
  if (existing) Object.assign(existing, item);
  else snippets.push(item);
  saveDatabase();
  res.json({ status: "success", message: "ذخیره شد", data: item });
});

export default subRouter;
