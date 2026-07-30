const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const outputDir = path.join(__dirname, "..", "tmp", "structured-ui");
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await desktop.goto("http://127.0.0.1:8792/?chapter=01#overview", {
    waitUntil: "networkidle",
  });
  await desktop.screenshot({
    path: path.join(outputDir, "chapter1-overview.png"),
    fullPage: true,
  });
  await desktop.goto("http://127.0.0.1:8792/?chapter=01#work=official-documents", {
    waitUntil: "networkidle",
  });
  await desktop.screenshot({
    path: path.join(outputDir, "chapter1-official-documents.png"),
    fullPage: false,
  });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto("http://127.0.0.1:8792/?chapter=03#work=status-rights", {
    waitUntil: "networkidle",
  });
  await mobile.screenshot({
    path: path.join(outputDir, "chapter3-status-rights-mobile.png"),
    fullPage: false,
  });

  await browser.close();
  console.log(outputDir);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
