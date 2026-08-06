// 제3편 인사관리 데이터가 현재 화면 구조에 맞는지 확인합니다.
// 화면은 CHAPTER3_DATA의 본문 블록을 GUIDE_WORKFLOW_LAYOUT의 의미 단계로 묶어 보여 줍니다.

const fs = require("fs");
const path = require("path");
const {
  docs,
  loadGuideData,
  requireCondition,
  checkWorkflowLayout,
} = require("./lib/load_guide_data");

const window = loadGuideData();
const config = window.GUIDE_CONFIG;
const data = window.CHAPTER3_DATA;
const sourceFlows = window.CHAPTER3_STEPS;
const layouts = window.GUIDE_WORKFLOW_LAYOUT;
const searchIndex = window.GUIDE_SEARCH_INDEX;

const chapter = config.chapters.find((item) => item.id === "03");
requireCondition(chapter?.available, "제3편이 공개 상태가 아닙니다.");
requireCondition(chapter.title === "인사관리", "제3편 제목이 올바르지 않습니다.");

requireCondition(data.sections.length === 5, `제3편 업무 수 오류: ${data.sections.length}`);
requireCondition(data.faqs.length === 19, `제3편 FAQ 수 오류: ${data.faqs.length}`);
requireCondition(data.forms.length === 21, `제3편 서식 수 오류: ${data.forms.length}`);

let stepCount = 0;
let blockCount = 0;

for (const work of data.sections) {
  requireCondition(
    Array.isArray(work.contentBlocks) && work.contentBlocks.length > 0,
    `본문 블록 누락: ${work.id}`
  );
  requireCondition(
    Array.isArray(sourceFlows[work.id]),
    `원문 흐름 정보 누락: ${work.id}`
  );
  requireCondition(
    /\d/.test(String(work.printedPages)),
    `원문 쪽 표기 누락: ${work.id}`
  );

  stepCount += checkWorkflowLayout(work, layouts[work.id]);
  blockCount += work.contentBlocks.length;

  for (const formId of work.formIds) {
    requireCondition(
      data.forms.some((form) => form.id === formId),
      `업무에 연결된 서식이 자료에 없습니다: ${work.id}/${formId}`
    );
  }
}

requireCondition(stepCount === 11, `제3편 소제목 수 오류: ${stepCount}`);
requireCondition(blockCount === 76, `제3편 본문 블록 수 오류: ${blockCount}`);

for (const relativePath of Object.values(data.downloads)) {
  const filePath = path.join(docs, relativePath);
  requireCondition(
    fs.existsSync(filePath) && fs.statSync(filePath).size > 0,
    `내려받기 파일 누락: ${relativePath}`
  );
}

const chapterEntries = searchIndex.filter((item) => item.chapterId === "03");
requireCondition(
  chapterEntries.length === 121,
  `제3편 검색 항목 수 오류: ${chapterEntries.length}`
);
requireCondition(
  chapterEntries.filter((item) => item.type === "FAQ 원문").length === data.faqs.length,
  "제3편 FAQ가 모두 검색 색인에 있지 않습니다."
);
requireCondition(
  chapterEntries.filter((item) => item.type === "업무").length === data.sections.length,
  "제3편 업무가 모두 검색 색인에 있지 않습니다."
);
requireCondition(
  chapterEntries.every((item) => data.sections.some((work) => work.id === item.workId)),
  "검색 색인이 존재하지 않는 업무를 가리킵니다."
);
requireCondition(
  chapterEntries.some(
    (item) => item.workId === "performance-appraisal" && item.text.includes("근무성적평정")
  ),
  "근무성적평정 내용이 검색 색인에 없습니다."
);

console.log(
  JSON.stringify(
    {
      chapter: `${chapter.label} ${chapter.title}`,
      works: data.sections.length,
      steps: stepCount,
      contentBlocks: blockCount,
      faqs: data.faqs.length,
      forms: data.forms.length,
      chapterSearchEntries: chapterEntries.length,
      totalSearchEntries: searchIndex.length,
    },
    null,
    2
  )
);
