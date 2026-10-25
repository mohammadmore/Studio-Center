import express from "express";
import multer from "multer";
import xlsx from "xlsx";
import {
  batch_operations,
  colleagues,
  collections,
  contents,
  contentTemplates,
  organizations,
  recycle_bin,
  settings,
  templateSuggestions,
} from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission } from "../../middleware/auth.js";
import { hasPermission, isAdmin } from "../../utils/authUtils.js";
import { addAuditLog, addNotification, logContentActivity } from "../../utils/logger.js";
import {
  addDaysToJalali,
  nextId,
  normalizeJalaliDate,
  toInt,
} from "../../utils/helpers.js";
import {
  cardColleagueIds,
  moveToRecycleBin,
  reDeleteBinItem,
  resolveColleagueIds,
  restoreBinItem,
} from "../../utils/contentUtils.js";
import { emitToStaff } from "../../utils/socket.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const subRouter = express.Router();

export const CONTENT_PERMS = ["depot", "calendar", "collections", "archive"];
const MAX_RECURRENCES = 366;

function actorName(req: any) {
  return req.user?.username || "system";
}

/** Content managers may edit any card; other colleagues only cards assigned to them. */
function canEditCard(req: any, card: any) {
  return hasPermission(req.user, CONTENT_PERMS) || cardColleagueIds(card).includes(Number(req.user?.id));
}

function forbidden(res: any) {
  return res.status(403).json({ status: "error", message: "عدم دسترسی" });
}

function withOrg(c: any, orgMap: Map<string, any>) {
  const parsedOrgId = c.org_id ? toInt(c.org_id) : null;
  const org = orgMap.get(String(c.org_id)) || (parsedOrgId && orgMap.get(String(parsedOrgId)));
  return {
    ...c,
    org_id: org ? org.id : parsedOrgId || c.org_id,
    org_name: org ? org.org_name : c.org_name || "بدون سازمان",
    org_color: org ? org.color : c.org_color || "#3b82f6",
    org_logo: org ? org.logo_url : c.org_logo || "",
  };
}

function orgMap() {
  const map = new Map<string, any>();
  organizations.forEach((o) => map.set(String(o.id), o));
  return map;
}

/** Creates the follow-up cards of a recurring card (bounded, with padded dates). */
function addRecurrences(card: any, interval: any, count: any) {
  const days = toInt(interval) || 0;
  const total = Math.min(toInt(count) || 0, MAX_RECURRENCES);
  if (days <= 0 || total <= 1 || !normalizeJalaliDate(card.publish_date)) return;
  for (let i = 1; i < total; i++) {
    contents.push({
      ...JSON.parse(JSON.stringify(card)),
      id: nextId(contents),
      publish_date: addDaysToJalali(card.publish_date, i * days),
      is_recurrence_instance: true,
      parent_id: card.id,
      activity_log: [],
      comments: [],
    });
  }
}

subRouter.get("/get_depot_contents", checkPermission(CONTENT_PERMS), (req, res) => {
  const map = orgMap();
  res.json({ status: "success", data: contents.map((c) => withOrg(c, map)) });
});

subRouter.get("/get_my_projects", (req: any, res) => {
  const user = req.user;
  const map = orgMap();
  const myProjects = contents
    .filter((c) => cardColleagueIds(c).includes(Number(user.id)) || c.project_manager === user.username)
    .map((c) => withOrg(c, map));
  res.json({ status: "success", data: myProjects });
});

subRouter.get("/get_org_contents", checkPermission(["calendar", "depot"]), (req, res) => {
  const org_id = toInt(req.query.org_id);
  const { col_id, status, platform: platformFilter } = req.query;
  const start_date = normalizeJalaliDate(req.query.start_date);
  const end_date = normalizeJalaliDate(req.query.end_date);
  const orgContents = contents.filter((c) => {
    if (c.org_id != org_id) return false;
    if (col_id && c.collection_id != col_id) return false;
    if (status && c.status != status) return false;
    if (platformFilter) {
      if (platformFilter === "بدون پلتفرم") {
        if (c.publish_platforms && c.publish_platforms.length > 0) return false;
      } else if (!c.publish_platforms || !c.publish_platforms.includes(platformFilter)) {
        return false;
      }
    }
    const date = normalizeJalaliDate(c.publish_date);
    if (start_date && date && date < start_date) return false;
    if (end_date && date && date > end_date) return false;
    return true;
  });
  res.json({ status: "success", data: orgContents });
});

subRouter.post("/bulk_schedule_contents", checkPermission(["calendar", "depot"]), (req, res) => {
  const { items, force } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.json({ status: "error", message: "اطلاعات نامعتبر" });
  }
  const warnings: string[] = [];
  const validUpdates: { card: any; item: any }[] = [];
  items.forEach((item, index) => {
    const rowNum = index + 2;
    const contentId = toInt(item?.content_id);
    if (!contentId) return;
    if (!item.org_name || !String(item.org_name).trim()) return;
    const card = contents.find((c) => c.id === contentId);
    if (!card) return;
    const cardOrg = organizations.find((o) => o.id == card.org_id);
    const expectedOrgName = cardOrg ? String(cardOrg.org_name).trim() : "بدون سازمان";
    const providedOrgName = String(item.org_name).trim();
    if (expectedOrgName !== providedOrgName) {
      warnings.push(
        `ردیف ${rowNum}: شناسه ${contentId} مربوط به «${expectedOrgName}» است، اما شما «${providedOrgName}» را وارد کرده‌اید.`,
      );
    }
    validUpdates.push({ card, item });
  });
  if (validUpdates.length === 0 && warnings.length === 0) {
    return res.json({ status: "error", message: "هیچ ردیف معتبری برای بروزرسانی یافت نشد." });
  }
  if (warnings.length > 0 && !force) {
    return res.json({ status: "warning", warnings });
  }
  validUpdates.forEach(({ card, item }) => {
    const date = normalizeJalaliDate(item.publish_date);
    if (date) card.publish_date = date;
    if (item.publish_time) card.publish_time = String(item.publish_time);
  });
  saveDatabase();
  return res.json({
    status: "success",
    message: `${validUpdates.length} محتوا با موفقیت برنامه‌ریزی شدند.`,
  });
});

