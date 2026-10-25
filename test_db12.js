import fs from "fs";
const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/ai-studio-center6-0e2da747-06c5-4e54-a57a-824d7b3b4545/documents/database/main_chunk_0?key=${config.apiKey}`;
console.log(url);
fetch(url).then(res => res.json()).then(data => {
  if (data.error) console.log(data.error);
  else {
     const str = data.fields.data.stringValue;
     const parsed = JSON.parse(str);
     console.log("collections:", parsed.collections ? parsed.collections.length : "missing");
     console.log("contents:", parsed.contents ? parsed.contents.length : "missing");
  }
}).catch(console.error);
