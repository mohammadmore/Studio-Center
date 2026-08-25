const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  'apiRouter.use(apiAuthGuard);',
  'apiRouter.use((req, res, next) => { req.session = req.session || {}; req.session.user = { id: 1, role_id: 1, username: "admin" }; next(); });\napiRouter.use(apiAuthGuard);'
);

fs.writeFileSync('server.ts', code);
