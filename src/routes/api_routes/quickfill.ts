import express from "express";
import * as jalaali from "jalaali-js";
import { batch_operations, colleagues, collections, contents, organizations, settings } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission } from "../../middleware/auth.js";
import { effectiveAvatar, hasPermission } from "../../utils/authUtils.js";
import { addNotification, logContentActivity } from "../../utils/logger.js";
import { normalizeJalaliDate, toInt } from "../../utils/helpers.js";
import { cardColleagueIds, resolveColleagueIds } from "../../utils/contentUtils.js";
import { emitToStaff } from "../../utils/socket.js";
import { managerId, stagePlan } from "../../utils/workflowUtils.js";
import { canEditCard, CONTENT_PERMS, findOrCreateCollection, notifyNewAssignees } from "./contents.js";

/**
 * "Quick fill": instead of hunting for incomplete cards, the studio gets them one after
 * another with only their empty parts to fill. What counts as empty depends on how far the
 * card has come (a raw idea needs no video link); the rules can be changed in settings.
 */
const subRouter = express.Router();

/** Workflow order; a field is required from its status onward. */
export const STATUS_ORDER = ["raw", "todo", "in_progress", "review", "client_review", "needs_revision", "done", "approved_by_client", "ready_to_publish", "scheduled", "published"];
const STATUS_ALIAS: Record<string, string> = { doing: "in_progress", pending_client_review: "client_review" };

export const QUICK_FIELDS = [
  { key: "content_type", label: "نوع محتوا", from: "raw", manager: false },
  { key: "collection", label: "مجموعه", from: "raw", manager: true },
  { key: "project_manager", label: "مدیر پروژه", from: "todo", manager: true },
  { key: "stages", label: "مراحل تولید", from: "todo", manager: false },
  { key: "team", label: "همکاران", from: "in_progress", manager: true },
  { key: "stage_owners", label: "مسئول مراحل", from: "in_progress", manager: true },
  { key: "publish_date", label: "تاریخ و ساعت انتشار", from: "in_progress", manager: false },
  { key: "platforms", label: "پلتفرم‌های انتشار", from: "in_progress", manager: false },
  { key: "caption", label: "کپشن", from: "review", manager: false },
  { key: "media", label: "لینک ویدیو یا کاور", from: "done", manager: false },
] as const;
type FieldKey = (typeof QUICK_FIELDS)[number]["key"];

/** Current rules: field → status it is required from, or "off". */
export function quickFillRules(): Record<string, string> {
  const saved = settings.quick_fill_rules && typeof settings.quick_fill_rules === "object" ? settings.quick_fill_rules : {};
  const out: Record<string, string> = {};
  for (const f of QUICK_FIELDS) {
    const v = saved[f.key];
    out[f.key] = v === "off" || STATUS_ORDER.includes(v) ? v : f.from;
  }
  return out;
}

const statusIndex = (s: unknown) => STATUS_ORDER.indexOf(STATUS_ALIAS[String(s)] || String(s || "raw"));
const empty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

function stageOwnersMissing(card: any) {
  const stages: string[] = Array.isArray(card.stages) ? card.stages : [];
  const plan = card.stage_plan && typeof card.stage_plan === "object" ? card.stage_plan : {};
  return stages.filter((s) => !plan[s]?.owner_id);
}

function isEmptyField(card: any, key: FieldKey) {
  switch (key) {
    case "content_type": return empty(card.content_type);
    case "collection": return !card.collection_id || !collections.some((c) => c.id == card.collection_id);
    case "project_manager": return empty(card.project_manager);
    case "stages": return empty(card.stages);
    case "team": return empty(card.assigned_colleagues);
    case "stage_owners": return !empty(card.stages) && stageOwnersMissing(card).length > 0;
    case "publish_date": return !normalizeJalaliDate(card.publish_date) || empty(card.publish_time);
    case "platforms": return empty(card.publish_platforms);
    case "caption": return empty(card.caption);
    case "media": return empty(card.video_link) && empty(card.cover_link);
  }
}

