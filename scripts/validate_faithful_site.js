// 웹판이 원문에 충실한지 확인합니다.
// 원문에 없는 단계·할 일·주의사항을 임의로 만들어 넣지 않았는지,
// 공개한 편마다 자료가 갖춰져 있는지를 봅니다.
//
// 편은 계속 늘어납니다. 그래서 '몇 편, 몇 개'처럼 숫자를 박아 두지 않고
// 편마다 지켜야 할 규칙만 확인합니다.

const fs = require("fs");
const path = require("path");

// 자산 주소에는 파일이 바뀔 때마다 달라지는 번호가 붙습니다(assets/x.js?v=1a2b3c).
// 여기서는 그 번호를 떼고 봅니다. 번호 자체는 validate_asset_versions.js가 봅니다.
const stripAssetVersions = (html) => html.replace(/\?v=[0-9a-z-]+(?=")/gi, "");
const {
  docs,
  loadGuideData,
  requireCondition,
  chapterKeys,
} = require("./lib/load_guide_data");

const window = loadGuideData();
const config = window.GUIDE_CONFIG;
const searchIndex = window.GUIDE_SEARCH_INDEX;
const open = config.chapters.filter((chapter) => chapter.available);

requireCondition(open.length > 0, "공개된 편이 없습니다.");

let works = 0;
let blocks = 0;
let tables = 0;

for (const { id, key } of chapterKeys(window)) {
  const data = window[key];
  const label = `제${id}편`;
  requireCondition(Array.isArray(data.sections) && data.sections.length > 0, `${label} 업무가 없습니다.`);
  requireCondition(Array.isArray(data.forms), `${label} 서식 자료가 없습니다.`);
  requireCondition(Array.isArray(data.faqs), `${label} FAQ 자료가 없습니다.`);

  for (const work of data.sections) {
    works += 1;
    requireCondition(typeof work.id === "string" && work.id, `${label} 업무에 이름표가 없습니다.`);
    requireCondition(typeof work.title === "string" && work.title, `${label} 업무에 제목이 없습니다.`);
    // 원문에 없는 '할 일·확인사항·주의사항'을 지어내지 않았는지 봅니다.
    requireCondition(
      !("actions" in work) && !("checks" in work) && !("cautions" in work),
      `${label} ${work.title}에 임의 단계 필드가 남아 있습니다.`
    );
    requireCondition(Array.isArray(work.contentBlocks), `${label} ${work.title} 본문이 없습니다.`);
    requireCondition(Array.isArray(work.flowGroups), `${label} ${work.title} 흐름 정보가 없습니다.`);
    blocks += work.contentBlocks.length;
    for (const block of work.contentBlocks) {
      tables += (block.tables || []).length;
    }
  }

  // 내려받기에 적어 둔 파일은 실제로 있어야 합니다.
  for (const relativePath of Object.values(data.downloads || {})) {
    requireCondition(
      fs.existsSync(path.join(docs, relativePath)),
      `${label} 내려받기 파일이 없습니다: ${relativePath}`
    );
  }
}

// 업무는 모두 통합검색에 들어 있어야 합니다.
requireCondition(
  searchIndex.filter((item) => item.type === "업무").length === works,
  "업무가 통합검색에 모두 들어 있지 않습니다."
);
requireCondition(
  searchIndex.every((item) => open.some((chapter) => chapter.id === item.chapterId)),
  "공개하지 않은 편이 통합검색에 들어 있습니다."
);

const serialized = JSON.stringify(
  chapterKeys(window).map(({ key }) => window[key])
);
for (const forbidden of ["문서 필요성 판단", "업무의 목적과 수신 대상을 확인합니다."]) {
  requireCondition(!serialized.includes(forbidden), `임의 작성 문장이 남아 있습니다: ${forbidden}`);
}

// 기본 페이지가 실제로 쓰는 화면 코드에 원문 충실성이 지켜지는지 확인합니다.
const indexSource = stripAssetVersions(fs.readFileSync(path.join(docs, "index.html"), "utf8"));
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
  `faithful site valid: 공개 편 ${open.length}개 · 업무 ${works}개 · ` +
    `본문 블록 ${blocks}개 · 표 ${tables}개 · 통합검색 ${searchIndex.length}건`
);
