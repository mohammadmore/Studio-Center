import {
  colleagues,
  collections,
  contentTemplates,
  contents,
  organizations,
  recycle_bin,
  smartEventsBank,
} from "../store/state.js";

/** Content cards reference colleagues by id, username or full name; resolve them to ids. */
export function resolveColleagueIds(refs: unknown): number[] {
  const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
  const ids = new Set<number>();
  for (const ref of list) {
    const value = String(ref ?? "").trim();
    if (!value) continue;
    const found = colleagues.find(
      (c) =>
        String(c.id) === value ||
        c.full_name === value ||
        (typeof c.username === "string" && c.username.toLowerCase() === value.toLowerCase()),
    );
    if (found) ids.add(found.id);
  }
  return [...ids];
}

export function cardColleagueIds(card: any) {
  return resolveColleagueIds([...(card.assigned_colleagues || []), card.project_manager].filter(Boolean));
}

const RESTORE_TARGETS: Record<string, any[]> = {
  contents,
  organizations,
  smartEventsBank,
  contentTemplates,
  collections,
};

export function newBinId() {
  let id = Date.now();
  while (recycle_bin.some((b) => b.id === id)) id++;
  return id;
}

export function moveToRecycleBin(table: string, data: any, title: string, user: any, extra: any = {}) {
  const id = newBinId();
  recycle_bin.unshift({
    id,
    table,
    item_title: title,
    data,
    deleted_at: new Date().toISOString(),
    deleted_by: user?.username || user?.full_name || "سیستم",
    ...extra,
  });
  return id;
}

/** Puts a recycle-bin item back where it came from. Returns false if it was restored already. */
export function restoreBinItem(binItem: any) {
  if (!binItem || binItem.restored) return false;
  const target = RESTORE_TARGETS[binItem.table];
  if (!target) return false;
  if (!target.some((x) => x.id === binItem.data?.id)) target.unshift(binItem.data);
  // Deleting an organisation also removed its content cards; bring them back too.
  for (const card of binItem.related_contents || []) {
    if (!contents.some((c) => c.id === card.id)) contents.push(card);
  }
  binItem.restored = true;
  binItem.restored_at = new Date().toISOString();
  return true;
}

/** Undoes restoreBinItem (used by redo of a deletion). */
export function reDeleteBinItem(binItem: any) {
  if (!binItem || !binItem.restored) return false;
  const target = RESTORE_TARGETS[binItem.table];
  if (!target) return false;
  const idx = target.findIndex((x) => x.id === binItem.data?.id);
  if (idx !== -1) {
    binItem.data = target[idx];
    target.splice(idx, 1);
  }
  const relatedIds = new Set((binItem.related_contents || []).map((c: any) => c.id));
  for (let i = contents.length - 1; i >= 0; i--) {
    if (relatedIds.has(contents[i].id)) contents.splice(i, 1);
  }
  binItem.restored = false;
  return true;
}
