import express from "express";
import { applyStats, fetchPostStats } from "../../utils/stats.js";
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
  const matchedOrgs = organizations
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
      contents: matchedContents.slice(0, 50),
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
  const orgCounts = filteredContents.reduce((acc, c) => {
    acc[c.org_id] = acc[c.org_id] || { total: 0, done: 0, revision: 0 };
    acc[c.org_id].total++;
    if (c.status === "done") acc[c.org_id].done++;
    if (c.status === "todo") acc[c.org_id].revision++;
    return acc;
  }, {});
  const completionDetails = Object.keys(orgCounts).map((orgId) => {
    const org = organizations.find((o) => o.id == orgId);
    const stats = orgCounts[orgId];
    const percent = Math.round((stats.done / stats.total) * 100);
    return `${org ? org.org_name : "نامشخص"}: ${percent}٪`;
  });
  const revisionDetails = Object.keys(orgCounts).map((orgId) => {
    const org = organizations.find((o) => o.id == orgId);
    const stats = orgCounts[orgId];
    const percent = Math.round((stats.revision / stats.total) * 100);
    return `${org ? org.org_name : "نامشخص"}: ${percent}٪ اصلاحیه`;
  });
  let totalContentForCalc = 0;
  let totalDoneForCalc = 0;
  let totalRevisionForCalc = 0;
  let worstOrg = { name: "ندارد", rate: -1 };
  let bestOrg = { name: "ندارد", rate: -1 };
  Object.keys(orgCounts).forEach((orgId) => {
    const org = organizations.find((o) => o.id == orgId);
    const stats = orgCounts[orgId];
    totalContentForCalc += stats.total;
    totalDoneForCalc += stats.done;
    totalRevisionForCalc += stats.revision;
    const revisionRate = Math.round((stats.revision / stats.total) * 100);
    if (revisionRate > worstOrg.rate) {
      worstOrg = {
        name: org ? org.org_name : "نامشخص",
        rate: revisionRate,
      };
    }
    const completionRate = Math.round((stats.done / stats.total) * 100);
    if (completionRate > bestOrg.rate) {
      bestOrg = {
        name: org ? org.org_name : "نامشخص",
        rate: completionRate,
      };
    }
  });
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
      raw_events: filteredContents.filter((c) => c.status === "raw").length,
      overall_revision_rate: overallRevisionRate,
      overall_completion_rate: overallCompletionRate,
      worst_org: worstOrg.name,
      best_org: bestOrg.name,
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
