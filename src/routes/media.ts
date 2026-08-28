import express from "express";
import path from "path";
import fs from "fs";

const router = express.Router();

router.get("/font/:filename", async (req, res) => {
  const filename = req.params.filename;
  try {
    const fontsDir = path.join(process.cwd(), 'center', 'assets', 'fonts');
    const fp = path.join(fontsDir, filename);
    if (fs.existsSync(fp)) {
      res.setHeader("Content-Type", "font/" + filename.split('.').pop());
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.sendFile(fp);
    }
    return res.status(404).send("Font not found");
  } catch (error) {
    console.error("Error serving font:", error);
    res.status(500).send("Error serving font");
  }
});

router.get("/uploads/:filename", async (req, res) => {
  const filename = req.params.filename;
  try {
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const fp = path.join(uploadsDir, filename);
    if (fs.existsSync(fp)) {
      res.setHeader("Content-Type", "image/" + filename.split('.').pop());
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.sendFile(fp);
    }
    return res.status(404).send("File not found");
  } catch (error) {
    console.error("Error serving upload:", error);
    res.status(500).send("Error serving upload");
  }
});

export default router;
