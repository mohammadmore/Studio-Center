import { colleagues, organizations, roles } from "../store/state.js";

export function getPermissionCategories() {
  return [
    {
      id: "admin",
      name: "مدیریت کل سیستم",
      permissions: [{ id: "admin", name: "دسترسی کامل (Admin)" }],
    },
    {
      id: "overview",
      name: "داشبورد و گزارشات",
      permissions: [
        { id: "dashboard", name: "داشبورد" },
        { id: "reports", name: "گزارشات" },
      ],
    },
    {
      id: "content",
      name: "مدیریت محتوا",
      permissions: [
        { id: "depot", name: "دپوی محتوا" },
        { id: "collections", name: "مجموعه‌ها" },
        { id: "archive", name: "آرشیو محتوا" },
      ],
    },
    {
      id: "assets",
      name: "دارایی‌ها و قالب‌ها",
      permissions: [
        { id: "media", name: "مدیریت دارایی‌ها (Media)" },
        { id: "templates", name: "قالب‌های محتوایی" },
      ],
    },
    {
      id: "calendar",
      name: "تقویم و رویدادها",
      permissions: [
        { id: "calendar", name: "تقویم محتوایی" },
        { id: "smart-events", name: "مناسبت‌های هوشمند" },
      ],
    },
    {
      id: "clients",
      name: "ارتباط با مشتریان",
      permissions: [
        { id: "organizations", name: "مدیریت سازمان‌ها (برندها)" },
        { id: "client-portal", name: "پورتال کارفرما" },
        { id: "contracts", name: "قراردادها و پکیج‌ها" },
        { id: "brand_kit", name: "ویرایش کیت برند" },
      ],
    },
    {
      id: "workflow",
      name: "گردش کار تولید",
      permissions: [
        { id: "requests", name: "درخواست‌ها و بریف‌ها" },
        { id: "approve_content", name: "تایید داخلی محتوا (قبل از کارفرما)" },
        { id: "workload", name: "بار کاری تیم" },
        { id: "shoots", name: "برنامه تصویربرداری و تجهیزات" },
        { id: "timesheet_report", name: "گزارش زمان و سودآوری" },
      ],
    },
    {
      id: "team_finance",
      name: "تیم و مالی",
      permissions: [
        { id: "team", name: "تیم من" },
        { id: "leaves", name: "مرخصی‌ها" },
        { id: "finance", name: "مالی" },
        { id: "invoice", name: "صدور پیش فاکتور" },
      ],
    },
    {
      id: "system",
      name: "تنظیمات سیستم",
      permissions: [
        { id: "settings", name: "تنظیمات" },
        { id: "add-user", name: "مدیریت کاربران" },
        { id: "manage_roles", name: "مدیریت نقش‌ها" },
        { id: "audit", name: "گزارشات سیستم (Audit)" },
        { id: "tokens", name: "مدیریت توکن‌ها" },
        { id: "integrations", name: "اعلان‌های خارجی (پیامک، ایمیل، پیام‌رسان)" },
        { id: "recycle_bin", name: "سطل زباله" },
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
  const { passwordHash, password, ...safe } = record as any;
  return safe as Omit<T, "passwordHash" | "password">;
}
