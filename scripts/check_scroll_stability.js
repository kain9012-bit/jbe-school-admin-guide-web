// 단계를 바꿀 때 보던 위치가 그대로 유지되는지 실제 브라우저로 확인합니다.
// 같은 업무 안에서 단계만 옮기면 화면이 움직이지 않아야 하고,
// 다른 업무로 가면 처음부터 보도록 맨 위로 올라가야 합니다.
//
// 사용법: docs를 정적 서버로 띄운 뒤
//   python3 -m http.server 8899 --directory docs
//   node scripts/check_scroll_stability.js [기준주소]

const { chromium } = require("playwright");

const base = process.argv[2] || "http://127.0.0.1:8899";
const problems = [];

async function main() {
  const browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  // 브라우저가 대상 요소를 화면 안으로 끌어오지 않도록 요소에서 직접 클릭합니다.
  // 그래야 사람이 눈에 보이는 버튼을 누르는 상황과 같아집니다.
  async function clickInPlace(selector) {
    await page.$eval(selector, (element) => element.click());
    await page.waitForTimeout(1000);
  }

  async function trial({ label, url, selector, startAt, expect }) {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(700);
    if (startAt != null) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), startAt);
      await page.waitForTimeout(400);
    }
    const before = await page.evaluate(() => Math.round(window.scrollY));
    await clickInPlace(selector);
    const after = await page.evaluate(() => Math.round(window.scrollY));

    // 내용이 짧아져 브라우저가 스크롤을 줄이는 것은 정상으로 봅니다.
    const maxScroll = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    );
    const kept = Math.abs(after - before) <= 2 || after === maxScroll;

    if (expect === "keep" && !kept) {
      problems.push(`${label}: 보던 위치가 ${before} → ${after}로 움직였습니다.`);
    }
    if (expect === "top" && after !== 0) {
      problems.push(`${label}: 맨 위로 올라가야 하는데 ${after}에 있습니다.`);
    }
    console.log(`${label}: ${before} → ${after}`);
  }

  const chapter1 = `${base}/index.html?chapter=01#work=official-documents`;
  const chapter3 = `${base}/index.html?chapter=03#work=local-personnel`;

  await trial({
    label: "제1편 단계 버튼 이동",
    url: chapter1,
    selector: '.step-button[data-step-id="step-2"]',
    startAt: 300,
    expect: "keep",
  });
  await trial({
    label: "제1편 다음 단계 버튼",
    url: chapter1,
    selector: "#next-step",
    startAt: 900,
    expect: "keep",
  });
  await trial({
    label: "제1편 이전 단계 버튼",
    url: `${chapter1}&step=step-2`,
    selector: "#prev-step",
    startAt: 900,
    expect: "keep",
  });
  await trial({
    label: "제3편 단계 버튼 이동",
    url: chapter3,
    selector: '.step-button[data-step-id="step-1"]',
    startAt: 300,
    expect: "keep",
  });
  await trial({
    label: "다른 업무로 이동",
    url: chapter1,
    selector: '.lnb-btn[href*="k-edufine"]',
    startAt: 900,
    expect: "top",
  });

  // 단계를 바꾼 뒤에도 키보드 초점이 사라지지 않아야 합니다.
  await page.goto(chapter1, { waitUntil: "load" });
  await page.waitForTimeout(700);
  await page.$eval('.step-button[data-step-id="step-2"]', (element) => {
    element.focus();
    element.click();
  });
  await page.waitForTimeout(900);
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      inStepList: !!document.getElementById("step-list")?.contains(active),
      isActiveStep: active?.classList.contains("active") ?? false,
    };
  });
  if (!focused.inStepList || !focused.isActiveStep) {
    problems.push("단계를 바꾼 뒤 키보드 초점이 현재 단계 버튼에 남지 않습니다.");
  }
  console.log(`초점 유지: 단계 목록 안=${focused.inStepList}, 현재 단계=${focused.isActiveStep}`);

  if (consoleErrors.length) {
    problems.push(`콘솔 오류 ${consoleErrors.length}건: ${consoleErrors[0]}`);
  }

  await browser.close();

  console.log("\n===== 결과 =====");
  if (problems.length === 0) {
    console.log("스크롤 위치와 초점이 모두 안정적입니다.");
  } else {
    problems.forEach((line, index) => console.log(`${index + 1}. ${line}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
