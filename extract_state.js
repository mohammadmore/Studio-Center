const fs = require('fs');

let serverTs = fs.readFileSync('server.ts', 'utf8');

// The state variables
const stateVars = [
  'roles', 'colleagues', 'organizations', 'collections', 'contents',
  'settings', 'leaves', 'audit_logs', 'recycle_bin', 'notifications',
  'events', 'media', 'templates', 'invoices', 'tokens', 'batchOperations'
];

console.log("Analyzing server.ts...");
