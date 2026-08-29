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

// 절차를 잇는 화살표만 든 칸입니다(build_chapters_from_hwpx.mjs와 같은 기준).
const ARROW_ONLY = /^[\s⇨⇦⇩⇧⇒⇐→←↑↓➡➔➜⟹≫▼▶►]+$/u;

// 세로줄이 통째로 화살표인 자리로 갈린 표인지 셉니다.
// build_chapters_from_hwpx.mjs의 stepChain과 같은 규칙입니다. 규칙이 다르면
// 있지도 않은 잘못을 알립니다.
function chainOf(table) {
  const rows = [table.headers || [], ...(table.rows || [])];
  if (!rows.length) return null;
  let columns = 0;
  for (const row of rows) {
    for (const cell of row) {
      columns = Math.max(columns, (cell.column ?? 0) + (cell.colSpan || 1));
    }
  }
  if (columns < 3) return null;
  const cover = Array.from({ length: rows.length }, () => new Array(columns).fill(null));
  rows.forEach((row, at) => {
    for (const cell of row) {
      const from = cell.column ?? 0;
      for (let down = 0; down < (cell.rowSpan || 1); down += 1) {
        for (let right = 0; right < (cell.colSpan || 1); right += 1) {
          if (cover[at + down]) cover[at + down][from + right] = cell;
        }
      }
    }
  });
  const isLink = [];
  for (let column = 0; column < columns; column += 1) {
    let some = false;
    let all = true;
    for (let at = 0; at < rows.length; at += 1) {
      const cell = cover[at][column];
      if (!cell) continue;
      const text = String(cell.text || "").trim();
      if (!text) continue;
      some = true;
      if (!ARROW_ONLY.test(text) || (cell.colSpan || 1) > 1) all = false;
    }
    isLink.push(some && all);
  }
  if (!isLink.some(Boolean)) return null;
  const steps = [];
  let from = -1;
  for (let column = 0; column <= columns; column += 1) {
    if (column < columns && !isLink[column]) {
      if (from < 0) from = column;
      continue;
    }
    if (from >= 0) steps.push([from, column - 1]);
    from = -1;
  }
  if (steps.length < 2) return null;
  for (let at = 1; at < steps.length; at += 1) {
    let between = false;
    for (let column = steps[at - 1][1] + 1; column < steps[at][0]; column += 1) {
      if (isLink[column]) between = true;
    }
    if (!between) return null;
  }
  return { steps };
}

