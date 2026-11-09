import { colleagues, invoices, leaves, notifications } from "./store/state.js";
import { saveDatabase } from "./store/db.js";
import { addNotification } from "./utils/logger.js";
import { normalizeJalaliDate, todayJalali } from "./utils/helpers.js";
import { checkStageDeadlines } from "./utils/workflowUtils.js";
import { refreshRecentStats } from "./utils/stats.js";
import { cleanupStaleUploads } from "./routes/api_routes/uploads.js";
import { autoSendMonthlyReports } from "./routes/api_routes/integrations.js";
import { organizations, roles, settings } from "./store/state.js";
import { getBlobStore } from "./store/db.js";
import { shrinkExistingImages, type ImagePurpose } from "./utils/images.js";
import { mimeForFile } from "./utils/files.js";
import { runDailyBackup } from "./utils/backups.js";

const IMAGE_PASS = "v1";

/** Shrinks avatars, logos and icons uploaded before images were optimised (runs once). */
export async function shrinkOldImages() {
  if (settings.images_optimized === IMAGE_PASS) return false;
  const refs: { url: unknown; purpose: ImagePurpose }[] = [];
  for (const c of colleagues) refs.push({ url: c.avatar_url, purpose: "avatar" });
  for (const r of roles) {
    refs.push({ url: r.default_male_avatar, purpose: "avatar" }, { url: r.default_female_avatar, purpose: "avatar" });
  }
  for (const o of organizations) refs.push({ url: o.logo_url, purpose: "logo" });
  const info = settings.studio_info || {};
  for (const key of Object.keys(info)) if (/^logo/.test(key)) refs.push({ url: info[key], purpose: "logo" });
  for (const p of Array.isArray(settings.platform) ? settings.platform : []) refs.push({ url: p?.logo_url, purpose: "icon" });
  const saved = await shrinkExistingImages(refs, getBlobStore() as any, mimeForFile);
  if (saved < 0) return false; // sharp is not available; try again after it is installed
  settings.images_optimized = IMAGE_PASS;
  if (saved > 0) console.log(`Shrunk existing pictures, saved ${Math.round(saved / 1024)} KB`);
  return true;
}

/** Reminds admins and the client once a day about unpaid invoices past their due date. */
export function notifyOverdueInvoices(today = todayJalali()) {
  let changed = false;
  for (const inv of invoices) {
    if (inv.status === "paid" || inv.status === "cancelled" || inv.doc_type === "quote") continue;
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
  let statsRunOn = "";
  const run = () => {
    try {
      const changed = [
        notifyOverdueInvoices(),
        syncLeaveStatuses(),
        checkStageDeadlines(),
        autoSendMonthlyReports(),
      ].some(Boolean);
      if (changed) saveDatabase();
      cleanupStaleUploads();
      const backup = runDailyBackup();
      if (backup) console.log(`Daily backup written: ${backup.name}`);
    } catch (e) {
      console.error("Scheduled job failed:", e);
    }
    // Post statistics are refreshed once a day, at night (Tehran time).
    const today = todayJalali();
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Tehran" }).format(new Date()));
    if (statsRunOn !== today && hour >= 2 && hour < 6) {
      statsRunOn = today;
      refreshRecentStats()
        .then((n) => {
          if (n) saveDatabase();
        })
        .catch((e) => console.error("Stats refresh failed:", e));
    }
  };
  const first = setTimeout(() => {
    shrinkOldImages()
      .then((changed) => {
        if (changed) saveDatabase();
      })
      .catch((e) => console.error("Image pass failed:", e));
    run();
  }, 10_000);
  const timer = setInterval(run, 60 * 60 * 1000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
