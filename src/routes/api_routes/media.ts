import { doc, setDoc } from "firebase/firestore";
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

subRouter.post("/upload_image", async (req, res) => {
  const { image } = req.body;
  if (!image || typeof image !== "string") {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0641\u0631\u0645\u062A \u062A\u0635\u0648\u06CC\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A",
      });
  }
  if (image.startsWith("data:image")) {
    try {
      const matches = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const ext = matches[1];
        const data = matches[2];
        const allowedExts = ["jpeg", "png", "webp", "gif", "jpg"];
        if (!allowedExts.includes(ext.toLowerCase())) {
          return res
            .status(400)
            .json({
              status: "error",
              message:
                "\u0641\u0631\u0645\u062A \u062A\u0635\u0648\u06CC\u0631 \u0645\u062C\u0627\u0632 \u0646\u06CC\u0633\u062A",
            });
        }
        if (data.length > 8e5) {
          return res
            .status(400)
            .json({
              status: "error",
              message:
                "\u062D\u062C\u0645 \u062A\u0635\u0648\u06CC\u0631 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632 \u0627\u0633\u062A",
            });
        }
        const filename =
          "upload_" +
          Date.now() +
          "_" +
          Math.floor(Math.random() * 1e3) +
          "." +
          ext;
        const buffer = Buffer.from(data, "base64");
        const fs2 = require("fs");
        const path2 = require("path");
        const uploadsDir = path2.join(process.cwd(), "public", "uploads");
        if (!fs2.existsSync(uploadsDir))
          fs2.mkdirSync(uploadsDir, { recursive: true });
        fs2.writeFileSync(path2.join(uploadsDir, filename), buffer);
        try {
          const { db } = require("./src/db/index.js");
          await setDoc(doc(db, "uploads", filename), {
            data: data,
            mime: "image/" + ext,
            createdAt: Date.now()
          });
        } catch(fsErr) {
          console.error("Firestore save error:", fsErr);
        }
        const localCdnUrl = "/uploads/" + filename;
        return res.json({ status: "success", url: localCdnUrl });
      }
    } catch (err) {
      console.error("Upload error:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message:
            "\u062E\u0637\u0627 \u062F\u0631 \u0622\u067E\u0644\u0648\u062F",
        });
    }
  } else if (image.startsWith("http")) {
    return res.json({ status: "success", url: image });
  }
  res
    .status(400)
    .json({
      status: "error",
      message:
        "\u062A\u0635\u0648\u06CC\u0631 \u062E\u0627\u0644\u06CC \u06CC\u0627 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A",
    });
});

subRouter.post("/upload_file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "\u0641\u0627\u06CC\u0644\u06CC \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A",
      });
  }
  try {
    const extMatch = req.file.originalname.match(/\.([^\.]+)$/);
    const ext = extMatch ? extMatch[1] : "bin";
    const filename =
      "file_" + Date.now() + "_" + Math.floor(Math.random() * 1e3) + "." + ext;
    const fs2 = require("fs");
    const path2 = require("path");
    const uploadsDir = path2.join(process.cwd(), "public", "uploads");
    if (!fs2.existsSync(uploadsDir))
      fs2.mkdirSync(uploadsDir, { recursive: true });
    fs2.writeFileSync(path2.join(uploadsDir, filename), req.file.buffer);
    try {
      const { db } = require("./src/db/index.js");
      await setDoc(doc(db, "uploads", filename), {
        data: req.file.buffer.toString("base64"),
        mime: req.file.mimetype || "application/octet-stream",
        createdAt: Date.now()
      });
    } catch(fsErr) {
      console.error("Firestore save error:", fsErr);
    }
    const localCdnUrl = "/uploads/" + filename;
    return res.json({ status: "success", url: localCdnUrl });
  } catch (err) {
    console.error("File upload error:", err);
    return res
      .status(500)
      .json({
        status: "error",
        message:
          "\u062E\u0637\u0627 \u062F\u0631 \u0622\u067E\u0644\u0648\u062F \u0641\u0627\u06CC\u0644",
      });
  }
});

subRouter.get("/get_media", (req, res) => {
  const assetsWithOrg = mediaAssets.map((asset) => {
    const org = organizations.find((o) => o.id == asset.org_id);
    return {
      ...asset,
      org_name: org
        ? org.org_name
        : "\u0639\u0645\u0648\u0645\u06CC / \u0628\u062F\u0648\u0646 \u0633\u0627\u0632\u0645\u0627\u0646",
      org_color: org ? org.color : "var(--text-gray)",
      org_logo: org ? org.logo_url : "",
    };
  });
  res.json({ status: "success", assets: assetsWithOrg });
});

subRouter.post("/save_media", (req, res) => {
  const { action, media, org_id, asset_name, asset_type, file_url } = req.body;
  if (action === "batch_add") {
    let currentId =
      mediaAssets.length > 0
        ? Math.max(...mediaAssets.map((x) => x.id)) + 1
        : 1;
    media.forEach((m) => {
      let numericOrgId = null;
      if (m.org_username) {
        const org = organizations.find((o) => o.username === m.org_username);
        if (org) numericOrgId = org.id;
      } else if (m.org_id) {
        numericOrgId = parseInt(m.org_id);
      }
      mediaAssets.push({
        id: currentId++,
        org_id: numericOrgId,
        asset_name: m.asset_name,
        asset_type: m.asset_type,
        file_url: m.file_url,
        created_at: new Date().toLocaleDateString("fa-IR"),
      });
    });
    saveDatabase().catch(console.error);
    return res.json({
      status: "success",
      message:
        "\u0641\u0627\u06CC\u0644\u200C\u0647\u0627 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F\u0646\u062F.",
    });
  }
  if (!asset_name || !asset_type) {
    return res.json({
      status: "error",
      message:
        "\u0641\u06CC\u0644\u062F\u200C\u0647\u0627\u06CC \u0636\u0631\u0648\u0631\u06CC \u0631\u0627 \u062A\u06A9\u0645\u06CC\u0644 \u06A9\u0646\u06CC\u062F.",
    });
  }
  const newAsset = {
    id:
      mediaAssets.length > 0
        ? Math.max(...mediaAssets.map((x) => x.id)) + 1
        : 1,
    org_id: org_id || null,
    asset_name,
    asset_type,
    file_url,
    created_at: new Date().toLocaleDateString("fa-IR"),
  };
  mediaAssets.push(newAsset);
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "\u0641\u0627\u06CC\u0644 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062F\u0631 \u06A9\u062A\u0627\u0628\u062E\u0627\u0646\u0647 \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F.",
  });
});

export default subRouter;
