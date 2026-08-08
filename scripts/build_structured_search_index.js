const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");

function loadWindowScript(file, context) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function description(text, limit = 260) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}…` : normalized;
}

const context = vm.createContext({ window: {} });
loadWindowScript(path.join(docs, "assets", "guide-config.js"), context);

const results = [];
for (const chapter of context.window.GUIDE_CONFIG.chapters.filter((item) => item.available)) {
  loadWindowScript(path.join(docs, chapter.dataScript), context);
  const data = context.window[chapter.dataGlobal];

  for (const work of data.sections) {
    // 업무 항목에 본문 전체를 다시 담으면 색인이 두 배로 불어나고,
    // 긴 글이 무조건 위로 올라와 순위가 뒤틀립니다. 업무를 알아보는 데
    // 필요한 만큼(업무 이름 + 소제목)만 담습니다.
    const subtitles = work.contentBlocks
      .map((block) => String(block.title || "").replace(/^세부내용\s+/, "").trim())
      .filter((title) => title && title !== "관련법규 및 참고자료" && title !== "TIP");
    results.push({
      chapterId: chapter.id,
      chapterLabel: chapter.label,
      chapterTitle: chapter.title,
      type: "업무",
      workTitle: work.title,
      title: work.title,
      // 검색 결과 카드에 그 업무가 무엇을 다루는지 한 줄로 보여 줍니다.
      // 예전에는 쪽수를 적었는데, 쪽 표시를 없앤 뒤로 'undefined쪽'만 남아 있었습니다.
      description: description(subtitles.join(" · "), 160),
      // 홈의 업무 목록에는 위 설명이 너무 깁니다. 카드가 여섯 줄로 늘어납니다.
      // 목록에서는 몇 단계짜리 업무인지만 보여 줍니다.
      steps: work.contentBlocks.filter((block) => /^세부내용\s/.test(String(block.title || "")))
        .length,
      text: [work.title, ...subtitles].join("\n"),
      workId: work.id,
    });

    for (const block of work.contentBlocks) {
      // 제목이 없는 칸도 있습니다. 검색 결과에 '본문'이라고만 뜨면
      // 무엇인지 알 수 없으므로 본문 첫머리를 제목 대신 씁니다.
      const visibleTitle = /^매뉴얼 \d+쪽$/.test(block.title)
        ? `${work.title} · ${block.printedPage}쪽`
        : block.title || description(block.body, 40);
      results.push({
        chapterId: chapter.id,
        chapterLabel: chapter.label,
        chapterTitle: chapter.title,
        type: "매뉴얼 원문",
      workTitle: work.title,
        title: visibleTitle,
        description: description(block.body || block.title),
        text: [work.title, block.title, block.body].join("\n"),
        workId: work.id,
        blockId: block.id,
      });
    }

    for (const formId of work.formIds) {
      const form = data.forms.find((item) => item.id === formId);
      if (!form) continue;
      results.push({
        chapterId: chapter.id,
        chapterLabel: chapter.label,
        chapterTitle: chapter.title,
        type: "서식·예시 원문",
      workTitle: work.title,
        title: `${form.id} ${form.title}`,
        description: description(form.content),
        text: [work.title, form.id, form.title, form.content].join("\n"),
        workId: work.id,
        formId: form.id,
      });
    }

    for (const faq of data.faqs.filter((item) => work.faqCategories.includes(item.category))) {
      results.push({
        chapterId: chapter.id,
        chapterLabel: chapter.label,
        chapterTitle: chapter.title,
        type: "FAQ 원문",
      workTitle: work.title,
        title: `Q${faq.number}. ${faq.question}`,
        description: description(faq.answer),
        text: [work.title, faq.category, faq.question, faq.answer].join("\n"),
        workId: work.id,
        faqNumber: String(faq.number),
      });
    }
  }
}

const output = `window.GUIDE_SEARCH_INDEX = ${JSON.stringify(results, null, 2)};\n`;
fs.writeFileSync(path.join(docs, "assets", "guide-search-index.js"), output, "utf8");
console.log(`검색 색인 ${results.length}건 생성`);
