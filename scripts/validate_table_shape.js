// 화면에 실린 표에 통째로 빈 열·행이 없는지 확인합니다.
//
// 매뉴얼은 절차를 그림처럼 그릴 때 표를 씁니다. 화살표 자리, 여백 자리로
// 빈 열과 빈 행을 끼워 넣는데, 화살표를 글자가 아니라 그림으로 그려 둔 곳은
// 그 칸이 통째로 비어 있습니다. 그대로 옮기면 폭만 차지하는 빈 열이 남습니다.
//
//   제8편 '정원 관리' 승인절차 표
//   <사전 승인 요구>가 세 열에 걸쳐 있다는 이유로 그 아래 빈 가운뎃열이
//   살아남아, 화면에서 아무것도 없는 열이 폭을 8%나 차지했습니다.
//
// 빌더(dropEmptyLines)가 걷어내야 합니다. 여기서는 결과만 봅니다.
//
// 사용법: node scripts/validate_table_shape.js

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "docs", "assets");

const problems = [];
let checked = 0;

function shapeOf(table) {
  const rows = [table.headers || [], ...(table.rows || [])];
  let columns = 0;
  for (const row of rows) {
    let at = 0;
    for (const cell of row) {
      const from = cell.column ?? at;
      at = from + (cell.colSpan || 1);
    }
    columns = Math.max(columns, at);
  }
  // 글자가 든 칸은 '시작하는' 열·행만 채웁니다. 걸친 칸이 지나간다고
  // 그 자리에 읽을 것이 생기지는 않습니다(빌더와 같은 규칙).
  const columnHasText = new Array(columns).fill(false);
  const rowHasText = rows.map(() => false);
  rows.forEach((row, index) => {
    let at = 0;
    for (const cell of row) {
      const from = cell.column ?? at;
      if (String(cell.text || "").trim()) {
        columnHasText[from] = true;
        rowHasText[index] = true;
      }
      at = from + (cell.colSpan || 1);
    }
  });
  return { columns, rows: rows.length, columnHasText, rowHasText };
}

for (let id = 1; id <= 19; id += 1) {
  const file = path.join(assets, `chapter${id}-data.js`);
  if (!fs.existsSync(file)) continue;
  const box = {};
  new Function("window", fs.readFileSync(file, "utf8"))(box);
  const data = box[`CHAPTER${id}_DATA`];
  for (const section of data.sections || []) {
    for (const block of section.contentBlocks || []) {
      for (const table of block.tables || []) {
        checked += 1;
        const shape = shapeOf(table);
        const where = `제${String(id).padStart(2, "0")}편 ${section.title} [${block.title}]`;
        const blankColumns = shape.columnHasText.filter((has) => !has).length;
        const blankRows = shape.rowHasText.filter((has) => !has).length;
        if (blankColumns) {
          problems.push(
            `${where}: ${shape.rows}행 ${shape.columns}열 가운데 빈 열이 ${blankColumns}개 있습니다.`
          );
        }
        if (blankRows) {
          problems.push(
            `${where}: ${shape.rows}행 가운데 빈 행이 ${blankRows}개 있습니다.`
          );
        }
      }
    }
  }
}

if (problems.length) {
  problems.slice(0, 25).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n빈 줄이 남은 표 ${problems.length}개`);
  process.exit(1);
}
console.log(`표 ${checked}개 모두 빈 열·행이 없습니다.`);
