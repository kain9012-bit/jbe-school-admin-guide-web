// 표의 열 너비가 원문 비율대로 그려지는지 브라우저로 확인합니다.
//
// 한글파일에는 칸마다 너비가 적혀 있습니다(hp:cellSz). 빌더가 그것을 백분율로
// 옮겨 자료에 담아 두고(table.widths), 화면이 <col>에 씁니다. 그런데 화면 쪽이
// '낱말이 끊기지 않게' 열을 넓히다가 그 비율을 통째로 갈아엎고 있었습니다.
//
//   제7편 보수작업 '3. 급여 및 수당의 이해'
//   원문 : 구분 6% · 근거 13% · 지급요령 80%
//   예전 : 구분 7% · 근거 42% · 지급요령 51%
//
// 내용이 든 열이 절반으로 눌리고, 근거 이름만 든 열이 세 배로 부풀었습니다.
// 원인은 두 가지였습니다.
//
//   1. 한글을 '끊으면 안 되는 낱말'로 보았습니다. 한글은 글자마다 줄을 바꿀
//      수 있고 매뉴얼도 그렇게 적혀 있습니다 —
//      '대우공무원수당(지방공무원수당등에관한규정제5조의2)'은 원문 79px 칸에서
//      다섯 줄로 접힙니다(hp:lineseg 5개).
//   2. 열마다 최소 몫을 먼저 떼어 주고 남는 자리만 원문 비율로 나눴습니다.
//      칸 여백(26px)까지 열마다 최소 몫으로 잡혀 좁은 열이 실제보다 넓어집니다.
//
// 고치기 전에는 원문 너비가 있는 표 280개 가운데 167개가 어긋나 있었습니다.
//
// 여기서는 자료에 담긴 원문 비율과 화면이 실제로 그린 <col> 너비를 맞대어
// 봅니다. 열을 최소 몫까지 끌어올리는 일은 여전히 있으므로 조금은 봐 줍니다.
//
// 사용법: node scripts/validate_table_widths.mjs [--chapters 01,02]

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
  const port = 8872;
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

// 꾸밈 글자를 뺀 글자로 표를 짝짓습니다. 화면 쪽이 항목 앞에 찍는 가운데점,
// 줄을 바꿀 수 있는 자리 표시(U+200B)는 자료에 없으므로 함께 뺍니다.
const DECORATION =
  /[-–—•◦‣▪▫▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）[\]［］\s​]/g;
const bare = (value) => String(value ?? "").replace(DECORATION, "");

