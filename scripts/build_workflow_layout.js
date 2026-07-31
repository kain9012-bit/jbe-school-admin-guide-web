// 업무 안의 소제목을 매뉴얼에서 그대로 뽑아 목차를 만듭니다.
//
// 매뉴얼은 소제목을 'OOO세부내용'이라는 표시로 알려 줍니다.
// PDF에서 글자를 뽑으면 이 표시가 해당 구역의 '끝'에 오므로,
// 앞의 내용을 모아 두었다가 표시를 만나면 그 이름으로 한 묶음을 닫습니다.
//
//   직무대리      → 1. 정의 / 2. 구분 / 3. 지정 절차 / 4. 책임과 권한
//   직무대리자 지정 → 16쪽 지정 방법 표
//
// '1. 정의' 같은 번호 항목은 소제목이 아니라 그 안의 세부 항목이므로
// 목차를 다시 쪼개지 않고 해당 소제목 아래에 그대로 둡니다.
//
// 사용법: node scripts/build_workflow_layout.js

const fs = require("fs");
const path = require("path");
const { loadGuideData } = require("./lib/load_guide_data");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "docs/assets/workflow-layout.js");

const SECTION_MARK = /세부내용$/;

function sectionsOf(work) {
  const sections = [];
  let buffer = [];

  for (const block of work.contentBlocks) {
    buffer.push(block.id);

    if (!block.body && SECTION_MARK.test(block.title)) {
      const title = block.title.replace(SECTION_MARK, "").trim();
      sections.push({ title: title || work.title, blocks: buffer });
      buffer = [];
    }
  }

  // 표시 없이 남은 내용은 마지막 묶음에 붙입니다.
  if (buffer.length) {
    if (sections.length) {
      sections[sections.length - 1].blocks.push(...buffer);
    } else {
      sections.push({ title: work.title, blocks: buffer });
    }
  }

  // 본문이 하나도 없는 묶음은 화면에서 빈칸으로만 보이므로 옆 묶음에 합칩니다.
  const hasBody = (section) =>
    section.blocks.some((id) => {
      const block = work.contentBlocks.find((item) => item.id === id);
      return block && block.body;
    });

  for (let index = sections.length - 1; index >= 0; index -= 1) {
    if (hasBody(sections[index])) continue;
    if (index + 1 < sections.length) {
      sections[index + 1].blocks = [...sections[index].blocks, ...sections[index + 1].blocks];
      sections.splice(index, 1);
    } else if (index > 0) {
      sections[index - 1].blocks.push(...sections[index].blocks);
      sections.splice(index, 1);
    }
  }

  return sections;
}

const window = loadGuideData();
const layout = {};
const report = [];

for (const key of ["CHAPTER1_DATA", "CHAPTER3_DATA"]) {
  for (const work of window[key].sections) {
    const sections = sectionsOf(work);
    layout[work.id] = sections;
    report.push(
      `${work.title.padEnd(22)} 소제목 ${String(sections.length).padStart(2)}개 : ` +
        sections.map((section) => section.title).join(" / ")
    );
  }
}

// 빠지거나 겹치거나 순서가 뒤바뀐 블록이 없어야 합니다.
for (const key of ["CHAPTER1_DATA", "CHAPTER3_DATA"]) {
  for (const work of window[key].sections) {
    const assigned = layout[work.id].flatMap((section) => section.blocks);
    const source = work.contentBlocks.map((block) => block.id);
    if (JSON.stringify(assigned) !== JSON.stringify(source)) {
      throw new Error(`${work.title}: 블록이 원문 순서 그대로 담기지 않았습니다.`);
    }
  }
}

const body = Object.entries(layout)
  .map(([workId, sections]) => {
    const lines = sections
      .map(
        (section) =>
          `    { title: ${JSON.stringify(section.title)}, blocks: ${JSON.stringify(
            section.blocks
          )} }`
      )
      .join(",\n");
    return `  ${JSON.stringify(workId)}: [\n${lines}\n  ]`;
  })
  .join(",\n");

fs.writeFileSync(
  target,
  "// 이 파일은 scripts/build_workflow_layout.js가 매뉴얼 소제목에서 만들어 냅니다.\n" +
    "// 손으로 고치지 마세요. 원문이 바뀌면 스크립트를 다시 실행하세요.\n" +
    `window.GUIDE_WORKFLOW_LAYOUT = {\n${body}\n};\n`,
  "utf8"
);

console.log(report.join("\n"));
