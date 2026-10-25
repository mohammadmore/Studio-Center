const fs = require('fs');
let code = fs.readFileSync('src/routes/api_routes/contents.ts', 'utf8');

code = code.replace(/saveDatabase\(\);\n\s*return res\.json\(\{\n\s*status: "success"\n\s*\}\);\n\s*\}/g, 
'saveDatabase();\n      const io = getIO();\n      if (io) io.emit("content_updated", { contentId: card.id, card });\n      return res.json({ status: "success" });\n    }');

fs.writeFileSync('src/routes/api_routes/contents.ts', code);
