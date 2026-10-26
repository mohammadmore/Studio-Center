import express from "express";
import { LRUCache } from "lru-cache";
import { getBlobStore } from "../store/db.js";
import type { BlobKind, StoredBlob } from "../store/drivers/types.js";
import { isInlineSafe, isSafeFileName, mimeForFile } from "../utils/files.js";

const mediaRouter = express.Router();

// Only remote stores (Firebase) benefit from caching; local files are read from disk.
const cache = new LRUCache<string, StoredBlob>({
  max: 200,
  maxSize: 64 * 1024 * 1024,
  sizeCalculation: (blob) => blob.buffer.length || 1,
});

function serve(kind: BlobKind) {
  return async (req: any, res: any) => {
    const filename = req.params.filename;
    if (!isSafeFileName(filename)) return res.status(404).send("Not found");
    const mime = mimeForFile(filename);
    const setHeaders = () => {
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      if (kind === "uploads" && (!isInlineSafe(mime) || req.query.download)) {
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      }
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    };
    // Local files are streamed (with Range support, so videos can be seeked).
    const local = getBlobStore().localPath?.(kind, filename);
    if (local) {
      setHeaders();
      return res.sendFile(local, { headers: { "Content-Type": mime }, cacheControl: false, lastModified: true });
    }
    const key = `${kind}/${filename}`;
    let blob = cache.get(key);
    if (!blob) {
      blob = (await getBlobStore().get(kind, filename)) || undefined;
      if (!blob) return res.status(404).send("Not found");
      cache.set(key, blob);
    }
    // The type comes from our own extension allow-list, never from the uploader.
    setHeaders();
    res.send(blob.buffer);
  };
}

mediaRouter.get("/fonts/:filename", serve("fonts"));
mediaRouter.get("/uploads/:filename", serve("uploads"));

export default mediaRouter;
