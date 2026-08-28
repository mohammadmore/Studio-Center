import momentHijri from "moment-hijri";
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

subRouter.post(
  "/upload_smart_events",
  checkPermission("smart-events"),
  upload.single("excelFile"),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "\u0647\u06CC\u0686 \u0641\u0627\u06CC\u0644\u06CC \u0622\u067E\u0644\u0648\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.",
        });
    }
    try {
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
      const rows = data.slice(1);
      let addedCount = 0;
      rows.forEach((row) => {
        const title = row[0];
        const calendarTypeStr = row[1];
        const day = parseInt(row[2]);
        const month = parseInt(row[3]);
        let baseYear = parseInt(row[4]);
        if (isNaN(baseYear) || baseYear < 1300) {
          const jDate = jalaali.toJalaali(new Date());
          baseYear = jDate.jy;
        }
        const isHoliday = row[5] == 1 || row[5] == "1" ? 1 : 0;
        const isCustom = row[6];
        const orgName = row[7];
        if (!title || !calendarTypeStr || isNaN(day) || isNaN(month)) {
          return;
        }
        let calendar_type = "shamsi";
        if (
          typeof calendarTypeStr === "string" &&
          calendarTypeStr.includes("\u0642\u0645\u0631\u06CC")
        )
          calendar_type = "ghamari";
        else if (
          typeof calendarTypeStr === "string" &&
          calendarTypeStr.includes("\u0645\u06CC\u0644\u0627\u062F\u06CC")
        )
          calendar_type = "miladi";
        let org_id = null;
        if (
          (isCustom == 1 || isCustom == "1") &&
          orgName &&
          orgName !== "0" &&
          orgName !== 0
        ) {
          const cleanOrgName = orgName.toString().trim();
          let org = organizations.find(
            (o) => o.org_name && o.org_name.toString().trim() === cleanOrgName,
          );
          if (!org) {
            org = {
              id:
                organizations.length > 0
                  ? organizations.reduce((m, o) => (o.id > m ? o.id : m), 0) + 1
                  : 1,
              org_name: cleanOrgName,
              color: "#4f46e5",
            };
            organizations.push(org);
          }
          if (org) {
            org_id = org.id;
          }
        }
        const newEvent = {
          id:
            smartEventsBank.length > 0
              ? smartEventsBank.reduce((m, e) => (e.id > m ? e.id : m), 0) + 1
              : 1,
          title: title.toString(),
          calendar_type,
          base_year: baseYear,
          is_holiday: isHoliday,
          shamsi_month: month,
          shamsi_day: day,
          org_id,
        };
        smartEventsBank.push(newEvent);
        addedCount++;
      });
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message: `${addedCount} \u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0648\u0627\u0631\u062F \u0634\u062F.`,
      });
    } catch (e) {
      console.error(e);
      res
        .status(500)
        .json({
          status: "error",
          message:
            "\u062E\u0637\u0627 \u062F\u0631 \u067E\u0631\u062F\u0627\u0632\u0634 \u0641\u0627\u06CC\u0644 \u0627\u06A9\u0633\u0644.",
        });
    }
  },
);

