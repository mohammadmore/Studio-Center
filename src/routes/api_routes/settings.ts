import express from "express";
import { organizations, settings, tokens } from "../../store/state.js";
import { getBlobStore, saveDatabase } from "../../store/db.js";
import { checkPermission, isClient } from "../../middleware/auth.js";
import { nextId, safeUrl, sanitizeIcon, toInt } from "../../utils/helpers.js";
import { extensionOf, FONT_EXTENSIONS, isSafeFileName, randomFileName } from "../../utils/files.js";

const DEFAULT_FONT = "vazirmatn";
const MAX_FONT_BYTES = 5 * 1024 * 1024;
// Keys of `settings` that hold other data and must never be treated as a list group.
const RESERVED_SETTING_KEYS = ["studio_info", "fonts", "font_order", "active_font"];

function isValidGroup(group: unknown): group is string {
  return (
    typeof group === "string" &&
    /^[a-z][a-z0-9_]{0,40}$/.test(group) &&
    !RESERVED_SETTING_KEYS.includes(group)
  );
}

function looksLikeFont(buffer: Buffer) {
  const tag = buffer.toString("latin1", 0, 4);
  return (
    tag === "\x00\x01\x00\x00" || tag === "OTTO" || tag === "true" || tag === "wOFF" || tag === "wOF2"
  );
}

function maskToken(token: unknown) {
  const value = String(token || "");
  return value.length <= 8 ? "••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

const subRouter = express.Router();

subRouter.get("/manage_settings", (req, res) => {
  const activeSettings: Record<string, any> = {};
  for (const key of Object.keys(settings)) {
    // Clients only need the lists used to label content (types, platforms, ...).
    if (isClient(req) && !Array.isArray(settings[key])) continue;
    if (Array.isArray(settings[key])) {
      if (key === "routine_holidays") {
        activeSettings[key] = settings[key];
      } else {
        activeSettings[key] = settings[key].filter((s) => s.is_active === 1);
      }
    } else {
      activeSettings[key] = settings[key];
    }
  }
  res.json({ status: "success", data: activeSettings });
});

subRouter.post(
  "/manage_settings",
  checkPermission("settings"),
  (req, res) => {
    let { action, id, group, name, key, price, icon, logo_url } = req.body;
    const itemName = name || key;
    if (!isValidGroup(group) || (settings[group] !== undefined && !Array.isArray(settings[group]))) {
      return res.status(400).json({ status: "error", message: "گروه تنظیمات نامعتبر است" });
    }
    if (!settings[group]) settings[group] = [];
    if (id !== void 0 && id !== null && id !== "") {
      id = parseInt(id, 10);
    }
    if (action === "delete" || action === "restore") {
      if (group && settings[group] && Array.isArray(settings[group])) {
        const item = settings[group].find((i) => i.id === id);
        if (item) {
          // Items are only deactivated, so "undo" simply turns them back on.
          item.is_active = action === "delete" ? 0 : 1;
          saveDatabase();
          return res.json({
            status: "success",
            message: action === "delete" ? "آیتم حذف شد" : "آیتم بازگردانی شد",
          });
        }
      }
      return res.status(404).json({ status: "error", message: "آیتم یافت نشد" });
    }
    if (action === "edit") {
      if (group && settings[group] && Array.isArray(settings[group])) {
        const item = settings[group].find((i) => i.id === id);
        if (item) {
          if (itemName) item.setting_key = itemName;
          if (price !== void 0 && price !== "") {
            (item as any).price = parseInt(price) || 0;
            (item as any).base_price = parseInt(price) || 0;
          }
          if (icon !== void 0) (item as any).icon = sanitizeIcon(icon);
          if (logo_url !== void 0) (item as any).logo_url = safeUrl(logo_url);
          if (req.body.is_active !== void 0)
            item.is_active = req.body.is_active;
          saveDatabase();
          return res.json({
            status: "success",
            message:
              "تغییرات ذخیره شد",
          });
        }
      }
      return res
        .status(404)
        .json({
          status: "error",
          message:
            "آیتم یافت نشد",
        });
    }
    if (action === "add" || !action) {
      let maxId = 0;
      for (let k in settings) {
        if (Array.isArray(settings[k])) {
          settings[k].forEach((i) => {
            if (i.id > maxId) maxId = i.id;
          });
        }
      }
      const newItem: any = { id: maxId + 1, setting_key: itemName, is_active: 1 };
      if (price !== void 0 && price !== "") {
        newItem.price = parseInt(price) || 0;
        newItem.base_price = parseInt(price) || 0;
      }
      if (icon !== void 0) {
        newItem.icon = sanitizeIcon(icon);
      }
      if (logo_url !== void 0) {
        newItem.logo_url = safeUrl(logo_url);
      }
      if (!itemName) {
        return res.status(400).json({ status: "error", message: "نام آیتم الزامی است" });
      }
      settings[group].push(newItem);
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "آیتم افزوده شد",
      });
    }
    if (action === "reorder") {
      if (group && settings[group] && Array.isArray(settings[group])) {
        const activeItems = settings[group].filter((i) => i.is_active !== 0);
        const activeIndex = activeItems.findIndex((i) => i.id === id);
        if (activeIndex !== -1) {
          let targetActiveIndex = -1;
          if (req.body.direction === "up" && activeIndex > 0) {
            targetActiveIndex = activeIndex - 1;
          } else if (
            req.body.direction === "down" &&
            activeIndex < activeItems.length - 1
          ) {
            targetActiveIndex = activeIndex + 1;
          }
          if (targetActiveIndex !== -1) {
            const targetId = activeItems[targetActiveIndex].id;
            const realIndex = settings[group].findIndex((i) => i.id === id);
            const targetRealIndex = settings[group].findIndex(
              (i) => i.id === targetId,
            );
            const temp = settings[group][realIndex];
            settings[group][realIndex] = settings[group][targetRealIndex];
            settings[group][targetRealIndex] = temp;
            saveDatabase();
            return res.json({
              status: "success",
              message:
                "ترتیب تغییر کرد",
            });
          }
        }
      }
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "امکان جابجایی وجود ندارد",
        });
    }
    return res.status(400).json({ status: "error", message: "عملیات نامعتبر" });
  },
);

