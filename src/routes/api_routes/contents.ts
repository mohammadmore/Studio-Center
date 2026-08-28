import { getIO } from "../../utils/socket.js";
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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ALLOWED = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!ALLOWED.includes(file.mimetype) || !['xlsx', 'xls'].includes(ext)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// We need to handle `__dirname` in ESM if used, but let's just dump the code first.
const subRouter = express.Router();

subRouter.get("/get_depot_contents", (req, res) => {
  const orgMap = new Map();
  organizations.forEach((o) => orgMap.set(o.id.toString(), o));
  const dataWithOrgs = contents.map((c) => {
    const parsedOrgId = c.org_id ? parseInt(c.org_id, 10) : null;
    const org =
      orgMap.get(c.org_id?.toString()) ||
      (parsedOrgId && orgMap.get(parsedOrgId.toString()));
    return {
      ...c,
      org_id: org ? org.id : parsedOrgId || c.org_id,
      org_name: org
        ? org.org_name
        : c.org_name ||
          "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
      org_color: org ? org.color : c.org_color || "#3b82f6",
      org_logo: org ? org.logo_url : c.org_logo || "",
    };
  });
  res.json({ status: "success", data: dataWithOrgs });
});

subRouter.get("/get_my_projects", (req, res) => {
  const orgMap = new Map();
  organizations.forEach((o) => orgMap.set(o.id.toString(), o));
  req.app.locals._orgMap = orgMap;
  const user = req.session.user;
  if (!user)
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  const userId = user.id;
  const username = user.username;
  const fullName = user.full_name;
  const myProjects = contents
    .filter((c) => {
      if (
        c.project_manager === username ||
        c.project_manager == userId ||
        c.project_manager === fullName
      )
        return true;
      if (c.assigned_colleagues && Array.isArray(c.assigned_colleagues)) {
        if (
          c.assigned_colleagues.includes(userId) ||
          c.assigned_colleagues.includes(userId.toString()) ||
          c.assigned_colleagues.includes(username) ||
          c.assigned_colleagues.includes(fullName)
        )
          return true;
      }
      return false;
    })
    .map((c) => {
      const parsedOrgId = c.org_id ? parseInt(c.org_id, 10) : null;
      const org = req.app.locals._orgMap
        ? req.app.locals._orgMap.get(c.org_id?.toString()) ||
          (parsedOrgId && req.app.locals._orgMap.get(parsedOrgId.toString()))
        : organizations.find(
            (o) => o.id == c.org_id || (parsedOrgId && o.id == parsedOrgId),
          );
      return {
        ...c,
        org_id: org ? org.id : parsedOrgId || c.org_id,
        org_name: org
          ? org.org_name
          : c.org_name ||
            "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
        org_color: org ? org.color : c.org_color || "#3b82f6",
        org_logo: org ? org.logo_url : c.org_logo || "",
      };
    });
  res.json({ status: "success", data: myProjects });
});

subRouter.get("/get_org_contents", (req, res) => {
  const org_id = parseInt(req.query.org_id as string);
  const col_id = req.query.col_id;
  const status = req.query.status;
  const platformFilter = req.query.platform;
  const start_date = req.query.start_date;
  const end_date = req.query.end_date;
  const orgContents = contents.filter((c) => {
    if (c.org_id != org_id) return false;
    if (col_id && c.collection_id != col_id) return false;
    if (status && c.status != status) return false;
    if (platformFilter) {
      if (
        platformFilter ===
        "\u0628\u062F\u0648\u0646 \u067E\u0644\u062A\u0641\u0631\u0645"
      ) {
        if (c.publish_platforms && c.publish_platforms.length > 0) return false;
      } else {
        if (
          !c.publish_platforms ||
          !c.publish_platforms.includes(platformFilter)
        )
          return false;
      }
    }
    if (start_date && c.publish_date && c.publish_date < start_date)
      return false;
    if (end_date && c.publish_date && c.publish_date > end_date) return false;
    return true;
  });
  res.json({ status: "success", data: orgContents });
});

subRouter.post(
  "/bulk_schedule_contents",
  checkPermission("depot"),
  (req, res) => {
    const { items, force } = req.body;
    if (!items || !Array.isArray(items))
      return res.json({
        status: "error",
        message:
          "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
      });
    const warnings = [];
    const validUpdates = [];
    items.forEach((item, index) => {
      let rowNum = index + 2;
      const contentId = parseInt(item.content_id);
      if (!contentId || isNaN(contentId)) return;
      if (!item.org_name || !item.org_name.trim()) return;
      const card = contents.find((c) => c.id === contentId);
      if (!card) return;
      const cardOrg = organizations.find((o) => o.id === card.org_id);
      const expectedOrgName = cardOrg
        ? cardOrg.org_name.trim()
        : "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646";
      const providedOrgName = item.org_name.trim();
      if (expectedOrgName !== providedOrgName) {
        warnings.push(
          `\u0631\u062F\u06CC\u0641 ${rowNum}: \u0634\u0646\u0627\u0633\u0647 ${contentId} \u0645\u0631\u0628\u0648\u0637 \u0628\u0647 \xAB${expectedOrgName}\xBB \u0627\u0633\u062A\u060C \u0627\u0645\u0627 \u0634\u0645\u0627 \xAB${providedOrgName}\xBB \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0631\u062F\u0647\u200C\u0627\u06CC\u062F.`,
        );
      }
      validUpdates.push({ card, item });
    });
    if (validUpdates.length === 0 && warnings.length === 0) {
      return res.json({
        status: "error",
        message:
          "\u0647\u06CC\u0686 \u0631\u062F\u06CC\u0641 \u0645\u0639\u062A\u0628\u0631\u06CC \u0628\u0631\u0627\u06CC \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.",
      });
    }
    if (warnings.length > 0 && !force) {
      return res.json({ status: "warning", warnings });
    }
    validUpdates.forEach((update) => {
      const { card, item } = update;
      if (item.publish_date) card.publish_date = item.publish_date;
      if (item.publish_time) card.publish_time = item.publish_time;
    });
    saveDatabase();
    return res.json({
      status: "success",
      message: `${validUpdates.length} \u0645\u062D\u062A\u0648\u0627 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u0634\u062F\u0646\u062F.`,
    });
  },
);

