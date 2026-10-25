const { db } = require('./dist/src/db/index.js');
async function run() {
  const meta = await db.collection('database').doc('main_meta').get();
  console.log("Meta exists?", meta.exists);
  if (meta.exists) {
     console.log("Meta data:", meta.data());
  }
}
run();
