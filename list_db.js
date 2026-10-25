import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const sourceDb = "ai-studio-center6-0e2da747-06c5-4e54-a57a-824d7b3b4545";

async function list() {
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${sourceDb}/documents/database?key=${config.apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(data);
}
list().catch(console.error);
