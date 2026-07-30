const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "docs/assets/chapter1-data.js"), "utf8"),
  context
);
vm.runInContext(
  fs.readFileSync(path.join(root, "docs/assets/structured-details.js"), "utf8"),
  context
);

const data = context.window.CHAPTER1_DATA;
const renderer = context.window.GUIDE_DETAIL_RENDERER;
const allBlocks = data.sections.flatMap((section) => section.contentBlocks);
const byId = new Map(allBlocks.map((block) => [block.id, block]));

const formation = renderer.render(byId.get("p3-b3"));
requireCondition(formation.type === "text", "문서 성립 블록이 텍스트로 렌더링되지 않았습니다.");
requireCondition(
  formation.html.includes("방식으로 결재함으로써 성립"),
  "문서 성립 문장의 PDF 줄바꿈이 결합되지 않았습니다."
);
requireCondition(
  formation.html.includes("있은 날로부터 5일이 경과된 때"),
  "공고문서 효력 발생 문장의 PDF 줄바꿈이 결합되지 않았습니다."
);
const formationLevels = [...formation.html.matchAll(/--outline-level: (\d)/g)].map(
  (match) => Number(match[1])
);
requireCondition(
  JSON.stringify(formationLevels) === JSON.stringify([0, 0, 1, 1]),
  `문서 성립 계층이 올바르지 않습니다: ${formationLevels.join(",")}`
);

const drafting = renderer.render(byId.get("p3-b5"));
const draftingLevels = [...drafting.html.matchAll(/--outline-level: (\d)/g)].map(
  (match) => Number(match[1])
);
requireCondition(
  JSON.stringify(draftingLevels) === JSON.stringify([0, 1, 0, 0, 0]),
  `기안 일반사항 계층이 올바르지 않습니다: ${draftingLevels.join(",")}`
);

const documentTypes = renderer.render(byId.get("p3-b4"));
requireCondition(documentTypes.type === "table", "공문서 종류가 표로 렌더링되지 않았습니다.");
requireCondition(!documentTypes.html.includes("<caption"), "표의 빈 캡션 행이 남아 있습니다.");
requireCondition(
  documentTypes.html.includes('aria-label="공문서의 종류"'),
  "표의 접근성 이름이 없습니다."
);

for (const block of allBlocks) {
  if (!block.body) continue;
  const rendered = renderer.render(block);
  if (rendered.type !== "text") continue;
  const textSpans = [...rendered.html.matchAll(/class="source-outline-text">([^<]*)</g)];
  for (const [, text] of textSpans) {
    requireCondition(
      !/[\r\n]/.test(text),
      `${block.id}에 문장 중간 물리적 줄바꿈이 남아 있습니다.`
    );
  }
}

const css = fs.readFileSync(path.join(root, "docs/assets/structured-details.css"), "utf8");
requireCondition(
  css.includes('.source-full-detail[data-detail-type="table"] .source-full-content'),
  "표 전용 외부 여백 제거 규칙이 없습니다."
);
requireCondition(
  !css.includes(".source-criteria-table caption"),
  "표 캡션의 빈 행을 만들 수 있는 규칙이 남아 있습니다."
);

console.log(
  `detail rendering valid: ${allBlocks.length} chapter-1 blocks, hierarchy and table spacing checked`
);
