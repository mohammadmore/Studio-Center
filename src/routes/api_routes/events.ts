import express from "express";
import multer from "multer";
import * as jalaali from "jalaali-js";
import momentHijri from "moment-hijri";
import xlsx from "xlsx";
import {
  clientSelections,
  collections,
  contents,
  organizations,
  settings,
  smartEventsBank,
  templateSuggestions,
} from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission, clientOrgId, isClient } from "../../middleware/auth.js";
import { getRoleInfoForUser, hasPermission, isAdmin } from "../../utils/authUtils.js";
import { addAuditLog, addNotification } from "../../utils/logger.js";
import { nextId, toInt } from "../../utils/helpers.js";
import { moveToRecycleBin } from "../../utils/contentUtils.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
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
            "هیچ فایلی آپلود نشده است.",
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
          calendarTypeStr.includes("قمری")
        )
          calendar_type = "ghamari";
        else if (
          typeof calendarTypeStr === "string" &&
          calendarTypeStr.includes("میلادی")
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
              id: nextId(organizations),
              org_name: cleanOrgName,
              color: "#4f46e5",
              logo_url: "",
              username: "",
              passwordHash: "",
              is_active: 1,
            };
            organizations.push(org);
          }
          if (org) {
            org_id = org.id;
          }
        }
        const newEvent = {
          id:
            nextId(smartEventsBank),
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
        message: `${addedCount} مناسبت با موفقیت وارد شد.`,
      });
    } catch (e) {
      console.error(e);
      res
        .status(500)
        .json({
          status: "error",
          message:
            "خطا در پردازش فایل اکسل.",
        });
    }
  },
);

subRouter.post(
  "/manage_smart_events",
  checkPermission("smart-events"),
  async (req, res) => {
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
      // Deleting from the shared bank is limited to administrators and role 2 (managers).
      if (!isAdmin(req.user) && getRoleInfoForUser(req.user).role_id != 2) {
        return res
          .status(403)
          .json({
            status: "error",
            message:
              "شما مجاز به این عملیات نیستید",
          });
      }
    }
    if (action === "add") {
      const newEvent = {
        id:
          nextId(smartEventsBank),
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
          "مناسبت به بانک اضافه شد",
      });
    }
    
    if (action === "delete") {
      const evId = parseInt(id);
      const evIndex = smartEventsBank.findIndex((e) => e.id === evId);
      if (evIndex !== -1) {
        const ev = smartEventsBank[evIndex];
        moveToRecycleBin("smartEventsBank", ev, ev.title || "مناسبت بدون عنوان", req.user);
        smartEventsBank.splice(evIndex, 1);
        saveDatabase().catch(console.error);
        return res.json({
          status: "success",
          message:
            "مناسبت به سطل زباله منتقل شد",
        });
      }
      return res
        .status(404)
        .json({
          status: "error",
          message:
            "مناسبت یافت نشد",
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
            "مناسبت با موفقیت ویرایش شد",
        });
      }
      return res
        .status(404)
        .json({
          status: "error",
          message:
            "مناسبت یافت نشد",
        });
    }
    res
      .status(400)
      .json({
        status: "error",
        message:
          "عملیات نامعتبر",
      });
  },
);

