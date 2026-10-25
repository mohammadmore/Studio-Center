const fs = require('fs');
let content = fs.readFileSync('src/routes/api_routes/events.ts', 'utf8');

const s1 = `"\n          "\\u062A\\u0627\\u06CC\\u06CC\\u062F \\u062A\\u0642\\u0648\\u06CC\\u0645 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627", \`\\u0646\\u0645\\u0627\\u06CC\\u0646\\u062F\\u0647 \${org ? org.org_name : ""} \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627\\u06CC \${mName}\\u0645\\u0627\\u0647 \${year} \\u0631\\u0627 \\u062A\\u0627\\u06CC\\u06CC\\u062F \\u06A9\\u0631\\u062F.\`, "admin",\n          null, "");`;
const r1 = `addNotification(null, null, "\\u062A\\u0627\\u06CC\\u06CC\\u062F \\u062A\\u0642\\u0648\\u06CC\\u0645 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627", \`\\u0646\\u0645\\u0627\\u06CC\\u0646\\u062F\\u0647 \${org ? org.org_name : ""} \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627\\u06CC \${mName}\\u0645\\u0627\\u0647 \${year} \\u0631\\u0627 \\u062A\\u0627\\u06CC\\u06CC\\u062F \\u06A9\\u0631\\u062F.\`);`;
content = content.replace(s1, r1);

const s2 = `"\n      "\\u0628\\u0627\\u0632 \\u0634\\u062F\\u0646 \\u0642\\u0641\\u0644 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627", reason, "client",\n      numericOrgId, "");`;
const r2 = `addNotification(null, numericOrgId.toString(), "\\u0628\\u0627\\u0632 \\u0634\\u062F\\u0646 \\u0642\\u0641\\u0644 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627", reason);`;
content = content.replace(s2, r2);

fs.writeFileSync('src/routes/api_routes/events.ts', content);