subRouter.post("/schedule_content", checkPermission(["calendar", "depot"]), (req, res) => {
  const {
    id,
    publish_date,
    publish_time,
    is_recurring,
    recurrence_interval_days,
    recurrence_count,
    count_in_stats,
  } = req.body;
  const card = contents.find((c) => c.id == id);
  if (!card) return res.status(404).json({ status: "error", message: "کارت یافت نشد" });
  card.publish_date = normalizeJalaliDate(publish_date) || "";
  if (publish_time !== undefined) card.publish_time = publish_time;
  if (req.body.status) card.status = req.body.status;
  card.is_recurring = !!is_recurring;
  card.recurrence_interval_days = recurrence_interval_days;
  card.recurrence_count = recurrence_count;
  card.count_in_stats = count_in_stats;
  logContentActivity(card, req, `زمان انتشار را روی ${card.publish_date || "بدون تاریخ"} تنظیم کرد`);
  if (is_recurring) addRecurrences(card, recurrence_interval_days, recurrence_count);
  saveDatabase();
  emitToStaff("content_updated", { contentId: card.id, card });
  return res.json({ status: "success", message: "محتوا برنامه‌ریزی شد" });
});

subRouter.post("/add_content", checkPermission(CONTENT_PERMS), (req: any, res) => {
  const { action, id, status, title, type, org_id, is_recurring, recurrence_interval_days, recurrence_count, count_in_stats } =
    req.body;
  if (action === "delete") {
    const idx = contents.findIndex((c) => c.id == id);
    if (idx === -1) return res.status(404).json({ status: "error", message: "یافت نشد" });
    const item = contents[idx];
    const binId = moveToRecycleBin("contents", item, item.title || "محتوای بدون عنوان", req.user);
    batch_operations.unshift({
      id: "batch_" + Date.now(),
      type: "batch_delete",
      title: "حذف محتوا",
      description: `محتوای "${item.title}" حذف شد.`,
      deleted_bin_ids: [binId],
      user: actorName(req),
      timestamp: new Date().toISOString(),
      is_undone: false,
    });
    contents.splice(idx, 1);
    saveDatabase();
    return res.json({ status: "success", message: "محتوا به سطل زباله منتقل شد", bin_id: binId });
  }
  if (action === "update_status") {
    const card = contents.find((c) => c.id == id);
    if (!card) return res.status(404).json({ status: "error", message: "کارت یافت نشد" });
    if (!status || typeof status !== "string") {
      return res.status(400).json({ status: "error", message: "وضعیت نامعتبر" });
    }
    batch_operations.unshift({
      id: "batch_" + Date.now(),
      type: "batch_edit",
      title: "تغییر وضعیت محتوا",
      description: `وضعیت "${card.title}" از ${card.status || "ورودی خام"} به ${status} تغییر یافت.`,
      previous_states: [JSON.parse(JSON.stringify(card))],
      user: actorName(req),
      timestamp: new Date().toISOString(),
      is_undone: false,
    });
    logContentActivity(card, req, `وضعیت را از ${card.status || "raw"} به ${status} تغییر داد`);
    notifyStatusChange(card, status);
    card.status = status;
    saveDatabase();
    emitToStaff("content_updated", { contentId: card.id, card });
    return res.json({ status: "success" });
  }
  if (action) return res.status(400).json({ status: "error", message: "عملیات نامعتبر" });

  const orgId = org_id ? toInt(org_id) : null;
  const newContent: any = {
    batch_id: "batch_" + Date.now(),
    id: nextId(contents),
    title: String(title || "").trim() || "محتوای بدون عنوان",
    org_id: orgId && organizations.some((o) => o.id == orgId) ? orgId : null,
    content_type: type || "پوستر گرافیکی",
    project_manager: req.body.project_manager || null,
    assigned_colleagues: Array.isArray(req.body.assigned_colleagues) ? req.body.assigned_colleagues : [],
    stages: Array.isArray(req.body.stages) ? req.body.stages : [],
    status: req.body.status || "raw",
    publish_date: normalizeJalaliDate(req.body.publish_date),
    publish_time: req.body.publish_time || "",
    components_count: req.body.components_count || {},
    is_recurring: !!is_recurring,
    recurrence_interval_days,
    recurrence_count,
    count_in_stats,
    created_at: new Date().toISOString(),
  };
  logContentActivity(newContent, req, "محتوا را ایجاد کرد");
  contents.unshift(newContent);
  if (is_recurring) addRecurrences(newContent, recurrence_interval_days, recurrence_count);
  notifyNewAssignees(newContent, []);
  saveDatabase();
  res.json({ status: "success", message: "محتوای جدید اضافه شد", data: newContent });
});

function notifyNewAssignees(card: any, previous: unknown[]) {
  const before = new Set(resolveColleagueIds(previous));
  for (const colleagueId of resolveColleagueIds(card.assigned_colleagues)) {
    if (before.has(colleagueId)) continue;
    addNotification(
      "ارجاع کار جدید",
      `محتوای "${card.title}" به شما ارجاع داده شد.`,
      "colleague",
      colleagueId,
      "/my-projects",
      "assignment",
      card.id,
    );
  }
}

function notifyStatusChange(card: any, status: string) {
  const review = ["client_review", "pending_client_review"];
  if (card.status !== status && review.includes(status) && card.org_id) {
    addNotification(
      "محتوای جدید برای بررسی",
      `محتوای "${card.title}" تولید شده و آماده بررسی و تایید شماست.`,
      "client",
      card.org_id,
      "/client-review",
      "client_review",
      card.id,
    );
  }
}

