import express from "express";
import { colleagues, contents, organizations, requests, settings } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { checkPermission, clientOrgId, isClient } from "../../middleware/auth.js";
import { hasPermission } from "../../utils/authUtils.js";
import { addNotification, logContentActivity } from "../../utils/logger.js";
import { nextId, normalizeJalaliDate, safeUrl, toInt } from "../../utils/helpers.js";
import { cardColleagueIds } from "../../utils/contentUtils.js";
import { emitToStaff } from "../../utils/socket.js";
import {
  assignmentWarnings,
  colleagueName,
  internalApprovalRequired,
  latestVersion,
  managerId,
  revisionRounds,
  stagePlan,
} from "../../utils/workflowUtils.js";

const subRouter = express.Router();
const CONTENT_PERMS = ["depot", "calendar", "collections", "archive"];

const text = (v: unknown, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function fail(res: any, code: number, message: string) {
  return res.status(code).json({ status: "error", message });
}

function actor(req: any) {
  if (isClient(req)) return { name: req.account?.contact_name || req.account?.org_name || "کارفرما", type: "client" };
  return { name: req.account?.full_name || req.user?.username, type: "staff", id: req.user?.id };
}

function cleanFiles(list: unknown) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 50)
    .map((f: any) => ({
      name: text(f?.name, 200) || "فایل",
      url: safeUrl(f?.url),
      size: Number(f?.size) || 0,
      type: text(f?.type, 100),
    }))
    .filter((f) => f.url && !f.url.startsWith("data:"));
}

function canWorkOn(req: any, card: any) {
  return hasPermission(req.user, CONTENT_PERMS) || cardColleagueIds(card).includes(Number(req.user?.id)) ||
    Object.values(card.stage_plan || {}).some((p: any) => p?.owner_id == req.user?.id);
}

function findCard(req: any, res: any, id: unknown) {
  const card = contents.find((c) => c.id == id);
  if (!card) {
    fail(res, 404, "محتوا یافت نشد");
    return null;
  }
  if (isClient(req)) {
    if (card.org_id != clientOrgId(req)) {
      fail(res, 403, "عدم دسترسی");
      return null;
    }
  } else if (!canWorkOn(req, card)) {
    fail(res, 403, "عدم دسترسی");
    return null;
  }
  return card;
}

function notifyTeam(card: any, title: string, body: string, type: string, exceptId?: any) {
  const ids = new Set(cardColleagueIds(card));
  for (const p of Object.values<any>(card.stage_plan || {})) if (p?.owner_id) ids.add(Number(p.owner_id));
  for (const id of ids) {
    if (id == exceptId) continue;
    addNotification(title, body, "colleague", id, "/my-projects", type, card.id);
  }
}

// ───────────────────────────── Requests / briefs ─────────────────────────────

export const REQUEST_STATUS_FA: Record<string, string> = {
  new: "جدید",
  needs_info: "نیاز به اطلاعات بیشتر",
  accepted: "پذیرفته شد",
  rejected: "رد شد",
  converted: "در حال تولید",
  cancelled: "لغو شده",
};

function briefFields(body: any) {
  return {
    title: text(body.title, 200),
    goal: text(body.goal),
    audience: text(body.audience),
    key_message: text(body.key_message),
    references: text(body.references),
    content_type: text(body.content_type, 100),
    platforms: Array.isArray(body.platforms) ? body.platforms.map((p: any) => text(p, 100)).filter(Boolean).slice(0, 20) : [],
    deadline: normalizeJalaliDate(body.deadline),
    notes: text(body.notes),
    attachments: cleanFiles(body.attachments),
  };
}

function withRequestInfo(r: any) {
  const org = organizations.find((o) => o.id == r.org_id);
  const card = r.content_id ? contents.find((c) => c.id == r.content_id) : null;
  return {
    ...r,
    org_name: org?.org_name || "بدون سازمان",
    org_color: org?.color,
    status_fa: REQUEST_STATUS_FA[r.status] || r.status,
    content_status: card?.status || null,
  };
}

