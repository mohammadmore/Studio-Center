const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('src/**/*.ts');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('import jalaali from "moment-jalaali"')) {
    content = content.replace(/import jalaali from "moment-jalaali"/g, 'import * as jalaali from "jalaali-js"');
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  }
}
