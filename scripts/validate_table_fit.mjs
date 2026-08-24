// 표가 주어진 폭 안에 들어가는지, 낱말이 끊기지 않는지 실제 브라우저로 봅니다.
//
// 열 너비를 손대는 일이 잦은데, 눈으로 하나씩 보면 반드시 놓칩니다.
//   · 모든 열을 똑같이 나눠 긴 칸이 세로로 눌린 적이 있고
//   · 가로 스크롤로 미뤄 놓고 고쳤다고 한 적이 있습니다.
//
// 그래서 네 가지를 기계로 확인합니다.
//   1. 가로 스크롤이 생기지 않는다 (표가 폭 안에 들어간다)
//   2. 칸 안에서 낱말이 가운데에서 끊기지 않는다
//   3. 그림형 표는 격자로 그리지 않는다
//   4. 표 한가운데 세로선이 끊기지 않는다
//
// 3번은 매뉴얼이 흐름도·구성도를 표 칸에 그려 넣은 자리를 말합니다.
// 칸 하나에 '≫'만 넣어 화살표를 그리고, 자리를 맞추려고 빈 칸을 늘어놓습니다.
// 그것은 표가 아니라 그림이라, 그대로 격자로 옮기면 빈 칸만 줄줄이 보이고
// 화살표가 한 칸을 차지해 어디서 어디로 가는 흐름인지 알 수 없습니다.
//   예) 제19편 물품 관리 처리 절차, 제19편 기타 관리, 제13편 성과평가위원회 구성도
// 이런 표는 흐름도로 그려야 합니다(structured-details.js).
// 자료가 아니라 화면에 그려진 결과를 보므로, 그리는 쪽 판별이 틀려도 잡힙니다.
//
// 서버는 스스로 띄웁니다. 손으로 켜야 하는 검증은 결국 아무도 안 돌립니다.
//
// 사용법: node scripts/validate_table_fit.mjs [이미 띄운 주소]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadGuideData } = require(path.join(root, "scripts/lib/load_guide_data.js"));

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("playwright가 없어 건너뜁니다. npm install --omit=optional playwright");
  process.exit(0);
}

// 이미 띄워 둔 서버가 있으면 그것을 쓰고, 없으면 잠깐 띄웠다 끕니다.
async function alive(url) {
  try {
    const answer = await fetch(`${url}/index.html`, { signal: AbortSignal.timeout(1200) });
    return answer.ok;
  } catch {
    return false;
  }
}

// 편이 많아 한 번에 오래 걸립니다. 편을 골라 돌릴 수 있게 해 둡니다.
//   node scripts/validate_table_fit.mjs --chapters 01,02,03
const chapterArg = (() => {
  const at = process.argv.indexOf("--chapters");
  return at > 0 ? new Set(process.argv[at + 1].split(",")) : null;
})();