subRouter.post(
  "/schedule_content",
  checkPermission("depot"),
  (req, res) => {
    const {
      id,
      publish_date,
      publish_time,
      is_recurring,
      recurrence_interval_days,
      recurrence_count,
      count_in_stats,
    } = req.body;
    const cardIndex = contents.findIndex((c) => c.id == id);
    if (cardIndex !== -1) {
      const card = contents[cardIndex];
      card.publish_date = publish_date;
      if (publish_time !== void 0) card.publish_time = publish_time;
      if (req.body.status) card.status = req.body.status;
      card.is_recurring = is_recurring || false;
      card.recurrence_interval_days = recurrence_interval_days;
      card.recurrence_count = recurrence_count;
      card.count_in_stats = count_in_stats;
      if (
        is_recurring &&
        recurrence_count > 1 &&
        recurrence_interval_days > 0
      ) {
        for (let i = 1; i < recurrence_count; i++) {
          const nextDate = addDaysToJalali(
            publish_date,
            i * recurrence_interval_days,
          );
          const newCard = {
            ...card,
            id:
              contents.length > 0
                ? contents.reduce((m, x) => (x.id > m ? x.id : m), 0) + 1
                : 1,
            publish_date: nextDate,
            is_recurrence_instance: true,
            parent_id: card.id,
          };
          contents.push(newCard);
        }
      }
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0645\u062D\u062A\u0648\u0627 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u0634\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  },
);

subRouter.post("/add_content", checkPermission("depot"), (req, res) => {
  const {
    action,
    id,
    status,
    title,
    type,
    org_id,
    is_recurring,
    recurrence_interval_days,
    recurrence_count,
    count_in_stats,
  } = req.body;
  if (action === "delete") {
    const itemToDelete = contents.find((c) => c.id == id);
    if (itemToDelete) {
      const binId = Date.now();
      const usernameStr =
        req.session && req.session.user && req.session.user.username
          ? req.session.user.username
          : "admin";
      batch_operations.unshift({
        id: "batch_" + Date.now(),
        type: "batch_delete",
        title: "\u062D\u0630\u0641 \u0645\u062D\u062A\u0648\u0627",
        description: `\u0645\u062D\u062A\u0648\u0627\u06CC "${itemToDelete.title}" \u062D\u0630\u0641 \u0634\u062F.`,
        deleted_bin_ids: [binId],
        user: usernameStr,
        timestamp: new Date().toISOString(),
        is_undone: false,
      });
      recycle_bin.unshift({
        id: binId,
        table: "contents",
        item_title:
          itemToDelete.title ||
          "\u0645\u062D\u062A\u0648\u0627\u06CC \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
        data: itemToDelete,
        deleted_at: new Date().toISOString(),
        deleted_by:
          req.session && req.session.user && req.session.user.username
            ? req.session.user.username
            : "admin",
      });
      const idx = contents.findIndex(c => c.id == id); if (idx > -1) contents.splice(idx, 1);
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0645\u062D\u062A\u0648\u0627 \u0628\u0647 \u0633\u0637\u0644 \u0632\u0628\u0627\u0644\u0647 \u0645\u0646\u062A\u0642\u0644 \u0634\u062F",
        bin_id: binId,
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  }
  if (action === "update_status") {
    const card = contents.find((c) => c.id == id);
    if (card) {
      const usernameStr =
        req.session && req.session.user && req.session.user.username
          ? req.session.user.username
          : "admin";
      batch_operations.unshift({
        id: "batch_" + Date.now(),
        type: "batch_edit",
        title:
          "\u062A\u063A\u06CC\u06CC\u0631 \u0648\u0636\u0639\u06CC\u062A \u0645\u062D\u062A\u0648\u0627",
        description: `\u0648\u0636\u0639\u06CC\u062A "${card.title}" \u0627\u0632 ${card.status || "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645"} \u0628\u0647 ${status} \u062A\u063A\u06CC\u06CC\u0631 \u06CC\u0627\u0641\u062A.`,
        previous_states: [JSON.parse(JSON.stringify(card))],
        user: usernameStr,
        timestamp: new Date().toISOString(),
        is_undone: false,
      });
      logContentActivity(card, req, `\u0648\u0636\u0639\u06CC\u062A \u0631\u0627 \u0627\u0632 ${card.status || "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645"} \u0628\u0647 ${status} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`);
      card.status = status;
      saveDatabase();
      const io = getIO();
      if (io) io.emit("content_updated", { contentId: card.id, card });
      return res.json({ status: "success" });
    }
  }
  const batchId = "batch_" + Date.now();
  const newContent = {
    batch_id: batchId,
    id: contents.length > 0 ? contents.reduce((m, x) => (x.id > m ? x.id : m), 0) + 1 : 1,
    title:
      title ||
      "\u0645\u062D\u062A\u0648\u0627\u06CC \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
    org_id: org_id ? parseInt(org_id) : 1,
    content_type:
      type ||
      "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
    project_manager: req.body.project_manager || null,
    assigned_colleagues: req.body.assigned_colleagues || [],
    stages: req.body.stages || [],
    status: req.body.status || "raw",
    publish_date: req.body.publish_date || "",
    publish_time: req.body.publish_time || "",
    components_count: req.body.components_count || {},
    is_recurring: is_recurring || false,
    recurrence_interval_days,
    recurrence_count,
    count_in_stats,
  };
  contents.unshift(newContent);
  if (
    is_recurring &&
    recurrence_count > 1 &&
    recurrence_interval_days > 0 &&
    newContent.publish_date
  ) {
    for (let i = 1; i < recurrence_count; i++) {
      const nextDate = addDaysToJalali(
        newContent.publish_date,
        i * recurrence_interval_days,
      );
      const extraCard = {
        ...newContent,
        id: contents.reduce((m, x) => (x.id > m ? x.id : m), 0) + 1,
        publish_date: nextDate,
        is_recurrence_instance: true,
        parent_id: newContent.id,
      };
      contents.push(extraCard);
    }
  }
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u0645\u062D\u062A\u0648\u0627\u06CC \u062C\u062F\u06CC\u062F \u0627\u0636\u0627\u0641\u0647 \u0634\u062F",
    data: newContent,
  });
});

