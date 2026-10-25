import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const sourceDb = "ai-studio-center6-0e2da747-06c5-4e54-a57a-824d7b3b4545";
const targetDb = "ai-studio-studiocenter-0e2da747-06c5-4e54-a57a-824d7b3b4545";

async function copyDoc(docPath) {
   const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${sourceDb}/documents/${docPath}?key=${config.apiKey}`;
   const res = await fetch(url);
   const data = await res.json();
   if (data.error) {
      console.log("Error reading", docPath, data.error.message);
      return false;
   }
   
   const targetUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${targetDb}/documents/${docPath}?key=${config.apiKey}`;
   const res2 = await fetch(targetUrl, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({fields: data.fields})
   });
   if (!res2.ok) {
       console.log("Failed to copy", docPath, await res2.text());
   } else {
       console.log("Copied", docPath);
   }
   return true;
}

async function run() {
   await copyDoc('database/main_meta');
   await copyDoc('database/main_chunk_0');
   await copyDoc('database/main_chunk_1');
   await copyDoc('database/main');
}
run().catch(console.error);
