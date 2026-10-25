import fs from "fs";
const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/database/main_meta?key=${config.apiKey}`;
console.log(url);
fetch(url).then(res => res.json()).then(console.log).catch(console.error);