subRouter.get("/download_content_excel_template", (req, res) => {
  try {
    const wb = xlsx.utils.book_new();
    const sampleOrg =
      organizations && organizations.length > 0
        ? organizations[0].org_name
        : "\u06A9\u06CC\u0627\u0646 \u062A\u06CC\u0645";
    const sampleManager =
      colleagues && colleagues.length > 0
        ? colleagues[0].full_name || colleagues[0].username
        : "\u0645\u062F\u06CC\u0631 \u06A9\u0644 (Admin)";
    const templateData = [
      {
        "\u0639\u0646\u0648\u0627\u0646 \u0645\u062D\u062A\u0648\u0627":
          "\u0648\u06CC\u062F\u06CC\u0648\u06CC \u0645\u0639\u0631\u0641\u06CC \u0645\u062D\u0635\u0648\u0644 \u062C\u062F\u06CC\u062F",
        "\u0633\u0627\u0632\u0645\u0627\u0646 / \u0628\u0631\u0646\u062F":
          sampleOrg,
        "\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0627":
          "\u067E\u0633\u062A \u0648\u06CC\u062F\u06CC\u0648\u06CC\u06CC",
        "\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647":
          sampleManager,
        "\u0647\u0645\u06A9\u0627\u0631\u0627\u0646 (\u0628\u0627 \u06A9\u0627\u0645\u0627)":
          "\u062A\u062F\u0648\u06CC\u0646\u06AF\u0631, \u0645\u062F\u06CC\u0631 \u062F\u0627\u062E\u0644\u06CC",
        "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F (\u0628\u0627 \u06A9\u0627\u0645\u0627)":
          "\u067E\u0698\u0648\u0647\u0634 \u0648 \u0633\u0646\u0627\u0631\u06CC\u0648, \u0641\u06CC\u0644\u0645\u0628\u0631\u062F\u0627\u0631\u06CC, \u062A\u062F\u0648\u06CC\u0646",
        "\u0648\u0636\u0639\u06CC\u062A":
          "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645",
        "\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631":
          "1405/02/15",
        "\u0633\u0627\u0639\u062A \u0627\u0646\u062A\u0634\u0627\u0631":
          "18:00",
        "\u06A9\u067E\u0634\u0646 / \u062A\u0648\u0636\u06CC\u062D\u0627\u062A":
          "\u0633\u0646\u0627\u0631\u06CC\u0648\u06CC \u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u06CC \u0628\u0631\u0627\u06CC \u0648\u06CC\u062F\u06CC\u0648\u06CC \u0645\u0639\u0631\u0641\u06CC \u0645\u062D\u0635\u0648\u0644 \u062C\u062F\u06CC\u062F...",
        "\u0644\u06CC\u0646\u06A9 \u06A9\u0627\u0648\u0631":
          "https://example.com/cover1.jpg",
        "\u0644\u06CC\u0646\u06A9 \u0648\u06CC\u062F\u06CC\u0648":
          "https://example.com/video1.mp4",
      },
      {
        "\u0639\u0646\u0648\u0627\u0646 \u0645\u062D\u062A\u0648\u0627":
          "\u067E\u0648\u0633\u062A\u0631 \u062A\u062E\u0641\u06CC\u0641\u0627\u062A \u0648\u06CC\u0698\u0647 \u0641\u0635\u0644",
        "\u0633\u0627\u0632\u0645\u0627\u0646 / \u0628\u0631\u0646\u062F":
          sampleOrg,
        "\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0627":
          "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
        "\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647":
          sampleManager,
        "\u0647\u0645\u06A9\u0627\u0631\u0627\u0646 (\u0628\u0627 \u06A9\u0627\u0645\u0627)":
          "\u0637\u0631\u0627\u062D \u06AF\u0631\u0627\u0641\u06CC\u06A9",
        "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F (\u0628\u0627 \u06A9\u0627\u0645\u0627)":
          "\u0637\u0631\u0627\u062D\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9",
        "\u0648\u0636\u0639\u06CC\u062A": "\u062F\u0631 \u0635\u0641",
        "\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631":
          "1405/02/20",
        "\u0633\u0627\u0639\u062A \u0627\u0646\u062A\u0634\u0627\u0631":
          "12:00",
        "\u06A9\u067E\u0634\u0646 / \u062A\u0648\u0636\u06CC\u062D\u0627\u062A":
          "\u0637\u0631\u0627\u062D\u06CC \u0628\u0646\u0631 \u0648 \u067E\u0648\u0633\u062A\u0631 \u062A\u062E\u0641\u06CC\u0641\u0627\u062A...",
        "\u0644\u06CC\u0646\u06A9 \u06A9\u0627\u0648\u0631": "",
        "\u0644\u06CC\u0646\u06A9 \u0648\u06CC\u062F\u06CC\u0648": "",
      },
    ];
    const wsData = xlsx.utils.json_to_sheet(templateData);
    xlsx.utils.book_append_sheet(
      wb,
      wsData,
      "\u062F\u067E\u0648\u06CC \u0645\u062D\u062A\u0648\u0627",
    );
    const availableOrgs = (organizations || [])
      .map((o) => o.org_name)
      .join(" | ");
    const availableTypes = ((settings && settings.content_type) || [])
      .map((t) => t.setting_key)
      .join(" | ");
    const availableColleagues = (colleagues || [])
      .map((c) => c.full_name || c.username)
      .join(" | ");
    const guideData = [
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0639\u0646\u0648\u0627\u0646 \u0645\u062D\u062A\u0648\u0627",
        "\u0646\u0648\u0639": "\u0627\u062C\u0628\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0646\u0627\u0645 \u06CC\u0627 \u062A\u06CC\u062A\u0631 \u0627\u0635\u0644\u06CC \u06A9\u0627\u0631\u062A \u0645\u062D\u062A\u0648\u0627",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0647\u0631 \u0639\u0646\u0648\u0627\u0646 \u062F\u0644\u062E\u0648\u0627\u0647",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0633\u0627\u0632\u0645\u0627\u0646 / \u0628\u0631\u0646\u062F",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0641\u0631\u0645\u0627 \u06CC\u0627 \u0628\u0631\u0646\u062F\u06CC \u06A9\u0647 \u0645\u062D\u062A\u0648\u0627 \u0645\u062A\u0639\u0644\u0642 \u0628\u0647 \u0622\u0646 \u0627\u0633\u062A",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          availableOrgs ||
          "\u0646\u0627\u0645 \u0633\u0627\u0632\u0645\u0627\u0646\u200C\u0647\u0627\u06CC \u062B\u0628\u062A\u200C\u0634\u062F\u0647 \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0627",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0641\u0631\u0645\u062A \u0648 \u0642\u0627\u0644\u0628 \u0645\u062D\u062A\u0648\u0627\u06CC \u062A\u0648\u0644\u06CC\u062F\u06CC",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          availableTypes ||
          "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC | \u067E\u0633\u062A \u0648\u06CC\u062F\u06CC\u0648\u06CC\u06CC | \u0645\u0642\u0627\u0644\u0647 \u0633\u0626\u0648 ...",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0646\u0627\u0645 \u06CC\u0627 \u0646\u0627\u0645\u06A9\u0627\u0631\u0628\u0631\u06CC \u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647 \u0645\u0633\u0626\u0648\u0644",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          availableColleagues ||
          "\u0646\u0627\u0645 \u067E\u0631\u0633\u0646\u0644 \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0647\u0645\u06A9\u0627\u0631\u0627\u0646 (\u0628\u0627 \u06A9\u0627\u0645\u0627)",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0627\u0633\u0627\u0645\u06CC \u0647\u0645\u06A9\u0627\u0631\u0627\u0646 \u062F\u0631\u06AF\u06CC\u0631 \u06A9\u0647 \u0628\u0627 \u06A9\u0627\u0645\u0627 (,) \u06CC\u0627 | \u0627\u0632 \u0647\u0645 \u062C\u062F\u0627 \u0634\u062F\u0647\u200C\u0627\u0646\u062F",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          availableColleagues,
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F (\u0628\u0627 \u06A9\u0627\u0645\u0627)",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0645\u0631\u0627\u062D\u0644 \u062E\u0637 \u062A\u0648\u0644\u06CC\u062F \u0645\u062D\u062A\u0648\u0627 \u06A9\u0647 \u0628\u0627 \u06A9\u0627\u0645\u0627 \u062C\u062F\u0627 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u067E\u0698\u0648\u0647\u0634 \u0648 \u0633\u0646\u0627\u0631\u06CC\u0648 | \u0641\u06CC\u0644\u0645\u0628\u0631\u062F\u0627\u0631\u06CC | \u0639\u06A9\u0627\u0633\u06CC | \u0637\u0631\u0627\u062D\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9 | \u062A\u062F\u0648\u06CC\u0646 | \u06AF\u0648\u06CC\u0646\u062F\u06AF\u06CC",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0648\u0636\u0639\u06CC\u062A",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0633\u062A\u0648\u0646 \u06A9\u0627\u0646\u0628\u0627\u0646 \u0645\u062D\u062A\u0648\u0627",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645 (raw) | \u062F\u0631 \u0635\u0641 (todo) | \u062F\u0631 \u062D\u0627\u0644 \u0627\u0646\u062C\u0627\u0645 (doing) | \u062A\u06A9\u0645\u06CC\u0644 \u0634\u062F\u0647 (done)",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u062A\u0627\u0631\u06CC\u062E \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u0627\u0646\u062A\u0634\u0627\u0631 (\u0634\u0645\u0633\u06CC)",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0645\u062B\u0627\u0644: 1405/02/15",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0633\u0627\u0639\u062A \u0627\u0646\u062A\u0634\u0627\u0631",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0632\u0645\u0627\u0646 \u0627\u0646\u062A\u0634\u0627\u0631",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0645\u062B\u0627\u0644: 18:00",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u06A9\u067E\u0634\u0646 / \u062A\u0648\u0636\u06CC\u062D\u0627\u062A",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0645\u062A\u0646 \u06A9\u0627\u0645\u0644 \u06A9\u067E\u0634\u0646 \u06CC\u0627 \u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u062A\u0648\u0644\u06CC\u062F",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0645\u062A\u0646 \u0622\u0632\u0627\u062F",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0644\u06CC\u0646\u06A9 \u06A9\u0627\u0648\u0631",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0622\u062F\u0631\u0633 \u0627\u06CC\u0646\u062A\u0631\u0646\u062A\u06CC \u067E\u0648\u0633\u062A\u0631 \u06CC\u0627 \u062A\u0635\u0648\u06CC\u0631 \u06A9\u0627\u0648\u0631",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0622\u062F\u0631\u0633 \u06A9\u0627\u0645\u0644 HTTP/HTTPS",
      },
      {
        "\u0646\u0627\u0645 \u0633\u062A\u0648\u0646":
          "\u0644\u06CC\u0646\u06A9 \u0648\u06CC\u062F\u06CC\u0648",
        "\u0646\u0648\u0639": "\u0627\u062E\u062A\u06CC\u0627\u0631\u06CC",
        "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0648 \u0631\u0627\u0647\u0646\u0645\u0627":
          "\u0622\u062F\u0631\u0633 \u0627\u06CC\u0646\u062A\u0631\u0646\u062A\u06CC \u0641\u0627\u06CC\u0644 \u0648\u06CC\u062F\u06CC\u0648\u06CC\u06CC \u06CC\u0627 \u0636\u0645\u06CC\u0645\u0647",
        "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 / \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645":
          "\u0622\u062F\u0631\u0633 \u06A9\u0627\u0645\u0644 HTTP/HTTPS",
      },
    ];
    const wsGuide = xlsx.utils.json_to_sheet(guideData);
    xlsx.utils.book_append_sheet(
      wb,
      wsGuide,
      "\u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u0641\u0631\u0645\u062A",
    );
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Asva_Content_Depot_Template.xlsx"',
    );
    res.setHeader("Content-Length", buf.length);
    res.status(200).send(buf);
  } catch (e) {
    console.error("Error generating excel template:", e);
    res
      .status(500)
      .json({
        status: "error",
        message:
          "\u062E\u0637\u0627 \u062F\u0631 \u0627\u06CC\u062C\u0627\u062F \u0646\u0645\u0648\u0646\u0647 \u0641\u0627\u06CC\u0644 \u0627\u06A9\u0633\u0644",
      });
  }
});

