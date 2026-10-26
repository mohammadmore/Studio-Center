import nodemailer from "nodemailer";
import { colleagues, integrations, organizations, outbox } from "../store/state.js";
import { isAdmin } from "./authUtils.js";
import { nextId } from "./helpers.js";

/**
 * Forwards in-app notifications to SMS, e-mail, Telegram and Bale, so people who
 * are not logged in (clients above all) still hear about approvals and deadlines.
 */

export type Channel = "sms" | "email" | "telegram" | "bale";
export const CHANNELS: Channel[] = ["sms", "email", "telegram", "bale"];

// Notification types forwarded by default; the rest stay in-app only.
export const DEFAULT_EVENTS = [
  "client_review",
  "request_new",
  "request_update",
  "stage_handoff",
  "stage_due",
  "stage_overdue",
  "internal_review",
  "review_result",
  "delivery",
  "quote_sent",
  "invoice_overdue",
  "assignment",
  "mention",
  "shoot_assigned",
  "monthly_report",
];

export const EVENT_LABELS: Record<string, string> = {
  client_review: "ارسال محتوا برای تایید کارفرما",
  request_new: "ثبت درخواست / بریف جدید",
  request_update: "تغییر وضعیت درخواست",
  stage_handoff: "تحویل مرحله به نفر بعد",
  stage_due: "یادآوری موعد مرحله",
  stage_overdue: "عقب‌افتادن مرحله (ارجاع به مدیر)",
  internal_review: "درخواست تایید داخلی",
  review_result: "نتیجه بازبینی کارفرما",
  delivery: "تحویل فایل نهایی",
  quote_sent: "ارسال پیش‌فاکتور",
  invoice_overdue: "سررسید فاکتور",
  assignment: "ارجاع کار جدید",
  mention: "اشاره در نظرات",
  shoot_assigned: "برنامه تصویربرداری",
  monthly_report: "گزارش ماهانه کارفرما",
};

const SECRET_FIELDS = ["api_key", "pass", "bot_token"];
const MAX_OUTBOX = 2000;
const TIMEOUT_MS = 10_000;

export function getIntegrationConfig(): any {
  if (!integrations[0]) {
    integrations.push({
      id: 1,
      base_url: "",
      events: [...DEFAULT_EVENTS],
      sms: { enabled: false, provider: "kavenegar", api_key: "", sender: "", webhook_url: "" },
      email: { enabled: false, host: "", port: 465, secure: true, user: "", pass: "", from: "" },
      telegram: { enabled: false, bot_token: "" },
      bale: { enabled: false, bot_token: "" },
    });
  }
  return integrations[0];
}

function mask(value: unknown) {
  const s = String(value || "");
  return s ? `••••${s.slice(-4)}` : "";
}

/** The config with secrets masked, safe to send to the browser. */
export function publicIntegrationConfig() {
  const cfg = JSON.parse(JSON.stringify(getIntegrationConfig()));
  for (const ch of CHANNELS) {
    for (const f of SECRET_FIELDS) if (cfg[ch] && f in cfg[ch]) cfg[ch][f] = mask(cfg[ch][f]);
  }
  return cfg;
}

/** Applies an edit from the settings page; masked secrets mean "keep the old value". */
export function updateIntegrationConfig(input: any) {
  const cfg = getIntegrationConfig();
  if (typeof input?.base_url === "string") cfg.base_url = input.base_url.trim().replace(/\/+$/, "");
  if (Array.isArray(input?.events)) cfg.events = input.events.filter((e: any) => typeof e === "string");
  for (const ch of CHANNELS) {
    const src = input?.[ch];
    if (!src || typeof src !== "object") continue;
    for (const [key, value] of Object.entries(src)) {
      if (!(key in cfg[ch])) continue;
      if (SECRET_FIELDS.includes(key) && typeof value === "string" && value.startsWith("••••")) continue;
      if (typeof cfg[ch][key] === "boolean") cfg[ch][key] = value === true || value === "true" || value === 1;
      else if (typeof cfg[ch][key] === "number") cfg[ch][key] = Number(value) || cfg[ch][key];
      else cfg[ch][key] = String(value ?? "").trim();
    }
  }
  return cfg;
}

export interface Recipient {
  name: string;
  phone?: string;
  email?: string;
  telegram?: string;
  bale?: string;
  optOut: string[];
}

function firstEmail(list: unknown) {
  if (!Array.isArray(list)) return typeof list === "string" ? list : "";
  for (const e of list) {
    const value = typeof e === "string" ? e : e?.email || e?.address || e?.value;
    if (value) return String(value);
  }
  return "";
}

function colleagueRecipient(c: any): Recipient {
  return {
    name: c.full_name || c.username,
    phone: c.phone,
    email: c.email,
    telegram: c.telegram_chat_id,
    bale: c.bale_chat_id,
    optOut: Array.isArray(c.notify_opt_out) ? c.notify_opt_out : [],
  };
}

