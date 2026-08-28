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
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const BLOCKED = ['application/x-msdownload', 'application/x-sh', 'text/x-php', 'application/x-httpd-php', 'application/x-executable'];
    if (BLOCKED.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// We need to handle `__dirname` in ESM if used, but let's just dump the code first.
const subRouter = express.Router();

subRouter.get("/get_collections", (req, res) => {
  const org_id = req.query.org_id;
  let cols = collections;
  if (org_id) cols = cols.filter((c) => c.org_id == org_id);
  const data = cols.map((c) => {
    const org = organizations.find((o) => o.id == c.org_id);
    return {
      ...c,
      org_name: org
        ? org.org_name
        : "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
      org_color: org ? org.color : "#3b82f6",
      org_logo: org ? org.logo_url : "",
    };
  });
  res.json({ status: "success", data });
});

subRouter.post(
  "/manage_collections",
  checkPermission("collections"),
  (req, res) => {
    const { action, id, title, org_id, cols } = req.body;
    if (action === "batch_add") {
      let currentId = collections.length
        ? collections.reduce((m, c) => (c.id > m ? c.id : m), 0) + 1
        : 1;
      cols.forEach((col) => {
        let numericOrgId = null;
        if (col.org_username) {
          const org = organizations.find(
            (o) => o.username === col.org_username,
          );
          if (org) numericOrgId = org.id;
        } else if (col.org_id) {
          numericOrgId = parseInt(col.org_id);
        }
        collections.push({
          id: currentId++,
          title: col.title,
          org_id: numericOrgId,
          created_at: new Intl.DateTimeFormat("fa-IR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
          is_active: 1,
        });
      });
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message:
          "\u0645\u062C\u0645\u0648\u0639\u0647\u200C\u0647\u0627 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u0646\u062F",
      });
    } else if (action === "add") {
      const { parent_id } = req.body;
      const newCol = {
        id: collections.length
          ? collections.reduce((m, c) => (c.id > m ? c.id : m), 0) + 1
          : 1,
        title,
        org_id: org_id ? parseInt(org_id) : null,
        parent_id: parent_id ? parseInt(parent_id) : null,
        created_at: new Intl.DateTimeFormat("fa-IR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
        is_active: 1,
      };
      collections.push(newCol);
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message:
          "\u0645\u062C\u0645\u0648\u0639\u0647 \u0627\u0636\u0627\u0641\u0647 \u0634\u062F",
      });
    } else if (action === "edit") {
      const { parent_id } = req.body;
      const col = collections.find((c) => c.id === parseInt(id));
      if (col) {
        if (title) col.title = title;
        if (parent_id !== void 0)
          col.parent_id = parent_id ? parseInt(parent_id) : null;
        if (org_id !== void 0) {
          const parsedOrgId = org_id ? parseInt(org_id) : null;
          col.org_id = parsedOrgId;
          contents.forEach((c) => {
            if (c.collection_id === col.id) {
              c.org_id = parsedOrgId;
            }
          });
        }
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "\u0645\u062C\u0645\u0648\u0639\u0647 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F",
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "\u0645\u062C\u0645\u0648\u0639\u0647 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          });
      }
    } else if (action === "delete") {
      const colToDelete = collections.find((c) => c.id === parseInt(id));
      if (colToDelete) {
        const binId = Date.now();
        recycle_bin.unshift({
          id: binId,
          table: "collections",
          item_title:
            colToDelete.title || "\u0645\u062C\u0645\u0648\u0639\u0647",
          data: colToDelete,
          deleted_at: new Date().toISOString(),
          deleted_by:
            req.session && req.session.user && req.session.user.username
              ? req.session.user.username
              : "admin",
        });
        const idx = collections.findIndex(c => c.id === parseInt(id)); if (idx > -1) collections.splice(idx, 1);
        collections.forEach((c) => {
          if (c.parent_id === parseInt(id)) {
            c.parent_id = null;
          }
        });
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "\u0645\u062C\u0645\u0648\u0639\u0647 \u062D\u0630\u0641 \u0634\u062F",
          bin_id: binId,
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "\u0645\u062C\u0645\u0648\u0639\u0647 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          });
      }
    } else {
      res
        .status(400)
        .json({
          status: "error",
          message:
            "\u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
        });
    }
  },
);

subRouter.get("/get_orgs", (req, res) => {
  const safeData = organizations
    .filter((o) => o.is_active === 1)
    .map((o) => {
      const { passwordHash, ...safeO } = o;
      return safeO;
    });
  res.json({ status: "success", data: safeData });
});

