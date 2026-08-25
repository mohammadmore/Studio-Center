const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace("  }\n});\n  }\n});\napiRouter", "  }\n});\napiRouter");
fs.writeFileSync('server.ts', code);
