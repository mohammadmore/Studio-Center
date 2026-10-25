const fs = require('fs');

// client.ts
let clCode = fs.readFileSync('src/routes/api_routes/client.ts', 'utf8');
clCode = clCode.replace(/addNotification\(([^,]+),\s*([^,]+),\s*([^)]+)\);/g, 'addNotification($1, $2, $3, "");');
fs.writeFileSync('src/routes/api_routes/client.ts', clCode);

// contents.ts
let cCode = fs.readFileSync('src/routes/api_routes/contents.ts', 'utf8');
cCode = cCode.replace(/addNotification\(([^,]+),\s*([^,]+),\s*([^)]+)\);/g, 'addNotification($1, $2, $3, "");');
cCode = cCode.replace(/logContentActivity\(card,\s*req,\s*req,\s*"[^"]+"\);/g, 'logContentActivity(card, req, "ویرایش");');
cCode = cCode.replace(/logContentActivity\(card,\s*req,\s*req\);/g, 'logContentActivity(card, req, "تغییر");');
fs.writeFileSync('src/routes/api_routes/contents.ts', cCode);

// events.ts
let eCode = fs.readFileSync('src/routes/api_routes/events.ts', 'utf8');
eCode = eCode.replace(/addNotification\(([^,]+),\s*([^,]+),\s*([^)]+)\);/g, 'addNotification($1, $2, $3, "");');
fs.writeFileSync('src/routes/api_routes/events.ts', eCode);

