import { body, validationResult } from "express-validator";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import * as jalaali from "jalaali-js";
import bcrypt from "bcrypt";
import xlsx from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { 
  roles, colleagues, organizations, collections, contents, settings, leaves, audit_logs, 
  recycle_bin, batch_operations, notifications, tokens, templatesData, 
  contentTemplates, templateSuggestions, expenses, invoices, mediaAssets, 
  smartEventsBank, clientSelections 
} from "../../store/state.js";
import { addDaysToJalali, toPersianDigits } from "../../utils/helpers.js";
import { getRoleInfoForUser, getPermissionCategories } from "../../utils/authUtils.js";
import { addAuditLog, logContentActivity, addNotification } from "../../utils/logger.js";
import { apiAuthGuard, checkPermission } from "../../middleware/auth.js";
import { saveDatabase } from "../../store/db.js"; // Assuming saveDatabase will be here, or we can just import it from server.js for now.

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// We need to handle `__dirname` in ESM if used, but let's just dump the code first.
const subRouter = express.Router();

subRouter.get("/global_search", (req, res) => {
  const q = req.query.q ? req.query.q.toString().toLowerCase() : "";
  if (!q || q.length < 2) {
    return res.json({
      status: "success",
      results: { contents: [], media: [], collections: [], orgs: [] },
    });
  }
  const matchedContents = contents.filter(
    (c) =>
      (c.title && c.title.toString().toLowerCase().includes(q)) ||
      (c.content_type && c.content_type.toString().toLowerCase().includes(q)) ||
      (c.topic && c.topic.toString().toLowerCase().includes(q)),
  );
  const matchedMedia = mediaAssets.filter(
    (m) =>
      (m.title && m.title.toString().toLowerCase().includes(q)) ||
      (m.file_name && m.file_name.toString().toLowerCase().includes(q)) ||
      (m.tags && m.tags.includes(q)),
  );
  const matchedOrgs = organizations.filter(
    (o) =>
      (o.org_name && o.org_name.toString().toLowerCase().includes(q)) ||
      (o.contact_name && o.contact_name.toString().toLowerCase().includes(q)),
  );
  const matchedCollections = collections.filter(
    (c) => c.title && c.title.toString().toLowerCase().includes(q),
  );
  res.json({
    status: "success",
    results: {
      contents: matchedContents,
      media: matchedMedia,
      orgs: matchedOrgs,
      collections: matchedCollections,
    },
  });
});

subRouter.get("/get_dashboard_stats", (req, res) => {
  const bottlenecks = {};
  const filter = req.query.filter || "month";
  let filteredContents = contents;
  filteredContents = filteredContents.filter(
    (c) => !(c.is_recurrence_instance && c.count_in_stats === false),
  );
  const jalaaliDate = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [currentYear, currentMonth, currentDay] = jalaaliDate.split("/");
  if (filter === "month") {
    filteredContents = filteredContents.filter((c) => {
      if (!c.publish_date) return false;
      return c.publish_date.startsWith(`${currentYear}/${currentMonth}`);
    });
  } else if (filter === "week") {
    const dayNum = parseInt(currentDay);
    filteredContents = filteredContents.filter((c) => {
      if (!c.publish_date) return false;
      if (!c.publish_date.startsWith(`${currentYear}/${currentMonth}`))
        return false;
      const pubDay = parseInt(c.publish_date.split("/")[2]);
      return pubDay >= dayNum - 7 && pubDay <= dayNum;
    });
  }
  filteredContents.forEach((c) => {
    let statusKey = c.status || "unknown";
    if (statusKey === "doing") statusKey = "in_progress";
    if (statusKey === "done") statusKey = "approved_by_client";
    bottlenecks[statusKey] = (bottlenecks[statusKey] || 0) + 1;
  });
  const platforms = {};
  filteredContents.forEach((c) => {
    if (c.publish_platforms && Array.isArray(c.publish_platforms)) {
      c.publish_platforms.forEach((p) => {
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
    const org = organizations.find((o) => o.id === Number(orgId));
    const stats = orgCounts[orgId];
    const percent = Math.round((stats.done / stats.total) * 100);
    return `${org ? org.org_name : "نامشخص"}: ${percent}٪`;
  });
  const revisionDetails = Object.keys(orgCounts).map((orgId) => {
    const org = organizations.find((o) => o.id === Number(orgId));
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
    const org = organizations.find((o) => o.id === Number(orgId));
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

subRouter.post("/fetch_live_stats", (req, res) => {
  const { org_id, platform, post_link } = req.body;
  if (!post_link) {
    return res.json({
      status: "error",
      message:
        "لینک پست وارد نشده است.",
    });
  }
  const token = tokens.find(
    (t) =>
      t.org_id == org_id &&
      t.platform_name === platform &&
      t.status === "active",
  );
  if (!token) {
    return res.json({
      status: "error",
      message:
        "اتصال به API این شبکه برای این کارفرما برقرار نیست. لطفا ابتدا در بخش سلامت توکن‌ها اتصال را انجام دهید.",
    });
  }
  return res.json({
    status: "success",
    data: { views: 0, likes: 0, comments: 0, shares: 0 },
  });
});

subRouter.get("/get_counts", (req, res) =>
  res.json({
    recycle: recycle_bin.length,
    batch: batch_operations.length,
    ops: batch_operations,
  }),
);

export default subRouter;
