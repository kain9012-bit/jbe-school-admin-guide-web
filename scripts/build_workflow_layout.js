// 업무 안의 목차를 매뉴얼 소제목에서 그대로 만들어 냅니다.
//
// 매뉴얼은 소제목마다 앞에 '세부내용'이라는 알약 모양 표시를 달아 둡니다.
//
//   세부내용  신원조사        ← 여기서 한 묶음이 시작합니다
//     관련법규 및 참고자료
//     구분/내용 표
//   세부내용  결격사유 조회    ← 여기서 다음 묶음이 시작합니다
//
// 표시가 나오면 그 자리에서 새 묶음을 열고, 다음 표시를 만날 때까지의 내용을
// 그 묶음에 담습니다. 첫 표시보다 앞에 있는 업무 제목과 업무 흐름도는
// 첫 묶음에 함께 둡니다.
//
// '1. 정의' 같은 번호 항목은 소제목이 아니라 그 안의 세부 항목이므로
// 목차를 다시 쪼개지 않고 해당 소제목 아래에 그대로 둡니다.
//
// 사용법: node scripts/build_workflow_layout.js

const fs = require("fs");
const path = require("path");
const { loadGuideData, chapterKeys } = require("./lib/load_guide_data");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "docs/assets/workflow-layout.js");

const SECTION_MARK = /^세부내용\s+(\S.*)$/;

function sectionsOf(work) {
  const sections = [];
  const preamble = [];

  for (const block of work.contentBlocks) {
    const mark = SECTION_MARK.exec(String(block.title).trim());
    if (mark) {
      sections.push({ title: mark[1].trim(), blocks: [block.id] });
      continue;
    }
    if (sections.length) sections[sections.length - 1].blocks.push(block.id);
    else preamble.push(block.id);
  }

  // 소제목 표시보다 앞에 있는 업무 제목·흐름도는 첫 묶음에 함께 둡니다.
  if (!sections.length) return [{ title: work.title, blocks: preamble }];
  sections[0].blocks = [...preamble, ...sections[0].blocks];

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

for (const { key } of chapterKeys(window)) {
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
for (const { key } of chapterKeys(window)) {
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
