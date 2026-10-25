import { db } from "./src/db/index.js";
import { doc, getDoc } from "firebase/firestore";

async function run() {
  const meta = await getDoc(doc(db, 'database', 'main'));
  console.log("Main exists?", meta.exists());
  if (meta.exists()) {
     const data = meta.data();
     console.log("Collections:", data.collections ? data.collections.length : 0);
  }
}
run().catch(console.error);