subRouter.post(
  "/manage_smart_events",
  checkPermission("smart-events"),
  async (req, res) => {
    console.log("manage_smart_events body:", req.body);
    let {
      action,
      title,
      description,
      calendar_type,
      shamsi_month,
      shamsi_day,
      org_id,
      id,
      base_year,
      is_holiday,
    } = req.body;
    if (!base_year) {
      base_year = jalaali.toJalaali(new Date()).jy;
    } else {
      base_year = parseInt(base_year);
    }
    
    if (action === "delete") {
      if (req.session.user && req.session.user?.role_id != 1 && req.session.user?.role_id != 2) {
        return res
          .status(403)
          .json({
            status: "error",
            message:
              "\u0634\u0645\u0627 \u0645\u062C\u0627\u0632 \u0628\u0647 \u0627\u06CC\u0646 \u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u06CC\u0633\u062A\u06CC\u062F",
          });
      }
    }
    if (action === "add") {
      const newEvent = {
        id:
          smartEventsBank.length > 0
            ? smartEventsBank.reduce((m, e) => (e.id > m ? e.id : m), 0) + 1
            : 1,
        title,
        description,
        calendar_type,
        base_year,
        is_holiday: is_holiday ? 1 : 0,
        shamsi_month: parseInt(shamsi_month),
        shamsi_day: parseInt(shamsi_day),
        org_id: org_id ? parseInt(org_id as string) : null,
      };
      smartEventsBank.push(newEvent);
      saveDatabase().catch(console.error);
      return res.json({
        status: "success",
        message:
          "\u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0647 \u0628\u0627\u0646\u06A9 \u0627\u0636\u0627\u0641\u0647 \u0634\u062F",
      });
    }
    
    if (action === "delete") {
      const evId = parseInt(id);
      const evIndex = smartEventsBank.findIndex((e) => e.id === evId);
      if (evIndex !== -1) {
        recycle_bin.unshift({
          id: Date.now(),
          table: "smartEventsBank",
          item_title:
            smartEventsBank[evIndex].title ||
            "\u0645\u0646\u0627\u0633\u0628\u062A \u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646",
          data: smartEventsBank[evIndex],
          deleted_at: new Date().toISOString(),
          deleted_by:
            req.session && req.session.user && req.session.user.username
              ? req.session.user.username
              : "admin",
        });
        smartEventsBank.splice(evIndex, 1);
        saveDatabase().catch(console.error);
        return res.json({
          status: "success",
          message:
            "\u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0647 \u0633\u0637\u0644 \u0632\u0628\u0627\u0644\u0647 \u0645\u0646\u062A\u0642\u0644 \u0634\u062F",
        });
      }
      return res
        .status(404)
        .json({
          status: "error",
          message:
            "\u0645\u0646\u0627\u0633\u0628\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
        });
    }
    if (action === "edit") {
      const evId = parseInt(id);
      const evIndex = smartEventsBank.findIndex((e) => e.id === evId);
      if (evIndex !== -1) {
        smartEventsBank[evIndex] = {
          ...smartEventsBank[evIndex],
          title,
          description,
          calendar_type,
          base_year,
          is_holiday: is_holiday ? 1 : 0,
          shamsi_month: parseInt(shamsi_month),
          shamsi_day: parseInt(shamsi_day),
          org_id: org_id ? parseInt(org_id as string) : null,
        };
        saveDatabase().catch(console.error);
        return res.json({
          status: "success",
          message:
            "\u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F",
        });
      }
      return res
        .status(404)
        .json({
          status: "error",
          message:
            "\u0645\u0646\u0627\u0633\u0628\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
        });
    }
    res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
      });
  },
);

