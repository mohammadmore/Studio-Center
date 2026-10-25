const fs = require('fs');

// Fix client.ts
let clientCode = fs.readFileSync('src/routes/api_routes/client.ts', 'utf8');
clientCode = clientCode.replace(/addNotification\((\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+),(\s*[^,]+),(\s*[^,]+),(\s*[^)]+)\)/g, 'addNotification($1)');
fs.writeFileSync('src/routes/api_routes/client.ts', clientCode);

// Fix contents.ts
let contentsCode = fs.readFileSync('src/routes/api_routes/contents.ts', 'utf8');
contentsCode = contentsCode.replace(/logContentActivity\((\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+),(\s*[^,]+),(\s*[^,]+),(\s*[^)]+)\)/g, 'logContentActivity($1)');
fs.writeFileSync('src/routes/api_routes/contents.ts', contentsCode);

// Fix settings.ts
let settingsCode = fs.readFileSync('src/routes/api_routes/settings.ts', 'utf8');
settingsCode = settingsCode.replace(/item\.price/g, '(item as any).price');
settingsCode = settingsCode.replace(/item\.base_price/g, '(item as any).base_price');
settingsCode = settingsCode.replace(/item\.icon/g, '(item as any).icon');
settingsCode = settingsCode.replace(/item\.logo_url/g, '(item as any).logo_url');
fs.writeFileSync('src/routes/api_routes/settings.ts', settingsCode);

// Fix events.ts
let eventsCode = fs.readFileSync('src/routes/api_routes/events.ts', 'utf8');
eventsCode = eventsCode.replace(/req\.query\.from/g, '(req.query.from as string)');
eventsCode = eventsCode.replace(/req\.query\.to/g, '(req.query.to as string)');
eventsCode = eventsCode.replace(/req\.query\.type/g, '(req.query.type as string)');
eventsCode = eventsCode.replace(/req\.query\.year/g, '(req.query.year as string)');
eventsCode = eventsCode.replace(/req\.query\.month/g, '(req.query.month as string)');
eventsCode = eventsCode.replace(/addNotification\((\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+),(\s*[^,]+),(\s*[^)]+)\)/g, 'addNotification($1)');
fs.writeFileSync('src/routes/api_routes/events.ts', eventsCode);