subRouter.post("/save_token", checkPermission("tokens"), (req, res) => {
  const { org_id, org_name, platform_name, account_username, access_token } = req.body;
  const orgId = toInt(org_id);
  const org = organizations.find((o) => o.id == orgId);
  if (!org || !platform_name || !access_token) {
    return res.status(400).json({ status: "error", message: "اطلاعات توکن ناقص است" });
  }
  tokens.push({
    id: nextId(tokens),
    org_id: orgId,
    org_name: org_name || org.org_name,
    platform_name,
    account_username,
    access_token,
    status: "active",
    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1e3).toISOString(),
  });
  saveDatabase();
  res.json({ status: "success", message: "توکن با موفقیت متصل شد" });
});

subRouter.get("/get_tokens", checkPermission("tokens"), (req, res) => {
  // The raw access tokens never leave the server.
  res.json({
    status: "success",
    tokens: tokens.map((t) => ({ ...t, access_token: maskToken(t.access_token) })),
  });
});

subRouter.get("/get_fonts", (req, res) => {
  let files: string[] = [];
  getBlobStore()
    .list("fonts")
    .then((list) => (files = list))
    .catch((e) => console.error("Could not list fonts:", e))
    .finally(() => {
      let fontsList: any[] = [
        { filename: DEFAULT_FONT, fa_name: "وزیرمتن (پیش‌فرض)", en_name: DEFAULT_FONT },
      ];
      if (settings.fonts && settings.fonts[DEFAULT_FONT]) {
        fontsList[0] = { ...fontsList[0], ...settings.fonts[DEFAULT_FONT] };
      }
      for (const file of files) {
        fontsList.push({
          filename: file,
          fa_name: file,
          en_name: file,
          ...(settings.fonts && settings.fonts[file]),
        });
      }
      if (Array.isArray(settings.font_order)) {
        const pos = (f: string) => {
          const i = settings.font_order.indexOf(f);
          return i === -1 ? 999 : i;
        };
        fontsList = fontsList.sort((a, b) => pos(a.filename) - pos(b.filename));
      }
      res.json({ status: "success", fonts: fontsList });
    });
});

subRouter.post("/reorder_fonts", checkPermission("settings"), (req, res) => {
  const { filename, direction, current_order } = req.body;
  const order: string[] = Array.isArray(settings.font_order) ? [...settings.font_order] : [];
  if (Array.isArray(current_order)) {
    current_order.forEach((f) => {
      if (typeof f === "string" && !order.includes(f)) order.push(f);
    });
  }
  if (typeof filename !== "string") {
    return res.status(400).json({ status: "error", message: "فونت نامعتبر" });
  }
  if (!order.includes(filename)) order.push(filename);
  const index = order.indexOf(filename);
  const target = direction === "up" ? index - 1 : direction === "down" ? index + 1 : -1;
  if (target < 0 || target >= order.length) {
    return res.status(400).json({ status: "error", message: "امکان جابجایی وجود ندارد" });
  }
  [order[index], order[target]] = [order[target], order[index]];
  settings.font_order = order;
  saveDatabase();
  return res.json({ status: "success" });
});

