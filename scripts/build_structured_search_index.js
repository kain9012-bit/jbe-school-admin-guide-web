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
    results.push({
      chapterId: chapter.id,
      chapterLabel: chapter.label,
      chapterTitle: chapter.title,
      type: "업무",
      title: work.title,
      description: `${work.printedPages}쪽`,
      text: [
        work.title,
        ...work.contentBlocks.flatMap((block) => [block.title, block.body]),
      ].join("\n"),
      workId: work.id,
    });

    for (const block of work.contentBlocks) {
      const visibleTitle = /^매뉴얼 \d+쪽$/.test(block.title)
        ? `${work.title} · ${block.printedPage}쪽`
        : block.title;
      results.push({
        chapterId: chapter.id,
        chapterLabel: chapter.label,
        chapterTitle: chapter.title,
        type: "매뉴얼 원문",
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
