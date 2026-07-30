const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");
const context = vm.createContext({ window: {} });

function execute(relativePath) {
  const filePath = path.join(docs, relativePath);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
}

execute("assets/guide-config.js");
const chapters = context.window.GUIDE_CONFIG.chapters.filter((chapter) => chapter.available);
const index = [];

for (const chapter of chapters) {
  execute(chapter.dataScript);
  const data = context.window[chapter.dataGlobal];
  const chapterFields = {
    chapterId: chapter.id,
    chapterLabel: chapter.label,
    chapterTitle: chapter.title,
  };

  for (const work of data.sections) {
    const sourceText = work.sourcePages.map((page) => page.text).join(" ");
    index.push({
      ...chapterFields,
      type: "업무 원문",
      workId: work.id,
      title: work.title,
      description: `매뉴얼 ${work.printedPages}쪽 전체 내용`,
      text: `${work.title} ${sourceText}`,
    });

    for (const page of work.sourcePages) {
      index.push({
        ...chapterFields,
        type: "매뉴얼 페이지",
        workId: work.id,
        page: String(page.pdfPage),
        title: `${work.title} · 매뉴얼 ${page.printedPage}쪽`,
        description: page.text.replace(/\s+/g, " ").slice(0, 180),
        text: `${work.title} ${page.text}`,
      });
    }
  }

  for (const form of data.forms) {
    index.push({
      ...chapterFields,
      type: "서식·예시 원문",
      workId: form.sectionId,
      formId: form.id,
      title: `${form.id} ${form.title}`,
      description: form.content.replace(/\s+/g, " ").slice(0, 180),
      text: `${form.id} ${form.title} ${form.content}`,
    });
  }

  for (const faq of data.faqs) {
    const work =
      data.sections.find((section) => section.faqCategories.includes(faq.category)) ||
      data.sections[0];
    index.push({
      ...chapterFields,
      type: "FAQ 원문",
      workId: work.id,
      faqNumber: String(faq.number),
      title: faq.question,
      description: faq.answer.replace(/\s+/g, " ").slice(0, 180),
      text: `${faq.category} ${faq.question} ${faq.answer}`,
    });
  }
}

fs.writeFileSync(
  path.join(docs, "assets", "guide-search-index.js"),
  `window.GUIDE_SEARCH_INDEX = ${JSON.stringify(index, null, 2)};\n`,
  "utf8"
);
console.log(`Built ${index.length} source-faithful search entries from ${chapters.length} chapters.`);
