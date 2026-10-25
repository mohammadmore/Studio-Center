const fs = require('fs');
let code = fs.readFileSync('views/partials/content-identity.ejs', 'utf8');

// We know the pattern: decodeURIComponent('${encodeURIComponent(value || `\0`)}')
// wait, the literal string has \0 in it!
const badStr = "decodeURIComponent('${encodeURIComponent(value || `\0`)}'); const newVal = (prev && prev !== '\0' ? prev + '\\n' : '')";

// let's just use regex to replace everything inside the onclick for that button
code = code.replace(/<button onclick="const prev = decodeURIComponent[^\"]*" style="background: var\(--success-color\)[^\>]*>افزودن<\/button>/g,
  `<button onclick="const prev = decodeURIComponent('${"$"}{encodeURIComponent(value || '')}'); const newVal = (prev ? prev + '\\n' : '') + document.getElementById('input_add_${"$"}{field}').value; saveField(${"$"}{item.id}, '${"$"}{field}', newVal)" style="background: var(--success-color); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;">افزودن</button>`
);

fs.writeFileSync('views/partials/content-identity.ejs', code);