/** The empty parts of a card that this user may fill, under the current rules. */
export function missingFields(card: any, user: any, rules = quickFillRules()) {
  const idx = statusIndex(card.status);
  if (idx === -1) return [];
  const manager = hasPermission(user, CONTENT_PERMS);
  const isCardManager = managerId(card) == user?.id;
  return QUICK_FIELDS.filter((f) => {
    const rule = rules[f.key];
    if (rule === "off" || idx < STATUS_ORDER.indexOf(rule)) return false;
    if (f.manager && !manager && !(f.key === "stage_owners" && isCardManager)) return false;
    return isEmptyField(card, f.key);
  }).map((f) => f.key);
}

// ───────── Per-user state: snoozed cards ("later") and today's count ─────────
function tehranDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function userState(user: any) {
  const me = colleagues.find((c) => c.id == user?.id);
  if (!me) return null;
  if (!me.quick_fill || typeof me.quick_fill !== "object") me.quick_fill = {};
  const st = me.quick_fill;
  if (!st.snoozed || typeof st.snoozed !== "object") st.snoozed = {};
  const today = tehranDay();
  for (const [id, day] of Object.entries(st.snoozed)) if (String(day) < today) delete st.snoozed[id];
  if (st.day !== today) { st.day = today; st.done = 0; }
  return st;
}

function jalaliToNumber(d: unknown) {
  const n = normalizeJalaliDate(d);
  return n ? Number(n.replace(/\//g, "")) : null;
}

function cardMine(card: any, user: any) {
  const me = Number(user?.id);
  if (cardColleagueIds(card).includes(me)) return true;
  const plan = card.stage_plan && typeof card.stage_plan === "object" ? card.stage_plan : {};
  return Object.values<any>(plan).some((p) => p?.owner_id == me);
}

function avatarOf(name: unknown) {
  const id = resolveColleagueIds(name ? [name] : [])[0];
  const c = id ? colleagues.find((x) => x.id == id) : null;
  return c ? { id: c.id, name: c.full_name || c.username, avatar_url: effectiveAvatar(c) || "" } : name ? { id: null, name: String(name), avatar_url: "" } : null;
}

function queueFor(user: any, filters: { org?: string; field?: string; mine?: boolean }) {
  const rules = quickFillRules();
  const st = userState(user);
  const orgById = new Map(organizations.map((o) => [String(o.id), o]));
  const todayNum = Number(tehranDayJalali());
  const list: any[] = [];
  for (const card of contents) {
    if (!card || card.status === "archived" || card.is_archived) continue;
    if (!canEditCard({ user }, card)) continue;
    if (filters.org && String(card.org_id) !== String(filters.org)) continue;
    const missing = missingFields(card, user, rules);
    if (!missing.length) continue;
    if (filters.field && !missing.includes(filters.field as FieldKey)) continue;
    const mine = cardMine(card, user);
    if (filters.mine && !mine) continue;
    const pub = jalaliToNumber(card.publish_date);
    list.push({ card, missing, mine, pub, snoozed: !!st?.snoozed[String(card.id)] });
  }
  // Own work first, then what is due soonest (overdue first), then the most incomplete.
  list.sort((a, b) =>
    Number(b.mine) - Number(a.mine) ||
    (a.pub === null ? 1 : 0) - (b.pub === null ? 1 : 0) ||
    (a.pub ?? 0) - (b.pub ?? 0) ||
    b.missing.length - a.missing.length ||
    a.card.id - b.card.id);
  const visible = list.filter((x) => !x.snoozed);
  return {
    total: visible.length,
    mine: visible.filter((x) => x.mine).length,
    snoozed: list.length - visible.length,
    done_today: st?.done || 0,
    items: visible.map(({ card, missing, mine, pub }) => {
      const org = orgById.get(String(card.org_id));
      const col = collections.find((c) => c.id == card.collection_id);
      return {
        id: card.id,
        title: card.title || "بدون عنوان",
        status: card.status || "raw",
        content_type: card.content_type || "",
        org: org ? { id: org.id, name: org.org_name, logo: org.logo_url || "", color: org.color || "" } : null,
        collection: col ? { id: col.id, title: col.title } : null,
        manager: avatarOf(card.project_manager),
        team: card.assigned_colleagues || [],
        stages: card.stages || [],
        stage_owners_missing: stageOwnersMissing(card),
        publish_date: card.publish_date || "",
        publish_time: card.publish_time || "",
        platforms: card.publish_platforms || [],
        mine,
        overdue: pub !== null && pub < todayNum,
        missing,
      };
    }),
  };
}

function tehranDayJalali() {
  const [y, m, d] = tehranDay().split("-").map(Number);
  // Same conversion the rest of the app uses for Jalali dates.
  return jalaliCompact(new Date(Date.UTC(y, m - 1, d, 12)));
}
function jalaliCompact(date: Date) {
  const j = jalaali.toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return `${j.jy}${String(j.jm).padStart(2, "0")}${String(j.jd).padStart(2, "0")}`;
}

subRouter.get("/quick_fill", (req: any, res) => {
  const q = queueFor(req.user, { org: req.query.org ? String(req.query.org) : "", field: req.query.field ? String(req.query.field) : "", mine: req.query.mine === "1" });
  res.json({ status: "success", fields: QUICK_FIELDS.map(({ key, label }) => ({ key, label })), ...q });
});

subRouter.get("/quick_fill_count", (req: any, res) => {
  const q = queueFor(req.user, {});
  res.json({ status: "success", total: q.total, mine: q.mine });
});

subRouter.post("/quick_fill_snooze", (req: any, res) => {
  const st = userState(req.user);
  const card = contents.find((c) => c.id == req.body.id);
  if (!st || !card) return res.status(404).json({ status: "error", message: "کارت یافت نشد" });
  st.snoozed[String(card.id)] = tehranDay();
  saveDatabase();
  res.json({ status: "success", message: "تا فردا نشان داده نمی‌شود" });
});

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 120)).filter(Boolean).slice(0, 50) : null);

