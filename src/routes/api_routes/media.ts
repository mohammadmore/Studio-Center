import express from "express";
import multer from "multer";
import { mediaAssets, organizations } from "../../store/state.js";
import { getBlobStore, saveDatabase } from "../../store/db.js";
import { checkPermission } from "../../middleware/auth.js";
import { nextId, toInt } from "../../utils/helpers.js";
import {
  extensionOf,
  IMAGE_EXTENSIONS,
  mimeForFile,
  randomFileName,
  UPLOAD_EXTENSIONS,
} from "../../utils/files.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});
const subRouter = express.Router();

// Pages that let staff pick images: profile pictures, logos, studio branding, content.
const IMAGE_UPLOAD_PERMS = ["add-user", "team", "organizations", "settings", "depot", "calendar", "media"];
const FILE_UPLOAD_PERMS = ["depot", "calendar", "media", "collections", "archive"];

/** Recognises an image by its first bytes instead of trusting the declared type. */
function sniffImage(buffer: Buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.toString("ascii", 0, 3) === "GIF") return "gif";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

subRouter.post("/upload_image", checkPermission(IMAGE_UPLOAD_PERMS), async (req, res) => {
  const { image } = req.body;
  if (!image || typeof image !== "string") {
    return res.status(400).json({ status: "error", message: "فرمت تصویر نامعتبر است" });
  }
  if (/^https?:\/\//i.test(image)) {
    return res.json({ status: "success", url: image });
  }
  const matches = /^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/s.exec(image);
  if (!matches) {
    return res.status(400).json({ status: "error", message: "تصویر خالی یا نامعتبر است" });
  }
  const buffer = Buffer.from(matches[2], "base64");
  const ext = sniffImage(buffer);
  if (!ext || !IMAGE_EXTENSIONS.includes(matches[1].toLowerCase())) {
    return res.status(400).json({ status: "error", message: "فرمت تصویر مجاز نیست" });
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return res.status(400).json({ status: "error", message: "حجم تصویر بیش از حد مجاز است" });
  }
  const filename = randomFileName("upload", ext);
  await getBlobStore().put("uploads", filename, buffer, mimeForFile(filename));
  return res.json({ status: "success", url: "/uploads/" + filename });
});

subRouter.post(
  "/upload_file",
  checkPermission(FILE_UPLOAD_PERMS),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "فایلی ارسال نشده است" });
    }
    const ext = extensionOf(req.file.originalname);
    if (!UPLOAD_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ status: "error", message: "نوع فایل مجاز نیست" });
    }
    const filename = randomFileName("file", ext);
    await getBlobStore().put("uploads", filename, req.file.buffer, mimeForFile(filename));
    return res.json({ status: "success", url: "/uploads/" + filename });
  },
);

subRouter.get("/get_media", checkPermission("media"), (req, res) => {
  const assets = mediaAssets.map((asset) => {
    const org = organizations.find((o) => o.id == asset.org_id);
    return {
      ...asset,
      org_name: org ? org.org_name : "عمومی / بدون سازمان",
      org_color: org ? org.color : "var(--text-gray)",
      org_logo: org ? org.logo_url : "",
    };
  });
  res.json({ status: "success", assets });
});

function isAllowedUrl(url: unknown) {
  return typeof url === "string" && /^(https?:\/\/|\/uploads\/)/i.test(url.trim());
}

subRouter.post("/save_media", checkPermission("media"), (req, res) => {
  const { action, media, org_id, asset_name, asset_type, file_url } = req.body;
  if (action === "batch_add") {
    if (!Array.isArray(media)) {
      return res.status(400).json({ status: "error", message: "اطلاعات نامعتبر" });
    }
    let currentId = nextId(mediaAssets);
    let skipped = 0;
    for (const m of media) {
      if (!m || !m.asset_name || !isAllowedUrl(m.file_url)) {
        skipped++;
        continue;
      }
      let numericOrgId = null;
      if (m.org_username) {
        const org = organizations.find((o) => o.username === m.org_username);
        if (org) numericOrgId = org.id;
      } else if (m.org_id) {
        numericOrgId = toInt(m.org_id);
      }
      mediaAssets.push({
        id: currentId++,
        org_id: numericOrgId,
        asset_name: String(m.asset_name),
        asset_type: m.asset_type,
        file_url: m.file_url.trim(),
        created_at: new Date().toLocaleDateString("fa-IR"),
      });
    }
    saveDatabase();
    return res.json({
      status: "success",
      message: skipped
        ? `فایل‌ها ذخیره شدند (${skipped} ردیف نامعتبر رد شد).`
        : "فایل‌ها با موفقیت ذخیره شدند.",
    });
  }
  if (!asset_name || !asset_type) {
    return res.json({ status: "error", message: "فیلد‌های ضروری را تکمیل کنید." });
  }
  if (!isAllowedUrl(file_url)) {
    return res.status(400).json({ status: "error", message: "آدرس فایل نامعتبر است" });
  }
  mediaAssets.push({
    id: nextId(mediaAssets),
    org_id: org_id ? toInt(org_id) : null,
    asset_name,
    asset_type,
    file_url: file_url.trim(),
    created_at: new Date().toLocaleDateString("fa-IR"),
  });
  saveDatabase();
  res.json({ status: "success", message: "فایل با موفقیت در کتابخانه ذخیره شد." });
});

export default subRouter;
