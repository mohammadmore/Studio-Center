import { readFileSync } from "fs";
const config = JSON.parse(readFileSync("firebase-applet-config.json", "utf8"));
console.log(config);
