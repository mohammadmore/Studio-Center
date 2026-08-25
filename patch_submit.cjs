const fs = require('fs');
let content = fs.readFileSync('views/smart-events.ejs', 'utf8');

content = content.replace(
  /body: JSON\.stringify\(\{ action: document\.getElementById\('editEventId'\)\.value \? 'edit' : 'add', id: document\.getElementById\('editEventId'\)\.value,/g,
  "body: JSON.stringify({ action: 'add',"
);

// Remove editEvent function definition
content = content.replace(
  /function editEvent\(evStr\) \{[\s\S]*?document\.getElementById\('addEventModal'\)\.style\.display = 'flex';\s*\}/,
  ""
);

fs.writeFileSync('views/smart-events.ejs', content);