subRouter.get(
  "/manage_orgs",
  checkPermission("organizations"),
  (req, res) => {
    const now = jalaali.toJalaali(new Date());
    let currentYear = now.jy;
    let currentMonth = now.jm;
    let nextMonth = currentMonth + 1;
    let nextYear = currentYear;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    const safeData = organizations.map((o) => {
      const { passwordHash, ...safeO } = o;
      const currentSelection = clientSelections.find(
        (cs) =>
          cs.org_id == o.id &&
          cs.year == currentYear &&
          cs.month == currentMonth,
      );
      const nextSelection = clientSelections.find(
        (cs) =>
          cs.org_id == o.id && cs.year == nextYear && cs.month == nextMonth,
      );
      safeO.current_month_locked = currentSelection
        ? currentSelection.is_final
        : false;
      safeO.next_month_locked = nextSelection ? nextSelection.is_final : false;
      return safeO;
    });
    res.json({ status: "success", data: safeData });
  },
);

subRouter.post(
  "/manage_orgs",
  checkPermission("organizations"),
  (req, res) => {
    const {
      action,
      org_name,
      industry,
      logo_url,
      id,
      color,
      contact_name,
      phone_number,
      has_telegram,
      telegram_number,
      extra_phones,
      emails,
      addresses,
      username,
      password,
      orgs,
    } = req.body;
    if (action === "batch_add") {
      let currentId =
        organizations.length > 0
          ? organizations.reduce((m, o) => (o.id > m ? o.id : m), 0) + 1
          : 1;
      orgs.forEach((org) => {
        const targetUsername = org.username || "";
        if (
          targetUsername &&
          (colleagues.find((c) => c.username === targetUsername) ||
            organizations.find((o) => o.username === targetUsername))
        ) {
          return;
        }
        const newOrg = {
          id: currentId++,
          org_name:
            org.org_name || "\u0628\u062F\u0648\u0646 \u0646\u0627\u0645",
          industry: org.industry || "\u0633\u0627\u06CC\u0631",
          logo_url: org.logo_url || "",
          color: org.color || "#6366F1",
          contact_name: org.contact_name || "",
          phone_number: org.phone_number || "",
          has_telegram: org.has_telegram || false,
          telegram_number: org.telegram_number || "",
          extra_phones: org.extra_phones || [],
          emails: org.emails || [],
          addresses: org.addresses || [],
          username: targetUsername,
          passwordHash: org.password ? bcrypt.hashSync(org.password, 10) : "",
          is_active: 1,
        };
        organizations.unshift(newOrg);
      });
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0633\u0627\u0632\u0645\u0627\u0646\u200C\u0647\u0627 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u0646\u062F",
      });
    } else if (action === "add") {
      const targetUsername = username || "";
      if (
        targetUsername &&
        (colleagues.find((c) => c.username === targetUsername) ||
          organizations.find((o) => o.username === targetUsername))
      ) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0642\u0628\u0644\u0627 \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A.",
          });
      }
      if (password && password.length < 6) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F6 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F.",
          });
      }
      const newOrg = {
        id:
          organizations.length > 0
            ? organizations.reduce((m, o) => (o.id > m ? o.id : m), 0) + 1
            : 1,
        org_name,
        industry,
        logo_url,
        color,
        contact_name,
        phone_number,
        has_telegram,
        telegram_number,
        extra_phones,
        emails,
        addresses,
        username: username || "",
        passwordHash: password ? bcrypt.hashSync(password, 10) : "",
        is_active: 1,
      };
      organizations.unshift(newOrg);
      saveDatabase();
      res.json({ status: "success" });
    } else if (action === "delete") {
      const orgToDelete = organizations.find((o) => o.id == id);
      if (orgToDelete) {
        const binId = Date.now();
        recycle_bin.unshift({
          id: binId,
          table: "organizations",
          item_title:
            orgToDelete.org_name || "\u0633\u0627\u0632\u0645\u0627\u0646",
          data: orgToDelete,
          deleted_at: new Date().toISOString(),
          deleted_by:
            req.session && req.session.user && req.session.user.username
              ? req.session.user.username
              : "admin",
        });
        const idx = organizations.findIndex(o => o.id === id); if (idx > -1) organizations.splice(idx, 1);
        for(let i=contents.length-1; i>=0; i--) { if(contents[i].org_id === id) contents.splice(i, 1); }
        saveDatabase();
        res.json({
          status: "success",
          message:
            "\u0628\u0647 \u0633\u0637\u0644 \u0632\u0628\u0627\u0644\u0647 \u0645\u0646\u062A\u0642\u0644 \u0634\u062F",
          bin_id: binId,
        });
      } else {
        res.status(404).json({ status: "error" });
      }
    } else if (action === "toggle_active") {
      const orgIndex = organizations.findIndex((o) => o.id == id);
      if (orgIndex !== -1) {
        organizations[orgIndex].is_active = req.body.is_active;
        saveDatabase();
        res.json({ status: "success" });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "\u0633\u0627\u0632\u0645\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          });
      }
    } else if (action === "edit") {
      const orgIndex = organizations.findIndex((o) => o.id == id);
      if (orgIndex !== -1) {
        organizations[orgIndex].org_name = org_name;
        organizations[orgIndex].industry = industry;
        if (logo_url) organizations[orgIndex].logo_url = logo_url;
        if (color) organizations[orgIndex].color = color;
        if (contact_name !== void 0)
          organizations[orgIndex].contact_name = contact_name;
        if (phone_number !== void 0)
          organizations[orgIndex].phone_number = phone_number;
        if (has_telegram !== void 0)
          organizations[orgIndex].has_telegram = has_telegram;
        if (telegram_number !== void 0)
          organizations[orgIndex].telegram_number = telegram_number;
        if (extra_phones !== void 0)
          organizations[orgIndex].extra_phones = extra_phones;
        if (emails !== void 0) organizations[orgIndex].emails = emails;
        if (addresses !== void 0) organizations[orgIndex].addresses = addresses;
        if (username !== void 0) organizations[orgIndex].username = username;
        if (password) {
          if (password.length < 6)
            return res
              .status(400)
              .json({
                status: "error",
                message:
                  "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F6 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F.",
              });
          organizations[orgIndex].passwordHash = bcrypt.hashSync(password, 10);
        }
        saveDatabase();
        res.json({ status: "success" });
      } else {
        res.json({ status: "error", message: "Org not found" });
      }
    } else {
      res.json({ status: "error", message: "Invalid action" });
    }
  },
);

