import { colleagues, organizations, roles } from "../store/state.js";

export function getPermissionCategories() {
  return [
    {
      id: "admin",
      name: "مدیریت کل سیستم",
      permissions: [{ id: "admin", name: "دسترسی کامل (Admin)", hint: "همه‌ی بخش‌ها و همه‌ی کارها؛ فقط به افراد کاملاً مورد اعتماد بدهید" }],
    },
    {
      id: "overview",
      name: "داشبورد و گزارشات",
      permissions: [
        { id: "dashboard", name: "داشبورد", hint: "آمار کلی تولید، گلوگاه‌ها و وضعیت برندها" },
        { id: "reports", name: "گزارشات", hint: "گزارش‌های تفصیلی و خروجی اکسل" },
      ],
    },
    {
      id: "content",
      name: "مدیریت محتوا",
      permissions: [
        { id: "depot", name: "دپوی محتوا", hint: "دیدن و ویرایش همه‌ی کارت‌های محتوا و ساخت کارت جدید" },
        { id: "collections", name: "مجموعه‌ها", hint: "دسته‌بندی محتواها در مجموعه‌ها" },
        { id: "archive", name: "آرشیو محتوا", hint: "محتواهای بایگانی‌شده" },
      ],
    },
    {
      id: "assets",
      name: "دارایی‌ها و قالب‌ها",
      permissions: [
        { id: "media", name: "مدیریت دارایی‌ها (Media)", hint: "کتابخانه‌ی فایل‌ها و دارایی‌های برندها" },
        { id: "templates", name: "قالب‌های محتوایی", hint: "قالب‌های آماده برای برنامه‌ی ماهانه" },
      ],
    },
    {
      id: "calendar",
      name: "تقویم و رویدادها",
      permissions: [
        { id: "calendar", name: "تقویم محتوایی", hint: "برنامه‌ریزی تاریخ و ساعت انتشار" },
        { id: "smart-events", name: "مناسبت‌های هوشمند", hint: "بانک مناسبت‌ها و پیشنهاد به برندها" },
      ],
    },
    {
      id: "clients",
      name: "ارتباط با مشتریان",
      permissions: [
        { id: "organizations", name: "مدیریت سازمان‌ها (برندها)", hint: "افزودن و ویرایش برندها و حساب کارفرما" },
        { id: "client-portal", name: "پورتال کارفرما", hint: "دیدن پنل هر برند از طرف او" },
        { id: "contracts", name: "قراردادها و پکیج‌ها", hint: "پکیج ماهانه‌ی برندها و صدور فاکتور از روی آن" },
        { id: "brand_kit", name: "ویرایش کیت برند", hint: "ویرایش لوگو، رنگ و راهنمای برند (دیدنش برای همه آزاد است)" },
      ],
    },
    {
      id: "workflow",
      name: "گردش کار تولید",
      permissions: [
        { id: "requests", name: "درخواست‌ها و بریف‌ها", hint: "بررسی درخواست‌های برندها و تبدیل به کارت تولید" },
        { id: "approve_content", name: "تایید داخلی محتوا (قبل از کارفرما)", hint: "تایید یا رد نسخه‌ها پیش از رسیدن به کارفرما" },
        { id: "workload", name: "بار کاری تیم", hint: "دیدن حجم کار و مرخصی همه‌ی همکاران" },
        { id: "shoots", name: "برنامه تصویربرداری و تجهیزات", hint: "برنامه‌ی تصویربرداری، عوامل و رزرو تجهیزات" },
        { id: "timesheet_report", name: "گزارش زمان و سودآوری", hint: "زمان ثبت‌شده‌ی همه، نرخ ساعتی و سود هر برند" },
      ],
    },
    {
      id: "team_finance",
      name: "تیم و مالی",
      permissions: [
        { id: "team", name: "تیم من", hint: "فهرست و اطلاعات همکاران" },
        { id: "leaves", name: "مرخصی‌ها", hint: "ثبت و تایید مرخصی‌ها" },
        { id: "finance", name: "مالی", hint: "هزینه‌ها، درآمد و سود" },
        { id: "invoice", name: "فاکتور و پیش‌فاکتور", hint: "ساخت و ارسال فاکتور و پیش‌فاکتور" },
      ],
    },
    {
      id: "system",
      name: "تنظیمات سیستم",
      permissions: [
        { id: "settings", name: "تنظیمات", hint: "انواع محتوا، قیمت‌ها، پلتفرم‌ها و اطلاعات استودیو" },
        { id: "add-user", name: "مدیریت کاربران", hint: "ساخت حساب همکاران و تغییر رمز" },
        { id: "manage_roles", name: "مدیریت نقش‌ها", hint: "ساخت و ویرایش همین نقش‌ها" },
        { id: "audit", name: "گزارشات سیستم (Audit)", hint: "گزارش فعالیت کاربران در سیستم" },
        { id: "tokens", name: "مدیریت توکن‌ها", hint: "اتصال حساب‌های اینستاگرام و یوتیوب برندها" },
        { id: "integrations", name: "اعلان‌های خارجی (پیامک، ایمیل، پیام‌رسان)", hint: "تنظیم پیامک، ایمیل، تلگرام و بله" },
        { id: "recycle_bin", name: "سطل زباله", hint: "بازیابی یا حذف دائمی موارد حذف‌شده" },
      ],
    },
  ];
}