subRouter.post("/upload_font", checkPermission("settings"), async (req, res) => {
  const { font, filename } = req.body;
  if (typeof font !== "string" || typeof filename !== "string") {
    return res.status(400).json({ status: "error", message: "No font provided" });
  }
  const ext = extensionOf(filename);
  if (!FONT_EXTENSIONS.includes(ext)) {
    return res.status(400).json({ status: "error", message: "فقط فایل‌های ttf، otf، woff و woff2 مجاز هستند" });
  }
  const buffer = Buffer.from(font.replace(/^data:[^,]*;base64,/, ""), "base64");
  if (buffer.length > MAX_FONT_BYTES || !looksLikeFont(buffer)) {
    return res.status(400).json({ status: "error", message: "فایل فونت نامعتبر یا بیش از حد بزرگ است" });
  }
  // The stored name is generated; the original name is kept as the display name.
  const stored = randomFileName("font", ext);
  await getBlobStore().put("fonts", stored, buffer, `font/${ext}`);
  const displayName = filename.replace(/\.[^.]+$/, "").slice(0, 100);
  if (!settings.fonts) settings.fonts = {};
  settings.fonts[stored] = { fa_name: displayName, en_name: displayName };
  settings.active_font = stored;
  saveDatabase();
  res.json({ status: "success", message: "فونت با موفقیت آپلود و فعال شد" });
});

subRouter.post("/set_active_font", checkPermission("settings"), async (req, res) => {
  const { filename } = req.body;
  if (filename !== DEFAULT_FONT) {
    const exists = isSafeFileName(filename) && (await getBlobStore().get("fonts", filename));
    if (!exists) return res.status(404).json({ status: "error", message: "فونت یافت نشد" });
  }
  settings.active_font = filename;
  saveDatabase();
  return res.json({
    status: "success",
    message: filename === DEFAULT_FONT ? "فونت پیش‌فرض فعال شد" : "فونت با موفقیت فعال شد",
  });
});

subRouter.post("/rename_font", checkPermission("settings"), (req, res) => {
  const { filename, fa_name, en_name } = req.body;
  if (filename !== DEFAULT_FONT && !isSafeFileName(filename)) {
    return res.status(400).json({ status: "error", message: "Missing filename" });
  }
  if (!settings.fonts) settings.fonts = {};
  if (!settings.fonts[filename]) settings.fonts[filename] = {};
  settings.fonts[filename].fa_name = String(fa_name || filename).slice(0, 100);
  settings.fonts[filename].en_name = String(en_name || filename).slice(0, 100);
  saveDatabase();
  res.json({ status: "success", message: "نام فونت ذخیره شد" });
});

subRouter.post("/delete_font", checkPermission("settings"), async (req, res) => {
  const { filename } = req.body;
  if (!isSafeFileName(filename) || filename === DEFAULT_FONT) {
    return res.status(400).json({ status: "error", message: "فونت نامعتبر" });
  }
  await getBlobStore().delete("fonts", filename);
  if (settings.fonts) delete settings.fonts[filename];
  if (Array.isArray(settings.font_order)) {
    settings.font_order = settings.font_order.filter((f: string) => f !== filename);
  }
  if (settings.active_font === filename) settings.active_font = DEFAULT_FONT;
  saveDatabase();
  res.json({ status: "success", message: "فونت حذف شد" });
});

subRouter.get("/get_studio_info", (req, res) => {
  res.json({ status: "success", data: settings.studio_info || {} });
});

subRouter.post(
  "/save_studio_info",
  checkPermission("settings"),
  (req, res) => {
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      const updates: Record<string, any> = {};
      for (const [k, v] of Object.entries(req.body)) {
        if (/^[a-z][a-z0-9_]{0,40}$/i.test(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null)) {
          updates[k] = /^logo/.test(k) ? safeUrl(v) : v;
        }
      }
      settings.studio_info = { ...settings.studio_info, ...updates };
      saveDatabase();
      return res.json({
        status: "success",
        message:
          "اطلاعات استودیو با موفقیت ذخیره شد",
        data: settings.studio_info,
      });
    }
    return res.json({ status: "error", message: "No data provided" });
  },
);

export default subRouter;
