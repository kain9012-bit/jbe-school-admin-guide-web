// 검증 스크립트가 공통으로 쓰는 데이터 적재기입니다.
// 브라우저에서 화면이 쓰는 것과 같은 순서로 자료를 읽어 window 객체를 만듭니다.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "../..");
const docs = path.join(root, "docs");

const ASSET_ORDER = [
  "assets/guide-config.js",
  "assets/chapter1-data.js",
  "assets/chapter1-steps.js",
  "assets/chapter3-data.js",
  "assets/chapter3-steps.js",
  "assets/workflow-layout.js",
  "assets/form-assets.js",
  "assets/guide-search-index.js",
];

function loadGuideData() {
  const context = vm.createContext({ window: {} });
  for (const relativePath of ASSET_ORDER) {
    const filePath = path.join(docs, relativePath);
    vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  }
  return context.window;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

// 화면의 buildWorkflow가 지키는 규칙을 그대로 확인합니다.
// 모든 본문 블록은 의미 단계 중 정확히 한 곳에만 배치되어야 합니다.
function checkWorkflowLayout(work, layout) {
  requireCondition(
    Array.isArray(layout) && layout.length > 0,
    `${work.title}: 의미 단계 배치가 없습니다.`
  );

  const blockIds = new Set(work.contentBlocks.map((block) => block.id));
  const assigned = layout.flatMap((step) => step.blocks);

  const duplicates = assigned.filter((id, index) => assigned.indexOf(id) !== index);
  requireCondition(
    duplicates.length === 0,
    `${work.title}: 두 단계에 중복 배치된 블록 ${[...new Set(duplicates)].join(", ")}`
  );

  const unknown = assigned.filter((id) => !blockIds.has(id));
  requireCondition(
    unknown.length === 0,
    `${work.title}: 존재하지 않는 블록 배치 ${unknown.join(", ")}`
  );

  // 화면이 단계로 쓰지 않는 블록은 배치 대상에서 제외합니다.
  // 원문 흐름도 자체를 담은 블록과 본문이 없는 흐름도 안내가 여기에 해당합니다.
  const isSourceFlowBlock = (block) =>
    work.flowGroups.some(
      (flow) =>
        flow.sourceText === block.body &&
        flow.pdfPage === block.pdfPage &&
        flow.printedPage === block.printedPage
    );
  const substantive = work.contentBlocks.filter(
    (block) => !isSourceFlowBlock(block) && !(block.title === "업무 흐름도" && !block.body)
  );
  const missing = substantive
    .map((block) => block.id)
    .filter((id) => !assigned.includes(id));
  requireCondition(
    missing.length === 0,
    `${work.title}: 어느 단계에도 배치되지 않은 본문 블록 ${missing.join(", ")}`
  );

  for (const step of layout) {
    requireCondition(
      typeof step.title === "string" && step.title.trim().length > 0,
      `${work.title}: 제목이 없는 단계가 있습니다.`
    );
    requireCondition(Array.isArray(step.blocks), `${work.title}/${step.title}: 블록 목록 없음`);
    // 원문 흐름도에만 있고 본문 설명이 없는 단계는 빈 단계로 둡니다.
    // 흐름도가 없는 업무에서는 빈 단계가 나올 수 없습니다.
    requireCondition(
      step.blocks.length > 0 || work.flowGroups.length > 0,
      `${work.title}/${step.title}: 흐름도 근거 없이 본문이 빈 단계입니다.`
    );
  }

  return layout.length;
}

module.exports = { root, docs, loadGuideData, requireCondition, checkWorkflowLayout };