subRouter.get("/requests", (req: any, res) => {
  if (isClient(req)) {
    const orgId = clientOrgId(req);
    return res.json({ status: "success", data: requests.filter((r) => r.org_id == orgId).map(withRequestInfo) });
  }
  if (!hasPermission(req.user, "requests")) return fail(res, 403, "عدم دسترسی");
  const { status, org_id } = req.query;
  const data = requests
    .filter((r) => (!status || r.status === status) && (!org_id || r.org_id == org_id))
    .map(withRequestInfo);
  res.json({ status: "success", data });
});

subRouter.post("/requests", (req: any, res) => {
  const { action, id } = req.body;
  const client = isClient(req);
  if (!client && !hasPermission(req.user, "requests")) return fail(res, 403, "عدم دسترسی");
  const who = actor(req);

  if (action === "create") {
    const fields = briefFields(req.body);
    if (!fields.title) return fail(res, 400, "عنوان درخواست الزامی است");
    const orgId = client ? clientOrgId(req) : toInt(req.body.org_id);
    if (!orgId || !organizations.some((o) => o.id == orgId)) return fail(res, 400, "برند را انتخاب کنید");
    const r = {
      id: nextId(requests),
      org_id: orgId,
      ...fields,
      status: "new",
      created_by: who.name,
      created_by_type: who.type,
      created_at: new Date().toISOString(),
      messages: [] as any[],
      content_id: null,
    };
    requests.unshift(r);
    const org = organizations.find((o) => o.id == orgId);
    addNotification(
      "درخواست محتوای جدید",
      `${org?.org_name || "کارفرما"} درخواست «${r.title}» را ثبت کرد${r.deadline ? ` (مهلت: ${r.deadline})` : ""}.`,
      "admin",
      null,
      "/requests",
      "request_new",
      r.id,
    );
    saveDatabase();
    return res.json({ status: "success", message: "درخواست ثبت شد", data: withRequestInfo(r) });
  }

  const r = requests.find((x) => x.id == id);
  if (!r || (client && r.org_id != clientOrgId(req))) return fail(res, 404, "درخواست یافت نشد");

  if (action === "update") {
    if (client && !["new", "needs_info"].includes(r.status)) {
      return fail(res, 400, "این درخواست در حال بررسی است و دیگر قابل ویرایش نیست");
    }
    const fields = briefFields({ ...r, ...req.body, attachments: req.body.attachments ?? r.attachments });
    if (!fields.title) return fail(res, 400, "عنوان درخواست الزامی است");
    Object.assign(r, fields, { updated_at: new Date().toISOString() });
    if (client && r.status === "needs_info") {
      r.status = "new";
      addNotification("درخواست تکمیل شد", `کارفرما درخواست «${r.title}» را تکمیل کرد.`, "admin", null, "/requests", "request_new", r.id);
    }
    saveDatabase();
    return res.json({ status: "success", message: "درخواست ویرایش شد", data: withRequestInfo(r) });
  }

  if (action === "message") {
    const body = text(req.body.text, 3000);
    if (!body) return fail(res, 400, "متن پیام خالی است");
    r.messages = r.messages || [];
    r.messages.push({ id: Date.now(), author: who.name, author_type: who.type, text: body, at: new Date().toISOString() });
    if (client) {
      addNotification("پیام جدید درباره درخواست", `کارفرما درباره «${r.title}» نوشت: ${body}`, "admin", null, "/requests", "request_update", r.id);
    } else {
      addNotification("پاسخ استودیو به درخواست شما", `درباره «${r.title}»: ${body}`, "client", r.org_id, "/client-requests", "request_update", r.id);
    }
    saveDatabase();
    return res.json({ status: "success", data: withRequestInfo(r) });
  }

  if (action === "cancel") {
    if (!client) return fail(res, 400, "عملیات نامعتبر");
    if (!["new", "needs_info"].includes(r.status)) return fail(res, 400, "این درخواست قابل لغو نیست");
    r.status = "cancelled";
    addNotification("لغو درخواست", `کارفرما درخواست «${r.title}» را لغو کرد.`, "admin", null, "/requests", "request_update", r.id);
    saveDatabase();
    return res.json({ status: "success", message: "درخواست لغو شد" });
  }

  if (client) return fail(res, 400, "عملیات نامعتبر");

  if (action === "set_status") {
    const status = String(req.body.status || "");
    if (!["needs_info", "accepted", "rejected", "new"].includes(status)) return fail(res, 400, "وضعیت نامعتبر");
    r.status = status;
    const note = text(req.body.note, 2000);
    if (note) {
      r.messages = r.messages || [];
      r.messages.push({ id: Date.now(), author: who.name, author_type: "staff", text: note, at: new Date().toISOString() });
    }
    addNotification(
      "وضعیت درخواست شما",
      `درخواست «${r.title}»: ${REQUEST_STATUS_FA[status]}${note ? ` — ${note}` : ""}`,
      "client",
      r.org_id,
      "/client-requests",
      "request_update",
      r.id,
    );
    saveDatabase();
    return res.json({ status: "success", data: withRequestInfo(r) });
  }

  if (action === "convert") {
    if (r.content_id && contents.some((c) => c.id == r.content_id)) {
      return fail(res, 400, "برای این درخواست قبلا کارت ساخته شده است");
    }
    const pmId = toInt(req.body.project_manager_id);
    const pm = pmId ? colleagues.find((c) => c.id == pmId) : null;
    const card: any = {
      id: nextId(contents),
      title: r.title,
      org_id: r.org_id,
      content_type: r.content_type || "پوستر گرافیکی",
      project_manager: pm ? pm.full_name || pm.username : null,
      assigned_colleagues: [],
      stages: Array.isArray(req.body.stages) ? req.body.stages.map((s: any) => text(s, 100)).filter(Boolean) : [],
      status: "todo",
      publish_date: r.deadline || "",
      publish_time: "",
      publish_platforms: r.platforms || [],
      components_count: {},
      attachments: r.attachments.map((a: any) => ({
        id: Date.now() + Math.random(),
        name: a.name,
        url: a.url,
        uploader: "کارفرما",
        timestamp: r.created_at,
      })),
      brief: {
        goal: r.goal,
        audience: r.audience,
        key_message: r.key_message,
        references: r.references,
        notes: r.notes,
        deadline: r.deadline,
      },
      request_id: r.id,
      created_at: new Date().toISOString(),
    };
    logContentActivity(card, req, "کارت را از روی درخواست کارفرما ساخت");
    contents.unshift(card);
    r.status = "converted";
    r.content_id = card.id;
    if (pm) {
      addNotification("پروژه جدید", `درخواست «${r.title}» به کارت تولید تبدیل شد و مدیریت آن با شماست.`, "colleague", pm.id, "/depot", "assignment", card.id);
    }
    addNotification("درخواست شما وارد تولید شد", `درخواست «${r.title}» پذیرفته شد و تولید آن آغاز شد.`, "client", r.org_id, "/client-requests", "request_update", r.id);
    saveDatabase();
    emitToStaff("content_updated", { contentId: card.id, card });
    return res.json({ status: "success", message: "کارت تولید ساخته شد", data: withRequestInfo(r), content: card });
  }

  fail(res, 400, "عملیات نامعتبر");
});

