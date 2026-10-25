const fs = require('fs');
let code = fs.readFileSync('views/partials/content-identity.ejs', 'utf8');

const searchStr = "<button onclick=\"const newVal = '${value ? value + '\\n' : ''}' + document.getElementById('input_add_${field}').value; saveField(${item.id}, '${field}', newVal)\"";
const replaceStr = "<button onclick=\"const prev = decodeURIComponent('${encodeURIComponent(value || \\'\\')}'); const newVal = (prev ? prev + '\\n' : '') + document.getElementById('input_add_${field}').value; saveField(${item.id}, '${field}', newVal)\"";

code = code.replace(searchStr, replaceStr);

fs.writeFileSync('views/partials/content-identity.ejs', code);
