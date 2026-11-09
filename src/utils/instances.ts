import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { addNotification } from "./logger.js";
import { notifications } from "../store/state.js";

/**
 * The app keeps its data in memory and must run as ONE process. Some hosts (cPanel /
 * Passenger) may start several copies under load; each then holds its own data, so a change
 * made in one (a new password, a moved card) is unknown to the others and the last one to
 * save overwrites the rest. Every process writes a heartbeat file; when more than one is
 * alive, admins are warned once a day and the log says so.
 */
const BEAT_MS = 20_000;
const ALIVE_MS = 60_000;

function runDir() {
  return path.join(config.dataDir, "run");
}

export function aliveInstances() {
  const now = Date.now();
  let alive = 0;
  try {
    for (const name of fs.readdirSync(runDir())) {
      if (!/^instance-\d+\.json$/.test(name)) continue;
      const file = path.join(runDir(), name);
      try {
        const beat = JSON.parse(fs.readFileSync(file, "utf8")).beat;
        if (now - beat < ALIVE_MS) alive++;
        else fs.unlinkSync(file);
      } catch {
        /* half-written or removed meanwhile */
      }
    }
  } catch {
    return 1;
  }
  return Math.max(alive, 1);
}

export function startInstanceWatch() {
  const file = path.join(runDir(), `instance-${process.pid}.json`);
  const started = new Date().toISOString();
  let warnedOn = "";
  const beat = () => {
    try {
      fs.mkdirSync(runDir(), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, started, beat: Date.now() }));
    } catch {
      return;
    }
    const count = aliveInstances();
    const today = new Date().toISOString().slice(0, 10);
    if (count > 1 && warnedOn !== today) {
      warnedOn = today;
      console.warn(`WARNING: ${count} copies of the app are running on the same data. Run it as a single process.`);
      const already = notifications.some((n) => n.type === "system_instances" && String(n.created_at || "").length && n.description?.includes(today));
      if (!already) {
        addNotification(
          "چند نسخه از برنامه هم‌زمان اجرا می‌شود",
          `${count.toLocaleString("fa-IR")} نسخه از برنامه روی یک داده در حال اجراست (${today}). هر نسخه داده‌ها را جدا در حافظه نگه می‌دارد؛ برای همین ممکن است تغییری (مثلاً رمز جدید) در یک نسخه دیده نشود یا تغییرات هم را پاک کنند. در cPanel برنامه را Stop و دوباره Start کنید و تنظیم هاست را طوری بگذارید که فقط یک نسخه اجرا شود (راهنما: DEPLOY.md).`,
          "admin",
          null,
          "",
          "system_instances",
        );
      }
    }
  };
  beat();
  const timer = setInterval(beat, BEAT_MS);
  timer.unref();
  const cleanup = () => {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  };
  process.once("exit", cleanup);
  return () => {
    clearInterval(timer);
    cleanup();
  };
}
