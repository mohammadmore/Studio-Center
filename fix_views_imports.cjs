const fs = require('fs');
let code = fs.readFileSync('src/routes/views.ts', 'utf8');

if (!code.includes('import jalaali')) {
  code = 'import jalaali from "moment-jalaali";\n' + code;
}
if (!code.includes('import { roles')) {
  code = 'import { roles, organizations } from "../store/state.js";\n' + code;
}

fs.writeFileSync('src/routes/views.ts', code);
