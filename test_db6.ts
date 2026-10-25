import { db } from "./src/db/index.js";
import { collection, getDocs } from "firebase/firestore";

async function run() {
  const querySnapshot = await getDocs(collection(db, "database"));
  console.log("Documents in 'database' collection:", querySnapshot.size);
  querySnapshot.forEach((doc) => {
    console.log(doc.id, "=>", doc.data());
  });
}
run().catch(console.error);