subRouter.post(
  "/bulk_import_contents",
  checkPermission("depot"),
  upload.single("excel_file"),
  (req, res) => {
    try {
      let rawItems = [];
      if (req.file && req.file.buffer) {
        const wb = xlsx.read(req.file.buffer, { type: "buffer" });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        rawItems = xlsx.utils.sheet_to_json(ws);
      } else if (req.body && req.body.items) {
        rawItems =
          typeof req.body.items === "string"
            ? JSON.parse(req.body.items)
            : req.body.items;
      } else if (req.body && Array.isArray(req.body)) {
        rawItems = req.body;
      }
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "\u0647\u06CC\u0686 \u0631\u062F\u06CC\u0641\u06CC \u062C\u0647\u062A \u0648\u0631\u0648\u062F \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F",
          });
      }
      const defaultOrgId =
        organizations && organizations.length > 0 ? organizations[0].id : 1;
      const addedContents = [];
      let startId =
        contents.length > 0 ? contents.reduce((m, x) => (x.id > m ? x.id : m), 0) + 1 : 1;
      for (const raw of rawItems) {
        const title =
          raw[
            "\u0639\u0646\u0648\u0627\u0646 \u0645\u062D\u062A\u0648\u0627"
          ] ||
          raw["\u0639\u0646\u0648\u0627\u0646"] ||
          raw["title"] ||
          raw["Title"] ||
          raw["\u0646\u0627\u0645 \u0645\u062D\u062A\u0648\u0627"];
        if (!title || !title.toString().trim()) {
          continue;
        }
        const orgInput =
          raw[
            "\u0633\u0627\u0632\u0645\u0627\u0646 / \u0628\u0631\u0646\u062F"
          ] ||
          raw["\u0633\u0627\u0632\u0645\u0627\u0646"] ||
          raw["\u06A9\u0627\u0631\u0641\u0631\u0645\u0627"] ||
          raw["org_name"] ||
          raw["organization"] ||
          raw["org_id"];
        let targetOrgId = null;
        if (orgInput) {
          const orgInputStr = orgInput.toString().trim().toLowerCase();
          const foundOrg = organizations.find(
            (o) =>
              o.id == orgInput ||
              (o.org_name && o.org_name.toLowerCase() === orgInputStr) ||
              (o.org_name && o.org_name.toLowerCase().includes(orgInputStr)) ||
              (o.username && o.username.toLowerCase() === orgInputStr),
          );
          if (foundOrg) {
            targetOrgId = foundOrg.id;
          }
        }
        const typeInput =
          raw["\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0627"] ||
          raw["\u0646\u0648\u0639"] ||
          raw["content_type"] ||
          raw["type"];
        let targetType =
          "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC";
        if (typeInput) {
          const typeStr = typeInput.toString().trim();
          const foundType = (settings.content_type || []).find(
            (t) => t.setting_key.toLowerCase() === typeStr.toLowerCase(),
          );
          targetType = foundType ? foundType.setting_key : typeStr;
        }
        const pmInput =
          raw["\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647"] ||
          raw["project_manager"] ||
          raw["manager"];
        let targetPM = null;
        if (pmInput) {
          const pmStr = pmInput.toString().trim();
          const foundColl = colleagues.find(
            (c) =>
              c.id == pmStr ||
              (c.full_name &&
                c.full_name.toLowerCase().includes(pmStr.toLowerCase())) ||
              (c.username && c.username.toLowerCase() === pmStr.toLowerCase()),
          );
          targetPM = foundColl
            ? foundColl.full_name || foundColl.username
            : pmStr;
        }
        const colleaguesInput =
          raw[
            "\u0647\u0645\u06A9\u0627\u0631\u0627\u0646 (\u0628\u0627 \u06A9\u0627\u0645\u0627)"
          ] ||
          raw["\u0647\u0645\u06A9\u0627\u0631\u0627\u0646"] ||
          raw["assigned_colleagues"] ||
          raw["team"];
        let assignedColleagues = [];
        if (colleaguesInput) {
          const parts = colleaguesInput
            .toString()
            .split(/[,،|]/)
            .map((s) => s.trim())
            .filter(Boolean);
          assignedColleagues = parts.map((p) => {
            const found = colleagues.find(
              (c) =>
                c.id == p ||
                (c.full_name &&
                  c.full_name.toLowerCase().includes(p.toLowerCase())) ||
                (c.username && c.username.toLowerCase() === p.toLowerCase()),
            );
            return found ? found.full_name || found.username || found.id : p;
          });
        }
        const stagesInput =
          raw[
            "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F (\u0628\u0627 \u06A9\u0627\u0645\u0627)"
          ] ||
          raw[
            "\u0645\u0631\u0627\u062D\u0644 \u062A\u0648\u0644\u06CC\u062F"
          ] ||
          raw["\u0645\u0631\u0627\u062D\u0644"] ||
          raw["stages"];
        let stages = [];
        if (stagesInput) {
          if (Array.isArray(stagesInput)) {
            stages = stagesInput.map((s) => s.toString().trim());
          } else {
            stages = stagesInput
              .toString()
              .split(/[,،|]/)
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }
        const statusInput = (
          raw["\u0648\u0636\u0639\u06CC\u062A"] ||
          raw["status"] ||
          "raw"
        )
          .toString()
          .trim()
          .toLowerCase();
        let targetStatus = "raw";
        if (
          statusInput.includes("todo") ||
          statusInput.includes("\u0635\u0641")
        ) {
          targetStatus = "todo";
        } else if (
          statusInput.includes("doing") ||
          statusInput.includes("\u0627\u0646\u062C\u0627\u0645") ||
          statusInput.includes("\u062A\u0648\u0644\u06CC\u062F")
        ) {
          targetStatus = "in_progress";
        } else if (
          statusInput.includes("done") ||
          statusInput.includes("\u062A\u06A9\u0645\u06CC\u0644")
        ) {
          targetStatus = "done";
        } else if (statusInput.includes("\u0645\u0646\u062A\u0634\u0631")) {
          targetStatus = "published";
        } else if (
          statusInput.includes(
            "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
          )
        ) {
          targetStatus = "review";
        } else if (
          statusInput.includes(
            "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
          )
        ) {
          targetStatus = "client_review";
        } else if (statusInput.includes("\u0627\u0635\u0644\u0627\u062D")) {
          targetStatus = "needs_revision";
        } else if (
          statusInput.includes(
            "\u062A\u0627\u06CC\u06CC\u062F \u06A9\u0627\u0631\u0641\u0631\u0645\u0627",
          )
        ) {
          targetStatus = "approved_by_client";
        } else if (
          statusInput.includes(
            "\u0622\u0645\u0627\u062F\u0647 \u0627\u0646\u062A\u0634\u0627\u0631",
          )
        ) {
          targetStatus = "ready_to_publish";
        } else if (
          statusInput.includes("raw") ||
          statusInput.includes("\u062E\u0627\u0645")
        ) {
          targetStatus = "raw";
        }
        const publishDate = (
          raw[
            "\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631"
          ] ||
          raw["publish_date"] ||
          ""
        )
          .toString()
          .trim();
        const publishTime = (
          raw[
            "\u0633\u0627\u0639\u062A \u0627\u0646\u062A\u0634\u0627\u0631"
          ] ||
          raw["publish_time"] ||
          ""
        )
          .toString()
          .trim();
        const caption = (
          raw[
            "\u06A9\u067E\u0634\u0646 / \u062A\u0648\u0636\u06CC\u062D\u0627\u062A"
          ] ||
          raw["\u06A9\u067E\u0634\u0646"] ||
          raw["\u062A\u0648\u0636\u06CC\u062D\u0627\u062A"] ||
          raw["caption"] ||
          ""
        )
          .toString()
          .trim();
        const coverLink = (
          raw["\u0644\u06CC\u0646\u06A9 \u06A9\u0627\u0648\u0631"] ||
          raw["cover_link"] ||
          ""
        )
          .toString()
          .trim();
        const videoLink = (
          raw["\u0644\u06CC\u0646\u06A9 \u0648\u06CC\u062F\u06CC\u0648"] ||
          raw["video_link"] ||
          ""
        )
          .toString()
          .trim();
        const newContent = {
          id: startId++,
          title: title.toString().trim(),
          org_id: parseInt(targetOrgId),
          content_type: targetType,
          project_manager: targetPM,
          assigned_colleagues: assignedColleagues,
          stages,
          status: targetStatus,
          publish_date: publishDate,
          publish_time: publishTime,
          caption,
          cover_link: coverLink,
          video_link: videoLink,
          components_count: raw.components_count || {},
          created_at: new Date().toISOString(),
        };
        contents.unshift(newContent);
        addedContents.push(newContent);
      }
      if (addedContents.length > 0) {
        const username = req.session?.user?.username || "system";
        batch_operations.unshift({
          id: "batch_" + Date.now(),
          type: "bulk_import",
          title:
            "\u0648\u0631\u0648\u062F \u06AF\u0631\u0648\u0647\u06CC (\u0627\u06A9\u0633\u0644)",
          description: `\u062A\u0639\u062F\u0627\u062F ${addedContents.length} \u0645\u062D\u062A\u0648\u0627 \u0628\u0647 \u0635\u0648\u0631\u062A \u06AF\u0631\u0648\u0647\u06CC \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u0646\u062F.`,
          item_ids: addedContents.map((c) => c.id),
          user: username,
          timestamp: new Date().toISOString(),
          is_undone: false,
        });
      }
      saveDatabase();
      return res.json({
        status: "success",
        message: `${addedContents.length} \u0645\u062D\u062A\u0648\u0627\u06CC \u062C\u062F\u06CC\u062F \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0647 \u062F\u067E\u0648 \u0627\u0641\u0632\u0648\u062F\u0647 \u0634\u062F`,
        imported_count: addedContents.length,
        data: addedContents,
      });
    } catch (err) {
      console.error("Error bulk importing contents:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message:
            "\u062E\u0637\u0627 \u062F\u0631 \u067E\u0631\u062F\u0627\u0632\u0634 \u0641\u0627\u06CC\u0644 \u06CC\u0627 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0627\u06A9\u0633\u0644: " +
            err.message,
        });
    }
  },
);

