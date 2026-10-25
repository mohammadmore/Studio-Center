const fs = require("fs");
const acorn = require("acorn");

['views/depot.ejs', 'views/partials/content-identity.ejs', 'views/partials/collab-hub.ejs', 'views/sidebar.ejs'].forEach(file => {
  if (!fs.existsSync(file)) return;
  const html = fs.readFileSync(file, "utf8");
  
  // Check script tags
  const scripts = [...html.matchAll(/<script.*?>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((s, i) => {
    try {
      acorn.parse(s[1], { ecmaVersion: 2020 });
    } catch(e) {
      console.log(`Error in script block in ${file}:`, e.message, "at", e.loc);
      const lines = s[1].split('\n');
      console.log(lines.slice(Math.max(0, e.loc.line - 5), e.loc.line + 5).join('\n'));
    }
  });

  // Check onclick handlers
  const onclicks = [...html.matchAll(/onclick="([^"]*)"/gi)];
  onclicks.forEach((m) => {
    // some EJS templates might have EJS tags inside, which make JS invalid before rendering
    // But we can check for obvious unescaped newlines or quotes if possible, or just let acorn parse it
    let code = m[1];
    // if it has EJS like ${...} or <%= ... %>, acorn will fail.
    // Let's just log the ones that look suspicious (have newlines or weird chars)
    if (code.includes('\n') || code.includes('\r')) {
       console.log(`Suspicious onclick in ${file}:`, code);
    }
  });
});
