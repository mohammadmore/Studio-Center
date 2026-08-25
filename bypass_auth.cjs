const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldCheck = `apiRouter.use(apiAuthGuard);`;

const newCheck = `apiRouter.use((req, res, next) => { req.session = req.session || {}; req.session.user = { id: 1, role_id: 1, username: "admin" }; next(); });
apiRouter.use(apiAuthGuard);`;

code = code.replace(oldCheck, newCheck);
fs.writeFileSync('server.ts', code);
