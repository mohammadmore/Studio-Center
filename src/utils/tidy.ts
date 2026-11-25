import { collections, colleagues, contents, organizations, settings } from "../store/state.js";
import { addDaysToJalali, normalizeJalaliDate, todayJalali, toLatinDigits } from "./helpers.js";

const FINISHED = ["done", "published", "archived", "ready_to_publish", "scheduled", "approved_by_client"];

/** Days between consecutive stages for a content type (settings → stage due template); 0 = off. */
export function stageGapDays(type: unknown) {
  const tpl = settings.stage_due_template && typeof settings.stage_due_template === "object" ? settings.stage_due_template : {};
  const v = tpl[String(type || "").trim()] ?? tpl["*"];
  const n = Number(v);
  return v === undefined || v === null || v === "" || !Number.isFinite(n) ? 1 : Math.max(0, Math.min(30, Math.round(n)));
}

/**
 * Stages without a due date get one counted back from the card's publish date (the last
 * stage on the publish date, each earlier one a few days before, per content type). Such
 * dates are marked automatic and move with the publish date; dates set by hand are kept.
 * Only for cards still in production whose publish date has not passed.
 */
export function applyDefaultStageDues(card: any, today = todayJalali()) {
  const date = normalizeJalaliDate(card?.publish_date);
  const stages: string[] = Array.isArray(card?.stages) ? card.stages : [];
  if (!date || !stages.length || FINISHED.includes(card.status) || card.is_archived || date < today) return false;
  const gap = stageGapDays(card.content_type);
  if (!gap) return false;
  const done: string[] = Array.isArray(card.completed_stages) ? card.completed_stages : [];
  if (!card.stage_plan || typeof card.stage_plan !== "object") card.stage_plan = {};
  let changed = false;
  stages.forEach((stage, i) => {
    if (done.includes(stage)) return;
    const p = card.stage_plan[stage] || {};
    if ((p.due_date && !p.due_auto) || p.no_auto_due) return; // set (or cleared) by hand
    let due = addDaysToJalali(date, -(stages.length - 1 - i) * gap);
    if (due < today) due = today;
    if (p.due_date !== due || !p.due_auto) {
      card.stage_plan[stage] = { ...p, due_date: due, due_auto: true };
      changed = true;
    }
  });
  return changed;
}

/**
 * Stored names and choices are compared as exact text all over the app (a card's type with
 * the type list, a manager's name with the people list, ...). A stray space ("ریلز ") or
 * Persian digits in a date made those comparisons fail: an edit form showed the type empty
 * and saving it then cleared it. Everything is kept trimmed, with dates as 1405/09/03.
 * Runs on every load (a one-off clean-up of older data) and before every write.
 */
const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[​ ]+/g, " ").replace(/\s+/g, " ").trim() : v);

function cleanList(list: unknown) {
  if (!Array.isArray(list)) return list;
  const out: unknown[] = [];
  for (const item of list) {
    const v = clean(item);
    if (v === "" || out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

function cleanKeys(obj: any) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(clean(k));
    if (!key) continue;
    // Two keys that only differed by a space are one: their values are kept, the first wins.
    if (out[key] === undefined) out[key] = v;
    else if (typeof out[key] === "number" && typeof v === "number") out[key] += v;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Cleans one card in place; returns true if anything changed. */
export function tidyCard(card: any) {
  if (!card || typeof card !== "object") return false;
  const before = JSON.stringify(card);
  for (const f of ["title", "content_type", "project_manager", "status", "publish_time"]) {
    if (typeof card[f] === "string") card[f] = clean(card[f]);
  }
  if (typeof card.collection_id === "string") {
    const t = clean(card.collection_id) as string;
    card.collection_id = /^\d+$/.test(t) ? Number(t) : t;
  }
  for (const f of ["assigned_colleagues", "stages", "completed_stages", "publish_platforms", "published_platforms"]) {
    if (Array.isArray(card[f])) card[f] = cleanList(card[f]);
  }
  for (const f of ["components_count", "stage_plan", "platform_metrics"]) {
    if (card[f] && typeof card[f] === "object" && !Array.isArray(card[f])) card[f] = cleanKeys(card[f]);
  }
  // A published card has nothing left to produce: all of its stages count as done.
  if (card.status === "published" && Array.isArray(card.stages) && card.stages.length) {
    const done: string[] = Array.isArray(card.completed_stages) ? card.completed_stages : [];
    const missing = card.stages.filter((s: string) => !done.includes(s));
    if (missing.length) {
      card.completed_stages = [...done, ...missing];
      const plan = card.stage_plan && typeof card.stage_plan === "object" ? card.stage_plan : null;
      if (plan) for (const s of missing) if (plan[s] && !plan[s].completed_at) plan[s].completed_at = new Date().toISOString();
    }
  }
  if (typeof card.publish_date === "string" && card.publish_date.trim()) {
    const d = normalizeJalaliDate(card.publish_date);
    if (d) card.publish_date = d;
  }
  applyDefaultStageDues(card);
  if (typeof card.publish_time === "string" && card.publish_time) {
    const m = /^(\d{1,2}):(\d{2})/.exec(toLatinDigits(card.publish_time));
    if (m) card.publish_time = `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  return JSON.stringify(card) !== before;
}

/** Cleans every stored name and choice; returns true if anything changed. */
export function tidyAll() {
  let changed = false;
  for (const card of contents) if (tidyCard(card)) changed = true;
  for (const [key, value] of Object.entries(settings)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item.setting_key === "string") {
        const v = clean(item.setting_key) as string;
        if (v !== item.setting_key && v) { item.setting_key = v; changed = true; }
      }
    }
    void key;
  }
  for (const c of colleagues) {
    for (const f of ["full_name", "username"]) {
      if (typeof c?.[f] === "string") {
        const v = clean(c[f]);
        if (v !== c[f] && v) { c[f] = v; changed = true; }
      }
    }
  }
  for (const o of organizations) {
    // One form for the active flag (some imports stored "1"/true, which some lists ignored).
    if (o && o.is_active !== 0 && o.is_active !== 1) {
      const off = o.is_active === false || o.is_active === "0" || o.is_active === "false";
      o.is_active = off ? 0 : 1;
      changed = true;
    }
    if (typeof o?.org_name === "string") {
      const v = clean(o.org_name);
      if (v !== o.org_name && v) { o.org_name = v; changed = true; }
    }
  }
  for (const col of collections) {
    if (typeof col?.title === "string") {
      const v = clean(col.title);
      if (v !== col.title && v) { col.title = v; changed = true; }
    }
    if (col?.defaults) {
      const d = col.defaults;
      const next = { ...d };
      for (const f of ["content_type", "project_manager", "publish_time"]) if (typeof next[f] === "string") next[f] = clean(next[f]);
      for (const f of ["team", "stages", "platforms"]) if (Array.isArray(next[f])) next[f] = cleanList(next[f]);
      if (next.stage_owners) next.stage_owners = cleanKeys(next.stage_owners);
      if (!same(next, d)) { col.defaults = next; changed = true; }
    }
  }
  return changed;
}
