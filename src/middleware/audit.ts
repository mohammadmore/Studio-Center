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
  backups: "پشتیبان‌گیری از داده‌ها",
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
  requests: "درخواست کارفرما",
  update_stage_plan: "مسئول و موعد مراحل",
  review_versions: "نسخه بازبینی",
  review_feedback: "نظر روی نسخه",
  review_feedback_resolve: "وضعیت نظر نسخه",
  update_captions: "کپشن پلتفرم‌ها",
  caption_review: "بررسی کپشن",
  deliverables: "فایل‌های تحویلی",
  workflow_settings: "تنظیمات گردش کار",
  manage_contract: "قرارداد",
  contract_invoice: "فاکتور قرارداد",
  client_quotes: "تصمیم کارفرما درباره پیش‌فاکتور",
  time_entries: "ثبت زمان",
  timer: "تایمر",
  hourly_cost: "نرخ ساعتی",
  shoots: "برنامه تصویربرداری",
  equipment: "تجهیزات",
  brand_kit: "کیت برند",
  snippets: "بانک متن",
  integrations: "اعلان‌های خارجی",
  integration_contacts: "اطلاعات تماس اعلان‌ها",
  integration_test: "پیام آزمایشی",
  my_channels: "تنظیم اعلان‌های شخصی",
  saved_views: "نمای ذخیره‌شده",
  ics_link: "لینک تقویم",
  monthly_report: "گزارش ماهانه",
  fetch_live_stats: "دریافت آمار پست",
  update_platform_metrics: "آمار پلتفرم",
  toggle_platform_published: "وضعیت انتشار پلتفرم",
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
  create: "ثبت",
  convert: "تبدیل به کارت",
  set_status: "تغییر وضعیت",
  message: "پیام",
  cancel: "لغو",
  submit: "ارسال",
  internal: "تایید داخلی",
  deliver: "تحویل",
  start: "شروع",
  stop: "توقف",
  send_quote: "ارسال پیش‌فاکتور",
  convert_quote: "تبدیل پیش‌فاکتور",
  add_payment: "ثبت پرداخت",
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
  "/collections": "مجموعه‌ها",
  "/my-projects": "پروژه‌های من",
  "/media": "کتابخانه دارایی‌ها",
  "/templates": "قالب‌ها",
  "/client-portal": "پورتال کارفرما",
  "/invoices_list": "فاکتورها",
  "/invoice": "فاکتور",
  "/add-user": "مدیریت کاربران",
  "/tokens": "سلامت توکن‌ها",
  "/notifications": "صندوق پیام‌ها",
  "/requests": "درخواست‌ها",
  "/contracts": "قراردادها",
  "/workload": "بار کاری تیم",
  "/timesheet": "تایم‌شیت",
  "/shoots": "برنامه تصویربرداری",
  "/brand-kit": "کیت برند",
  "/integrations": "اعلان‌های خارجی",
  "/monthly-report": "گزارش ماهانه",
  "/client-dashboard": "داشبورد کارفرما",
  "/client-review": "تایید محتوا (کارفرما)",
  "/client-events": "مناسبت‌های کارفرما",
  "/client-requests": "درخواست‌های کارفرما",
  "/client-files": "فایل‌های تحویلی کارفرما",
  "/client-quotes": "پیش‌فاکتورهای کارفرما",
  "/client-brand-kit": "کیت برند (کارفرما)",
};

// Read-only calls, routine polling and upload pieces would only drown the log.
const SKIPPED_API = new Set([
  "/api/login",
  "/api/logout",
  "/api/check_auth",
  "/api/read_notifications",
  "/api/upload_init",
  "/api/upload_chunk",
  "/api/upload_complete",
  "/api/upload_cancel",
  "/api/timer",
]);

/**
 * The path is taken when the request arrives: by the time the response is
 * finished a mounted router may have cut "/api" off it, which made every
 * internal call look like a page visit.
 */
function describe(req: any, path: string, method: string): string | null {
  if (path.startsWith("/api/")) {
    if (method === "GET" || SKIPPED_API.has(path)) return null;
    const endpoint = path.slice(5).split("/")[0];
    const rawAction = String(req.body?.action || req.method);
    const action = ACTION_NAMES[rawAction] || rawAction;
    const endpointName = ENDPOINT_NAMES[endpoint] || endpoint;
    const title =
      req.body?.title || req.body?.item_title || req.body?.name || req.body?.org_name || req.body?.full_name;
    const extra = typeof title === "string" && title.length < 50 ? ` ("${title}")` : "";
    return `${action} ${endpointName}${extra}`;
  }
  if (method !== "GET") return null;
  // Only real pages; anything else (files, feeds, redirects) is not a visit.
  const page = PAGE_NAMES[path];
  return page ? `بازدید از صفحه ${page}` : null;
}

export function auditRequest(req: any, res: any, next: any) {
  const path = req.path;
  const method = req.method;
  res.on("finish", () => {
    // While previewing a brand's panel the visit belongs to the staff member.
    const user = req.previewBy?.user || req.user;
    if (!user || res.statusCode === 304 || res.statusCode === 302) return;
    const desc = describe(req, path, method);
    if (!desc) return;
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    addAuditLog(user, `${desc} (${ok ? "موفق" : `خطا ${res.statusCode}`})`, req.ip);
    saveDatabase();
  });
  next();
}
