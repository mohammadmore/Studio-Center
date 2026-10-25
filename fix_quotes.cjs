const fs = require('fs');
let code = fs.readFileSync('views/partials/content-identity.ejs', 'utf8');

// We want to safely escape prevStatus.name and nextStatus.name
// It's inside a template literal. 
// Old: '${prevStatus ? prevStatus.name : ''}'
// New: '${prevStatus ? (prevStatus.name || '').replace(/'/g, "\\'") : ''}'

code = code.replace(
  /'\$\{prevStatus \? prevStatus\.name : ''\}'/g,
  `'$\{prevStatus ? (prevStatus.name || '').replace(/'/g, "\\\\'") : ''}'`
);

code = code.replace(
  /'\$\{nextStatus \? nextStatus\.name : ''\}'/g,
  `'$\{nextStatus ? (nextStatus.name || '').replace(/'/g, "\\\\'") : ''}'`
);

fs.writeFileSync('views/partials/content-identity.ejs', code);