subRouter.get(
  "/recycle_bin",
  checkPermission("recycle_bin"),
  (req, res) => {
    const session2 = req.session;
    if (!session2 || !session2.user)
      return res.status(401).json({ status: "error" });
    if (
      typeof session2.user !== "string" &&
      session2.user?.role_id === "client"
    )
      return res.status(403).json({ status: "error" });
    res.json({ status: "success", data: recycle_bin });
  },
);

subRouter.post(
  "/recycle_bin",
  checkPermission("recycle_bin"),
  (req, res) => {
    const { action, bin_id } = req.body;
    const idx = recycle_bin.findIndex((r) => r.id == bin_id);
    if (idx === -1)
      return res
        .status(404)
        .json({
          status: "error",
          message: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
        });
    const binItem = recycle_bin[idx];
    if (action === "restore") {
      if (binItem.table === "contents") {
        contents.push(binItem.data);
      } else if (binItem.table === "organizations") {
        organizations.push(binItem.data);
      } else if (binItem.table === "smartEventsBank") {
        smartEventsBank.push(binItem.data);
      } else if (binItem.table === "contentTemplates") {
        contentTemplates.push(binItem.data);
      } else if (binItem.table === "collections") {
        collections.push(binItem.data);
      }
      binItem.restored = true;
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC \u0634\u062F",
      });
    } else if (action === "delete_permanent") {
      recycle_bin.splice(idx, 1);
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0628\u0631\u0627\u06CC \u0647\u0645\u06CC\u0634\u0647 \u062D\u0630\u0641 \u0634\u062F",
      });
    }
    res.status(400).json({ status: "error" });
  },
);

subRouter.get("/get_templates", (req, res) => {
  res.json({ status: "success", templates: templatesData });
});

subRouter.post(
  "/manage_content_template",
  checkPermission("templates"),
  (req, res) => {
    const { action, template, templates } = req.body;
    if (action === "batch_add") {
      let currentId =
        contentTemplates.length > 0
          ? contentTemplates.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1
          : 1;
      templates.forEach((tpl) => {
        contentTemplates.push({
          id: currentId++,
          name: tpl.name,
          items: tpl.items.map((i) => ({ ...i, count: i.count || 1 })),
        });
      });
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0642\u0627\u0644\u0628\u200C\u0647\u0627 \u0627\u0636\u0627\u0641\u0647 \u0634\u062F\u0646\u062F",
      });
    } else if (action === "add") {
      const newId =
        contentTemplates.length > 0
          ? contentTemplates.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1
          : 1;
      contentTemplates.push({
        id: newId,
        name: template.name,
        items: template.items.map((i) => ({ ...i, count: i.count || 1 })),
      });
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0642\u0627\u0644\u0628 \u062C\u062F\u06CC\u062F \u0627\u0636\u0627\u0641\u0647 \u0634\u062F",
      });
    } else if (action === "update") {
      const tpl = contentTemplates.find((t) => t.id === parseInt(template.id));
      if (tpl) {
        tpl.name = template.name;
        tpl.items = template.items.map((i) => ({ ...i, count: i.count || 1 }));
        saveDatabase();
        return res.json({
          status: "success",
          message:
            "\u0642\u0627\u0644\u0628 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F",
        });
      }
      return res.json({
        status: "error",
        message:
          "\u0642\u0627\u0644\u0628 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
    } else if (action === "delete") {
      const tplToDelete = contentTemplates.find(
        (t) => t.id === parseInt(template.id),
      );
      if (tplToDelete) {
        recycle_bin.unshift({
          id: Date.now(),
          table: "contentTemplates",
          item_title:
            tplToDelete.title ||
            "\u0642\u0627\u0644\u0628 \u0645\u062D\u062A\u0648\u0627",
          data: tplToDelete,
          deleted_at: new Date().toISOString(),
          deleted_by:
            req.session && req.session.user && req.session.user.username
              ? req.session.user.username
              : "admin",
        });
        const idx = contentTemplates.findIndex(t => t.id === parseInt(template.id));
        if (idx > -1) contentTemplates.splice(idx, 1);
        saveDatabase();
        return res.json({
          status: "success",
          message:
            "\u0642\u0627\u0644\u0628 \u0628\u0647 \u0633\u0637\u0644 \u0632\u0628\u0627\u0644\u0647 \u0645\u0646\u062A\u0642\u0644 \u0634\u062F",
        });
      }
      return res.status(404).json({ status: "error" });
    }
    res.json({
      status: "error",
      message:
        "\u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
    });
  },
);

subRouter.get("/get_content_templates", (req, res) => {
  res.json(contentTemplates);
});