subRouter.get("/get_orgs_public", (req, res) => {
  res.json(organizations);
});

subRouter.get("/get_org_report", checkPermission("reports"), (req, res) => {
  const org_id = req.query.org_id;
  const start_date = req.query.start_date;
  const end_date = req.query.end_date;
  const col_id = req.query.col_id;
  const status_filter = req.query.status;
  const platform_filter = req.query.platform;
  const no_time_limit = req.query.no_time_limit;
  if (!org_id)
    return res.json({ status: "error", message: "org_id is required" });
  const org = organizations.find((o) => o.id == org_id);
  if (!org)
    return res.json({ status: "error", message: "Organization not found" });
  let orgContents = contents
    .filter((c) => c.org_id == org_id)
    .map((c) => ({ ...c }));
  if (col_id) {
    orgContents = orgContents.filter((c) => c.col_id == col_id);
  }
  if (status_filter) {
    orgContents = orgContents.filter(
      (c) => (c.status || "raw") === status_filter,
    );
  }
  if (platform_filter) {
    orgContents = orgContents.filter(
      (c) =>
        c.publish_platforms && c.publish_platforms.includes(platform_filter),
    );
  }
  if (no_time_limit !== "true") {
    if (start_date) {
      orgContents = orgContents.filter(
        (c) => c.publish_date && c.publish_date >= start_date,
      );
    }
    if (end_date) {
      orgContents = orgContents.filter(
        (c) => c.publish_date && c.publish_date <= end_date,
      );
    }
  }
  const typeCounts = {};
  const statusCounts = {};
  const platformCounts = {};
  let total_components = 0;
  let stats_counted_length = 0;
  orgContents.forEach((c) => {
    if (c.is_recurrence_instance) {
      if (!c.title.includes(" (\u062A\u06A9\u0631\u0627\u0631)"))
        c.title += " (\u062A\u06A9\u0631\u0627\u0631)";
    }
    const skipStats = c.is_recurrence_instance && c.count_in_stats === false;
    if (!skipStats) {
      stats_counted_length++;
      if (c.content_type)
        typeCounts[c.content_type] = (typeCounts[c.content_type] || 0) + 1;
      const statusMap = {
        raw: "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645",
        todo: "\u062F\u0631 \u0635\u0641 \u0627\u0646\u062A\u0638\u0627\u0631",
        in_progress:
          "\u062F\u0631 \u062D\u0627\u0644 \u062A\u0648\u0644\u06CC\u062F",
        review:
          "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
        client_review:
          "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
        needs_revision:
          "\u0646\u06CC\u0627\u0632 \u0628\u0647 \u0627\u0635\u0644\u0627\u062D",
        done: "\u062A\u06A9\u0645\u06CC\u0644 \u0634\u062F\u0647",
        approved_by_client:
          "\u062A\u0627\u06CC\u06CC\u062F \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
        ready_to_publish:
          "\u0622\u0645\u0627\u062F\u0647 \u0627\u0646\u062A\u0634\u0627\u0631",
        published: "\u0645\u0646\u062A\u0634\u0631 \u0634\u062F\u0647",
      };
      let s = statusMap[c.status || "raw"] || c.status || "raw";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      if (c.publish_platforms) {
        c.publish_platforms.forEach((p) => {
          platformCounts[p] = (platformCounts[p] || 0) + 1;
        });
      }
      const comps = c.components_count || {};
      let cCount = 0;
      for (let k in comps) cCount += comps[k];
      if (cCount === 0) cCount = 1;
      total_components += cCount;
    }
    const comps2 = c.components_count || {};
    let cCount2 = 0;
    for (let k in comps2) cCount2 += comps2[k];
    if (cCount2 === 0) cCount2 = 1;
    c.total_components = cCount2;
  });
  res.json({
    status: "success",
    organization: org,
    contents: orgContents,
    stats: {
      typeCounts,
      statusCounts,
      platformCounts,
      total_contents: stats_counted_length,
      total_components,
    },
  });
});

export default subRouter;
