import express from "express";
import { decryptSecret, encryptSecret } from "../../utils/secrets.js";
import { backupPath, createBackup, listBackups } from "../../utils/backups.js";
import { isAdmin } from "../../utils/authUtils.js";
import { addAuditLog } from "../../utils/logger.js";
import { colleagues, contents, organizations, roles, settings, tokens } from "../../store/state.js";
import { getIntegrationConfig } from "../../utils/notifiers.js";
import { getBlobStore, saveDatabase } from "../../store/db.js";
import { checkPermission, isClient } from "../../middleware/auth.js";
import { nextId, safeUrl, sanitizeIcon, toInt } from "../../utils/helpers.js";
import { extensionOf, FONT_EXTENSIONS, isSafeFileName, randomFileName } from "../../utils/files.js";
import { renameStageEverywhere } from "../../utils/stageRename.js";

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
    // Internal bookkeeping never leaves the server.
    if (key === "admin_reset_applied" || key === "invoice_send_rule") continue;
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
          // A renamed stage is renamed on every card (and wherever else it is stored).
          let renamedCards = 0;
          if (group === "stages" && itemName && String(itemName).trim() !== String(item.setting_key || "").trim()) {
            renamedCards = renameStageEverywhere(item.setting_key, itemName);
          }
          if (itemName) item.setting_key = group === "stages" ? String(itemName).trim() : itemName;
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
            message: renamedCards
              ? `تغییرات ذخیره شد؛ نام مرحله در ${renamedCards.toLocaleString("fa-IR")} محتوا هم عوض شد`
              : "تغییرات ذخیره شد",
            renamed_cards: renamedCards,
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
            "امکان جابه‌جایی وجود ندارد",
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
    access_token: encryptSecret(String(access_token).trim()),
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
    tokens: tokens.map((t) => ({ ...t, access_token: maskToken(decryptSecret(t.access_token)) })),
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
      res.json({ status: "success", fonts: fontsList, active: settings.active_font || DEFAULT_FONT });
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
    return res.status(400).json({ status: "error", message: "امکان جابه‌جایی وجود ندارد" });
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

/** First-run checklist: what an admin still has to set up before the studio works smoothly. */
subRouter.get("/setup_status", checkPermission("settings"), (req, res) => {
  const info = settings.studio_info || {};
  const active = (list: any) => (Array.isArray(list) ? list.filter((x: any) => x && x.is_active !== 0) : []);
  const types = active(settings.content_type);
  const integ = getIntegrationConfig();
  const steps = [
    { id: "studio", title: "نام و لوگوی استودیو", hint: "در تنظیمات پایه، نام و لوگوی روشن و تیره را وارد کنید.", href: "settings", done: !!(info.name && (info.logo_light || info.logo_dark)) },
    { id: "content_types", title: "انواع محتوا و قیمت‌ها", hint: "انواع محتوا (پست، ریلز، ویدیو…) را با قیمت هر کدام تعریف کنید.", href: "settings", done: types.length > 0 && types.some((t: any) => Number(t.price) > 0) },
    { id: "platforms", title: "پلتفرم‌های انتشار", hint: "اینستاگرام، تلگرام و… را در تنظیمات پایه اضافه کنید.", href: "settings", done: active(settings.platform).length > 0 },
    { id: "roles", title: "نقش‌ها و سطح دسترسی", hint: "برای همکاران نقش‌هایی مثل طراح یا تدوین‌گر بسازید.", href: "settings", done: roles.some((r) => r.id != 1) },
    { id: "team", title: "افزودن همکاران", hint: "حساب کاربری همکاران را بسازید.", href: "add-user", done: colleagues.filter((c) => c.is_active !== 0).length > 1 },
    { id: "orgs", title: "افزودن اولین برند (کارفرما)", hint: "برند را با نام کاربری پنل کارفرما ثبت کنید.", href: "organizations", done: organizations.some((o) => o.is_active !== 0) },
    { id: "integrations", title: "اطلاع‌رسانی بیرونی (پیامک، ایمیل، تلگرام، بله)", hint: "حداقل یک کانال را فعال کنید تا کارفرما و تیم خبردار شوند.", href: "integrations", done: ["sms", "email", "telegram", "bale"].some((ch) => integ[ch]?.enabled) },
    { id: "first_content", title: "ساخت اولین محتوا", hint: "اولین کارت تولید را در میز کار بسازید.", href: "depot", done: contents.some((c) => !c.is_deleted) },
  ];
  res.json({ status: "success", data: { steps, done: steps.filter((s) => s.done).length, total: steps.length, dismissed: !!info.setup_dismissed } });
});

// ───── Database backups (admins only) ─────
const adminOnly = (req: any, res: any, next: any) =>
  isAdmin(req.user) ? next() : res.status(403).json({ status: "error", message: "فقط مدیر کل به پشتیبان‌ها دسترسی دارد." });

subRouter.get("/backups", adminOnly, (req, res) => {
  res.json({ status: "success", data: listBackups() });
});

subRouter.post("/backups", adminOnly, (req: any, res) => {
  try {
    const made = createBackup(true);
    addAuditLog(req.user.username, "ایجاد پشتیبان دستی از داده‌ها", req.ip);
    res.json({ status: "success", message: "پشتیبان ساخته شد", data: made });
  } catch (e) {
    console.error("Backup failed:", e);
    res.status(500).json({ status: "error", message: "ساخت پشتیبان انجام نشد؛ فضای هاست یا دسترسی پوشه را بررسی کنید." });
  }
});

