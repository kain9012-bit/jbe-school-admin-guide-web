const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 자산 주소에는 파일이 바뀔 때마다 달라지는 번호가 붙습니다(assets/x.js?v=1a2b3c).
// 여기서는 그 번호를 떼고 봅니다. 번호 자체는 validate_asset_versions.js가 봅니다.
const stripAssetVersions = (html) => html.replace(/\?v=[0-9a-z-]+(?=")/gi, "");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "docs/assets/guide-config.js"), "utf8"),
  context
);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const config = context.window.GUIDE_CONFIG;
const expectedTitles = [
  "행정업무 및 보안",
  "민원 및 정보공개",
  "인사관리",
  "복무",
  "감사",
  "학교발전기금 및 세입세출외현금",
  "공무원 보수",
  "교육공무직원",
  "학교급식",
  "학교운영위원회",
  "재산관리",
  "물품관리",
  "학교시설관리",
  "학교회계 예결산",
  "학교회계 수입",
  "학교회계 지출",
  "학교회계 계약",
  "신설학교 설립 및 개교",
  "학교폐지 및 통폐합",
];

requireCondition(config.chapters.length === 19, "통합 홈의 편 수가 19개가 아닙니다.");
requireCondition(
  JSON.stringify(config.chapters.map((chapter) => chapter.title)) ===
    JSON.stringify(expectedTitles),
  "19개 편의 제목이 공식 목록과 일치하지 않습니다."
);
// 공개하는 편은 늘어납니다. 목록을 박아 두지 않고,
// 공개한 편마다 자료 파일이 실제로 있는지를 봅니다.
const open = config.chapters.filter((chapter) => chapter.available);
requireCondition(open.length > 0, "공개된 편이 하나도 없습니다.");
for (const chapter of open) {
  requireCondition(
    fs.existsSync(path.join(root, "docs", chapter.dataScript)),
    `${chapter.label} 자료 파일이 없습니다: ${chapter.dataScript}`
  );
}

// 편만 지정한 주소는 따로 화면을 갖지 않고 통합 홈에서 그 분야를 펼쳐야 합니다.
const workflowBootstrap = fs.readFileSync(
  path.join(root, "docs/assets/guide-bootstrap-workflow.js"),
  "utf8"
);
requireCondition(
  workflowBootstrap.includes("goHomeWithChapter") &&
    workflowBootstrap.includes("GUIDE_HOME_OPEN_CHAPTER"),
  "편만 지정해 들어왔을 때 통합 홈으로 보내지 않습니다."
);
// 진입 페이지는 하나만 남아야 합니다.
const entryPages = fs
  .readdirSync(path.join(root, "docs"))
  .filter((name) => name.endsWith(".html"));
requireCondition(
  entryPages.length === 1 && entryPages[0] === "index.html",
  `진입 페이지가 여러 개입니다: ${entryPages.join(", ")}`
);

const bootstrap = fs.readFileSync(
  path.join(root, "docs/assets/guide-bootstrap-workflow.js"),
  "utf8"
);
requireCondition(
  bootstrap.includes("goHomeWithChapter ? null : requested || null"),
  "편을 지정하지 않았을 때 특정 편으로 강제 이동하는 로직이 남아 있습니다."
);
requireCondition(
  bootstrap.includes('await loadScript("assets/global-home.js")'),
  "편 미지정 진입에서 통합 홈을 불러오지 않습니다."
);
requireCondition(
  !bootstrap.includes("requested?.available ? requested : fallback"),
  "기존 제1편 폴백이 남아 있습니다."
);

const globalHome = fs.readFileSync(
  path.join(root, "docs/assets/global-home.js"),
  "utf8"
);
requireCondition(
  globalHome.includes("config.chapters.map(chapterCard)"),
  "통합 홈이 편 카드를 설정에서 생성하지 않습니다."
);
// 분야 카드는 그 자리에서 업무 목록을 펼치고, 업무를 고르면 곧바로 처리 단계로 갑니다.
requireCondition(
  globalHome.includes("window.GUIDE_HOME_OPEN_CHAPTER"),
  "통합 홈이 지정된 분야를 펼치지 않습니다."
);
requireCondition(
  globalHome.includes("data-toggle-chapter") && globalHome.includes('aria-expanded="false"'),
  "분야 카드가 그 자리에서 펼쳐지는 방식이 아닙니다."
);
requireCondition(
  globalHome.includes("#work=${encodeURIComponent("),
  "업무를 선택했을 때 처리 단계로 바로 가지 않습니다."
);
requireCondition(
  !globalHome.includes("웹판 이용 가능") && !globalHome.includes("웹판 준비 중"),
  "분야 카드에 불필요한 상태 라벨이 남아 있습니다."
);
requireCondition(
  globalHome.includes('breadcrumbWrap.hidden = true'),
  "통합 홈에서 '홈' 한 칸만 남는 이동 경로가 숨겨지지 않습니다."
);
requireCondition(
  globalHome.includes('desktopChapterLink.textContent = "업무 분야"'),
  "통합 홈의 상단 메뉴가 업무 분야로 바뀌지 않습니다."
);
requireCondition(
  !globalHome.includes("9개 업무"),
  "통합 홈에 제1편의 9개 업무 안내가 남아 있습니다."
);

for (const filename of ["index.html"]) {
  const html = stripAssetVersions(
    fs.readFileSync(path.join(root, "docs", filename), "utf8")
  );
  requireCondition(
    html.includes('href="assets/global-home.css"'),
    `${filename}에 통합 홈 스타일이 연결되지 않았습니다.`
  );
  requireCondition(
    html.includes("data-global-home") && !html.includes('href="?chapter=01#overview"'),
    `${filename}의 브랜드 홈이 제1편으로 고정되어 있습니다.`
  );
  requireCondition(
    html.includes("data-current-chapter>전체 업무"),
    `${filename}의 초기 문맥 표시가 전체 업무가 아닙니다.`
  );
}

const chapterApp = fs.readFileSync(
  path.join(root, "docs/assets/app-faithful-workflow.js"),
  "utf8"
);
requireCondition(
  chapterApp.includes("function globalHomeHref()") &&
    chapterApp.includes('escapeHtml(globalHomeHref())'),
  "편별 화면의 홈 이동이 19개 편 통합 홈으로 연결되지 않습니다."
);

// 업무 '목록'에는 검색 카드용 긴 설명(소제목 나열)을 쓰면 안 됩니다.
// 목록 칸마다 여섯 줄씩 늘어져 한 번 사고가 났습니다. 홈과 분야 대화상자 모두 봅니다.
for (const asset of ["global-home.js", "header-v3.js"]) {
  const source = fs.readFileSync(path.join(root, "docs/assets", asset), "utf8");
  requireCondition(
    !source.includes("item.description"),
    `${asset}가 업무 목록에 검색용 긴 설명을 그대로 씁니다.`
  );
  requireCondition(
    source.includes("세부 ${item.steps}단계"),
    `${asset}의 업무 목록에 '세부 N단계' 표시가 없습니다.`
  );
}

// 검색은 검색 단추나 Enter를 눌렀을 때만 결과를 바꿔야 합니다.
// 치는 동안 바뀌면 읽는 중에 결과가 사라져 오히려 불편합니다.
// 찾을 자료 종류도 고를 수 있어야 합니다.
for (const asset of ["global-home.js", "app-faithful-workflow.js"]) {
  const source = fs.readFileSync(path.join(root, "docs/assets", asset), "utf8");
  requireCondition(
    !source.includes('searchInput.addEventListener("input"'),
    `${asset}가 글자를 칠 때마다 검색 결과를 바꿉니다.`
  );
  requireCondition(
    source.includes("SEARCH_SCOPES") && source.includes("function bindSearchFilters()"),
    `${asset}에 찾을 자료 종류 고르기가 없습니다.`
  );
  requireCondition(
    source.includes("search-result-kind"),
    `${asset}의 검색 결과에 자료 종류 표시가 없습니다.`
  );
}

for (const filename of ["index.html"]) {
  const html = stripAssetVersions(
    fs.readFileSync(path.join(root, "docs", filename), "utf8")
  );
  for (const scope of ["all", "manual", "faq", "form"]) {
    requireCondition(
      html.includes(`data-search-scope="${scope}"`),
      `${filename}에 '${scope}' 검색 종류 버튼이 없습니다.`
    );
  }
}

// 상단의 분야 선택 창도 홈과 같은 방식으로 업무를 펼쳐 보여야 합니다.
const header = fs.readFileSync(path.join(root, "docs/assets/header-v3.js"), "utf8");
requireCondition(
  header.includes("data-dialog-chapter") && header.includes('aria-expanded="false"'),
  "분야 선택 창이 그 자리에서 펼쳐지는 방식이 아닙니다."
);
requireCondition(
  header.includes("#work=${encodeURIComponent("),
  "분야 선택 창에서 업무를 고를 때 처리 단계로 바로 가지 않습니다."
);
requireCondition(
  !header.includes("준비 중") && !header.includes('"현재 편"'),
  "분야 선택 창에 불필요한 상태 라벨이 남아 있습니다."
);
requireCondition(
  header.includes("function worksOf("),
  "분야 선택 창이 분야별 업무 목록을 만들지 않습니다."
);

for (const filename of ["index.html"]) {
  const html = stripAssetVersions(
    fs.readFileSync(path.join(root, "docs", filename), "utf8")
  );
  requireCondition(
    html.includes('id="chapter-dialog-note"'),
    `${filename}의 분야 선택 창 안내 문구가 갱신되지 않습니다.`
  );
  requireCondition(
    !html.includes("제1편 시범 콘텐츠만"),
    `${filename}에 제1편만 제공한다는 옛 안내가 남아 있습니다.`
  );
}

// 이용자에게 보이는 문구에 편 수 같은 내부 기준 표현이 없어야 합니다.
const jargon = ["19개 편", "제19편", "전체 19개"];
for (const filename of ["index.html"]) {
  const html = stripAssetVersions(
    fs.readFileSync(path.join(root, "docs", filename), "utf8")
  );
  for (const word of jargon) {
    requireCondition(!html.includes(word), `${filename}에 내부 기준 표현 '${word}'이 남아 있습니다.`);
  }
  const navSearchButtons = (
    html.match(/<nav class="global-nav"[\s\S]*?<\/nav>/)?.[0].match(/data-open-search/g) || []
  ).length;
  requireCondition(
    navSearchButtons === 1,
    `${filename}의 상단 메뉴에 같은 검색창을 여는 버튼이 ${navSearchButtons}개 있습니다.`
  );
  requireCondition(
    !html.includes("편을 선택하세요"),
    `${filename}에 '편을 선택하세요' 문구가 남아 있습니다.`
  );
}
for (const asset of ["global-home.js", "header-v3.js", "guide-bootstrap-workflow.js"]) {
  const source = fs.readFileSync(path.join(root, "docs/assets", asset), "utf8");
  for (const word of jargon) {
    requireCondition(!source.includes(word), `${asset}에 내부 기준 표현 '${word}'이 남아 있습니다.`);
  }
}

console.log(
  "global home valid: 19 chapters, no default chapter, integrated search and chapter entry checked"
);