subRouter.get("/download_content_excel_template", checkPermission("depot"), (req, res) => {
  try {
    const wb = xlsx.utils.book_new();
    const sampleOrg =
      organizations && organizations.length > 0
        ? organizations[0].org_name
        : "کیان تیم";
    const sampleManager =
      colleagues && colleagues.length > 0
        ? colleagues[0].full_name || colleagues[0].username
        : "مدیر کل (Admin)";
    const templateData = [
      {
        "عنوان محتوا":
          "ویدیوی معرفی محصول جدید",
        "سازمان / برند":
          sampleOrg,
        "نوع محتوا":
          "پست ویدیویی",
        "مدیر پروژه":
          sampleManager,
        "همکاران (با کاما)":
          "تدوینگر, مدیر داخلی",
        "مراحل تولید (با کاما)":
          "پژوهش و سناریو, فیلمبرداری, تدوین",
        "وضعیت":
          "ورودی خام",
        "تاریخ انتشار":
          "1405/02/15",
        "ساعت انتشار":
          "18:00",
        "کپشن / توضیحات":
          "سناریوی پیشنهادی برای ویدیوی معرفی محصول جدید...",
        "لینک کاور":
          "https://example.com/cover1.jpg",
        "لینک ویدیو":
          "https://example.com/video1.mp4",
      },
      {
        "عنوان محتوا":
          "پوستر تخفیفات ویژه فصل",
        "سازمان / برند":
          sampleOrg,
        "نوع محتوا":
          "پوستر گرافیکی",
        "مدیر پروژه":
          sampleManager,
        "همکاران (با کاما)":
          "طراح گرافیک",
        "مراحل تولید (با کاما)":
          "طراحی گرافیک",
        "وضعیت": "در صف",
        "تاریخ انتشار":
          "1405/02/20",
        "ساعت انتشار":
          "12:00",
        "کپشن / توضیحات":
          "طراحی بنر و پوستر تخفیفات...",
        "لینک کاور": "",
        "لینک ویدیو": "",
      },
    ];
    const wsData = xlsx.utils.json_to_sheet(templateData);
    xlsx.utils.book_append_sheet(
      wb,
      wsData,
      "دپوی محتوا",
    );
    const availableOrgs = (organizations || [])
      .map((o) => o.org_name)
      .join(" | ");
    const availableTypes = ((settings && settings.content_type) || [])
      .map((t: any) => t.setting_key)
      .join(" | ");
    const availableColleagues = (colleagues || [])
      .map((c) => c.full_name || c.username)
      .join(" | ");
    const guideData = [
      {
        "نام ستون":
          "عنوان محتوا",
        "نوع": "اجباری",
        "توضیحات و راهنما":
          "نام یا تیتر اصلی کارت محتوا",
        "مقادیر معتبر / موجود در سیستم":
          "هر عنوان دلخواه",
      },
      {
        "نام ستون":
          "سازمان / برند",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "نام کارفرما یا برندی که محتوا متعلق به آن است",
        "مقادیر معتبر / موجود در سیستم":
          availableOrgs ||
          "نام سازمان‌های ثبت‌شده در سیستم",
      },
      {
        "نام ستون":
          "نوع محتوا",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "فرمت و قالب محتوای تولیدی",
        "مقادیر معتبر / موجود در سیستم":
          availableTypes ||
          "پوستر گرافیکی | پست ویدیویی | مقاله سئو ...",
      },
      {
        "نام ستون":
          "مدیر پروژه",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "نام یا نامکاربری مدیر پروژه مسئول",
        "مقادیر معتبر / موجود در سیستم":
          availableColleagues ||
          "نام پرسنل استودیو",
      },
      {
        "نام ستون":
          "همکاران (با کاما)",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "اسامی همکاران درگیر که با کاما (,) یا | از هم جدا شده‌اند",
        "مقادیر معتبر / موجود در سیستم":
          availableColleagues,
      },
      {
        "نام ستون":
          "مراحل تولید (با کاما)",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "مراحل خط تولید محتوا که با کاما جدا می‌شوند",
        "مقادیر معتبر / موجود در سیستم":
          "پژوهش و سناریو | فیلمبرداری | عکاسی | طراحی گرافیک | تدوین | گویندگی",
      },
      {
        "نام ستون":
          "وضعیت",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "ستون کانبان محتوا",
        "مقادیر معتبر / موجود در سیستم":
          "ورودی خام (raw) | در صف (todo) | در حال انجام (doing) | تکمیل شده (done)",
      },
      {
        "نام ستون":
          "تاریخ انتشار",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "تاریخ برنامه‌ریزی انتشار (شمسی)",
        "مقادیر معتبر / موجود در سیستم":
          "مثال: 1405/02/15",
      },
      {
        "نام ستون":
          "ساعت انتشار",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "زمان انتشار",
        "مقادیر معتبر / موجود در سیستم":
          "مثال: 18:00",
      },
      {
        "نام ستون":
          "کپشن / توضیحات",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "متن کامل کپشن یا توضیحات تولید",
        "مقادیر معتبر / موجود در سیستم":
          "متن آزاد",
      },
      {
        "نام ستون":
          "لینک کاور",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "آدرس اینترنتی پوستر یا تصویر کاور",
        "مقادیر معتبر / موجود در سیستم":
          "آدرس کامل HTTP/HTTPS",
      },
      {
        "نام ستون":
          "لینک ویدیو",
        "نوع": "اختیاری",
        "توضیحات و راهنما":
          "آدرس اینترنتی فایل ویدیویی یا ضمیمه",
        "مقادیر معتبر / موجود در سیستم":
          "آدرس کامل HTTP/HTTPS",
      },
    ];
    const wsGuide = xlsx.utils.json_to_sheet(guideData);
    xlsx.utils.book_append_sheet(
      wb,
      wsGuide,
      "راهنمای فرمت",
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
          "خطا در ایجاد نمونه فایل اکسل",
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
        try {
          rawItems =
            typeof req.body.items === "string" ? JSON.parse(req.body.items) : req.body.items;
        } catch {
          return res.status(400).json({ status: "error", message: "اطلاعات ارسالی نامعتبر است" });
        }
      } else if (req.body && Array.isArray(req.body)) {
        rawItems = req.body;
      }
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "هیچ ردیفی جهت ورود پیدا نشد",
          });
      }
      const addedContents = [];
      if (rawItems.length > 5000) {
        return res.status(400).json({ status: "error", message: "حداکثر ۵۰۰۰ ردیف در هر بار مجاز است" });
      }
      let startId = nextId(contents);
      for (const raw of rawItems) {
        if (!raw || typeof raw !== "object") continue;
        const title =
          raw[
            "عنوان محتوا"
          ] ||
          raw["عنوان"] ||
          raw["title"] ||
          raw["Title"] ||
          raw["نام محتوا"];
        if (!title || !title.toString().trim()) {
          continue;
        }
        const orgInput =
          raw[
            "سازمان / برند"
          ] ||
          raw["سازمان"] ||
          raw["کارفرما"] ||
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
          raw["نوع محتوا"] ||
          raw["نوع"] ||
          raw["content_type"] ||
          raw["type"];
        let targetType =
          "پوستر گرافیکی";
        if (typeInput) {
          const typeStr = typeInput.toString().trim();
          const foundType = (settings.content_type || []).find(
            (t: any) => String(t.setting_key || "").toLowerCase() === typeStr.toLowerCase(),
          );
          targetType = foundType ? foundType.setting_key : typeStr;
        }
        const pmInput =
          raw["مدیر پروژه"] ||
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
            "همکاران (با کاما)"
          ] ||
          raw["همکاران"] ||
          raw["assigned_colleagues"] ||
          raw["team"];
        let assignedColleagues = [];
        if (colleaguesInput) {
          const parts = colleaguesInput
            .toString()
            .split(/[,،|]/)
            .map((s: any) => s.trim())
            .filter(Boolean);
          assignedColleagues = parts.map((p: any) => {
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
            "مراحل تولید (با کاما)"
          ] ||
          raw[
            "مراحل تولید"
          ] ||
          raw["مراحل"] ||
          raw["stages"];
        let stages = [];
        if (stagesInput) {
          if (Array.isArray(stagesInput)) {
            stages = stagesInput.map((s) => s.toString().trim());
          } else {
            stages = stagesInput
              .toString()
              .split(/[,،|]/)
              .map((s: any) => s.trim())
              .filter(Boolean);
          }
        }
        const statusInput = (
          raw["وضعیت"] ||
          raw["status"] ||
          "raw"
        )
          .toString()
          .trim()
          .toLowerCase();
        let targetStatus = "raw";
        if (
          statusInput.includes("todo") ||
          statusInput.includes("صف")
        ) {
          targetStatus = "todo";
        } else if (
          statusInput.includes("doing") ||
          statusInput.includes("انجام") ||
          statusInput.includes("تولید")
        ) {
          targetStatus = "in_progress";
        } else if (
          statusInput.includes("done") ||
          statusInput.includes("تکمیل")
        ) {
          targetStatus = "done";
        } else if (statusInput.includes("منتشر")) {
          targetStatus = "published";
        } else if (
          statusInput.includes(
            "ارزیابی استودیو",
          )
        ) {
          targetStatus = "review";
        } else if (
          statusInput.includes(
            "ارزیابی کارفرما",
          )
        ) {
          targetStatus = "client_review";
        } else if (statusInput.includes("اصلاح")) {
          targetStatus = "needs_revision";
        } else if (
          statusInput.includes(
            "تایید کارفرما",
          )
        ) {
          targetStatus = "approved_by_client";
        } else if (
          statusInput.includes(
            "آماده انتشار",
          )
        ) {
          targetStatus = "ready_to_publish";
        } else if (
          statusInput.includes("raw") ||
          statusInput.includes("خام")
        ) {
          targetStatus = "raw";
        }
        const publishDate = normalizeJalaliDate(raw["تاریخ انتشار"] || raw["publish_date"] || "");
        const publishTime = (
          raw[
            "ساعت انتشار"
          ] ||
          raw["publish_time"] ||
          ""
        )
          .toString()
          .trim();
        const caption = (
          raw[
            "کپشن / توضیحات"
          ] ||
          raw["کپشن"] ||
          raw["توضیحات"] ||
          raw["caption"] ||
          ""
        )
          .toString()
          .trim();
        const coverLink = (
          raw["لینک کاور"] ||
          raw["cover_link"] ||
          ""
        )
          .toString()
          .trim();
        const videoLink = (
          raw["لینک ویدیو"] ||
          raw["video_link"] ||
          ""
        )
          .toString()
          .trim();
        const newContent = {
          id: startId++,
          title: title.toString().trim(),
          org_id: targetOrgId,
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
        const username = actorName(req);
        batch_operations.unshift({
          id: "batch_" + Date.now(),
          type: "bulk_import",
          title:
            "ورود گروهی (اکسل)",
          description: `تعداد ${addedContents.length} محتوا به صورت گروهی اضافه شدند.`,
          item_ids: addedContents.map((c) => c.id),
          user: username,
          timestamp: new Date().toISOString(),
          is_undone: false,
        });
      }
      saveDatabase();
      return res.json({
        status: "success",
        message: `${addedContents.length} محتوای جدید با موفقیت به دپو افزوده شد`,
        imported_count: addedContents.length,
        data: addedContents,
      });
    } catch (err) {
      console.error("Error bulk importing contents:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message: "خطا در پردازش فایل یا اطلاعات اکسل",
        });
    }
  },
);

