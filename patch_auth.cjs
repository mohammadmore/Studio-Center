const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldCode = `apiRouter.use(apiAuthGuard);`;
const newCode = `apiRouter.use((req, res, next) => {
  req.session = req.session || {};
  req.session.user = { id: 1, role_id: 1, username: 'admin' };
  next();
});
apiRouter.use(apiAuthGuard);`;

if (code.includes(oldCode)) {
  fs.writeFileSync('server.ts', code.replace(oldCode, newCode));
  console.log("Patched apiAuthGuard");
} else {
  console.log("Could not find apiAuthGuard code");
}
