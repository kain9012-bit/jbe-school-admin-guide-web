// 칸 안의 줄 나눔이 화면에서도 남아 있는지 브라우저로 확인합니다.
//
// 원문 → 자료 → 화면, 세 단계입니다. 앞의 두 단계는
// scripts/validate_cell_lines.py가 봅니다(한글파일의 문단이 자료의 줄로
// 옮겨졌는지). 여기서는 마지막 단계를 봅니다. 자료에 줄이 여럿 들어 있어도
// 화면 쪽이 한 줄로 붙여 그리면 읽는 사람에게는 없는 것과 같습니다.
//
//   제4편 휴가 '2. 공가 사유'
//   자료 : 사유 열한 가지가 줄마다 하나
//   예전 화면 : ｢병역법｣ … 참가할 때 공무에 관하여 국회, … 소환될 때 법률에 …
//
// 화면 쪽은 '글머리표 없이 시작하는 줄은 앞줄에 이어지는 줄'로 보고 붙였습니다.
// 매뉴얼 본문은 글머리표 없는 문단이 훨씬 많아, 저마다 따로 선 문단이 통째로
// 한 덩어리가 됐습니다.
//
// 앞줄에 이어지는 줄은 원문에서 한두 칸 들여 씌어 있습니다. 그 줄만 앞줄에
// 붙입니다. 자료에도 그 들여쓰기가 그대로 실려 있습니다.
//
// 줄을 바꿔 놓는 것만으로는 모자랍니다. 항목 하나가 두세 줄로 넘어가면
// 넘어간 줄과 다음 항목의 첫 줄이 같은 자리에서 시작해, 어디서 한 항목이
// 끝나는지 안 보입니다. 그래서 두 번째로,
//
//   여러 줄로 넘어가는 항목이 있는 칸은 항목마다 앞에 기호가 선다
//
// 를 함께 봅니다. 원문에 기호가 있으면 그 기호를, 없으면 가운데점(·)을
// 찍습니다. 짧은 말만 든 칸은 줄바꿈만으로 이미 갈리므로 세지 않습니다.
//
// 사용법: node scripts/validate_cell_line_breaks.mjs [--chapters 01,02]

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
  const port = 8869;
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

// 화면 쪽과 같은 규칙으로 꾸밈 글자를 뺍니다. 규칙이 다르면 짝이 어긋나
// 있지도 않은 잘못을 알립니다.
const DECORATION =
  /[-–—•◦‣▪▫▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）[\]［］\s​]/g;
const bare = (value) => String(value ?? "").replace(DECORATION, "");

// 자료의 줄 가운데 화면에 따로 서야 할 줄을 셉니다.
// 앞이 들여쓰인 줄은 앞줄에 이어지는 줄이므로 세지 않습니다. 다만 글머리표로
// 시작하면 들여썼어도 딸린 항목이지 이어지는 줄이 아닙니다.
const MARKED = /^\s*(?:[•‣▸▹▶▪□○◦※*]|[-–]\s)/;
function standingLines(text) {
  const lines = String(text ?? "")
    .split("\n")
    .filter((line) => line.trim());
  return lines.filter(
    (line, index) => index === 0 || !/^\s/.test(line) || MARKED.test(line)
  ).length;
}

// 화면에서 셀 수 있는 칸만 봅니다. 칸 안에 표가 또 있거나 사진이 들었으면
// 줄 수가 그림·표에 따라 달라지므로 세지 않습니다.
function countableCells(table, into) {
  for (const row of [table.headers || [], ...(table.rows || [])]) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.tables && cell.tables.length) {
        cell.tables.forEach((inner) => countableCells(inner, into));
        continue;
      }
      const text = String(cell.text || "");
      if (text.includes("[[그림:")) continue;
      const want = standingLines(text);
      if (want < 2) continue;
      const key = bare(text);
      if (key.length < 30) continue; // 짧은 글은 우연히 같은 칸이 있어 못 믿습니다.
      into.set(key, Math.max(into.get(key) || 0, want));
    }
  }
}

