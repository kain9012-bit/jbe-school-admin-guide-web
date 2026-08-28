// 한 줄에 나란히 놓인 카드끼리 높이가 같은지 실제 브라우저로 봅니다.
// 절차의 단계 상자도 함께 봅니다. 글이 두 줄인 단계만 아래로 튀어나오면
// 절차가 층계처럼 보입니다.
//
// 이름이 두 줄인 카드 하나 때문에 그 줄만 키가 달라지는 일이 잦습니다.
//   '부패행위신고 처리 및 신고자 보호 제도'  ← 이 카드만 아래로 튀어나옵니다
// 눈으로는 카드가 수십 개라 반드시 놓칩니다. 그래서 기계로 잽니다.
//
// 사용법: node scripts/validate_card_heights.mjs

import { existsSync, readFileSync } from "node:fs";
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

// 절차의 단계는 따로 잽니다.
//
// 눈에 보이는 상자는 단계 칸(source-flow-step)이 아니라 그 안에 그려진
// 것입니다. 칸 자체는 줄 높이만큼 늘어나 있어 늘 키가 같습니다.
// 그리고 칸은 안의 것을 위아래 가운데에 놓으므로, 키가 다른 상자는 위쪽
// 좌표까지 달라집니다. 위쪽 좌표로 줄을 묶으면 그런 상자가 저 혼자 한 줄이
// 되어 셈에서 빠집니다. 줄은 '한 덩어리(source-flow-item)'의 위쪽 좌표로
// 묶고, 키는 눈에 보이는 상자에서 잽니다.
const measureFlow = `
  (() => {
    const rows = new Map();
    for (const item of document.querySelectorAll("#step-actions .source-flow-item")) {
      const step = item.querySelector(".source-flow-step");
      if (!step) continue;
      // 한 단계 안에 상자가 둘로 나뉘어 있으면(제12편 '4. 물품취득 후
      // 출급절차') 눈에 보이는 것은 상자 하나가 아니라 그 묶음입니다.
      // 상자 하나만 재면 둘로 나뉜 단계가 늘 절반 키로 잡힙니다.
      const stack = item.querySelector(".source-flow-stack");
      // 표로 그린 단계는 표를 담은 상자가 눈에 보이는 테두리입니다.
      // 표 자체를 재면 그 상자의 테두리 두께만큼 늘 두 픽셀이 모자랍니다.
      const shown =
        stack ||
        (step.getAttribute("data-table") === "1"
          ? step.querySelector(".source-table-scroll")
          : step);
      if (!shown) continue;
      const box = shown.getBoundingClientRect();
      if (!box.height) continue;
      const key = Math.round(item.getBoundingClientRect().top);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({
        height: Math.round(box.height),
        label: (shown.innerText || "").replace(/\s+/g, " ").trim().slice(0, 24),
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
  await look(where, await page.evaluate(measure(selector)));
}

async function look(where, rows) {
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

// 4. 절차의 단계 상자
//
// 원문이 상자와 화살표로 이어 둔 절차를 화면에서도 이어서 그립니다
// (structured-details.js의 flowMarkup). 한 줄에 나란히 선 단계는 키가
// 같아야 합니다. 안 맞추면 글이 두 줄인 단계만 아래로 튀어나와 절차가
// 층계처럼 보입니다.
// 절차가 있는 업무는 하나도 빼지 않고 다 봅니다. 편마다 하나씩만 골라
// 봤더니, 하필 고른 것이 다 단정해서 어긋난 자리를 놓쳤습니다.
const withFlows = [];
for (let id = 1; id <= 19; id += 1) {
  const file = path.join(root, "docs", "assets", `chapter${id}-data.js`);
  if (!existsSync(file)) continue;
  const box = {};
  new Function("window", readFileSync(file, "utf8"))(box);
  const data = box[`CHAPTER${id}_DATA`];
  for (const section of data.sections || []) {
    const many = (section.contentBlocks || []).some((block) =>
      (block.tables || []).some((table) => table.flow && (table.flow.steps || []).length >= 2)
    );
    if (!many) continue;
    withFlows.push({ chapter: String(id).padStart(2, "0"), work: section.id });
  }
}

let flowRows = 0;
for (const { chapter, work } of withFlows) {
  await page.goto(`${base}/index.html?chapter=${chapter}#work=${work}`, { waitUntil: "load" });
  await page.waitForTimeout(500);
  const steps = await page.evaluate(() =>
    [...document.querySelectorAll("#step-list [data-step-id]")].map((node) =>
      node.getAttribute("data-step-id")
    )
  );
  for (const step of steps.length ? steps : [""]) {
    await page.goto(
      `${base}/index.html?chapter=${chapter}#work=${work}${step ? `&step=${step}` : ""}`,
      { waitUntil: "load" }
    );
    await page.waitForTimeout(350);
    const found = await page.evaluate(
      () => document.querySelectorAll("#step-actions .source-flow-step").length
    );
    if (!found) continue;
    flowRows += 1;
    await look(`제${chapter}편 ${work} 절차 단계`, await page.evaluate(measureFlow));
  }
}

// 5. 편 개요의 업무 카드
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

console.log(
  `card heights valid: 카드 줄 ${rowsChecked}개, 같은 줄끼리 높이 같음 ` +
    `(그 가운데 절차 단계 ${flowRows}곳)`
);
