const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const regex = /if \(!Array\.isArray\((leaves|colleagues|expenses|contents|contentTemplates)\)\)\s+\1\s*=\s*\[\];/g;
code = code.replace(regex, '');

fs.writeFileSync('server.ts', code);