subRouter.post(
  "/apply_content_template",
  checkPermission("depot"),
  (req, res) => {
    const { template_id, org_id, year, month } = req.body;
    const tpl = contentTemplates.find((t) => t.id === parseInt(template_id));
    if (!tpl)
      return res.json({
        status: "error",
        message:
          "\u0642\u0627\u0644\u0628 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
    let tplItems =
      typeof tpl.items === "string" ? JSON.parse(tpl.items) : tpl.items;
    if (!Array.isArray(tplItems))
      return res.json({ status: "error", message: "Invalid template items" });
    tplItems.forEach((item) => {
      const newId =
        templateSuggestions.length > 0
          ? templateSuggestions.reduce((m, s) => (s.id > m ? s.id : m), 0) + 1
          : 1;
      templateSuggestions.push({
        id: newId,
        org_id: parseInt(org_id),
        year: parseInt(year),
        month: parseInt(month),
        day: item.dayOffset,
        content_type: item.type,
        topic: item.topic,
        status: "pending",
      });
    });
    saveDatabase().catch(console.error);
    res.json({
      status: "success",
      message:
        "\u0642\u0627\u0644\u0628 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u0639\u0645\u0627\u0644 \u0634\u062F",
    });
  },
);

subRouter.post("/dismiss_template_suggestion", (req, res) => {
  const { suggestion_id } = req.body;
  const sug = templateSuggestions.find((s) => s.id === parseInt(suggestion_id));
  if (sug) {
    sug.status = "dismissed";
    saveDatabase();
    res.json({ status: "success" });
  } else {
    res.json({ status: "error" });
  }
});

subRouter.post("/fulfill_template_suggestion", (req, res) => {
  const { suggestion_id, content_id } = req.body;
  const sug = templateSuggestions.find((s) => s.id === parseInt(suggestion_id));
  if (sug) {
    sug.status = "fulfilled";
    const c = contents.find((x) => x.id === parseInt(content_id));
    if (c) {
      const m = sug.month.toString().padStart(2, "0");
      const d = sug.day.toString().padStart(2, "0");
      c.publish_date = `${sug.year}/${m}/${d}`;
      if (c.status === "raw") c.status = "todo";
    }
    saveDatabase();
    res.json({ status: "success" });
  } else {
    res.json({ status: "error" });
  }
});

subRouter.post("/apply_template", checkPermission("depot"), (req, res) => {
  const { template_id, org_id } = req.body;
  const template = templatesData.find((t) => t.id == template_id);
  const org = organizations.find((o) => o.id == org_id);
  if (!template || !org) {
    return res.json({
      status: "error",
      message:
        "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.",
    });
  }
  let checklist = { tasks: [] };
  try {
    checklist = JSON.parse(template.checklist_data);
  } catch (e) {
    console.error("Error parsing checklist:", e);
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u062F\u0627\u062F\u0647\u200C\u0647\u0627\u06CC \u0627\u0644\u06AF\u0648 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.",
      });
  }
  let createdCount = 0;
  checklist.tasks.forEach((taskName) => {
    contents.unshift({
      id:
        contents.length > 0
          ? contents.reduce((m, c) => (c.id > m ? c.id : m), 0) + 1 + createdCount
          : 1,
      title: `${template.template_name} - ${taskName}`,
      org_id: org.id,
      content_type: template.industry_category,
      status: "raw",
      publish_date: new Date().toLocaleDateString("fa-IR"),
      publish_time: "12:00:00",
    });
    createdCount++;
  });
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message: `${createdCount} \u062A\u0633\u06A9 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062F\u0631 \u062F\u067E\u0648 \u0627\u06CC\u062C\u0627\u062F \u0634\u062F.`,
  });
});

