const { chromium } = require("playwright");

async function collectBlocks(page) {
  const stepIds = await page
    .locator("[data-step-id]")
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.stepId));
  const blocks = new Set();
  for (const stepId of stepIds) {
    await page.locator(`[data-step-id="${stepId}"]`).click();
    await page.waitForTimeout(30);
    for (const blockId of await page
      .locator("[data-source-block]")
      .evaluateAll((items) => items.map((item) => item.dataset.sourceBlock))) {
      blocks.add(blockId);
    }
  }
  return { steps: stepIds.length, blocks: blocks.size };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  const base =
    "file:///C:/work/jbe-school-admin-guide-web/docs/index-structured.html";
  await page.goto(`${base}?chapter=01#overview`, { waitUntil: "load" });
  await page.waitForSelector(".work-card");
  const chapter1Overview = {
    cards: await page.locator(".work-card").count(),
    heading: await page.locator(".guide-hero h1").innerText(),
    originalStepPanel: await page.locator("#step-panel").count(),
    structuredDump: await page.locator("#structured-content").count(),
  };

  await page.goto(`${base}?chapter=01#work=official-documents`, { waitUntil: "load" });
  await page.waitForSelector("#work-view:not([hidden])");
  const chapter1Documents = {
    title: await page.locator("#work-title").innerText(),
    flow: await page.locator(".workflow-source-note").innerText(),
    currentPanelText: await page.locator("#step-panel").innerText(),
    coverage: await collectBlocks(page),
  };

  await page.goto(`${base}?chapter=01#work=official-seals&form=서식1`, {
    waitUntil: "load",
  });
  await page.waitForSelector("#form-source-dialog[open]");
  const form = {
    title: await page.locator("#form-source-title").innerText(),
    contentLength: await page
      .locator("#form-source-content")
      .innerText()
      .then((text) => text.length),
    combinedOriginalLabel: await page
      .locator("#form-source-dialog")
      .getByText("전체 서식·예시 원본 HWPX", { exact: true })
      .count(),
  };

  await page.goto(`${base}?chapter=03#work=performance-appraisal`, {
    waitUntil: "load",
  });
  await page.waitForSelector("#work-view:not([hidden])");
  const chapter3Performance = {
    title: await page.locator("#work-title").innerText(),
    chapter: await page.locator("[data-current-chapter]").first().innerText(),
    flow: await page.locator(".workflow-source-note").innerText(),
    coverage: await collectBlocks(page),
  };

  await page.goto(`${base}?chapter=03#work=local-personnel`, { waitUntil: "load" });
  await page.waitForSelector("#work-view:not([hidden])");
  const chapter3Personnel = {
    note: await page.locator(".workflow-source-note").innerText(),
    coverage: await collectBlocks(page),
  };

  await page.goto(`${base}?chapter=03#overview`, { waitUntil: "load" });
  await page.locator("[data-open-search]:visible").last().click();
  await page.locator("#search-input").fill("휴직 중 해외여행");
  const search = {
    results: await page.locator(".search-result").count(),
    status: await page.locator("#search-status").innerText(),
  };

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (error) => errors.push(`mobile page: ${error.message}`));
  await mobile.goto(`${base}?chapter=03#work=status-rights`, { waitUntil: "load" });
  await mobile.waitForSelector("#work-view:not([hidden])");
  const mobileResult = {
    overflow: await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    ),
    steps: await mobile.locator("[data-step-id]").count(),
    hasPanel: await mobile.locator("#step-panel").count(),
  };

  const htmlText = await page.locator("body").innerText();
  const result = {
    chapter1Overview,
    chapter1Documents,
    form,
    chapter3Performance,
    chapter3Personnel,
    search,
    mobile: mobileResult,
    inventedStepVisible: htmlText.includes("문서 필요성 판단"),
    errors,
  };
  console.log(JSON.stringify(result, null, 2));

  const valid =
    chapter1Overview.cards === 9 &&
    chapter1Overview.heading.includes("업무의 시작부터 마무리까지") &&
    chapter1Overview.originalStepPanel === 1 &&
    chapter1Overview.structuredDump === 0 &&
    chapter1Documents.title === "공문서 관리" &&
    chapter1Documents.flow.includes("문서작성 ▶ 검토·협조·결재") &&
    chapter1Documents.coverage.steps === 4 &&
    chapter1Documents.coverage.blocks === 15 &&
    !chapter1Documents.currentPanelText.includes("업무의 목적과 수신 대상을 확인합니다.") &&
    form.title.includes("서식1 공인대장") &&
    form.contentLength > 1000 &&
    form.combinedOriginalLabel === 1 &&
    chapter3Performance.chapter.includes("제3편 인사관리") &&
    chapter3Performance.coverage.steps === 5 &&
    chapter3Performance.coverage.blocks === 8 &&
    chapter3Personnel.note.includes("원문에 별도 흐름도가 없어") &&
    chapter3Personnel.coverage.blocks === 21 &&
    search.results > 0 &&
    mobileResult.overflow === 0 &&
    mobileResult.steps === 3 &&
    mobileResult.hasPanel === 1 &&
    result.inventedStepVisible === false &&
    errors.length === 0;

  await browser.close();
  if (!valid) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
