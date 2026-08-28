import { colleagues, roles } from "../store/state.js";

export function getRoleInfoForUser(user: any) {
  if (!user)
    return {
      role_id: null,
      role_name: "همکار استودیو",
      permissions: [],
    };
  if (user?.role_id === "client") {
    return {
      role_id: "client",
      role_name: "نماینده برند (کارفرما)",
      permissions: ["client"],
    };
  }
  const colleague = colleagues.find(
    (c) =>
      (user.id !== void 0 && c.id == user.id) ||
      (user.username &&
        c.username?.toLowerCase() === user.username.toLowerCase()),
  );
  const currentRoleId = colleague ? colleague?.role_id : user?.role_id;
  const userRole = roles.find((r) => r.id == currentRoleId);
  let roleName = userRole ? userRole.name : "";
  if (!roleName) {
    if (currentRoleId === "admin" || user.username === "admin") {
      roleName = "مدیر کل";
    } else {
      roleName = "همکار استودیو";
    }
  }
  let permissions = userRole ? userRole.permissions : [];
  if (!userRole && (currentRoleId === "admin" || user.username === "admin")) {
    permissions = [
      "admin",
      "dashboard",
      "depot",
      "calendar",
      "smart-events",
      "media",
      "templates",
      "organizations",
      "client-portal",
      "invoice",
      "add-user",
      "leaves",
      "team",
      "settings",
      "audit",
      "tokens",
      "manage_roles",
    ];
  }
  return { role_id: currentRoleId, role_name: roleName, permissions };
}

export function getPermissionCategories() {
  return [
    {
      id: "admin",
      name: "مدیریت کل سیستم",
      permissions: [{ id: "admin", name: "دسترسی کامل (Admin)" }],
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
        { id: "reports", name: "گزارشات" },
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
        { id: "recycle_bin", name: "سطل زباله" },
      ],
    },
  ];
}