subRouter.get("/recycle_bin", checkPermission("recycle_bin"), (req, res) => {
  res.json({ status: "success", data: recycle_bin });
});

subRouter.post("/recycle_bin", (req: any, res) => {
  const { action, bin_id } = req.body;
  const binItem = recycle_bin.find((r) => r.id == bin_id);
  if (!binItem) return res.status(404).json({ status: "error", message: "یافت نشد" });
  const isManager = hasPermission(req.user, "recycle_bin");
  // Whoever deleted something may undo it right away (the "undo" toast).
  const isOwnDeletion = binItem.deleted_by === req.user.username;
  if (action === "restore") {
    if (!isManager && !isOwnDeletion) return forbidden(res);
    if (!restoreBinItem(binItem)) {
      return res.status(400).json({ status: "error", message: "این مورد قبلا بازیابی شده است" });
    }
    saveDatabase();
    return res.json({ status: "success", message: "با موفقیت بازیابی شد" });
  }
  if (action === "delete_again") {
    // Undo of a restore: the item goes back into the bin.
    if (!isManager && !isOwnDeletion) return forbidden(res);
    if (!reDeleteBinItem(binItem)) {
      return res.status(400).json({ status: "error", message: "این مورد در حال حاضر در سطل زباله است" });
    }
    saveDatabase();
    return res.json({ status: "success", message: "مجدداً به سطل زباله منتقل شد" });
  }
  if (action === "delete_permanent") {
    if (!isManager) return forbidden(res);
    recycle_bin.splice(recycle_bin.indexOf(binItem), 1);
    saveDatabase();
    return res.json({ status: "success", message: "برای همیشه حذف شد" });
  }
  res.status(400).json({ status: "error", message: "عملیات نامعتبر" });
});

