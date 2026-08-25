// 칸 안에 그려진 표가 화면에서도 표인지 확인합니다.
//
// 매뉴얼은 칸 안에 표를 또 그려 넣습니다. 상자 안에 넣은 표, 서가처럼 자리를
// 그림으로 그린 표입니다. 한글파일을 읽는 쪽(kordoc)은 그 표를 행마다 한 줄,
// 칸 사이는 ' / '로 이어 붙여 바깥 칸의 글로 펴 버립니다.
//
//   제1편 기록물 관리 TIP '서가배치' (안쪽 표 12행 38열)
//   원문 : ┌ 영구 ┬ 준영구 ┬ 10년 ┬ 5년 ┬ 3년 ┐
//          ├ 2010문서 ┼ ○ ┼ ○ ┼ … ┤
//   예전 화면 : 영구 / 준영구 / 10년 / 5년 / 3년
//              2010 문서 / ○ / ○ / …
//
// 어느 칸의 무엇을 말하는지 알 수 없는 글줄 더미가 됩니다.
//
// 한글파일에는 안쪽 표도 제 칸 주소를 그대로 가지고 있고, 어느 칸에 들었는지도
// 적혀 있습니다(read_hwpx_tables.py의 parent·parentCell). 빌더가 펴진 글줄이
// 놓인 자리를 찾아 두면(lineStart·lineCount) 화면이 그 자리에 표를 그립니다.
//
// 매뉴얼은 절차도를 표가 아니라 네모(hp:rect)와 선으로 그리기도 합니다.
// 그러면 칸 하나하나가 따로 노는 도형이라 글자가 통째로 이어 붙습니다.
//
//   제1편 '5. 비전자기록물 이관 및 폐기 절차'
//   예전 화면 : 업무주체주요업무업무내용학교기록물담당자이관대상 추출◦K-에듀…
//
// 네모마다 자리(hp:offset)와 크기(hp:curSz)가 적혀 있으므로, 같은 줄에 선
// 것끼리 묶으면 표로 되살릴 수 있습니다. 이것도 여기서 함께 봅니다.
//
// 여기서는 세 가지를 봅니다.
//   1. 원문에서 칸 안에 든 격자(2행 2열 이상)가 화면 자료에도 표로 들어 있다
//   2. 표가 놓인 자리(lineStart·lineCount)가 본문 줄 수 안에 있다
//   3. 화면에 그 표가 실제로 격자로 그려지고, 펴진 글줄이 남아 있지 않다
//
// 1번은 자료만 보므로 빠르고, 3번은 브라우저로 봅니다.
// 안쪽 표를 되살리기 전 코드에서는 1번이 '표로 살아난 것 0개'로 실패합니다.
//
// 서식·별지 지면(업무 본문 뒤에 붙는 신청서 견본)은 화면에 싣지 않으므로
// 세지 않습니다. 화면에 실린 글에서 그 표의 글자를 찾을 수 있을 때만 봅니다.
//
// 사용법: node scripts/validate_nested_tables.mjs [--chapters 01,02]

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "docs", "assets");

const gridFile = path.join(root, "tmp", "hwpx-tables.json");
if (!existsSync(gridFile)) {
  console.log("tmp/hwpx-tables.json이 없어 건너뜁니다. python3 scripts/read_hwpx_tables.py");
  process.exit(0);
}
const allGrids = JSON.parse(readFileSync(gridFile, "utf8"));

// 빌더와 같은 규칙으로 꾸밈 글자를 뺍니다(build_chapters_from_hwpx.mjs의 bare).
// 여기서 규칙이 다르면 짝이 어긋나 있지도 않은 잘못을 알립니다.
const DECORATION =
  /[-–—•◦‣▪▫▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）[\]［］]/g;
const bare = (value) =>
  String(value ?? "")
    .replace(/\s/g, "")
    .replace(/\[\[그림:[^\]]*\]\]/g, "")
    .replace(DECORATION, "");

const problems = [];
const at = process.argv.indexOf("--chapters");
const only = at > 0 ? new Set(process.argv[at + 1].split(",")) : null;

// 표 하나가 몇 열인지 셉니다. 머리글 행만 보면 안 됩니다.
function columnsOf(table) {
  const rows = [table.headers || [], ...(table.rows || [])];
  let most = 0;
  for (const row of rows) {
    let cursor = 0;
    for (const cell of row) {
      const from = cell.column ?? cursor;
      cursor = from + (cell.colSpan || 1);
    }
    most = Math.max(most, cursor);
  }
  return most;
}

