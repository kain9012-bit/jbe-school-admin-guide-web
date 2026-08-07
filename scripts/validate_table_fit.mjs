// 표가 주어진 폭 안에 들어가는지, 낱말이 끊기지 않는지 실제 브라우저로 봅니다.
//
// 열 너비를 손대는 일이 잦은데, 눈으로 하나씩 보면 반드시 놓칩니다.
//   · 모든 열을 똑같이 나눠 긴 칸이 세로로 눌린 적이 있고
//   · 가로 스크롤로 미뤄 놓고 고쳤다고 한 적이 있습니다.
//
// 그래서 두 가지를 기계로 확인합니다.
//   1. 가로 스크롤이 생기지 않는다 (표가 폭 안에 들어간다)
//   2. 칸 안에서 낱말이 가운데에서 끊기지 않는다
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

let base = process.argv[2] || "http://127.0.0.1:8899";
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

for (const [chapterId, key] of [
  ["01", "CHAPTER1_DATA"],
  ["03", "CHAPTER3_DATA"],
]) {
  for (const work of window[key].sections) {
    const layout = window.GUIDE_WORKFLOW_LAYOUT[work.id] || [];
    for (let step = 1; step <= layout.length; step += 1) {
      const url = `${base}/index.html?chapter=${chapterId}#work=${work.id}&step=step-${step}`;
      await page.goto(url, { waitUntil: "load" });
      await page.waitForTimeout(320);

      const found = await page.evaluate(() =>
        [...document.querySelectorAll("#step-actions .source-table-scroll")].map((box) => {
          const table = box.querySelector("table");
          const cells = [...table.querySelectorAll("th, td")];
          // 낱말이 끊겼는지: 칸 안의 글이 줄바꿈 없이 들어갈 수 있는 폭인지 봅니다.
          const tight = cells.filter((cell) => {
            const text = cell.textContent.replace(/\s+/g, " ").trim();
            if (!text) return false;
            const longest = text.split(" ").reduce((a, b) => (a.length >= b.length ? a : b), "");
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
            return need > inner + 1;
          }).length;
          return {
            columns: table.querySelectorAll("col").length,
            overflow: box.scrollWidth > box.clientWidth + 1,
            tight,
            label: table.getAttribute("aria-label") || "",
          };
        })
      );

      for (const table of found) {
        checked += 1;
        const where = `제${chapterId}편 ${work.title} ${step}번째 [${table.label.slice(0, 20)}]`;
        if (table.overflow) {
          problems.push(`${where}: 표가 폭을 넘어 가로 스크롤이 생깁니다 (${table.columns}열).`);
        }
        if (table.tight) {
          problems.push(`${where}: 낱말이 끊기는 칸이 ${table.tight}개 있습니다.`);
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
