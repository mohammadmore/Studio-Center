import { audit_logs, notifications } from "../store/state.js";
import { nextId } from "./helpers.js";
import { emitNotification } from "./socket.js";
import { dispatchExternal } from "./notifiers.js";

const MAX_AUDIT_LOGS = 1000;
const MAX_NOTIFICATIONS = 1000;

const STATUS_NAMES: Record<string, string> = {
  raw: "ورودی خام",
  todo: "در صف",
  doing: "در حال انجام",
  in_progress: "در حال انجام",
  done: "تکمیل شده",
  review: "ارزیابی استودیو",
  client_review: "ارزیابی کارفرما",
  needs_revision: "نیاز به بازبینی",
  approved_by_client: "تایید کارفرما",
  ready_to_publish: "آماده انتشار",
  published: "منتشر شده",
  scheduled: "زمان‌بندی شده",
  archived: "آرشیو شده",
  pending: "در انتظار",
};

function persianTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function actorName(user: any) {
  if (!user) return "سیستم";
  if (typeof user === "string") return user;
  return user.username || user.full_name || "سیستم";
}

export function addAuditLog(user: any, action: string, ip?: string) {
  audit_logs.unshift({
    id: nextId(audit_logs),
    username: actorName(user),
    action,
    ip: ip || "127.0.0.1",
    created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
  });
  if (audit_logs.length > MAX_AUDIT_LOGS) audit_logs.splice(MAX_AUDIT_LOGS);
}

export function logContentActivity(card: any, req: any, actionDesc: string) {
  if (!card.activity_log) card.activity_log = [];
  const user = req?.session?.user;
  let action = actionDesc;
  for (const [key, value] of Object.entries(STATUS_NAMES)) {
    action = action.replace(new RegExp(`\\b${key}\\b`, "g"), value);
  }
  card.activity_log.unshift({
    user: user ? user.full_name || user.username : "سیستم",
    action,
    timestamp: persianTimestamp(),
  });
}

/**
 * role_target decides who sees the notification: "admin", "colleague" or "client".
 * user_id narrows it to one colleague (colleague id) or one brand (organisation id);
 * leave it null to notify everybody in the target group.
 */
export function addNotification(
  title: string,
  description: string,
  role_target: "admin" | "colleague" | "client",
  user_id: number | string | null = null,
  link = "",
  type = "general",
  target_id: any = null,
) {
  const notification = {
    id: nextId(notifications),
    title,
    description,
    status: "unread",
    read_by: [],
    created_at: persianTimestamp(),
    role_target,
    user_id: user_id === "" || user_id === undefined ? null : user_id,
    link,
    type,
    target_id,
  };
  notifications.push(notification);
  emitNotification(notification);
  dispatchExternal(notification);
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.splice(0, notifications.length - MAX_NOTIFICATIONS);
  }
  return notification;
}