// 이 표의 글자가 놓인 자리를 화면 글줄에서 찾아, 그 앞뒤에 사진이 있는지 봅니다.
// 사진 표는 한글파일에 사진 칸의 글자가 없어 이름 줄만 남습니다. 그 이름 줄
// 바로 앞에 사진 줄이 옵니다.
function nearPictures(lines, key) {
  for (let start = 0; start < lines.length; start += 1) {
    let joined = "";
    for (let end = start; end < lines.length; end += 1) {
      joined += bare(lines[end]);
      if (joined.length > key.length) break;
      if (joined !== key) continue;
      const around = [lines[start - 1] || "", ...lines.slice(start, end + 1)];
      return around.some((line) => line.includes("[[그림:"));
    }
  }
  return false;
}

let restored = 0;
let flattened = 0;
let placed = 0;
// 도형(네모)으로 그린 표입니다. 한글파일에는 표가 아니라 그림이라,
// 글자를 읽는 쪽에서는 칸 구분 없이 통째로 이어 붙습니다.
let shaped = 0;
const wantedChapters = new Map(); // 편 → 화면에 표로 살아난 안쪽 표 수

for (let id = 1; id <= 19; id += 1) {
  const file = path.join(assets, `chapter${id}-data.js`);
  if (!existsSync(file)) continue;
  const label = String(id).padStart(2, "0");
  const box = {};
  new Function("window", readFileSync(file, "utf8"))(box);
  const data = box[`CHAPTER${id}_DATA`];

  // 화면에 실린 글과, 표로 그려진 것들을 모아 둡니다.
  // 글은 줄 단위로 모읍니다. 글줄로 뭉개진 표를 찾으려면 그 글자가 어느
  // 줄에 이어져 있는지 봐야 하기 때문입니다.
  const shownLines = [];
  let shown = "";
  const drawn = new Set();
  const noteTable = (table) => {
    drawn.add(bare([table.headers || [], ...(table.rows || [])].flat().map((cell) => (cell || {}).text || "").join("")));
  };

  // 표가 놓인 자리가 본문 줄 수 안에 있는지도 함께 봅니다.
  const checkPlace = (where, lines, tables) => {
    for (const table of tables || []) {
      placed += 1;
      const start = table.lineStart ?? -1;
      const count = table.lineCount ?? 0;
      if (start < 0 || count <= 0 || start + count > lines.length) {
        problems.push(
          `제${label}편 ${where}: 표가 놓인 자리가 본문 밖입니다 ` +
            `(${start}부터 ${count}줄, 본문 ${lines.length}줄).`
        );
      }
    }
  };

  const walk = (where, tables) => {
    for (const table of tables || []) {
      noteTable(table);
      for (const cell of [table.headers || [], ...(table.rows || [])].flat()) {
        if (!cell) continue;
        shown += bare(cell.text || "");
        shownLines.push(...String(cell.text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
        if (!cell.tables) continue;
        restored += cell.tables.length;
        wantedChapters.set(label, (wantedChapters.get(label) || 0) + cell.tables.length);
        checkPlace(where, String(cell.text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean), cell.tables);
        walk(where, cell.tables);
      }
    }
  };

  for (const section of data.sections || []) {
    for (const block of section.contentBlocks || []) {
      const where = `${section.title} [${block.title}]`;
      const lines = String(block.body || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      shown += bare(block.body || "");
      shownLines.push(...lines);
      // 상자(TIP·법령)는 표로 그리지 않고 글줄로 폅니다. 그 안의 표는
      // 블록에 바로 달립니다.
      if (block.title === "TIP" || block.title === "관련법규 및 참고자료") {
        restored += (block.tables || []).length;
        wantedChapters.set(label, (wantedChapters.get(label) || 0) + (block.tables || []).length);
        for (const table of block.tables || []) noteTable(table);
      }
      checkPlace(where, lines, block.tables);
      walk(where, block.tables);
    }
  }

  // 원문에서 칸 안에 들었던 격자가 화면에서도 표인지 봅니다.
  for (const grid of allGrids[String(id)] || []) {
    if (grid.parent === undefined) continue;
    if (!(grid.rows >= 2 && grid.cols >= 2)) continue;
    const key = bare(grid.cells.map((cell) => cell.text).join(""));
    if (!key) continue;
    if (drawn.has(key)) {
      if (grid.shapes) shaped += 1;
      continue;
    }
    // 화면에 실리지 않은 지면(서식 견본, 편 첫머리 흐름도 상자)은 셈에서
    // 뺍니다. 글줄로 뭉개진 표는 그 글자가 본문에 통째로 이어져 나오므로,
    // 앞머리만 견주지 않고 글자 전부가 그대로 있을 때만 봅니다.
    // 앞머리만 보면, 같은 절차를 두 번 실은 편에서 화면에 실린 다른 표의
    // 글자에 걸려 있지도 않은 잘못을 알립니다(제2편 '제증명 발급 절차').
    if (!shown.includes(key)) continue;
    // 사진을 나란히 놓으려고 만든 안쪽 표는 표로 그리지 않습니다. 한글파일에는
    // 사진이 든 칸에 글자가 없어, 표로 옮기면 빈 칸과 사진이 엇갈려 늘어서고
    // 어느 이름이 어느 사진의 것인지 다시 알 수 없게 됩니다. 사진은 사진대로
    // 한 줄에 놓고 그 아래에 제 이름을 답니다(validate_manual_pictures.mjs).
    if (nearPictures(shownLines, key)) continue;
    flattened += 1;
    problems.push(
      grid.shapes
        ? `제${label}편: 도형으로 그린 ${grid.rows}행 ${grid.cols}열 표가 글줄로 남았습니다 ` +
          `('${key.slice(0, 40)}…'). 네모마다 적힌 자리로 표를 되살려야 합니다.`
        : `제${label}편: 칸 안에 든 ${grid.rows}행 ${grid.cols}열 표가 글줄로 남았습니다 ` +
          `('${key.slice(0, 40)}…').`
    );
  }
}

// 한글파일에 도형으로 그린 표가 있는데 하나도 못 살렸으면, 되살리는 쪽이
// 통째로 꺼져 있는 것입니다.
const shapesInSource = Object.values(allGrids)
  .flat()
  .filter((grid) => grid.shapes && grid.rows >= 2 && grid.cols >= 2).length;
if (shapesInSource && !shaped) {
  problems.push(
    `도형으로 그린 표 ${shapesInSource}개가 하나도 표로 살아나지 않았습니다. ` +
      "python3 scripts/read_hwpx_tables.py && node scripts/build_chapters_from_hwpx.mjs"
  );
}

if (!restored) {
  problems.push(
    "칸 안에 든 표가 하나도 표로 살아나지 않았습니다. " +
      "python3 scripts/read_hwpx_tables.py && node scripts/build_chapters_from_hwpx.mjs"
  );
}

if (problems.length) {
  problems.slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  if (problems.length > 20) console.error(`  … 외 ${problems.length - 20}건`);
  console.error(`\n칸 안에 든 표 문제 ${problems.length}건`);
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log(
    `칸 안에 든 표 ${restored}개가 표로 살아났습니다 (자리 ${placed}곳). ` +
      "(playwright가 없어 화면 확인은 건너뜁니다)"
  );
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

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
let seen = 0;

for (const [label] of wantedChapters) {
  if (only && !only.has(label)) continue;
  const box = {};
  new Function("window", readFileSync(path.join(assets, `chapter${Number(label)}-data.js`), "utf8"))(box);
  const data = box[`CHAPTER${Number(label)}_DATA`];

  for (const section of data.sections || []) {
    // 이 업무에 칸 안에 든 표가 있는지 봅니다.
    const deep = (tables) =>
      (tables || []).some(
        (table) =>
          [table.headers || [], ...(table.rows || [])]
            .flat()
            .some((cell) => cell && cell.tables && cell.tables.length) ||
          deep(
            [table.headers || [], ...(table.rows || [])]
              .flat()
              .flatMap((cell) => (cell && cell.tables) || [])
          )
      );
    const wanted = (section.contentBlocks || []).some(
      (block) =>
        ((block.title === "TIP" || block.title === "관련법규 및 참고자료") &&
          (block.tables || []).length) ||
        deep(block.tables)
    );
    if (!wanted) continue;

    await page.goto(`${base}/index.html?chapter=${label}#work=${section.id}`, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const steps = await page.evaluate(() =>
      [...document.querySelectorAll("#step-list [data-step-id]")].map((node) =>
        node.getAttribute("data-step-id")
      )
    );
    for (const step of steps.length ? steps : [""]) {
      const address = step
        ? `${base}/index.html?chapter=${label}#work=${section.id}&step=${step}`
        : `${base}/index.html?chapter=${label}#work=${section.id}`;
      await page.goto(address, { waitUntil: "load" });
      await page.waitForTimeout(250);
      const found = await page.evaluate(() => ({
        // 표 안에 표가 그려진 자리입니다.
        nested: document.querySelectorAll(
          "#step-actions .source-criteria-table .source-table-scroll table"
        ).length,
        // 상자 안에 표가 그려진 자리입니다.
        inNote: document.querySelectorAll("#step-actions .source-note-box table").length,
      }));
      seen += found.nested + found.inNote;
    }
  }
}

await browser.close();
if (server) server.kill();

if (!only && !seen) {
  console.error("화면에 칸 안의 표가 하나도 그려지지 않았습니다.");
  process.exit(1);
}

console.log(
  `칸 안에 든 표 ${restored}개가 표로 살아났습니다 · 자리 ${placed}곳 모두 본문 안 · ` +
    `화면에서 확인한 안쪽 표 ${seen}개 · 도형으로 그린 표 ${shaped}개 · ` +
    `글줄로 남은 격자 ${flattened}개`
);
