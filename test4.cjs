const fs = require("fs");
const acorn = require("acorn");
const html = fs.readFileSync("views/depot.ejs", "utf8");
const scripts = [...html.matchAll(/<script.*?>([\s\S]*?)<\/script>/g)];
scripts.forEach(s => {
  try {
    acorn.parse(s[1], { ecmaVersion: 2020 });
  } catch(e) {
    console.log("Error in script block:", e.message, "at", e.loc);
  }
});
