import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDoc } from "firebase/firestore";
import * as fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

async function run() {
  const meta = await getDoc(doc(db, 'database', 'main_meta'));
  console.log("Meta exists?", meta.exists());
  if (meta.exists()) {
     console.log("Meta chunks count:", meta.data().chunks);
  }
}
run().catch(console.error);
