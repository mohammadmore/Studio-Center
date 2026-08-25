const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldCode = `apiRouter.use(apiAuthGuard);`;
const newCode = `// apiRouter.use(apiAuthGuard);`;

if (code.includes(oldCode)) {
  fs.writeFileSync('server.ts', code.replace(oldCode, newCode));
  console.log("Removed apiAuthGuard");
}
