// 한 줄에 나란히 놓인 카드끼리 높이가 같은지 실제 브라우저로 봅니다.
//
// 이름이 두 줄인 카드 하나 때문에 그 줄만 키가 달라지는 일이 잦습니다.
//   '부패행위신고 처리 및 신고자 보호 제도'  ← 이 카드만 아래로 튀어나옵니다
// 눈으로는 카드가 수십 개라 반드시 놓칩니다. 그래서 기계로 잽니다.
//
// 사용법: node scripts/validate_card_heights.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("playwright가 없어 건너뜁니다. npm install --omit=optional playwright");
  process.exit(0);
}

async function alive(url) {
  try {
    const answer = await fetch(`${url}/index.html`, { signal: AbortSignal.timeout(1200) });
    return answer.ok;
  } catch {
    return false;
  }
}

let base = process.argv.find((value) => value.startsWith("http")) || "http://127.0.0.1:8899";
let server = null;
if (!(await alive(base))) {
  const { spawn } = await import("node:child_process");
  const port = 8879;
  base = `http://127.0.0.1:${port}`;
  server = spawn("python3", ["-m", "http.server", String(port), "--directory", "docs"], {
    cwd: root,
    stdio: "ignore",
  });
  for (let tries = 0; tries < 20; tries += 1) {
    await new Promise((done) => setTimeout(done, 250));
    if (await alive(base)) break;
  }
  if (!(await alive(base))) {
    server.kill();
    console.log("웹 서버를 띄우지 못해 건너뜁니다.");
    process.exit(0);
  }
}

// 같은 줄에 있는지는 화면에서의 위쪽 좌표로 판단합니다.
// 카드가 몇 열인지 CSS를 읽지 않아도 되고, 화면 폭이 바뀌어도 그대로 통합니다.
const measure = (selector) => `
  (() => {
    const rows = new Map();
    for (const node of document.querySelectorAll(${JSON.stringify(selector)})) {
      const box = node.getBoundingClientRect();
      if (!box.height) continue;
      const key = Math.round(box.top);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({
        height: Math.round(box.height),
        label: (node.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 24),
      });
    }
    return [...rows.entries()].map(([top, cards]) => ({ top, cards }));
  })()
`;

const problems = [];
let rowsChecked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

async function check(where, selector) {
  const rows = await page.evaluate(measure(selector));
  for (const row of rows) {
    if (row.cards.length < 2) continue;
    rowsChecked += 1;
    const heights = row.cards.map((card) => card.height);
    const gap = Math.max(...heights) - Math.min(...heights);
    // 1픽셀 차이는 반올림 때문입니다. 그 이상은 눈에 보입니다.
    if (gap > 1) {
      const tallest = row.cards.reduce((a, b) => (a.height >= b.height ? a : b));
      problems.push(
        `${where}: 한 줄 카드 ${row.cards.length}개의 높이가 ${gap}px 어긋납니다 ` +
          `(${heights.join("/")}px, 가장 큰 것 '${tallest.label}')`
      );
    }
  }
}

// 1. 홈의 분야 카드
await page.goto(`${base}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(600);
await check("홈 분야 카드", ".global-chapter-grid > .global-chapter-item > .global-chapter-card");

// 2. 홈에서 분야를 펼쳤을 때의 업무 카드 (편마다 다릅니다)
for (const chapterId of ["01", "05", "13", "16"]) {
  await page.evaluate((id) => {
    const button = document.querySelector(`[data-toggle-chapter="${id}"]`);
    if (button) button.click();
  }, chapterId);
  await page.waitForTimeout(450);
  await check(`홈 제${chapterId}편 업무 카드`, ".global-work-panel.is-open .global-work-link");
}

// 3. 머리글 '업무 분야' 대화상자
await page.goto(`${base}/index.html?chapter=03#work=status-rights`, { waitUntil: "load" });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button,a")].find((node) =>
    node.textContent.includes("업무 분야")
  );
  if (button) button.click();
});
await page.waitForTimeout(400);
await check("분야 대화상자 카드", "#chapter-grid > .chapter-item > .chapter-link");
for (const chapterId of ["05", "13"]) {
  await page.evaluate((id) => {
    const card = [...document.querySelectorAll("#chapter-grid .chapter-link")].find((node) =>
      node.textContent.includes(`제${Number(id)}편`)
    );
    if (card) card.click();
  }, chapterId);
  await page.waitForTimeout(450);
  await check(`대화상자 제${chapterId}편 업무 카드`, ".chapter-works.is-open a");
}

// 4. 편 개요의 업무 카드
await page.goto(`${base}/index.html?chapter=13#work=c13-w01`, { waitUntil: "load" });
await page.waitForTimeout(800);
await page.evaluate(() => {
  location.hash = "overview";
});
await page.waitForTimeout(600);
await check("편 개요 업무 카드", "#work-grid > .work-card");

await browser.close();
if (server) server.kill();

if (problems.length) {
  console.error("한 줄에 놓인 카드끼리 높이가 다릅니다:");
  problems.slice(0, 15).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 15) console.error(` … 외 ${problems.length - 15}건`);
  process.exit(1);
}

console.log(`card heights valid: 카드 줄 ${rowsChecked}개, 같은 줄끼리 높이 같음`);
