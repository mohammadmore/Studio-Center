const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Array reassignments
code = code.replace(/audit_logs = audit_logs\.slice\(0, 1e3\);/g, 'audit_logs.splice(1000);');

code = code.replace(/roles = data\.roles;/g, 'roles.length = 0; if (data.roles) roles.push(...data.roles);');
code = code.replace(/contents = data\.contents;/g, 'contents.length = 0; if (data.contents) contents.push(...data.contents);');
code = code.replace(/templateSuggestions = data\.templateSuggestions;/g, 'templateSuggestions.length = 0; if (data.templateSuggestions) templateSuggestions.push(...data.templateSuggestions);');

code = code.replace(/roles = roles\.filter\(\(r\) => r\.id != id\);/g, 'const idx = roles.findIndex(r => r.id == id); if (idx > -1) roles.splice(idx, 1);');
code = code.replace(/collections = collections\.filter\(\(c\) => c\.id !== parseInt\(id\)\);/g, 'const idx = collections.findIndex(c => c.id === parseInt(id)); if (idx > -1) collections.splice(idx, 1);');
code = code.replace(/contents = contents\.filter\(\(c\) => c\.id != id\);/g, 'const idx = contents.findIndex(c => c.id == id); if (idx > -1) contents.splice(idx, 1);');
code = code.replace(/organizations = organizations\.filter\(\(o\) => o\.id !== id\);/g, 'const idx = organizations.findIndex(o => o.id === id); if (idx > -1) organizations.splice(idx, 1);');
code = code.replace(/contents = contents\.filter\(\(c\) => c\.org_id !== id\);/g, 'for(let i=contents.length-1; i>=0; i--) { if(contents[i].org_id === id) contents.splice(i, 1); }');
code = code.replace(/contentTemplates = contentTemplates\.filter\(\s*\(\(t\)\s*=>\s*t\.id\s*!==\s*templateId\),\s*\);/g, 'const idx = contentTemplates.findIndex(t => t.id === templateId); if (idx > -1) contentTemplates.splice(idx, 1);');

// Settings
code = code.replace(/settings = data\.settings;/g, 'Object.assign(settings, data.settings);');

fs.writeFileSync('server.ts', code);
console.log("Done fixing reassignments.");
