import { Server as SocketIOServer } from "socket.io";
import { sessionMiddleware } from "../middleware/session.js";
import { loadSessionUser } from "../middleware/auth.js";

let io: SocketIOServer | null = null;
const STAFF_ROOM = "staff";

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
        if (!req.user || req.user.role_id === "client") {
          return next(new Error("unauthorized"));
        }
        next();
      });
    });
  });
  io.on("connection", (socket) => {
    socket.join(STAFF_ROOM);
  });
  return io;
}

/** Broadcasts a content change to logged-in studio staff only. */
export function emitToStaff(event: string, payload: any) {
  io?.to(STAFF_ROOM).emit(event, payload);
}