function normalizeTemplateItems(items: unknown) {
  if (!Array.isArray(items)) return null;
  return items
    .filter((i) => i && typeof i === "object")
    .map((i: any) => ({ ...i, count: toInt(i.count) || 1 }));
}

subRouter.post("/manage_content_template", checkPermission("templates"), (req: any, res) => {
  const { action, template, templates } = req.body;
  if (action === "batch_add") {
    if (!Array.isArray(templates)) {
      return res.status(400).json({ status: "error", message: "اطلاعات نامعتبر" });
    }
    let currentId = nextId(contentTemplates);
    for (const tpl of templates) {
      const items = normalizeTemplateItems(tpl?.items);
      if (!tpl?.name || !items) continue;
      contentTemplates.push({ id: currentId++, name: String(tpl.name), items });
    }
    saveDatabase();
    return res.json({ status: "success", message: "قالب‌ها اضافه شدند" });
  }
  const items = normalizeTemplateItems(template?.items);
  if (action === "add") {
    if (!template?.name || !items) {
      return res.status(400).json({ status: "error", message: "اطلاعات قالب نامعتبر است" });
    }
    contentTemplates.push({ id: nextId(contentTemplates), name: String(template.name), items });
    saveDatabase();
    return res.json({ status: "success", message: "قالب جدید اضافه شد" });
  }
  const tpl = contentTemplates.find((t) => t.id == template?.id);
  if (action === "update") {
    if (!tpl) return res.json({ status: "error", message: "قالب یافت نشد" });
    if (template.name) tpl.name = String(template.name);
    if (items) tpl.items = items;
    saveDatabase();
    return res.json({ status: "success", message: "قالب ویرایش شد" });
  }
  if (action === "delete") {
    if (!tpl) return res.status(404).json({ status: "error", message: "قالب یافت نشد" });
    const binId = moveToRecycleBin("contentTemplates", tpl, tpl.name || "قالب محتوا", req.user);
    contentTemplates.splice(contentTemplates.indexOf(tpl), 1);
    saveDatabase();
    return res.json({ status: "success", message: "قالب به سطل زباله منتقل شد", bin_id: binId });
  }
  res.status(400).json({ status: "error", message: "عملیات نامعتبر" });
});

subRouter.get("/get_content_templates", checkPermission(["templates", "calendar", "depot"]), (req, res) => {
  res.json(contentTemplates);
});

subRouter.post("/apply_content_template", checkPermission(["templates", "calendar", "depot"]), (req, res) => {
  const { template_id, org_id, year, month } = req.body;
  const tpl = contentTemplates.find((t) => t.id == template_id);
  if (!tpl) return res.json({ status: "error", message: "قالب یافت نشد" });
  let tplItems = tpl.items;
  if (typeof tplItems === "string") {
    try {
      tplItems = JSON.parse(tplItems);
    } catch {
      tplItems = null;
    }
  }
  const y = toInt(year);
  const m = toInt(month);
  if (!Array.isArray(tplItems) || !y || !m || m < 1 || m > 12) {
    return res.json({ status: "error", message: "اطلاعات قالب نامعتبر است" });
  }
  for (const item of tplItems) {
    templateSuggestions.push({
      id: nextId(templateSuggestions),
      org_id: toInt(org_id),
      year: y,
      month: m,
      day: toInt(item.dayOffset) || 1,
      content_type: item.type,
      topic: item.topic,
      status: "pending",
    });
  }
  saveDatabase();
  res.json({ status: "success", message: "قالب با موفقیت اعمال شد" });
});

subRouter.post("/dismiss_template_suggestion", checkPermission(["calendar", "depot"]), (req, res) => {
  const sug = templateSuggestions.find((s) => s.id == req.body.suggestion_id);
  if (!sug) return res.json({ status: "error" });
  sug.status = "dismissed";
  saveDatabase();
  res.json({ status: "success" });
});

subRouter.post("/fulfill_template_suggestion", checkPermission(["calendar", "depot"]), (req, res) => {
  const { suggestion_id, content_id } = req.body;
  const sug = templateSuggestions.find((s) => s.id == suggestion_id);
  if (!sug) return res.json({ status: "error" });
  sug.status = "fulfilled";
  const c = contents.find((x) => x.id == content_id);
  if (c) {
    const m = String(sug.month).padStart(2, "0");
    const d = String(sug.day || 1).padStart(2, "0");
    c.publish_date = `${sug.year}/${m}/${d}`;
    if (c.status === "raw") c.status = "todo";
  }
  saveDatabase();
  res.json({ status: "success" });
});

