const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const vars = [
  'colleagues', 'organizations', 'collections', 'leaves', 'audit_logs',
  'recycle_bin', 'batch_operations', 'notifications', 'tokens',
  'templatesData', 'contentTemplates', 'expenses', 'invoices',
  'mediaAssets', 'smartEventsBank', 'clientSelections'
];

vars.forEach(v => {
  const regex = new RegExp(`if \\(data\\.${v}\\)\\s+${v}\\s*=\\s*data\\.${v};`, 'g');
  code = code.replace(regex, `${v}.length = 0; if (data.${v}) ${v}.push(...data.${v});`);
});

// Also there might be leaves = leaves.filter(...) or similar. Let's fix them manually.
const filterVars = ['leaves', 'colleagues', 'expenses', 'contents', 'contentTemplates'];
filterVars.forEach(v => {
  const regex2 = new RegExp(`${v}\\s*=\\s*${v}\\.filter\\(`, 'g');
  code = code.replace(regex2, `${v} = ${v}.filter_replace(`); // just mark them
});

fs.writeFileSync('server.ts', code);
console.log("Done.");
