const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  zip: "application/zip",
  rar: "application/vnd.rar",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain; charset=utf-8",
  psd: "image/vnd.adobe.photoshop",
  ai: "application/postscript",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
export const FONT_EXTENSIONS = ["ttf", "otf", "woff", "woff2"];
// Anything a browser could execute (html, svg, js, xml...) is deliberately missing.
export const UPLOAD_EXTENSIONS = Object.keys(MIME_TYPES).filter(
  (ext) => !FONT_EXTENSIONS.includes(ext),
);

// Inline display is only allowed for types browsers render without running scripts.
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
]);

export function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name || "");
  return match ? match[1].toLowerCase() : "";
}

export function mimeForFile(name: string) {
  return MIME_TYPES[extensionOf(name)] || "application/octet-stream";
}

export function isInlineSafe(mime: string) {
  return INLINE_TYPES.has(mime);
}

/** A single path segment made of safe characters, never "." / ".." or hidden files. */
export function isSafeFileName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 150 &&
    /^[A-Za-z0-9_\-][A-Za-z0-9_.\-]*$/.test(name) &&
    !name.includes("..")
  );
}

export function randomFileName(prefix: string, ext: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
}
