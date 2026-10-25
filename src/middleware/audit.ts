import { addAuditLog } from "../utils/logger.js";
import { saveDatabase } from "../store/db.js";

const ENDPOINT_NAMES: Record<string, string> = {
  manage_users: "مدیریت کاربران/همکاران",
  manage_orgs: "مدیریت سازمان‌ها",
  manage_collections: "مدیریت مجموعه‌ها",
  manage_smart_events: "تقویم و مناسبت‌ها",
  manage_roles: "مدیریت نقش‌ها",
  manage_settings: "تنظیمات سیستم",
  manage_content_template: "قالب محتوا",
  upload_smart_events: "آپلود اکسل مناسبت‌ها",
  bulk_import_contents: "ورود گروهی محتوا",
  client_review: "بررسی کارفرما",
  add_client_events: "انتخاب مناسبت‌های کارفرما",
  add_content: "محتوا",
  batch_edit_contents: "محتوا (گروهی)",
  update_content_details: "جزئیات محتوا",
  schedule_content: "زمان‌بندی محتوا",
  bulk_schedule_contents: "زمان‌بندی گروهی محتوا",
  update_leave: "وضعیت مرخصی",
  delete_leave: "حذف مرخصی",
  save_leave: "درخواست مرخصی",
  save_user: "کاربر",
  upload_image: "آپلود تصویر",
  upload_file: "آپلود فایل",
  upload_font: "آپلود فونت",
  save_token: "توکن",
  save_media: "رسانه",
  save_onboarding: "آنبوردینگ",
  save_expense: "مالی/هزینه",
  save_studio_info: "اطلاعات استودیو",
  confirm_events: "تایید مناسبت‌ها",
  toggle_stage: "مراحل محتوا",
  rename_font: "فونت",
  delete_font: "حذف فونت",
  set_active_font: "فونت فعال",
  reorder_fonts: "ترتیب فونت‌ها",
  invoices: "فاکتور",
  undo_batch_operation: "لغو عملیات",
  redo_batch_operation: "انجام مجدد عملیات",
  apply_template: "قالب",
  apply_content_template: "قالب محتوا",
  dismiss_template_suggestion: "رد پیشنهاد قالب",
  fulfill_template_suggestion: "تایید پیشنهاد قالب",
  unlock_events: "باز کردن قفل تقویم",
  recycle_bin: "سطل زباله",
  read_notifications: "اعلان‌ها",
};

const ACTION_NAMES: Record<string, string> = {
  add: "افزودن",
  edit: "ویرایش",
  update: "ویرایش",
  delete: "حذف",
  batch_delete: "حذف گروهی",
  batch_add: "افزودن گروهی",
  update_status: "تغییر وضعیت",
  approve: "تایید",
  reject: "رد",
  archive: "آرشیو",
  restore: "بازیابی",
  delete_permanent: "حذف دائمی",
  save: "ذخیره",
  POST: "ذخیره/ثبت",
};

const PAGE_NAMES: Record<string, string> = {
  "/dashboard": "داشبورد",
  "/depot": "دپوی محتوا",
  "/archive": "آرشیو محتوا",
  "/calendar": "تقویم محتوایی",
  "/smart-events": "تقویم هوشمند",
  "/team": "تیم و همکاران",
  "/organizations": "سازمان‌ها",
  "/leaves": "مرخصی‌ها",
  "/reports": "گزارشات",
  "/settings": "تنظیمات",
  "/audit": "تاریخچه فعالیت‌ها",
  "/recycle_bin": "سطل زباله",
  "/finance": "امور مالی",
};

// Read-only calls and routine polling would only drown the log.
const SKIPPED_API = new Set(["/api/login", "/api/logout", "/api/check_auth", "/api/read_notifications"]);

function describe(req: any): string | null {
  if (req.path.startsWith("/api/")) {
    if (req.method === "GET" || SKIPPED_API.has(req.path)) return null;
    const endpoint = req.path.slice(5).split("/")[0];
    const rawAction = String(req.body?.action || req.method);
    const action = ACTION_NAMES[rawAction] || rawAction;
    const endpointName = ENDPOINT_NAMES[endpoint] || endpoint;
    const title =
      req.body?.title || req.body?.item_title || req.body?.name || req.body?.org_name || req.body?.full_name;
    const extra = typeof title === "string" && title.length < 50 ? ` ("${title}")` : "";
    return `${action} ${endpointName}${extra}`;
  }
  if (req.method !== "GET") return null;
  if (/^\/(assets|fonts|uploads|socket\.io)\b/.test(req.path) || /\.[a-z0-9]+$/i.test(req.path)) {
    return null;
  }
  const page = PAGE_NAMES[req.path];
  return `بازدید از ${page ? `صفحه ${page}` : req.path}`;
}

export function auditRequest(req: any, res: any, next: any) {
  res.on("finish", () => {
    const user = req.user;
    if (!user || res.statusCode === 304 || res.statusCode === 302) return;
    const desc = describe(req);
    if (!desc) return;
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    addAuditLog(user, `${desc} (${ok ? "موفق" : `خطا ${res.statusCode}`})`, req.ip);
    saveDatabase();
  });
  next();
}
