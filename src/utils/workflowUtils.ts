import { colleagues, contents, leaves, settings, shoots } from "../store/state.js";
import { hasPermission } from "./authUtils.js";
import { cardColleagueIds, resolveColleagueIds } from "./contentUtils.js";
import { addNotification } from "./logger.js";
import { jalaliDiffDays, normalizeJalaliDate, todayJalali } from "./helpers.js";

/** Statuses after which a card needs no more production work. */
export const FINISHED_STATUSES = ["done", "published", "archived", "ready_to_publish", "scheduled", "approved_by_client"];
/** Statuses that count as "delivered" for contracts and reports. */
export const DELIVERED_STATUSES = ["approved_by_client", "ready_to_publish", "scheduled", "published", "done"];

export function isFinished(card: any) {
  return FINISHED_STATUSES.includes(card?.status);
}

export function colleagueName(id: any) {
  const c = colleagues.find((x) => x.id == id);
  return c ? c.full_name || c.username : "";
}

/** The colleague id of the card's project manager (stored as a name or username). */
export function managerId(card: any): number | null {
  return resolveColleagueIds(card?.project_manager ? [card.project_manager] : [])[0] ?? null;
}

export function stagePlan(card: any): Record<string, any> {
  if (!card.stage_plan || typeof card.stage_plan !== "object") card.stage_plan = {};
  return card.stage_plan;
}

/** The first stage (in the card's order) that is not completed yet. */
export function nextOpenStage(card: any, after?: string) {
  const stages: string[] = Array.isArray(card.stages) ? card.stages : [];
  const done: string[] = card.completed_stages || [];
  const start = after ? stages.indexOf(after) + 1 : 0;
  return stages.slice(Math.max(start, 0)).find((s) => !done.includes(s)) ?? stages.find((s) => !done.includes(s));
}

/** Tells whoever owns the next stage that it is their turn. */
export function onStageCompleted(card: any, stage: string) {
  const next = nextOpenStage(card, stage);
  const plan = stagePlan(card);
  if (next) {
    const ownerId = plan[next]?.owner_id;
    if (ownerId) {
      const due = plan[next]?.due_date ? ` (موعد: ${plan[next].due_date})` : "";
      addNotification(
        "نوبت شماست",
        `مرحله «${stage}» محتوای "${card.title}" تمام شد؛ مرحله «${next}» با شماست${due}.`,
        "colleague",
        ownerId,
        "/my-projects",
        "stage_handoff",
        card.id,
      );
    }
    return next;
  }
  const pm = managerId(card);
  if (pm) {
    addNotification(
      "همه مراحل تولید تمام شد",
      `همه مراحل محتوای "${card.title}" تکمیل شد و آماده بازبینی و ارسال است.`,
      "colleague",
      pm,
      "/depot",
      "stage_handoff",
      card.id,
    );
  }
  return null;
}

/** Approved leave that covers the given Jalali date, if any. */
export function leaveOn(colleagueId: any, date: string) {
  const d = normalizeJalaliDate(date);
  if (!d) return null;
  return (
    leaves.find(
      (l) =>
        l.user_id == colleagueId &&
        (l.status === "approved" || l.status === "pending") &&
        normalizeJalaliDate(l.start_date) <= d &&
        normalizeJalaliDate(l.end_date || l.start_date) >= d,
    ) || null
  );
}

/** Open cards assigned to a colleague (as team member, stage owner or manager). */
export function openCardsOf(colleagueId: number) {
  return contents.filter((c) => {
    if (isFinished(c)) return false;
    if (cardColleagueIds(c).includes(colleagueId)) return true;
    return Object.values(c.stage_plan || {}).some((p: any) => p?.owner_id == colleagueId);
  });
}

const OVERLOAD_THRESHOLD = 12;

/**
 * Warnings shown when work is assigned: the person is on leave on the date the
 * work is due, or already has a lot of open work.
 */
