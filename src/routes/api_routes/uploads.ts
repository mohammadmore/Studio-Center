import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import { config } from "../../config.js";
import { getBlobStore } from "../../store/db.js";
import { extensionOf, mimeForFile, randomFileName, UPLOAD_EXTENSIONS } from "../../utils/files.js";

/**
 * Resumable, chunked uploads for big files (videos, raw footage, project files).
 * The browser sends the file in pieces; each piece is appended to a temp file and
 * the finished file is moved into the blob store, so nothing big is held in memory
 * and a dropped connection only costs the current piece.
 */
const subRouter = express.Router();

export const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_BYTES = (parseInt(process.env.MAX_UPLOAD_MB || "", 10) || 2048) * 1024 * 1024;
const STALE_MS = 24 * 60 * 60 * 1000;

interface PendingUpload {
  id: string;
  owner: string;
  name: string;
  ext: string;
  size: number;
  received: number;
  file: string;
  updatedAt: number;
}

const pending = new Map<string, PendingUpload>();

function tmpDir() {
  const dir = path.join(config.dataDir, "tmp_uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ownerOf(req: any) {
  return `${req.user?.role_id === "client" ? "org" : "user"}:${req.user?.id}`;
}

function findUpload(req: any, res: any) {
  const upload = pending.get(String(req.body?.upload_id || req.query.upload_id || ""));
  if (!upload || upload.owner !== ownerOf(req)) {
    res.status(404).json({ status: "error", message: "آپلود یافت نشد؛ دوباره شروع کنید" });
    return null;
  }
  return upload;
}

/** Deletes temp files of uploads that were abandoned. */
export function cleanupStaleUploads(now = Date.now()) {
  for (const [id, upload] of pending) {
    if (now - upload.updatedAt > STALE_MS) {
      fs.rmSync(upload.file, { force: true });
      pending.delete(id);
    }
  }
  try {
    for (const name of fs.readdirSync(tmpDir())) {
      const file = path.join(tmpDir(), name);
      if (now - fs.statSync(file).mtimeMs > STALE_MS) fs.rmSync(file, { force: true });
    }
  } catch {
    // Nothing to clean.
  }
}

subRouter.post("/upload_init", (req: any, res) => {
  const name = String(req.body.name || "").slice(0, 200);
  const size = Number(req.body.size);
  const ext = extensionOf(name);
  if (!UPLOAD_EXTENSIONS.includes(ext)) {
    return res.status(400).json({ status: "error", message: "نوع فایل مجاز نیست" });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return res.status(400).json({ status: "error", message: "حجم فایل نامعتبر است" });
  }
  if (size > MAX_BYTES) {
    return res.status(400).json({
      status: "error",
      message: `حداکثر حجم مجاز ${Math.round(MAX_BYTES / 1024 / 1024).toLocaleString("fa-IR")} مگابایت است`,
    });
  }
  const id = crypto.randomBytes(12).toString("hex");
  const file = path.join(tmpDir(), `${id}.part`);
  fs.writeFileSync(file, "");
  pending.set(id, { id, owner: ownerOf(req), name, ext, size, received: 0, file, updatedAt: Date.now() });
  res.json({ status: "success", upload_id: id, chunk_size: CHUNK_SIZE });
});

subRouter.post(
  "/upload_chunk",
  express.raw({ type: "application/octet-stream", limit: CHUNK_SIZE + 1024 }),
  async (req: any, res) => {
    const upload = findUpload(req, res);
    if (!upload) return;
    const offset = Number(req.query.offset);
    const chunk: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!chunk.length) return res.status(400).json({ status: "error", message: "قطعه خالی است" });
    // A retried piece that already arrived is simply acknowledged.
    if (offset + chunk.length <= upload.received) {
      return res.json({ status: "success", received: upload.received });
    }
    if (offset !== upload.received) {
      return res.status(409).json({ status: "error", message: "ترتیب قطعات نامعتبر است", received: upload.received });
    }
    if (upload.received + chunk.length > upload.size) {
      return res.status(400).json({ status: "error", message: "حجم ارسالی بیش از اندازه اعلام‌شده است" });
    }
    await fs.promises.appendFile(upload.file, chunk);
    upload.received += chunk.length;
    upload.updatedAt = Date.now();
    res.json({ status: "success", received: upload.received });
  },
);

/** Where an interrupted upload stopped, so the browser can resume from there. */
subRouter.get("/upload_status", (req: any, res) => {
  const upload = findUpload(req, res);
  if (!upload) return;
  res.json({ status: "success", received: upload.received, size: upload.size });
});

subRouter.post("/upload_complete", async (req: any, res) => {
  const upload = findUpload(req, res);
  if (!upload) return;
  if (upload.received !== upload.size) {
    return res.status(400).json({ status: "error", message: "فایل کامل دریافت نشده است", received: upload.received });
  }
  const filename = randomFileName("file", upload.ext);
  const store = getBlobStore();
  const mime = mimeForFile(filename);
  try {
    if (store.putFile) await store.putFile("uploads", filename, upload.file, mime);
    else await store.put("uploads", filename, await fs.promises.readFile(upload.file), mime);
  } catch (e: any) {
    console.error("Upload could not be stored:", e);
    return res.status(500).json({ status: "error", message: "ذخیره فایل ممکن نشد" });
  } finally {
    fs.rmSync(upload.file, { force: true });
    pending.delete(upload.id);
  }
  res.json({ status: "success", url: "/uploads/" + filename, name: upload.name, size: upload.size, mime });
});

subRouter.post("/upload_cancel", (req: any, res) => {
  const upload = findUpload(req, res);
  if (!upload) return;
  fs.rmSync(upload.file, { force: true });
  pending.delete(upload.id);
  res.json({ status: "success" });
});

export default subRouter;
