const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/let saveTimeout = null;/, '');
code = code.replace(/let localDbTimestamp = 0;/, '');
code = code.replace(/async function loadDatabase\(\) \{[\s\S]*?\}\s*\}\s*\} catch \(error\) \{\s*console\.error\("Error loading initial data from database chunks", error\);\s*\}\s*\}/, '');
code = code.replace(/async function saveDatabase\(\) \{[\s\S]*?\}, 1e3\);\s*\}/, '');

code = code.replace('import { apiAuthGuard, checkPermission } from "./src/middleware/auth.js";', 'import { apiAuthGuard, checkPermission } from "./src/middleware/auth.js";\nimport { loadDatabase } from "./src/store/db.js";');

fs.writeFileSync('server.ts', code);
