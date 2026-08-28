import { audit_logs, contents, notifications } from "../store/state.js";

export function addAuditLog(username: string, action: string, ip: string) {
  audit_logs.unshift({
    id: audit_logs.length > 0 ? Math.max(...audit_logs.map((x) => x.id)) + 1 : 1,
    username,
    action,
    ip,
    created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
  });
  if (audit_logs.length > 1000) {
    audit_logs.splice(1000);
  }
}

export function logContentActivity(card: any, req: any, actionDesc: string) {
  if (!card.activity_logs) {
    card.activity_logs = [];
  }
  card.activity_logs.push({
    action: actionDesc,
    user: req.session?.user?.full_name || req.session?.user?.username || "سیستم",
    timestamp: new Date().toISOString(),
  });
}

export function addNotification(
  targetUserId: string | null,
  targetOrgId: string | null,
  title: string,
  message: string,
  type: string = "info",
) {
  notifications.unshift({
    id: notifications.length > 0 ? Math.max(...notifications.map((x) => x.id)) + 1 : 1,
    target_user_id: targetUserId,
    target_org_id: targetOrgId,
    title,
    message,
    type,
    is_read: false,
    created_at: new Date().toISOString(),
  });
  if (notifications.length > 500) {
    notifications.splice(500);
  }
}