const window = loadGuideData();
const problems = [];
const bald = new Set();
let checked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  for (const work of window[key].sections) {
    const wanted = new Map();
    for (const block of work.contentBlocks || []) {
      for (const table of block.tables || []) countableCells(table, wanted);
    }
    if (!wanted.size) continue;

    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(350);
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
      await page.waitForTimeout(220);
      const found = await page.evaluate(() =>
        [...document.querySelectorAll("#step-actions td, #step-actions th")].map((cell) => {
          const items = [...cell.querySelectorAll(":scope > ul > li")];
          // 기호를 세울지는 목록 하나하나마다 정합니다. 한 칸에 목록이 둘
          // 들어가기도 하므로(표 앞뒤에 붙은 글) 여기서도 목록 단위로 봅니다.
          const lists = [...cell.querySelectorAll(":scope > ul")].map((list) => {
            const mine = [...list.children];
            const oneLine = parseFloat(getComputedStyle(list).lineHeight) || 20;
            return {
              // 아주 좁은 칸에는 기호를 세우지 않습니다. 기호와 사이 여백이
              // 글자 두어 자 몫을 먹어, 남은 자리로는 한 글자도 못 놓고 칸
              // 밖으로 넘칩니다(35px짜리 '직위 / 해제' 칸). 그런 칸은 짧은
              // 이름표를 쌓아 둔 자리라 줄바꿈만으로 이미 갈립니다.
              // 화면 쪽과 같은 기준을 씁니다(structured-details.js showCellMarks).
              tooNarrow: list.clientWidth < oneLine * 3,
              count: mine.length,
              // 두 줄 넘게 늘어난 항목이 있는지 봅니다. 한 줄 키의 1.6배를
              // 넘으면 넘어간 줄이 있는 것으로 봅니다.
              wrapped: mine.some((item) => item.getBoundingClientRect().height > oneLine * 1.6),
              // 눈에 보이는 기호만 셉니다. 자리에 담겨 있어도 서식이 감추면
              // 읽는 사람에게는 없는 것과 같습니다.
              bald: mine.filter((item) => {
                const mark = item.querySelector(".source-cell-mark");
                return !mark || !mark.getBoundingClientRect().width;
              }).length,
            };
          });
          const sinner = lists.find(
            (list) => list.count > 1 && list.wrapped && list.bald && !list.tooNarrow
          );
          return {
            text: cell.textContent,
            // 칸 안의 줄은 목록 항목 하나하나로 그려집니다.
            lines: items.length || 1,
            wrapped: Boolean(sinner),
            bald: sinner ? sinner.bald : 0,
            among: sinner ? sinner.count : 0,
          };
        })
      );
      for (const cell of found) {
        const key = bare(cell.text);
        drawn.set(key, Math.max(drawn.get(key) || 0, cell.lines));
        // 여러 줄로 넘어가는 항목이 있는데 기호가 없는 항목이 있으면
        // 어디서 한 항목이 끝나는지 알 수 없습니다.
        if (cell.wrapped && cell.bald) {
          const said = `제${chapterId}편 ${work.title}`;
          if (!bald.has(said + key)) {
            bald.add(said + key);
            problems.push(
              `${said}: 여러 줄로 넘어가는 항목 ${cell.among}개 가운데 ${cell.bald}개에 ` +
                `앞 기호가 없습니다 ('${key.slice(0, 32)}…'). 넘어간 줄과 다음 항목이 ` +
                "같은 자리에서 시작해 어디서 하나가 끝나는지 보이지 않습니다."
            );
          }
        }
      }
    }

    for (const [key, want] of wanted) {
      if (!drawn.has(key)) continue; // 화면에 실리지 않은 지면입니다.
      checked += 1;
      if (drawn.get(key) >= want) continue;
      problems.push(
        `제${chapterId}편 ${work.title}: 칸의 줄 나눔이 화면에서 사라졌습니다 ` +
          `(자료 ${want}줄 → 화면 ${drawn.get(key)}줄, '${key.slice(0, 32)}…').`
      );
    }
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  problems.slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n칸 안의 줄 나눔 문제 ${problems.length}건`);
  process.exit(1);
}
console.log(`칸 안의 줄 나눔 ${checked}칸이 화면에서도 그대로 섭니다.`);