function orgRecipient(o: any): Recipient {
  return {
    name: o.contact_name || o.org_name,
    phone: o.phone_number,
    email: firstEmail(o.emails),
    telegram: o.telegram_chat_id,
    bale: o.bale_chat_id,
    optOut: Array.isArray(o.notify_opt_out) ? o.notify_opt_out : [],
  };
}

export function recipientsFor(n: any): Recipient[] {
  const active = (c: any) => c.is_active !== 0 && c.is_active !== false;
  if (n.role_target === "admin") {
    return colleagues.filter((c) => active(c) && isAdmin(c)).map(colleagueRecipient);
  }
  if (n.role_target === "colleague" && n.user_id != null) {
    const c = colleagues.find((x) => x.id == n.user_id && active(x));
    return c ? [colleagueRecipient(c)] : [];
  }
  if (n.role_target === "client" && n.user_id != null) {
    const o = organizations.find((x) => x.id == n.user_id);
    return o ? [orgRecipient(o)] : [];
  }
  return [];
}

function normalizePhone(phone: unknown) {
  const digits = String(phone || "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d+]/g, "");
  return digits.length >= 8 ? digits : "";
}

async function postJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

async function sendSms(cfg: any, to: string, text: string) {
  if (cfg.sms.provider === "webhook") {
    if (!cfg.sms.webhook_url) throw new Error("آدرس وب‌هوک پیامک تنظیم نشده است");
    await postJson(cfg.sms.webhook_url, { to, message: text, sender: cfg.sms.sender });
    return;
  }
  if (!cfg.sms.api_key) throw new Error("کلید API پیامک تنظیم نشده است");
  const params = new URLSearchParams({ receptor: to, message: text });
  if (cfg.sms.sender) params.set("sender", cfg.sms.sender);
  const res = await fetch(
    `https://api.kavenegar.com/v1/${encodeURIComponent(cfg.sms.api_key)}/sms/send.json?${params}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function sendBot(api: string, token: string, chatId: string, text: string) {
  if (!token) throw new Error("توکن ربات تنظیم نشده است");
  await postJson(`${api}/bot${token}/sendMessage`, { chat_id: chatId, text });
}

async function sendEmail(cfg: any, to: string, subject: string, text: string) {
  const e = cfg.email;
  if (!e.host || !e.from) throw new Error("تنظیمات SMTP کامل نیست");
  const transport = nodemailer.createTransport({
    host: e.host,
    port: Number(e.port) || 465,
    secure: !!e.secure,
    auth: e.user ? { user: e.user, pass: e.pass } : undefined,
    connectionTimeout: TIMEOUT_MS,
  });
  await transport.sendMail({ from: e.from, to, subject, text });
}

function record(entry: any) {
  outbox.unshift({ id: nextId(outbox), at: new Date().toISOString(), ...entry });
  if (outbox.length > MAX_OUTBOX) outbox.splice(MAX_OUTBOX);
}

export async function sendOne(channel: Channel, to: string, title: string, text: string) {
  const cfg = getIntegrationConfig();
  try {
    if (channel === "sms") await sendSms(cfg, to, `${title}\n${text}`);
    else if (channel === "email") await sendEmail(cfg, to, title, text);
    else if (channel === "telegram") await sendBot("https://api.telegram.org", cfg.telegram.bot_token, to, `${title}\n${text}`);
    else if (channel === "bale") await sendBot("https://tapi.bale.ai", cfg.bale.bot_token, to, `${title}\n${text}`);
    record({ channel, to, title, status: "sent" });
    return { ok: true as const };
  } catch (e: any) {
    const error = String(e?.message || e).slice(0, 300);
    record({ channel, to, title, status: "failed", error });
    return { ok: false as const, error };
  }
}

/** Which channel/address pairs a notification would go to (also used by tests). */
export function plannedDeliveries(n: any) {
  const cfg = getIntegrationConfig();
  if (!(cfg.events || []).includes(n.type)) return [];
  const out: { channel: Channel; to: string }[] = [];
  for (const r of recipientsFor(n)) {
    const add = (channel: Channel, to: unknown) => {
      if (cfg[channel]?.enabled && to && !r.optOut.includes(channel)) out.push({ channel, to: String(to) });
    };
    add("sms", normalizePhone(r.phone));
    add("email", r.email && /@/.test(r.email) ? r.email.trim() : "");
    add("telegram", r.telegram);
    add("bale", r.bale);
  }
  return out;
}

let queue: Promise<unknown> = Promise.resolve();

/** Sends a notification through the enabled channels in the background. */
export function dispatchExternal(n: any) {
  const deliveries = plannedDeliveries(n);
  if (!deliveries.length) return;
  const cfg = getIntegrationConfig();
  const link = n.link ? `${cfg.base_url || ""}${String(n.link).startsWith("/") ? "" : "/"}${n.link}` : "";
  const text = [n.description, link && cfg.base_url ? link : ""].filter(Boolean).join("\n");
  for (const d of deliveries) {
    queue = queue.then(() => sendOne(d.channel, d.to, n.title, text)).catch(() => undefined);
  }
}
