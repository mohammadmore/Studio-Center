const fs = require('fs');
let code = fs.readFileSync('src/routes/api_routes/settings.ts', 'utf8');

code = 'import { db } from "../../db/index.js";\n' + code;
code = 'import { collection, doc, deleteDoc, getDocs } from "firebase/firestore";\n' + code;

fs.writeFileSync('src/routes/api_routes/settings.ts', code);
