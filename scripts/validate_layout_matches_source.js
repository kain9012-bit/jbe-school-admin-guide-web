// 업무 안의 목차가 매뉴얼 구조와 일치하는지 확인합니다.
//
// 예전 검증은 '모든 블록이 정확히 한 곳에 배정됐는가'만 봤습니다.
// 그 검사는 블록을 앞에서부터 아무렇게나 부어 넣어도 늘 통과합니다.
// 실제로 '기안문 작성' 항목에 지정 방법 표가 들어가 있었는데도 통과했습니다.
//
// 그래서 여기서는 배치 자체를 봅니다.
//   1. 목차 제목이 매뉴얼에 실제로 있는 소제목인가
//   2. 각 항목의 내용이 매뉴얼에서 그 소제목 아래 있던 것 그대로인가
//   3. 내용이 없는 항목이 남아 있지 않은가

const fs = require("fs");
const path = require("path");
const { loadGuideData } = require("./lib/load_guide_data");

const root = path.resolve(__dirname, "..");
const window = loadGuideData();
const layouts = window.GUIDE_WORKFLOW_LAYOUT;
const problems = [];

const HEADING = /^\d+\.\s*\S/;
const GENERATED = /^매뉴얼 \d+쪽$/;
const squash = (value) => String(value || "").replace(/\s+/g, "");

let works = 0;
let sections = 0;
let headingSections = 0;
let pageSections = 0;

for (const [chapterId, key] of [
  ["01", "CHAPTER1_DATA"],
  ["03", "CHAPTER3_DATA"],
]) {
  for (const work of window[key].sections) {
    works += 1;
    const layout = layouts[work.id];
    const where = `제${chapterId}편 ${work.title}`;

    if (!Array.isArray(layout) || !layout.length) {
      problems.push(`${where}: 목차가 없습니다.`);
      continue;
    }

    // 1. 블록이 원문 순서 그대로, 빠짐없이, 겹치지 않게 담겨야 합니다.
    const assigned = layout.flatMap((section) => section.blocks);
    const source = work.contentBlocks.map((block) => block.id);
    if (JSON.stringify(assigned) !== JSON.stringify(source)) {
      problems.push(`${where}: 내용이 매뉴얼 순서와 다르게 배치되었습니다.`);
    }

    // 매뉴얼은 소제목을 'OOO세부내용' 표시로 알려 줍니다.
    const sectionNames = new Set(
      work.contentBlocks
        .filter((block) => !block.body && /세부내용$/.test(block.title))
        .map((block) => squash(block.title.replace(/세부내용$/, "")))
    );

    for (const [index, section] of layout.entries()) {
      sections += 1;
      const label = `${where} ${index + 1}번째 [${section.title}]`;

      // 2. 목차 제목은 매뉴얼이 붙여 둔 소제목이어야 합니다. 지어낸 이름은 안 됩니다.
      const key = squash(section.title);
      if (sectionNames.has(key)) headingSections += 1;
      else if (key === squash(work.title)) pageSections += 1;
      else {
        problems.push(`${label}: 매뉴얼에 없는 소제목입니다.`);
      }

      // 3. 그 소제목 표시 블록을 실제로 담고 있어야 합니다.
      if (sectionNames.has(key)) {
        const owns = section.blocks.some((id) => {
          const block = work.contentBlocks.find((item) => item.id === id);
          return block && squash(String(block.title).replace(/세부내용$/, "")) === key;
        });
        if (!owns) {
          problems.push(`${label}: 매뉴얼의 해당 소제목 구역을 담고 있지 않습니다.`);
        }
      }

      // 4. 본문이 하나도 없는 항목은 남기지 않습니다.
      //    원문에서 구역 이름표만 있는 자리라 화면에서는 빈칸으로 보입니다.
      const hasContent = section.blocks.some((id) => {
        const block = work.contentBlocks.find((item) => item.id === id);
        return block && block.body;
      });
      if (!hasContent) {
        problems.push(`${label}: 볼 내용이 없는 빈 항목입니다.`);
      }
    }
  }
}

// 목차 파일은 손으로 고치지 않고 스크립트가 만들어야 합니다.
const layoutFile = fs.readFileSync(path.join(root, "docs/assets/workflow-layout.js"), "utf8");
if (!layoutFile.includes("scripts/build_workflow_layout.js")) {
  problems.push(
    "workflow-layout.js가 스크립트로 생성된 파일이 아닙니다. 손으로 고치면 매뉴얼과 어긋납니다."
  );
}

if (problems.length) {
  console.error("목차와 매뉴얼 구조가 어긋납니다:");
  problems.slice(0, 30).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 30) console.error(` … 외 ${problems.length - 30}건`);
  process.exit(1);
}

console.log(
  `layout matches source: 업무 ${works}개 · 항목 ${sections}개 ` +
    `(매뉴얼 소제목 ${headingSections}개, 소제목 표시가 없어 업무명을 쓴 것 ${pageSections}개), ` +
    `지어낸 제목과 빈 항목 없음`
);
