const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");

function execute(relativePath, context) {
  const filePath = path.join(docs, relativePath);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const context = vm.createContext({ window: {} });
execute("assets/guide-config.js", context);
execute("assets/chapter3-data.js", context);
execute("assets/chapter3-steps.js", context);
execute("assets/guide-search-index.js", context);

const config = context.window.GUIDE_CONFIG;
const data = context.window.CHAPTER3_DATA;
const workflows = context.window.CHAPTER3_STEPS;
const searchIndex = context.window.GUIDE_SEARCH_INDEX;
const chapter = config.chapters.find((item) => item.id === "03");

requireCondition(chapter?.available, "제3편이 공개 상태가 아닙니다.");
requireCondition(chapter.title === "인사관리", "제3편 제목이 올바르지 않습니다.");
requireCondition(data.sections.length === 5, `제3편 업무 수 오류: ${data.sections.length}`);
requireCondition(data.faqs.length === 19, `제3편 FAQ 수 오류: ${data.faqs.length}`);
requireCondition(data.forms.length === 21, `제3편 서식 수 오류: ${data.forms.length}`);

let stepCount = 0;
for (const work of data.sections) {
  const workflow = workflows[work.id];
  requireCondition(workflow, `업무 흐름 누락: ${work.id}`);
  requireCondition(workflow.steps.length >= 3, `업무 단계 부족: ${work.id}`);
  requireCondition(work.body.length >= 400, `원문 내용 부족: ${work.id}`);
  for (const step of workflow.steps) {
    stepCount += 1;
    requireCondition(step.actions.length >= 3, `할 일 부족: ${work.id}/${step.id}`);
    requireCondition(step.checks.length >= 3, `확인사항 부족: ${work.id}/${step.id}`);
    requireCondition(step.basis.length >= 1, `근거 누락: ${work.id}/${step.id}`);
    requireCondition(/PDF\s+\d+/.test(step.pages), `PDF 페이지 누락: ${work.id}/${step.id}`);
  }
}
requireCondition(stepCount === 23, `제3편 단계 수 오류: ${stepCount}`);

for (const relativePath of Object.values(data.downloads)) {
  const filePath = path.join(docs, relativePath);
  requireCondition(fs.existsSync(filePath) && fs.statSync(filePath).size > 0, `다운로드 누락: ${relativePath}`);
}

const chapterEntries = searchIndex.filter((item) => item.chapterId === "03");
requireCondition(chapterEntries.length === 68, `제3편 검색 항목 수 오류: ${chapterEntries.length}`);
requireCondition(
  chapterEntries.filter((item) => item.type === "자주 묻는 질문").length === 19,
  "제3편 FAQ 검색 항목이 19건이 아닙니다."
);
requireCondition(
  chapterEntries.some(
    (item) =>
      item.type === "업무 단계" &&
      item.workId === "performance-appraisal" &&
      item.stepId === "submit" &&
      item.text.includes("가점")
  ),
  "근무성적평정 자료 제출 단계가 검색 색인에 없습니다."
);
requireCondition(
  chapterEntries.some(
    (item) =>
      item.type === "자주 묻는 질문" &&
      item.faqNumber === 13 &&
      item.title.includes("해외여행")
  ),
  "휴직 중 해외여행 FAQ가 검색 색인에 없습니다."
);
requireCondition(
  chapterEntries.some(
    (item) =>
      item.type === "서식·예시" &&
      item.title.includes("육아휴직 신청 공문") &&
      item.workId === "status-rights"
  ),
  "육아휴직 신청 공문이 관련 단계에 연결되지 않았습니다."
);

console.log(
  JSON.stringify(
    {
      chapter: `${chapter.label} ${chapter.title}`,
      works: data.sections.length,
      steps: stepCount,
      faqs: data.faqs.length,
      forms: data.forms.length,
      chapterSearchEntries: chapterEntries.length,
      totalSearchEntries: searchIndex.length,
    },
    null,
    2
  )
);
