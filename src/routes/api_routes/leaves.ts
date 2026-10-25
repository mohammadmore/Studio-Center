import express from "express";
import { colleagues, contents, leaves } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission } from "../../middleware/auth.js";
import { isAdmin } from "../../utils/authUtils.js";
import { addNotification } from "../../utils/logger.js";
import { nextId, normalizeJalaliDate, toInt, todayJalali } from "../../utils/helpers.js";
import { syncLeaveStatuses } from "../../jobs.js";

const subRouter = express.Router();
const LEAVE_STATUSES = ["pending", "approved", "rejected"];

/** Hands the work of a colleague on leave over to the substitute. */
function reassignToSubstitute(leave: any) {
  const colleague = colleagues.find((c) => c.id == leave.user_id);
  const sub = colleagues.find((c) => c.id == leave.substitute_id);
  if (!colleague || !sub) return;
  const matches = (ref: unknown) =>
    ref === colleague.full_name || ref == colleague.id || ref === colleague.username;
  contents.forEach((c) => {
    if (c.status === "published" || c.status === "archived") return;
    if (matches(c.project_manager)) c.project_manager = sub.full_name;
    if (Array.isArray(c.assigned_colleagues)) {
      c.assigned_colleagues = Array.from(
        new Set(c.assigned_colleagues.map((ref: unknown) => (matches(ref) ? sub.full_name : ref))),
      );
    }
  });
}

subRouter.get("/get_leaves", checkPermission("leaves"), (req: any, res) => {
  const sessionUser = req.user;
  const admin = isAdmin(sessionUser);
  const userLeaves = admin ? leaves : leaves.filter((l) => l.user_id == sessionUser.id);
  const today = todayJalali();
  const isHistory = req.query.type === "history";
  let filtered = userLeaves.filter((l) => {
    const end = normalizeJalaliDate(l.end_date || l.start_date);
    return isHistory ? end < today : end >= today;
  });
  filtered.sort((a, b) =>
    normalizeJalaliDate(b.start_date).localeCompare(normalizeJalaliDate(a.start_date)),
  );
  const page = Math.max(1, toInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit) || 20));
  const total = filtered.length;
  if (isHistory) filtered = filtered.slice((page - 1) * limit, page * limit);

  const data = filtered.map((l) => {
    const user = colleagues.find((c) => c.id == l.user_id);
    const sub = colleagues.find((c) => c.id == l.substitute_id);
    return {
      ...l,
      user_name: user ? user.full_name : "نامشخص",
      substitute_name: sub ? sub.full_name : "بدون جانشین",
    };
  });
  res.json({ status: "success", data, isAdmin: admin, total, page, limit });
});

subRouter.post("/update_leave", checkPermission("leaves"), (req: any, res) => {
  const { id, status } = req.body;
  if (!isAdmin(req.user)) {
    return res.status(403).json({ status: "error", message: "فقط مدیر می‌تواند وضعیت مرخصی را تغییر دهد." });
  }
  if (!LEAVE_STATUSES.includes(status)) {
    return res.status(400).json({ status: "error", message: "وضعیت نامعتبر است." });
  }
  const leave = leaves.find((l) => l.id == id);
  if (!leave) return res.status(404).json({ status: "error", message: "مرخصی یافت نشد." });
  const wasApproved = leave.status === "approved";
  leave.status = status;
  if (status === "approved" && !wasApproved && leave.substitute_id) reassignToSubstitute(leave);
  syncLeaveStatuses();
  addNotification(
    "وضعیت درخواست مرخصی",
    `درخواست مرخصی شما (${leave.start_date} تا ${leave.end_date}) ${status === "approved" ? "تایید شد" : status === "rejected" ? "رد شد" : "در انتظار بررسی است"}.`,
    "colleague",
    leave.user_id,
    "/leaves",
    "leave",
    leave.id,
  );
  saveDatabase();
  res.json({ status: "success", message: "وضعیت مرخصی بروزرسانی شد." });
});

subRouter.post("/delete_leave", checkPermission("leaves"), (req: any, res) => {
  const idx = leaves.findIndex((l) => l.id == req.body.id);
  if (idx === -1) return res.status(404).json({ status: "error", message: "یافت نشد" });
  const leave = leaves[idx];
  if (!isAdmin(req.user) && leave.user_id != req.user.id) {
    return res.status(403).json({ status: "error", message: "دسترسی ندارید" });
  }
  // Colleagues may withdraw a request only while it hasn't been decided.
  if (!isAdmin(req.user) && leave.status !== "pending") {
    return res.status(403).json({ status: "error", message: "مرخصی بررسی‌شده قابل حذف نیست" });
  }
  leaves.splice(idx, 1);
  syncLeaveStatuses();
  saveDatabase();
  res.json({ status: "success", message: "مرخصی با موفقیت حذف شد." });
});

subRouter.post("/save_leave", checkPermission("leaves"), (req: any, res) => {
  const userId = toInt(req.body.user_id);
  if (!userId || !colleagues.some((c) => c.id == userId)) {
    return res.status(400).json({ status: "error", message: "همکار متقاضی نامعتبر است." });
  }
  if (userId != req.user.id && !isAdmin(req.user)) {
    return res.status(403).json({ status: "error", message: "شما فقط می‌توانید برای خود مرخصی ثبت کنید" });
  }
  const today = todayJalali();
  const start = normalizeJalaliDate(req.body.start_date) || today;
  const end = normalizeJalaliDate(req.body.end_date) || start;
  if (end < start) {
    return res.status(400).json({ status: "error", message: "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد." });
  }
  const subId = toInt(req.body.substitute_id);
  if (subId && subId == userId) {
    return res.status(400).json({ status: "error", message: "جانشین نمی‌تواند خود متقاضی باشد." });
  }
  const overlaps = leaves.some(
    (l) =>
      l.user_id == userId &&
      l.status !== "rejected" &&
      normalizeJalaliDate(l.start_date) <= end &&
      normalizeJalaliDate(l.end_date || l.start_date) >= start,
  );
  if (overlaps) {
    return res.status(400).json({ status: "error", message: "برای این بازه قبلا مرخصی ثبت شده است." });
  }
  leaves.push({
    id: nextId(leaves),
    user_id: userId,
    substitute_id: subId && colleagues.some((c) => c.id == subId) ? subId : 0,
    start_date: start,
    end_date: end,
    status: "pending",
    created_at: new Date().toISOString(),
  });
  const applicant = colleagues.find((c) => c.id == userId);
  addNotification(
    "درخواست مرخصی جدید",
    `${applicant?.full_name || "همکار"} برای ${start} تا ${end} درخواست مرخصی ثبت کرد.`,
    "admin",
    null,
    "/leaves",
    "leave",
  );
  saveDatabase();
  return res.json({
    status: "success",
    message: "درخواست مرخصی شما با موفقیت ثبت شد و در انتظار تایید مدیریت است.",
  });
});

export default subRouter;