subRouter.post(
  "/add_client_events",
  checkPermission("smart-events"),
  (req, res) => {
    const { org_id, events, year, month, is_draft } = req.body;
    const numericOrgId = parseInt(org_id, 10);
    if (numericOrgId && Array.isArray(events) && year && month) {
      const org = organizations.find((o) => o.id == numericOrgId);
      const existingSelectionIndex = clientSelections.findIndex(
        (cs) =>
          cs.org_id == numericOrgId && cs.year == year && cs.month == month,
      );
      if (
        existingSelectionIndex >= 0 &&
        clientSelections[existingSelectionIndex].is_final
      ) {
        return res.json({
          status: "error",
          message:
            "\u0627\u06CC\u0646 \u0627\u0646\u062A\u062E\u0627\u0628 \u0642\u0628\u0644\u0627 \u0646\u0647\u0627\u06CC\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A.",
        });
      }
      let previousSyncedTitles = [];
      if (existingSelectionIndex >= 0) {
        previousSyncedTitles =
          clientSelections[existingSelectionIndex].depot_synced_titles ||
          clientSelections[existingSelectionIndex].selected_titles ||
          [];
        clientSelections[existingSelectionIndex].selected_titles = events.map(
          (ev) => ev.title,
        );
        clientSelections[existingSelectionIndex].is_final = !is_draft;
      } else {
        clientSelections.push({
          org_id: numericOrgId,
          year: parseInt(year, 10),
          month: parseInt(month, 10),
          selected_titles: events.map((ev) => ev.title),
          is_final: !is_draft,
        });
      }
      if (!is_draft) {
        const monthNames = [
          "",
          "\u0641\u0631\u0648\u0631\u062F\u06CC\u0646",
          "\u0627\u0631\u062F\u06CC\u0628\u0647\u0634\u062A",
          "\u062E\u0631\u062F\u0627\u062F",
          "\u062A\u06CC\u0631",
          "\u0645\u0631\u062F\u0627\u062F",
          "\u0634\u0647\u0631\u06CC\u0648\u0631",
          "\u0645\u0647\u0631",
          "\u0622\u0628\u0627\u0646",
          "\u0622\u0630\u0631",
          "\u062F\u06CC",
          "\u0628\u0647\u0645\u0646",
          "\u0627\u0633\u0641\u0646\u062F",
        ];
        const mName = monthNames[parseInt(month, 10)] || month;
        addNotification(null, null, "\u062A\u0627\u06CC\u06CC\u062F \u062A\u0642\u0648\u06CC\u0645 \u0645\u0646\u0627\u0633\u0628\u062A\u200C\u0647\u0627", `\u0646\u0645\u0627\u06CC\u0646\u062F\u0647 ${org ? org.org_name : ""} \u0645\u0646\u0627\u0633\u0628\u062A\u200C\u0647\u0627\u06CC ${mName}\u0645\u0627\u0647 ${year} \u0631\u0627 \u062A\u0627\u06CC\u06CC\u062F \u06A9\u0631\u062F.`);
        const colName =
          "\u0627\u0633\u062A\u0648\u0631\u06CC\u200C\u0647\u0627\u06CC \u0645\u0646\u0627\u0633\u0628\u062A\u06CC";
        let existingCol = collections.find(
          (c) =>
            c.title === colName &&
            (c.org_id === null || c.org_id === numericOrgId),
        );
        if (!existingCol) {
          existingCol = {
            id: collections.length
              ? collections.reduce((m, c) => (c.id > m ? c.id : m), 0) + 1
              : 1,
            title: colName,
            org_id: numericOrgId,
            created_at: new Intl.DateTimeFormat("fa-IR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date()),
            is_active: 1,
          };
          collections.push(existingCol);
        }
        const collectionId = existingCol.id;
        const currentTitles = events.map((ev) => ev.title);
        const toRemoveTitles = previousSyncedTitles.filter(
          (t) => !currentTitles.includes(t),
        );
        if (toRemoveTitles.length > 0) {
          for (let i = contents.length - 1; i >= 0; i--) {
            const c = contents[i];
            if (
              c.org_id === numericOrgId &&
              c.collection_id === collectionId &&
              toRemoveTitles.includes(c.title)
            ) {
              contents.splice(i, 1);
            }
          }
        }
        const selIndex =
          existingSelectionIndex >= 0
            ? existingSelectionIndex
            : clientSelections.length - 1;
        clientSelections[selIndex].depot_synced_titles = currentTitles;
        events.forEach((ev) => {
          const alreadyExists = contents.some(
            (c) =>
              c.org_id === numericOrgId &&
              c.collection_id === collectionId &&
              c.title === ev.title,
          );
          if (alreadyExists) return;
          const newId =
            contents.length > 0
              ? contents.reduce((m, c) => (c.id > m ? c.id : m), 0) + 1
              : 1;
          const bankEv = smartEventsBank.find(
            (e) =>
              e.title === ev.title &&
              (e.org_id === null || e.org_id === numericOrgId),
          );
          const calType = bankEv ? bankEv.calendar_type : "shamsi";
          let publishDate = "";
          let publishTime = "";
          if (calType === "ghamari") {
            const greg = jalaali.toGregorian(
              parseInt(year, 10),
              parseInt(month, 10),
              parseInt(ev.publish_day, 10) || 1,
            );
            const dateObj = new Date(greg.gy, greg.gm - 1, greg.gd);
            dateObj.setDate(dateObj.getDate() - 1);
            const prevJ = jalaali.toJalaali(dateObj);
            publishDate = `${prevJ.jy}/${prevJ.jm.toString().padStart(2, "0")}/${prevJ.jd.toString().padStart(2, "0")}`;
            publishTime = "19:00";
          } else {
            const m = month.toString().padStart(2, "0");
            const d = ev.publish_day
              ? ev.publish_day.toString().padStart(2, "0")
              : "01";
            publishDate = `${year}/${m}/${d}`;
            publishTime = "08:00";
          }
          contents.push({
            id: newId,
            title: ev.title,
            org_id: numericOrgId,
            org_name: org ? org.org_name : "",
            org_color: org ? org.color : "#4f46e5",
            org_logo: org ? org.logo_url : "",
            content_type:
              "\u0627\u0633\u062A\u0648\u0631\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
            components_count: {
              "\u0627\u0633\u062A\u0648\u0631\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC": 1,
            },
            collection_id: collectionId,
            project_manager: "",
            assigned_colleagues: [],
            publish_date: publishDate,
            publish_time: publishTime,
            stages: [
              "\u0637\u0631\u0627\u062D\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
            ],
            completed_stages: [],
            publish_platforms: [
              "\u0627\u06CC\u0646\u0633\u062A\u0627\u06AF\u0631\u0627\u0645",
              "\u062A\u0644\u06AF\u0631\u0627\u0645",
              "\u0628\u0644\u0647",
            ],
            platforms_published: [],
            status: "raw",
          });
        });
      }
      saveDatabase();
      return res.json({ status: "success" });
    }
    res.json({ status: "error" });
  },
);

subRouter.get("/get_smart_events_monthly", (req, res) => {
  const { year, month, org_id, for_client } = req.query;
  const y = parseInt(year as string);
  const m = parseInt(month as string);
  const filterOrgId = org_id ? parseInt(org_id as string) : null;
  const isForClient = for_client === "1";
  let selection = null;
  if (filterOrgId && y && m) {
    selection = clientSelections.find(
      (cs) => cs.org_id === filterOrgId && cs.year === y && cs.month === m,
    );
  }
  const currentJDate = jalaali.toJalaali(new Date());
  const rawEvents = smartEventsBank.filter((e) => {
    if (filterOrgId) {
      if (e.org_id && e.org_id !== filterOrgId) return false;
      if (selection && !isForClient) {
        return selection.selected_titles.includes(e.title);
      }
      return !e.org_id || e.org_id === filterOrgId;
    } else {
      return !e.org_id;
    }
  });
  const events = [];
  rawEvents.forEach((e) => {
    let baseYear = parseInt(e.base_year);
    if (!baseYear || isNaN(baseYear)) {
      baseYear = 1403;
    }
    let occurrences = [];
    if (e.calendar_type === "shamsi" || !e.calendar_type) {
      occurrences.push({ jMonth: e.shamsi_month, jDate: e.shamsi_day });
    } else if (e.calendar_type === "miladi") {
      const baseGreg = jalaali.toGregorian(
        baseYear,
        e.shamsi_month,
        e.shamsi_day,
      );
      const gMonth = baseGreg.gm;
      const gDate = baseGreg.gd;
      const gYear1 = y + 621;
      const gYear2 = y + 622;
      const j1 = jalaali.toJalaali(gYear1, gMonth, gDate);
      if (j1.jy === y) occurrences.push({ jMonth: j1.jm, jDate: j1.jd });
      const j2 = jalaali.toJalaali(gYear2, gMonth, gDate);
      if (j2.jy === y) occurrences.push({ jMonth: j2.jm, jDate: j2.jd });
    } else if (e.calendar_type === "ghamari") {
      const baseGreg = jalaali.toGregorian(
        baseYear,
        e.shamsi_month,
        e.shamsi_day,
      );
      const mBase = momentHijri([baseGreg.gy, baseGreg.gm - 1, baseGreg.gd]);
      const iMonth = mBase.iMonth();
      const iDate = mBase.iDate();
      const baseIYear = mBase.iYear();
      const diffY = y - baseYear;
      const approxIYear = baseIYear + diffY;
      for (let testY = approxIYear - 2; testY <= approxIYear + 2; testY++) {
        const mTest = momentHijri(
          `${testY}/${iMonth + 1}/${iDate}`,
          "iYYYY/iM/iD",
        );
        if (mTest.isValid()) {
          const jDate = jalaali.toJalaali(
            mTest.year(),
            mTest.month() + 1,
            mTest.date(),
          );
          if (jDate.jy === y) {
            occurrences.push({ jMonth: jDate.jm, jDate: jDate.jd });
          }
        }
      }
    }
    occurrences.forEach((occ) => {
      if (occ.jMonth === m) {
        let org_logo = null;
        let org_name = null;
        let org_color = "#6366f1";
        if (e.org_id) {
          const org = organizations.find((o) => o.id === e.org_id);
          if (org) {
            org_logo = org.logo_url;
            org_name = org.org_name;
            org_color = org.color || "#6366f1";
          }
        }
        events.push({
          id: e.id,
          publish_day: occ.jDate,
          title: e.title,
          calendar_type: e.calendar_type,
          is_holiday: e.is_holiday,
          org_id: e.org_id,
          org_logo,
          org_name,
          org_color,
          shamsi_month: occ.jMonth,
        });
      }
    });
  });
  const routine_holidays = settings.routine_holidays
    ? settings.routine_holidays
        .filter((h) => h.is_active === 1)
        .map((h) => h.id)
    : [5];
  res.json({
    status: "success",
    data: events,
    client_selection: selection ? selection.selected_titles : [],
    is_final: selection ? !!selection.is_final : false,
    unlock_reason: selection ? selection.unlock_reason : null,
    routine_holidays,
  });
});

subRouter.get("/get_events", (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    const smartEvents = [
      {
        id: 1,
        title: "\u0631\u0648\u0632 \u067E\u0632\u0634\u06A9",
        event_date: "\u06F1 \u0634\u0647\u0631\u06CC\u0648\u0631",
        calendar_type: "shamsi",
      },
      {
        id: 2,
        title: "\u0639\u06CC\u062F \u0633\u0639\u06CC\u062F \u0641\u0637\u0631",
        event_date: "\u06F1 \u0634\u0648\u0627\u0644",
        calendar_type: "ghamari",
      },
      {
        id: 3,
        title:
          "\u0631\u0648\u0632 \u062C\u0647\u0627\u0646\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9",
        event_date: "27 \u0622\u0648\u0631\u06CC\u0644",
        calendar_type: "miladi",
      },
      {
        id: 4,
        title: "\u0634\u0628 \u06CC\u0644\u062F\u0627",
        event_date: "\u06F3\u06F0 \u0622\u0630\u0631",
        calendar_type: "shamsi",
      },
      {
        id: 5,
        title:
          "\u0631\u0648\u0632 \u062C\u0647\u0627\u0646\u06CC \u0639\u06A9\u0627\u0633\u06CC",
        event_date: "19 \u0622\u06AF\u0648\u0633\u062A",
        calendar_type: "miladi",
      },
      {
        id: 6,
        title:
          "\u0633\u0627\u0644\u06AF\u0631\u062F \u062A\u0627\u0633\u06CC\u0633 \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
        event_date: "\u06F1\u06F5 \u0645\u0647\u0631",
        calendar_type: "custom",
      },
    ];
    saveDatabase();
    return res.json({ status: "success", events: smartEvents });
  }
  const padMonth = month.toString().padStart(2, "0");
  const searchPattern = `${year}/${padMonth}/`;
  const filteredContents = contents
    .filter((c) => {
      if (!c.publish_date) return false;
      const parts = c.publish_date.split("/");
      return (
        parts.length >= 2 &&
        parts[0] == year.toString() &&
        parseInt(parts[1]) === parseInt(month as string)
      );
    })
    .map((c) => {
      let all_publish_dates = [c.publish_date];
      if (c.is_recurring || c.is_recurrence_instance) {
        const pId = c.parent_id || c.id;
        const instances = contents.filter(
          (x) => x.id === pId || x.parent_id === pId,
        );
        all_publish_dates = instances
          .map((x) => x.publish_date)
          .filter(Boolean)
          .sort();
      }
      const parts = c.publish_date.split("/");
      const day = parseInt(parts[2]) || 1;
      const org = organizations.find((o) => o.id == c.org_id);
      return {
        ...c,
        publish_day: day,
        all_publish_dates,
        org_name: org
          ? org.org_name
          : "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
        org_color: org ? org.color || "#4f46e5" : "#4f46e5",
        org_logo: org ? org.logo_url : "",
      };
    });
  const filteredSuggestions = templateSuggestions.filter(
    (s) =>
      s.year === parseInt(year as string) &&
      s.month === parseInt(month as string) &&
      s.status === "pending",
  );
  const suggestionsWithOrg = filteredSuggestions.map((s) => {
    const org = organizations.find((o) => o.id == s.org_id);
    return {
      ...s,
      org_name: org
        ? org.org_name
        : "\u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
      org_color: org ? org.color || "#4f46e5" : "#4f46e5",
      org_logo: org ? org.logo_url : "",
    };
  });
  const routine_holidays = settings.routine_holidays
    ? settings.routine_holidays
        .filter((h) => h.is_active === 1)
        .map((h) => h.id)
    : [5];
  const special_holidays = [];
  const y = parseInt(year as string);
  const m = parseInt(month as string);
  smartEventsBank
    .filter((e) => e.is_holiday === 1)
    .forEach((e) => {
      if (e.calendar_type === "shamsi") {
        const evMonth = parseInt(e.shamsi_month || "0");
        const evDay = parseInt(e.shamsi_day || "0");
        if (evMonth === m && evDay) special_holidays.push(evDay);
      } else if (
        e.calendar_type === "ghamari" ||
        e.calendar_type === "miladi"
      ) {
      }
    });
  res.json({
    status: "success",
    data: filteredContents,
    suggestions: suggestionsWithOrg,
    routine_holidays,
    special_holidays,
  });
});

