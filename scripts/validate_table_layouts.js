const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;
require(path.join(root, "docs", "assets", "chapter1-data.js"));
require(path.join(root, "docs", "assets", "chapter3-data.js"));
require(path.join(root, "docs", "assets", "structured-details.js"));

const layouts = new Map();
for (const data of [global.CHAPTER1_DATA, global.CHAPTER3_DATA]) {
  for (const section of data.sections) {
    for (const block of section.contentBlocks || []) {
      const rendered = global.GUIDE_DETAIL_RENDERER.render(block);
      if (rendered.type !== "table") continue;
      for (const match of rendered.html.matchAll(/data-column-layout="([^"]+)"/g)) {
        const layout = match[1];
        if (!layouts.has(layout)) layouts.set(layout, []);
        layouts.get(layout).push(block.title);
      }
    }
  }
}

console.log(`content-aware layouts: ${layouts.size}`);
for (const [layout, titles] of layouts) {
  console.log(`${layout}: ${titles.join(" | ")}`);
}
if (layouts.size < 5) {
  throw new Error("표의 내용에 따른 열 너비 변화가 충분하지 않습니다.");
}
