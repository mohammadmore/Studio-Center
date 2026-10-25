const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Find where apiRouter starts and ends
const startIndex = code.indexOf('const apiRouter = express.Router();');
let endIndex = -1;

if (startIndex !== -1) {
  // Let's find app.use("/api", apiRouter);
  endIndex = code.indexOf('app.use("/api", apiRouter);');
  
  if (endIndex !== -1) {
    const apiRouterCode = code.substring(startIndex, endIndex);
    
    // Create the api.ts file
    const imports = `import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import jalaali from "moment-jalaali";
import bcrypt from "bcrypt";
import xlsx from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { 
  roles, colleagues, organizations, collections, contents, leaves, audit_logs, 
  recycle_bin, batch_operations, notifications, tokens, templatesData, 
  contentTemplates, templateSuggestions, expenses, invoices, mediaAssets, 
  smartEventsBank, clientSelections 
} from "../store/state.js";
import { addDaysToJalali, toPersianDigits } from "../utils/helpers.js";
import { getRoleInfoForUser, getPermissionCategories } from "../utils/authUtils.js";
import { addAuditLog, logContentActivity, addNotification } from "../utils/logger.js";
import { apiAuthGuard, checkPermission } from "../middleware/auth.js";
import { saveDatabase } from "../db/repositories.js"; // Assuming saveDatabase will be here, or we can just import it from server.js for now.

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// We need to handle \`__dirname\` in ESM if used, but let's just dump the code first.
`;
    
    fs.writeFileSync('src/routes/api.ts', imports + apiRouterCode + '\nexport default apiRouter;\n');
    
    // Replace in server.ts
    const newCode = code.substring(0, startIndex) + code.substring(endIndex);
    fs.writeFileSync('server.ts', newCode);
    console.log("apiRouter extracted successfully.");
  } else {
    console.log("Could not find app.use('/api', apiRouter)");
  }
} else {
  console.log("Could not find const apiRouter");
}
