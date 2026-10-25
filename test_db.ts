import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp({ projectId: config.projectId });
console.log("Database ID:", config.firestoreDatabaseId);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const meta = await db.collection('database').doc('main_meta').get();
  console.log("Meta exists?", meta.exists);
}
run().catch(console.error);
