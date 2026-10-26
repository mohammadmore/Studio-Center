import { contents, tokens } from "../store/state.js";

/**
 * Fetches real performance numbers for a published post. Supported:
 * Instagram (Meta Graph API token), YouTube (Data API key), Aparat and public
 * Telegram channels (no token needed). Anything else is entered by hand.
 */

export interface PostStats {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  fetched_at: string;
  source: string;
}

const TIMEOUT_MS = 12_000;

export function platformKind(name: unknown) {
  const s = String(name || "").toLowerCase();
  if (/insta|اینستا/.test(s)) return "instagram";
  if (/youtube|یوتیوب|یوتوب/.test(s)) return "youtube";
  if (/aparat|آپارات/.test(s)) return "aparat";
  if (/telegram|تلگرام/.test(s)) return "telegram";
  return "";
}

export function needsToken(kind: string) {
  return kind === "instagram" || kind === "youtube";
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
  }
  return body;
}

const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v) || 0);

function instagramShortcode(link: string) {
  return /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i.exec(link)?.[1] || "";
}

async function instagramStats(link: string, token: any): Promise<PostStats> {
  const code = instagramShortcode(link);
  if (!code) throw new Error("لینک پست اینستاگرام نامعتبر است");
  const access = encodeURIComponent(token.access_token);
  // Tokens from "Instagram Login" use graph.instagram.com; Facebook Login tokens use graph.facebook.com.
  const base = String(token.access_token).startsWith("IG") ? "https://graph.instagram.com/v21.0" : "https://graph.facebook.com/v21.0";
  let userId = /^\d+$/.test(String(token.account_id || token.account_username || "")) ? String(token.account_id || token.account_username) : "";
  if (!userId) {
    if (base.includes("graph.instagram.com")) userId = "me";
    else {
      const pages = await getJson(`${base}/me/accounts?fields=instagram_business_account,name&access_token=${access}`);
      userId = (pages.data || []).map((p: any) => p.instagram_business_account?.id).find(Boolean) || "";
      if (!userId) throw new Error("حساب کسب‌وکار اینستاگرام به این توکن متصل نیست");
    }
  }
  let url = `${base}/${userId}/media?fields=id,permalink,like_count,comments_count&limit=100&access_token=${access}`;
  let media: any = null;
  for (let page = 0; page < 5 && url && !media; page++) {
    const list = await getJson(url);
    media = (list.data || []).find((m: any) => String(m.permalink || "").includes(`/${code}`));
    url = list.paging?.next || "";
  }
  if (!media) throw new Error("پست در ۵۰۰ پست اخیر این حساب پیدا نشد");
  const stats: PostStats = {
    likes: num(media.like_count),
    comments: num(media.comments_count),
    fetched_at: new Date().toISOString(),
    source: "instagram",
  };
  try {
    const insights = await getJson(`${base}/${media.id}/insights?metric=views,reach,saved,shares&access_token=${access}`);
    for (const m of insights.data || []) {
      const value = num(m.values?.[0]?.value ?? m.total_value?.value);
      if (m.name === "views") stats.views = value;
      if (m.name === "reach") stats.reach = value;
      if (m.name === "saved") stats.saves = value;
      if (m.name === "shares") stats.shares = value;
    }
  } catch {
    // Insights need extra permissions; likes and comments are still useful.
  }
  return stats;
}

