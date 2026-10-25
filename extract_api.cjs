const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');
const startToken = 'const apiRouter = express.Router();';
const endToken = 'app.use("/api", apiRouter);';

const startIdx = code.indexOf(startToken);
const endIdx = code.indexOf(endToken);

if (startIdx > -1 && endIdx > -1) {
  const routerCode = code.substring(startIdx, endIdx);
  
  const apiFile = `import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import * as jalaali from "jalaali-js";
import momentHijri from "moment-hijri";
import bcrypt from "bcrypt";
import xlsx from "xlsx";
import { db } from "../db/index.js";
import { doc, getDoc, setDoc, deleteDoc, getDocs, collection } from "firebase/firestore";
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
import { saveDatabase } from "../store/db.js"; 

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, 
});

${routerCode}
export default apiRouter;
`;

  fs.writeFileSync('src/routes/api.ts', apiFile);
  
  // Now modify server.ts
  const newServer = code.substring(0, startIdx) + `import apiRouter from "./src/routes/api.js";\napp.use("/api", apiRouter);\n` + code.substring(endIdx + endToken.length);
  fs.writeFileSync('server.ts', newServer);
  console.log("apiRouter extracted successfully.");
} else {
  console.log("Tokens not found.");
}