/** Applies quick-fill values to one card; only fields that are empty and allowed are touched. */
function applyValues(req: any, card: any, values: any) {
  const allowed = new Set(missingFields(card, req.user));
  const done: string[] = [];
  if (allowed.has("content_type") && str(values.content_type)) { card.content_type = str(values.content_type); done.push("نوع محتوا"); }
  if (allowed.has("collection") && values.collection !== undefined && values.collection !== "") {
    const id = toInt(values.collection);
    const col = id ? collections.find((c) => c.id == id) : null;
    if (col) card.collection_id = col.id;
    else if (str(values.collection)) card.collection_id = findOrCreateCollection(str(values.collection), card.org_id).id;
    if (card.collection_id) done.push("مجموعه");
  }
  if (allowed.has("project_manager") && str(values.project_manager)) { card.project_manager = str(values.project_manager); done.push("مدیر پروژه"); }
  if (allowed.has("stages")) { const s = strList(values.stages); if (s && s.length) { card.stages = s; done.push("مراحل تولید"); } }
  if (allowed.has("team")) {
    const t = strList(values.team);
    if (t && t.length) { const prev = card.assigned_colleagues || []; card.assigned_colleagues = t; notifyNewAssignees(card, prev); done.push("همکاران"); }
  }
  if (allowed.has("stage_owners") && values.stage_owners && typeof values.stage_owners === "object") {
    const plan = stagePlan(card);
    let any = false;
    for (const stage of card.stages || []) {
      const ownerId = toInt(values.stage_owners[stage]);
      const owner = ownerId ? colleagues.find((c) => c.id == ownerId) : null;
      if (!owner || plan[stage]?.owner_id) continue;
      plan[stage] = { ...(plan[stage] || {}), owner_id: owner.id };
      any = true;
      if (owner.id != req.user.id) {
        addNotification("مسئولیت مرحله", `مرحله «${stage}» محتوای "${card.title}" به شما سپرده شد.`, "colleague", owner.id, "/my-projects", "assignment", card.id);
      }
    }
    if (any) done.push("مسئول مراحل");
  }
  if (allowed.has("publish_date")) {
    const d = normalizeJalaliDate(values.publish_date);
    const t = /^\d{1,2}:\d{2}$/.test(str(values.publish_time)) ? str(values.publish_time) : "";
    if (d) card.publish_date = d;
    if (t) card.publish_time = t;
    if (d || t) done.push("زمان انتشار");
  }
  if (allowed.has("platforms")) { const p = strList(values.platforms); if (p && p.length) { card.publish_platforms = p; done.push("پلتفرم‌ها"); } }
  if (allowed.has("caption") && str(values.caption, 5000)) { card.caption = str(values.caption, 5000); done.push("کپشن"); }
  if (allowed.has("media")) {
    const v = str(values.video_link, 1000), c = str(values.cover_link, 1000);
    const ok = (u: string) => /^https?:\/\//i.test(u);
    if (v && ok(v)) card.video_link = v;
    if (c && ok(c)) card.cover_link = c;
    if ((v && ok(v)) || (c && ok(c))) done.push("لینک فایل");
  }
  return done;
}

