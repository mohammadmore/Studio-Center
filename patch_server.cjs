const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

// Replace role_id check for delete action
content = content.replace(
  /if \(!base_year\) \{\s*base_year = jalaali\.toJalaali\(new Date\(\)\)\.jy;\s*\} else \{\s*base_year = parseInt\(base_year\);\s*\}/,
  `if (!base_year) {\n      base_year = jalaali.toJalaali(new Date()).jy;\n    } else {\n      base_year = parseInt(base_year);\n    }\n    \n    if (action === "delete") {\n      if (req.session.user && req.session.user?.role_id != 1 && req.session.user?.role_id != 2) {\n        return res\n          .status(403)\n          .json({\n            status: "error",\n            message:\n              "\\u0634\\u0645\\u0627 \\u0645\\u062C\\u0627\\u0632 \\u0628\\u0647 \\u0627\\u06CC\\u0646 \\u0639\\u0645\\u0644\\u06CC\\u0627\\u062A \\u0646\\u06CC\\u0633\\u062A\\u06CC\\u062F",\n          });\n      }\n    }`
);

// Remove the old role check block
content = content.replace(
  /if \(action === "delete" \|\| action === "edit"\) \{\s*if \(req\.session\.user && req\.session\.user\?\.role_id != 1\) \{\s*return res\s*\.status\(403\)\s*\.json\(\{\s*status: "error",\s*message:\s*"\\u0634\\u0645\\u0627 \\u0645\\u062C\\u0627\\u0632 \\u0628\\u0647 \\u0627\\u06CC\\u0646 \\u0639\\u0645\\u0644\\u06CC\\u0627\\u062A \\u0646\\u06CC\\u0633\\u062A\\u06CC\\u062F",\s*\}\);\s*\}\s*\}/,
  ""
);

// Remove the edit action logic
content = content.replace(
  /if \(action === "edit"\) \{\s*const evId = parseInt\(id\);\s*const evIndex = smartEventsBank\.findIndex\(\(e\) => e\.id === evId\);\s*if \(evIndex !== -1\) \{\s*smartEventsBank\[evIndex\] = \{\s*\.\.\.smartEventsBank\[evIndex\],\s*title,\s*description,\s*calendar_type,\s*base_year,\s*is_holiday: is_holiday \? 1 : 0,\s*shamsi_month: parseInt\(shamsi_month\),\s*shamsi_day: parseInt\(shamsi_day\),\s*org_id: org_id \? parseInt\(org_id\) : null,\s*\};\s*saveDatabase\(\)\.catch\(console\.error\);\s*return res\.json\(\{\s*status: "success",\s*message:\s*"\\u0645\\u0646\\u0627\\u0633\\u0628\\u062A \\u0648\\u06CC\\u0631\\u0627\\u06CC\\u0634 \\u0634\\u062F",\s*\}\);\s*\}\s*return res\s*\.status\(404\)\s*\.json\(\{\s*status: "error",\s*message:\s*"\\u0645\\u0646\\u0627\\u0633\\u0628\\u062A \\u06CC\\u0627\\u0641\\u062A \\u0646\\u0634\\u062F",\s*\}\);\s*\}/,
  ""
);


fs.writeFileSync('server.ts', content);
