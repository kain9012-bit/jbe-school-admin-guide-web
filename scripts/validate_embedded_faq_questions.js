const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "docs/assets/chapter1-data.js"), "utf8"),
  context
);

function parseFaqContent(answer) {
  const contentLines = [];
  const metadata = [];
  String(answer || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      const metaMatch = line.match(/^【([^】]+)】\s*(.*)$/);
      if (metaMatch) metadata.push({ label: metaMatch[1], value: metaMatch[2] });
      else contentLines.push(line);
    });

  let questionLines = [];
  let answerLines = contentLines;
  if (/^질문\s*내용$/.test(contentLines[0] || "")) {
    const embedded = contentLines.slice(1);
    const blankIndex = embedded.findIndex((line) => !line);
    const answerStart =
      blankIndex >= 0
        ? blankIndex + 1
        : embedded.findIndex(
            (line, index) => index > 0 && /^[･․•‣▶○]\s*/.test(line)
          );
    if (answerStart >= 0) {
      const questionEnd = blankIndex >= 0 ? blankIndex : answerStart;
      questionLines = embedded.slice(0, questionEnd).filter(Boolean);
      answerLines = embedded.slice(answerStart).filter(Boolean);
    } else {
      questionLines = embedded.filter(Boolean);
      answerLines = [];
    }
  } else {
    answerLines = contentLines.filter(Boolean);
  }
  return { questionLines, answerLines, metadata };
}

const embeddedFaqs = context.window.CHAPTER1_DATA.faqs.filter((faq) =>
  /^질문\s*내용(?:\r?\n)/.test(faq.answer)
);

if (embeddedFaqs.length !== 7) {
  throw new Error(`내장 질문 형식 FAQ 수가 예상과 다릅니다: ${embeddedFaqs.length}`);
}

for (const faq of embeddedFaqs) {
  const parsed = parseFaqContent(faq.answer);
  if (!parsed.questionLines.length) {
    throw new Error(`${faq.question}: 실제 질문 내용이 분리되지 않았습니다.`);
  }
  if (!parsed.answerLines.length) {
    throw new Error(`${faq.question}: 실제 답변이 분리되지 않았습니다.`);
  }
  if (!parsed.metadata.some((item) => item.label === "관련 부서")) {
    throw new Error(`${faq.question}: 관련 부서가 분리되지 않았습니다.`);
  }
}

const target = embeddedFaqs.find((faq) => faq.question === '문서의 "끝"자 표시');
const parsedTarget = parseFaqContent(target.answer);
if (!parsedTarget.questionLines.join(" ").includes("굳이 1자를 띄우고")) {
  throw new Error('문서의 "끝"자 표시 FAQ의 질문 본문이 잘못 분리됐습니다.');
}
if (!parsedTarget.answerLines.join(" ").includes("제4조 제5항")) {
  throw new Error('문서의 "끝"자 표시 FAQ의 답변이 잘못 분리됐습니다.');
}

console.log("embedded FAQ questions valid: 7 questions separated from answers and metadata");
