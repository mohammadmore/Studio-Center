import fs from "fs";
const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/ai-studio-studiocenter-0e2da747-06c5-4e54-a57a-824d7b3b4545/documents/database/main?key=${config.apiKey}`;
console.log(url);
fetch(url).then(res => res.json()).then(data => {
  if (data.error) console.log(data.error);
  else {
     console.log("collections:", data.fields.collections ? "exists" : "missing");
     console.log("contents:", data.fields.contents ? "exists" : "missing");
  }
}).catch(console.error);