subRouter.post(
  "/add_client_events",
  checkPermission(["smart-events", "organizations"], { allowClients: true }),
  (req: any, res) => {
    const { events, is_draft } = req.body;
    // A client can only submit the calendar of its own organisation.
    const numericOrgId = isClient(req) ? clientOrgId(req) : toInt(req.body.org_id);
    const year = toInt(req.body.year);
    const month = toInt(req.body.month);
    const validEvents =
      Array.isArray(events) && events.every((ev) => ev && typeof ev.title === "string");
    if (numericOrgId && validEvents && year && month && month >= 1 && month <= 12) {
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
            "این انتخاب قبلا نهایی شده است.",
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
          year: year,
          month: month,
          selected_titles: events.map((ev) => ev.title),
          is_final: !is_draft,
        });
      }
      if (!is_draft) {
        const monthNames = [
          "",
          "فروردین",
          "اردیبهشت",
          "خرداد",
          "تیر",
          "مرداد",
          "شهریور",
          "مهر",
          "آبان",
          "آذر",
          "دی",
          "بهمن",
          "اسفند",
        ];
        const mName = monthNames[month] || month;
        addNotification(
          "تایید تقویم مناسبت‌ها",
          `نماینده ${org ? org.org_name : ""} مناسبت‌های ${mName}ماه ${year} را تایید کرد.`,
          "admin",
          null,
          "/smart-events",
          "client_events",
          numericOrgId,
        );
        const colName =
          "استوری‌های مناسبتی";
        let existingCol = collections.find(
          (c) =>
            c.title === colName &&
            (c.org_id === null || c.org_id == numericOrgId),
        );
        if (!existingCol) {
          existingCol = {
            id: nextId(collections),
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
          // Deselected events leave the depot through the recycle bin, so work is never lost.
          for (let i = contents.length - 1; i >= 0; i--) {
            const c = contents[i];
            if (
              c.org_id == numericOrgId &&
              c.collection_id === collectionId &&
              toRemoveTitles.includes(c.title)
            ) {
              moveToRecycleBin("contents", c, c.title, req.user);
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
            nextId(contents);
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
              year,
              month,
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
              "استوری گرافیکی",
            components_count: {
              "استوری گرافیکی": 1,
            },
            collection_id: collectionId,
            project_manager: "",
            assigned_colleagues: [],
            publish_date: publishDate,
            publish_time: publishTime,
            stages: [
              "طراحی گرافیکی",
            ],
            completed_stages: [],
            publish_platforms: [
              "اینستاگرام",
              "تلگرام",
              "بله",
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

subRouter.get("/get_smart_events_monthly", (req: any, res) => {
  if (!isClient(req) && !hasPermission(req.user, ["calendar", "smart-events", "organizations"])) {
    return res.status(403).json({ status: "error", message: "عدم دسترسی" });
  }
  const { year, month, org_id, for_client } = req.query;
  const y = toInt(year);
  const m = toInt(month);
  const filterOrgId = isClient(req) ? clientOrgId(req) : org_id ? toInt(org_id) : null;
  const isForClient = for_client === "1" || isClient(req);
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
        return (selection.selected_titles || []).includes(e.title);
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

subRouter.get("/get_events", checkPermission(["calendar", "depot"]), (req, res) => {
  const { year, month } = req.query;
  if (!toInt(year) || !toInt(month)) {
    return res.json({ status: "success", data: [], events: [], suggestions: [] });
  }
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
          : "بدون سازمان",
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
        : "بدون سازمان",
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

subRouter.post("/unlock_events", checkPermission("organizations"), (req: any, res) => {
  const { org_id, type, reason } = req.body;
  if (!org_id || !type) {
    return res.json({ status: "error", message: "اطلاعات ناقص است" });
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
  const numericOrgId = toInt(org_id);
  const selection = clientSelections.find(
    (cs) => cs.org_id == numericOrgId && cs.year == targetYear && cs.month == targetMonth,
  );
  if (!selection) {
    return res.json({ status: "success", message: "قفلی برای این ماه یافت نشد" });
  }
  const reasonText = typeof reason === "string" ? reason.trim().slice(0, 1000) : "";
  selection.is_final = false;
  selection.unlock_reason = reasonText;
  const org = organizations.find((o) => o.id == numericOrgId);
  addNotification(
    "باز شدن قفل مناسبت‌ها",
    reasonText || "انتخاب مناسبت‌های شما برای ویرایش باز شد.",
    "client",
    numericOrgId,
    "/client-events",
    "events_unlocked",
  );
  addAuditLog(
    req.user,
    `بازکردن قفل تقویم ${targetYear}/${targetMonth} سازمان ${org ? org.org_name : numericOrgId} - دلیل: ${reasonText || "بدون دلیل"}`,
    req.ip,
  );
  saveDatabase();
  return res.json({ status: "success", message: "قفل با موفقیت باز شد" });
});

subRouter.post("/confirm_events", checkPermission("smart-events"), (req: any, res) => {
  const { selected_events } = req.body;
  if (!Array.isArray(selected_events) || selected_events.length === 0) {
    return res.json({ status: "error", message: "موردی انتخاب نشد" });
  }
  const oId = toInt(req.body.org_id);
  const org = organizations.find((o) => o.id == oId);
  if (!org) return res.status(400).json({ status: "error", message: "سازمان یافت نشد" });
  let count = 0;
  for (const ev of selected_events) {
    if (typeof ev !== "string" || !ev.trim()) continue;
    contents.push({
      id: nextId(contents),
      title: "پست مناسبتی: " + ev.trim(),
      org_id: org.id,
      org_name: org.org_name,
      org_color: org.color || "#4f46e5",
      org_logo: org.logo_url || "",
      content_type: "پوستر گرافیکی",
      status: "raw",
      publish_date: "",
      publish_time: "",
      created_at: new Date().toISOString(),
    });
    count++;
  }
  addAuditLog(req.user, `افزودن ${count} کارت مناسبتی برای ${org.org_name}`, req.ip);
  saveDatabase();
  res.json({
    status: "success",
    message: count + " مناسبت با موفقیت تایید و به عنوان کارت خام به دپوی تولید استودیو ارسال شد!",
  });
});

export default subRouter;
