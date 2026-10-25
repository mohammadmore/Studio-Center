const fs = require('fs');
let code = fs.readFileSync('src/routes/api_routes/contents.ts', 'utf8');

// Add script field to version history
const scriptRegex = /if \(script !== void 0\) card\.script = script;/;
const scriptReplacement = `
      if (script !== void 0 && script !== card.script) {
        if (!card.version_history) card.version_history = [];
        card.version_history.push({
          id: Date.now() + Math.random(),
          field: "script",
          old_value: card.script,
          new_value: script,
          user: req.session?.user?.username || "unknown",
          timestamp: new Date().toISOString()
        });
        card.script = script;
      } else if (script !== void 0) {
        card.script = script;
      }
`;
code = code.replace(scriptRegex, scriptReplacement);

fs.writeFileSync('src/routes/api_routes/contents.ts', code);
