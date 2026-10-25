const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Find function boundaries using basic matching
const startIdx = code.indexOf('async function loadDatabase() {');
if (startIdx !== -1) {
  // Let's just find the end of the function manually:
  let braces = 0;
  let endIdx = -1;
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === '{') braces++;
    if (code[i] === '}') {
      braces--;
      if (braces === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (endIdx !== -1) {
    code = code.substring(0, startIdx) + code.substring(endIdx);
  }
}

const startSave = code.indexOf('async function saveDatabase() {');
if (startSave !== -1) {
  let braces = 0;
  let endSave = -1;
  for (let i = startSave; i < code.length; i++) {
    if (code[i] === '{') braces++;
    if (code[i] === '}') {
      braces--;
      if (braces === 0) {
        endSave = i + 1;
        break;
      }
    }
  }
  if (endSave !== -1) {
    code = code.substring(0, startSave) + code.substring(endSave);
  }
}

code = code.replace(/let saveTimeout = null;/, '');
code = code.replace(/let localDbTimestamp = 0;/, '');
code = code.replace(/let cachedCategories = null;/, '');

code = code.replace('import mediaRouter from "./src/routes/media.js";', 'import mediaRouter from "./src/routes/media.js";\nimport { loadDatabase } from "./src/store/db.js";');

fs.writeFileSync('server.ts', code);