// ───────────────────────────── Stage owners & deadlines ─────────────────────────────

subRouter.post("/update_stage_plan", (req: any, res) => {
  const card = findCard(req, res, req.body.id);
  if (!card) return;
  if (!hasPermission(req.user, CONTENT_PERMS) && managerId(card) != req.user.id) {
    return fail(res, 403, "فقط مدیر پروژه می‌تواند مسئول و موعد مراحل را تعیین کند");
  }
  const input = req.body.plan && typeof req.body.plan === "object" ? req.body.plan : {};
  const plan = stagePlan(card);
  const assignments: { colleague_id: any; date?: string; label?: string }[] = [];
  for (const stage of card.stages || []) {
    const entry = input[stage];
    if (!entry) continue;
    const ownerId = toInt(entry.owner_id);
    const owner = ownerId ? colleagues.find((c) => c.id == ownerId) : null;
    const due = normalizeJalaliDate(entry.due_date);
    const previous = plan[stage] || {};
    plan[stage] = {
      ...previous,
      owner_id: owner ? owner.id : null,
      due_date: due,
      estimated_hours: Number(entry.estimated_hours) > 0 ? Number(entry.estimated_hours) : previous.estimated_hours || null,
    };
    // A new date means new reminders.
    if (previous.due_date !== due) {
      delete plan[stage].reminded_on;
      delete plan[stage].overdue_notified_on;
    }
    if (owner) {
      assignments.push({ colleague_id: owner.id, date: due, label: stage });
      if (previous.owner_id != owner.id && owner.id != req.user.id) {
        addNotification(
          "مسئولیت مرحله",
          `مرحله «${stage}» محتوای "${card.title}" به شما سپرده شد${due ? ` (موعد: ${due})` : ""}.`,
          "colleague",
          owner.id,
          "/my-projects",
          "assignment",
          card.id,
        );
      }
    }
  }
  logContentActivity(card, req, "مسئول و موعد مراحل را تعیین کرد");
  saveDatabase();
  emitToStaff("content_updated", { contentId: card.id, card });
  res.json({ status: "success", message: "برنامه مراحل ذخیره شد", stage_plan: plan, warnings: assignmentWarnings(assignments) });
});

