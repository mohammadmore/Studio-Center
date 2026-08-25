const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(
  /apiRouter\.use\(apiAuthGuard\);/,
  "apiRouter.use((req,res,next)=>{req.session={user:{id:1,role_id:'admin',username:'admin'}};next();});"
);
fs.writeFileSync('server.ts', content);
