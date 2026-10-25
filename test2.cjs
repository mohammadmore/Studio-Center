const fs = require("fs");
const acorn = require("acorn");
const html = fs.readFileSync("/tmp/depot.html", "utf8");
const scripts = html.match(/<script.*?>([\s\S]*?)<\/script>/g);
if (scripts) {
  scripts.forEach((s, i) => {
    const content = s.replace(/<script.*?>|<\/script>/g, '');
    try {
      acorn.parse(content, { ecmaVersion: 2020 });
    } catch (e) {
      console.log('Error in script', i, 'at position', e.pos, ':', e.message);
      const lines = content.split('\n');
      console.log(lines.slice(Math.max(0, e.loc.line - 5), e.loc.line + 5).join('\n'));
    }
  });
}
