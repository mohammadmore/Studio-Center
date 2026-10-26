import express from "express";
import { colleagues, contents, expenses, invoices, leaves, organizations, time_entries } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission } from "../../middleware/auth.js";
import { hasPermission } from "../../utils/authUtils.js";
import { addDaysToJalali, jalaliDiffDays, nextId, normalizeJalaliDate, todayJalali, toInt } from "../../utils/helpers.js";
import { cardColleagueIds } from "../../utils/contentUtils.js";
import { DELIVERED_STATUSES, isFinished, openCardsOf, shootsOn } from "../../utils/workflowUtils.js";
import { docType, priceOf, toNumber } from "./finances.js";

/** Timesheets, profitability per brand and the team's workload. */
const subRouter = express.Router();

const MAX_RANGE_DAYS = 92;

function fail(res: any, code: number, message: string) {
  return res.status(code).json({ status: "error", message });
}

function range(q: any, defaultDays = 30) {
  const today = todayJalali();
  let from = normalizeJalaliDate(q.from) || addDaysToJalali(today, -defaultDays + 1);
  let to = normalizeJalaliDate(q.to) || today;
  if (from > to) [from, to] = [to, from];
  if (jalaliDiffDays(from, to) > MAX_RANGE_DAYS) to = addDaysToJalali(from, MAX_RANGE_DAYS);
  return { from, to };
}

function entryView(e: any) {
  const card = e.content_id ? contents.find((c) => c.id == e.content_id) : null;
  const colleague = colleagues.find((c) => c.id == e.colleague_id);
  const org = organizations.find((o) => o.id == (e.org_id ?? card?.org_id));
  return {
    ...e,
    content_title: card?.title || e.content_title || "",
    colleague_name: colleague?.full_name || colleague?.username || "",
    org_name: org?.org_name || "",
  };
}

// ───────────────────────────── Time entries ─────────────────────────────

subRouter.get("/time_entries", (req: any, res) => {
  const canSeeAll = hasPermission(req.user, ["timesheet_report", "workload"]);
  const { from, to } = range(req.query);
  const contentId = toInt(req.query.content_id);
  const colleagueId = toInt(req.query.colleague_id);
  const data = time_entries
    .filter((e) => {
      if (!canSeeAll && e.colleague_id != req.user.id) return false;
      if (colleagueId && e.colleague_id != colleagueId) return false;
      if (contentId) return e.content_id == contentId;
      return e.date >= from && e.date <= to;
    })
    .map(entryView)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
  const totalMinutes = data.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
  const me = colleagues.find((c) => c.id == req.user.id);
  res.json({ status: "success", from, to, data, total_minutes: totalMinutes, running_timer: me?.running_timer || null });
});

function addEntry(colleagueId: number, input: any, source: string) {
  const card = input.content_id ? contents.find((c) => c.id == input.content_id) : null;
  const entry = {
    id: nextId(time_entries),
    colleague_id: colleagueId,
    content_id: card ? card.id : null,
    org_id: card ? card.org_id ?? null : toInt(input.org_id),
    stage: typeof input.stage === "string" ? input.stage.slice(0, 100) : "",
    minutes: Math.max(1, Math.round(Number(input.minutes) || 0)),
    date: normalizeJalaliDate(input.date) || todayJalali(),
    note: typeof input.note === "string" ? input.note.trim().slice(0, 500) : "",
    source,
    created_at: new Date().toISOString(),
  };
  time_entries.push(entry);
  return entry;
}

subRouter.post("/time_entries", (req: any, res) => {
  const { action } = req.body;
  if (action === "add") {
    const minutes = Number(req.body.minutes) || Math.round((Number(req.body.hours) || 0) * 60);
    if (!(minutes > 0) || minutes > 24 * 60) return fail(res, 400, "مدت زمان نامعتبر است (حداکثر ۲۴ ساعت)");
    // Staff log their own time; managers may log for others.
    const target = toInt(req.body.colleague_id);
    const colleagueId = target && hasPermission(req.user, "timesheet_report") ? target : Number(req.user.id);
    const entry = addEntry(colleagueId, { ...req.body, minutes }, "manual");
    saveDatabase();
    return res.json({ status: "success", message: "زمان ثبت شد", data: entryView(entry) });
  }
  if (action === "delete") {
    const idx = time_entries.findIndex((e) => e.id == req.body.id);
    if (idx === -1) return fail(res, 404, "یافت نشد");
    if (time_entries[idx].colleague_id != req.user.id && !hasPermission(req.user, "timesheet_report")) {
      return fail(res, 403, "عدم دسترسی");
    }
    time_entries.splice(idx, 1);
    saveDatabase();
    return res.json({ status: "success", message: "حذف شد" });
  }
  fail(res, 400, "عملیات نامعتبر");
});

