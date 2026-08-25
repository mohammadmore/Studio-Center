const fs = require('fs');
let content = fs.readFileSync('views/smart-events.ejs', 'utf8');

content = content.replace(
  /\$\{USER_ROLE === 1 \? `\s*<div style="display: flex; gap: 8px;">\s*<button onclick="editEvent\('\$\{encodeURIComponent\(JSON\.stringify\(ev\)\)\.replace\(\/'\/g, '%27'\)\}'\)"[^>]*>.*?<\/button>\s*<button onclick="deleteEvent\(\$\{ev\.id\}\)"/g,
  "${(USER_ROLE === 1 || USER_ROLE === 2) ? `\n                                <div style=\"display: flex; gap: 8px;\">\n                                    <button onclick=\"deleteEvent(${ev.id})\""
);

content = content.replace(
  /\$\{USER_ROLE === 1 \? `\s*<button onclick="editEvent\('\$\{encodeURIComponent\(JSON\.stringify\(ev\)\)\.replace\(\/'\/g, '%27'\)\}'\)"[^>]*>.*?<\/button>\s*<button onclick="deleteEvent\(\$\{ev\.id\}\)"/g,
  "${(USER_ROLE === 1 || USER_ROLE === 2) ? `\n                                <button onclick=\"deleteEvent(${ev.id})\""
);

fs.writeFileSync('views/smart-events.ejs', content);
