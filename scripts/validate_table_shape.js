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
// 다만 매뉴얼이 표로 '그림'을 그린 자리는 빈 칸이 곧 모양입니다.
// 서가 배치도(제1편), 시차출퇴근 개념도(제4편), 성과평가위원회 구성도(제13편),
// 빈 대장 서식(제12편)이 그렇습니다. 빈 열을 걷어내면 머리글이 걸친 칸 수와
// 아래 칸의 자리가 어긋나 그림이 통째로 무너집니다. 실제로 서가 배치도에서
// 열 열한 개가 빠지면서 ○이 제 서가를 벗어났습니다.
// 그런 표는 빌더가 picture로 표시해 원문 자리를 그대로 둡니다.
// 여기서는 자리를 잃지 않았는지를 대신 봅니다.
//
// 사용법: node scripts/validate_table_shape.js

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "docs", "assets");

const problems = [];
let checked = 0;
let pictures = 0;

// 칸 안에 든 표도 함께 봅니다. 매뉴얼은 상자 안에, 표 칸 안에 표를 또
// 그려 넣습니다(제1편 기록물 관리 TIP '서가배치').
function* walkTables(tables) {
  for (const table of tables || []) {
    yield table;
    for (const cell of [table.headers || [], ...(table.rows || [])].flat()) {
      if (cell && cell.tables) yield* walkTables(cell.tables);
    }
  }
}

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
      for (const table of walkTables(block.tables)) {
        checked += 1;
        const shape = shapeOf(table);
        const where = `제${String(id).padStart(2, "0")}편 ${section.title} [${block.title}]`;
        const blankColumns = shape.columnHasText.filter((has) => !has).length;
        const blankRows = shape.rowHasText.filter((has) => !has).length;
        // 매뉴얼이 표로 '그림'을 그린 자리는 빈 칸이 곧 모양입니다.
        // 서가 배치도, 시차출퇴근 개념도, 성과평가위원회 구성도, 빈 대장 서식.
        // 여기서는 빈 열·행이 있는 것이 맞습니다. 대신 원문 자리를 그대로
        // 두었는지(열 수와 원문 열 너비 수가 같은지)를 봅니다.
        if (table.picture) {
          pictures += 1;
          const widths = (table.widths || []).length;
          if (widths !== shape.columns) {
            problems.push(
              `${where}: 그림형 표인데 원문 자리를 잃었습니다 ` +
                `(화면 ${shape.columns}열, 원문 너비 ${widths}개).`
            );
          }
          // 그림이 아닌 표에 그림표를 붙이면 빈 열이 그대로 남습니다.
          if (!blankColumns && !blankRows) {
            problems.push(`${where}: 빈 칸이 없는데 그림형 표로 표시되어 있습니다.`);
          }
          continue;
        }
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

// 원문에서 그림으로 그린 표를 화면이 빠짐없이 그림으로 알아봤는지 봅니다.
//
// 이것을 보지 않던 때, 서가 배치도가 그냥 표로 그려졌습니다. 빈 열이 걷히고
// 낱말이 안 끊기게 폭이 늘어나, 원문에서 폭 162mm에 든 그림이 1300px로 부풀어
// 가로 스크롤이 붙은 채 ○이 제 서가를 벗어났습니다. 가로 스크롤은 열이 많은
// 표에서 정상이라 다른 검사기가 잡지 못했습니다.
const gridFile = path.join(root, "tmp", "hwpx-tables.json");
if (fs.existsSync(gridFile)) {
  const allGrids = JSON.parse(fs.readFileSync(gridFile, "utf8"));
  const DECORATION =
    /[-–—•◦‣▪▫▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）[\]［］]/g;
  const bare = (value) =>
    String(value ?? "")
      .replace(/\s/g, "")
      .replace(/\[\[그림:[^\]]*\]\]/g, "")
      .replace(DECORATION, "");
  // 빌더(drawnAsPicture)와 같은 기준입니다. 다르면 있지도 않은 잘못을 알립니다.
  const isPictureGrid = (grid) =>
    grid.cells.filter((cell) => !String(cell.text).trim()).length * 2 > grid.cells.length &&
    grid.cols >= 8;

  for (let id = 1; id <= 19; id += 1) {
    const file = path.join(assets, `chapter${id}-data.js`);
    if (!fs.existsSync(file)) continue;
    const box = {};
    new Function("window", fs.readFileSync(file, "utf8"))(box);
    const data = box[`CHAPTER${id}_DATA`];
    const onScreen = new Map();
    for (const section of data.sections || []) {
      for (const block of section.contentBlocks || []) {
        for (const table of walkTables(block.tables)) {
          const key = bare(
            [table.headers || [], ...(table.rows || [])]
              .flat()
              .map((cell) => (cell || {}).text || "")
              .join("")
          );
          if (key && !onScreen.has(key)) onScreen.set(key, { table, section, block });
        }
      }
    }
    for (const grid of allGrids[String(id)] || []) {
      if (!isPictureGrid(grid)) continue;
      const key = bare(grid.cells.map((cell) => cell.text).join(""));
      const found = onScreen.get(key);
      if (!found || found.table.picture) continue;
      problems.push(
        `제${String(id).padStart(2, "0")}편 ${found.section.title} [${found.block.title}]: ` +
          `원문이 표로 그린 그림(${grid.rows}행 ${grid.cols}열)인데 보통 표로 그렸습니다. ` +
          "빈 열이 걷히면서 원문 자리가 무너집니다."
      );
    }
  }
}

if (problems.length) {
  problems.slice(0, 25).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n빈 줄이 남은 표 ${problems.length}개`);
  process.exit(1);
}
console.log(
  `표 ${checked}개 모두 빈 열·행이 없습니다 ` +
    `(그림형 표 ${pictures}개는 원문 자리를 그대로 두었습니다).`
);
