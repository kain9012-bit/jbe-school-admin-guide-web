const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
requireCondition(
  JSON.stringify(
    config.chapters.filter((chapter) => chapter.available).map((chapter) => chapter.id)
  ) === JSON.stringify(["01", "03"]),
  "현재 웹판 제공 편 표시가 제1·3편과 일치하지 않습니다."
);

const bootstrap = fs.readFileSync(
  path.join(root, "docs/assets/guide-bootstrap-workflow.js"),
  "utf8"
);
requireCondition(
  bootstrap.includes("const activeChapter = requested || null;"),
  "편을 지정하지 않았을 때 제1편으로 강제 이동하는 로직이 남아 있습니다."
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
  globalHome.includes("config.chapters.map(chapterCard)") &&
    globalHome.includes("학교행정업무 길라잡이 19개 편"),
  "통합 홈이 19개 편 카드를 설정에서 생성하지 않습니다."
);
requireCondition(
  globalHome.includes('href="?chapter=${encodeURIComponent(chapter.id)}#overview"'),
  "이용 가능한 편 카드가 편별 홈으로 연결되지 않습니다."
);
requireCondition(
  globalHome.includes('desktopChapterLink.textContent = "전체 편"'),
  "통합 홈의 상단 메뉴가 전체 편으로 바뀌지 않습니다."
);
requireCondition(
  !globalHome.includes("9개 업무"),
  "통합 홈에 제1편의 9개 업무 안내가 남아 있습니다."
);

for (const filename of ["index.html", "index-structured.html", "index-workflow.html"]) {
  const html = fs.readFileSync(path.join(root, "docs", filename), "utf8");
  requireCondition(
    html.includes('href="assets/global-home.css"'),
    `${filename}에 통합 홈 스타일이 연결되지 않았습니다.`
  );
  requireCondition(
    html.includes("data-global-home") && !html.includes('href="?chapter=01#overview"'),
    `${filename}의 브랜드 홈이 제1편으로 고정되어 있습니다.`
  );
  requireCondition(
    html.includes("data-current-chapter>전체 19개 편"),
    `${filename}의 초기 편 문맥이 전체 19개 편이 아닙니다.`
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

console.log(
  "global home valid: 19 chapters, no default chapter, integrated search and chapter entry checked"
);
