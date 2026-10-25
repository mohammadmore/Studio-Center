const fs = require('fs');

let serverCode = fs.readFileSync('server.ts', 'utf8');

// We need to add socket.io to the top and modify the listening block
if (!serverCode.includes('import { Server as SocketIOServer }')) {
  serverCode = 'import { createServer } from "http";\nimport { Server as SocketIOServer } from "socket.io";\n' + serverCode;
}

const listenReplacement = `
const httpServer = createServer(app);
export const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  // console.log("New client connected", socket.id);
  socket.on("disconnect", () => {
    // console.log("Client disconnected", socket.id);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});
`;

serverCode = serverCode.replace(/app\.listen\(PORT,\s*"0\.0\.0\.0",\s*\(\)\s*=>\s*\{[\s\S]*?\}\);/, listenReplacement);

fs.writeFileSync('server.ts', serverCode);
