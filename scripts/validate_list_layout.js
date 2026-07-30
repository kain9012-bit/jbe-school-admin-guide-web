const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(
  path.join(root, "docs/assets/app-faithful-workflow.js"),
  "utf8"
);
const css = fs.readFileSync(
  path.join(root, "docs/assets/structured-details.css"),
  "utf8"
);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

requireCondition(
  app.includes('class="semantic-summary-marker"') &&
    app.includes('class="semantic-summary-text"'),
  "요약 항목의 표식과 본문이 분리되지 않았습니다."
);
requireCondition(
  app.includes('class="basis-reference-list"') &&
    app.includes(".split(/\\r?\\n/)"),
  "근거 법령이 줄 단위 목록으로 분리되지 않았습니다."
);
requireCondition(
  css.includes(".semantic-summary-list {") &&
    css.includes("padding: 0 !important;"),
  "상위 요약 목록의 불필요한 기본 들여쓰기가 제거되지 않았습니다."
);
requireCondition(
  css.includes("grid-template-columns: 1.2rem minmax(0, 1fr);"),
  "항목의 표식과 본문을 분리하는 내어쓰기 열이 없습니다."
);
requireCondition(
  css.includes("margin-left: calc(var(--outline-level) * 1.8rem);"),
  "상세 항목의 단계별 들여쓰기 규칙이 없습니다."
);
requireCondition(
  css.includes(".basis-reference-list li::before"),
  "근거 목록의 줄별 표식이 없습니다."
);

console.log("list layout valid: hanging indents, hierarchy, and basis lines checked");
