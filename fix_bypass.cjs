const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(
  /req\.session=\{user:\{id:1,role_id:'admin',username:'admin'\}\}/,
  "req.session.user={id:1,role_id:'admin',username:'admin'}"
);
fs.writeFileSync('server.ts', content);
