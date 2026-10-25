const fs = require('fs');

let serverTs = fs.readFileSync('server.ts', 'utf8');

const regex = /let (roles|colleagues|organizations|collections|contents|settings|leaves|audit_logs|recycle_bin|notifications|events|media|templates|invoices|tokens|batchOperations) = (\[\]|\{\}|\[[\s\S]*?\]);/g;

let matches = [...serverTs.matchAll(regex)];
console.log(`Found ${matches.length} state variables.`);

