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

  await page.goto("http://127.0.0.1:8792/?chapter=01#overview", { waitUntil: "networkidle" });
  const chapter1 = {
    cards: await page.locator(".work-card").count(),
    policy: await page.locator(".source-policy").innerText(),
  };
  await page.locator(".work-card").first().click();
  await page.waitForSelector("#work-view:not([hidden])");
  const chapter1Detail = {
    title: await page.locator("#work-title").innerText(),
    pages: await page.locator(".source-page-card").count(),
    sourceCharacters: await page.locator(".source-page-text").first().innerText().then((text) => text.length),
    inventedStep: await page.getByText("문서 필요성 판단", { exact: true }).count(),
    forms: await page.locator(".source-form").count(),
  };

  await page.goto("http://127.0.0.1:8792/?chapter=01#work=official-seals&form=서식1", {
    waitUntil: "networkidle",
  });
  const form = {
    open: await page.locator("#form-서식1[open]").count(),
    contentLength: await page.locator("#form-서식1 .source-page-text").innerText().then((text) => text.length),
    fullFileLabel: await page.locator("#form-서식1").getByText("전체 서식·예시 원본 HWPX", { exact: true }).count(),
  };

  await page.goto("http://127.0.0.1:8792/?chapter=03#overview", { waitUntil: "networkidle" });
  const chapter3 = {
    cards: await page.locator(".work-card").count(),
    currentChapter: await page.locator("[data-current-chapter]").first().innerText(),
  };
  await page.locator("[data-open-search]:visible").last().click();
  await page.locator("#search-input").fill("휴직 중 해외여행");
  const search = {
    results: await page.locator(".search-result").count(),
    status: await page.locator("#search-status").innerText(),
  };

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto("http://127.0.0.1:8792/?chapter=03#work=status-rights", {
    waitUntil: "networkidle",
  });
  const mobileResult = {
    overflow: await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    ),
    pages: await mobile.locator(".source-page-card").count(),
    forms: await mobile.locator(".source-form").count(),
  };

  const result = { chapter1, chapter1Detail, form, chapter3, search, mobile: mobileResult, errors };
  console.log(JSON.stringify(result, null, 2));
  const valid =
    chapter1.cards === 9 &&
    chapter1.policy.includes("임의 설명") &&
    chapter1Detail.title === "공문서 관리" &&
    chapter1Detail.pages === 3 &&
    chapter1Detail.sourceCharacters > 500 &&
    chapter1Detail.inventedStep === 0 &&
    form.open === 1 &&
    form.contentLength > 50 &&
    form.fullFileLabel === 1 &&
    chapter3.cards === 5 &&
    chapter3.currentChapter.includes("제3편 인사관리") &&
    search.results > 0 &&
    search.status.includes("전체 편") &&
    mobileResult.overflow === 0 &&
    mobileResult.pages === 4 &&
    mobileResult.forms >= 7 &&
    errors.length === 0;

  await browser.close();
  if (!valid) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
