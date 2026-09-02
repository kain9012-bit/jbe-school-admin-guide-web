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

// 바탕이 없다는 뜻입니다. 투명하면 화면 바탕이 그대로 비칩니다.
const CLEAR = /^(transparent|rgba\([^)]*,\s*0\s*\))$/;

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
          // 이 표가 제 것으로 가진 칸만 봅니다. 칸 안에 표가 또 그려져 있으면
          // (제1편 기록물 관리 TIP '서가배치') 아래로 다 훑을 때 안쪽 표의 칸까지
          // 딸려 옵니다. 안쪽 표의 맨 왼쪽 칸은 바깥 표의 왼쪽 끝이 아니므로
          // '세로선이 빠졌다'고 잘못 알립니다. 안쪽 표는 제 상자로 따로 봅니다.
          const cells = [...table.querySelectorAll(":scope > tbody > tr > th, :scope > tbody > tr > td")];
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
            // 절차를 잇는 화살표 칸은 상자를 그리지 않습니다. 화살표에까지
            // 테두리를 두르면 화살표가 또 하나의 단계처럼 보입니다.
            // 원문에서도 이 자리는 칸이 아니라 칸과 칸 사이입니다.
            if (cell.getAttribute("data-arrow") === "1") return false;
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
            //
            // 한글·한자·가나도 글자마다 줄을 바꿀 수 있는 자리입니다.
            // 매뉴얼도 그렇게 적혀 있습니다 — '대우공무원수당(지방공무원수당등에
            // 관한규정제5조의2)'은 원문 79px 칸에서 다섯 줄로 접힙니다.
            // 이것을 '끊으면 안 되는 낱말'로 보면 그 열이 통째로 넓어져,
            // 내용이 든 열이 원문 80%에서 55%로 눌립니다.
            const CJK =
              /[\u1100-\u11FF\u2E80-\u303F\u3040-\u30FF\u3130-\u318F\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g;
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            const words = [];
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              for (const piece of node.textContent.split(/[\s\u200B]+/)) {
                for (const word of piece.split(CJK)) {
                  if (word) words.push(word);
                }
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
            // 매뉴얼이 표로 그림을 그린 자리입니다(서가 배치도, 개념도, 구성도).
            // 원문에서도 좁은 칸의 글은 두 줄로 접힙니다. 낱말이 안 끊기게
            // 폭을 넓히면 원문 600px짜리 그림이 1300px로 부풀어 가로로
            // 넘어갑니다. 그림은 원문 비율 그대로 두고, 접히는 것은 봐 줍니다.
            // 폭 안에 들어가는지는 아래 overflow로 그대로 봅니다.
            picture: table.getAttribute("data-picture") === "1",
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
            // 본문에 홀로 놓인 표인지, 그 상자의 바탕이 무엇인지 봅니다.
            // 칸 안이나 TIP 상자 안에 든 표는 이미 제 바탕이 있는 자리라
            // 여기서 세지 않습니다.
            standalone: box.parentElement?.classList.contains("source-full-content") === true,
            paper: getComputedStyle(box).backgroundColor,
            // 표 상자는 좁은 화면에서 가로로만 넘겨 봅니다. 세로로 넘치면
            // 아래가 잘려 안 보이는 채로 세로 스크롤이 생깁니다.
            clipped: box.scrollHeight > box.clientHeight + 2,
            hidden: Math.round(box.scrollHeight - box.clientHeight),
            // 절차 단계 안에 든 표입니다. 여기서는 가로 스크롤도 안 됩니다.
            // 단계는 폭을 우리가 정하는 상자라, 안 들어가면 스크롤을 붙일
            // 것이 아니라 그 단계를 넓혀야 합니다.
            inStep: Boolean(box.closest(".source-flow-step")),
            sideways: Math.round(box.scrollWidth - box.clientWidth),
            // 같은 줄의 다른 단계에 남는 자리가 얼마나 있는지 봅니다.
            // 남는 자리가 있는데도 넘친다면 나눠 주기를 잘못한 것이고,
            // 다들 꽉 찼다면 그 줄에 도저히 안 들어가는 것입니다.
            //
            // 글만 든 단계는 글이 접히므로 scrollWidth로는 남는 자리를 알 수
            // 없습니다. 그려진 줄(line box)을 재어 가장 긴 줄이 상자보다
            // 얼마나 짧은지를 봅니다.
            spare: (() => {
              const flow = box.closest(".source-flow");
              const mine = box.closest(".source-flow-step");
              if (!flow) return 0;
              return [...flow.querySelectorAll(".source-flow-step")]
                .filter((step) => step !== mine)
                .reduce((sum, step) => {
                  // 글자가 실제로 그려진 자리만 봅니다. 목록 항목이나 표는
                  // 상자를 꽉 채우도록 늘어나 있어, 상자를 재면 늘 꽉 찬 것으로
                  // 보입니다. 글자를 감싸는 조각(line box)의 오른쪽 끝이
                  // 상자의 오른쪽 끝에서 얼마나 모자라는지를 잽니다.
                  const edge = step.getBoundingClientRect();
                  const walker = document.createTreeWalker(step, NodeFilter.SHOW_TEXT);
                  let right = edge.left;
                  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    if (!node.textContent.trim()) continue;
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    for (const rect of range.getClientRects()) {
                      right = Math.max(right, rect.right);
                    }
                  }
                  return sum + Math.max(0, edge.right - right);
                }, 0);
            })(),
            label: table.getAttribute("aria-label") || "",
          };
        });
      });

      // 매뉴얼이 표로 그려 둔 절차도를 카드로 다시 그리지 않는지 봅니다.
      // 카드로 옮기려면 원문의 자리를 버리고 한 줄짜리 차례로 펴야 하는데,
      // 가지가 갈라지는 그림은 펼 수가 없어 카드 한 장에 열세 줄이 들어갔습니다
      // (제8편 '촉탁직 노동자 (재)고용'). 원문 자리에 원문 그대로 그립니다.
      // 다만 원문이 상자와 화살표를 번갈아 세워 둔 한 줄짜리 표는 그대로
      // 이어서 그립니다. 상자도 화살표도 차례도 원문 그대로이고, 화면 폭에
      // 맞춰 줄만 바뀝니다. 그런 것은 data-source="chain"으로 표시합니다.
      // 표시가 없는 흐름도는 원문에 없는 모양을 지어낸 것입니다.
      const redrawn = await page.evaluate(
        () => document.querySelectorAll('#step-actions .source-flow:not([data-source="chain"])').length
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
        if (table.tight && !table.picture) {
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
        // 그림형 표는 트인 쪽이 곧 모양입니다(서가 기둥 사이, 흐름도의
        // 화살표 자리). 칸마다 원문에 적힌 선을 그대로 긋고 있으므로,
        // 여기서 '선이 빠졌다'고 보면 안 됩니다. 원문 선을 제대로 읽었는지는
        // validate_table_shape.js가 자료 쪽에서 봅니다.
        if (table.openSides && !table.picture) {
          problems.push(
            `${where}: 세로선이 빠진 칸이 ${table.openSides}개 있습니다. 표 한가운데 선이 끊깁니다.`
          );
        }
        // 본문에 홀로 놓인 표는 종류를 가리지 않고 흰 종이 위에 섭니다.
        //
        // 그림형 표는 '원문에 그림을 두른 선이 없다'는 이유로 테두리를 지웠는데
        // 바탕까지 함께 지워, 그림만 화면의 옅은 파란 바탕 위에 맨몸으로 떠서
        // 다른 표와 따로 놀았습니다(제4편 유연근무제 '시차 출·퇴근제 개념도').
        // 없는 것은 그림을 두른 '선'이지 그림을 받치는 '종이'가 아닙니다.
        // 표 상자에 세로 스크롤이 생기면 안 됩니다.
        //
        // 절차 단계의 키를 맞추려고 상자에 height: 100% 를 두었더니, 그 상자가
        // 가로 스크롤 상자(overflow-x: auto)라 못박은 키를 넘는 내용이 잘렸습니다.
        // 못박힌 키는 줄 높이를 정할 때 제 내용을 세지도 않아, 저만 잘린 채
        // 다른 단계 높이에 맞춰집니다(제8편 '결원보충 승인절차'의 첫 단계 —
        // 안의 표는 255px인데 160px만 보였습니다).
        // 늘리기만 하고 못박지는 않습니다(min-height).
        if (table.clipped) {
          problems.push(
            `${where}: 표 상자에 세로 스크롤이 생겨 아래가 ${table.hidden}px 잘립니다. ` +
              "표는 가로로만 넘겨 봅니다."
          );
        }
        // 절차 단계 안의 표가 가로로 넘치면, 그 단계가 좁은 것입니다.
        //
        // 단계 폭은 원문 열 너비로 나눕니다. 그런데 원문에서 22%짜리 칸은
        // 종이(가로 162mm)에서는 넉넉해도 화면(780px)에서는 안 들어갑니다.
        // 안에 작은 표가 또 들어 있으면 더 그렇습니다. 그럴 때는 그 단계를
        // 넓히고 여유 있는 단계에서 그만큼 덜어 옵니다
        // (제8편 '결원보충 승인절차'의 첫 단계 — 66px이 스크롤에 숨었습니다).
        // 단계 폭은 글자 수로 어림잡아 나눕니다. 어림값과 실제로 그려지는
        // 폭은 스무 픽셀쯤 차이가 납니다(칸 여백, 화살표 칸의 큰 글자).
        // 그만큼은 상자가 스스로 삼키므로, 그보다 큰 넘침만 알립니다.
        const ROUGH = 20;
        if (table.inStep && table.sideways > ROUGH && table.spare >= table.sideways) {
          problems.push(
            `${where}: 절차 단계 안의 표가 가로로 ${table.sideways}px 넘칩니다. ` +
              `같은 줄의 다른 단계에 ${Math.round(table.spare)}px이 남아 있습니다. ` +
              "스크롤을 붙일 것이 아니라 그 단계를 넓혀야 합니다."
          );
        }
        if (table.standalone && CLEAR.test(table.paper)) {
          problems.push(
            `${where}: 본문에 홀로 놓인 표인데 상자 바탕이 없습니다(${table.paper}). ` +
              "화면 바탕이 그대로 비쳐 다른 표와 따로 놉니다."
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
