import { batch_operations, collections, colleagues, contents, recycle_bin, time_entries } from "../store/state.js";

/**
 * Renaming a production stage in basic settings renames it everywhere it is stored, so old
 * cards show the new name too: a card's stages, finished stages and stage plan (owner and
 * due date), logged time, running timers, collection defaults, and the copies kept for
 * undo and the recycle bin (restoring one must not bring the old name back).
 * The activity history is left as written.
 */
export function renameStageEverywhere(oldName: string, newName: string) {
  const from = String(oldName || "").trim();
  const to = String(newName || "").trim();
  if (!from || !to || from === to) return 0;
  const isOld = (s: unknown) => typeof s === "string" && s.trim() === from;
  const renameList = (list: unknown) => {
    if (!Array.isArray(list) || !list.some(isOld)) return list;
    const out: any[] = [];
    for (const s of list) {
      const v = isOld(s) ? to : s;
      if (!out.includes(v)) out.push(v);
    }
    return out;
  };
  const renameKeys = (obj: any) => {
    if (!obj || typeof obj !== "object") return false;
    const key = Object.keys(obj).find(isOld);
    if (key === undefined) return false;
    // If the new name already has an entry, it wins; empty parts are taken from the old one.
    obj[to] = obj[to] && typeof obj[to] === "object" && typeof obj[key] === "object" ? { ...obj[key], ...obj[to] } : obj[to] ?? obj[key];
    delete obj[key];
    return true;
  };
  const renameCard = (card: any) => {
    if (!card || typeof card !== "object") return false;
    let changed = false;
    for (const field of ["stages", "completed_stages"]) {
      const next = renameList(card[field]);
      if (next !== card[field]) { card[field] = next; changed = true; }
    }
    if (renameKeys(card.stage_plan)) changed = true;
    return changed;
  };

  let cards = 0;
  for (const card of contents) if (renameCard(card)) cards++;
  for (const e of time_entries) if (isOld(e?.stage)) e.stage = to;
  for (const c of colleagues) if (c?.running_timer && isOld(c.running_timer.stage)) c.running_timer.stage = to;
  for (const col of collections) {
    const d = col?.defaults;
    if (!d) continue;
    const next = renameList(d.stages);
    if (next !== d.stages) d.stages = next;
    renameKeys(d.stage_owners);
  }
  for (const item of recycle_bin) {
    if (item?.table === "contents") renameCard(item.data);
    (Array.isArray(item?.related_contents) ? item.related_contents : []).forEach(renameCard);
    if (item?.table === "collections" && item.data?.defaults) {
      item.data.defaults.stages = renameList(item.data.defaults.stages);
      renameKeys(item.data.defaults.stage_owners);
    }
  }
  for (const op of batch_operations) (Array.isArray(op?.previous_states) ? op.previous_states : []).forEach(renameCard);
  return cards;
}
