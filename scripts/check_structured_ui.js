const { chromium } = require("playwright");

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

  await page.goto("http://127.0.0.1:8792/?chapter=01#overview", {
    waitUntil: "networkidle",
  });
  const chapter1 = {
    cards: await page.locator(".work-card").count(),
    title: await page.locator(".guide-hero h1").innerText(),
    rawDumpVisible: await page.locator(".source-verification[open]").count(),
  };

  await page.locator('a[href="#work=official-documents"]').click();
  await page.waitForSelector("#work-view:not([hidden])");
  const officialDocuments = {
    title: await page.locator("#work-title").innerText(),
    blocks: await page.locator(".structured-source-block").count(),
    flowText: await page.locator(".exact-flow-text").first().innerText(),
    inventedStep: await page.getByText("문서 필요성 판단", { exact: true }).count(),
    inferredBadges: await page.locator(".flow-link-badge").count(),
    verificationClosed: await page.locator(".source-verification:not([open])").count(),
  };

  await page.goto("http://127.0.0.1:8792/?chapter=01#work=handover", {
    waitUntil: "networkidle",
  });
  const handover = {
    flowText: await page.locator(".exact-flow-text").first().innerText(),
    noFlowMessage: await page.locator(".no-source-flow").count(),
  };

  await page.goto(
    "http://127.0.0.1:8792/?chapter=01#work=official-seals&form=%EC%84%9C%EC%8B%9D1",
    { waitUntil: "networkidle" }
  );
  const form = {
    open: await page.locator("#form-서식1[open]").count(),
    contentLength: await page
      .locator("#form-서식1 .source-page-text")
      .innerText()
      .then((text) => text.length),
    combinedFileLabel: await page
      .locator("#form-서식1")
      .getByText("교육청 제공 전체 서식·예시 원본 HWPX", { exact: true })
      .count(),
  };

  await page.goto("http://127.0.0.1:8792/?chapter=03#overview", {
    waitUntil: "networkidle",
  });
  const chapter3 = {
    cards: await page.locator(".work-card").count(),
    currentChapter: await page.locator("[data-current-chapter]").first().innerText(),
  };
  await page.locator("[data-open-search]:visible").last().click();
  await page.locator("#search-input").fill("휴직 중 해외여행");
  const search = {
    results: await page.locator(".search-result").count(),
    status: await page.locator("#search-status").innerText(),
    firstType: await page.locator(".search-result-meta").first().innerText(),
  };

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("console", (message) => {
    if (message.type() === "error") errors.push(`mobile console: ${message.text()}`);
  });
  mobile.on("pageerror", (error) => errors.push(`mobile page: ${error.message}`));
  await mobile.goto("http://127.0.0.1:8792/?chapter=03#work=status-rights", {
    waitUntil: "networkidle",
  });
  const mobileResult = {
    overflow: await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    ),
    blocks: await mobile.locator(".structured-source-block").count(),
    forms: await mobile.locator(".source-form").count(),
    flowText: await mobile.locator(".exact-flow-text").first().innerText(),
  };

  const result = {
    chapter1,
    officialDocuments,
    handover,
    form,
    chapter3,
    search,
    mobile: mobileResult,
    errors,
  };
  console.log(JSON.stringify(result, null, 2));

  const valid =
    chapter1.cards === 9 &&
    chapter1.title.includes("업무 흐름과 세부 내용") &&
    chapter1.rawDumpVisible === 0 &&
    officialDocuments.title === "공문서 관리" &&
    officialDocuments.blocks === 17 &&
    officialDocuments.flowText.includes("문서작성") &&
    officialDocuments.flowText.includes("등록") &&
    officialDocuments.inventedStep === 0 &&
    officialDocuments.inferredBadges === 0 &&
    officialDocuments.verificationClosed === 1 &&
    handover.flowText.includes("인사발령") &&
    handover.flowText.includes("비전자 등재") &&
    handover.noFlowMessage === 0 &&
    form.open === 1 &&
    form.contentLength > 100 &&
    form.combinedFileLabel === 1 &&
    chapter3.cards === 5 &&
    chapter3.currentChapter.includes("제3편 인사관리") &&
    search.results > 0 &&
    search.status.includes("검색 결과") &&
    search.firstType.includes("FAQ 원문") &&
    mobileResult.overflow === 0 &&
    mobileResult.blocks === 33 &&
    mobileResult.forms >= 7 &&
    mobileResult.flowText.includes("휴·복직") &&
    errors.length === 0;

  await browser.close();
  if (!valid) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
