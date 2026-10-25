import express from "express";
import fs from "fs";
import path from "path";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../db/index.js";
import { LRUCache } from 'lru-cache';

const mediaRouter = express.Router();
const fontCache: Record<string, Buffer> = {};
const uploadCache = new LRUCache<string, any>({
  max: 100,
  maxSize: 50 * 1024 * 1024,
  sizeCalculation: (val) => val.buffer ? val.buffer.length : 1
});

mediaRouter.get("/fonts/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), "public", "fonts", filename);
    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", "font/ttf");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.sendFile(filePath);
    }
    if (fontCache[filename]) {
      res.setHeader("Content-Type", "font/ttf");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(fontCache[filename]);
    }
    const docSnap = await getDoc(doc(db, "fonts", filename));
    if (docSnap.exists()) {
      const fileData = docSnap.data();
      const buffer = Buffer.from(fileData.data, "base64");
      fontCache[filename] = buffer;
      res.setHeader("Content-Type", "font/ttf");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(buffer);
    }
    res.status(404).send("Not found");
  } catch (e) {
    res.status(500).send("Error");
  }
});

mediaRouter.get("/uploads/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    if (fs.existsSync(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.sendFile(filePath);
    }
    if (uploadCache.has(filename)) {
      const cached = uploadCache.get(filename);
      res.setHeader("Content-Type", cached.mime);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(cached.buffer);
    }
    const docSnap = await getDoc(doc(db, "uploads", filename));
    if (docSnap.exists()) {
      const fileData = docSnap.data();
      const buffer = Buffer.from(fileData.data, "base64");
      uploadCache.set(filename, { buffer, mime: fileData.mime });
      res.setHeader("Content-Type", fileData.mime);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(buffer);
    }
    res.status(404).send("Not found");
  } catch (e) {
    res.status(500).send("Error");
  }
});

export default mediaRouter;