subRouter.post("/timer", (req: any, res) => {
  const me = colleagues.find((c) => c.id == req.user.id);
  if (!me) return fail(res, 404, "کاربر یافت نشد");
  const { action } = req.body;
  if (action === "start") {
    let stopped = null;
    if (me.running_timer) stopped = stopTimer(me);
    const card = contents.find((c) => c.id == req.body.content_id);
    me.running_timer = {
      content_id: card ? card.id : null,
      content_title: card?.title || "",
      stage: typeof req.body.stage === "string" ? req.body.stage.slice(0, 100) : "",
      note: typeof req.body.note === "string" ? req.body.note.slice(0, 500) : "",
      started_at: new Date().toISOString(),
    };
    saveDatabase();
    return res.json({ status: "success", running_timer: me.running_timer, stopped: stopped && entryView(stopped) });
  }
  if (action === "stop") {
    if (!me.running_timer) return fail(res, 400, "تایمری در حال اجرا نیست");
    const entry = stopTimer(me);
    saveDatabase();
    return res.json({ status: "success", message: "زمان ثبت شد", data: entry && entryView(entry) });
  }
  if (action === "discard") {
    delete me.running_timer;
    saveDatabase();
    return res.json({ status: "success" });
  }
  fail(res, 400, "عملیات نامعتبر");
});

function stopTimer(me: any) {
  const t = me.running_timer;
  delete me.running_timer;
  const minutes = Math.round((Date.now() - new Date(t.started_at).getTime()) / 60000);
  if (!(minutes >= 1)) return null;
  return addEntry(me.id, { ...t, minutes: Math.min(minutes, 16 * 60) }, "timer");
}

subRouter.post("/hourly_cost", checkPermission("timesheet_report"), (req, res) => {
  const c = colleagues.find((x) => x.id == req.body.colleague_id);
  if (!c) return fail(res, 404, "همکار یافت نشد");
  c.hourly_cost = Math.max(0, toNumber(req.body.hourly_cost));
  saveDatabase();
  res.json({ status: "success", message: "نرخ ساعتی ذخیره شد" });
});

/** Revenue against labour cost per brand: who is really profitable. */
subRouter.get("/profitability", checkPermission("timesheet_report"), (req, res) => {
  const { from, to } = range(req.query, 31);
  const rate = new Map(colleagues.map((c) => [c.id, Number(c.hourly_cost) || 0]));
  const rows = new Map<any, any>();
  const row = (orgId: any) => {
    const key = orgId ?? "none";
    if (!rows.has(key)) {
      const org = organizations.find((o) => o.id == orgId);
      rows.set(key, { org_id: orgId ?? null, org_name: org?.org_name || "بدون برند", minutes: 0, labor_cost: 0, expenses: 0, invoiced: 0, estimated_revenue: 0, delivered: 0 });
    }
    return rows.get(key);
  };
  for (const e of time_entries) {
    if (e.date < from || e.date > to) continue;
    const r = row(e.org_id);
    r.minutes += Number(e.minutes) || 0;
    r.labor_cost += ((Number(e.minutes) || 0) / 60) * (rate.get(e.colleague_id) || 0);
  }
  for (const inv of invoices) {
    if (docType(inv) !== "invoice" || inv.status === "cancelled" || inv.status === "draft") continue;
    const d = normalizeJalaliDate(inv.issue_date);
    if (!d || d < from || d > to) continue;
    row(inv.org_id).invoiced += toNumber(inv.total);
  }
  for (const c of contents) {
    const d = normalizeJalaliDate(c.publish_date);
    if (!d || d < from || d > to || !DELIVERED_STATUSES.includes(c.status)) continue;
    const r = row(c.org_id);
    r.delivered++;
    const comps = c.components_count || {};
    const keys = Object.keys(comps).filter((k) => Number(comps[k]) > 0);
    r.estimated_revenue += keys.length ? keys.reduce((s, k) => s + priceOf(k) * Number(comps[k]), 0) : priceOf(c.content_type);
  }
  for (const ex of expenses) {
    const d = normalizeJalaliDate(ex.date);
    if (!d || d < from || d > to) continue;
    const org = organizations.find((o) => o.id == ex.org_id || o.org_name === ex.project_name);
    if (org) row(org.id).expenses += Number(ex.amount) || 0;
  }
  const data = [...rows.values()]
    .map((r) => {
      const revenue = r.invoiced || r.estimated_revenue;
      const cost = r.labor_cost + r.expenses;
      return {
        ...r,
        hours: Math.round((r.minutes / 60) * 10) / 10,
        labor_cost: Math.round(r.labor_cost),
        revenue,
        revenue_source: r.invoiced ? "invoices" : "estimate",
        profit: Math.round(revenue - cost),
        margin: revenue ? Math.round(((revenue - cost) / revenue) * 100) : null,
      };
    })
    .sort((a, b) => a.profit - b.profit);
  const missingRates = colleagues.filter((c) => c.is_active !== 0 && !Number(c.hourly_cost)).map((c) => c.full_name || c.username);
  res.json({ status: "success", from, to, data, missing_rates: missingRates });
});

