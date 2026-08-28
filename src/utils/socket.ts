import { Server as SocketIOServer } from "socket.io";
let io: SocketIOServer;

export function initSocket(server: any) {
  io = new SocketIOServer(server, { cors: { origin: "*" } });
  io.on("connection", (socket) => {
    socket.on("disconnect", () => {});
  });
  return io;
}

export function getIO() {
  if (!io) {
    console.warn("Socket.io not initialized");
  }
  return io;
}
