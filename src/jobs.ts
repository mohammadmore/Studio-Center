import { colleagues, invoices, leaves, notifications } from "./store/state.js";
import { saveDatabase } from "./store/db.js";
import { addNotification } from "./utils/logger.js";
import { normalizeJalaliDate, todayJalali } from "./utils/helpers.js";

/** Reminds admins and the client once a day about unpaid invoices past their due date. */
export function notifyOverdueInvoices(today = todayJalali()) {
  let changed = false;
  for (const inv of invoices) {
    if (inv.status === "paid" || inv.status === "cancelled") continue;
    const due = normalizeJalaliDate(inv.due_date);
    if (!due || due >= today) continue;
    const alreadyNotified = notifications.some(
      (n) => n.type === "invoice_overdue" && n.target_id === inv.id && n.notified_on === today,
    );
    if (alreadyNotified) continue;
    addNotification(
      "سررسید فاکتور",
      `مهلت پرداخت فاکتور ${inv.invoice_number} به پایان رسیده است.`,
      "admin",
      null,
      "/invoices_list",
      "invoice_overdue",
      inv.id,
    );
    addNotification(
      "یادآوری تسویه حساب",
      `مهلت پرداخت فاکتور شماره ${inv.invoice_number} به پایان رسیده است. لطفا نسبت به تسویه آن اقدام نمایید.`,
      "client",
      inv.org_id ?? null,
      "",
      "invoice_overdue",
      inv.id,
    );
    for (const n of notifications.slice(-2)) n.notified_on = today;
    changed = true;
  }
  return changed;
}

/** Marks colleagues "on_leave" while an approved leave is running and "active" again afterwards. */
export function syncLeaveStatuses(today = todayJalali()) {
  let changed = false;
  for (const colleague of colleagues) {
    if (colleague.is_active === 0) continue;
    if (colleague.status && colleague.status !== "active" && colleague.status !== "on_leave") continue;
    const onLeave = leaves.some(
      (l) =>
        l.user_id == colleague.id &&
        l.status === "approved" &&
        normalizeJalaliDate(l.start_date) <= today &&
        normalizeJalaliDate(l.end_date || l.start_date) >= today,
    );
    const status = onLeave ? "on_leave" : "active";
    if (colleague.status !== status) {
      colleague.status = status;
      changed = true;
    }
  }
  return changed;
}

export function startJobs() {
  const run = () => {
    try {
      const changed = [notifyOverdueInvoices(), syncLeaveStatuses()].some(Boolean);
      if (changed) saveDatabase();
    } catch (e) {
      console.error("Scheduled job failed:", e);
    }
  };
  const first = setTimeout(run, 10_000);
  const timer = setInterval(run, 60 * 60 * 1000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
