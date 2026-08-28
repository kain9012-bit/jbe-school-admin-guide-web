// 접힌 절차가 화면에서도 단으로 서는지 브라우저로 확인합니다.
//
// 원문 ↔ 자료는 scripts/validate_flow_folds.py가 봅니다(한글파일을 직접 열어
// 접힌 자리를 셉니다). 여기서는 마지막 단계를 봅니다. 자료에 단이 나뉘어
// 있어도 화면이 도로 한 상자로 그리면 읽는 사람에게는 없는 것과 같습니다.
//
//   제11편 공유재산의 관리 '1. 토지이동 신청'
//   원문   [토지이동 대상 토지 현황 파악] ⇨ [토지이동 추진 내부결재…]
//                                                     ⇩
//          [K-에듀파인 재산대장 정리]     ⇨ [토지대장 및 …확인]
//
//   예전 화면 : 왼쪽 상자 하나에 단계 둘이 갇히고 그 사이에 속이 빈 띠가
//               남았습니다. ⇩는 오른쪽 상자 안 한 줄로 들어앉았습니다.
//
// 두 가지를 봅니다.
//   · 한 줄의 단계 상자가 **모두** 같은 자리에서 빈 줄을 물고 있으면 안 된다
//     — 그것이 상자 안에 갇힌 접힌 자리입니다.
//     단계 하나에만 있는 빈 줄은 여기서 보지 않습니다. 원문이 그 칸에만 둔
//     빈 자리이거나(제16편 사회보험 흐름도, 테두리가 아예 없는 표),
//     한 칸 안에 상자를 둘로 나눠 둔 자리입니다(제12편 물품 출납).
//     그것은 접힌 자리가 아니라 다른 이야기입니다.
//   · 접힌 자리의 화살표가 제 단계 밑에 선다
//     — 원문은 오른쪽 끝에서 접기도 하고 왼쪽 끝에서 접기도 합니다.
//       늘 가운데에 세우면 어디서 접힌 것인지 달라집니다.
//
// 사용법: node scripts/validate_flow_lanes.mjs [--chapters 01,02]

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
  const port = 8873;
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
let checked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  for (const work of window[key].sections) {
    // 절차로 그려지는 표가 있는 업무만 엽니다.
    const hasFlow = (work.contentBlocks || []).some((block) =>
      (block.tables || []).some((table) => table.flow)
    );
    if (!hasFlow) continue;

    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(300);
    const steps = await page.evaluate(() =>
      [...document.querySelectorAll("#step-list [data-step-id]")].map((node) =>
        node.getAttribute("data-step-id")
      )
    );
    for (const step of steps.length ? steps : [""]) {
      const address = step
        ? `${base}/index.html?chapter=${chapterId}#work=${work.id}&step=${step}`
        : `${base}/index.html?chapter=${chapterId}#work=${work.id}`;
      await page.goto(address, { waitUntil: "load" });
      await page.waitForTimeout(220);
      const found = await page.evaluate(() => {
        const ARROW = /^[\s⇨⇦⇩⇧⇒⇐→←↑↓➡➔➜⟹≫▼▶►]+$/u;
        const flows = [...document.querySelectorAll("#step-actions .source-flow")];
        const lanes = flows.filter((node) => node.getAttribute("data-fold") !== "1");
        const blank = [];
        for (const lane of lanes) {
          // 단계마다 '몇째 줄이 비었는지'를 셉니다. 칸이 하나도 없는 줄은
          // 세지 않습니다. 위 칸이 세로로 걸쳐 지나가느라 비어 있는 줄이라,
          // 화면에는 아무것도 그리지 않습니다.
          const cards = [...lane.querySelectorAll(".source-flow-step")].filter((card) =>
            card.textContent.trim()
          );
          if (cards.length < 2) continue;
          const empties = cards.map((card) => {
            const found = new Set();
            [...card.querySelectorAll("tr")].forEach((row, at) => {
              const cells = [...row.querySelectorAll("th, td")];
              if (!cells.length) return;
              const said = cells.map((cell) => cell.textContent.trim());
              if (said.some((text) => text && !ARROW.test(text))) return;
              found.add(at);
            });
            return found;
          });
          // 모든 단계가 같은 자리에서 비어 있으면 그 줄은 상자 안에 갇힌
          // 접힌 자리입니다.
          for (const at of empties[0]) {
            if (!empties.every((one) => one.has(at))) continue;
            blank.push(lane.textContent.replace(/\s+/g, " ").trim().slice(0, 40));
            break;
          }
        }
        // 접힌 자리의 화살표가 어느 단계 밑에 섰는지 봅니다.
        const folds = [];
        for (const fold of flows.filter((node) => node.getAttribute("data-fold") === "1")) {
          const mark = [...fold.querySelectorAll(".source-flow-turn")].find((node) =>
            node.textContent.trim()
          );
          if (!mark) continue;
          const box = mark.getBoundingClientRect();
          const middle = box.left + box.width / 2;
          const near = fold.previousElementSibling;
          const boxes = near
            ? [...near.querySelectorAll(".source-flow-step")]
                .filter((node) => node.textContent.trim())
                .map((node) => node.getBoundingClientRect())
            : [];
          folds.push({
            over: boxes.some((one) => middle >= one.left - 4 && middle <= one.right + 4),
            said: near ? near.textContent.replace(/\s+/g, " ").trim().slice(0, 40) : "",
          });
        }
        return { lanes: lanes.length, blank, folds };
      });
      checked += found.lanes;
      for (const said of found.blank) {
        problems.push(
          `제${chapterId}편 ${work.title}: 단계 상자 안에 읽을 글이 없는 줄이 있습니다 ` +
            `('${said}…'). 원문에서 상자와 상자 사이의 트인 띠였습니다.`
        );
      }
      for (const fold of found.folds) {
        if (fold.over) continue;
        problems.push(
          `제${chapterId}편 ${work.title}: 접힌 자리의 화살표가 어느 단계 밑에도 서지 ` +
            `않습니다 ('${fold.said}…').`
        );
      }
    }
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  [...new Set(problems)].slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n접힌 절차가 화면에서 어긋난 곳 ${new Set(problems).size}건`);
  process.exit(1);
}
console.log(`절차 단 ${checked}개가 화면에서 제 모양으로 섭니다.`);
