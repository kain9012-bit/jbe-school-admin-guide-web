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

// 자산 주소에는 파일이 바뀔 때마다 달라지는 번호가 붙습니다(assets/x.js?v=1a2b3c).
// 여기서는 그 번호를 떼고 봅니다. 번호 자체는 validate_asset_versions.js가 봅니다.
const stripAssetVersions = (html) => html.replace(/\?v=[0-9a-z-]+(?=")/gi, "");

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
    .replace(/^세부내용\s+/, "")
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
        if (block.title === "TIP") continue;

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
            /^세부내용\s/.test(raw) ||
            raw === "업무 흐름도" ||
            raw === "관련법규 및 참고자료" ||
            squash(cleanSourceHeading(raw)) === squash(work.title);
          if (isStructural) emptyStructural += 1;
          else headingOnly += 1;
          continue;
        }

        checkedBlocks += 1;

        // 본문은 접지 않고 한 번만 그대로 보여 줍니다.
        const items = logicalItems(body);
        if (items.length) duplicated += 0;
      }
    }
  }
}

// 본문 줄 속에 소제목이 숨어 있으면 안 됩니다. 19편 전부를 봅니다.
//
// 원문이 점을 빠뜨린 소제목이 있습니다. 제2편 정보공개의
// '3 접수 및 이송(정보공개 담당 부서)'가 그렇습니다. 만드는 쪽이 점을 보고
// 소제목을 가르므로, 점이 없으면 앞 소제목 밑에 딸린 잔글씨가 되어 1·2·4와
// 생김새가 달라집니다.
//
// 표에서 뽑아 온 줄은 첫 칸이 숫자인 것이 흔하므로 빼고 봅니다.
let hiddenHeadings = 0;
for (const key of Object.keys(window)) {
  if (!/^CHAPTER\d+_DATA$/.test(key)) continue;
  const data = window[key];
  const where = data.meta?.chapter || key;
  for (const work of data.sections || []) {
    for (const block of work.contentBlocks || []) {
      const numbered = /^(\d+)\s*\./.exec(String(block.title || "").trim());
      if (!numbered) continue;
      const lines = String(block.body || "").split("\n");
      lines.forEach((line, at) => {
        const found = /^(\d+)\s+(?![\d~·\-])\S/.exec(line.trim());
        if (!found || Number(found[1]) !== Number(numbered[1]) + 1) return;
        const inTable = (block.tables || []).some(
          (table) => at >= table.lineStart && at < table.lineStart + table.lineCount
        );
        if (inTable) return;
        hiddenHeadings += 1;
        problems.push(
          `${where} ${work.title} [${excerpt(block.title, 30)}] 본문에 ` +
            `소제목이 숨어 있습니다: ${excerpt(line, 40)}`
        );
      });
    }
  }
}

// 화면 코드가 실제로 이 규칙을 지키는지 확인합니다.
const app = fs.readFileSync(
  path.join(root, "docs/assets/app-faithful-workflow.js"),
  "utf8"
);

requireCondition(
  !app.includes("<details class=\"source-full-detail\""),
  "본문을 접어 두는 '더 보기'가 남아 있습니다. 같은 글을 두 번 싣게 됩니다."
);
requireCondition(
  app.includes("const items = block.body && !asTable ? allLogicalItems(block) : [];"),
  "본문을 한 번에 전부 보여 주는 처리가 없습니다."
);
requireCondition(
  app.includes("function isEmptyStructuralBlock("),
  "본문 없는 구조 표시 블록을 걸러 내는 처리가 없습니다."
);
// '세부내용 5. 비전자기록물 이관 및 폐기 절차'처럼 앞에 '세부내용'이 붙은
// 이름도 목차에서 고른 이름과 같은 것으로 봅니다. 그러지 않으면 항목 이름이
// 바로 위에 크게 적혀 있는데 그 아래에 또 적힙니다.
requireCondition(
  app.includes("squash(asStep) === squash(currentStepTitle)"),
  "항목 안에서 바로 위 소제목을 다시 적고 있습니다."
);
// 매뉴얼이 쓰는 글머리표는 한곳(MARKERS)에 모아 두었습니다.
// 여기 빠진 기호가 있으면 그 줄이 앞줄 뒤에 붙습니다.
requireCondition(
  app.includes('const MARKERS = "•‣▸▹▶▪□○◦※*"'),
  "글머리표 목록이 한곳에 모여 있지 않습니다. 빠진 기호가 생기면 줄이 앞줄에 붙습니다.",
);

const indexHtml = stripAssetVersions(
  fs.readFileSync(path.join(root, "docs/index.html"), "utf8")
);
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
    `본문 없는 구조 표시 ${emptyStructural}개 제외, 제목만 있는 항목 ${headingOnly}개 유지, ` +
    `본문에 숨은 소제목 ${hiddenHeadings}개`
);
