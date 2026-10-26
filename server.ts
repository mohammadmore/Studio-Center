import { createServer, type Server } from "http";
import { config } from "./src/config.js";
import { createApp } from "./src/app.js";
import { closeDatabase, initDatabase } from "./src/store/db.js";
import { startJobs } from "./src/jobs.js";
import { initSocket } from "./src/utils/socket.js";

/**
 * Behind a proxy that strips the sub-path, requests arrive as "/depot". Socket.IO
 * only listens on "<base>/socket.io", so every request gets the prefix back
 * before anything else sees it (Express removes it again).
 */
function addBasePathToRequests(server: Server) {
  const base = config.basePath;
  if (!base) return;
  for (const event of ["request", "upgrade"] as const) {
    const listeners = server.listeners(event).slice() as ((...args: any[]) => void)[];
    server.removeAllListeners(event);
    server.on(event, (req: any, ...rest: any[]) => {
      const url = String(req.url || "/");
      if (!(url === base || url.startsWith(base + "/") || url.startsWith(base + "?"))) {
        req.url = base + (url.startsWith("/") ? url : "/" + url);
      }
      for (const listener of listeners) listener.call(server, req, ...rest);
    });
  }
}

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! Shutting down...", err);
  closeDatabase().finally(() => process.exit(1));
});

async function main() {
  // The data must be loaded before any request is served, otherwise the first
  // write would replace the stored database with an empty one.
  await initDatabase();

  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);
  addBasePathToRequests(httpServer);
  const stopJobs = startJobs();

  // Passenger (cPanel) passes a socket path or port through PORT.
  const port = process.env.PORT && isNaN(Number(process.env.PORT)) ? process.env.PORT : config.port;
  httpServer.listen(port as any, () => {
    console.log(`Server running on port ${port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, saving data and shutting down...`);
    stopJobs();
    httpServer.close();
    closeDatabase()
      .catch((e) => console.error("Error while saving on shutdown:", e))
      .finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("FATAL: could not start the server:", err);
  process.exit(1);
});
