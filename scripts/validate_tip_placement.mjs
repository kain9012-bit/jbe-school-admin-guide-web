// TIP·주의사항이 원문에 놓인 그 자리에 그려지는지 확인합니다.
//
// 매뉴얼에서 TIP 상자는 바로 앞 항목에 딸린 말입니다.
//
//   1. 급여 작업 전 확인사항(초과근무확인)
//   [TIP] 초과근무월별집계 시 근무일수 제외 대상 …   ← 1번에 딸린 말
//   2. 급여 작업
//   …
//   5. 관련장부 및 보관
//   [TIP] 전입자 급여기본사항 변경 시 확인사항 …     ← 5번에 딸린 말
//
// 예전에는 TIP만 따로 뽑아 화면 맨 아래 상자에 몰아 넣었습니다. 그러면
// 1번 이야기와 5번 이야기가 한 상자에 나란히 붙어, 어느 항목에 대한
// 주의사항인지 알 수 없게 됩니다.
//
// 그래서 두 가지를 봅니다.
//   1. TIP 상자가 본문(#step-actions) 안에 그려진다
//   2. 그려진 차례가 원문 차례와 같다(앞 항목 뒤, 다음 항목 앞)
//
// 사용법: node scripts/validate_tip_placement.mjs [--chapters 01,02]

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadGuideData, chapterKeys } = require(path.join(root, "scripts/lib/load_guide_data.js"));

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

const at = process.argv.indexOf("--chapters");
const only = at > 0 ? new Set(process.argv[at + 1].split(",")) : null;

let base = process.argv.find((value) => value.startsWith("http")) || "http://127.0.0.1:8899";
let server = null;
if (!(await alive(base))) {
  const { spawn } = await import("node:child_process");
  const port = 8871;
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

const window = loadGuideData();
const problems = [];
let tipsChecked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  for (const work of window[key].sections) {
    const blocks = work.contentBlocks || [];
    const tips = blocks.filter(
      (block) => String(block.title || "").trim() === "TIP" && String(block.body || "").trim()
    );
    if (!tips.length) continue;

    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(400);

    // 화면은 목차 항목(단계)마다 한 화면씩 그립니다. 각 단계를 다 열어
    // 그 단계에 든 TIP이 본문 안에 제자리로 들어갔는지 봅니다.
    const stepIds = await page.evaluate(() =>
      [...document.querySelectorAll("#step-list [data-step-id]")].map((node) =>
        node.getAttribute("data-step-id")
      )
    );
    const steps = stepIds.length ? stepIds : [""];

    const placed = new Map();
    for (const stepId of steps) {
      if (stepId) {
        await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}&step=${stepId}`, {
          waitUntil: "load",
        });
        await page.waitForTimeout(250);
      }
      const shown = await page.evaluate(() =>
        [...document.querySelectorAll("#step-actions > [data-source-block]")].map((node) =>
          node.getAttribute("data-source-block")
        )
      );
      shown.forEach((id, index) => {
        if (!placed.has(id)) placed.set(id, { stepId, index });
      });
    }

    const order = blocks.map((block) => block.id);
    for (const tip of tips) {
      tipsChecked += 1;
      const where = `제${chapterId}편 ${work.title} [${tip.id}]`;
      const seat = placed.get(tip.id);
      if (!seat) {
        problems.push(`${where}: TIP이 본문 안에 그려지지 않았습니다.`);
        continue;
      }
      // 원문에서 바로 앞뒤에 있던, 화면에도 그려진 항목을 찾습니다.
      const at = order.indexOf(tip.id);
      const before = order
        .slice(0, at)
        .reverse()
        .find((id) => placed.has(id) && placed.get(id).stepId === seat.stepId);
      const after = order
        .slice(at + 1)
        .find((id) => placed.has(id) && placed.get(id).stepId === seat.stepId);
      if (before && placed.get(before).index > seat.index) {
        problems.push(`${where}: 원문에서 앞에 있던 ${before}보다 뒤에 그려졌습니다.`);
      }
      if (after && placed.get(after).index < seat.index) {
        problems.push(`${where}: 원문에서 뒤에 있던 ${after}보다 앞에 그려졌습니다.`);
      }
    }
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  problems.slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  console.error(`\nTIP 자리 문제 ${problems.length}건`);
  process.exit(1);
}
console.log(`TIP 상자 ${tipsChecked}개가 모두 원문 자리에 있습니다.`);
