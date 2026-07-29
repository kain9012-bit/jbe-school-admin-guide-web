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

  const result = { overview, detail, search, errors };
  console.log(JSON.stringify(result, null, 2));
  const valid =
    overview.workCards === 9 &&
    detail.steps >= 4 &&
    detail.actionItems >= 2 &&
    detail.rawTextVisible === 0 &&
    search.results > 0 &&
    search.exactStepLinks > 0 &&
    errors.length === 0;

  await browser.close();
  if (!valid) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
