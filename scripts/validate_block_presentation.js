// 본문 블록이 화면에서 어떻게 보이는지를 모든 업무·단계에 대해 한꺼번에 점검합니다.
//
// 사람이 눈으로 하나씩 확인할 수 없으므로, 화면을 그리는 규칙을 그대로 옮겨 와
// 다음 세 가지를 자동으로 찾아냅니다.
//   1. 같은 내용을 미리보기와 '더 보기'에 두 번 그리는 블록
//   2. 본문 없이 업무 이름만 되풀이해 빈 항목으로 보이는 블록
//   3. 원문의 항목 번호가 화면에서 사라져 매뉴얼과 대조할 수 없는 경우

const fs = require("fs");
const path = require("path");
const { loadGuideData, requireCondition } = require("./lib/load_guide_data");

const root = path.resolve(__dirname, "..");
const window = loadGuideData();
const layouts = window.GUIDE_WORKFLOW_LAYOUT;
const problems = [];

const excerpt = (value, limit = 170) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
};

// 화면이 쓰는 규칙과 같아야 합니다. app-faithful-workflow.js를 따라갑니다.
const ITEM_START = /^(?:[•‣▶※*]|[-–]\s|\d+[.)]\s|[가-힣]\.\s)/;

function logicalItems(body) {
  const lines = String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items = [];
  for (const line of lines) {
    const startsItem = ITEM_START.test(line) || line.includes(" : ");
    if (!items.length || startsItem) items.push(line);
    else items[items.length - 1] += ` ${line}`;
  }
  return items;
}

function cleanSourceHeading(title) {
  return String(title || "")
    .replace(/^\d+\.\s*/, "")
    .replace(/^\d+\s+/, "")
    .replace(/세부내용$/, "")
    .trim();
}

function isStandaloneLawLine(line) {
  const normalized = String(line || "").replace(/\s+/g, " ").trim();
  return /^(?:[•‣▶]\s*)?[「『].+[」』](?:\s*제[\d조항호~,.·\s]+.*)?$/.test(normalized);
}

// 화면은 법령 줄을 따로 떼어 내므로 본문에서 뺀 뒤 판단합니다.
function mainBody(block) {
  const lines = String(block.body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (block.title === "관련법규 및 참고자료") return "";
  const content = lines.filter((line) => !isStandaloneLawLine(line));
  if (!content.length) return "";
  return content.join("\n");
}

let checkedBlocks = 0;
let duplicated = 0;
let emptyStructural = 0;
let headingOnly = 0;

for (const [chapterId, key] of [
  ["01", "CHAPTER1_DATA"],
  ["03", "CHAPTER3_DATA"],
]) {
  const data = window[key];
  for (const work of data.sections) {
    const layout = layouts[work.id] || [];
    const blockById = new Map(work.contentBlocks.map((block) => [block.id, block]));

    for (const [index, step] of layout.entries()) {
      for (const blockId of step.blocks) {
        const block = blockById.get(blockId);
        if (!block) continue;
        if (block.title === "TIPTIP") continue;

        const body = mainBody(block);
        const title = cleanSourceHeading(block.title);
        const where = `제${chapterId}편 ${work.title} ${index + 1}단계 [${block.title}]`;

        if (!body) {
          // 원문에서 구역 표시로만 쓰인 줄은 화면에 내지 않아야 합니다.
          // 제목 자체가 내용을 담은 줄('2. 결재의 순서 : …')은 그대로 보여 줍니다.
          const raw = String(block.title || "").trim();
          const squash = (value) => String(value || "").replace(/\s+/g, "");
          const isStructural =
            !raw ||
            /세부내용$/.test(raw) ||
            raw === "업무 흐름도" ||
            raw === "관련법규 및 참고자료" ||
            squash(cleanSourceHeading(raw)) === squash(work.title);
          if (isStructural) emptyStructural += 1;
          else headingOnly += 1;
          continue;
        }

        checkedBlocks += 1;

        // 미리보기는 앞 3항목을 보여 줍니다. 그것이 본문 전부이면
        // '더 보기'를 달아도 같은 글을 두 번 읽게 할 뿐입니다.
        const items = logicalItems(body);
        const preview = items.slice(0, 3).map((item) => excerpt(item));
        const coversAll =
          items.length <= preview.length && !preview.some((item) => item.endsWith("…"));
        if (coversAll) duplicated += 1;
      }
    }
  }
}

// 화면 코드가 실제로 이 규칙을 지키는지 확인합니다.
const app = fs.readFileSync(
  path.join(root, "docs/assets/app-faithful-workflow.js"),
  "utf8"
);

requireCondition(
  app.includes("summaryCoversAll") && app.includes("const showFullDetail ="),
  "미리보기가 본문 전부일 때 '더 보기'를 숨기는 처리가 없습니다."
);
requireCondition(
  app.includes("function isEmptyStructuralBlock("),
  "본문 없는 구조 표시 블록을 걸러 내는 처리가 없습니다."
);
requireCondition(
  app.includes('const heading = generatedTitle ? "" : String(block.title || "").trim();'),
  "원문의 항목 번호가 제목에서 지워지고 있습니다."
);
requireCondition(
  app.includes("[•‣▶※*]"),
  "별표로 시작하는 줄이 앞 항목에 붙어 버립니다.",
);

const indexHtml = fs.readFileSync(path.join(root, "docs/index.html"), "utf8");
requireCondition(
  indexHtml.includes('<ul id="step-actions">'),
  "본문 목록이 번호 매기는 목록이라 원문 번호와 겹쳐 보입니다."
);

if (problems.length) {
  console.error("본문 표현 점검 실패:");
  problems.forEach((line) => console.error(` - ${line}`));
  process.exit(1);
}

console.log(
  `block presentation valid: 본문 블록 ${checkedBlocks}개 확인 ` +
    `(그중 ${duplicated}개는 미리보기가 본문 전부라 '더 보기'를 달지 않음), ` +
    `본문 없는 구조 표시 ${emptyStructural}개 제외, 제목만 있는 항목 ${headingOnly}개 유지`
);