export function assignmentWarnings(assignments: { colleague_id: any; date?: string; label?: string }[]) {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const a of assignments) {
    const name = colleagueName(a.colleague_id);
    if (!name) continue;
    const date = normalizeJalaliDate(a.date);
    const leave = date ? leaveOn(a.colleague_id, date) : null;
    if (leave) {
      const key = `leave:${a.colleague_id}:${date}`;
      if (!seen.has(key)) {
        seen.add(key);
        const state = leave.status === "approved" ? "مرخصی" : "درخواست مرخصی";
        warnings.push(`${name} در تاریخ ${date}${a.label ? ` (${a.label})` : ""} ${state} دارد (${leave.start_date} تا ${leave.end_date || leave.start_date}).`);
      }
    }
    const key = `load:${a.colleague_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      const open = openCardsOf(Number(a.colleague_id)).length;
      const capacity = Number(colleagues.find((c) => c.id == a.colleague_id)?.capacity) || OVERLOAD_THRESHOLD;
      if (open >= capacity) warnings.push(`${name} هم‌اکنون ${open.toLocaleString("fa-IR")} کار باز دارد (ظرفیت: ${capacity.toLocaleString("fa-IR")}).`);
    }
  }
  return warnings;
}

export function internalApprovalRequired() {
  return !!settings.workflow?.internal_approval_required;
}

export function latestVersion(card: any) {
  const versions = Array.isArray(card.review_versions) ? card.review_versions : [];
  return versions[versions.length - 1] || null;
}

/**
 * With internal approval switched on, a card may only go to the client after its
 * latest version was approved inside the studio (approvers themselves may skip it).
 */
export function canSendToClient(card: any, user: any) {
  if (!internalApprovalRequired()) return true;
  if (hasPermission(user, "approve_content")) return true;
  const v = latestVersion(card);
  return !!v && (v.internal?.status === "approved" || v.internal?.status === "skipped");
}

export const SEND_TO_CLIENT_BLOCKED = "این محتوا هنوز تایید داخلی نشده است. ابتدا نسخه را برای تایید داخلی ارسال کنید.";

export function revisionRounds(card: any) {
  return (card.review_versions || []).filter((v: any) => v.client?.status === "rejected").length;
}

function remindOnce(target: any, key: string, today: string) {
  if (target[key] === today) return false;
  target[key] = today;
  return true;
}

/**
 * Daily: reminds stage owners a day before and on the due date; overdue stages go
 * to the owner and the project manager, and to the admins after two days.
 */
export function checkStageDeadlines(today = todayJalali()) {
  let changed = false;
  for (const card of contents) {
    if (isFinished(card) || !card.stage_plan) continue;
    const done: string[] = card.completed_stages || [];
    for (const [stage, plan] of Object.entries<any>(card.stage_plan)) {
      if (!plan?.due_date || done.includes(stage) || !(card.stages || []).includes(stage)) continue;
      const days = jalaliDiffDays(today, plan.due_date);
      if (!Number.isFinite(days)) continue;
      if (days >= 0 && days <= 1 && plan.owner_id && remindOnce(plan, "reminded_on", today)) {
        addNotification(
          days === 0 ? "موعد امروز" : "موعد فردا",
          `مرحله «${stage}» محتوای "${card.title}" ${days === 0 ? "امروز" : "فردا"} (${plan.due_date}) باید تحویل شود.`,
          "colleague",
          plan.owner_id,
          "/my-projects",
          "stage_due",
          card.id,
        );
        changed = true;
      }
      if (days < 0 && remindOnce(plan, "overdue_notified_on", today)) {
        const late = (-days).toLocaleString("fa-IR");
        const owner = colleagueName(plan.owner_id) || "بدون مسئول";
        const text = `مرحله «${stage}» محتوای "${card.title}" (${owner}) ${late} روز از موعد ${plan.due_date} عقب است.`;
        if (plan.owner_id) addNotification("مرحله عقب افتاده", text, "colleague", plan.owner_id, "/my-projects", "stage_overdue", card.id);
        const pm = managerId(card);
        if (pm && pm != plan.owner_id) addNotification("ارجاع: مرحله عقب افتاده", text, "colleague", pm, "/depot", "stage_overdue", card.id);
        if (-days >= 2) addNotification("ارجاع به مدیریت: تاخیر در تولید", text, "admin", null, "/depot", "stage_overdue", card.id);
        changed = true;
      }
    }
  }
  return changed;
}

/** Shoots a colleague is on for a Jalali date (used by workload and ICS). */
export function shootsOn(colleagueId: any, date: string) {
  const d = normalizeJalaliDate(date);
  return shoots.filter(
    (s) => s.status !== "cancelled" && normalizeJalaliDate(s.date) === d && (s.crew || []).some((m: any) => m.colleague_id == colleagueId),
  );
}