/** Availability check used by the UI before assigning people to a date. */
subRouter.post("/check_assignment", checkPermission(CONTENT_PERMS.concat(["shoots"])), (req: any, res) => {
  const ids = Array.isArray(req.body.colleague_ids) ? req.body.colleague_ids : [];
  const date = normalizeJalaliDate(req.body.date);
  res.json({ status: "success", warnings: assignmentWarnings(ids.map((id: any) => ({ colleague_id: id, date }))) });
});

// ───────────────────────────── Review versions ─────────────────────────────

function sendVersionToClient(card: any, v: any, req: any) {
  card.status = "client_review";
  v.sent_to_client_at = new Date().toISOString();
  if (card.org_id) {
    addNotification(
      "محتوای جدید برای بررسی",
      `نسخه ${v.v.toLocaleString("fa-IR")} محتوای "${card.title}" آماده بررسی و تایید شماست.`,
      "client",
      card.org_id,
      "/client-review",
      "client_review",
      card.id,
    );
  }
  logContentActivity(card, req, `نسخه ${v.v} را برای بررسی کارفرما ارسال کرد`);
}

subRouter.post("/review_versions", (req: any, res) => {
  const { action } = req.body;
  if (isClient(req)) return fail(res, 403, "عدم دسترسی");
  const card = findCard(req, res, req.body.id);
  if (!card) return;
  card.review_versions = Array.isArray(card.review_versions) ? card.review_versions : [];

  if (action === "submit") {
    const files = cleanFiles(req.body.files);
    if (!files.length) return fail(res, 400, "حداقل یک فایل یا لینک برای این نسخه لازم است");
    const prev = latestVersion(card);
    if (prev && (prev.internal?.status === "pending" || (prev.sent_to_client_at && !prev.client?.status))) {
      // An unanswered version is replaced by the new one.
      prev.superseded = true;
    }
    const v: any = {
      v: card.review_versions.length + 1,
      files,
      note: text(req.body.note, 3000),
      caption: card.caption || "",
      platform_captions: card.platform_captions || {},
      created_at: new Date().toISOString(),
      created_by: actor(req).name,
      internal: { status: internalApprovalRequired() ? "pending" : "skipped" },
      client: {},
      feedback: [],
    };
    card.review_versions.push(v);
    if (v.internal.status === "pending") {
      card.status = "review";
      addNotification(
        "درخواست تایید داخلی",
        `نسخه ${v.v.toLocaleString("fa-IR")} محتوای "${card.title}" منتظر تایید داخلی است.`,
        "admin",
        null,
        "/depot",
        "internal_review",
        card.id,
      );
      for (const c of colleagues) {
        if (c.is_active === 0 || c.id == req.user.id) continue;
        const role = hasPermission(c, "approve_content") && !hasPermission(c, "admin");
        if (role) {
          addNotification("درخواست تایید داخلی", `نسخه ${v.v.toLocaleString("fa-IR")} محتوای "${card.title}" منتظر تایید شماست.`, "colleague", c.id, "/depot", "internal_review", card.id);
        }
      }
      logContentActivity(card, req, `نسخه ${v.v} را برای تایید داخلی ارسال کرد`);
    } else {
      sendVersionToClient(card, v, req);
    }
    saveDatabase();
    emitToStaff("content_updated", { contentId: card.id, card });
    return res.json({ status: "success", message: v.internal.status === "pending" ? "نسخه برای تایید داخلی ارسال شد" : "نسخه برای کارفرما ارسال شد", version: v });
  }

  if (action === "internal") {
    if (!hasPermission(req.user, "approve_content")) return fail(res, 403, "شما مجوز تایید داخلی ندارید");
    const v = latestVersion(card);
    if (!v || v.internal?.status !== "pending") return fail(res, 400, "نسخه‌ای منتظر تایید داخلی نیست");
    const decision = req.body.decision === "approve" ? "approved" : req.body.decision === "reject" ? "rejected" : "";
    if (!decision) return fail(res, 400, "تصمیم نامعتبر");
    v.internal = { status: decision, by: actor(req).name, at: new Date().toISOString(), note: text(req.body.note, 2000) };
    if (decision === "approved") {
      sendVersionToClient(card, v, req);
    } else {
      card.status = "needs_revision";
      logContentActivity(card, req, `نسخه ${v.v} را در تایید داخلی رد کرد`);
    }
    notifyTeam(
      card,
      decision === "approved" ? "تایید داخلی انجام شد" : "نسخه در تایید داخلی رد شد",
      `نسخه ${v.v.toLocaleString("fa-IR")} محتوای "${card.title}" ${decision === "approved" ? "تایید و برای کارفرما ارسال شد" : "نیاز به اصلاح دارد"}.${v.internal.note ? ` توضیح: ${v.internal.note}` : ""}`,
      "review_result",
      req.user.id,
    );
    saveDatabase();
    emitToStaff("content_updated", { contentId: card.id, card });
    return res.json({ status: "success", message: decision === "approved" ? "تایید و برای کارفرما ارسال شد" : "برای اصلاح برگشت داده شد" });
  }

  fail(res, 400, "عملیات نامعتبر");
});