subRouter.post("/unlock_events", (req, res) => {
  const { org_id, type, reason } = req.body;
  if (!org_id || !type) {
    return res.json({
      status: "error",
      message:
        "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0642\u0635 \u0627\u0633\u062A",
    });
  }
  const currentJDate = jalaali.toJalaali(new Date());
  let targetYear = currentJDate.jy;
  let targetMonth = currentJDate.jm;
  if (type === "next") {
    targetMonth++;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear++;
    }
  }
  const numericOrgId = parseInt(org_id, 10);
  const existingSelectionIndex = clientSelections.findIndex(
    (cs) =>
      cs.org_id == numericOrgId &&
      cs.year == targetYear &&
      cs.month == targetMonth,
  );
  if (existingSelectionIndex >= 0) {
    clientSelections[existingSelectionIndex].is_final = false;
    clientSelections[existingSelectionIndex].unlock_reason = reason;
    const org = organizations.find((o) => o.id === numericOrgId);
    const orgName = org ? org.org_name : numericOrgId;
    addNotification(null, numericOrgId.toString(), "\u0628\u0627\u0632 \u0634\u062F\u0646 \u0642\u0641\u0644 \u0645\u0646\u0627\u0633\u0628\u062A\u200C\u0647\u0627", reason);
    const jalaaliDate = new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    audit_logs.unshift({
      id:
        audit_logs.length > 0
          ? audit_logs.reduce((m, a) => (a.id > m ? a.id : m), 0) + 1
          : 1,
      username: req.session.user || "admin",
      action: `\u0628\u0627\u0632\u06A9\u0631\u062F\u0646 \u0642\u0641\u0644 \u062A\u0642\u0648\u06CC\u0645 ${targetYear}/${targetMonth} \u0633\u0627\u0632\u0645\u0627\u0646 ${orgName} - \u062F\u0644\u06CC\u0644: ${reason || "\u0628\u062F\u0648\u0646 \u062F\u0644\u06CC\u0644"}`,
      ip:
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "127.0.0.1",
      created_at: jalaaliDate,
    });
    saveDatabase().catch(console.error);
    return res.json({
      status: "success",
      message:
        "\u0642\u0641\u0644 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0627\u0632 \u0634\u062F",
    });
  } else {
    return res.json({
      status: "success",
      message:
        "\u0642\u0641\u0644\u06CC \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0645\u0627\u0647 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
    });
  }
});

