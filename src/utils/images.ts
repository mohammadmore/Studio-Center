/**
 * Shrinks profile pictures, logos and icons before they are stored: they are
 * never shown larger than a few hundred pixels, so keeping 4000px photos only
 * wastes disk space and bandwidth. Content files and deliverables are not
 * touched (they go through the file uploader, not here).
 *
 * Uses the optional "sharp" package. If the host could not install it, images
 * are stored as they arrive (the browser already shrinks them before upload).
 */

export type ImagePurpose = "avatar" | "logo" | "icon" | "image";

// Largest edge in pixels: about three times the biggest size the UI shows,
// so pictures stay sharp on high-density screens and in printed invoices.
export const MAX_EDGE: Record<ImagePurpose, number> = {
  avatar: 256,
  logo: 512,
  icon: 128,
  image: 1600,
};

export function imagePurpose(value: unknown): ImagePurpose {
  return value === "avatar" || value === "logo" || value === "icon" ? value : "image";
}

let sharpLoader: Promise<any> | null = null;
function loadSharp() {
  if (!sharpLoader) {
    sharpLoader = import("sharp")
      .then((m: any) => m.default || m)
      .catch(() => {
        console.warn("Image optimisation is off: the optional 'sharp' package is not installed.");
        return null;
      });
  }
  return sharpLoader;
}

export interface OptimizedImage {
  buffer: Buffer;
  ext: string;
}

/** Returns a smaller WebP version, or the original when it is already small (or sharp is missing). */
export async function optimizeImage(buffer: Buffer, ext: string, purpose: ImagePurpose): Promise<OptimizedImage> {
  const sharp = await loadSharp();
  if (!sharp) return { buffer, ext };
  const max = MAX_EDGE[purpose];
  try {
    const animated = ext === "gif" || ext === "webp";
    const image = sharp(buffer, { animated, failOn: "none" });
    const meta = await image.metadata();
    const width = meta.width || 0;
    const height = meta.pageHeight || meta.height || 0;
    // Already small enough in both pixels and bytes: keep it untouched.
    if (width <= max && height <= max && buffer.length <= 150 * 1024) return { buffer, ext };
    const out = await image
      .rotate()
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return out.length < buffer.length ? { buffer: out, ext: "webp" } : { buffer, ext };
  } catch (e) {
    console.warn("Image could not be optimised, storing the original:", e);
    return { buffer, ext };
  }
}

/** Resizes an image but keeps its format, so the file can stay under the same name. */
async function shrinkSameFormat(buffer: Buffer, ext: string, max: number): Promise<Buffer | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  const image = sharp(buffer, { animated: ext === "gif" || ext === "webp", failOn: "none" });
  const meta = await image.metadata();
  const height = meta.pageHeight || meta.height || 0;
  if ((meta.width || 0) <= max && height <= max) return null;
  let pipeline = image.rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true });
  if (ext === "png") pipeline = pipeline.png({ compressionLevel: 9, palette: true });
  else if (ext === "jpg" || ext === "jpeg") pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
  else if (ext === "webp") pipeline = pipeline.webp({ quality: 82 });
  else if (ext === "gif") pipeline = pipeline.gif();
  else return null;
  const out = await pipeline.toBuffer();
  return out.length < buffer.length ? out : null;
}

/**
 * One-off pass over pictures uploaded before optimisation existed: avatars,
 * logos and platform icons larger than needed are shrunk in place.
 * Returns how many bytes were saved.
 */
export async function shrinkExistingImages(
  refs: { url: unknown; purpose: ImagePurpose }[],
  store: { get(kind: "uploads", name: string): Promise<{ buffer: Buffer } | null>; put(kind: "uploads", name: string, b: Buffer, mime: string): Promise<void> },
  mimeFor: (name: string) => string,
) {
  if (!(await loadSharp())) return -1;
  let saved = 0;
  const done = new Set<string>();
  for (const ref of refs) {
    const match = /^\/uploads\/([A-Za-z0-9_.\-]+\.(png|jpe?g|webp|gif))$/i.exec(String(ref.url || ""));
    if (!match || done.has(match[1])) continue;
    done.add(match[1]);
    try {
      const blob = await store.get("uploads", match[1]);
      if (!blob) continue;
      const out = await shrinkSameFormat(blob.buffer, match[2].toLowerCase(), MAX_EDGE[ref.purpose]);
      if (!out) continue;
      await store.put("uploads", match[1], out, mimeFor(match[1]));
      saved += blob.buffer.length - out.length;
    } catch (e) {
      console.warn(`Could not shrink ${match[1]}:`, e);
    }
  }
  return saved;
}