subRouter.post(
  "/update_platform_metrics",
  checkPermission("depot"),
  (req, res) => {
    const { id, platform, data } = req.body;
    const card = contents.find((c) => c.id == id);
    if (card) {
      if (!card.platform_metrics) card.platform_metrics = {};
      card.platform_metrics[platform] = data;
      if (!card.published_platforms) card.published_platforms = [];
      if (data.status === "published" || data.status === "scheduled") {
        if (!card.published_platforms.includes(platform)) {
          card.published_platforms.push(platform);
        }
      } else {
        card.published_platforms = card.published_platforms.filter(
          (p) => p !== platform,
        );
      }
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u067E\u0644\u062A\u0641\u0631\u0645 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  },
);

subRouter.post(
  "/toggle_platform_published",
  checkPermission("depot"),
  (req, res) => {
    const { id, platform, status } = req.body;
    const card = contents.find((c) => c.id == id);
    if (card) {
      if (!card.published_platforms) card.published_platforms = [];
      if (status) {
        if (!card.published_platforms.includes(platform)) {
          card.published_platforms.push(platform);
        }
      } else {
        card.published_platforms = card.published_platforms.filter(
          (p) => p !== platform,
        );
      }
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "\u0648\u0636\u0639\u06CC\u062A \u067E\u0644\u062A\u0641\u0631\u0645 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  },
);

subRouter.post("/toggle_stage", checkPermission("depot"), (req, res) => {
  const { id, stage, isChecked } = req.body;
  const card = contents.find((c) => c.id == id);
  if (card) {
    if (!card.completed_stages) card.completed_stages = [];
    if (isChecked) {
      if (!card.completed_stages.includes(stage)) {
        card.completed_stages.push(stage);
      }
    } else {
      card.completed_stages = card.completed_stages.filter((s) => s !== stage);
    }
    saveDatabase();
    return res.json({
      status: "success",
      message:
        "\u0645\u0631\u062D\u0644\u0647 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F",
    });
  }
  return res
    .status(404)
    .json({
      status: "error",
      message:
        "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
    });
});

subRouter.post(
  "/batch_edit_contents",
  checkPermission("depot"),
  (req, res) => {
    try {
      const {
        ids,
        action,
        status,
        org_id,
        collection_title,
        content_type,
        project_manager,
        team,
        platforms,
        stages,
        components,
      } = req.body;
      const batchId = "batch_" + Date.now();
      const previousStates = [];
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.json({
          status: "error",
          message:
            "\u0647\u06CC\u0686 \u0645\u062D\u062A\u0648\u0627\u06CC\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.",
        });
      }
      const username = req.session?.user?.username || "system";
      let updatedCount = 0;
      let deletedBinIds = [];
      if (action === "delete") {
        for (const id of ids) {
          const idx = contents.findIndex((c) => c.id === parseInt(id));
          if (idx !== -1) {
            const itemToDelete = contents[idx];
            const binId = Date.now() + Math.floor(Math.random() * 1e6) + idx;
            deletedBinIds.push(binId);
            recycle_bin.unshift({
              id: binId,
              table: "contents",
              item_title:
                itemToDelete.title ||
                "\u0645\u062D\u062A\u0648\u0627\u06CC \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
              data: itemToDelete,
              deleted_at: new Date().toISOString(),
              deleted_by: username,
            });
            contents.splice(idx, 1);
            updatedCount++;
          }
        }
        addAuditLog(username, "batch_delete", req.ip);
      } else {
        for (const id of ids) {
          const card = contents.find((c) => c.id === parseInt(id));
          if (!card) continue;
          previousStates.push(JSON.parse(JSON.stringify(card)));
          if (action === "archive") {
            card.status = "archived";
            updatedCount++;
          } else if (action === "status" && status) {
            card.status = status;
            logContentActivity(card, req, `\u0648\u0636\u0639\u06CC\u062A \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u0628\u0647 ${status} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`);
            updatedCount++;
          } else if (action === "org") {
            const o = organizations.find((x) => x.id === parseInt(org_id));
            if (o) {
              card.org_id = o.id;
              card.org_name = o.org_name;
              card.org_color = o.color;
              card.org_logo = o.logo_url;
              logContentActivity(card, req, "ویرایش");
              updatedCount++;
            } else if (org_id === "") {
              card.org_id = null;
              card.org_name = "";
              card.org_color = "#4f46e5";
              card.org_logo = "";
              updatedCount++;
            }
          } else if (action === "collection" && collection_title !== void 0) {
            const colName = collection_title.trim();
            if (colName) {
              let existingCol = collections.find(
                (c) => c.title === colName && c.org_id === card.org_id,
              );
              if (!existingCol) {
                existingCol = {
                  id: collections.length
                    ? collections.reduce((m, c) => (c.id > m ? c.id : m), 0) + 1
                    : 1,
                  title: colName,
                  org_id: card.org_id,
                  created_at: new Intl.DateTimeFormat("fa-IR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date()),
                  is_active: 1,
                };
                collections.push(existingCol);
              }
              card.collection_id = existingCol.id;
            } else {
              card.collection_id = null;
            }
            logContentActivity(card, req, `\u0645\u062C\u0645\u0648\u0639\u0647 \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`);
            updatedCount++;
          } else if (action === "type" && content_type) {
            card.content_type = content_type;
            logContentActivity(card, req, "ویرایش");
            updatedCount++;
          } else if (action === "manager" && project_manager !== void 0) {
            card.project_manager = project_manager;
            logContentActivity(card, req, `\u0645\u062F\u06CC\u0631 \u067E\u0631\u0648\u0698\u0647 \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`);
            updatedCount++;
          } else if (action === "team" && Array.isArray(team)) {
            const teamNames = [];
            team.forEach((tId) => {
              const colUser = colleagues.find((c) => c.id === parseInt(tId));
              if (colUser) teamNames.push(colUser.full_name);
            });
            card.assigned_colleagues = teamNames;
            logContentActivity(card, req, "ویرایش");
            updatedCount++;
          } else if (action === "platforms" && Array.isArray(platforms)) {
            card.publish_platforms = platforms;
            updatedCount++;
          } else if (action === "stages" && Array.isArray(stages)) {
            card.stages = stages;
            updatedCount++;
          } else if (action === "components" && components) {
            card.components_count = components;
            logContentActivity(card, req, `\u062A\u0639\u062F\u0627\u062F \u0627\u062C\u0632\u0627 \u0631\u0627 \u062F\u0633\u062A\u0647\u062C\u0645\u0639\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`);
            updatedCount++;
          } else if (action === "shift_dates" && req.body.shift_days) {
            let shiftDays = parseInt(req.body.shift_days);
            if (!isNaN(shiftDays) && card.publish_date) {
              const [jYear, jMonth, jDay] = card.publish_date.split("/").map(Number);
              let gDate = jalaali.toGregorian(jYear, jMonth, jDay);
              let dateObj = new Date(gDate.gy, gDate.gm - 1, gDate.gd);
              dateObj.setDate(dateObj.getDate() + shiftDays);
              let newJ = jalaali.toJalaali(
                dateObj.getFullYear(),
                dateObj.getMonth() + 1,
                dateObj.getDate(),
              );
              card.publish_date = newJ.jy + "/" + newJ.jm + "/" + newJ.jd;
              card.publish_day = newJ.jd;
              card.publish_month = newJ.jm;
              updatedCount++;
            }
          }
        }
        addAuditLog(username, "batch_edit", req.ip);
      }
      if (updatedCount > 0) {
        if (action === "delete") {
          batch_operations.unshift({
            id: batchId,
            type: "batch_delete",
            title: "\u062D\u0630\u0641 \u06AF\u0631\u0648\u0647\u06CC",
            description: `\u062A\u0639\u062F\u0627\u062F ${updatedCount} \u0645\u062D\u062A\u0648\u0627 \u062D\u0630\u0641 \u06AF\u0631\u0648\u0647\u06CC \u0634\u062F\u0646\u062F.`,
            deleted_bin_ids: deletedBinIds,
            user: username,
            timestamp: new Date().toISOString(),
            is_undone: false,
          });
        } else {
          batch_operations.unshift({
            id: batchId,
            type: "batch_edit",
            title:
              "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u06AF\u0631\u0648\u0647\u06CC",
            description: `\u062A\u0639\u062F\u0627\u062F ${updatedCount} \u0645\u062D\u062A\u0648\u0627 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u06AF\u0631\u0648\u0647\u06CC \u0634\u062F\u0646\u062F.`,
            previous_states: previousStates,
            user: username,
            timestamp: new Date().toISOString(),
            is_undone: false,
          });
        }
      }
      saveDatabase();
      return res.json({ status: "success", updated: updatedCount });
    } catch (err) {
      return res.json({ status: "error", message: err.message });
    }
  },
);

subRouter.post(
  "/update_content_details",
  checkPermission("depot"),
  (req, res) => {
    const {
      id,
      title,
      caption,
      video_link,
      cover_link,
      org_id,
      collection_id,
      content_type,
      project_manager,
      assigned_colleagues,
      publish_date,
      publish_time,
      publish_platforms,
      stages,
      status,
    } = req.body;
    const card = contents.find((c) => c.id == id);
    if (card) {
      const prevState = JSON.parse(JSON.stringify(card));
      let changes = [];
      const oldStatus = card.status;
      const oldPublishDate = card.publish_date;
      const oldTitle = card.title;
      if (title !== void 0) card.title = title;
      
      if (caption !== void 0 && caption !== card.caption) {
        if (!card.version_history) card.version_history = [];
        card.version_history.push({
          id: Date.now() + Math.random(),
          field: "caption",
          old_value: card.caption,
          new_value: caption,
          user: req.session?.user?.username || "unknown",
    avatar: req.session?.user?.avatar_url || "/assets/images/default-avatar.png",
          timestamp: new Date().toISOString()
        });
        card.caption = caption;
      }

      if (video_link !== void 0) card.video_link = video_link;
      if (cover_link !== void 0) card.cover_link = cover_link;
      if (org_id !== void 0) card.org_id = org_id ? parseInt(org_id) : null;
      if (collection_id !== void 0) {
        if (
          typeof collection_id === "string" &&
          isNaN(parseInt(collection_id))
        ) {
          const newCol = {
            id: collections.length
              ? collections.reduce((m, c) => (c.id > m ? c.id : m), 0) + 1
              : 1,
            title: collection_id,
            org_id: card.org_id,
            created_at: new Intl.DateTimeFormat("fa-IR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date()),
            is_active: 1,
          };
          collections.push(newCol);
          card.collection_id = newCol.id;
        } else {
          card.collection_id = collection_id ? parseInt(collection_id) : null;
        }
      }
      if (content_type !== void 0) card.content_type = content_type;
      if (project_manager !== void 0) card.project_manager = project_manager;
      if (assigned_colleagues !== void 0) {
        const old_assigned = card.assigned_colleagues || [];
        card.assigned_colleagues = assigned_colleagues;
        const newlyAssigned = assigned_colleagues.filter(
          (x) => !old_assigned.includes(x),
        );
        newlyAssigned.forEach((colName) => {
          const colUser = colleagues.find((c) => c.full_name === colName);
          if (colUser) {
            addNotification("\u0627\u0631\u062C\u0627\u0639 \u06A9\u0627\u0631 \u062C\u062F\u06CC\u062F", `\u0645\u062D\u062A\u0648\u0627\u06CC "${card.title}" \u0628\u0647 \u0634\u0645\u0627 \u0627\u0631\u062C\u0627\u0639 \u062F\u0627\u062F\u0647 \u0634\u062F.`, "colleague", "");
          }
        });
      }
      if (publish_date !== void 0) card.publish_date = publish_date;
      if (publish_time !== void 0) card.publish_time = publish_time;
      if (publish_platforms !== void 0)
        card.publish_platforms = publish_platforms;
      if (stages !== void 0) card.stages = stages;
      if (req.body.components_count !== void 0)
        card.components_count = req.body.components_count;
      if (req.body.attachments !== void 0)
        card.attachments = req.body.attachments;
      if (status !== void 0) {
        if (card.status !== "done" && status === "done") {
          addNotification("\u0645\u062D\u062A\u0648\u0627\u06CC \u062C\u062F\u06CC\u062F \u0628\u0631\u0627\u06CC \u0628\u0631\u0631\u0633\u06CC", `\u0645\u062D\u062A\u0648\u0627\u06CC "${card.title}" \u062A\u0648\u0644\u06CC\u062F \u0634\u062F\u0647 \u0648 \u0622\u0645\u0627\u062F\u0647 \u0628\u0631\u0631\u0633\u06CC \u0648 \u062A\u0627\u06CC\u06CC\u062F \u0634\u0645\u0627\u0633\u062A.`, "client", "");
        }
        card.status = status;
      }
      if (title !== void 0 && oldTitle !== title)
        changes.push(
          `\u0639\u0646\u0648\u0627\u0646 \u0631\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
        );
      if (publish_date !== void 0 && oldPublishDate !== publish_date)
        changes.push(
          `\u062A\u0627\u0631\u06CC\u062E \u0627\u0646\u062A\u0634\u0627\u0631 \u0631\u0627 \u0627\u0632 ${oldPublishDate || "\u0646\u062F\u0627\u0634\u062A"} \u0628\u0647 ${publish_date} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
        );
      if (status !== void 0 && oldStatus !== status)
        changes.push(
          `\u0648\u0636\u0639\u06CC\u062A \u0631\u0627 \u0627\u0632 ${oldStatus || "\u0648\u0631\u0648\u062F\u06CC \u062E\u0627\u0645"} \u0628\u0647 ${status} \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F`,
        );
      if (changes.length > 0) {
        logContentActivity(card, req, changes.join(" \u0648 "));
      } else if (caption !== void 0 && oldTitle === title) {
        logContentActivity(card, req, "تغییر");
      } else if (
        org_id !== void 0 ||
        collection_id !== void 0 ||
        content_type !== void 0 ||
        project_manager !== void 0 ||
        assigned_colleagues !== void 0 ||
        publish_time !== void 0 ||
        publish_platforms !== void 0 ||
        stages !== void 0 ||
        req.body.components_count !== void 0
      ) {
        logContentActivity(card, req, "\u062C\u0632\u0626\u06CC\u0627\u062A \u0648 \u0645\u0634\u062E\u0635\u0627\u062A \u0645\u062D\u062A\u0648\u0627 \u0631\u0627 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u06A9\u0631\u062F");
      }
      saveDatabase();
      const io = getIO();
      if (io) io.emit("content_updated", { contentId: card.id, card });
      return res.json({ status: "success" });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u06A9\u0627\u0631\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  },
);

subRouter.get("/get_batch_operations", (req, res) => {
  const user = req.session && req.session.user ? req.session.user : null;
  const username = user && user.username ? user.username : "admin";
  let userOps = batch_operations;
  if (user && user.role_id !== 1) {
    userOps = batch_operations.filter((op) => op.user === username);
  }
  res.json({ status: "success", data: userOps });
});

subRouter.post("/undo_batch_operation", (req, res) => {
  const username =
    req.session && req.session.user && req.session.user.username
      ? req.session.user.username
      : "admin";
  const { batch_id } = req.body;
  const operation = batch_operations.find((op) => op.id === batch_id);
  if (!operation) {
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "\u0639\u0645\u0644\u06CC\u0627\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
      });
  }
  let opUser =
    typeof operation.user === "object"
      ? operation.user.username
      : operation.user;
  const isGlobalAdmin =
    (req.session &&
      req.session.user &&
      (req.session.user.role_id === 1 ||
        req.session.user.role_id === "admin")) ||
    username === "admin";
  if (opUser !== username && !isGlobalAdmin && opUser !== "system") {
    return res
      .status(403)
      .json({
        status: "error",
        message:
          "\u0634\u0645\u0627 \u0645\u062C\u0627\u0632 \u0628\u0647 \u0644\u063A\u0648 \u0627\u06CC\u0646 \u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u06CC\u0633\u062A\u06CC\u062F",
      });
  }
  if (operation.is_undone) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0627\u06CC\u0646 \u0639\u0645\u0644\u06CC\u0627\u062A \u0642\u0628\u0644\u0627\u064B \u0644\u063A\u0648 \u0634\u062F\u0647 \u0627\u0633\u062A",
      });
  }
  let errorMsg = null;
  if (operation.type === "batch_delete") {
    const binIds = operation.deleted_bin_ids || [];
    for (const binId of binIds) {
      const binIndex = recycle_bin.findIndex((b) => b.id === binId);
      if (binIndex !== -1) {
        const binItem = recycle_bin[binIndex];
        if (binItem.restored) continue;
        if (binItem.table === "contents") contents.unshift(binItem.data);
        else if (binItem.table === "organizations")
          organizations.unshift(binItem.data);
        else if (binItem.table === "smartEventsBank")
          smartEventsBank.unshift(binItem.data);
        else if (binItem.table === "contentTemplates")
          contentTemplates.unshift(binItem.data);
        binItem.restored = true;
      }
    }
  } else if (operation.type === "bulk_import") {
    const itemIds = operation.item_ids || [];
    for (const itemId of itemIds) {
      const idx = contents.findIndex((c) => c.id === itemId);
      if (idx !== -1) {
        recycle_bin.unshift({
          id: Date.now() + Math.random(),
          table: "contents",
          item_title:
            contents[idx].title ||
            "\u0645\u062D\u062A\u0648\u0627\u06CC \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
          data: contents[idx],
          deleted_at: new Date().toISOString(),
          deleted_by: username,
        });
        contents.splice(idx, 1);
      }
    }
  } else if (operation.type === "batch_edit") {
    const prevStates = operation.previous_states || [];
    for (const prevState of prevStates) {
      if (prevState && prevState.id) {
        const idx = contents.findIndex((c) => c.id === prevState.id);
        if (idx !== -1) {
          contents[idx] = { ...prevState };
        }
      }
    }
  } else {
    errorMsg =
      "\u0646\u0648\u0639 \u0639\u0645\u0644\u06CC\u0627\u062A \u0628\u0631\u0627\u06CC \u0644\u063A\u0648 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F";
  }
  if (errorMsg) {
    return res.status(400).json({ status: "error", message: errorMsg });
  }
  operation.is_undone = true;
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u0639\u0645\u0644\u06CC\u0627\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0644\u063A\u0648 \u0634\u062F",
  });
});



