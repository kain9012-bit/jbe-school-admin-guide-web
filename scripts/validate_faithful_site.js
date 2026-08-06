// 웹판이 원문에 충실한지 확인합니다.
// 원문에 없는 단계·할 일·주의사항을 임의로 만들어 넣지 않았는지,
// 원문 페이지와 서식 원문이 그대로 남아 있는지를 봅니다.

const fs = require("fs");
const path = require("path");
const { docs, loadGuideData, requireCondition } = require("./lib/load_guide_data");

const window = loadGuideData();
const config = window.GUIDE_CONFIG;
const data1 = window.CHAPTER1_DATA;
const data3 = window.CHAPTER3_DATA;
const searchIndex = window.GUIDE_SEARCH_INDEX;
const available = config.chapters.filter((chapter) => chapter.available);

requireCondition(available.length === 2, `공개 편 수 오류: ${available.length}`);
requireCondition(data1.sections.length === 9, `제1편 업무 수 오류: ${data1.sections.length}`);
requireCondition(data3.sections.length === 5, `제3편 업무 수 오류: ${data3.sections.length}`);
requireCondition(data1.forms.length === 19, `제1편 서식 수 오류: ${data1.forms.length}`);
requireCondition(data3.forms.length === 21, `제3편 서식 수 오류: ${data3.forms.length}`);
requireCondition(data1.faqs.length === 55, `제1편 FAQ 수 오류: ${data1.faqs.length}`);
requireCondition(data3.faqs.length === 19, `제3편 FAQ 수 오류: ${data3.faqs.length}`);

function validateChapter(data, expectedPages, label) {
  const pages = data.sections.flatMap((section) => section.sourcePages);
  requireCondition(pages.length === expectedPages, `${label} 원문 페이지 수 오류: ${pages.length}`);
  requireCondition(
    pages.every((page) => page.text.length > 300),
    `${label} 빈 원문 페이지가 있습니다.`
  );

  // 원문에 없는 '할 일·확인사항·주의사항'을 지어내지 않았는지 확인합니다.
  requireCondition(
    data.sections.every(
      (section) =>
        !("actions" in section) &&
        !("checks" in section) &&
        !("cautions" in section) &&
        Array.isArray(section.flowGroups) &&
        Array.isArray(section.contentBlocks)
    ),
    `${label}에 임의 단계 필드가 남아 있습니다.`
  );

  // 본문 블록은 한글파일에서 만들어 냅니다. 이름과 내용이 있어야 합니다.
  const blocks = data.sections.flatMap((section) => section.contentBlocks);
  requireCondition(
    blocks.every((block) => typeof block.id === "string" && typeof block.title === "string"),
    `${label} 본문 블록에 이름표가 없습니다.`
  );

  requireCondition(
    data.forms.every((form) => form.content.length > 20 && form.sectionId),
    `${label} 개별 서식 원문이 누락되었습니다.`
  );

  for (const relativePath of Object.values(data.downloads)) {
    const filePath = path.join(docs, relativePath);
    requireCondition(
      fs.existsSync(filePath) && fs.statSync(filePath).size > 0,
      `원본 파일 누락: ${relativePath}`
    );
  }

  return blocks.length;
}

const blocks1 = validateChapter(data1, 23, "제1편");
const blocks3 = validateChapter(data3, 15, "제3편");

const serialized = JSON.stringify({ data1, data3 });
for (const forbidden of ["문서 필요성 판단", "업무의 목적과 수신 대상을 확인합니다."]) {
  requireCondition(!serialized.includes(forbidden), `임의 작성 문장이 남아 있습니다: ${forbidden}`);
}

// 통합검색은 두 편의 업무·원문·서식·FAQ를 모두 담습니다.
requireCondition(searchIndex.length === 313, `통합검색 항목 수 오류: ${searchIndex.length}`);
requireCondition(
  searchIndex.every((item) => item.chapterId === "01" || item.chapterId === "03"),
  "공개하지 않은 편이 통합검색에 들어 있습니다."
);
requireCondition(
  searchIndex.filter((item) => item.type === "업무").length ===
    data1.sections.length + data3.sections.length,
  "업무 항목이 통합검색에 모두 들어 있지 않습니다."
);
requireCondition(
  searchIndex.filter((item) => item.type === "FAQ 원문").length ===
    data1.faqs.length + data3.faqs.length,
  "FAQ가 통합검색에 모두 들어 있지 않습니다."
);
requireCondition(
  searchIndex.some(
    (item) =>
      item.chapterId === "01" && item.type === "매뉴얼 원문" && item.text.includes("공인대장")
  ),
  "제1편 공인대장 원문이 검색되지 않습니다."
);
requireCondition(
  searchIndex.some(
    (item) =>
      item.chapterId === "03" &&
      item.type === "FAQ 원문" &&
      item.title.includes("휴직 중 해외여행")
  ),
  "제3편 휴직 중 해외여행 FAQ가 검색되지 않습니다."
);

// 기본 페이지가 실제로 쓰는 화면 코드에 원문 충실성이 지켜지는지 확인합니다.
const indexSource = fs.readFileSync(path.join(docs, "index.html"), "utf8");
const bootstrapSource = fs.readFileSync(
  path.join(docs, "assets", "guide-bootstrap-workflow.js"),
  "utf8"
);
const appSource = fs.readFileSync(
  path.join(docs, "assets", "app-faithful-workflow.js"),
  "utf8"
);

requireCondition(
  indexSource.includes("assets/guide-bootstrap-workflow.js"),
  "기본 페이지가 현재 화면 부트스트랩을 부르지 않습니다."
);
requireCondition(
  bootstrapSource.includes("assets/app-faithful-workflow.js") &&
    bootstrapSource.includes("assets/workflow-layout.js"),
  "부트스트랩이 현재 화면 코드와 의미 단계 배치를 부르지 않습니다."
);
requireCondition(
  indexSource.includes("assets/workflow-faithful.css") &&
    indexSource.includes("assets/semantic-workflow.css"),
  "원문 충실형 스타일이 연결되지 않았습니다."
);
requireCondition(
  !appSource.includes("별도 지정 서식 없음"),
  "가짜 서식 없음 문구가 남아 있습니다."
);
requireCondition(
  appSource.includes("원문에 별도 서식·예시가 연결되어 있지 않습니다."),
  "서식이 없는 경우의 원문 기준 안내 문구가 없습니다."
);

// 내려받은 파일 이름이 'example-3.hwpx'처럼 나오면 무엇인지 알 수 없습니다.
requireCondition(
  appSource.includes("function downloadFileName(") &&
    appSource.includes('download.setAttribute("download", downloadFileName(form))'),
  "서식을 내려받을 때 파일 이름을 서식 이름으로 정해 주지 않습니다."
);
const headerSource = fs.readFileSync(
  path.join(docs, "assets", "header-v3.js"),
  "utf8"
);
requireCondition(
  headerSource.includes("서식·예시 모음.hwpx") && headerSource.includes("자주 묻는 질문.hwp"),
  "모음 자료를 내려받을 때 파일 이름을 알아볼 수 있게 정해 주지 않습니다."
);

console.log(
  JSON.stringify(
    {
      chapters: available.map((chapter) => `${chapter.label} ${chapter.title}`),
      chapter1: { works: 9, sourcePages: 23, contentBlocks: blocks1, forms: 19, faqs: 55 },
      chapter3: { works: 5, sourcePages: 15, contentBlocks: blocks3, forms: 21, faqs: 19 },
      searchEntries: searchIndex.length,
    },
    null,
    2
  )
);
