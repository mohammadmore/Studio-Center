const fs = require('fs');
let code = fs.readFileSync('src/routes/api_routes/users.ts', 'utf8');

// We need to replace all route handlers with async versions and replace direct state access with repo methods

// 1. Convert specific callbacks to async
code = code.replace(/subRouter\.(get|post)\(\s*(["'].+?["']),\s*(?:checkPermission\(.+?\),\s*)?\(req, res\)\s*=>\s*\{/g, (match) => {
  return match.replace('(req, res) => {', 'async (req, res) => {');
});

// For get_all_roles and get_all_users which are one-liners:
code = code.replace(/subRouter\.get\(\"\/get_all_roles\", \(req, res\) => res\.json\(roles\)\);/g, 'subRouter.get("/get_all_roles", async (req, res) => res.json(await repo.getAllRoles()));');
code = code.replace(/subRouter\.get\(\"\/get_all_users\", \(req, res\) => res\.json\(colleagues\)\);/g, 'subRouter.get("/get_all_users", async (req, res) => res.json(await repo.getAllUsers()));');

// Save it temporarily so we can check it
fs.writeFileSync('src/routes/api_routes/users_wip.ts', code);
console.log("Regex replacements applied. Need to implement full DB sync methods in repo next.");
