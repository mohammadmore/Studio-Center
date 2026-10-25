const fs = require('fs');

let settingsCode = fs.readFileSync('src/routes/api_routes/settings.ts', 'utf8');
settingsCode = settingsCode.replace(/item\.price/g, '(item as any).price');
settingsCode = settingsCode.replace(/item\.base_price/g, '(item as any).base_price');
settingsCode = settingsCode.replace(/item\.icon/g, '(item as any).icon');
settingsCode = settingsCode.replace(/item\.logo_url/g, '(item as any).logo_url');
fs.writeFileSync('src/routes/api_routes/settings.ts', settingsCode);

let eventsCode = fs.readFileSync('src/routes/api_routes/events.ts', 'utf8');
eventsCode = eventsCode.replace(/req\.query\.\w+\.toString\(\)/g, '(req.query.$& as string)');
eventsCode = eventsCode.replace(/=== req\.query\.\w+/g, '=== (req.query.$& as string)');
eventsCode = eventsCode.replace(/momentHijri\((req\.query\.\w+)/g, 'momentHijri($1 as string');
eventsCode = eventsCode.replace(/req\.query\.from/g, '(req.query.from as string)');
eventsCode = eventsCode.replace(/req\.query\.to/g, '(req.query.to as string)');
eventsCode = eventsCode.replace(/req\.query\.type/g, '(req.query.type as string)');
fs.writeFileSync('src/routes/api_routes/events.ts', eventsCode);