subRouter.get("/backups/download", adminOnly, (req: any, res) => {
  const file = backupPath(String(req.query.name || ""));
  if (!file) return res.status(404).json({ status: "error", message: "پشتیبان پیدا نشد" });
  addAuditLog(req.user.username, `دانلود پشتیبان ${req.query.name}`, req.ip);
  res.setHeader("Cache-Control", "no-store");
  res.download(file, String(req.query.name));
});

/** The studio's bank accounts; a single account saved the old way counts as the default one. */
export function bankAccounts(info: any = settings.studio_info || {}) {
  if (Array.isArray(info.bank_accounts) && info.bank_accounts.length) return info.bank_accounts;
  if (info.shaba || info.card_number || info.account_holder) {
    return [{ id: "main", title: "حساب اصلی", holder: info.account_holder || info.manager_name || "", card: info.card_number || "", shaba: info.shaba || "", is_default: true }];
  }
  return [];
}

function cleanBankAccounts(list: unknown) {
  if (!Array.isArray(list)) return [];
  const str = (v: unknown, max = 120) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");
  const seen = new Set<string>();
  const out = list.slice(0, 20).map((a: any, i: number) => {
    let id = str(a?.id, 40).replace(/[^a-z0-9_-]/gi, "") || `acc${i + 1}`;
    while (seen.has(id)) id += "x";
    seen.add(id);
    return { id, title: str(a?.title), holder: str(a?.holder), card: str(a?.card, 40), shaba: str(a?.shaba, 40), is_default: a?.is_default === true };
  }).filter((a) => a.title || a.holder || a.card || a.shaba);
  if (out.length && !out.some((a) => a.is_default)) out[0].is_default = true;
  let found = false;
  for (const a of out) { if (a.is_default && found) a.is_default = false; if (a.is_default) found = true; }
  return out;
}

subRouter.get("/get_studio_info", (req, res) => {
  res.json({ status: "success", data: { ...(settings.studio_info || {}), bank_accounts: bankAccounts() } });
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
      if (Array.isArray(req.body.bank_accounts)) {
        const accounts = cleanBankAccounts(req.body.bank_accounts);
        updates.bank_accounts = accounts;
        // Older screens read the single-account fields: keep them equal to the default account.
        const def = accounts.find((a) => a.is_default);
        updates.shaba = def?.shaba || "";
        updates.card_number = def?.card || "";
        updates.account_holder = def?.holder || "";
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

// ───────── Default stage due dates, counted back from the publish date ─────────
subRouter.post("/stage_due_template", checkPermission("settings"), (req, res) => {
  const input = req.body.template && typeof req.body.template === "object" ? req.body.template : {};
  const out: Record<string, number> = {};
  for (const [type, days] of Object.entries(input).slice(0, 200)) {
    const n = Number(days);
    if (String(type).trim() && Number.isFinite(n)) out[String(type).trim()] = Math.max(0, Math.min(30, Math.round(n)));
  }
  settings.stage_due_template = out;
  saveDatabase(); // applied to cards in production when stored (see utils/tidy.ts)
  res.json({ status: "success", message: "فاصله‌ی موعد مراحل ذخیره شد" });
});

// ───────── Stage names used on cards but missing from the stages list ─────────
// Older cards carry stages such as «طراحی کاور» or «آپلود نهایی» that are not in the list.
// They are listed with how many cards use them, and can be merged into a listed stage
// (renamed everywhere, keeping owners, due dates and ticks) or added to the list.
function listedStages() {
  return new Set((Array.isArray(settings.stages) ? settings.stages : []).filter((s: any) => s && s.is_active !== 0).map((s: any) => String(s.setting_key).trim()));
}

subRouter.get("/unlisted_stages", checkPermission("settings"), (req, res) => {
  const listed = listedStages();
  const counts = new Map<string, number>();
  for (const card of contents) {
    const names = new Set<string>([
      ...(Array.isArray(card.stages) ? card.stages : []),
      ...(Array.isArray(card.completed_stages) ? card.completed_stages : []),
      ...Object.keys(card.stage_plan && typeof card.stage_plan === "object" ? card.stage_plan : {}),
    ].map((s: any) => String(s).trim()).filter(Boolean));
    for (const n of names) if (!listed.has(n)) counts.set(n, (counts.get(n) || 0) + 1);
  }
  const data = [...counts.entries()].map(([name, cards]) => ({ name, cards })).sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name, "fa"));
  res.json({ status: "success", data });
});

subRouter.post("/merge_stage", checkPermission("settings"), (req, res) => {
  const from = String(req.body.from || "").trim();
  const to = String(req.body.to || "").trim();
  if (!from || !to || from === to) return res.status(400).json({ status: "error", message: "مرحله‌ی مبدا و مقصد را انتخاب کنید" });
  if (!listedStages().has(to)) return res.status(400).json({ status: "error", message: "مرحله‌ی مقصد باید در فهرست مراحل باشد" });
  const cards = renameStageEverywhere(from, to);
  saveDatabase();
  res.json({ status: "success", cards, message: `«${from}» در ${cards.toLocaleString("fa-IR")} محتوا به «${to}» تبدیل شد` });
});

export default subRouter;
