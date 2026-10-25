const fs = require('fs');
let code = fs.readFileSync('src/routes/api.ts', 'utf8');

const imports = code.match(/import .*?;/g) || [];
const rest = code.replace(/import .*?;/g, '');

const newCode = imports.join('\n') + '\n\n' + rest.trim() + '\n';
fs.writeFileSync('src/routes/api.ts', newCode);