subRouter.post("/update_platform_metrics", checkPermission(CONTENT_PERMS), (req, res) => {
  const { id, platform, data } = req.body;
  const card = contents.find((c) => c.id == id);
  if (!card) return res.status(404).json({ status: "error", message: "کارت یافت نشد" });
  if (!platform || typeof platform !== "string" || !data || typeof data !== "object") {
    return res.status(400).json({ status: "error", message: "اطلاعات نامعتبر" });
  }
  if (!card.platform_metrics) card.platform_metrics = {};
  card.platform_metrics[platform] = data;
  if (!card.published_platforms) card.published_platforms = [];
  if (data.status === "published" || data.status === "scheduled") {
    if (!card.published_platforms.includes(platform)) card.published_platforms.push(platform);
  } else {
    card.published_platforms = card.published_platforms.filter((p: any) => p !== platform);
  }
  saveDatabase();
  return res.json({ status: "success", message: "اطلاعات پلتفرم به‌روزرسانی شد" });
});

subRouter.post("/toggle_platform_published", checkPermission(CONTENT_PERMS), (req, res) => {
  const { id, platform, status } = req.body;
  const card = contents.find((c) => c.id == id);
  if (!card) return res.status(404).json({ status: "error", message: "کارت یافت نشد" });
  if (!card.published_platforms) card.published_platforms = [];
  if (status) {
    if (!card.published_platforms.includes(platform)) card.published_platforms.push(platform);
  } else {
    card.published_platforms = card.published_platforms.filter((p: any) => p !== platform);
  }
  saveDatabase();
  return res.json({ status: "success", message: "وضعیت پلتفرم به‌روزرسانی شد" });
});

subRouter.post("/toggle_stage", (req, res) => {
  const { id, stage, isChecked } = req.body;
  const card = contents.find((c) => c.id == id);
  if (!card) return res.status(404).json({ status: "error", message: "کارت یافت نشد" });
  if (!canEditCard(req, card)) return forbidden(res);
  if (!card.completed_stages) card.completed_stages = [];
  if (isChecked) {
    if (!card.completed_stages.includes(stage)) card.completed_stages.push(stage);
  } else {
    card.completed_stages = card.completed_stages.filter((s: any) => s !== stage);
  }
  logContentActivity(card, req, `مرحله «${stage}» را ${isChecked ? "تکمیل" : "باز"} کرد`);
  saveDatabase();
  emitToStaff("content_updated", { contentId: card.id, card });
  return res.json({ status: "success", message: "مرحله به‌روزرسانی شد" });
});

function findOrCreateCollection(title: string, orgId: any) {
  let col = collections.find((c) => c.title === title && c.org_id == orgId);
  if (!col) {
    col = {
      id: nextId(collections),
      title,
      org_id: orgId ?? null,
      created_at: new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      is_active: 1,
    };
    collections.push(col);
  }
  return col;
}

subRouter.post("/batch_edit_contents", checkPermission(["depot", "calendar"]), (req: any, res) => {
  const { ids, action, status, org_id, collection_title, content_type, project_manager, team, platforms, stages, components } =
    req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.json({ status: "error", message: "هیچ محتوایی انتخاب نشده است." });
  }
  const batchId = "batch_" + Date.now();
  const username = actorName(req);
  const previousStates: any[] = [];
  const deletedBinIds: number[] = [];
  let updatedCount = 0;

  if (action === "delete") {
    for (const id of ids) {
      const idx = contents.findIndex((c) => c.id == id);
      if (idx === -1) continue;
      const item = contents[idx];
      deletedBinIds.push(moveToRecycleBin("contents", item, item.title || "محتوای بدون عنوان", req.user));
      contents.splice(idx, 1);
      updatedCount++;
    }
    addAuditLog(username, "حذف گروهی محتوا", req.ip);
  } else {
    for (const id of ids) {
      const card = contents.find((c) => c.id == id);
      if (!card) continue;
      const before = JSON.parse(JSON.stringify(card));
      let changed = true;
      if (action === "archive") {
        card.status = "archived";
      } else if (action === "status" && status) {
        logContentActivity(card, req, `وضعیت را دسته‌جمعی به ${status} تغییر داد`);
        notifyStatusChange(card, status);
        card.status = status;
      } else if (action === "org") {
        const o = organizations.find((x) => x.id == org_id);
        if (o) {
          card.org_id = o.id;
          card.org_name = o.org_name;
          card.org_color = o.color;
          card.org_logo = o.logo_url;
          logContentActivity(card, req, "سازمان محتوا را تغییر داد");
        } else if (org_id === "" || org_id === null) {
          card.org_id = null;
          card.org_name = "";
          card.org_color = "#4f46e5";
          card.org_logo = "";
        } else {
          changed = false;
        }
      } else if (action === "collection" && typeof collection_title === "string") {
        const colName = collection_title.trim();
        card.collection_id = colName ? findOrCreateCollection(colName, card.org_id).id : null;
        logContentActivity(card, req, "مجموعه را دسته‌جمعی تغییر داد");
      } else if (action === "type" && content_type) {
        card.content_type = content_type;
        logContentActivity(card, req, "نوع محتوا را تغییر داد");
      } else if (action === "manager" && project_manager !== undefined) {
        card.project_manager = project_manager;
        logContentActivity(card, req, "مدیر پروژه را دسته‌جمعی تغییر داد");
      } else if (action === "team" && Array.isArray(team)) {
        const previous = card.assigned_colleagues || [];
        card.assigned_colleagues = team
          .map((tId) => colleagues.find((c) => c.id == tId)?.full_name)
          .filter(Boolean);
        notifyNewAssignees(card, previous);
        logContentActivity(card, req, "تیم اجرایی را تغییر داد");
      } else if (action === "platforms" && Array.isArray(platforms)) {
        card.publish_platforms = platforms;
      } else if (action === "stages" && Array.isArray(stages)) {
        card.stages = stages;
      } else if (action === "components" && components && typeof components === "object") {
        card.components_count = components;
        logContentActivity(card, req, "تعداد اجزا را دسته‌جمعی تغییر داد");
      } else if (action === "shift_dates" && req.body.shift_days) {
        const shiftDays = toInt(req.body.shift_days);
        const date = normalizeJalaliDate(card.publish_date);
        if (shiftDays && date) {
          card.publish_date = addDaysToJalali(date, shiftDays);
          const [, m, d] = card.publish_date.split("/").map(Number);
          card.publish_day = d;
          card.publish_month = m;
        } else {
          changed = false;
        }
      } else {
        changed = false;
      }
      if (changed) {
        previousStates.push(before);
        updatedCount++;
      }
    }
    addAuditLog(username, "ویرایش گروهی محتوا", req.ip);
  }

  if (updatedCount > 0) {
    batch_operations.unshift(
      action === "delete"
        ? {
            id: batchId,
            type: "batch_delete",
            title: "حذف گروهی",
            description: `تعداد ${updatedCount} محتوا حذف گروهی شدند.`,
            deleted_bin_ids: deletedBinIds,
            user: username,
            timestamp: new Date().toISOString(),
            is_undone: false,
          }
        : {
            id: batchId,
            type: "batch_edit",
            title: "ویرایش گروهی",
            description: `تعداد ${updatedCount} محتوا ویرایش گروهی شدند.`,
            previous_states: previousStates,
            user: username,
            timestamp: new Date().toISOString(),
            is_undone: false,
          },
    );
    if (batch_operations.length > 500) batch_operations.splice(500);
  }
  saveDatabase();
  return res.json({ status: "success", updated: updatedCount });
});

