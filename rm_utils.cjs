const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Replace these functions entirely
const functionsToRemove = [
  /function addDaysToJalali\(dateStr, days\) \{[\s\S]*?return `\$\{result\.jy\}\/\$\{paddedMonth\}\/\$\{paddedDay\}`;(?:\\n|\\r\\n|\s)*\}/,
  /function toPersianDigits\(num\) \{[\s\S]*?return num(?:\\n|\\r\\n|\s)*\.toString\(\)(?:\\n|\\r\\n|\s)*\.replace\(\/\\d\/g, \(x\) => persianDigits\[parseInt\(x\)\]\);(?:\\n|\\r\\n|\s)*\}/,
  /function addAuditLog\(username, action, ip\) \{[\s\S]*?audit_logs\.splice\(1000\);(?:\\n|\\r\\n|\s)*\}(?:\\n|\\r\\n|\s)*__name\(addAuditLog, "addAuditLog"\);/,
  /function logContentActivity\(card, req, actionDesc\) \{[\s\S]*?timestamp: new Date\(\)\.toISOString\(\),(?:\\n|\\r\\n|\s)*\}\);(?:\\n|\\r\\n|\s)*\}(?:\\n|\\r\\n|\s)*__name\(logContentActivity, "logContentActivity"\);/,
  /function addNotification\([\s\S]*?notifications\.splice\(500\);(?:\\n|\\r\\n|\s)*\}(?:\\n|\\r\\n|\s)*__name\(addNotification, "addNotification"\);/,
  /function getRoleInfoForUser\(user\) \{[\s\S]*?return \{ role_id: currentRoleId, role_name: roleName, permissions \};(?:\\n|\\r\\n|\s)*\}(?:\\n|\\r\\n|\s)*__name\(getRoleInfoForUser, "getRoleInfoForUser"\);/,
  /function getPermissionCategories\(\) \{[\s\S]*?\}\];(?:\\n|\\r\\n|\s)*\}(?:\\n|\\r\\n|\s)*__name\(getPermissionCategories, "getPermissionCategories"\);/,
  /const clientAuthGuard = __name\(\(req, res, next\) => \{[\s\S]*?\}, "clientAuthGuard"\);/,
  /const authGuard = __name\(\(req, res, next\) => \{[\s\S]*?\}, "authGuard"\);/,
  /const apiAuthGuard = __name\(\(req, res, next\) => \{[\s\S]*?\}, "apiAuthGuard"\);/,
  /const checkPermission = __name\(\(perm\) => \{[\s\S]*?\}, "checkPermission"\);/
];

let i = 0;
for (const regex of functionsToRemove) {
  let initial = code;
  code = code.replace(regex, '');
  if (initial === code) {
    console.log("Failed to remove function at index", i);
  } else {
    console.log("Removed function at index", i);
  }
  i++;
}

const imports = `
import { addDaysToJalali, toPersianDigits } from "./src/utils/helpers.js";
import { getRoleInfoForUser, getPermissionCategories } from "./src/utils/authUtils.js";
import { addAuditLog, logContentActivity, addNotification } from "./src/utils/logger.js";
import { clientAuthGuard, authGuard, apiAuthGuard, checkPermission } from "./src/middleware/auth.js";
`;
code = code.replace('import jalaali from "moment-jalaali";', 'import jalaali from "moment-jalaali";' + imports);

fs.writeFileSync('server.ts', code);
