import express from "express";
import { applyStats, fetchPostStats, findToken, needsToken, platformKind } from "../../utils/stats.js";
import { saveDatabase } from "../../store/db.js";
import { collections, contents, mediaAssets, organizations } from "../../store/state.js";
import { checkPermission } from "../../middleware/auth.js";
import { hasPermission } from "../../utils/authUtils.js";
import { jalaliDiffDays, normalizeJalaliDate, todayJalali } from "../../utils/helpers.js";

const subRouter = express.Router();

subRouter.get("/global_search", (req: any, res) => {
  const q = req.query.q ? req.query.q.toString().toLowerCase() : "";
  if (!q || q.length < 2) {
    return res.json({
      status: "success",
      results: { contents: [], media: [], collections: [], orgs: [] },
    });
  }
  const can = (perm: string | string[]) => hasPermission(req.user, perm);
  const matchedContents = !can(["depot", "calendar", "collections", "archive"]) ? [] : contents.filter(
    (c) =>
      (c.title && c.title.toString().toLowerCase().includes(q)) ||
      (c.content_type && c.content_type.toString().toLowerCase().includes(q)) ||
      (c.topic && c.topic.toString().toLowerCase().includes(q)),
  );
  const matchedMedia = !can("media") ? [] : mediaAssets.filter(
    (m) =>
      (m.title && m.title.toString().toLowerCase().includes(q)) ||
      (m.file_name && m.file_name.toString().toLowerCase().includes(q)) ||
      (m.asset_name && m.asset_name.toString().toLowerCase().includes(q)) ||
      (Array.isArray(m.tags) && m.tags.includes(q)),
  );
  const matchedOrgs = !can(["organizations", "client-portal", "invoice", "contracts"]) ? [] : organizations
    .filter(
      (o) =>
        (o.org_name && o.org_name.toString().toLowerCase().includes(q)) ||
        (o.contact_name && o.contact_name.toString().toLowerCase().includes(q)),
    )
    .map((o) => ({ id: o.id, org_name: o.org_name, logo_url: o.logo_url, color: o.color, industry: o.industry }));
  const matchedCollections = !can(["collections", "depot"]) ? [] : collections.filter(
    (c) => c.title && c.title.toString().toLowerCase().includes(q),
  );
  res.json({
    status: "success",
    results: {
      contents: matchedContents.slice(0, 50).map((c) => ({
        id: c.id,
        title: c.title,
        content_type: c.content_type,
        status: c.status,
        publish_date: c.publish_date,
        org_id: c.org_id,
        org_name: organizations.find((o) => o.id == c.org_id)?.org_name || "",
      })),
      media: matchedMedia,
      orgs: matchedOrgs,
      collections: matchedCollections,
    },
  });
});

