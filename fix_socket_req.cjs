const fs = require('fs');

let serverCode = fs.readFileSync('server.ts', 'utf8');

// Instead of export const io =, let's attach to req
const reqIoReplacement = `
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" }
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

io.on("connection", (socket) => {
  socket.on("disconnect", () => {});
});

httpServer.listen(PORT`;

serverCode = serverCode.replace(/const httpServer = createServer\(app\);[\s\S]*?httpServer\.listen\(PORT/, reqIoReplacement);

fs.writeFileSync('server.ts', serverCode);
