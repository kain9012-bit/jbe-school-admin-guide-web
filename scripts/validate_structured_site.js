const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function loadScript(relativePath, context) {
  const filePath = path.join(docs, relativePath);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
}

const ornaments = new Set([
  "제",
  "1편",
  "3편",
  "행정업무 및 보안",
  "인사관리",
  "제1편 행정업무 및 보안",
  "제3편 인사관리",
  "학교 행정업무 길라잡이",
]);

function filteredLines(text, printedPage) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !ornaments.has(line) && line !== String(printedPage));
}

function blockLines(block) {
  const bodyLines = String(block.body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (block.sourceLineCount === bodyLines.length + 1) {
    return [block.title, ...bodyLines];
  }
  requireCondition(
    block.sourceLineCount === bodyLines.length,
    `${block.id} 원문 줄 수 메타데이터가 맞지 않습니다.`
  );
  return bodyLines;
}

function validateChapter(data, options) {
  const { label, expectedPages, expectedLines, expectedBlocks, forms, faqs } = options;
  const pages = data.sections.flatMap((section) => section.sourcePages);
  const blocks = data.sections.flatMap((section) => section.contentBlocks);

  requireCondition(pages.length === expectedPages, `${label} 원문 페이지 수 오류: ${pages.length}`);
  requireCondition(blocks.length === expectedBlocks, `${label} 구조화 블록 수 오류: ${blocks.length}`);
  requireCondition(data.forms.length === forms, `${label} 서식 수 오류: ${data.forms.length}`);
  requireCondition(data.faqs.length === faqs, `${label} FAQ 수 오류: ${data.faqs.length}`);
  requireCondition(
    !blocks.some((block) => Object.hasOwn(block, "flowStep")),
    `${label} 자동 추정 흐름 연결이 남아 있습니다.`
  );

  let sourceLineTotal = 0;
  let blockLineTotal = 0;
  for (const section of data.sections) {
    for (const page of section.sourcePages) {
      const source = filteredLines(page.text, page.printedPage);
      const pageBlocks = section.contentBlocks.filter((block) => block.pdfPage === page.pdfPage);
      const rebuilt = pageBlocks.flatMap(blockLines);
      sourceLineTotal += source.length;
      blockLineTotal += rebuilt.length;
      requireCondition(
        JSON.stringify(source) === JSON.stringify(rebuilt),
        `${label} 매뉴얼 ${page.printedPage}쪽의 구조화 순서 또는 내용이 원문과 다릅니다.`
      );
    }

    for (const flow of section.flowGroups) {
      requireCondition(
        section.contentBlocks.some(
          (block) =>
            block.body === flow.sourceText &&
            block.pdfPage === flow.pdfPage &&
            block.printedPage === flow.printedPage
        ),
        `${label} ${section.title}의 흐름도가 원문 블록과 일치하지 않습니다.`
      );
    }
  }
  requireCondition(sourceLineTotal === expectedLines, `${label} 원문 줄 수 오류: ${sourceLineTotal}`);
  requireCondition(blockLineTotal === expectedLines, `${label} 구조화 줄 수 오류: ${blockLineTotal}`);

  requireCondition(
    data.forms.every((form) => form.sectionId && form.content.length > 20),
    `${label} 개별 서식·예시 원문이 누락되었습니다.`
  );
  for (const relativePath of Object.values(data.downloads)) {
    const filePath = path.join(docs, relativePath);
    requireCondition(
      fs.existsSync(filePath) && fs.statSync(filePath).size > 0,
      `원본 파일 누락: ${relativePath}`
    );
  }
}

const context = vm.createContext({ window: {} });
loadScript("assets/guide-config.js", context);
loadScript("assets/chapter1-data.js", context);
loadScript("assets/chapter3-data.js", context);
loadScript("assets/guide-search-index.js", context);

const config = context.window.GUIDE_CONFIG;
const data1 = context.window.CHAPTER1_DATA;
const data3 = context.window.CHAPTER3_DATA;
const searchIndex = context.window.GUIDE_SEARCH_INDEX;

requireCondition(
  config.chapters.length === 19,
  `전체 편 구성 오류: ${config.chapters.length}`
);
requireCondition(
  config.chapters.filter((chapter) => chapter.available).length === 2,
  "현재 공개 편은 제1편과 제3편이어야 합니다."
);
requireCondition(data1.sections.length === 9, `제1편 업무 수 오류: ${data1.sections.length}`);
requireCondition(data3.sections.length === 5, `제3편 업무 수 오류: ${data3.sections.length}`);

validateChapter(data1, {
  label: "제1편",
  expectedPages: 23,
  expectedLines: 740,
  expectedBlocks: 140,
  forms: 19,
  faqs: 55,
});
validateChapter(data3, {
  label: "제3편",
  expectedPages: 15,
  expectedLines: 522,
  expectedBlocks: 96,
  forms: 21,
  faqs: 19,
});

const serialized = JSON.stringify({ data1, data3, searchIndex });
for (const forbidden of [
  "문서 필요성 판단",
  "업무의 목적과 수신 대상을 확인합니다.",
  "별도 지정 서식 없음",
]) {
  requireCondition(!serialized.includes(forbidden), `임의 작성 문장이 남아 있습니다: ${forbidden}`);
}

const allBlocks = [
  ...data1.sections.flatMap((section) =>
    section.contentBlocks.map((block) => ({ chapterId: "01", workId: section.id, block }))
  ),
  ...data3.sections.flatMap((section) =>
    section.contentBlocks.map((block) => ({ chapterId: "03", workId: section.id, block }))
  ),
];
for (const { chapterId, workId, block } of allBlocks) {
  requireCondition(
    searchIndex.some(
      (item) =>
        item.chapterId === chapterId &&
        item.workId === workId &&
        item.blockId === block.id &&
        item.text.includes(block.body)
    ),
    `${chapterId}/${workId}/${block.id} 구조화 원문이 검색 색인에 없습니다.`
  );
}

for (const [chapterId, data] of [
  ["01", data1],
  ["03", data3],
]) {
  for (const form of data.forms) {
    requireCondition(
      searchIndex.some(
        (item) =>
          item.chapterId === chapterId &&
          item.formId === form.id &&
          item.text.includes(form.content)
      ),
      `${chapterId}/${form.id} 서식 원문이 검색 색인에 없습니다.`
    );
  }
  for (const faq of data.faqs) {
    requireCondition(
      searchIndex.some(
        (item) =>
          item.chapterId === chapterId &&
          item.faqNumber === String(faq.number) &&
          item.text.includes(faq.answer)
      ),
      `${chapterId}/Q${faq.number} FAQ 원문이 검색 색인에 없습니다.`
    );
  }
}

// 기본 페이지가 실제로 쓰는 화면은 업무 흐름형입니다.
// 구조화 데이터를 그 화면이 그대로 받아 쓰는지 확인합니다.
const indexSource = fs.readFileSync(path.join(docs, "index.html"), "utf8");
const appSource = fs.readFileSync(
  path.join(docs, "assets", "app-faithful-workflow.js"),
  "utf8"
);
const bootstrapSource = fs.readFileSync(
  path.join(docs, "assets", "guide-bootstrap-workflow.js"),
  "utf8"
);
const detailSource = fs.readFileSync(
  path.join(docs, "assets", "structured-details.js"),
  "utf8"
);

requireCondition(
  indexSource.includes("assets/guide-bootstrap-workflow.js"),
  "기본 페이지에 현재 화면 부트스트랩이 연결되지 않았습니다."
);
requireCondition(
  bootstrapSource.includes("assets/app-faithful-workflow.js"),
  "부트스트랩에 현재 화면 코드가 연결되지 않았습니다."
);
requireCondition(
  indexSource.includes('id="step-list"') && indexSource.includes('id="breadcrumb"'),
  "업무 단계 표시줄 또는 이동 경로 영역이 없습니다."
);
requireCondition(
  indexSource.includes("assets/structured-details.js") &&
    indexSource.includes("assets/structured-details.css"),
  "구조화 본문 표현이 기본 페이지에 연결되지 않았습니다."
);
requireCondition(
  appSource.includes("work.contentBlocks") && appSource.includes("GUIDE_WORKFLOW_LAYOUT"),
  "화면이 구조화 블록과 의미 단계 배치를 사용하지 않습니다."
);
requireCondition(
  !appSource.includes("flowStep") && !detailSource.includes("flowStep"),
  "자동 추정 흐름 연결이 남아 있습니다."
);

console.log(
  JSON.stringify(
    {
      chapter1: { works: 9, pages: 23, lines: 740, blocks: 140, forms: 19, faqs: 55 },
      chapter3: { works: 5, pages: 15, lines: 522, blocks: 96, forms: 21, faqs: 19 },
      exactSourceFlows: {
        chapter1: data1.sections.reduce((total, section) => total + section.flowGroups.length, 0),
        chapter3: data3.sections.reduce((total, section) => total + section.flowGroups.length, 0),
      },
      searchEntries: searchIndex.length,
    },
    null,
    2
  )
);
