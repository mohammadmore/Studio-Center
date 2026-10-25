import * as jalaali from "jalaali-js";

/** Next numeric id for a collection (no spread, so it works for any array size). */
export function nextId(items: any[]) {
  let max = 0;
  for (const item of items) {
    const id = Number(item?.id);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return Math.floor(max) + 1;
}

export function toLatinDigits(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Normalises a Jalali date such as "۱۴۰۵/۲/۵" or "1405-02-05" to "1405/02/05" so
 * dates compare correctly as strings. Returns "" for anything else.
 */
export function normalizeJalaliDate(value: unknown) {
  const match = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(toLatinDigits(value).trim());
  if (!match) return "";
  return `${match[1]}/${match[2].padStart(2, "0")}/${match[3].padStart(2, "0")}`;
}

export function todayJalali(date = new Date()) {
  const j = jalaali.toJalaali(date);
  return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
}

export function addDaysToJalali(dateStr: string, days: number) {
  const normalized = normalizeJalaliDate(dateStr);
  if (!normalized) return dateStr;
  const [jy, jm, jd] = normalized.split("/").map(Number);
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  const dateObj = new Date(gy, gm - 1, gd);
  dateObj.setDate(dateObj.getDate() + days);
  return todayJalali(dateObj);
}

/** Days from `a` to `b` (both Jalali dates); NaN if either is invalid. */
export function jalaliDiffDays(a: string, b: string) {
  const na = normalizeJalaliDate(a);
  const nb = normalizeJalaliDate(b);
  if (!na || !nb) return NaN;
  const toTime = (s: string) => {
    const [jy, jm, jd] = s.split("/").map(Number);
    const g = jalaali.toGregorian(jy, jm, jd);
    return Date.UTC(g.gy, g.gm - 1, g.gd);
  };
  return Math.round((toTime(nb) - toTime(na)) / 86400000);
}

export function toPersianDigits(num: string | number) {
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return num.toString().replace(/\d/g, (x) => persianDigits[parseInt(x)]);
}

export function toInt(value: unknown): number | null {
  const n = parseInt(toLatinDigits(value), 10);
  return Number.isFinite(n) ? n : null;
}

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%]+\)|var\(--[a-z0-9-]+\)|[a-z]{3,20})$/i;

/** Colors end up inside inline styles; anything that isn't a plain color is dropped. */
export function safeColor(value: unknown, fallback = "#6366F1") {
  const color = String(value ?? "").trim();
  return SAFE_COLOR.test(color) ? color : fallback;
}

const UNSAFE_MARKUP =
  /<\s*\/?\s*(script|foreignobject|iframe|object|embed|style|link|meta|a|image|use|animate|set)\b|\bon[a-z]+\s*=|javascript:|data:text|href\s*=/i;

/**
 * Icons are rendered as HTML. Plain text / emoji is kept, inline SVG only when it
 * contains nothing that can run script; anything else is dropped.
 */
export function sanitizeIcon(value: unknown) {
  const icon = String(value ?? "").trim().slice(0, 5000);
  if (!icon.includes("<")) return icon;
  if (/^<svg[\s>][\s\S]*<\/svg>$/i.test(icon) && !UNSAFE_MARKUP.test(icon)) return icon;
  return "";
}

/** Keeps only URLs that are safe to put into src/href: http(s), our uploads, or inline images. */
export function safeUrl(value: unknown) {
  const url = String(value ?? "").trim();
  return /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(url) ? url : "";
}
