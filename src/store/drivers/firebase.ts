import fs from "fs";
import path from "path";
import type { BlobKind, BlobStore, StorageDriver } from "./types.js";
import { config } from "../../config.js";
import { mimeForFile } from "../../utils/files.js";

const CHUNK_SIZE = 900_000;

// Firestore document ids only need to avoid "/" and the reserved "." / "..".
function isValidDocId(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 300 &&
    !/[\/\\\x00-\x1f]/.test(name) &&
    name !== "." &&
    name !== ".."
  );
}

function readConfigFile() {
  const file = path.join(config.appRoot, "firebase-applet-config.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Firestore storage through the Admin SDK. The Admin SDK authenticates with a
 * service account (GOOGLE_APPLICATION_CREDENTIALS or the platform's default
 * credentials), which lets firestore.rules deny every client-side request.
 *
 * Kept for the transition period and for `npm run migrate`; local storage is
 * the default for self-hosting.
 */
export async function createFirebaseDriver(): Promise<StorageDriver> {
  const { initializeApp, applicationDefault, cert, getApps } = await import(
    "firebase-admin/app"
  );
  const { getFirestore } = await import("firebase-admin/firestore");
  const fileConfig = readConfigFile();
  const projectId = process.env.FIREBASE_PROJECT_ID || fileConfig.projectId;
  const databaseId =
    process.env.FIRESTORE_DATABASE_ID || fileConfig.firestoreDatabaseId || "(default)";
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const credential = serviceAccount
    ? cert(JSON.parse(fs.readFileSync(serviceAccount, "utf8")))
    : applicationDefault();
  const app =
    getApps().find((a) => a.name === "asva-storage") ||
    initializeApp({ credential, projectId }, "asva-storage");
  const db = getFirestore(app, databaseId);
  const coll = db.collection("database");

  const blobs: BlobStore = {
    async put(kind: BlobKind, name, buffer, mime) {
      if (buffer.length > CHUNK_SIZE) {
        throw new Error("File is too large for Firestore storage (max ~900KB)");
      }
      await db.collection(kind).doc(name).set({
        data: buffer.toString("base64"),
        mime,
        createdAt: Date.now(),
      });
    },
    async get(kind, name) {
      if (!isValidDocId(name)) return null;
      const snap = await db.collection(kind).doc(name).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      return {
        buffer: Buffer.from(data.data || "", "base64"),
        mime: data.mime || mimeForFile(name),
      };
    },
    async delete(kind, name) {
      if (!isValidDocId(name)) return;
      await db.collection(kind).doc(name).delete();
    },
    async list(kind) {
      const refs = await db.collection(kind).listDocuments();
      return refs.map((r) => r.id);
    },
  };

  return {
    name: "firebase",
    blobs,
    async load() {
      const meta = await coll.doc("main_meta").get();
      if (!meta.exists) return null;
      const { chunks, gen } = meta.data() as { chunks: number; gen?: string };
      let text = "";
      for (let i = 0; i < chunks; i++) {
        // Older saves used main_chunk_N; newer ones write a fresh generation each time.
        const id = gen ? `main_${gen}_chunk_${i}` : `main_chunk_${i}`;
        const chunk = await coll.doc(id).get();
        if (!chunk.exists) throw new Error(`Missing database chunk ${id}`);
        text += chunk.data()!.data;
      }
      return JSON.parse(text);
    },
    async save(data) {
      const text = JSON.stringify(data);
      const gen = Date.now().toString(36);
      const count = Math.max(1, Math.ceil(text.length / CHUNK_SIZE));
      // Write the new generation first; the meta document only switches over once
      // every chunk exists, so readers never see a partially written database.
      for (let i = 0; i < count; i++) {
        await coll.doc(`main_${gen}_chunk_${i}`).set({
          data: text.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        });
      }
      const previous = await coll.doc("main_meta").get();
      await coll.doc("main_meta").set({ chunks: count, gen, timestamp: Date.now() });
      if (previous.exists) {
        const old = previous.data() as { chunks: number; gen?: string };
        for (let i = 0; i < old.chunks; i++) {
          const id = old.gen ? `main_${old.gen}_chunk_${i}` : `main_chunk_${i}`;
          await coll.doc(id).delete().catch(() => {});
        }
      }
    },
  };
}
