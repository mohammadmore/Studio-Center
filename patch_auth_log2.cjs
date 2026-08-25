const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldCode = `console.log("apiAuthGuard session2:", session2);`;
const newCode = `require('fs').appendFileSync('auth.log', "apiAuthGuard path=" + req.path + " session2=" + JSON.stringify(session2) + "\\n");`;

if (code.includes(oldCode)) {
  fs.writeFileSync('server.ts', code.replace(oldCode, newCode));
  console.log("Patched apiAuthGuard with file logging");
}
