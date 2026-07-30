const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const errors = [];
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  desktop.on("console", (message) => {
    if (message.type() === "error") errors.push(`desktop console: ${message.text()}`);
  });
  desktop.on("pageerror", (error) => errors.push(`desktop page: ${error.message}`));

  await desktop.goto("http://127.0.0.1:8792/index-v3.html", { waitUntil: "networkidle" });
  await desktop.waitForSelector(".work-card");

  const brandBox = await desktop.locator(".guide-global-header .guide-brand").boundingBox();
  const searchBox = await desktop.getByRole("button", { name: "통합검색", exact: true }).boundingBox();
  const pdfBox = await desktop.getByRole("link", { name: "원문 PDF", exact: true }).first().boundingBox();
  const downloadBox = await desktop.getByRole("link", { name: "자료 내려받기", exact: true }).boundingBox();

  await desktop.locator("[data-open-chapters]").first().click();
  const chapterPicker = {
    items: await desktop.locator("#chapter-grid .chapter-item").count(),
    current: await desktop.locator("#chapter-grid .is-current").count(),
    planned: await desktop.locator("#chapter-grid .is-planned").count()
  };
  await desktop.locator("[data-close-chapters]").click();

  const desktopResult = {
    brandLeft: Math.round(brandBox.x),
    sameLine:
      Math.abs(searchBox.y - pdfBox.y) < 4 &&
      Math.abs(searchBox.y - downloadBox.y) < 4 &&
      Math.abs(searchBox.y - brandBox.y) < 8,
    workCards: await desktop.locator(".work-card").count(),
    oldHeaderRows: await desktop.locator(".header-branding, .krds-main-menu").count(),
    chapterPicker
  };

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("console", (message) => {
    if (message.type() === "error") errors.push(`mobile console: ${message.text()}`);
  });
  mobile.on("pageerror", (error) => errors.push(`mobile page: ${error.message}`));
  await mobile.goto("http://127.0.0.1:8792/index-v3.html", { waitUntil: "networkidle" });
  await mobile.locator("#global-menu-toggle").click();
  const mobileResult = {
    menuVisible: await mobile.locator("#mobile-global-nav").isVisible(),
    items: await mobile.locator("#mobile-global-nav .global-nav-item").count(),
    pageOverflow: await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  };

  const result = { desktop: desktopResult, mobile: mobileResult, errors };
  console.log(JSON.stringify(result, null, 2));

  const valid =
    desktopResult.brandLeft < 160 &&
    desktopResult.sameLine &&
    desktopResult.workCards === 9 &&
    desktopResult.oldHeaderRows === 0 &&
    chapterPicker.items === 19 &&
    chapterPicker.current === 1 &&
    chapterPicker.planned === 18 &&
    mobileResult.menuVisible &&
    mobileResult.items === 6 &&
    !mobileResult.pageOverflow &&
    errors.length === 0;

  await browser.close();
  if (!valid) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
