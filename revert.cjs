const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Revert 1: remove the mock middleware and uncomment apiAuthGuard
code = code.replace(`apiRouter.use((req, res, next) => {
  req.session = req.session || {};
  req.session.user = { id: 1, role_id: 1, username: 'admin' };
  next();
});
// apiRouter.use(apiAuthGuard);`, `apiRouter.use(apiAuthGuard);`);

// Revert 2: remove the mock session inside save_leave
code = code.replace(`apiRouter.post("/save_leave", async (req, res) => {
  req.session = { user: { id: 1, role_id: 1, username: 'admin' } };`, `apiRouter.post("/save_leave", checkPermission("leaves"), async (req, res) => {`);

// Revert 3: remove the auth.log line from clientAuthGuard
code = code.replace(`const session2 = req.session;\nrequire('fs').appendFileSync('auth.log', "apiAuthGuard path=" + req.path + " session2=" + JSON.stringify(session2) + "\\n");`, `const session2 = req.session;`);

fs.writeFileSync('server.ts', code);
console.log("Reverted");
