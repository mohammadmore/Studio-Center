const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const vars = [
  'colleagues', 'organizations', 'collections', 'contents',
  'settings', 'leaves', 'audit_logs', 'recycle_bin', 'batch_operations',
  'notifications', 'tokens', 'templatesData', 'contentTemplates',
  'templateSuggestions', 'expenses', 'invoices', 'mediaAssets',
  'smartEventsBank', 'clientSelections'
];

vars.forEach(v => {
  if (v === 'recycle_bin') {
     code = code.replace(/let recycle_bin = \[\s*\{\s*id: 99999,\s*table: "contents",\s*item_title:\s*".*?",\s*data: \{\s*id: 99999,\s*title: ".*?",\s*\},\s*deleted_at: new Date\(\)\.toISOString\(\),\s*deleted_by: ".*?",\s*\},\s*\];/s, '');
  } else if (v === 'settings') {
     code = code.replace(/let settings: any = \{\};/g, '');
  } else {
     code = code.replace(new RegExp(`let ${v} = \\[\\];`, 'g'), '');
  }
});

fs.writeFileSync('server.ts', code);