// 열 하나가 원문 비율에서 이만큼(%p) 넘게 벗어나면 알립니다.
const ALLOWED = 5;
// 로마자·숫자로 이 정도 길게 이어진 토막이 든 열은 넓어져도 봐 줍니다.
// 한글과 달리 이런 토막은 접을 수 없습니다(주소 www.hometax.go.kr, 서식 이름).
// 원문보다 넓어진 쪽만 봐 줍니다. 좁아진 것은 봐 줄 까닭이 없습니다.
const UNBREAKABLE = 10;
// 한글·한자·가나는 글자마다 줄을 바꿀 수 있습니다(화면 쪽과 같은 규칙).
const CJK =
  /[\u1100-\u11FF\u2E80-\u303F\u3040-\u30FF\u3130-\u318F\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g;

// 열마다 '접을 수 없는 가장 긴 토막'의 길이를 냅니다.
function stubbornRuns(table, columnCount) {
  const longest = Array.from({ length: columnCount }, () => 0);
  for (const row of [table.headers || [], ...(table.rows || [])]) {
    for (const cell of row) {
      if (!cell) continue;
      const span = cell.colSpan || 1;
      const runs = String(cell.text || "")
        .split(/[\s\u200B]+/)
        .flatMap((word) => word.split(CJK))
        .filter(Boolean);
      const most = runs.reduce((top, run) => Math.max(top, run.length), 0) / span;
      for (let offset = 0; offset < span; offset += 1) {
        const column = (cell.column ?? 0) + offset;
        if (column < columnCount) longest[column] = Math.max(longest[column], most);
      }
    }
  }
  return longest;
}
// 짧은 표는 우연히 같은 글이 여기저기 있어 짝을 못 믿습니다.
const LONG_ENOUGH = 40;

function tableKey(table) {
  const rows = [table.headers || [], ...(table.rows || [])];
  return bare(rows.flat().map((cell) => (cell ? cell.text : "")).join(""));
}

const window = loadGuideData();
const problems = [];
let checked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  for (const work of window[key].sections) {
    const wanted = new Map();
    for (const block of work.contentBlocks || []) {
      for (const table of block.tables || []) {
        // 그림형 표는 원문 자리를 그대로 쓰므로 여기서 볼 것이 없습니다.
        if (table.picture) continue;
        if (!Array.isArray(table.widths) || table.widths.length < 2) continue;
        const id = tableKey(table);
        if (id.length < LONG_ENOUGH) continue;
        // 글자가 같은 표가 둘이면 어느 쪽인지 가릴 수 없으므로 둘 다 뺍니다.
        wanted.set(id, wanted.has(id) ? null : table);
      }
    }
    if (!wanted.size) continue;

    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(300);
    const steps = await page.evaluate(() =>
      [...document.querySelectorAll("#step-list [data-step-id]")].map((node) =>
        node.getAttribute("data-step-id")
      )
    );
    const drawn = new Map();
    for (const step of steps.length ? steps : [""]) {
      const address = step
        ? `${base}/index.html?chapter=${chapterId}#work=${work.id}&step=${step}`
        : `${base}/index.html?chapter=${chapterId}#work=${work.id}`;
      await page.goto(address, { waitUntil: "load" });
      await page.waitForTimeout(180);
      const found = await page.evaluate(() =>
        [...document.querySelectorAll("#step-actions table.source-criteria-table")].map((table) => ({
          text: table.textContent,
          picture: table.getAttribute("data-picture") === "1",
          layout: (table.getAttribute("data-column-layout") || "")
            .split("-")
            .map(Number)
            .filter((value) => Number.isFinite(value)),
        }))
      );
      for (const table of found) {
        if (table.picture) continue;
        drawn.set(bare(table.text), table.layout);
      }
    }

    for (const [id, table] of wanted) {
      if (!table) continue; // 글자가 같은 표가 둘이라 짝을 못 믿습니다.
      const widths = table.widths;
      const layout = drawn.get(id);
      if (!layout || layout.length !== widths.length) continue;
      checked += 1;
      // 자료의 비율도 100%로 맞춰 견줍니다.
      const total = widths.reduce((sum, value) => sum + value, 0) || 1;
      const want = widths.map((value) => (value / total) * 100);
      // 접을 수 없는 토막(주소·서식 이름) 때문에 넓어진 열은 셈에서 뺍니다.
      // 그 열이 넓어진 만큼 다른 열이 줄어드는 것은 어쩔 수 없는 일이므로,
      // 남은 열끼리의 비율만 견줍니다.
      const runs = stubbornRuns(table, widths.length);
      const skip = want.map(
        (value, index) => layout[index] > value && runs[index] >= UNBREAKABLE
      );
      const left = want.map((_, index) => index).filter((index) => !skip[index]);
      if (left.length < 2) continue;
      const wantLeft = left.reduce((sum, index) => sum + want[index], 0) || 1;
      const drawnLeft = left.reduce((sum, index) => sum + layout[index], 0) || 1;
      let worst = 0;
      let column = left[0];
      for (const index of left) {
        const gap = Math.abs(
          (want[index] / wantLeft) * 100 - (layout[index] / drawnLeft) * 100
        );
        if (gap > worst) {
          worst = gap;
          column = index;
        }
      }
      if (worst <= ALLOWED) continue;
      problems.push(
        `제${chapterId}편 ${work.title}: 표의 열 너비가 원문과 다릅니다 ` +
          `(${column + 1}번째 열 원문 ${want[column].toFixed(0)}% → 화면 ${layout[
            column
          ].toFixed(0)}%, 원문 ${want.map((v) => v.toFixed(0)).join("/")} → ` +
          `화면 ${layout.map((v) => v.toFixed(0)).join("/")}).`
      );
    }
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  problems.slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  if (problems.length > 20) console.error(`  … 외 ${problems.length - 20}건`);
  console.error(`\n열 너비가 원문과 어긋난 표 ${problems.length}개`);
  process.exit(1);
}
console.log(`table widths valid: 원문 너비가 있는 표 ${checked}개가 원문 비율대로 그려집니다.`);
