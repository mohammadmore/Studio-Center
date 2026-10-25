import express from "express";
import { audit_logs, notifications } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission } from "../../middleware/auth.js";
import { isAdmin } from "../../utils/authUtils.js";

const subRouter = express.Router();

function readerKey(user: any) {
  return user.role_id === "client" ? `org:${user.org_id ?? user.id}` : `user:${user.id}`;
}

function isVisibleTo(n: any, user: any) {
  if (user.role_id === "client") {
    const orgId = user.org_id ?? user.id;
    return n.role_target === "client" && n.user_id != null && n.user_id == orgId;
  }
  if (n.role_target === "colleague") return n.user_id == null || n.user_id == user.id;
  if (n.role_target === "admin") return isAdmin(user);
  // Legacy entries without a target were meant for the studio team.
  return !n.role_target;
}

function isRead(n: any, user: any) {
  // read_by tracks readers individually; older entries only have a shared status.
  if (Array.isArray(n.read_by)) return n.read_by.includes(readerKey(user));
  return n.status === "read";
}

subRouter.get("/get_logs", checkPermission("audit"), (req, res) => {
  res.json({ status: "success", data: audit_logs });
});

subRouter.get("/get_notifications", (req: any, res) => {
  const user = req.user;
  const visible = notifications
    .filter((n) => isVisibleTo(n, user))
    .reverse()
    .slice(0, 50)
    .map((n) => {
      const { read_by, ...rest } = n;
      return { ...rest, status: isRead(n, user) ? "read" : "unread" };
    });
  const unread_count = visible.filter((n) => n.status === "unread").length;
  res.json({ status: "success", notifications: visible, unread_count });
});

subRouter.post("/read_notifications", (req: any, res) => {
  const user = req.user;
  const key = readerKey(user);
  for (const n of notifications) {
    if (!isVisibleTo(n, user)) continue;
    if (!Array.isArray(n.read_by)) {
      if (n.status === "read") continue;
      n.read_by = [];
    }
    if (!n.read_by.includes(key)) n.read_by.push(key);
  }
  saveDatabase();
  res.json({ status: "success" });
});

export default subRouter;