let base = process.argv.find((value) => value.startsWith("http")) || "http://127.0.0.1:8899";
let server = null;
if (!(await alive(base))) {
  const { spawn } = await import("node:child_process");
  const port = 8877;
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

const { chapterKeys } = require(path.join(root, "scripts/lib/load_guide_data.js"));

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (chapterArg && !chapterArg.has(chapterId)) continue;
  for (const work of window[key].sections) {
    const layout = window.GUIDE_WORKFLOW_LAYOUT[work.id] || [];
    // 표가 있는 소제목만 엽니다. 121개 업무를 다 열 필요가 없습니다.
    const withTables = layout
      .map((section, index) => ({ index: index + 1, section }))
      .filter(({ section }) =>
        section.blocks.some((id) => {
          const block = work.contentBlocks.find((item) => item.id === id);
          return block && (block.tables || []).length;
        })
      );
    if (!withTables.length) continue;
    // 업무마다 한 번만 열고, 소제목은 주소만 바꿔 넘깁니다. 다시 읽지 않아 빠릅니다.
    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(260);

    for (const { index: step } of withTables) {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, `#work=${work.id}&step=step-${step}`);
      // 소제목을 바꾸면 화면을 다시 그립니다. 다 그려진 뒤에 재야 합니다.
      // 그리는 도중에 재면 칸 너비가 0으로 나와 없는 문제를 만들어 냅니다.
      await page.waitForFunction(
        (id) => {
          const active = document.querySelector("#step-list .active");
          if (!active || active.dataset.stepId !== id) return false;
          const table = document.querySelector("#step-actions table");
          return Boolean(table) && table.clientWidth > 0;
        },
        `step-${step}`,
        { timeout: 4000 }
      ).catch(() => {});
      await page.waitForTimeout(120);

      const found = await page.evaluate(() => {
        // 매뉴얼 판마다 화살표 글자가 다릅니다. 한 가지만 보면 놓칩니다.
        const ARROW_ONLY = /^[\s≫⇒→⇨⟹⟶➡➔➜▶►»＞>↓⇓▼⇩⇙⇘⇗⇖←⇐⟵◀◁]+$/u;
        // 이름표로 쓰기에 너무 긴 글이 든 칸은 그림이 아니라 내용입니다.
        const LABEL_LIMIT = 40;
        return [...document.querySelectorAll("#step-actions .source-table-scroll")].map((box) => {
          const table = box.querySelector("table");
          const cells = [...table.querySelectorAll("th, td")];
          const plain = (cell) => cell.textContent.replace(/\s+/g, " ").trim();
          // 칸 하나가 통째로 화살표인 표는 흐름도를 격자로 옮긴 것입니다.
          const arrowCells = cells.filter((cell) => {
            const value = plain(cell);
            return Boolean(value) && ARROW_ONLY.test(value);
          }).length;
          // 짧은 이름표만 든 격자가 절반 넘게 비어 있으면 그림입니다(구성도).
          // 다만 눈금이 그어진 그림(시각이 늘어선 개념도)은 흐름이 아니라 도표라,
          // 칩으로 늘어놓으면 어느 칸이 어느 눈금에 걸리는지가 사라집니다.
          // 그런 표는 격자로 두는 것이 맞습니다.
          const hasAxis = cells.some(
            (cell) => (plain(cell).match(/\d{1,2}\s*:\s*\d{2}/g) || []).length >= 3
          );
          const blankCells = cells.filter((cell) => !plain(cell)).length;
          const drawnAsPicture =
            cells.length >= 6 &&
            blankCells * 2 > cells.length &&
            !hasAxis &&
            cells.every((cell) => [...plain(cell)].length <= LABEL_LIMIT);
          // 세로선이 빠진 칸: 표의 왼쪽 끝이 아닌데 왼쪽 선이 없는 칸입니다.
          // 세로로 여러 줄을 차지하는 칸이 있으면 ':last-child'로 선을 지우던
          // 방식이 아랫줄의 선까지 지워, 표 한가운데 선이 끊겼습니다.
          const tableLeft = table.getBoundingClientRect().left;
          const openSides = cells.filter((cell) => {
            if (!cell.clientWidth) return false;
            const style = getComputedStyle(cell);
            if (parseFloat(style.borderLeftWidth) > 0) return false;
            return cell.getBoundingClientRect().left - tableLeft > 2;
          }).length;
          // 낱말이 끊겼는지: 칸 안의 글이 줄바꿈 없이 들어갈 수 있는 폭인지 봅니다.
          let tightSample = "";
          const tight = cells.filter((cell) => {
            // 아직 그려지지 않은 칸은 재지 않습니다.
            if (!cell.clientWidth) return false;
            // 한 칸이 목록으로 그려지기도 합니다. textContent로 통째로 읽으면
            // 항목이 붙어 하나의 긴 낱말처럼 보이므로, 실제 글자 조각마다 잽니다.
            // 보이지 않는 자리(U+200B)도 줄을 바꿀 수 있는 곳이라 함께 끊습니다.
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            const words = [];
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              for (const word of node.textContent.split(/[\s\u200B]+/)) {
                if (word) words.push(word);
              }
            }
            if (!words.length) return false;
            const longest = words.reduce((a, b) => (a.length >= b.length ? a : b), "");
            if (longest.length < 2) return false;
            const probe = document.createElement("span");
            probe.style.cssText =
              "position:absolute;visibility:hidden;white-space:nowrap;font:" +
              getComputedStyle(cell).font;
            probe.textContent = longest;
            document.body.appendChild(probe);
            const need = probe.offsetWidth;
            probe.remove();
            const style = getComputedStyle(cell);
            const inner =
              cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const breaks = need > inner + 1;
            if (breaks && !tightSample) tightSample = `${longest} 필요 ${Math.round(need)} 있음 ${Math.round(inner)}`;
            return breaks;
          }).length;
          return {
            sample: tightSample,
            columns: table.querySelectorAll("col").length,
            // 열이 아주 많은 표는 가로로 넘겨 보는 것이 맞습니다.
            overflow:
              box.scrollWidth > box.clientWidth + 1 &&
              table.getAttribute("data-scroll") !== "1",
            tight,
            arrowCells,
            blankCells,
            cellCount: cells.length,
            drawnAsPicture,
            openSides,
            label: table.getAttribute("aria-label") || "",
          };
        });
      });

      // 매뉴얼이 표로 그려 둔 절차도를 카드로 다시 그리지 않는지 봅니다.
      // 카드로 옮기려면 원문의 자리를 버리고 한 줄짜리 차례로 펴야 하는데,
      // 가지가 갈라지는 그림은 펼 수가 없어 카드 한 장에 열세 줄이 들어갔습니다
      // (제8편 '촉탁직 노동자 (재)고용'). 원문 자리에 원문 그대로 그립니다.
      const redrawn = await page.evaluate(
        () => document.querySelectorAll("#step-actions .source-flow").length
      );
      if (redrawn) {
        problems.push(
          `제${chapterId}편 ${work.title} ${step}번째: 원문 표를 카드로 다시 그렸습니다 ` +
            `(${redrawn}곳). 표는 원문 자리에 표로 그려야 합니다.`
        );
      }

      for (const table of found) {
        checked += 1;
        const where = `제${chapterId}편 ${work.title} ${step}번째 [${table.label.slice(0, 20)}]`;
        if (table.overflow) {
          problems.push(`${where}: 표가 폭을 넘어 가로 스크롤이 생깁니다 (${table.columns}열).`);
        }
        if (table.tight) {
          problems.push(
            `${where}: 낱말이 끊기는 칸이 ${table.tight}개 있습니다.` +
              (table.sample ? ` ('${table.sample}')` : "")
          );
        }
        // 매뉴얼이 표로 그려 둔 절차도는 표 그대로 그립니다.
        // 예전에는 이런 표를 카드와 화살표로 다시 그렸고, 그러지 않으면
        // 여기서 잘못이라고 알렸습니다. 카드로 옮기려면 원문의 자리를 버리고
        // 한 줄짜리 차례로 펴야 하는데, 가지가 갈라지는 그림은 펼 수가 없어
        // 카드 한 장에 열세 줄이 들어갔습니다(제8편 '촉탁직 노동자 (재)고용').
        // 이제 한글파일의 칸 주소와 열 너비를 그대로 가져오므로 원문 자리에
        // 원문 그대로 그립니다. 화살표 칸이 있는 것은 잘못이 아닙니다.
        if (table.openSides) {
          problems.push(
            `${where}: 세로선이 빠진 칸이 ${table.openSides}개 있습니다. 표 한가운데 선이 끊깁니다.`
          );
        }
      }
    }
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  console.error("표가 폭 안에 제대로 들어가지 않습니다:");
  problems.slice(0, 20).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 20) console.error(` … 외 ${problems.length - 20}건`);
  process.exit(1);
}

console.log(`table fit valid: 화면에 그려진 표 ${checked}개, 가로 스크롤 없음, 낱말 끊김 없음`);