/** What a client may see of a version: no internal notes, only versions sent to them. */
function clientVersions(card: any) {
  return (card.review_versions || [])
    .filter((v: any) => v.sent_to_client_at)
    .map((v: any) => {
      const { internal, ...rest } = v;
      return rest;
    });
}

subRouter.get("/review_detail", (req: any, res) => {
  const card = findCard(req, res, req.query.id);
  if (!card) return;
  const org = organizations.find((o) => o.id == card.org_id);
  const limit = toInt(org?.contract?.revision_limit) || 0;
  const base = {
    id: card.id,
    title: card.title,
    status: card.status,
    content_type: card.content_type,
    publish_date: card.publish_date,
    publish_time: card.publish_time,
    publish_platforms: card.publish_platforms || [],
    caption: card.caption || "",
    platform_captions: card.platform_captions || {},
    caption_approval: card.caption_approval || null,
    cover_link: card.cover_link,
    video_link: card.video_link,
    brief: card.brief || null,
    deliverables: card.deliverables || [],
    delivered_at: card.delivered_at || null,
    revision_rounds: revisionRounds(card),
    revision_limit: limit,
  };
  const versions = isClient(req) ? clientVersions(card) : card.review_versions || [];
  res.json({ status: "success", data: { ...base, versions } });
});

