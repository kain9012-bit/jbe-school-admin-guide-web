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
  css.includes(".source-criteria-table ul,") &&
    css.includes("font: inherit !important;"),
  "표 내부 목록이 표 본문 글자 서식을 상속하지 않습니다."
);
requireCondition(
  css.includes(".source-criteria-table ul {") &&
    css.includes("padding-left: 0 !important;"),
  "표 내부 다중 행의 불필요한 목록 들여쓰기가 남아 있습니다."
);
requireCondition(
  app.includes('class="faq-list-icon" aria-hidden="true">Q</span>'),
  "FAQ 목록 제목 표지가 없습니다."
);
requireCondition(
  app.includes("function parseFaqContent(answer)") &&
    app.includes('class="faq-question-card" aria-label="질문 내용"'),
  "원문에 포함된 실제 질문 내용을 분리하는 구조가 없습니다."
);
requireCondition(
  app.includes('class="faq-role-badge answer">답변</span>'),
  "FAQ 답변 표지가 없습니다."
);
requireCondition(
  app.includes('class="faq-answer-meta"') &&
    app.includes('line.match(/^【([^】]+)】'),
  "FAQ 관련 규정·부서 분리 구조가 없습니다."
);
requireCondition(
  app.includes('aria-labelledby="${panelId}-button"'),
  "FAQ 답변 패널이 질문 버튼과 연결되지 않았습니다."
);
requireCondition(
  css.includes(".faq-question-card,") &&
    css.includes(".faq-answer-card {"),
  "FAQ 질문·답변 카드 스타일이 없습니다."
);

console.log("table and FAQ UI valid: typography, labels, metadata, accessibility checked");
