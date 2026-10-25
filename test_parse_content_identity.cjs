const fs = require('fs');
const acorn = require('acorn');

const html = fs.readFileSync('views/partials/content-identity.ejs', 'utf8');

const regex = /onclick="([^"]*)"/gi;
const matches = [...html.matchAll(regex)];

matches.forEach((m, i) => {
  let js = m[1];
  // Replace EJS templating logic with standard things to allow acorn to parse it
  js = js.replace(/\$\{item\.id\}/g, "123");
  js = js.replace(/\$\{field\}/g, "someField");
  js = js.replace(/\$\{value.*?\}/g, "someValue");
  js = js.replace(/\$\{prev.*?\}/g, "somePrev");
  js = js.replace(/\$\{p\}/g, "platform");
  js = js.replace(/\$\{pmStatus\}/g, "status");
  js = js.replace(/\$\{prevStatus.*?\}/g, "status");
  js = js.replace(/\$\{nextStatus.*?\}/g, "status");
  js = js.replace(/\$\{link\}/g, "link");
  
  // also handle decodeURIComponent('${encodeURIComponent(value || ` `)}') pattern
  js = js.replace(/\'\$\{encodeURIComponent\(value \|\| \` \`\)\}\'/g, "'encodedValue'");

  try {
    acorn.parse(js, { ecmaVersion: 2020 });
  } catch (e) {
    console.log(`Failed at index ${i}:`, js);
    console.log(e.message);
  }
});