export const ALL_PERMISSIONS = getPermissionCategories().flatMap((c) =>
  c.permissions.map((p) => p.id),
);

// A permission that is implied by holding another one.
const IMPLIED_BY: Record<string, string[]> = {
  collections: ["depot"],
  archive: ["depot"],
  recycle_bin: ["audit"],
  reports: ["dashboard"],
  tokens: ["settings"],
  integrations: ["settings"],
  contracts: ["organizations", "finance"],
  brand_kit: ["organizations"],
  requests: ["client-portal", "organizations", "depot"],
  workload: ["team", "leaves"],
  shoots: ["depot", "calendar"],
  timesheet_report: ["finance"],
};

export function findColleague(user: any) {
  if (!user || user.role_id === "client") return undefined;
  return colleagues.find(
    (c) =>
      (user.id !== undefined && c.id == user.id) ||
      (user.username &&
        typeof c.username === "string" &&
        c.username.toLowerCase() === String(user.username).toLowerCase()),
  );
}

export function findClientOrg(user: any) {
  if (!user || user.role_id !== "client") return undefined;
  const orgId = user.org_id ?? user.id;
  return organizations.find((o) => o.id == orgId);
}

export function getRoleInfoForUser(user: any) {
  if (!user)
    return {
      role_id: null,
      role_name: "همکار استودیو",
      permissions: [] as string[],
    };
  if (user.role_id === "client") {
    return {
      role_id: "client",
      role_name: "نماینده برند (کارفرما)",
      permissions: ["client"],
    };
  }
  const colleague = findColleague(user);
  const currentRoleId = colleague ? colleague.role_id : user.role_id;
  const userRole = roles.find((r) => r.id == currentRoleId);
  let permissions: string[] = Array.isArray(userRole?.permissions)
    ? [...userRole.permissions]
    : [];
  let roleName = userRole ? userRole.name : "";
  // Role 1 is the built-in administrator role.
  if (currentRoleId == 1 || currentRoleId === "admin") {
    if (!permissions.includes("admin")) permissions.push("admin");
    roleName = roleName || "مدیر کل";
  }
  if (permissions.includes("admin")) {
    permissions = Array.from(new Set([...ALL_PERMISSIONS, ...permissions]));
  }
  return {
    role_id: currentRoleId,
    role_name: roleName || "همکار استودیو",
    permissions,
  };
}

export function isAdmin(user: any) {
  return getRoleInfoForUser(user).permissions.includes("admin");
}