function recordUndo(req: any, before: any[], title: string, description: string) {
  if (!before.length) return;
  batch_operations.unshift({
    id: "batch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    type: "batch_edit",
    title,
    description,
    previous_states: before,
    user: req.user?.username || "system",
    timestamp: new Date().toISOString(),
    is_undone: false,
  });
  if (batch_operations.length > 300) batch_operations.splice(300);
}

/** Saves what was filled on one card (and optionally the same value on the next cards). */
subRouter.post("/quick_fill_save", (req: any, res) => {
  const ids: unknown[] = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 50) : [req.body.id];
  const values = req.body.values && typeof req.body.values === "object" ? req.body.values : {};
  const st = userState(req.user);
  const before: any[] = [];
  const results: any[] = [];
  let completed = 0;
  for (const id of ids) {
    const card = contents.find((c) => c.id == id);
    if (!card || !canEditCard(req, card)) continue;
    const snapshot = JSON.parse(JSON.stringify(card));
    const done = applyValues(req, card, values);
    if (!done.length) continue;
    before.push(snapshot);
    logContentActivity(card, req, `در «تکمیل سریع» ${done.join("، ")} را تکمیل کرد`);
    emitToStaff("content_updated", { contentId: card.id, card });
    const left = missingFields(card, req.user);
    if (!left.length) completed++;
    results.push({ id: card.id, filled: done, missing: left });
  }
  if (!results.length) return res.status(400).json({ status: "error", message: "چیزی برای ذخیره نبود" });
  if (st) st.done = (st.done || 0) + completed;
  recordUndo(req, before, "تکمیل سریع", results.length > 1 ? `${results.length} کارت در «تکمیل سریع» تکمیل شد` : `کارت "${before[0].title}" در «تکمیل سریع» تکمیل شد`);
  saveDatabase();
  res.json({ status: "success", data: results, completed, done_today: st?.done || 0 });
});

// ───────── Rules (basic settings) ─────────
subRouter.get("/quick_fill_rules", (req, res) => {
  res.json({ status: "success", data: quickFillRules(), fields: QUICK_FIELDS.map(({ key, label, from }) => ({ key, label, default: from })), statuses: STATUS_ORDER });
});
subRouter.post("/quick_fill_rules", checkPermission("settings"), (req, res) => {
  const input = req.body.rules && typeof req.body.rules === "object" ? req.body.rules : {};
  const out: Record<string, string> = {};
  for (const f of QUICK_FIELDS) {
    const v = input[f.key];
    out[f.key] = v === "off" || STATUS_ORDER.includes(v) ? v : f.from;
  }
  settings.quick_fill_rules = out;
  saveDatabase();
  res.json({ status: "success", message: "قوانین «تکمیل سریع» ذخیره شد", data: out });
});

export default subRouter;
