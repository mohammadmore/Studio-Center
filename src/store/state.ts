export const roles: any[] = [];
export const colleagues: any[] = [];
export const organizations: any[] = [];
export const collections: any[] = [];
export const contents: any[] = [];
export const settings: any = {};
export const leaves: any[] = [];
export const audit_logs: any[] = [];
export const recycle_bin: any[] = [
  {
    id: 99999,
    table: "contents",
    item_title: "محتوای تستی حذف شده",
    data: {
      id: 99999,
      title: "محتوای تستی",
    },
    deleted_at: new Date().toISOString(),
    deleted_by: "سیستم",
  },
];
export const batch_operations: any[] = [];
export const notifications: any[] = [];
export const tokens: any[] = [];
export const templatesData: any[] = [];
export const contentTemplates: any[] = [];
export const templateSuggestions: any[] = [];
export const expenses: any[] = [];
export const invoices: any[] = [];
export const mediaAssets: any[] = [];
export const smartEventsBank: any[] = [];
export const clientSelections: any[] = [];
