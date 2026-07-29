const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  await page.goto("http://127.0.0.1:8792/", { waitUntil: "networkidle" });
  const overview = {
    title: await page.title(),
    workCards: await page.locator(".work-card").count(),
    heroText: await page.locator(".hero-copy h1").innerText()
  };

  await page.locator(".work-card").first().click();
  await page.waitForSelector("#work-view:not([hidden])");
  const detail = {
    workTitle: await page.locator("#work-title").innerText(),
    steps: await page.locator(".step-button").count(),
    firstStep: await page.locator("#step-title").innerText(),
    actionItems: await page.locator("#step-actions li").count(),
    rawTextVisible: await page.getByText("매뉴얼 원문 텍스트", { exact: true }).count()
  };

  await page.locator("[data-open-search]").last().click();
  await page.locator("#search-input").fill("기록물 이관");
  await page.waitForTimeout(100);
  const search = {
    results: await page.locator(".search-result").count(),
    status: await page.locator("#search-status").innerText(),
    exactStepLinks: await page.locator('.search-result[href*="work=records"][href*="step=transfer"]').count()
  };

  await page.locator("#search-input").fill("\uc5c5\ubb34\uad00\ub9ac\uc2dc\uc2a4\ud15c \uc6b4\uc601 \uadfc\uac70");
  await page.waitForTimeout(100);
  const faqResult = page.locator('.search-result[href*="faq="]').first();
  const faqHref = await faqResult.getAttribute("href");
  await faqResult.click();
  await page.waitForSelector("#work-view:not([hidden])");
  const faq = {
    resultHref: faqHref,
    targetedItems: await page.locator(".accordion-item.faq-targeted").count(),
    expandedButtons: await page.locator('.faq-targeted .btn-accordion[aria-expanded="true"]').count(),
    visibleAnswerLength: await page.locator(".faq-targeted .accordion-body").innerText().then((text) => text.trim().length)
  };
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto("http://127.0.0.1:8792/", { waitUntil: "networkidle" });
  await mobilePage.locator("#hero-search-input").fill("\uc5c5\ubb34\uad00\ub9ac\uc2dc\uc2a4\ud15c \uc6b4\uc601 \uadfc\uac70");
  await mobilePage.locator("#hero-search-form").evaluate((form) => form.requestSubmit());
  await mobilePage.locator('.search-result[href*="faq="]').first().click();
  await mobilePage.waitForSelector(".faq-targeted .accordion-body");
  const mobile = {
    horizontalOverflow: await mobilePage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    ),
    visibleAnswerLength: await mobilePage.locator(".faq-targeted .accordion-body").innerText().then((text) => text.trim().length)
  };
  await mobilePage.close();

  const result = { overview, detail, search, faq, mobile, errors };
  console.log(JSON.stringify(result, null, 2));
  const valid =
    overview.workCards === 9 &&
    detail.steps >= 4 &&
    detail.actionItems >= 2 &&
    detail.rawTextVisible === 0 &&
    search.results > 0 &&
    search.exactStepLinks > 0 &&
    search.status.includes("\uc804\uccb4 \ud3b8") &&
    faq.resultHref?.includes("faq=") &&
    faq.targetedItems === 1 &&
    faq.expandedButtons === 1 &&
    faq.visibleAnswerLength > 0 &&
    mobile.horizontalOverflow === 0 &&
    mobile.visibleAnswerLength > 0 &&
    errors.length === 0;

  await browser.close();
  if (!valid) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
