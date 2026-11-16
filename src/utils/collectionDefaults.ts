import { colleagues, collections } from "../store/state.js";

/**
 * Default values of a collection: a card that joins it is offered these (never applied
 * without the user confirming each one). A sub-collection inherits what it does not set.
 */
export const DEFAULT_KEYS = ["content_type", "project_manager", "team", "stages", "stage_owners", "platforms", "publish_time"] as const;

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map((x) => str(x)).filter(Boolean))].slice(0, 50) : [];

/** Cleans what the collection form sends; null when nothing is set. */
export function cleanCollectionDefaults(input: any) {
  if (!input || typeof input !== "object") return null;
  const out: any = {};
  if (str(input.content_type)) out.content_type = str(input.content_type);
  if (str(input.project_manager)) out.project_manager = str(input.project_manager);
  const team = strList(input.team).filter((n) => !out.project_manager || n !== out.project_manager);
  if (team.length) out.team = team;
  const stages = strList(input.stages);
  if (stages.length) out.stages = stages;
  const platforms = strList(input.platforms);
  if (platforms.length) out.platforms = platforms;
  if (/^\d{1,2}:\d{2}$/.test(str(input.publish_time))) out.publish_time = str(input.publish_time);
  if (input.stage_owners && typeof input.stage_owners === "object") {
    const owners: Record<string, number> = {};
    for (const [stage, id] of Object.entries(input.stage_owners).slice(0, 50)) {
      const owner = colleagues.find((c) => c.id == (id as any) && c.id != 1);
      if (str(stage) && owner) owners[str(stage)] = owner.id;
    }
    if (Object.keys(owners).length) out.stage_owners = owners;
  }
  return Object.keys(out).length ? out : null;
}

/** The defaults that apply to a collection: its own, then each parent's for keys it leaves empty. */
export function effectiveCollectionDefaults(colId: unknown) {
  const out: any = {};
  const from: Record<string, string> = {};
  let col = collections.find((c) => c.id == colId);
  for (let depth = 0; col && depth < 50; depth++) {
    const d = col.defaults && typeof col.defaults === "object" ? col.defaults : {};
    for (const k of DEFAULT_KEYS) {
      if (out[k] === undefined && d[k] !== undefined) {
        out[k] = d[k];
        from[k] = col.title;
      }
    }
    col = col.parent_id ? collections.find((c) => c.id == col.parent_id) : undefined;
  }
  return Object.keys(out).length ? { ...out, _from: from } : null;
}