export function hasPermission(user: any, perm: string | string[]) {
  if (!user || user.role_id === "client") return false;
  const owned = getRoleInfoForUser(user).permissions;
  if (owned.includes("admin")) return true;
  const wanted = Array.isArray(perm) ? perm : [perm];
  return wanted.some(
    (p) => owned.includes(p) || (IMPLIED_BY[p] || []).some((alt) => owned.includes(alt)),
  );
}

/** A colleague's own picture, else the default avatar of their role for their gender. */
export function effectiveAvatar(c: any) {
  if (c?.avatar_url) return c.avatar_url;
  const role = roles.find((r) => r.id == c?.role_id);
  if (!role) return "";
  if (c?.gender === "female") return role.default_female_avatar || role.default_male_avatar || "";
  return role.default_male_avatar || role.default_female_avatar || "";
}

/** Every permission the user effectively holds, including the implied ones (for menus). */
export function effectivePermissions(user: any) {
  if (!user || user.role_id === "client") return [] as string[];
  const owned = getRoleInfoForUser(user).permissions;
  return Array.from(new Set([...owned, ...ALL_PERMISSIONS.filter((p) => hasPermission(user, p))]));
}

// Pages in the order the sidebar lists them, used to pick a landing page.
export const PAGE_PERMISSIONS: [string, string][] = [
  ["/depot", "depot"],
  ["/dashboard", "dashboard"],
  ["/calendar", "calendar"],
  ["/collections", "collections"],
  ["/archive", "archive"],
  ["/smart-events", "smart-events"],
  ["/media", "media"],
  ["/templates", "templates"],
  ["/organizations", "organizations"],
  ["/client-portal", "client-portal"],
  ["/invoices_list", "invoice"],
  ["/requests", "requests"],
  ["/contracts", "contracts"],
  ["/shoots", "shoots"],
  ["/workload", "workload"],
  ["/team", "team"],
  ["/leaves", "leaves"],
  ["/reports", "reports"],
  ["/finance", "finance"],
  ["/settings", "settings"],
  ["/add-user", "add-user"],
  ["/audit", "audit"],
  ["/tokens", "tokens"],
  ["/recycle_bin", "recycle_bin"],
];

export function landingPageFor(user: any) {
  if (!user) return "/";
  if (user.role_id === "client") return "/client-dashboard";
  const page = PAGE_PERMISSIONS.find(([, perm]) => hasPermission(user, perm));
  return page ? page[0] : "/my-projects";
}

/** Short fingerprint of the password hash, stored in the session to revoke it on password change. */
export function passwordFingerprint(hash: unknown) {
  return typeof hash === "string" && hash ? hash.slice(-12) : "";
}

export function stripSecrets<T extends Record<string, any>>(record: T) {
  if (!record) return record;
  // ics_token is the only credential of a private calendar feed.
  const { passwordHash, password, ics_token, ...safe } = record as any;
  return safe as Omit<T, "passwordHash" | "password" | "ics_token">;
}

export const MIN_PASSWORD_LENGTH = 8;
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344",
  "password", "password1", "passw0rd", "qwertyui", "qwerty123", "asdfghjk", "iloveyou", "admin123", "administrator",
  "abcd1234", "1q2w3e4r", "zxcvbnm1", "letmein1", "welcome1", "changeme",
]);

/**
 * Why a new password is not acceptable, or null when it is fine. Only new and changed
 * passwords are checked; existing ones keep working at login.
 */
export function passwordProblem(password: string, username?: string): string | null {
  const pw = String(password || "");
  if (pw.length < MIN_PASSWORD_LENGTH) return `رمز عبور باید حداقل ${MIN_PASSWORD_LENGTH.toLocaleString("fa-IR")} کاراکتر باشد.`;
  if (pw.length > 200) return "رمز عبور بیش از حد طولانی است.";
  const lower = pw.toLowerCase();
  if (username && lower === String(username).trim().toLowerCase()) return "رمز عبور نباید با نام کاربری یکی باشد.";
  if (/^(.)\1+$/.test(pw) || COMMON_PASSWORDS.has(lower)) return "این رمز عبور بیش از حد ساده و قابل حدس است؛ رمز دیگری انتخاب کنید.";
  return null;
}
