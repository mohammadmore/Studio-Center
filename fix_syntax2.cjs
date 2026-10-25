const fs = require('fs');
let code = fs.readFileSync('views/partials/content-identity.ejs', 'utf8');

const regex = /<button onclick="const prev = decodeURIComponent\('\\$\\{encodeURIComponent\(value \|\| \\'\\'\)\\}\\'\); const newVal = \(prev \? prev \+ '\\n' : ''\) \+ document\.getElementById\('input_add_\\$\\{field\\}'\)\.value; saveField\(\\$\\{item\.id\\}, '\\$\\{field\\}', newVal\)"/g;

const replacement = "<button onclick=\"const prev = decodeURIComponent('${encodeURIComponent(value || `\u0000`)}'); const newVal = (prev && prev !== '\u0000' ? prev + '\\n' : '') + document.getElementById('input_add_${field}').value; saveField(${item.id}, '${field}', newVal)\"";

code = code.replace(regex, replacement);

// Let's also do a simple replace in case regex fails
const searchStr = "<button onclick=\"const prev = decodeURIComponent('${encodeURIComponent(value || \\'\\')}'); const newVal = (prev ? prev + '\\n' : '') + document.getElementById('input_add_${field}').value; saveField(${item.id}, '${field}', newVal)\"";
code = code.replace(searchStr, replacement);

fs.writeFileSync('views/partials/content-identity.ejs', code);
