// 글머리표로 시작하는 줄이 화면에서 앞줄에 붙지 않는지 확인합니다.
//
// 매뉴얼은 판마다 다른 글머리표를 씁니다. ▸(U+25B8)와 ▶(U+25B6)는 서로
// 다른 글자입니다. 화면 규칙에서 한 기호라도 빠지면 그 줄은 글머리표로
// 안 보여 앞줄 뒤에 그대로 붙습니다.
//
//   '지방공무원 임용령 제28조, 제29조, 연구·지도직규정 제11조 ▸정의'
//
// 규칙이 여러 곳에 흩어져 있어 한 곳만 고치고 넘어가기 쉬우므로,
// 원문에서 줄이 나뉜 곳은 화면에서도 반드시 나뉘는지 기계로 봅니다.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { docs, loadGuideData } = require("./lib/load_guide_data");

const window = loadGuideData();
const context = vm.createContext({ window: {}, document: undefined });
vm.runInContext(
  fs.readFileSync(path.join(docs, "assets", "structured-details.js"), "utf8"),
  context
);
const renderer = context.window.GUIDE_DETAIL_RENDERER;

// 원문에서 글머리표로 시작하는 줄입니다.
const MARKER = /^[•‣▸▹▶▪□○◦※*]/;
// 줄 가운데에 나오면 안 되는 글머리표입니다.
// ※·*는 문장 안에서도 쓰이고, ○·◦는 서가배치 그림처럼 그림 기호로도
// 쓰이므로 뺍니다. 이 매뉴얼에서 실제 글머리표는 아래 여섯입니다.
const MIDDLE = /[•‣▸▹▶▪]/;
const squash = (value) => String(value ?? "").replace(/\s/g, "");

const problems = [];
let checkedLines = 0;

for (const key of ["CHAPTER1_DATA", "CHAPTER3_DATA"]) {
  for (const work of window[key].sections) {
    for (const block of work.contentBlocks) {
      if (!block.body) continue;
      const rendered = renderer.render(block);
      if (rendered.type !== "text") continue;

      // 화면에 그려진 줄입니다.
      const shown = [...rendered.html.matchAll(/class="source-outline-text">([^<]*)</g)].map(
        (match) => squash(match[1])
      );

      const inTable = new Set();
      for (const table of block.tables || []) {
        for (let offset = 0; offset < (table.lineCount || 0); offset += 1) {
          inTable.add((table.lineStart || 0) + offset);
        }
      }

      // 원문에서 글머리표로 시작하는 줄이 몇 개인지 세어 둡니다.
      for (const [index, raw] of String(block.body).split(/\r?\n/).entries()) {
        if (inTable.has(index)) continue;
        if (MARKER.test(raw.trim())) checkedLines += 1;
      }

      // 화면 한 줄 가운데에 글머리표가 있으면 그 자리에서 줄이 나뉘었어야 합니다.
      // 이것이 '앞줄에 붙었다'는 증상 그대로입니다.
      for (const text of shown) {
        const inside = text.slice(1).search(MIDDLE);
        if (inside < 0) continue;
        problems.push(
          `제${key === "CHAPTER1_DATA" ? "01" : "03"}편 ${work.title} ` +
            `[${block.title.slice(0, 20)}]: 한 줄 가운데에 글머리표가 있습니다 ` +
            `→ '${text.slice(Math.max(0, inside - 12), inside + 20)}'`
        );
      }
    }
  }
}

if (problems.length) {
  console.error("글머리표 줄이 앞줄에 붙었습니다:");
  problems.slice(0, 20).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 20) console.error(` … 외 ${problems.length - 20}건`);
  process.exit(1);
}

console.log(`bullet lines valid: 글머리표 줄 ${checkedLines}개가 모두 제 줄에 섰습니다.`);
