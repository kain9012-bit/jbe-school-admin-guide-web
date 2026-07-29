const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const docsRoot = path.join(root, "docs");
const configPath = path.join(docsRoot, "assets", "guide-config.js");
const outputPath = path.join(docsRoot, "assets", "guide-search-index.js");

function executeScript(filePath, context) {
  const source = fs.readFileSync(filePath, "utf8");
  vm.runInContext(source, context, { filename: filePath });
}

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .trim();
}

function chapterFields(chapter) {
  return {
    chapterId: chapter.id,
    chapterLabel: chapter.label,
    chapterTitle: chapter.title
  };
}

function findFaqTarget(data, stepsByWork, faq) {
  const matchingWork =
    data.sections.find((work) => stepsByWork[work.id]?.faqCategories?.includes(faq.category)) ||
    data.sections[0];
  const steps = stepsByWork[matchingWork.id]?.steps || [];
  const faqText = normalize(`${faq.question} ${faq.answer}`);
  const rankedSteps = steps
    .map((step) => {
      const words = normalize(`${step.title} ${step.summary}`)
        .split(" ")
        .filter((word) => word.length >= 2);
      return {
        step,
        score: words.reduce((sum, word) => sum + (faqText.includes(word) ? 1 : 0), 0)
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    workId: matchingWork.id,
    stepId: rankedSteps[0]?.step.id || steps[0]?.id || ""
  };
}

function findFormTarget(data, stepsByWork, formId) {
  for (const work of data.sections) {
    const step = (stepsByWork[work.id]?.steps || []).find((candidate) =>
      (candidate.forms || []).includes(formId)
    );
    if (step) return { workId: work.id, stepId: step.id };
  }

  const firstWork = data.sections[0];
  return {
    workId: firstWork?.id || "",
    stepId: stepsByWork[firstWork?.id]?.steps?.[0]?.id || ""
  };
}

function buildChapterIndex(chapter, data, stepsByWork) {
  const chapterInfo = chapterFields(chapter);
  const entries = [];

  for (const work of data.sections) {
    const workflow = stepsByWork[work.id];
    if (!workflow?.steps?.length) continue;

    entries.push({
      ...chapterInfo,
      type: "\uc5c5\ubb34",
      workId: work.id,
      stepId: workflow.steps[0].id,
      title: work.title,
      description: workflow.intro,
      text: [work.title, workflow.intro, ...(work.keywords || [])].join(" ")
    });

    for (const step of workflow.steps) {
      entries.push({
        ...chapterInfo,
        type: "\uc5c5\ubb34 \ub2e8\uacc4",
        workId: work.id,
        stepId: step.id,
        title: `${work.title} \u00b7 ${step.title}`,
        description: step.summary,
        text: [
          work.title,
          step.title,
          step.summary,
          ...(step.actions || []),
          ...(step.checks || []),
          ...(step.cautions || []),
          ...(step.basis || []),
          ...(step.forms || [])
        ].join(" ")
      });
    }
  }

  for (const faq of data.faqs || []) {
    const target = findFaqTarget(data, stepsByWork, faq);
    entries.push({
      ...chapterInfo,
      type: "\uc790\uc8fc \ubb3b\ub294 \uc9c8\ubb38",
      ...target,
      faqNumber: faq.number,
      title: faq.question,
      description: faq.answer,
      text: `${faq.category} ${faq.question} ${faq.answer}`
    });
  }

  for (const form of data.forms || []) {
    const target = findFormTarget(data, stepsByWork, form.id);
    entries.push({
      ...chapterInfo,
      type: "\uc11c\uc2dd\u00b7\uc608\uc2dc",
      ...target,
      title: `${form.id} ${form.title}`,
      description: "\uad00\ub828 \uc5c5\ubb34 \ub2e8\uacc4\uc5d0\uc11c \uc0ac\uc6a9 \ubc29\ubc95\uacfc \ud568\uaed8 \ud655\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
      text: `${form.id} ${form.title} ${form.searchText || ""}`
    });
  }

  return entries;
}

const configContext = vm.createContext({ window: {} });
executeScript(configPath, configContext);
const availableChapters = configContext.window.GUIDE_CONFIG.chapters.filter(
  (chapter) => chapter.available
);
const index = [];

for (const chapter of availableChapters) {
  const context = vm.createContext({ window: {} });
  executeScript(path.join(docsRoot, chapter.dataScript), context);
  executeScript(path.join(docsRoot, chapter.stepsScript), context);
  const data = context.window[chapter.dataGlobal];
  const steps = context.window[chapter.stepsGlobal];
  if (!data || !steps) throw new Error(`Missing chapter data: ${chapter.id}`);
  index.push(...buildChapterIndex(chapter, data, steps));
}

const output = `window.GUIDE_SEARCH_INDEX = ${JSON.stringify(index, null, 2)};\n`;
fs.writeFileSync(outputPath, output, "utf8");
console.log(
  `Built ${index.length} search entries from ${availableChapters.length} chapter(s).`
);
