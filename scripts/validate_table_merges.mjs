// 화면에 실린 표가 한글파일의 셀병합과 열 너비를 그대로 지녔는지 확인합니다.
//
// 표의 참 모습은 한글파일에 적힌 칸 주소입니다(scripts/read_hwpx_tables.py).
// build_chapters_from_hwpx.mjs는 글자가 같은 표끼리 짝지어 그 칸 주소를
// 가져옵니다. 짝을 찾지 못한 표는 병합 없이 한 칸씩 늘어놓은 격자가 되고,
// 열 너비도 잃어 화면이 어림한 너비로 그립니다.
//
//   제7편 '구비서류' 표
//   원문 : '공통 서류'가 4줄에 걸친 한 칸
//   화면 : 네 줄 모두 따로, 왼쪽 열만 쓸데없이 넓음
//
// 그래서 여기서는 짝짓기가 잘됐는지가 아니라, 결과가 원문과 같은지를 봅니다.
// 한글파일 격자에 병합이 있으면 화면 데이터에도 병합이 있어야 합니다.
//
// tmp/hwpx-tables.json이 있어야 돕니다. 없으면 건너뜁니다.
//   python3 scripts/read_hwpx_tables.py       (npm run build:source에 들어 있습니다)
//
// 사용법: node scripts/validate_table_merges.mjs

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

// build_chapters_from_hwpx.mjs의 bare와 같은 규칙입니다. 글머리표·화살표처럼
// 한쪽에만 있는 꾸밈 글자를 빼고 글자만 견줍니다.
const DECORATION = /[-–—•◦‣▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）[\]［］]/g;
const bare = (value) => String(value ?? "").replace(/\s/g, "").replace(DECORATION, "");

// 글자가 든 칸의 병합만 셉니다. 빈 칸의 병합은 화면에서 사라져도 됩니다.
// 빌더가 글자 없는 행·열을 걷어내기 때문입니다(dropEmptyLines).
// 원문 표에는 줄을 긋기만 하려고 만든 빈 병합 칸이 흔합니다.
const merged = (cells) =>
  cells.filter(
    (cell) => String(cell.text || "").trim() && ((cell.colSpan || 1) > 1 || (cell.rowSpan || 1) > 1)
  );

// 빌더는 글자 없는 행·열을 걷어내고 병합 크기를 그만큼 줄입니다.
// 그림처럼 그린 표는 빈 열이 많아, 일곱 칸에 걸친 칸이 걷어내고 나면
// 한 칸이 되기도 합니다. 그런 자리는 병합이 사라지는 것이 맞습니다.
// 그래서 원문 격자도 같은 방식으로 줄여 놓고 견줍니다.
function pruned(grid) {
  const rowHas = new Array(grid.rows).fill(false);
  const colHas = new Array(grid.cols).fill(false);
  for (const cell of grid.cells) {
    if (!String(cell.text || "").trim()) continue;
    rowHas[cell.row] = true;
    colHas[cell.col] = true;
  }
  const keptRow = [];
  const keptCol = [];
  rowHas.forEach((has, at) => has && keptRow.push(at));
  colHas.forEach((has, at) => has && keptCol.push(at));
  return grid.cells.map((cell) => ({
    text: cell.text,
    colSpan: keptCol.filter((at) => at >= cell.col && at < cell.col + (cell.colSpan || 1)).length || 1,
    rowSpan: keptRow.filter((at) => at >= cell.row && at < cell.row + (cell.rowSpan || 1)).length || 1,
  }));
}

const allGrids = JSON.parse(readFileSync(gridFile, "utf8"));
const problems = [];
let checked = 0;

for (let id = 1; id <= 19; id += 1) {
  const file = path.join(assets, `chapter${id}-data.js`);
  if (!existsSync(file)) continue;
  const box = {};
  new Function("window", readFileSync(file, "utf8"))(box);
  const data = box[`CHAPTER${id}_DATA`];

  // 화면에 실린 표를 글자 열쇠로 모아 둡니다.
  const shown = new Map();
  for (const section of data.sections || []) {
    for (const block of section.contentBlocks || []) {
      for (const table of block.tables || []) {
        const cells = [table.headers, ...table.rows].flat();
        const key = bare(cells.map((cell) => cell.text).join(""));
        if (!key) continue;
        if (!shown.has(key)) shown.set(key, []);
        shown.get(key).push({ cells, table, where: `${section.title} [${block.title}]` });
      }
    }
  }

  // 같은 글자를 가진 격자가 둘 이상일 때가 있습니다. 그림처럼 그린 표는
  // 바깥 표와 그 안에 든 표가 같은 글자를 지니기 때문입니다. 그때는
  // 병합이 필요 없는 쪽도 답이 될 수 있으므로, 모든 후보가 병합을 요구할 때만
  // 잘못으로 봅니다.
  const byKey = new Map();
  for (const grid of allGrids[String(id)] || []) {
    if (!grid.cells.length) continue;
    const key = bare(grid.cells.map((cell) => cell.text).join(""));
    if (!key || !shown.has(key)) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(grid);
  }

  for (const [key, grids] of byKey) {
    const wants = grids.map((grid) => merged(pruned(grid)));
    if (wants.some((want) => !want.length)) continue;
    for (const seat of shown.get(key)) {
      checked += 1;
      if (merged(seat.cells).length) continue;
      const grid = grids[0];
      const merges = wants[0];
      problems.push(
        `제${String(id).padStart(2, "0")}편 ${seat.where}: 원문은 ${grid.rows}행 ${grid.cols}열에 ` +
          `병합 ${merges.length}칸인데 화면 표에는 병합이 없습니다 ` +
          `(예: '${String(merges[0].text).replace(/\s+/g, " ").slice(0, 14)}' ` +
          `${merges[0].colSpan}x${merges[0].rowSpan}).`
      );
    }
  }
}

if (problems.length) {
  problems.slice(0, 30).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n병합을 잃은 표 ${problems.length}개`);
  process.exit(1);
}
console.log(`병합이 있는 표 ${checked}개가 모두 원문대로 병합돼 있습니다.`);