const problems = [];
let checked = 0;
let pictures = 0;
let flows = 0;

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
        // 절차로 그리는 표는 원문이 정말 그 모양일 때만 그렇게 그립니다.
        // 원문에 없는 모양을 지어내면 원문의 자리를 잃습니다. 예전에 절차도를
        // 카드로 다시 그렸다가 가지가 갈라지는 그림을 펼 수 없어 카드 한 장에
        // 열세 줄이 들어갔습니다(제8편 '촉탁직 노동자 (재)고용').
        //
        // 빌더가 적어 둔 단계 구간(flow.steps)이 정말 화살표 열로 갈린
        // 자리인지 여기서 다시 셉니다.
        if (table.flow) {
          flows += 1;
          // 그림으로 그린 표는 절차 카드로 다시 그리지 않습니다.
          //
          // 그림에서는 빈 칸이 곧 모양입니다. 갈래가 갈리는 자리, 화살표가
          // 지나가는 자리가 다 빈 칸으로 잡혀 있습니다. 그것을 단계 상자로
          // 잘라 놓으면 빈 칸마다 테두리가 둘려, 속이 텅 빈 상자와 어긋난
          // 격자가 줄줄이 생깁니다
          // (제8편 '촉탁직 노동자 (재)고용', '장애인 노동자 채용').
          if (table.picture) {
            problems.push(
              `${where}: 그림으로 그린 표를 절차 카드로 다시 그리고 있습니다. ` +
                "그림에서는 빈 칸이 곧 모양이라, 단계로 자르면 빈 상자가 줄줄이 생깁니다."
            );
          }
          const said = chainOf(table);
          const kept = JSON.stringify((table.flow.steps || []).map((one) => [one[0], one[1]]));
          if (!said) {
            problems.push(
              `${where}: 원문이 절차가 아닌데 절차로 그리고 있습니다. ` +
                "세로줄이 통째로 화살표인 자리로 갈린 표만 이어서 그립니다."
            );
          } else if (JSON.stringify(said.steps) !== kept) {
            problems.push(
              `${where}: 적어 둔 단계 자리가 원문과 다릅니다 ` +
                `(원문 ${JSON.stringify(said.steps)}, 적어 둔 것 ${kept}).`
            );
          }
        }
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
          // 빈 칸이 하나도 없으면 그림이 아닙니다(빈 열·행까지 있을 필요는
          // 없습니다. 그림은 빈 칸이 여기저기 흩어져 있기도 합니다).
          //
          // 다만 빈 칸만이 모양을 만드는 것은 아닙니다. 원문이 **테두리로**
          // 모양을 만든 표도 원문 자리 그대로 그려야 합니다.
          //   칸의 위나 아래가 트임 → 위아래 칸과 한 상자
          //   칸의 양옆이 트임      → 상자와 상자 사이의 띠
          // (제2편 '1. 발급 절차'는 빈 칸 없이 트인 테두리만으로 그렸습니다.)
          const cells = [table.headers || [], ...(table.rows || [])].flat();
          const shapedByBorders =
            cells.filter((cell) => {
              const border = String((cell && cell.border) || "");
              if (border.length !== 4) return false;
              const joined =
                border[0] !== "n" && border[1] !== "n" && (border[2] === "n" || border[3] === "n");
              const band =
                border[0] === "n" && border[1] === "n" && border[2] !== "n" && border[3] !== "n";
              return joined || band;
            }).length >= 2;
          if (
            !shapedByBorders &&
            !cells.some((cell) => cell && !String(cell.text || "").trim())
          ) {
            problems.push(`${where}: 빈 칸이 없는데 그림형 표로 표시되어 있습니다.`);
          }
          // 그림은 칸마다 원문에 적힌 선을 그어야 합니다. 선이 없으면
          // 화면이 한결같이 그어 모눈종이가 됩니다.
          if (!cells.some((cell) => cell && cell.border)) {
            problems.push(`${where}: 그림형 표인데 칸 테두리가 없습니다. read_hwpx_tables.py를 다시 돌리세요.`);
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
          if (!key) continue;
          if (!onScreen.has(key)) onScreen.set(key, { table, section, block, all: [] });
          onScreen.get(key).all.push(table);
        }
      }
    }
    // 절차를 잇는 화살표가 화면에서도 그 자리에 서 있는지 봅니다.
    // 화살표 칸은 글자가 없어 보여, 빈 열을 걷어내는 규칙에 함께 쓸려 나갑니다.
    // 그러면 이어지던 절차가 낱개 상자로 흩어집니다
    // (제1편 신원조사 'e하나로민원 권한신청 및 이용').
    for (const grid of allGrids[String(id)] || []) {
      const arrows = grid.cells.filter((cell) => ARROW_ONLY.test(String(cell.text || ""))).length;
      if (!arrows) continue;
      const key = bare(grid.cells.map((cell) => cell.text).join(""));
      const found = onScreen.get(key);
      if (!found) continue;
      // 글자만 견주면 바깥 상자와 안쪽 표가 같은 것으로 보입니다(화살표는
      // 견줄 때 빼기 때문입니다). 같은 글자를 가진 표 가운데 화살표가 가장
      // 많이 살아 있는 것을 봅니다. 안쪽 표에 화살표가 그대로 있는데 바깥
      // 상자만 보고 '다 없어졌다'고 알린 적이 있습니다.
      const drawn = Math.max(
        ...(onScreen.get(key).all || [found.table]).map(
          (one) =>
            [one.headers || [], ...(one.rows || [])]
              .flat()
              .filter((cell) => cell && ARROW_ONLY.test(String(cell.text || ""))).length
        )
      );
      if (drawn >= arrows) continue;
      problems.push(
        `제${String(id).padStart(2, "0")}편 ${found.section.title} [${found.block.title}]: ` +
          `절차를 잇는 화살표 ${arrows}개 가운데 ${drawn}개만 남았습니다. ` +
          "빈 열을 걷어낼 때 화살표 칸까지 쓸려 나갔습니다."
      );
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
    `(그림형 표 ${pictures}개는 원문 자리를 그대로 두었습니다 · ` +
    `한 줄기 절차 ${flows}개).`
);
