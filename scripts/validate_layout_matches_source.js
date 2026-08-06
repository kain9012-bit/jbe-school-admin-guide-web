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

const SECTION_MARK = /^세부내용\s+(\S.*)$/;
const squash = (value) => String(value || "").replace(/\s+/g, "");

// 매뉴얼이 붙여 둔 소제목을 원문 차례 그대로 모읍니다.
// 한글파일에서 '세부내용' 표로 표시된 자리입니다.
function marksInSource(work) {
  const names = [];
  for (const block of work.contentBlocks) {
    const found = SECTION_MARK.exec(String(block.title).trim());
    if (found) names.push(squash(found[1]));
  }
  return names;
}

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

    // 매뉴얼은 소제목마다 앞에 '세부내용' 표시를 달아 둡니다.
    // 그 표시가 목차에 같은 이름·같은 순서로 나와야 합니다.
    const inSource = marksInSource(work);
    const sectionNames = new Set(inSource);
    const inLayout = layout.map((section) => squash(section.title));
    if (inSource.length && JSON.stringify(inSource) !== JSON.stringify(inLayout)) {
      problems.push(
        `${where}: 목차가 매뉴얼 소제목과 다릅니다.\n` +
          `      매뉴얼 : ${inSource.join(" / ")}\n` +
          `      목  차 : ${inLayout.join(" / ")}`
      );
    }

    // 번호 소제목이 본문 줄에 묻혀 있으면 목차에서 사라집니다.
    // '7 . 전보'처럼 번호와 마침표 사이가 벌어진 경우에 생기던 문제입니다.
    for (const block of work.contentBlocks) {
      // TIP 상자 안에는 '1. 검토자 부재 시의 경우'처럼 번호 목록이 들어갑니다.
      // 상자 안 목록은 소제목이 아니므로 보지 않습니다.
      if (block.title === "TIP") continue;
      // 표 안에 든 줄은 보지 않습니다. 표 칸에는 '1. 이용 온라인 서약 서명'처럼
      // 번호가 붙은 항목이 얼마든지 들어갑니다. 그것은 소제목이 아닙니다.
      const inTable = new Set();
      for (const table of block.tables || []) {
        for (let offset = 0; offset < (table.lineCount || 0); offset += 1) {
          inTable.add((table.lineStart || 0) + offset);
        }
      }
      for (const [index, line] of String(block.body || "").split(/\r?\n/).entries()) {
        if (inTable.has(index)) continue;
        // '1.8cm의 정사각형' 같은 치수는 소제목이 아닙니다.
        if (/^\d+\s*\.\s*(?!\d)\S/.test(line.trim())) {
          problems.push(
            `${where}: 번호 소제목 '${line.trim().slice(0, 24)}'이 ` +
              `'${block.title.slice(0, 20)}' 본문에 묻혀 있습니다.`
          );
        }
      }
    }

    // 매뉴얼은 소제목 안에서 '1. 2. 3.'으로 번호를 매기고 새 소제목에서 1부터
    // 다시 시작합니다. 앞 묶음의 다음 번호로 시작하는 묶음이 있다면
    // 이어지는 내용이 엉뚱한 소제목으로 넘어간 것입니다.
    const numbersOf = (section) =>
      section.blocks
        .map((id) => {
          const block = work.contentBlocks.find((item) => item.id === id);
          const found = block && /^(\d+)\.\s*\S/.exec(String(block.title));
          return found ? Number(found[1]) : null;
        })
        .filter((value) => value !== null);

    for (let index = 0; index + 1 < layout.length; index += 1) {
      const current = numbersOf(layout[index]);
      const next = numbersOf(layout[index + 1]);
      if (!current.length || !next.length) continue;
      if (next[0] === Math.max(...current) + 1) {
        problems.push(
          `${where}: '${layout[index].title}'에서 이어지는 ${next[0]}번 내용이 ` +
            `'${layout[index + 1].title}'으로 넘어가 있습니다.`
        );
      }
    }

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

      // 3. 묶음은 자기 이름표 블록에서 시작해야 합니다.
      //    이름표 다음부터 다음 이름표 직전까지가 매뉴얼에서 그 소제목의 구역입니다.
      if (sectionNames.has(key)) {
        const owns = section.blocks.some((id) => {
          const block = work.contentBlocks.find((item) => item.id === id);
          const mark = block && SECTION_MARK.exec(String(block.title).trim());
          return mark && squash(mark[1]) === key;
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
