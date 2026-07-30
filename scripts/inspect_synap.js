const fs = require("fs");

const source = fs.readFileSync("C:\\work\\synap-viewer.js", "utf8");
const matches = [
  ...source.matchAll(/["']([^"']{1,120}(?:json|xml|png|svg|thumbnail|docInfo|status)[^"']{0,80})["']/gi)
].map((match) => match[1]);

console.log([...new Set(matches)].slice(0, 400).join("\n"));
