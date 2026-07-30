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

const context = vm.createContext({ window: {} });
loadScript("assets/guide-config.js", context);
loadScript("assets/chapter1-data.js", context);
loadScript("assets/chapter3-data.js", context);
loadScript("assets/guide-search-index.js", context);

const config = context.window.GUIDE_CONFIG;
const data1 = context.window.CHAPTER1_DATA;
const data3 = context.window.CHAPTER3_DATA;
const searchIndex = context.window.GUIDE_SEARCH_INDEX;
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
  requireCondition(pages.every((page) => page.text.length > 300), `${label} 빈 원문 페이지가 있습니다.`);
  requireCondition(
    data.sections.every(
      (section) =>
        !("actions" in section) &&
        !("checks" in section) &&
        !("cautions" in section) &&
        Array.isArray(section.flowGroups)
    ),
    `${label}에 임의 단계 필드가 남아 있습니다.`
  );
  requireCondition(
    data.forms.every((form) => form.content.length > 20 && form.sectionId),
    `${label} 개별 서식 원문이 누락되었습니다.`
  );
  for (const relativePath of Object.values(data.downloads)) {
    const filePath = path.join(docs, relativePath);
    requireCondition(fs.existsSync(filePath) && fs.statSync(filePath).size > 0, `원본 파일 누락: ${relativePath}`);
  }
}

validateChapter(data1, 23, "제1편");
validateChapter(data3, 15, "제3편");

const serialized = JSON.stringify({ data1, data3 });
for (const forbidden of ["문서 필요성 판단", "업무의 목적과 수신 대상을 확인합니다."]) {
  requireCondition(!serialized.includes(forbidden), `임의 작성 문장이 남아 있습니다: ${forbidden}`);
}

requireCondition(searchIndex.length === 166, `통합검색 항목 수 오류: ${searchIndex.length}`);
requireCondition(
  searchIndex.some(
    (item) =>
      item.chapterId === "01" &&
      item.type === "서식·예시 원문" &&
      item.formId === "서식1" &&
      item.text.includes("공인대장")
  ),
  "제1편 공인대장 개별 원문이 검색되지 않습니다."
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

const appSource = fs.readFileSync(path.join(docs, "assets", "app-faithful.js"), "utf8");
const indexSource = fs.readFileSync(path.join(docs, "index.html"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(docs, "assets", "guide-bootstrap.js"), "utf8");
requireCondition(!appSource.includes("별도 지정 서식 없음"), "가짜 서식 없음 문구가 남아 있습니다.");
requireCondition(indexSource.includes("assets/faithful.css"), "원문 충실형 스타일이 연결되지 않았습니다.");
requireCondition(bootstrapSource.includes("assets/app-faithful.js"), "원문 충실형 앱이 연결되지 않았습니다.");

console.log(
  JSON.stringify(
    {
      chapters: available.map((chapter) => `${chapter.label} ${chapter.title}`),
      chapter1: { works: 9, pages: 23, forms: 19, faqs: 55 },
      chapter3: { works: 5, pages: 15, forms: 21, faqs: 19 },
      searchEntries: searchIndex.length,
    },
    null,
    2
  )
);