subRouter.post("/update_content_details", (req: any, res) => {
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
  if (!card) return res.status(404).json({ status: "error", message: "کارت یافت نشد" });
  if (!canEditCard(req, card)) return forbidden(res);
  // Assigned colleagues without content permissions may only work on the card itself.
  const isManager = hasPermission(req.user, CONTENT_PERMS);
  const changes: string[] = [];
  const oldStatus = card.status;
  const oldPublishDate = card.publish_date;
  const oldTitle = card.title;

  if (title !== undefined) card.title = title;
  if (caption !== undefined && caption !== card.caption) {
    if (!card.version_history) card.version_history = [];
    card.version_history.push({
      id: Date.now() + Math.random(),
      field: "caption",
      old_value: card.caption,
      new_value: caption,
      user: req.user.username,
      avatar: req.account?.avatar_url || "/assets/images/default-avatar.png",
      timestamp: new Date().toISOString(),
    });
    if (card.version_history.length > 50) card.version_history.splice(0, card.version_history.length - 50);
    card.caption = caption;
  }
  if (video_link !== undefined) card.video_link = video_link;
  if (cover_link !== undefined) card.cover_link = cover_link;
  if (isManager) {
    if (org_id !== undefined) card.org_id = org_id ? toInt(org_id) : null;
    if (collection_id !== undefined) {
      if (typeof collection_id === "string" && collection_id.trim() && toInt(collection_id) === null) {
        card.collection_id = findOrCreateCollection(collection_id.trim(), card.org_id).id;
      } else {
        card.collection_id = collection_id ? toInt(collection_id) : null;
      }
    }
    if (project_manager !== undefined) card.project_manager = project_manager;
    if (assigned_colleagues !== undefined && Array.isArray(assigned_colleagues)) {
      const previous = card.assigned_colleagues || [];
      card.assigned_colleagues = assigned_colleagues;
      notifyNewAssignees(card, previous);
    }
  }
  if (content_type !== undefined) card.content_type = content_type;
  if (publish_date !== undefined) card.publish_date = normalizeJalaliDate(publish_date);
  if (publish_time !== undefined) card.publish_time = publish_time;
  if (publish_platforms !== undefined) card.publish_platforms = publish_platforms;
  if (stages !== undefined) card.stages = stages;
  if (req.body.components_count !== undefined) card.components_count = req.body.components_count;
  if (req.body.attachments !== undefined && Array.isArray(req.body.attachments)) {
    card.attachments = req.body.attachments;
  }
  if (status !== undefined && status !== card.status) {
    notifyStatusChange(card, status);
    card.status = status;
  }

  if (title !== undefined && oldTitle !== title) changes.push("عنوان را تغییر داد");
  if (publish_date !== undefined && oldPublishDate !== card.publish_date) {
    changes.push(`تاریخ انتشار را از ${oldPublishDate || "نداشت"} به ${card.publish_date || "بدون تاریخ"} تغییر داد`);
  }
  if (status !== undefined && oldStatus !== status) {
    changes.push(`وضعیت را از ${oldStatus || "raw"} به ${status} تغییر داد`);
  }
  if (changes.length > 0) {
    logContentActivity(card, req, changes.join(" و "));
  } else if (caption !== undefined) {
    logContentActivity(card, req, "کپشن را ویرایش کرد");
  } else {
    logContentActivity(card, req, "جزئیات و مشخصات محتوا را ویرایش کرد");
  }
  saveDatabase();
  emitToStaff("content_updated", { contentId: card.id, card });
  return res.json({ status: "success" });
});

function opOwner(op: any) {
  return typeof op.user === "object" && op.user ? op.user.username : op.user;
}

function canManageOperation(req: any, op: any) {
  return isAdmin(req.user) || opOwner(op) === req.user.username;
}

subRouter.get("/get_batch_operations", (req: any, res) => {
  const data = isAdmin(req.user)
    ? batch_operations
    : batch_operations.filter((op) => opOwner(op) === req.user.username);
  res.json({ status: "success", data });
});

