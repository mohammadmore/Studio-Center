import { Server as SocketIOServer } from "socket.io";
import { sessionMiddleware } from "../middleware/session.js";
import { loadSessionUser } from "../middleware/auth.js";
import { isAdmin } from "./authUtils.js";

let io: SocketIOServer | null = null;
const STAFF_ROOM = "staff";
const ADMIN_ROOM = "admins";

export function initSocket(server: any) {
  // Same-origin only: the pages are served by this server.
  io = new SocketIOServer(server);
  const session = sessionMiddleware();
  io.use((socket, next) => {
    const req: any = socket.request;
    const res: any = { setHeader() {}, getHeader() {}, writeHead() {}, end() {} };
    session(req, res, (err?: any) => {
      if (err) return next(err);
      loadSessionUser(req, res, () => {
        if (!req.user) return next(new Error("unauthorized"));
        next();
      });
    });
  });
  io.on("connection", (socket) => {
    const req: any = socket.request;
    const user = req.user;
    if (user.role_id === "client") {
      // Clients only receive their own organisation's notifications.
      socket.join(`org:${req.account?.id ?? user.org_id ?? user.id}`);
      return;
    }
    socket.join(STAFF_ROOM);
    socket.join(`user:${user.id}`);
    if (isAdmin(user)) socket.join(ADMIN_ROOM);
  });
  return io;
}

/** Broadcasts a content change to logged-in studio staff only. */
export function emitToStaff(event: string, payload: any) {
  io?.to(STAFF_ROOM).emit(event, payload);
}

/** Pushes a new notification to whoever it is meant for. */
export function emitNotification(n: any) {
  if (!io) return;
  const payload = { id: n.id, title: n.title, description: n.description, link: n.link, type: n.type };
  if (n.role_target === "admin") io.to(ADMIN_ROOM).emit("notification", payload);
  else if (n.role_target === "colleague") {
    io.to(n.user_id != null ? `user:${n.user_id}` : STAFF_ROOM).emit("notification", payload);
  } else if (n.role_target === "client" && n.user_id != null) {
    io.to(`org:${n.user_id}`).emit("notification", payload);
  }
}