subRouter.get("/get_dashboard_stats", checkPermission("dashboard"), (req, res) => {
  const bottlenecks: Record<string, number> = {};
  const filter = req.query.filter || "month";
  let filteredContents = contents;
  filteredContents = filteredContents.filter(
    (c) => !(c.is_recurrence_instance && c.count_in_stats === false),
  );
  const today = todayJalali();
  if (filter === "month") {
    const monthPrefix = today.slice(0, 8);
    filteredContents = filteredContents.filter((c) =>
      normalizeJalaliDate(c.publish_date).startsWith(monthPrefix),
    );
  } else if (filter === "week") {
    filteredContents = filteredContents.filter((c) => {
      const diff = jalaliDiffDays(c.publish_date, today);
      return diff >= 0 && diff <= 7;
    });
  }
  filteredContents.forEach((c) => {
    let statusKey = c.status || "unknown";
    if (statusKey === "doing") statusKey = "in_progress";
    if (statusKey === "done") statusKey = "approved_by_client";
    bottlenecks[statusKey] = (bottlenecks[statusKey] || 0) + 1;
  });
  const platforms: Record<string, number> = {};
  filteredContents.forEach((c) => {
    if (c.publish_platforms && Array.isArray(c.publish_platforms)) {
      c.publish_platforms.forEach((p: any) => {
        platforms[p] = (platforms[p] || 0) + 1;
      });
    }
  });
  const typeCounts = filteredContents.reduce((acc, c) => {
    if (!c.content_type) return acc;
    acc[c.content_type] = (acc[c.content_type] || 0) + 1;
    return acc;
  }, {});
  const totalDetails = Object.entries(typeCounts).map(
    ([type, count]) => `${type}: ${count} عدد`,
  );
  const rawEventsList = filteredContents
    .filter((c) => c.status === "raw")
    .map((c) => c.title);
  // Finished = approved or further along; a revision = sent back by the client (now, or any
  // of its review versions). (It used to count only "done" and treated the todo queue as revisions.)
  const FINISHED = ["done", "approved_by_client", "ready_to_publish", "scheduled", "published"];
  const wasRevised = (c: any) =>
    c.status === "needs_revision" || (Array.isArray(c.review_versions) && c.review_versions.some((v: any) => v?.client?.status === "rejected"));
  const orgCounts = filteredContents.reduce((acc, c) => {
    acc[c.org_id] = acc[c.org_id] || { total: 0, done: 0, revision: 0 };
    acc[c.org_id].total++;
    if (FINISHED.includes(c.status)) acc[c.org_id].done++;
    if (wasRevised(c)) acc[c.org_id].revision++;
    return acc;
  }, {} as Record<string, { total: number; done: number; revision: number }>);
  const orgName = (orgId: string) => organizations.find((o) => o.id == orgId)?.org_name || "بدون کارفرما";
  const completionDetails = Object.keys(orgCounts).map((orgId) => {
    const stats = orgCounts[orgId];
    return `${orgName(orgId)}: ${Math.round((stats.done / stats.total) * 100)}٪`;
  });
  const revisionDetails = Object.keys(orgCounts).map((orgId) => {
    const stats = orgCounts[orgId];
    return `${orgName(orgId)}: ${Math.round((stats.revision / stats.total) * 100)}٪ اصلاحیه`;
  });
  let totalContentForCalc = 0;
  let totalDoneForCalc = 0;
  let totalRevisionForCalc = 0;
  const realOrgs = Object.keys(orgCounts).filter((id) => organizations.some((o) => o.id == id));
  for (const id of Object.keys(orgCounts)) {
    totalContentForCalc += orgCounts[id].total;
    totalDoneForCalc += orgCounts[id].done;
    totalRevisionForCalc += orgCounts[id].revision;
  }
  // "Best" and "most revisions" only mean something when two or more clients are compared
  // and there is something to compare (otherwise one client was both best and worst).
  let worstOrg: string | null = null;
  let bestOrg: string | null = null;
  if (realOrgs.length >= 2) {
    const rate = (id: string, k: "done" | "revision") => orgCounts[id][k] / orgCounts[id].total;
    const byRevision = realOrgs.filter((id) => orgCounts[id].revision > 0).sort((a, b) => rate(b, "revision") - rate(a, "revision"));
    const byDone = realOrgs.filter((id) => orgCounts[id].done > 0).sort((a, b) => rate(b, "done") - rate(a, "done"));
    if (byRevision.length) worstOrg = orgName(byRevision[0]);
    if (byDone.length) bestOrg = orgName(byDone[0]);
    if (bestOrg && bestOrg === worstOrg) worstOrg = byRevision[1] ? orgName(byRevision[1]) : null;
  }
  const overallRevisionRate =
    totalContentForCalc > 0
      ? Math.round((totalRevisionForCalc / totalContentForCalc) * 100)
      : 0;
  const overallCompletionRate =
    totalContentForCalc > 0
      ? Math.round((totalDoneForCalc / totalContentForCalc) * 100)
      : 0;
  const response = {
    status: "success",
    kpis: {
      total_content: filteredContents.length,
      scope_label: filter === "month" ? "محتواهای این ماه" : filter === "week" ? "محتواهای این هفته" : "مجموع محتواهای سیستم",
      scope_hint: filter === "month" ? "کارت‌هایی که تاریخ انتشارشان در این ماه است" : filter === "week" ? "کارت‌هایی که تاریخ انتشارشان در این هفته است" : "",
      system_total: contents.length,
      raw_events: filteredContents.filter((c) => c.status === "raw").length,
      overall_revision_rate: overallRevisionRate,
      overall_completion_rate: overallCompletionRate,
      worst_org: worstOrg,
      best_org: bestOrg,
    },
    details: {
      total: totalDetails.length
        ? totalDetails
        : [
            "محتوایی ثبت نشده است",
          ],
      raw: rawEventsList.length
        ? rawEventsList
        : [
            "کارت خامی وجود ندارد",
          ],
      revision: revisionDetails.length
        ? revisionDetails
        : [
            "دیتایی موجود نیست",
          ],
      completion: completionDetails.length
        ? completionDetails
        : [
            "دیتایی موجود نیست",
          ],
    },
    bottlenecks,
    platforms,
  };
  res.json(response);
});

/** Can stats of this card's post on this platform be fetched (connected account, supported)? */
subRouter.get("/live_stats_available", checkPermission(["depot", "dashboard", "reports"]), (req, res) => {
  const card = contents.find((c) => c.id == req.query.content_id);
  const platform = String(req.query.platform || "");
  const kind = platformKind(platform);
  if (!kind) return res.json({ status: "success", available: false, reason: "دریافت خودکار آمار برای این پلتفرم پشتیبانی نمی‌شود؛ آمار را دستی وارد کنید." });
  if (needsToken(kind) && !findToken(card?.org_id, platform)) {
    const name = kind === "instagram" ? "اینستاگرام" : "یوتیوب";
    return res.json({ status: "success", available: false, reason: `ابتدا حساب ${name} این کارفرما را در «سلامت توکن‌ها» وصل کنید.` });
  }
  res.json({ status: "success", available: true });
});

subRouter.post("/fetch_live_stats", checkPermission(["depot", "dashboard", "reports"]), async (req, res) => {
  const { content_id, platform } = req.body;
  const card = content_id ? contents.find((c) => c.id == content_id) : null;
  const orgId = card ? card.org_id : req.body.org_id;
  const link = String(req.body.post_link || card?.platform_metrics?.[platform]?.post_link || "").trim();
  if (!link) return res.json({ status: "error", message: "لینک پست وارد نشده است." });
  try {
    const stats = await fetchPostStats(orgId, platform, link);
    const stored = card ? applyStats(card, platform, link, stats) : stats;
    if (card) saveDatabase();
    return res.json({ status: "success", data: stored });
  } catch (e: any) {
    return res.json({ status: "error", message: String(e?.message || e) });
  }
});

export default subRouter;