// ───────────────────────────── Workload ─────────────────────────────

subRouter.get("/workload", checkPermission("workload"), (req, res) => {
  const today = todayJalali();
  const from = normalizeJalaliDate(req.query.from) || today;
  let to = normalizeJalaliDate(req.query.to) || addDaysToJalali(from, 6);
  if (jalaliDiffDays(from, to) > 31) to = addDaysToJalali(from, 31);
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 32; d = addDaysToJalali(d, 1)) days.push(d);

  const data = colleagues
    .filter((c) => c.is_active !== 0 && c.is_active !== false)
    .map((c) => {
      const open = openCardsOf(c.id);
      const stages: any[] = [];
      for (const card of contents) {
        if (isFinished(card)) continue;
        for (const [stage, plan] of Object.entries<any>(card.stage_plan || {})) {
          if (plan?.owner_id != c.id || (card.completed_stages || []).includes(stage)) continue;
          stages.push({ content_id: card.id, title: card.title, stage, due_date: plan.due_date || "", estimated_hours: plan.estimated_hours || null });
        }
      }
      const perDay = days.map((d) => {
        const due = stages.filter((s) => s.due_date === d);
        const publishing = open.filter((card) => normalizeJalaliDate(card.publish_date) === d && cardColleagueIds(card).includes(c.id));
        const leave = leaves.find(
          (l) => l.user_id == c.id && l.status === "approved" && normalizeJalaliDate(l.start_date) <= d && normalizeJalaliDate(l.end_date || l.start_date) >= d,
        );
        const dayShoots = shootsOn(c.id, d);
        return {
          date: d,
          stages: due,
          publishing: publishing.map((p) => ({ content_id: p.id, title: p.title })),
          shoots: dayShoots.map((s) => ({ id: s.id, title: s.title, start_time: s.start_time })),
          on_leave: !!leave,
          hours: due.reduce((s, x) => s + (Number(x.estimated_hours) || 0), 0),
          count: due.length + publishing.length + dayShoots.length,
        };
      });
      const loggedMinutes = time_entries
        .filter((e) => e.colleague_id == c.id && e.date >= from && e.date <= to)
        .reduce((s, e) => s + (Number(e.minutes) || 0), 0);
      return {
        colleague_id: c.id,
        name: c.full_name || c.username,
        avatar_url: c.avatar_url || "",
        status: c.status || "active",
        capacity: Number(c.capacity) || null,
        open_cards: open.length,
        overdue: stages.filter((s) => s.due_date && s.due_date < today).length,
        stages_in_range: stages.filter((s) => s.due_date >= from && s.due_date <= to).length,
        estimated_hours: perDay.reduce((s, d) => s + d.hours, 0),
        logged_hours: Math.round((loggedMinutes / 60) * 10) / 10,
        no_date: stages.filter((s) => !s.due_date).length,
        days: perDay,
      };
    })
    .sort((a, b) => b.open_cards - a.open_cards);
  res.json({ status: "success", from, to, days, data });
});

export default subRouter;