subRouter.post("/undo_batch_operation", (req: any, res) => {
  const operation = batch_operations.find((op) => op.id === req.body.batch_id);
  if (!operation) return res.status(404).json({ status: "error", message: "عملیات یافت نشد" });
  if (!canManageOperation(req, operation)) {
    return res.status(403).json({ status: "error", message: "شما مجاز به لغو این عملیات نیستید" });
  }
  if (operation.is_undone) {
    return res.status(400).json({ status: "error", message: "این عملیات قبلاً لغو شده است" });
  }
  if (operation.type === "batch_delete") {
    for (const binId of operation.deleted_bin_ids || []) {
      restoreBinItem(recycle_bin.find((b) => b.id === binId));
    }
  } else if (operation.type === "bulk_import") {
    operation.undo_bin_ids = [];
    for (const itemId of operation.item_ids || []) {
      const idx = contents.findIndex((c) => c.id === itemId);
      if (idx === -1) continue;
      operation.undo_bin_ids.push(
        moveToRecycleBin("contents", contents[idx], contents[idx].title || "محتوای بدون عنوان", req.user),
      );
      contents.splice(idx, 1);
    }
  } else if (operation.type === "batch_edit") {
    // Remember the current values so the change can be re-applied (redo).
    operation.redo_states = [];
    for (const prevState of operation.previous_states || []) {
      const idx = contents.findIndex((c) => c.id === prevState?.id);
      if (idx === -1) continue;
      operation.redo_states.push(JSON.parse(JSON.stringify(contents[idx])));
      contents[idx] = { ...prevState };
    }
  } else {
    return res.status(400).json({ status: "error", message: "نوع عملیات برای لغو پشتیبانی نمی‌شود" });
  }
  operation.is_undone = true;
  saveDatabase();
  res.json({ status: "success", message: "عملیات با موفقیت لغو شد" });
});

subRouter.post("/redo_batch_operation", (req: any, res) => {
  const operation = batch_operations.find((op) => op.id === req.body.batch_id);
  if (!operation) return res.status(404).json({ status: "error", message: "عملیات یافت نشد" });
  if (!canManageOperation(req, operation)) {
    return res.status(403).json({ status: "error", message: "شما مجاز به انجام این عملیات نیستید" });
  }
  if (!operation.is_undone) {
    return res.status(400).json({ status: "error", message: "این عملیات لغو نشده است" });
  }
  if (operation.type === "batch_delete") {
    for (const binId of operation.deleted_bin_ids || []) {
      reDeleteBinItem(recycle_bin.find((b) => b.id === binId));
    }
  } else if (operation.type === "bulk_import") {
    for (const binId of operation.undo_bin_ids || []) {
      restoreBinItem(recycle_bin.find((b) => b.id === binId));
    }
  } else if (operation.type === "batch_edit") {
    if (!Array.isArray(operation.redo_states)) {
      return res.status(400).json({ status: "error", message: "اطلاعات لازم برای انجام مجدد موجود نیست" });
    }
    for (const state of operation.redo_states) {
      const idx = contents.findIndex((c) => c.id === state?.id);
      if (idx !== -1) contents[idx] = { ...state };
    }
  } else {
    return res.status(400).json({ status: "error", message: "نوع عملیات پشتیبانی نمی‌شود" });
  }
  operation.is_undone = false;
  saveDatabase();
  res.json({ status: "success", message: "عملیات دوباره اعمال شد" });
});

subRouter.post("/contents/:id/comments", (req: any, res) => {
  const card = contents.find((c) => c.id == req.params.id);
  if (!card) return res.status(404).json({ status: "error", message: "Not found" });
  if (!canEditCard(req, card)) return forbidden(res);
  const text = typeof req.body.text === "string" ? req.body.text.trim().slice(0, 5000) : "";
  if (!text) return res.status(400).json({ status: "error", message: "متن نظر خالی است" });
  if (!card.comments) card.comments = [];
  const comment = {
    id: Date.now() + Math.random(),
    user: req.user.username,
    avatar: req.account?.avatar_url || "/assets/images/default-avatar.png",
    text,
    mentions: Array.isArray(req.body.mentions) ? req.body.mentions.slice(0, 50) : [],
    timestamp: new Date().toISOString(),
  };
  card.comments.push(comment);
  for (const colleagueId of resolveColleagueIds(comment.mentions)) {
    if (colleagueId == req.user.id) continue;
    addNotification(
      "اشاره در نظر",
      `${req.account?.full_name || req.user.username} در محتوای "${card.title}" به شما اشاره کرد.`,
      "colleague",
      colleagueId,
      "/my-projects",
      "mention",
      card.id,
    );
  }
  saveDatabase();
  emitToStaff("new_comment", { contentId: card.id, comment });
  res.json({ status: "success", comment });
});

subRouter.post("/contents/:id/attachments", (req: any, res) => {
  const card = contents.find((c) => c.id == req.params.id);
  if (!card) return res.status(404).json({ status: "error", message: "Not found" });
  if (!canEditCard(req, card)) return forbidden(res);
  const { name, url } = req.body;
  if (typeof url !== "string" || !/^(https?:\/\/|\/uploads\/)/i.test(url.trim())) {
    return res.status(400).json({ status: "error", message: "آدرس فایل نامعتبر است" });
  }
  if (!card.attachments) card.attachments = [];
  const attachment = {
    id: Date.now() + Math.random(),
    name: String(name || "فایل").slice(0, 200),
    url: url.trim(),
    uploader: req.user.username,
    avatar: req.account?.avatar_url || "/assets/images/default-avatar.png",
    timestamp: new Date().toISOString(),
  };
  card.attachments.push(attachment);
  saveDatabase();
  emitToStaff("new_attachment", { contentId: card.id, attachment });
  res.json({ status: "success", attachment });
});

export default subRouter;
