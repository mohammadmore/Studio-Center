const fs = require('fs');

let authCode = fs.readFileSync('src/routes/api_routes/auth.ts', 'utf8');

// Convert handler to async
authCode = authCode.replace(/subRouter\.post\(\s*["']\/login["'],\s*\[(.*?)\]\s*,\s*\(req, res\) => {/s, 'subRouter.post("/login", [$1], async (req, res) => {');

// Replace colleagues.find -> await repo.getUserByUsername
authCode = authCode.replace(/const user = colleagues\.find\(\(c\) => c\.username === req\.body\.username\);/, 'const user = await repo.getUserByUsername(req.body.username);');

// Fix /check_auth
authCode = authCode.replace(/subRouter\.get\(\s*["']\/check_auth["'],\s*\(req, res\) => {/, 'subRouter.get("/check_auth", async (req, res) => {');
authCode = authCode.replace(/const colleague = colleagues\.find\(\(c\) => c\.id === req\.session\.user_id\);/, 'const colleague = await repo.getUserById(req.session.user_id as number);');

fs.writeFileSync('src/routes/api_routes/auth.ts', authCode);
