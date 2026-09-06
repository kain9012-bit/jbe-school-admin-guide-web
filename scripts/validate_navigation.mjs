// 화면을 오가는 동작이 기대대로인지 브라우저로 확인합니다.
//
// '로고를 눌렀는데 아무 일도 안 일어난다' 같은 것은 코드만 봐서는 드러나지
// 않습니다. 주소가 같으면 브라우저가 아무것도 하지 않기 때문입니다.
//
// 사용법: node scripts/validate_navigation.mjs

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
  const port = 8866;
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
let checked = 0;
const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on("pageerror", (error) => problems.push(`화면 오류: ${String(error.message).slice(0, 90)}`));

const state = () =>
  page.evaluate(() => ({
    hash: location.hash,
    home: document.body.classList.contains("global-home-mode"),
    work: !document.getElementById("work-view").hidden,
    y: Math.round(window.scrollY),
    opened: [...document.querySelectorAll("[data-toggle-chapter][aria-expanded='true']")].length,
    dialogs: [...document.querySelectorAll("dialog[open]")].length,
  }));

function expect(condition, message) {
  checked += 1;
  if (!condition) problems.push(message);
}

// 1. 통합 홈에서 로고를 누르면 첫 화면으로 되돌아와야 합니다.
//    주소가 그대로라 브라우저가 아무것도 하지 않던 자리입니다.
await page.goto(`${base}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector('[data-toggle-chapter="05"]')?.click());
await page.waitForTimeout(350);
await page.evaluate(() => window.scrollTo(0, 1500));
await page.waitForTimeout(250);
await page.evaluate(() => document.querySelector("[data-global-home]").click());
await page.waitForTimeout(900);
{
  const now = await state();
  expect(now.y === 0, `홈에서 로고를 눌렀는데 맨 위로 가지 않습니다 (${now.y}px).`);
  expect(now.opened === 0, "홈에서 로고를 눌렀는데 펼쳐 둔 분야가 그대로입니다.");
}

// 2. 대화상자를 열어 둔 채 로고를 누르면 닫혀야 합니다.
await page.evaluate(() => document.querySelector("[data-open-search]").click());
await page.waitForTimeout(350);
await page.evaluate(() => document.querySelector("[data-global-home]").click());
await page.waitForTimeout(500);
expect((await state()).dialogs === 0, "로고를 눌렀는데 열려 있던 대화상자가 닫히지 않습니다.");

// 3. 업무 화면에서 로고를 누르면 통합 홈 첫 화면으로 가야 합니다.
await page.goto(`${base}/index.html?chapter=13#work=c13-w01`, { waitUntil: "load" });
await page.waitForTimeout(800);
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelector("[data-global-home]").click());
await page.waitForTimeout(1300);
{
  const now = await state();
  expect(now.home && !now.work, "업무 화면에서 로고를 눌러도 통합 홈으로 가지 않습니다.");
  expect(now.y === 0, `업무 화면에서 로고를 눌렀는데 맨 위가 아닙니다 (${now.y}px).`);
}

// 4. 분야 대화상자에서 지금 보고 있는 편의 업무를 고르면 대화상자가 닫혀야 합니다.
await page.goto(`${base}/index.html?chapter=13#work=c13-w01`, { waitUntil: "load" });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button,a")].find((node) =>
    node.textContent.includes("업무 분야")
  );
  if (button) button.click();
});
await page.waitForTimeout(350);
await page.evaluate(() => {
  const card = [...document.querySelectorAll("#chapter-grid .chapter-link")].find((node) =>
    node.textContent.includes("제13편")
  );
  if (card) card.click();
});
await page.waitForTimeout(450);
await page.evaluate(() => document.querySelector("#chapter-grid .chapter-works.is-open a")?.click());
await page.waitForTimeout(700);
{
  const now = await state();
  expect(now.dialogs === 0, "업무를 골랐는데 분야 대화상자가 닫히지 않습니다.");
  expect(now.work, "분야 대화상자에서 업무를 골랐는데 업무 화면이 열리지 않습니다.");
}

// 5. 같은 업무 안에서 소제목만 바꿀 때는 읽던 자리를 잃지 않아야 합니다.
await page.goto(`${base}/index.html?chapter=13#work=c13-w01`, { waitUntil: "load" });
await page.waitForTimeout(800);
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelectorAll("#step-list [data-step-id]")[1]?.click());
await page.waitForTimeout(500);
expect(
  Math.abs((await state()).y - 500) < 40,
  "소제목만 바꿨는데 읽던 자리가 사라집니다."
);