subRouter.post("/review_feedback", (req: any, res) => {
  const card = findCard(req, res, req.body.id);
  if (!card) return;
  const versions = card.review_versions || [];
  const v = versions.find((x: any) => x.v == req.body.version) || latestVersion(card);
  if (!v || (isClient(req) && !v.sent_to_client_at)) return fail(res, 400, "نسخه‌ای برای ثبت نظر وجود ندارد");
  const body = text(req.body.text, 3000);
  if (!body) return fail(res, 400, "متن نظر خالی است");
  const num = (x: unknown, min: number, max: number) => {
    const n = Number(x);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
  };
  const who = actor(req);
  const item = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    author: who.name,
    author_type: who.type,
    text: body,
    file_index: Math.max(0, Math.min(toInt(req.body.file_index) || 0, (v.files || []).length - 1)),
    timecode: num(req.body.timecode, 0, 24 * 3600),
    x: num(req.body.x, 0, 100),
    y: num(req.body.y, 0, 100),
    parent_id: req.body.parent_id ? Number(req.body.parent_id) : null,
    resolved: false,
    at: new Date().toISOString(),
  };
  v.feedback = v.feedback || [];
  v.feedback.push(item);
  if (who.type === "client") {
    notifyTeam(card, "نظر جدید کارفرما", `کارفرما روی نسخه ${v.v.toLocaleString("fa-IR")} "${card.title}" نظر داد: ${body}`, "review_feedback");
  } else if (card.org_id && v.sent_to_client_at) {
    addNotification("پاسخ استودیو", `استودیو درباره "${card.title}" پاسخ داد: ${body}`, "client", card.org_id, "/client-review", "review_feedback", card.id);
  }
  saveDatabase();
  emitToStaff("content_updated", { contentId: card.id, card });
  res.json({ status: "success", feedback: item });
});

subRouter.post("/review_feedback_resolve", (req: any, res) => {
  if (isClient(req)) return fail(res, 403, "عدم دسترسی");
  const card = findCard(req, res, req.body.id);
  if (!card) return;
  for (const v of card.review_versions || []) {
    const f = (v.feedback || []).find((x: any) => x.id == req.body.feedback_id);
    if (f) {
      f.resolved = req.body.resolved !== false;
      saveDatabase();
      return res.json({ status: "success" });
    }
  }
  fail(res, 404, "نظر یافت نشد");
});

// ───────────────────────────── Platform captions ─────────────────────────────

subRouter.post("/update_captions", (req: any, res) => {
  if (isClient(req)) return fail(res, 403, "عدم دسترسی");
  const card = findCard(req, res, req.body.id);
  if (!card) return;
  const input = req.body.captions && typeof req.body.captions === "object" ? req.body.captions : {};
  const current = card.platform_captions || {};
  const next: Record<string, string> = {};
  let changed = false;
  for (const [platform, value] of Object.entries(input)) {
    const key = text(platform, 100);
    if (!key) continue;
    const caption = text(value, 10000);
    if (caption) next[key] = caption;
    if ((current[key] || "") !== caption) {
      changed = true;
      card.version_history = card.version_history || [];
      card.version_history.push({
        id: Date.now() + Math.random(),
        field: `caption:${key}`,
        old_value: current[key] || "",
        new_value: caption,
        user: req.user.username,
        timestamp: new Date().toISOString(),
      });
    }
  }
  if (card.version_history?.length > 50) card.version_history.splice(0, card.version_history.length - 50);
  card.platform_captions = next;
  if (typeof req.body.caption === "string" && req.body.caption !== card.caption) {
    card.caption = text(req.body.caption, 10000);
    changed = true;
  }
  // Edited text needs to be approved again.
  if (changed && card.caption_approval?.status) card.caption_approval = { status: "pending", reset_at: new Date().toISOString() };
  logContentActivity(card, req, "کپشن پلتفرم‌ها را ویرایش کرد");
  saveDatabase();
  emitToStaff("content_updated", { contentId: card.id, card });
  res.json({ status: "success", message: "کپشن‌ها ذخیره شد", platform_captions: next });
});

