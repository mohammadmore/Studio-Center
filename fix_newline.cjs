const fs = require('fs');
let code = fs.readFileSync('views/partials/content-identity.ejs', 'utf8');

// The string we want to replace is exactly:
// prev + '\n' : ''
// We want to replace it with:
// prev + '\\n' : ''

code = code.replace(/prev \+ '\\n' : ''/g, "prev + '\\\\n' : ''");

fs.writeFileSync('views/partials/content-identity.ejs', code);
