// 업무 안의 목차를 매뉴얼의 소제목에서 그대로 뽑아 만듭니다.
//
// 예전에는 흐름도에서 단계 이름만 가져다 놓고 본문 블록을 앞에서부터 순서대로
// 부어 넣었습니다. 그래서 '기안문 작성' 단계에 지정 방법 표가 들어가는 일이
// 생겼습니다. 어느 내용을 어느 단계에 넣을지 사람이 정해야 했고, 그 판단이 틀렸습니다.
//
// 이제는 정하지 않습니다. 매뉴얼이 '1. 정의 / 2. 구분 / 3. 지정 절차'로 나눠 놓았으면
// 화면도 그대로 나눕니다. 각 소제목 아래의 내용은 원문에서 그 아래 있던 것 그대로입니다.
//
// 사용법: node scripts/build_workflow_layout.js

const fs = require("fs");
const path = require("path");
const { loadGuideData } = require("./lib/load_guide_data");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "docs/assets/workflow-layout.js");

// 매뉴얼에서 소제목 노릇을 하는 줄입니다. '1. 정의', '2. 구분'처럼 번호가 붙습니다.
const HEADING = /^\d+\.\s*\S/;
const GENERATED = /^매뉴얼 \d+쪽$/;

function isHeading(block) {
  return HEADING.test(block.title) && !GENERATED.test(block.title);
}

// 매뉴얼은 '직무대리자 지정세부내용'처럼 구역 이름을 붙여 둡니다.
// PDF에서 글자를 뽑으면 이 표시가 해당 내용 뒤에 오므로, 그 쪽의 이름표로 씁니다.
function pageLabel(work, pdfPage) {
  const marker = work.contentBlocks.find(
    (block) => block.pdfPage === pdfPage && !block.body && /세부내용$/.test(block.title)
  );
  if (marker) return marker.title.replace(/세부내용$/, "").trim();
  const printed = work.contentBlocks.find((block) => block.pdfPage === pdfPage);
  return printed ? `매뉴얼 ${printed.printedPage}쪽` : "그 밖의 기준";
}

function sectionsOf(work) {
  const sections = [];
  let current = null;
  let currentPage = null;

  for (const block of work.contentBlocks) {
    const hasContent = (id) => {
      const item = work.contentBlocks.find((entry) => entry.id === id);
      return item && item.body && item.title !== "TIPTIP";
    };

    if (isHeading(block)) {
      current = { title: block.title.trim(), blocks: [] };
      sections.push(current);
      currentPage = block.pdfPage;
    } else if (
      current &&
      block.pdfPage !== currentPage &&
      current.blocks.some(hasContent)
    ) {
      // 소제목 없이 다음 쪽으로 넘어가 이어지는 내용입니다.
      // 앞 소제목에 딸려 붙이면 엉뚱한 곳에 놓이므로 그 쪽의 이름으로 따로 묶습니다.
      current = { title: pageLabel(work, block.pdfPage), blocks: [] };
      sections.push(current);
      currentPage = block.pdfPage;
    }

    if (!current) {
      // 첫 소제목보다 앞에 있는 줄입니다. 업무 이름이나 흐름도처럼
      // 머리말 노릇을 하므로 첫 묶음에 담아 둡니다.
      current = { title: work.title, blocks: [], lead: true };
      sections.push(current);
      currentPage = block.pdfPage;
    }
    current.blocks.push(block.id);
  }

  // 본문이 하나도 없는 묶음은 화면에서 빈 항목으로만 보입니다.
  // 원문에서 구역 이름표만 있는 자리이므로 바로 다음 묶음에 합칩니다.
  // 마지막 묶음이면 앞 묶음에 붙입니다.
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
      sections[index - 1].blocks = [...sections[index - 1].blocks, ...sections[index].blocks];
      sections.splice(index, 1);
    }
  }

  for (const section of sections) delete section.lead;
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
      `${work.title.padEnd(22)} 묶음 ${String(sections.length).padStart(2)}개 · ` +
        `블록 ${work.contentBlocks.length}개`
    );
  }
}

// 빠지거나 겹친 블록이 없어야 합니다.
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
console.log(`\n${target.replace(root + "/", "")} 생성 완료`);
