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
        : "بدون سازمان",
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
        ? Math.max(...collections.map((c) => c.id)) + 1
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
          "مجموعه‌ها با موفقیت اضافه شدند",
      });
    } else if (action === "add") {
      const { parent_id } = req.body;
      const newCol = {
        id: collections.length
          ? Math.max(...collections.map((c) => c.id)) + 1
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
          "مجموعه اضافه شد",
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
            "مجموعه ویرایش شد",
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "مجموعه یافت نشد",
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
            colToDelete.title || "مجموعه",
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
            "مجموعه حذف شد",
          bin_id: binId,
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "مجموعه یافت نشد",
          });
      }
    } else {
      res
        .status(400)
        .json({
          status: "error",
          message:
            "عملیات نامعتبر",
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
          ? Math.max(...organizations.map((o) => o.id)) + 1
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
            org.org_name || "بدون نام",
          industry: org.industry || "سایر",
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
          "سازمان‌ها با موفقیت اضافه شدند",
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
              "این نام کاربری قبلا ثبت شده است.",
          });
      }
      if (password && password.length < 6) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "رمز عبور باید حداقل ۶ کاراکتر باشد.",
          });
      }
      const newOrg = {
        id:
          organizations.length > 0
            ? Math.max(...organizations.map((o) => o.id)) + 1
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
            orgToDelete.org_name || "سازمان",
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
            "به سطل زباله منتقل شد",
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
              "سازمان یافت نشد",
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
                  "رمز عبور باید حداقل ۶ کاراکتر باشد.",
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
      if (!c.title.includes(" (تکرار)"))
        c.title += " (تکرار)";
    }
    const skipStats = c.is_recurrence_instance && c.count_in_stats === false;
    if (!skipStats) {
      stats_counted_length++;
      if (c.content_type)
        typeCounts[c.content_type] = (typeCounts[c.content_type] || 0) + 1;
      const statusMap = {
        raw: "ورودی خام",
        todo: "در صف انتظار",
        in_progress:
          "در حال تولید",
        review:
          "ارزیابی استودیو",
        client_review:
          "ارزیابی کارفرما",
        needs_revision:
          "نیاز به اصلاح",
        done: "تکمیل شده",
        approved_by_client:
          "تایید کارفرما",
        ready_to_publish:
          "آماده انتشار",
        published: "منتشر شده",
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
