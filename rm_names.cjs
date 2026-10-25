const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const toRemove = [
  '__name(addDaysToJalali, "addDaysToJalali");',
  '__name(addAuditLog, "addAuditLog");',
  '__name(logContentActivity, "logContentActivity");',
  '__name(addNotification, "addNotification");',
  '__name(loadDatabase, "loadDatabase");',
  '__name(saveDatabase, "saveDatabase");',
  '__name(toPersianDigits, "toPersianDigits");',
  '__name(getPermissionCategories, "getPermissionCategories");'
];

toRemove.forEach(str => {
  code = code.replace(str, '');
});

fs.writeFileSync('server.ts', code);