// --- NEW COLLABORATION ENDPOINTS ---

subRouter.post("/contents/:id/comments", checkPermission("depot"), (req, res) => {
  const { id } = req.params;
  const { text, mentions } = req.body; console.log("Received comment:", text, "for id:", id);
  const card = contents.find((c) => c.id == id);
  if (!card) return res.status(404).json({ status: "error", message: "Not found" });
  
  if (!card.comments) card.comments = [];
  const comment = {
    id: Date.now() + Math.random(),
    user: req.session?.user?.username || "unknown",
    avatar: req.session?.user?.avatar_url || "/assets/images/default-avatar.png",
    text,
    mentions: mentions || [],
    timestamp: new Date().toISOString()
  };
  card.comments.push(comment);
  saveDatabase();
  
  const io = getIO();
  if (io) io.emit("new_comment", { contentId: id, comment });
  
  res.json({ status: "success", comment });
});

subRouter.post("/contents/:id/attachments", checkPermission("depot"), (req, res) => {
  const { id } = req.params;
  const { name, url } = req.body;
  const card = contents.find((c) => c.id == id);
  if (!card) return res.status(404).json({ status: "error", message: "Not found" });
  
  if (!card.attachments) card.attachments = [];
  const attachment = {
    id: Date.now() + Math.random(),
    name,
    url,
    uploader: req.session?.user?.username || "unknown",
    avatar: req.session?.user?.avatar_url || "/assets/images/default-avatar.png",
    timestamp: new Date().toISOString()
  };
  card.attachments.push(attachment);
  saveDatabase();
  
  const io = getIO();
  if (io) io.emit("new_attachment", { contentId: id, attachment });
  
  res.json({ status: "success", attachment });
});

export default subRouter;
