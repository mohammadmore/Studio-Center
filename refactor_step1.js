const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const globals = [
  'roles', 'colleagues', 'organizations', 'collections', 'contents',
  'settings', 'leaves', 'audit_logs', 'recycle_bin', 'batch_operations',
  'notifications', 'tokens', 'templatesData', 'contentTemplates',
  'templateSuggestions', 'expenses', 'invoices', 'mediaAssets',
  'smartEventsBank', 'clientSelections'
];

let declarationsRegex = new RegExp(
  `let (${globals.join('|')})(?:\\s*:\\s*any)?\\s*=\\s*(\\[.*?\\]|\\{.*?\\});`,
  's'
);
// Actually it's easier to manually write the state file since recycle_bin spans multiple lines.
