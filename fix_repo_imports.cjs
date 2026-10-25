const fs = require('fs');

function addRepoImports(file) {
  let code = fs.readFileSync(file, 'utf8');
  if (!code.includes('import * as repo')) {
    code = 'import * as repo from "../../db/repository.js";\n' + code;
    // Replace state imports to not include colleagues and roles if possible, but for now just add repo
  }
  fs.writeFileSync(file, code);
}

addRepoImports('src/routes/api_routes/auth.ts');
addRepoImports('src/routes/api_routes/users.ts');
