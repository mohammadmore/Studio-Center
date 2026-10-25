const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync("/tmp/depot.html", "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously" });