// 5-2. 아무리 내려도 머리글은 화면 맨 위에 붙어 있어야 합니다.
//      KRDS 기본 스타일이 body 높이를 화면 높이에 못 박아 두어(height:100%),
//      한 화면 남짓 내리면 붙박이 머리글이 body 상자 끝을 지나며 사라졌습니다.
//      옆의 업무 목록도 머리글에 가리면 제목 줄이 안 보입니다.
await page.goto(`${base}/index.html?chapter=13#work=c13-w01`, { waitUntil: "load" });
await page.waitForTimeout(900);
for (const down of [900, 900, 900]) {
  await page.mouse.wheel(0, down);
  await page.waitForTimeout(350);
}
{
  const now = await page.evaluate(() => {
    const header = document.getElementById("krds-header").getBoundingClientRect();
    const nav = document.querySelector(".krds-side-navigation");
    const style = nav ? getComputedStyle(nav) : null;
    return {
      y: Math.round(window.scrollY),
      top: Math.round(header.top),
      height: Math.round(header.height),
      // 업무 목록이 멈춰 서는 자리입니다. 목록이 화면보다 길면 끝까지 따라
      // 내려가므로 실제 위치가 아니라 이 멈춤선을 봅니다.
      besideStop: style && style.position === "sticky" ? parseFloat(style.top) : null,
    };
  });
  expect(
    now.y > 400,
    `머리글을 보려고 내렸는데 ${now.y}px밖에 안 내려갑니다. 확인이 안 됩니다.`
  );
  expect(
    now.top === 0,
    `${now.y}px 내렸더니 머리글이 ${now.top}px로 밀려 올라가 사라졌습니다.`
  );
  expect(
    now.besideStop === null || now.besideStop >= now.height,
    `업무 목록이 머리글에 가립니다 (멈춤선 ${now.besideStop}px, 머리글 높이 ${now.height}px).`
  );
}

// 5-3. 업무 화면 머리글은 비어 있으면 안 됩니다.
//      (예전에는 여기서 빵부스러기 '홈'과 머리글 항목이 같은 곳으로 가지
//       않는지도 보았으나, 빵부스러기 줄 자체를 걷어 냈습니다 — 위치는
//       배지·왼쪽 목록·큰 제목이 이미 말해 주고, 홈은 좌상단 로고가 갑니다.)
await page.goto(`${base}/index.html?chapter=02#work=c02-w01`, { waitUntil: "load" });
await page.waitForTimeout(900);
{
  const now = await page.evaluate(() => {
    const shown = (node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(node).display !== "none";
    };
    return {
      빵부스러기: !!document.querySelector(".krds-breadcrumb-wrap, .breadcrumb"),
      로고집: (document.querySelector(".guide-brand") || {}).getAttribute
        ? document.querySelector(".guide-brand").getAttribute("href")
        : null,
      차림표: [...document.querySelectorAll(".global-nav > *")].filter(shown).length,
    };
  });
  expect(now.빵부스러기 === false, "걷어 낸 빵부스러기 줄이 화면에 남아 있습니다.");
  expect(now.로고집 !== null, "좌상단 로고에 '홈'으로 돌아가는 링크가 없습니다.");
  expect(now.차림표 > 0, "업무 화면 머리글이 통째로 비었습니다.");
}

// 5-4. 통합 홈의 '업무 분야'는 남아 있어야 합니다. 거기서는 분야 목록으로 내려가는
//      유일한 길이라, 업무 화면에서 지우면서 같이 지우면 안 됩니다.
await page.goto(`${base}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(900);
{
  const link = await page.$(".global-nav [data-home-chapters]");
  expect(Boolean(link), "통합 홈 머리글에 '업무 분야'가 없습니다.");
  if (link) {
    await link.click();
    await page.waitForTimeout(700);
    expect(
      (await state()).y > 200,
      "통합 홈에서 '업무 분야'를 눌러도 분야 목록으로 내려가지 않습니다."
    );
  }
}

// 6. 없는 업무 주소로 들어오면 빈 화면 대신 홈으로 안내해야 합니다.
await page.goto(`${base}/index.html?chapter=04#work=no-such-work`, { waitUntil: "load" });
await page.waitForTimeout(900);
{
  const now = await state();
  expect(!now.work, "없는 업무 주소인데 빈 업무 화면이 나옵니다.");
}

// 7. 홈에서 업무를 고를 때, 가는 도중에 엉뚱한 화면이 비치면 안 됩니다.
//    예전에는 편 개요 화면이 0.7초쯤 먼저 보였다가 업무 화면으로 바뀌었습니다.
await page.goto(`${base}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(700);
await page.evaluate(() => document.querySelector('[data-toggle-chapter="13"]')?.click());
await page.waitForTimeout(400);
page.evaluate(() => document.querySelector(".global-work-panel.is-open a.global-work-link")?.click());
{
  let sawOverview = false;
  let reachedWork = false;
  for (let tries = 0; tries < 30 && !reachedWork; tries += 1) {
    await page.waitForTimeout(60);
    const seen = await page
      .evaluate(() => {
        const overview = document.getElementById("overview-view");
        const work = document.getElementById("work-view");
        return {
          overview: Boolean(overview) && !overview.hidden,
          work: Boolean(work) && !work.hidden,
          home: document.body.classList.contains("global-home-mode"),
        };
      })
      .catch(() => null);
    if (!seen) continue;
    // 통합 홈 화면이 아닌데 개요가 보이면, 그것이 스쳐 가는 엉뚱한 화면입니다.
    if (seen.overview && !seen.home) sawOverview = true;
    if (seen.work) reachedWork = true;
  }
  expect(reachedWork, "홈에서 업무를 골랐는데 업무 화면이 열리지 않습니다.");
  expect(!sawOverview, "홈에서 업무로 가는 도중에 편 개요 화면이 잠깐 비칩니다.");
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  console.error("화면 이동이 기대대로 되지 않습니다:");
  problems.forEach((line) => console.error(` - ${line}`));
  process.exit(1);
}

console.log(`navigation valid: 이동 동작 ${checked}가지 모두 정상`);
