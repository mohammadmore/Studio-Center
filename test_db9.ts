import { db } from "./src/db/index.js";
import { doc, getDoc } from "firebase/firestore";

async function run() {
  const meta = await getDoc(doc(db, 'database', 'main_meta'));
  console.log("Meta exists?", meta.exists());
  if (meta.exists()) {
     const chunksCount = meta.data().chunks;
     console.log("Meta chunks count:", chunksCount);
     for (let i = 0; i < chunksCount; i++) {
        const chunk = await getDoc(doc(db, 'database', `main_chunk_${i}`));
        console.log(`Chunk ${i} exists?`, chunk.exists());
        if (chunk.exists()) {
            const dataString = chunk.data().data;
            console.log(`Chunk ${i} size:`, dataString.length);
            const data = JSON.parse(dataString);
            console.log("Collections count:", data.collections ? data.collections.length : 0);
            console.log("Contents count:", data.contents ? data.contents.length : 0);
        }
     }
  }
}
run().catch(console.error);
