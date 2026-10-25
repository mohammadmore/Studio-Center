const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/contentTemplates = contentTemplates\.filter\(\s*\(\(t\)\s*=>\s*t\.id\s*!==\s*parseInt\(template\.id\)\),\s*\);/g, 'const idx = contentTemplates.findIndex(t => t.id === parseInt(template.id)); if (idx > -1) contentTemplates.splice(idx, 1);');
fs.writeFileSync('server.ts', code);
