const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Find all app.get for views
const startStr = 'app.get("/", (req, res) => {';
const startIdx = code.indexOf(startStr);
const endStr = 'app.get("*", (req, res) => {';
const endIdx = code.indexOf(endStr);

if (startIdx > -1 && endIdx > -1) {
  // Extract up to app.use("/api", apiRouter); or something.
  // Actually, let's just find app.get("*")
  const viewCode = code.substring(startIdx, endIdx);
  
  const viewsFile = `import express from "express";
import { authGuard, clientAuthGuard } from "../middleware/auth.js";
import { getPermissionCategories } from "../utils/authUtils.js";
import { invoices } from "../store/state.js";

const viewsRouter = express.Router();

// Helper to replace app.get with viewsRouter.get
${viewCode.replace(/app\.get\(/g, 'viewsRouter.get(')}

export default viewsRouter;
`;

  fs.writeFileSync('src/routes/views.ts', viewsFile);
  
  const newServer = code.substring(0, startIdx) + `import viewsRouter from "./src/routes/views.js";\napp.use("/", viewsRouter);\n` + code.substring(endIdx);
  fs.writeFileSync('server.ts', newServer);
  console.log("Extracted views.");
} else {
  console.log("Could not find view boundaries.");
}
