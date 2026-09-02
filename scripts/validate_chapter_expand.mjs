// 분야 카드를 눌러 업무 목록을 펼쳐도 카드가 제자리에 있는지 브라우저로 봅니다.
//
// 무엇이 문제였나
//   분야 카드를 누르면 그 카드가 **한 줄을 통째로 차지**하도록 만들어 두었습니다.
//   그러면 누른 카드가 제 자리를 떠나 아래로 내려가고, 같은 줄에 있던 옆 카드도
//   따라 밀려납니다.
//
//     누르기 전   [제1편] [제2편] [제3편]
//     누른 뒤     [제1편]
//                 [제2편 ─────────────]   ← 제2편이 아래로 내려가고
//                 [제3편] [제4편] [제5편]  ← 제3편은 다음 줄로 밀려남
//
//   고른 카드가 눈앞에서 움직여 버리니, 어디를 눌렀는지 다시 찾아야 합니다.
//
// 어떻게 되어야 하나
//   줄 안의 카드 자리는 그대로 두고, 업무 목록만 **그 줄 아래**에 펼칩니다.
//
//     누른 뒤     [제1편] [제2편] [제3편]   ← 자리 그대로
//                 [업무 목록 ───────────]
//                 [제4편] [제5편] [제6편]
//
// 두 곳을 봅니다. 통합 홈의 분야 목록과, 머리글의 '업무 분야' 고르기 창입니다.
//
// 사용법: node scripts/validate_chapter_expand.mjs

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
  const port = 8883;
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

const problems = [];
let placesChecked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

// 카드 자리를 잽니다. 창을 스크롤해도 값이 흔들리지 않도록 문서 기준으로 셉니다.
const seats = (gridSelector, panelSelector) =>
  page.evaluate(
    ({ gridSelector, panelSelector }) => {
      const grid = document.querySelector(gridSelector);
      if (!grid) return null;
      const panels = [...grid.querySelectorAll(panelSelector)];
      const cards = [...grid.children].filter(
        (child) => !panels.some((panel) => panel === child || panel.contains(child))
      );
      const at = (node) => {
        const box = node.getBoundingClientRect();
        return {
          top: Math.round(box.top + window.scrollY),
          left: Math.round(box.left + window.scrollX),
          width: Math.round(box.width),
          bottom: Math.round(box.bottom + window.scrollY),
        };
      };
      const open = panels.find((panel) => !panel.hidden) || null;
      return { cards: cards.map(at), open: open ? at(open) : null };
    },
    { gridSelector, panelSelector }
  );

// 한 곳을 봅니다. 카드 하나를 눌러 자리가 그대로인지 잽니다.
async function check(where, gridSelector, panelSelector, cardIndex) {
  placesChecked += 1;
  const before = await seats(gridSelector, panelSelector);
  if (!before || before.cards.length < cardIndex + 1) {
    problems.push(`${where}: 분야 카드를 찾지 못했습니다.`);
    return;
  }
  // 창이 안 열렸으면 카드 자리가 모두 0이라 '움직이지 않았다'가 되어 버립니다.
  // 그러면 아무것도 지키지 못하므로 먼저 화면에 서 있는지부터 봅니다.
  if (!before.cards.some((seat) => seat.width > 0)) {
    problems.push(`${where}: 분야 카드가 화면에 서 있지 않습니다(창이 안 열렸습니다).`);
    return;
  }
  const row = before.cards
    .map((seat, index) => ({ ...seat, index }))
    .filter((seat) => seat.top === before.cards[cardIndex].top);

  await page.evaluate(
    ({ gridSelector, cardIndex, panelSelector }) => {
      const grid = document.querySelector(gridSelector);
      const panels = [...grid.querySelectorAll(panelSelector)];
      const cards = [...grid.children].filter(
        (child) => !panels.some((panel) => panel === child || panel.contains(child))
      );
      cards[cardIndex].querySelector("[aria-expanded]")?.click();
    },
    { gridSelector, cardIndex, panelSelector }
  );
  await page.waitForTimeout(500);

  const after = await seats(gridSelector, panelSelector);
  for (const seat of row) {
    const now = after.cards[seat.index];
    if (!now) {
      problems.push(`${where}: 같은 줄 ${seat.index + 1}번째 카드가 사라졌습니다.`);
      continue;
    }
    if (now.left !== seat.left || now.width !== seat.width) {
      problems.push(
        `${where}: ${seat.index + 1}번째 카드가 옆으로 움직였습니다` +
          ` (왼쪽 ${seat.left}→${now.left}px, 너비 ${seat.width}→${now.width}px).`
      );
    }
  }
  // 같은 줄 카드는 여전히 한 줄에 나란히 서야 합니다.
  const tops = new Set(row.map((seat) => after.cards[seat.index]?.top));
  if (tops.size > 1) {
    problems.push(
      `${where}: 같은 줄에 있던 카드 ${row.length}개가 ${tops.size}줄로 갈라졌습니다.`
    );
  }
  // 업무 목록은 그 줄 **아래**에 펼쳐져야 합니다.
  const rowBottom = Math.max(...row.map((seat) => after.cards[seat.index]?.bottom || 0));
  if (!after.open) {
    problems.push(`${where}: 업무 목록이 펼쳐지지 않았습니다.`);
  } else if (after.open.top < rowBottom - 2) {
    problems.push(
      `${where}: 업무 목록이 카드 줄 아래가 아니라 줄 안에 끼어 있습니다` +
        ` (목록 ${after.open.top}px, 줄 아래 ${rowBottom}px).`
    );
  }
}

// ① 통합 홈의 분야 목록
await page.goto(`${base}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(700);
await check("통합 홈 분야 목록", ".global-chapter-grid", ".global-work-panel", 1);

// ② 머리글의 '업무 분야' 고르기 창
// 업무를 하나 열어야 머리글에 '업무 분야' 단추가 섭니다.
// (통합 홈에서는 분야 목록이 이미 화면에 있어 그 단추를 감춥니다.)
await page.goto(`${base}/index.html?chapter=01#work=records`, { waitUntil: "load" });
await page.waitForTimeout(1200);
// 머리글에는 '업무 분야' 단추가 넓은 화면용·좁은 화면용 둘 있습니다.
// 지금 화면에 서 있는 것을 누릅니다.
await page.evaluate(() => {
  const button = [...document.querySelectorAll("[data-open-chapters]")].find(
    (one) => one.getBoundingClientRect().width > 0
  );
  if (button) button.click();
});
await page.waitForTimeout(500);
await check("업무 분야 고르기 창", "#chapter-grid", ".chapter-works", 1);

await browser.close();
if (server) server.kill();

console.log(`분야 목록 ${placesChecked}곳을 눌러 봤습니다.`);
if (problems.length) {
  problems.forEach((line) => console.log(`  ${line}`));
  console.log(`카드가 제자리를 떠난 곳 ${problems.length}군데`);
  process.exit(1);
}
console.log("분야 카드가 제자리에 있고 업무 목록만 그 줄 아래에 펼쳐집니다.");
