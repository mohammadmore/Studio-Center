/**
 * Copies the whole database (and uploaded files / fonts) from one storage
 * driver to another, e.g. from Firebase to the local JSON file:
 *
 *   npm run migrate -- --from firebase --to json
 *
 * The target must be empty unless --force is given.
 */
import { createDriver } from "../src/store/drivers/index.js";
import type { BlobKind } from "../src/store/drivers/types.js";
import { extensionOf, isSafeFileName } from "../src/utils/files.js";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function safeName(name: string, used: Set<string>) {
  if (isSafeFileName(name) && !used.has(name)) return name;
  const ext = extensionOf(name) || "bin";
  const base =
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "file";
  let candidate = `${base}.${ext}`;
  for (let i = 1; used.has(candidate) || !isSafeFileName(candidate); i++) {
    candidate = `${base}_${i}.${ext}`;
  }
  return candidate;
}

async function main() {
  const from = arg("from");
  const to = arg("to");
  if (!from || !to || from === to) {
    console.error("Usage: npm run migrate -- --from <firebase|json|sqlite> --to <json|sqlite|firebase> [--force]");
    process.exit(1);
  }
  const source = await createDriver(from);
  const target = await createDriver(to);

  const data = await source.load();
  if (!data) {
    console.error(`No data found in ${from}.`);
    process.exit(1);
  }
  if ((await target.load()) && !process.argv.includes("--force")) {
    console.error(`${to} already contains data. Re-run with --force to overwrite it.`);
    process.exit(1);
  }

  // File names stored in Firestore could contain spaces or Persian letters; local
  // storage only accepts plain names, so rename them and fix the references.
  let json = JSON.stringify(data);
  const settingsRenames: Record<string, string> = {};
  for (const kind of ["uploads", "fonts"] as BlobKind[]) {
    const names = await source.blobs.list(kind);
    const used = new Set<string>();
    for (const name of names) {
      const blob = await source.blobs.get(kind, name);
      if (!blob) continue;
      const newName = safeName(name, used);
      used.add(newName);
      await target.blobs.put(kind, newName, blob.buffer, blob.mime);
      if (newName !== name) {
        json = json.split(`/${kind}/${name}`).join(`/${kind}/${newName}`);
        json = json.split(`/${kind}/${encodeURIComponent(name)}`).join(`/${kind}/${newName}`);
        if (kind === "fonts") settingsRenames[name] = newName;
      }
      console.log(`copied ${kind}/${name}${newName !== name ? ` -> ${newName}` : ""}`);
    }
  }
  const migrated = JSON.parse(json);
  const s = migrated.settings || {};
  for (const [oldName, newName] of Object.entries(settingsRenames)) {
    if (s.fonts && s.fonts[oldName]) {
      s.fonts[newName] = s.fonts[oldName];
      delete s.fonts[oldName];
    }
    if (s.active_font === oldName) s.active_font = newName;
    if (Array.isArray(s.font_order)) {
      s.font_order = s.font_order.map((f: string) => (f === oldName ? newName : f));
    }
  }

  await target.save(migrated);
  await source.close?.();
  await target.close?.();
  console.log(`Done: ${from} -> ${to}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