function youtubeId(link: string) {
  return (
    /(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/.exec(link)?.[1] || ""
  );
}

async function youtubeStats(link: string, token: any): Promise<PostStats> {
  const id = youtubeId(link);
  if (!id) throw new Error("لینک ویدیوی یوتیوب نامعتبر است");
  const body = await getJson(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}&key=${encodeURIComponent(token.access_token)}`,
  );
  const s = body.items?.[0]?.statistics;
  if (!s) throw new Error("ویدیو پیدا نشد");
  return { views: num(s.viewCount), likes: num(s.likeCount), comments: num(s.commentCount), fetched_at: new Date().toISOString(), source: "youtube" };
}

async function aparatStats(link: string): Promise<PostStats> {
  const hash = /aparat\.com\/v\/([A-Za-z0-9]+)/i.exec(link)?.[1];
  if (!hash) throw new Error("لینک ویدیوی آپارات نامعتبر است");
  const body = await getJson(`https://www.aparat.com/etc/api/video/videohash/${hash}`);
  const v = body.video || {};
  if (!v.id && !v.visit_cnt) throw new Error("ویدیو پیدا نشد");
  return { views: num(v.visit_cnt), likes: num(v.like_cnt), fetched_at: new Date().toISOString(), source: "aparat" };
}

/** "1.2K" → 1200 */
function parseCount(s: string) {
  const m = /([\d.,]+)\s*([KMB])?/i.exec(s.replace(/\s/g, ""));
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[String(m[2] || "").toUpperCase() as "K" | "M" | "B"] || 1;
  return Math.round(n * mult);
}

async function telegramStats(link: string): Promise<PostStats> {
  const m = /t\.me\/(?:s\/)?([A-Za-z0-9_]{4,})\/(\d+)/i.exec(link);
  if (!m) throw new Error("لینک پست کانال تلگرام نامعتبر است");
  const res = await fetch(`https://t.me/${m[1]}/${m[2]}?embed=1&mode=tme`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const views = /tgme_widget_message_views">([^<]+)</.exec(html)?.[1];
  if (!views) throw new Error("آمار این پست در دسترس نیست (فقط کانال‌های عمومی)");
  return { views: parseCount(views), fetched_at: new Date().toISOString(), source: "telegram" };
}

export function findToken(orgId: any, platform: string) {
  const kind = platformKind(platform);
  return tokens.find((t) => t.org_id == orgId && t.status === "active" && platformKind(t.platform_name) === kind) || null;
}

export async function fetchPostStats(orgId: any, platform: string, link: string): Promise<PostStats> {
  const kind = platformKind(platform);
  if (!kind) throw new Error("دریافت خودکار آمار برای این پلتفرم پشتیبانی نمی‌شود؛ آمار را دستی وارد کنید");
  if (!/^https?:\/\//i.test(link || "")) throw new Error("لینک پست وارد نشده است");
  const token = findToken(orgId, platform);
  if (needsToken(kind) && !token) {
    throw new Error("اتصال به API این شبکه برای این کارفرما برقرار نیست. ابتدا در بخش سلامت توکن‌ها اتصال را انجام دهید.");
  }
  if (kind === "instagram") return instagramStats(link, token);
  if (kind === "youtube") return youtubeStats(link, token);
  if (kind === "aparat") return aparatStats(link);
  return telegramStats(link);
}

/** Stores fetched numbers on the card next to the manually entered ones. */
export function applyStats(card: any, platform: string, link: string, stats: PostStats) {
  card.platform_metrics = card.platform_metrics || {};
  const current = card.platform_metrics[platform] || {};
  const clean = Object.fromEntries(Object.entries(stats).filter(([, v]) => v !== null && v !== undefined));
  card.platform_metrics[platform] = { ...current, ...clean, post_link: link, status: current.status || "published" };
  return card.platform_metrics[platform];
}

/** Refreshes numbers of posts published in the last 60 days (run daily). */
export async function refreshRecentStats(limit = 200) {
  const since = Date.now() - 60 * 24 * 60 * 60 * 1000;
  let updated = 0;
  let checked = 0;
  for (const card of contents) {
    for (const [platform, m] of Object.entries<any>(card.platform_metrics || {})) {
      if (checked >= limit) return updated;
      if (!m?.post_link || !platformKind(platform)) continue;
      const last = m.fetched_at ? new Date(m.fetched_at).getTime() : 0;
      if (Date.now() - last < 20 * 60 * 60 * 1000) continue;
      if (m.first_fetched_at && new Date(m.first_fetched_at).getTime() < since) continue;
      checked++;
      try {
        const stats = await fetchPostStats(card.org_id, platform, m.post_link);
        const stored = applyStats(card, platform, m.post_link, stats);
        stored.first_fetched_at = m.first_fetched_at || stats.fetched_at;
        updated++;
      } catch {
        // Skipped; the next run tries again.
      }
    }
  }
  return updated;
}
