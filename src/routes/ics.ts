import express from "express";
import * as jalaali from "jalaali-js";
import { colleagues, contents, organizations, shoots } from "../store/state.js";
import { normalizeJalaliDate } from "../utils/helpers.js";
import { cardColleagueIds } from "../utils/contentUtils.js";
import { isFinished } from "../utils/workflowUtils.js";

/**
 * Calendar subscription feeds (Google Calendar, Apple Calendar, Outlook...). The
 * secret token in the URL is the only credential, since calendar apps can't log in.
 */
const icsRouter = express.Router();

function gregorian(jalaliDate: string) {
  const d = normalizeJalaliDate(jalaliDate);
  if (!d) return null;
  const [jy, jm, jd] = d.split("/").map(Number);
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return `${gy}${String(gm).padStart(2, "0")}${String(gd).padStart(2, "0")}`;
}

function nextDay(ymd: string) {
  const date = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + 1));
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeText(s: unknown) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets must be folded (RFC 5545). */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, "utf8") > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

interface CalEvent {
  uid: string;
  date: string;
  time?: string;
  end?: string;
  title: string;
  description?: string;
  location?: string;
}

function render(name: string, events: CalEvent[]) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Asva Studio//Content Calendar//FA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Asia/Tehran",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tehran",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0330",
    "TZOFFSETTO:+0330",
    "TZNAME:IRST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const e of events) {
    const day = gregorian(e.date);
    if (!day) continue;
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@asva`, `DTSTAMP:${stamp}`);
    const t = /^(\d{1,2}):(\d{2})/.exec(e.time || "");
    if (t) {
      const start = `${day}T${t[1].padStart(2, "0")}${t[2]}00`;
      const et = /^(\d{1,2}):(\d{2})/.exec(e.end || "");
      const end = et ? `${day}T${et[1].padStart(2, "0")}${et[2]}00` : null;
      lines.push(`DTSTART;TZID=Asia/Tehran:${start}`);
      if (end && end > start) lines.push(`DTEND;TZID=Asia/Tehran:${end}`);
      else lines.push("DURATION:PT1H");
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${nextDay(day)}`);
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function colleagueEvents(c: any): CalEvent[] {
  const events: CalEvent[] = [];
  for (const card of contents) {
    if (card.status === "archived") continue;
    const mine = cardColleagueIds(card).includes(c.id);
    if (mine && card.publish_date) {
      events.push({
        uid: `pub-${card.id}`,
        date: card.publish_date,
        time: card.publish_time,
        title: `📢 انتشار: ${card.title}`,
        description: `${card.content_type || ""} — ${(card.publish_platforms || []).join("، ")}`,
      });
    }
    if (isFinished(card)) continue;
    for (const [stage, plan] of Object.entries<any>(card.stage_plan || {})) {
      if (plan?.owner_id != c.id || !plan.due_date || (card.completed_stages || []).includes(stage)) continue;
      events.push({ uid: `stage-${card.id}-${Buffer.from(stage).toString("hex").slice(0, 40)}`, date: plan.due_date, title: `⏰ ${stage}: ${card.title}` });
    }
  }
  for (const s of shoots) {
    if (s.status === "cancelled" || !(s.crew || []).some((m: any) => m.colleague_id == c.id)) continue;
    events.push({ uid: `shoot-${s.id}`, date: s.date, time: s.call_time || s.start_time, end: s.end_time, title: `🎬 ${s.title}`, location: s.location, description: s.notes });
  }
  return events;
}

function orgEvents(o: any): CalEvent[] {
  const events: CalEvent[] = [];
  for (const card of contents) {
    if (card.org_id != o.id || card.status === "archived" || !card.publish_date) continue;
    events.push({
      uid: `pub-${card.id}`,
      date: card.publish_date,
      time: card.publish_time,
      title: `📢 ${card.title}`,
      description: `${card.content_type || ""} — ${(card.publish_platforms || []).join("، ")}`,
    });
  }
  for (const s of shoots) {
    if (s.org_id != o.id || s.status === "cancelled") continue;
    events.push({ uid: `shoot-${s.id}`, date: s.date, time: s.call_time || s.start_time, end: s.end_time, title: `🎬 تصویربرداری: ${s.title}`, location: s.location });
  }
  return events;
}

icsRouter.get("/ics/:token.ics", (req, res) => {
  const token = String(req.params.token || "");
  if (token.length < 20) return res.status(404).send("Not found");
  const c = colleagues.find((x) => x.ics_token === token && x.is_active !== 0);
  const o = c ? null : organizations.find((x) => x.ics_token === token && x.is_active !== 0);
  if (!c && !o) return res.status(404).send("Not found");
  const body = c ? render(`تقویم کاری ${c.full_name || c.username}`, colleagueEvents(c)) : render(`تقویم محتوای ${o.org_name}`, orgEvents(o));
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=900");
  res.send(body);
});

export default icsRouter;
