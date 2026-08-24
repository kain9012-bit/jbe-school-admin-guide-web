// 문장으로 검색해도 관련 있는 결과가 위에 오는지 확인합니다.
//
// 예전에는 모든 낱말이 한 항목에 다 있어야 통과하는 방식이라
// 문장으로 물으면 결과가 하나도 나오지 않았습니다.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 자산 주소에는 파일이 바뀔 때마다 달라지는 번호가 붙습니다(assets/x.js?v=1a2b3c).
// 여기서는 그 번호를 떼고 봅니다. 번호 자체는 validate_asset_versions.js가 봅니다.
const stripAssetVersions = (html) => html.replace(/\?v=[0-9a-z-]+(?=")/gi, "");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");

const context = vm.createContext({ window: {} });
for (const file of ["assets/guide-search-index.js", "assets/search-query.js"]) {
  const filePath = path.join(docs, file);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
}

const search = context.window.GUIDE_SEARCH;
const index = context.window.GUIDE_SEARCH_INDEX;
const problems = [];

function requireCondition(condition, message) {
  if (!condition) problems.push(message);
}

requireCondition(search && typeof search.search === "function", "검색 모듈이 없습니다.");
if (!search) {
  console.error(problems.join("\n"));
  process.exit(1);
}

// 이용자가 물을 법한 말과, 그때 맨 위에 나와야 하는 업무를 적어 둡니다.
// '상위 5건에 관련 내용이 하나라도 있으면 통과'로는 부족했습니다.
// 그 기준으로도 '연가'를 찾으면 정작 제4편 휴가가 28위에 있었습니다.
//   work  : 그 편의 어느 업무 묶음이 몇 위 안에 있어야 하는지
//   avoid : 절대 1위로 나오면 안 되는 것 (낱말 가운데를 스친 오답)
const CASES = [
  { query: "연가", chapter: "04", work: "휴가", within: 1 },
  { query: "출장비", chapter: "04", work: "출장", within: 3 },
  { query: "전보", chapter: "03", work: "지방공무원 인사", within: 3, avoid: "산업안전보건" },
  { query: "연말정산", chapter: "07", work: "연말정산", within: 1 },
  { query: "정보공개 청구 처리기간", chapter: "02", work: "행정정보공개", within: 1 },
  { query: "학교운영위원회 위원 선출", chapter: "10", work: "구성", within: 3 },
  { query: "급식비 징수", chapter: "09", work: "학교급식", within: 1 },
  { query: "물품 불용 처분", chapter: "12", work: "불용", within: 3 },
  { query: "석면", chapter: "13", work: "석면", within: 1 },
  // 수당 계산은 제7편 보수작업에도 걸립니다. 오히려 그쪽이 더 맞는 답입니다.
  // 제4편은 초과근무 '복무'(명령·확인)를, 제7편은 시간외근무수당 '계산법'을
  // 다룹니다. 제7편 표를 제대로 싣고 나서 그쪽이 1위가 되었습니다.
  // 제4편도 함께 보여야 하므로 3위까지 봅니다.
  { query: "초과근무 수당은 어떻게 계산하나요", chapter: "04", work: "초과근무", within: 3 },
  { query: "기록물 이관은 어떻게 하나요", chapter: "01", work: "기록물", within: 3 },
  { query: "육아휴직 신청 방법이 궁금합니다", chapter: "03", work: "신분 및 권익보장", within: 1 },
  { query: "근무성적평정 결과는 공개되나요?", chapter: "03", work: "근무성적평정", within: 1 },
  { query: "신원조사 대상이 누구인가요", chapter: "01", work: "신원조사", within: 3 },
];

for (const item of CASES) {
  const { results } = search.search(index, item.query, { limit: 300 });
  requireCondition(results.length > 0, `‘${item.query}’ 검색 결과가 없습니다.`);
  if (!results.length) continue;

  const groups = search.groupByWork(results);
  const at = groups.findIndex(
    (group) =>
      group.work.chapterId === item.chapter && String(group.work.title).includes(item.work)
  );
  requireCondition(
    at >= 0 && at < item.within,
    `‘${item.query}’ → 제${item.chapter}편 ‘${item.work}’이 ${
      at < 0 ? "결과에 없습니다" : `${at + 1}위입니다 (${item.within}위 안이어야 함)`
    }. 지금 1위: ${groups[0] ? groups[0].work.chapterLabel + " " + groups[0].work.title : "-"}`
  );

  if (item.avoid) {
    requireCondition(
      !String(groups[0].work.title).includes(item.avoid),
      `‘${item.query}’ 1위가 ‘${item.avoid}’입니다. 낱말 가운데를 스친 오답입니다.`
    );
  }
}

// 매뉴얼에 없는 말은 없다고 해야 합니다.
// 두 글자 조각만 스쳐도 결과로 인정하면 '성과상여금'에 73건이 나왔습니다.
// '성과상여금'은 여기서 뺐습니다. 제5편 참고2(공무원 비위사건 처리기준)에
// '성과상여금, 가족수당, 육아휴직수당 등을 거짓이나 부정한 방법으로 지급받은
// 경우'라는 줄이 실제로 있습니다. 서식까지 색인에 담고 나서 드러났습니다.
for (const query of ["출산장려금", "반려동물"]) {
  const { total } = search.search(index, query);
  requireCondition(
    total === 0,
    `‘${query}’은 매뉴얼에 없는 말인데 ${total}건이 나옵니다.`
  );
}

// 점수가 모두 같으면 순위가 사실상 제목 가나다순이 됩니다.
{
  const { results } = search.search(index, "계약", { limit: 20 });
  const distinct = new Set(results.map((entry) => entry.score.toFixed(3))).size;
  requireCondition(
    distinct >= 5,
    `‘계약’ 상위 20건의 점수 종류가 ${distinct}가지뿐입니다. 순위가 매겨지지 않습니다.`
  );
}

// 맞은 자리를 잘라 보여 줄 수 있어야 합니다.
{
  const pieces = search.snippet(
    "앞부분 설명입니다. 연가일수는 재직기간에 따라 다릅니다. 뒷부분입니다.",
    "연가"
  );
  requireCondition(pieces.some((piece) => piece.hit), "발췌에서 맞은 자리를 찾지 못합니다.");
}

// 따옴표로 묶으면 그 순서 그대로 있는 것만 나와야 합니다.
{
  const exact = search.search(index, '"기록물 이관"');
  requireCondition(exact.results.length > 0, "따옴표 정확검색 결과가 없습니다.");
  requireCondition(
    exact.results.every((entry) =>
      `${entry.item.title} ${entry.item.text}`
        .toLocaleLowerCase("ko-KR")
        .includes("기록물 이관")
    ),
    "따옴표로 묶었는데 그 구문이 없는 결과가 섞여 있습니다."
  );
  const loose = search.search(index, "기록물 이관");
  requireCondition(
    exact.total < loose.total,
    "따옴표 정확검색이 일반 검색보다 결과를 좁히지 못합니다."
  );
}

// 빼기표를 붙인 낱말은 결과에서 빠져야 합니다.
{
  const excluded = search.search(index, "휴직 -육아");
  requireCondition(
    excluded.results.every(
      (entry) => !`${entry.item.title} ${entry.item.text}`.includes("육아")
    ),
    "제외 검색인데 해당 낱말이 든 결과가 남아 있습니다."
  );
}

// 조사가 붙어도 찾아야 합니다. 이것이 두 글자씩 끊는 이유입니다.
{
  const withParticle = search.search(index, "이관은");
  requireCondition(
    withParticle.results.length > 0,
    "조사가 붙은 낱말(‘이관은’)로 검색되지 않습니다."
  );
}

// 두 화면이 같은 검색 규칙을 쓰는지 확인합니다.
for (const asset of ["global-home.js", "app-faithful-workflow.js"]) {
  const source = fs.readFileSync(path.join(docs, "assets", asset), "utf8");
  requireCondition(
    source.includes("window.GUIDE_SEARCH.search("),
    `${asset}가 공통 검색 규칙을 쓰지 않습니다.`
  );
  requireCondition(
    !source.includes("function scoreResult("),
    `${asset}에 옛 검색 규칙이 남아 있습니다.`
  );
}

const indexHtml = stripAssetVersions(fs.readFileSync(path.join(docs, "index.html"), "utf8"));
requireCondition(
  indexHtml.includes("assets/search-query.js"),
  "index.html에 검색 규칙이 연결되지 않았습니다."
);

if (problems.length) {
  console.error("검색 품질 점검 실패:");
  problems.forEach((line) => console.error(` - ${line}`));
  process.exit(1);
}

console.log(
  `search quality valid: 질의 ${CASES.length}건 모두 기대한 업무가 위에 있음, ` +
    `없는 말은 0건, 따옴표·제외·조사·발췌 처리 확인`
);
