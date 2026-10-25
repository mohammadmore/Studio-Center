import { initializeApp } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let app;
let dbInstance;

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  app = initializeApp(config);
  dbInstance = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, config.firestoreDatabaseId);
} else {
  // Fallback
  app = initializeApp({});
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
export const auth = {}; // Placeholder if needed

