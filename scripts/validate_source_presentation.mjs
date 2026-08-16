// 원문을 화면에 옮길 때 모양이 흐트러지지 않는지 브라우저로 확인합니다.
//
//   1. 업무 흐름도가 도막나지 않는다
//      원문은 한 줄에 다 안 들어가면 끊어서 적습니다. 끊긴 자리를 그대로
//      두면 화살표가 사라져, 여섯 칸짜리 흐름이 세 칸씩 두 도막으로 보입니다.
//
//   2. 표가 든 항목도 글머리표(▸ ※ -)를 그대로 보여 준다
//      표가 든 항목만 다른 길로 그려져 글머리표가 떨어져 나갔습니다.
//      같은 화면에서 어떤 항목은 '▸'로 시작하고 어떤 항목은 그냥 시작해
//      서식이 들쭉날쭉했습니다.
//
// 사용법: node scripts/validate_source_presentation.mjs [--chapters 01,02]

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
  const port = 8867;
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

// 옆으로 잇는 화살표입니다. 아래로 내리긋는 ⇓ ⇙ ⇘ 는 흐름을 잇는 것이 아니라
// 갈라지는 자리를 나타내므로 여기서 세지 않습니다.
const ARROW = /[▶⇒→➡]/;
// 매뉴얼이 쓰는 글머리표입니다. 화면 쪽(MARKERS)과 같아야 합니다.
const BULLET = /^([‣•▸▹▪□○◦※*]|[-–]\s|[▶])/;

const window = loadGuideData();
const problems = [];
let flowsChecked = 0;
let blocksChecked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  for (const work of window[key].sections) {
    const blocks = work.contentBlocks || [];
    // 흐름도 칸이 둘인 업무가 있습니다(제11편 공유재산의 취득: 취득 흐름·처분 흐름).
    // 화면은 둘을 이어서 한 목록으로 그리므로 여기서도 그렇게 셉니다.
    const lines = blocks
      .filter((block) => String(block.title || "").trim() === "업무 흐름도")
      .flatMap((block) =>
        String(block.body || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      );

    // 표 밖에 있으면서 글머리표로 시작하는 줄을 셉니다. 화면에도 그만큼 있어야 합니다.
    const marked = blocks.map((block) => {
      const bodyLines = String(block.body || "")
        .split(/\r?\n/)
        .map((line) => line.trim());
      const inTable = (index) =>
        (block.tables || []).some(
          (table) => index >= table.lineStart && index < table.lineStart + table.lineCount
        );
      return {
        id: block.id,
        title: block.title,
        count: bodyLines.filter((line, index) => line && !inTable(index) && BULLET.test(line))
          .length,
        hasTable: (block.tables || []).length > 0,
      };
    });

    const worthLooking = lines.length > 1 || marked.some((block) => block.count > 0);
    if (!worthLooking) continue;

    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(500);

    if (lines.length > 1) {
      flowsChecked += 1;
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll(".work-flow-line")].map((row) =>
          [...row.querySelectorAll(".work-flow-name")].map((name) => name.textContent.trim())
        )
      );
      const where = `제${chapterId}편 ${work.title}`;

      // 원문에서 화살표로 이어진 자리는 화면에서 한 줄로 붙어야 합니다.
      const continued = lines.filter(
        (line, index) =>
          index > 0 && (ARROW.test(lines[index - 1].slice(-1)) || ARROW.test(line[0]))
      ).length;
      if (continued && rows.length > lines.length - continued) {
        problems.push(
          `${where}: 흐름도가 도막났습니다. 원문 ${lines.length}줄 중 ${continued}자리가 ` +
            `화살표로 이어져 있는데 화면은 ${rows.length}줄입니다.`
        );
      }
      // 칸 이름이 화살표로 시작하거나 끝나면 이어 붙일 곳을 놓친 것입니다.
      for (const row of rows) {
        if (!row.length) {
          problems.push(`${where}: 칸이 하나도 없는 흐름 줄이 있습니다.`);
          continue;
        }
        if (ARROW.test(row[0][0]) || ARROW.test(row[row.length - 1].slice(-1))) {
          problems.push(`${where}: 흐름 줄이 화살표로 시작하거나 끝납니다 (${row.join(" / ")}).`);
        }
      }
    }

    for (const block of marked) {
      if (!block.hasTable || !block.count) continue;
      blocksChecked += 1;
      const seen = await page.evaluate((blockId) => {
        const li = document.querySelector(`[data-source-block="${CSS.escape(blockId)}"]`);
        if (!li) return null;
        // 같은 기호는 같은 자리에서 시작해야 합니다. 표 앞뒤가 따로 놀면
        // 표 앞의 '-'와 표 뒤의 '-'가 다른 만큼 들여쓰기됩니다.
        const places = {};
        li.querySelectorAll(".semantic-summary-item").forEach((item) => {
          const mark = item.querySelector(".semantic-summary-marker");
          if (!mark) return;
          const key = mark.textContent.trim();
          (places[key] = places[key] || []).push(getComputedStyle(item).marginLeft);
        });
        return {
          markers: li.querySelectorAll(".semantic-summary-marker").length,
          places,
        };
      }, block.id);
      if (seen === null) continue;
      if (seen.markers < block.count) {
        problems.push(
          `제${chapterId}편 ${work.title} [${String(block.title).slice(0, 24)}]: ` +
            `원문 글머리표 ${block.count}개 중 화면에 ${seen.markers}개만 남았습니다.`
        );
      }
      for (const [marker, places] of Object.entries(seen.places)) {
        const kinds = [...new Set(places)];
        if (kinds.length > 1) {
          problems.push(
            `제${chapterId}편 ${work.title} [${String(block.title).slice(0, 24)}]: ` +
              `'${marker}'가 자리를 달리해 섭니다 (${kinds.join(", ")}).`
          );
        }
      }
    }

    // 같은 기호는 항목이 달라져도 같은 자리에 서야 합니다.
    // 항목마다 그 안에 나온 기호로 단계를 다시 매기면, 같은 '▸ 다음 -'인데도
    // ※가 함께 있는 항목에서만 '-'가 한 단 더 들어갑니다.
    if (blocks.length) {
      const places = await page.evaluate(() => {
        const found = {};
        document.querySelectorAll("#step-actions .semantic-summary-item").forEach((item) => {
          const mark = item.querySelector(".semantic-summary-marker");
          if (!mark) return;
          const key = mark.textContent.trim();
          (found[key] = found[key] || []).push(getComputedStyle(item).marginLeft);
        });
        return found;
      });
      for (const [marker, list] of Object.entries(places)) {
        const kinds = [...new Set(list)];
        if (kinds.length > 1) {
          problems.push(
            `제${chapterId}편 ${work.title}: 화면 안에서 '${marker}'가 자리를 달리해 섭니다 ` +
              `(${kinds.join(", ")}).`
          );
        }
      }
    }
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  problems.forEach((line) => console.error(`  - ${line}`));
  console.error(`\n원문 표현에 문제 ${problems.length}건`);
  process.exit(1);
}
console.log(
  `source presentation valid: 흐름도 ${flowsChecked}개 이어짐, ` +
    `표가 든 항목 ${blocksChecked}개 글머리표 유지`
);
