const fs = require("fs");
const acorn = require("acorn");
const html = fs.readFileSync("/tmp/depot.html", "utf8");
const matches = [...html.matchAll(/on[a-z]+=(['"])(.*?)\1/g)];
matches.forEach(m => {
  try {
    acorn.parse(m[2], { ecmaVersion: 2020 });
  } catch(e) {
    console.log("Error in inline handler:", m[0], e.message);
  }
});
