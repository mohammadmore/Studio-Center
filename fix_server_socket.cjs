const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Remove the bad block
code = code.replace(/const httpServer = createServer\(app\);[\s\S]*?httpServer\.listen\(PORT/, 'const httpServer = createServer(app);\ninitSocket(httpServer);\nhttpServer.listen(PORT');
// Add imports
if (!code.includes('initSocket')) {
  code = 'import { initSocket } from "./src/utils/socket.js";\n' + code;
}

fs.writeFileSync('server.ts', code);
