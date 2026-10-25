const fs = require('fs');
let code = fs.readFileSync('src/routes/api_routes/media.ts', 'utf8');

if (!code.includes('import { doc')) {
  code = 'import { doc, setDoc } from "firebase/firestore";\n' + code;
}

fs.writeFileSync('src/routes/api_routes/media.ts', code);
