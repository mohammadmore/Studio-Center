import express from "express";
import { contents, organizations } from "../../store/state.js";
import { saveDatabase } from "../../store/db.js";
import { clientOrgId, isClient } from "../../middleware/auth.js";
import { hasPermission } from "../../utils/authUtils.js";
import { addNotification, logContentActivity } from "../../utils/logger.js";
import { toInt } from "../../utils/helpers.js";
import { cardColleagueIds } from "../../utils/contentUtils.js";
import { latestVersion, revisionRounds } from "../../utils/workflowUtils.js";

const subRouter = express.Router();

// Internal notes and history are not meant for the brand's eyes.
function clientView(c: any) {
  const { activity_log, version_history, comments, review_versions, stage_plan, ...rest } = c;
  const versions = (review_versions || []).filter((v: any) => v.sent_to_client_at);
  return { ...rest, versions_count: versions.length, has_versions: versions.length > 0 };
}

subRouter.get("/get_client_data", (req, res) => {
  // A client only ever sees its own organisation, whatever org_id is asked for.
  const orgId = isClient(req) ? clientOrgId(req) : toInt(req.query.org_id);
  if (!isClient(req) && !hasPermission((req as any).user, ["client-portal", "organizations"])) {
    return res.status(403).json({ status: "error", message: "عدم دسترسی" });
  }
  if (!orgId) return res.json({ status: "success", pending: [] });
  const pending = contents
    .filter((c) => c.org_id == orgId)
    .reverse()
    .map((c) => (isClient(req) ? clientView(c) : c));
  res.json({ status: "success", pending });
});

subRouter.post("/client_review", (req: any, res) => {
  const { content_id, action, comment } = req.body;
  if (!isClient(req) && !hasPermission(req.user, ["client-portal", "organizations"])) {
    return res.status(403).json({ status: "error", message: "عدم دسترسی" });
  }
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ status: "error", message: "عملیات نامعتبر" });
  }
  const item = contents.find((c) => c.id == content_id);
  if (!item) return res.status(404).json({ status: "error", message: "محتوا یافت نشد" });
  if (isClient(req) && item.org_id != clientOrgId(req)) {
    return res
      .status(403)
      .json({ status: "error", message: "شما مجاز به دسترسی به محتوای این سازمان نیستید" });
  }
  item.status = action === "approve" ? "approved_by_client" : "needs_revision";
  const commentText = typeof comment === "string" ? comment.trim().slice(0, 2000) : "";
  if (commentText) item.client_comment = commentText;
  const reviewer = isClient(req) ? req.account?.contact_name || req.account?.org_name || "کارفرما" : req.user.username;
  // Every decision is kept, so an earlier comment is never overwritten.
  item.client_reviews = Array.isArray(item.client_reviews) ? item.client_reviews : [];
  const version = latestVersion(item);
  item.client_reviews.push({
    decision: action,
    comment: commentText,
    by: reviewer,
    version: version?.v ?? null,
    at: new Date().toISOString(),
  });
  if (version && version.sent_to_client_at) {
    version.client = { status: action === "approve" ? "approved" : "rejected", at: new Date().toISOString(), by: reviewer, comment: commentText };
    if (commentText) {
      version.feedback = version.feedback || [];
      version.feedback.push({
        id: Date.now(),
        author: reviewer,
        author_type: isClient(req) ? "client" : "staff",
        text: `${action === "approve" ? "✅ تایید" : "↩️ درخواست اصلاح"}: ${commentText}`,
        file_index: 0,
        timecode: null,
        x: null,
        y: null,
        parent_id: null,
        resolved: action === "approve",
        at: new Date().toISOString(),
      });
    }
  }
  const org = organizations.find((o) => o.id == item.org_id);
  const actionFa = action === "approve" ? "تایید شد" : "رد شد (نیازمند اصلاح)";
  logContentActivity(item, req, `بررسی کارفرما: ${actionFa}`);
  const rounds = revisionRounds(item);
  const limit = Number(org?.contract?.revision_limit) || 0;
  const overLimit = action === "reject" && limit > 0 && rounds > limit;
  const details =
    (commentText ? ` توضیحات: ${commentText}` : "") +
    (overLimit ? ` ⚠️ تعداد دور اصلاح (${rounds}) از سقف قرارداد (${limit}) گذشت.` : "");
  addNotification(
    "نتیجه بررسی محتوا",
    `محتوای "${item.title}" توسط نماینده ${org ? org.org_name : ""} ${actionFa}.${details}`,
    "admin",
    null,
    "/depot",
    "review_result",
    item.id,
  );
  for (const colleagueId of cardColleagueIds(item)) {
    addNotification(
      "بررسی محتوا توسط کارفرما",
      `محتوای "${item.title}" ${actionFa}.${details}`,
      "colleague",
      colleagueId,
      "/my-projects",
      "review_result",
      item.id,
    );
  }
  saveDatabase();
  res.json({
    status: "success",
    message: "وضعیت آپدیت شد",
    revision_rounds: rounds,
    revision_limit: limit,
    over_limit: overLimit,
  });
});

export default subRouter;
