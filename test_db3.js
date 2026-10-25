import { db } from "./dist/src/db/index.js";
import { doc, getDoc } from "firebase/firestore";

async function run() {
  const meta = await getDoc(doc(db, 'database', 'main_meta'));
  console.log("Meta exists?", meta.exists());
  if (meta.exists()) {
     console.log("Meta chunks count:", meta.data().chunks);
  }
}
run().catch(console.error);
