const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:8792/", { waitUntil: "networkidle" });
  await page.screenshot({ path: "C:\\work\\jbe-school-admin-guide-web\\tmp\\overview-v2.png", fullPage: true });
  await page.goto("http://127.0.0.1:8792/#work=records&step=transfer", { waitUntil: "networkidle" });
  await page.screenshot({ path: "C:\\work\\jbe-school-admin-guide-web\\tmp\\records-transfer-v2.png", fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