subRouter.post("/confirm_events", (req, res) => {
  const { selected_events, org_id } = req.body;
  if (!selected_events || selected_events.length === 0) {
    return res.json({
      status: "error",
      message:
        "\u0645\u0648\u0631\u062F\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u0646\u0634\u062F",
    });
  }
  const oId = parseInt(org_id as string) || 1;
  const org = organizations.find((o) => o.id == oId);
  let count = 0;
  selected_events.forEach((ev) => {
    contents.push({
      id: contents.length > 0 ? contents.reduce((m, x) => (x.id > m ? x.id : m), 0) + 1 : 1,
      title:
        "\u067E\u0633\u062A \u0645\u0646\u0627\u0633\u0628\u062A\u06CC: " + ev,
      org_id: oId,
      org_name: org ? org.org_name : "",
      org_color: org ? org.color : "#4f46e5",
      org_logo: org ? org.logo_url : "",
      content_type:
        "\u067E\u0648\u0633\u062A\u0631 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC",
      status: "raw",
      publish_date: "",
      publish_time: "",
    });
    if (req.session && req.session.user)
      addAuditLog(
        req.session.user || "\u0633\u06CC\u0633\u062A\u0645",
        "\u0627\u0641\u0632\u0648\u062F\u0646 \u0645\u062D\u062A\u0648\u0627/\u06A9\u0627\u0631\u062A \u062C\u062F\u06CC\u062F",
        req.ip || "127.0.0.1",
      );
    if (req.session && req.session.user)
      addAuditLog(
        req.session.user || "\u0633\u06CC\u0633\u062A\u0645",
        "\u0627\u0641\u0632\u0648\u062F\u0646 \u0645\u062D\u062A\u0648\u0627/\u06A9\u0627\u0631\u062A \u062C\u062F\u06CC\u062F",
        req.ip || "127.0.0.1",
      );
    count++;
  });
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      count +
      " \u0645\u0646\u0627\u0633\u0628\u062A \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062A\u0627\u06CC\u06CC\u062F \u0648 \u0628\u0647 \u0639\u0646\u0648\u0627\u0646 \u06A9\u0627\u0631\u062A \u062E\u0627\u0645 \u0628\u0647 \u062F\u067E\u0648\u06CC \u062A\u0648\u0644\u06CC\u062F \u0627\u0633\u062A\u0648\u062F\u06CC\u0648 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F!",
  });
});

export default subRouter;
