// 문장으로 검색해도 관련 있는 결과가 위에 오는지 확인합니다.
//
// 예전에는 모든 낱말이 한 항목에 다 있어야 통과하는 방식이라
// 문장으로 물으면 결과가 하나도 나오지 않았습니다.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");

const context = vm.createContext({ window: {} });
for (const file of [
  "assets/guide-config.js",
  "assets/chapter1-data.js",
  "assets/chapter3-data.js",
  "assets/guide-search-index.js",
  "assets/search-query.js",
]) {
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

// 실제로 이용자가 물을 법한 문장입니다.
// 각 문장마다 상위 5건 안에 반드시 있어야 하는 내용을 적어 둡니다.
const CASES = [
  { query: "공문서는 언제 효력이 발생하나요?", expect: "효력" },
  { query: "기록물 이관은 어떻게 하나요", expect: "기록물 이관" },
  { query: "육아휴직 신청 방법이 궁금합니다", expect: "육아휴직" },
  { query: "공인을 폐기하려면 어떻게 해야 하나요", expect: "공인" },
  { query: "근무성적평정 결과는 공개되나요?", expect: "근무성적평정" },
  { query: "사무인계인수는 언제 하나요", expect: "인계인수" },
  { query: "신원조사 대상이 누구인가요", expect: "신원조사" },
  { query: "휴직", expect: "휴직" },
];

let topFiveRelevant = 0;
let topFiveTotal = 0;

for (const { query, expect } of CASES) {
  const { results } = search.search(index, query);
  requireCondition(results.length > 0, `‘${query}’ 검색 결과가 없습니다.`);
  if (!results.length) continue;

  const topFive = results.slice(0, 5);
  const relevant = topFive.filter((entry) =>
    `${entry.item.title}${entry.item.text}`.includes(expect)
  ).length;
  topFiveRelevant += relevant;
  topFiveTotal += topFive.length;

  requireCondition(
    relevant > 0,
    `‘${query}’ 상위 5건에 ‘${expect}’ 관련 내용이 없습니다.`
  );
}

// 상위 결과의 관련도가 지나치게 떨어지면 순위 규칙이 망가진 것입니다.
const ratio = topFiveTotal ? topFiveRelevant / topFiveTotal : 0;
requireCondition(
  ratio >= 0.8,
  `상위 5건 관련도가 ${(ratio * 100).toFixed(0)}%입니다 (80% 이상이어야 함).`
);

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

const indexHtml = fs.readFileSync(path.join(docs, "index.html"), "utf8");
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
  `search quality valid: 문장 ${CASES.length}건 검색 성공, ` +
    `상위 5건 관련도 ${(ratio * 100).toFixed(0)}%, 따옴표·제외·조사 처리 확인`
);
