const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldCode = `const session2 = req.session;`;
const newCode = `const session2 = req.session;
console.log("apiAuthGuard session2:", session2);`;

if (code.includes(oldCode)) {
  fs.writeFileSync('server.ts', code.replace(oldCode, newCode));
  console.log("Patched apiAuthGuard with logging");
}