subRouter.post("/caption_review", (req: any, res) => {
  const card = findCard(req, res, req.body.id);
  if (!card) return;
  if (!isClient(req) && !hasPermission(req.user, ["client-portal", "organizations", "approve_content"])) {
    return fail(res, 403, "عدم دسترسی");
  }
  const decision = req.body.decision === "approve" ? "approved" : req.body.decision === "reject" ? "rejected" : "";
  if (!decision) return fail(res, 400, "تصمیم نامعتبر");
  const comment = text(req.body.comment, 2000);
  card.caption_approval = { status: decision, by: actor(req).name, by_type: actor(req).type, at: new Date().toISOString(), comment };
  logContentActivity(card, req, `کپشن ${decision === "approved" ? "تایید" : "رد"} شد`);
  notifyTeam(
    card,
    decision === "approved" ? "کپشن تایید شد" : "کپشن نیاز به اصلاح دارد",
    `کپشن محتوای "${card.title}" ${decision === "approved" ? "تایید شد" : "رد شد"}.${comment ? ` توضیح: ${comment}` : ""}`,
    "review_result",
  );
  saveDatabase();
  emitToStaff("content_updated", { contentId: card.id, card });
  res.json({ status: "success", message: decision === "approved" ? "کپشن تایید شد" : "درخواست اصلاح کپشن ثبت شد" });
});

// ───────────────────────────── Final delivery ─────────────────────────────

subRouter.post("/deliverables", (req: any, res) => {
  if (isClient(req)) return fail(res, 403, "عدم دسترسی");
  const card = findCard(req, res, req.body.id);
  if (!card) return;
  const { action } = req.body;
  card.deliverables = Array.isArray(card.deliverables) ? card.deliverables : [];
  if (action === "add") {
    const files = cleanFiles(req.body.files);
    if (!files.length) return fail(res, 400, "فایلی انتخاب نشده است");
    for (const f of files) card.deliverables.push({ ...f, id: Date.now() + Math.random(), added_at: new Date().toISOString(), added_by: actor(req).name });
  } else if (action === "remove") {
    card.deliverables = card.deliverables.filter((d: any) => d.id != req.body.file_id);
  } else if (action === "deliver") {
    if (!card.deliverables.length) return fail(res, 400, "ابتدا فایل‌های نهایی را اضافه کنید");
    card.delivered_at = new Date().toISOString();
    if (card.org_id) {
      addNotification(
        "فایل‌های نهایی آماده دریافت است",
        `فایل‌های نهایی محتوای "${card.title}" (${card.deliverables.length.toLocaleString("fa-IR")} فایل) آماده دانلود است.`,
        "client",
        card.org_id,
        "/client-files",
        "delivery",
        card.id,
      );
    }
    logContentActivity(card, req, "فایل‌های نهایی را به کارفرما تحویل داد");
  } else {
    return fail(res, 400, "عملیات نامعتبر");
  }
  saveDatabase();
  emitToStaff("content_updated", { contentId: card.id, card });
  res.json({ status: "success", deliverables: card.deliverables, delivered_at: card.delivered_at || null });
});

subRouter.get("/client_deliverables", (req: any, res) => {
  const orgId = isClient(req) ? clientOrgId(req) : toInt(req.query.org_id);
  if (!isClient(req) && !hasPermission(req.user, ["client-portal", "organizations"])) return fail(res, 403, "عدم دسترسی");
  const data = contents
    .filter((c) => c.org_id == orgId && c.delivered_at && (c.deliverables || []).length)
    .sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at)))
    .map((c) => ({
      id: c.id,
      title: c.title,
      content_type: c.content_type,
      publish_date: c.publish_date,
      delivered_at: c.delivered_at,
      files: c.deliverables,
    }));
  res.json({ status: "success", data });
});

// ───────────────────────────── Workflow settings ─────────────────────────────

subRouter.get("/workflow_settings", (req: any, res) => {
  res.json({ status: "success", data: { internal_approval_required: internalApprovalRequired() } });
});

subRouter.post("/workflow_settings", checkPermission("settings"), (req: any, res) => {
  settings.workflow = { ...(settings.workflow || {}), internal_approval_required: !!req.body.internal_approval_required };
  saveDatabase();
  res.json({ status: "success", message: "تنظیمات گردش کار ذخیره شد" });
});

export { colleagueName };
export default subRouter;
