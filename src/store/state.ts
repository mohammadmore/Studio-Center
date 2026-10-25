export const roles: any[] = [];
export const colleagues: any[] = [];
export const organizations: any[] = [];
export const collections: any[] = [];
export const contents: any[] = [];
export const settings: any = {};
export const leaves: any[] = [];
export const audit_logs: any[] = [];
export const recycle_bin: any[] = [];
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

// Every persisted array, keyed by the name used in the stored snapshot.
export const tables: Record<string, any[]> = {
  roles,
  colleagues,
  organizations,
  collections,
  contents,
  leaves,
  audit_logs,
  recycle_bin,
  batch_operations,
  notifications,
  tokens,
  templatesData,
  contentTemplates,
  templateSuggestions,
  expenses,
  invoices,
  mediaAssets,
  smartEventsBank,
  clientSelections,
};

export type Snapshot = Record<string, any>;

export function snapshotState(): Snapshot {
  return JSON.parse(JSON.stringify({ ...tables, settings }));
}

export function applySnapshot(data: Snapshot) {
  for (const [name, arr] of Object.entries(tables)) {
    arr.length = 0;
    if (Array.isArray(data[name])) for (const item of data[name]) arr.push(item);
  }
  for (const key of Object.keys(settings)) delete settings[key];
  if (data.settings && typeof data.settings === "object") {
    Object.assign(settings, data.settings);
  }
}

export function isStateEmpty() {
  return Object.values(tables).every((arr) => arr.length === 0) &&
    Object.keys(settings).length === 0;
}
