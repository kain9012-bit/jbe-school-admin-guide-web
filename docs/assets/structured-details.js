(function () {
  "use strict";

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const normalizeLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const bodyLines = (body) =>
    String(body || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  const row = (label, tokens = [label]) => ({ label, tokens });

  function matchLabelAt(lines, index, spec) {
    let remainder = "";
    for (let tokenIndex = 0; tokenIndex < spec.tokens.length; tokenIndex += 1) {
      const line = normalizeLine(lines[index + tokenIndex]);
      const token = normalizeLine(spec.tokens[tokenIndex]);
      if (!line) return null;
      if (tokenIndex < spec.tokens.length - 1) {
        if (line !== token) return null;
      } else if (line === token) {
        remainder = "";
      } else if (line.startsWith(`${token} `)) {
        remainder = line.slice(token.length).trim();
      } else {
        return null;
      }
    }
    return { consumed: spec.tokens.length, remainder };
  }

  function findHeaderIndex(lines) {
    return lines.findIndex((line) => /^구\s*분\s+내\s*용$/.test(normalizeLine(line)));
  }

  function logicalItems(lines) {
    const items = [];
    for (const rawLine of lines) {
      const line = normalizeLine(rawLine);
      if (!line) continue;
      // 매뉴얼이 쓰는 글머리표는 판마다 다릅니다. ▸와 ▶는 다른 글자입니다.
      const startsItem = /^(?:[•‣▸▹▶▪□○◦※*]|[-–]\s|\d+[.)]\s|[가-힣]\.\s)/.test(line);
      if (!items.length || startsItem) items.push(line);
      else items[items.length - 1] += ` ${line}`;
    }
    return items;
  }

  function cellMarkup(lines) {
    const items = logicalItems(lines);
    if (!items.length) return "—";
    if (items.length === 1) return escapeHtml(items[0]);
    return `<ul>${items
      .map((item) => `<li>${escapeHtml(item.replace(/^[•‣▸▹▶▪□○◦]\s*/, ""))}</li>`)
      .join("")}</ul>`;
  }

  function parseTwoColumn(body, schema) {
    const lines = bodyLines(body);
    const headerIndex = findHeaderIndex(lines);
    if (headerIndex < 0) return null;
    const positions = [];
    let cursor = headerIndex + 1;

    for (const spec of schema.rows) {
      let found = null;
      for (let index = cursor; index < lines.length; index += 1) {
        const match = matchLabelAt(lines, index, spec);
        if (match) {
          found = { index, ...match, spec };
          break;
        }
      }
      if (!found) return null;
      positions.push(found);
      cursor = found.index + found.consumed;
    }

    const rows = positions.map((position, index) => {
      const nextStart = positions[index + 1]?.index ?? lines.length;
      const content = [];
      if (position.remainder) content.push(position.remainder);
      content.push(...lines.slice(position.index + position.consumed, nextStart));
      return [position.spec.label, content];
    });

    const prefix = lines.slice(0, headerIndex);
    return {
      prefix,
      rows,
    };
  }

  function plainCellText(value) {
    const source = Array.isArray(value) ? value.join(" ") : String(value ?? "");
    return normalizeLine(source.replace(/<[^>]*>/g, " "));
  }

  function visualLength(value) {
    return [...plainCellText(value)].reduce((length, character) => {
      if (/\s/.test(character)) return length + 0.35;
      if (/[가-힣一-龥ぁ-ゔァ-ヴー々〆〤]/.test(character)) return length + 1;
      return length + 0.58;
    }, 0);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function contentAwareColumnWidths(headers, rows) {
    const columnCount = headers.length;
    const columnValues = headers.map((header, columnIndex) => [
      header,
      ...rows.map((cells) => cells[columnIndex]),
    ]);
    const longest = columnValues.map((values) =>
      Math.max(...values.map((value) => visualLength(value)))
    );

    if (columnCount === 2) {
      const labelWidth = clamp(10 + longest[0] * 1.45, 16, 30);
      return [labelWidth, 100 - labelWidth];
    }

    if (columnCount === 3) {
      let firstWidth = clamp(10 + longest[0] * 1.35, 15, 24);
      let secondWidth = clamp(10 + longest[1] * 1.05, 16, 24);
      const descriptorTotal = firstWidth + secondWidth;
      if (descriptorTotal > 46) {
        const scale = 46 / descriptorTotal;
        firstWidth *= scale;
        secondWidth *= scale;
      }
      return [firstWidth, secondWidth, 100 - firstWidth - secondWidth];
    }

    return Array.from({ length: columnCount }, () => 100 / columnCount);
  }

  // 병합된 칸은 한글이 '이 칸이 몇 칸·몇 줄을 차지한다'고 적어 둔 그대로 그립니다.
  // 병합에 가려 사라진 자리는 빈 칸 표시가 아니라 아예 그리지 않습니다.
  function spanAttributes(cell) {
    const colSpan = cell && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
    const rowSpan = cell && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";
    return `${colSpan}${rowSpan}`;
  }

  // 칸이 격자에서 어디에 있는지는 한글파일에 적힌 주소(column)를 씁니다.
  // 주소가 없는 표는 칸 하나가 격자 한 칸씩 차례대로 놓인 것으로 봅니다.
  // 차례만 보고 자리를 세면, 병합된 칸이 있는 표가 통째로 밀립니다.
  function visibleCells(rows) {
    const covered = rows.map(() => []);
    const result = [];
    for (const [rowIndex, row] of rows.entries()) {
      const line = [];
      for (const [index, cell] of row.entries()) {
        const column = Number.isInteger(cell.column) ? cell.column : index;
        if (covered[rowIndex][column]) continue;
        const colSpan = cell.colSpan || 1;
        const rowSpan = cell.rowSpan || 1;
        for (let down = 0; down < rowSpan; down += 1) {
          for (let across = 0; across < colSpan; across += 1) {
            if (down === 0 && across === 0) continue;
            const target = covered[rowIndex + down];
            if (target) target[column + across] = true;
          }
        }
        line.push({ ...cell, column });
      }
      result.push(line);
    }
    return result;
  }

  // ── 그림형 표 ────────────────────────────────────────────────────────────
  //
  // 매뉴얼에는 흐름도·구성도를 표 칸에 그려 넣은 자리가 있습니다.
  // 칸 하나에 '≫'만 넣어 화살표를 그리고, 자리를 맞추려고 빈 칸을 늘어놓습니다.
  // 그것은 표가 아니라 그림입니다. 그대로 격자로 옮기면 빈 칸만 줄줄이 보이고
  // 화살표가 한 칸을 차지해, 어디서 어디로 가는 흐름인지 알 수 없습니다.
  //   예) 제19편 물품 관리 처리 절차, 제19편 기타 관리, 제13편 성과평가위원회 구성도
  //
  // 그래서 이런 표는 격자 대신 흐름도로 그립니다. 모양은 업무 흐름도와 같습니다.
  // 여기서 가려내는 기준은 validate_table_fit.mjs가 화면을 보고 다시 확인합니다.

  // 매뉴얼 판마다 화살표 글자가 다릅니다. 여기 빠진 글자는 그냥 글로 보여
  // 그 표가 흐름도로 바뀌지 않습니다.
  const ARROW_ONLY = /^[\s≫⇒→⇨⟹⟶▶►»＞>↓⇓▼⇩⇙⇘⇗⇖←⇐⟵◀◁]+$/u;
  const SIDE_ARROW = /^[\s≫⇒→⇨⟹⟶▶►»＞>]+$/u;
  const DOWN_ARROW = /[↓⇓▼⇩⇙⇘]/u;
  // 이름표로 쓰기에 너무 긴 글이 든 칸은 그림이 아니라 내용입니다.
  const FLOW_LABEL_LIMIT = 40;

  const cellText = (cell) => String((cell && cell.text) || "");
  const isBlankCell = (cell) => !cellText(cell).trim();
  const isArrowCell = (cell) => {
    const value = cellText(cell).trim();
    return Boolean(value) && ARROW_ONLY.test(value);
  };
  const isSideArrowCell = (cell) => {
    const value = cellText(cell).trim();
    return Boolean(value) && SIDE_ARROW.test(value);
  };

  // 한글에서 세로로 쓴 글자는 한 줄에 한 글자씩 들어 있습니다('위\n촉\n위\n원\n1').
  // 그대로 항목으로 나누면 글자 하나짜리 항목이 줄줄이 생깁니다.
  function flowCellLines(cell) {
    const lines = cellText(cell)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 1 && lines.every((line) => [...line].length === 1)) {
      return [lines.join("")];
    }
    if (lines.length > 1 && lines.slice(1).every((line) => [...line].length <= 2)) {
      return [lines.join(" ")];
    }
    return lines;
  }

  // 한 단계는 이름 한 줄과 그에 딸린 줄들입니다.
  function flowStage(cells) {
    const lines = cells.flatMap(flowCellLines);
    if (!lines.length) return null;
    return { name: lines[0], notes: lines.slice(1) };
  }

  function columnExtent(grid) {
    return grid.reduce((most, row) => {
      let at = most;
      for (const cell of row) at = Math.max(at, cell.column + (cell.colSpan || 1));
      return at;
    }, 0);
  }

  // 표를 세로로 가로지르는 '화살표만 든 열'입니다. 이 열이 단계를 나눕니다.
  // 줄마다 하나씩 놓인 화살표는 단계를 나누는 것이 아니라 그 줄 안의 이음표입니다
  // (제18편 도로 표지판: 줄마다 '단계 ⇒ 설명'). 그래서 화살표가 하나뿐이거나
  // 여러 줄에 걸쳐 있는 열만 단계 경계로 봅니다.
  function flowStageColumns(grid, columnCount) {
    const found = [];
    for (let column = 0; column < columnCount; column += 1) {
      let arrows = 0;
      let spanning = false;
      let other = false;
      for (const row of grid) {
        for (const cell of row) {
          if (cell.column !== column) continue;
          if (isSideArrowCell(cell)) {
            arrows += 1;
            if ((cell.rowSpan || 1) > 1) spanning = true;
          } else if (!isBlankCell(cell)) {
            other = true;
          }
        }
      }
      if (arrows && !other && (arrows === 1 || spanning)) found.push(column);
    }
    return found;
  }

  // 아래를 가리키는 화살표만 든 줄입니다. 위아래 단계를 잇습니다.
  const isConnectorRow = (row) =>
    row.some((cell) => isArrowCell(cell) && DOWN_ARROW.test(cellText(cell))) &&
    row.every((cell) => isArrowCell(cell) || isBlankCell(cell));

  // 표를 흐름도의 뼈대로 옮깁니다. 그림형 표가 아니면 null을 돌려줍니다.
  function flowFromTable(headers, rows) {
    const grid = visibleCells([headers, ...(rows || [])]);
    const columnCount = columnExtent(grid);
    if (!columnCount) return null;

    // 1) 가로 흐름 — 화살표 열이 단계를 나눕니다.
    const columns = flowStageColumns(grid, columnCount);
    if (columns.length) {
      const bounds = [-1, ...columns, columnCount];
      const steps = [];
      for (let index = 0; index < bounds.length - 1; index += 1) {
        const from = bounds[index] + 1;
        const to = bounds[index + 1];
        if (from >= to) continue;
        const cells = [];
        for (const row of grid) {
          for (const cell of row) {
            if (cell.column < from || cell.column >= to) continue;
            if (isArrowCell(cell) || isBlankCell(cell)) continue;
            cells.push(cell);
          }
        }
        const stage = flowStage(cells);
        if (stage) steps.push(stage);
      }
      if (steps.length >= 2) {
        return { lines: [{ type: "steps", linked: true, steps }] };
      }
    }

    // 2) 줄 단위 — 아래로 잇는 화살표 줄, 또는 줄마다 놓인 화살표 열이 있는 표입니다.
    const arrowColumns = [];
    for (let column = 0; column < columnCount; column += 1) {
      let arrows = 0;
      let other = false;
      for (const row of grid) {
        for (const cell of row) {
          if (cell.column !== column) continue;
          if (isArrowCell(cell)) arrows += 1;
          else if (!isBlankCell(cell)) other = true;
        }
      }
      if (arrows && !other) arrowColumns.push(column);
    }
    const connectors = grid.map(isConnectorRow);
    if (connectors.some(Boolean) || arrowColumns.length) {
      const lines = [];
      // 세로 흐름의 첫 줄은 대개 '절 차 / 방 법' 같은 머리글입니다.
      // 단계로 세우면 없는 단계가 하나 생깁니다.
      const head = grid[0] || [];
      const skipHead =
        connectors.some(Boolean) &&
        !connectors[0] &&
        head.length >= 2 &&
        !head.some(isArrowCell) &&
        head.every((cell) => [...cellText(cell).trim()].length <= 12);

      for (const [index, row] of grid.entries()) {
        if (skipHead && index === 0) continue;
        if (connectors[index]) {
          if (lines.length && lines[lines.length - 1].type !== "down") lines.push({ type: "down" });
          continue;
        }
        // 줄 안에 옆으로 잇는 화살표가 있으면 그 줄이 곧 하나의 흐름입니다.
        const chained = row.some(isSideArrowCell);
        const cells = row.filter((cell) => !isBlankCell(cell) && !isArrowCell(cell));
        if (!cells.length) continue;
        if (chained) {
          lines.push({
            type: "steps",
            linked: true,
            steps: cells.map((cell) => flowStage([cell])).filter(Boolean),
          });
        } else if (
          cells.length >= 2 &&
          cells
            .slice(1)
            .some((cell) => [...cellText(cell).trim()].length > FLOW_LABEL_LIMIT)
        ) {
          // '절차 | 방법'처럼 뒷칸이 설명인 줄은 이름 아래에 설명을 답니다.
          const stage = flowStage(cells);
          if (stage) lines.push({ type: "steps", linked: false, steps: [stage] });
        } else {
          lines.push({
            type: "steps",
            linked: false,
            steps: cells.map((cell) => flowStage([cell])).filter(Boolean),
          });
        }
      }
      while (lines.length && lines[lines.length - 1].type === "down") lines.pop();
      if (lines.filter((line) => line.type === "steps").length >= 2) return { lines };
    }

    // 3) 배치형 — 화살표는 없고 격자를 그림 종이로만 쓴 표입니다(구성도).
    //    칸의 절반 넘게가 비어 있고, 글이 든 칸은 모두 짧은 이름표입니다.
    const all = grid.flat();
    const blanks = all.filter(isBlankCell).length;
    if (
      all.length >= 6 &&
      blanks * 2 > all.length &&
      all
        .filter((cell) => !isBlankCell(cell))
        .every((cell) => [...cellText(cell).trim()].length <= FLOW_LABEL_LIMIT)
    ) {
      const lines = [];
      for (const row of grid) {
        const cells = row.filter((cell) => !isBlankCell(cell));
        if (!cells.length) continue;
        const steps = cells.map((cell) => flowStage([cell])).filter(Boolean);
        if (steps.length) lines.push({ type: "steps", linked: false, steps });
      }
      if (lines.length >= 2) return { lines };
    }

    return null;
  }

  function flowMarkup(caption, flow) {
    // 화살표는 칸 뒤가 아니라 앞에 답니다. 단계가 많아 줄이 바뀌면 뒤에 단
    // 화살표만 앞 줄 오른쪽 끝에 홀로 남아, 어디로 가는 화살표인지 알 수 없습니다.
    const stepMarkup = (stage, linked, first) => `
      <li class="source-flow-step">
        ${linked && !first ? '<span class="source-flow-arrow" aria-hidden="true">▶</span>' : ""}
        <div class="source-flow-card">
          <span class="source-flow-name">${escapeHtml(stage.name)}</span>
          ${
            stage.notes.length
              ? `<ul class="source-flow-notes">${stage.notes
                  .map((note) => `<li>${escapeHtml(note)}</li>`)
                  .join("")}</ul>`
              : ""
          }
        </div>
      </li>`;

    return `
      <ol class="source-flow" aria-label="${escapeHtml(caption)} 흐름도">
        ${flow.lines
          .map((line) =>
            line.type === "down"
              ? '<li class="source-flow-down" aria-hidden="true">▼</li>'
              : `<li class="source-flow-line">
                  <ol class="source-flow-row" data-linked="${line.linked ? 1 : 0}">
                    ${line.steps
                      .map((stage, index) => stepMarkup(stage, line.linked, index === 0))
                      .join("")}
                  </ol>
                </li>`
          )
          .join("")}
      </ol>`;
  }

  function spannedTableMarkup(caption, headers, rows, sourceWidths) {
    // 머리글과 본문을 <thead>·<tbody>로 나누면, 머리글 칸이 아래로 걸친 병합
    // (구 분: 2줄 차지)이 끊깁니다. 한 덩어리로 그리고 첫 줄만 머리글로 표시합니다.
    const grid = visibleCells([headers, ...rows]);
    // 열 수는 모든 행을 봐야 합니다. 머리글 행만 보면, 머리글이 한 칸뿐인데
    // 아래 행은 세 칸인 표에서 <col>을 하나만 만들어 표가 폭을 넘어갑니다.
    const columnCount = grid.reduce((most, row) => {
      let at = 0;
      for (const cell of row) {
        const from = cell.column ?? at;
        at = from + (cell.colSpan || 1);
      }
      return Math.max(most, at);
    }, 0) || headers.reduce((total, cell) => total + (cell.colSpan || 1), 0);

    // 열 너비는 매뉴얼을 만든 사람이 정해 둔 비율을 바탕으로 하되,
    // 어느 열도 자기 낱말보다 좁아지지 않게 손봅니다.
    // 그래야 가로 스크롤 없이 한 화면에 들어가면서 글자도 안 끊깁니다.
    const base =
      Array.isArray(sourceWidths) && sourceWidths.length === columnCount
        ? sourceWidths
        : measuredWidths(grid, columnCount);
    // 폭 안에 들어갈 수 있으면 맞추고, 못 들어가면 가로로 넘겨 봅니다.
    // 우겨넣으면 낱말이 가운데에서 끊겨 오히려 못 읽습니다.
    const needs = neededWidth(grid, columnCount);
    const scrolls = needs > 690;
    const widths = fitWidths(base, grid, columnCount, scrolls ? needs : 730);
    return `
      <div class="source-table-scroll">
        <table class="source-criteria-table" style="--table-columns: ${columnCount}; --table-min: ${Math.round(
          needs
        )}px" data-wide="${
          columnCount >= 7 ? 1 : 0
        }" data-scroll="${scrolls ? 1 : 0}" data-column-layout="${widths
          .map((width) => Number(width).toFixed(1))
          .join("-")}" aria-label="${escapeHtml(caption)}">
          <colgroup>
            ${widths.map((width) => `<col style="width: ${Number(width).toFixed(2)}%" />`).join("")}
          </colgroup>
          <tbody>
            ${grid
              .map(
                (cells, rowIndex) => `
                  <tr>
                    ${cells
                      .map((cell) => {
                        // 원문에서 비어 있는 칸은 비워 둡니다.
                        const lines = bodyLines(unwrap(cell.text));
                        const content = lines.length ? cellMarkup(lines) : "";
                        const span = spanAttributes(cell);
                        if (rowIndex === 0) {
                          return `<th scope="col"${span}>${content}</th>`;
                        }
                        if (cell.column === 0) {
                          return `<th scope="row"${span}>${content}</th>`;
                        }
                        return `<td${span}>${content}</td>`;
                      })
                      .join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // 표 안의 줄바꿈은 항목 구분입니다. 한 칸 안에서 목록으로 보여 줍니다.
  // 화살표로 이어 붙인 긴 덩어리('승인요청각급학교→교육지원청…')는 띄어쓰기가
  // 없어 한 줄로 뻗습니다. 화살표 뒤에서 줄이 바뀔 수 있게 보이지 않는 자리를
  // 넣어 둡니다. 글자는 그대로입니다.
  const unwrap = (value) =>
    String(value ?? "")
      .replace(/([→⇒⇨▶►])/g, "$1\u200B")
      // 원문에서 줄이 나뉘어 있던 자리가 한 덩어리로 붙기도 합니다.
      // 나열 문구('교량,터널,철도,…')는 띄어쓰기가 없어 한 줄로 뻗습니다.
      // 쉼표·가운뎃점 뒤, 괄호 앞뒤도 줄을 바꿀 수 있는 자리로 둡니다.
      .replace(/([,、·・‧\-–—])(?=\S)/g, "$1\u200B")
      .replace(/(\))(?=[가-힣])/g, "$1\u200B")
      .replace(/([가-힣\d])(?=[([])/g, "$1\u200B")
      // 꺾쇠·따옴표로 묶은 이름도 앞뒤에서 줄을 바꿀 수 있게 합니다.
      //   '<예금잔액불부합조서' 같은 긴 이름이 칸을 넘어가던 자리입니다.
      .replace(/([<〈《「『'"])(?=\S)/g, "$1\u200B")
      .replace(/(\S)(?=[<〈《「『])/g, "$1\u200B");

  // 열마다 '이보다 좁으면 낱말이 끊긴다' 하는 최소 몫을 구해,
  // 원문 비율이 그보다 좁은 열만 넓혀 줍니다. 넓힌 만큼은 여유 있는
  // 열에서 비례로 덜어 옵니다. 전체는 늘 100%라 가로 스크롤이 없습니다.
  // 이 표를 낱말이 끊기지 않게 그리려면 가로로 몇 픽셀이 필요한지 어림합니다.
  // 한글 한 글자를 약 13px, 칸 좌우 여백을 약 20px로 봅니다.
  function neededWidth(grid, columnCount) {
    const longest = Array.from({ length: columnCount }, () => 1);
    for (const row of grid) {
      for (const cell of row) {
        const span = cell.colSpan || 1;
        const words = normalizeLine(cell.text).split(/\s+/).filter(Boolean);
        const most = words.reduce((top, word) => Math.max(top, visualLength(word)), 0) / span;
        for (let offset = 0; offset < span; offset += 1) {
          const column = cell.column + offset;
          if (column < columnCount) longest[column] = Math.max(longest[column], most);
        }
      }
    }
    return longest.reduce((sum, value) => sum + value * 18 + 34, 0);
  }

  function fitWidths(base, grid, columnCount, availablePx) {
    const longestWord = Array.from({ length: columnCount }, () => 1);
    for (const row of grid) {
      for (const cell of row) {
        const span = cell.colSpan || 1;
        // 여러 칸에 걸친 칸은 자기 몫만큼만 요구합니다.
        const words = normalizeLine(cell.text).split(/\s+/).filter(Boolean);
        const longest = words.reduce((most, word) => Math.max(most, visualLength(word)), 0) / span;
        for (let offset = 0; offset < span; offset += 1) {
          const column = cell.column + offset;
          if (column < columnCount) {
            longestWord[column] = Math.max(longestWord[column], longest);
          }
        }
      }
    }

    // 최소 몫은 글자 수 비율이 아니라 실제 픽셀로 잡습니다.
    // 비율로 잡으면 표가 큰 경우 짧은 낱말의 몫이 지나치게 깎여 끊깁니다.
    // 한글 한 글자 약 15px, 칸 좌우 여백 약 28px로 봅니다.
    const floors = longestWord.map((value) =>
      Math.min(((value * 18 + 34) / availablePx) * 100, 60)
    );

    // 최소 몫은 반드시 지킵니다. 남는 자리만 원문 비율대로 나눠 줍니다.
    // 이렇게 해야 어느 열도 자기 낱말보다 좁아지지 않습니다.
    const floorTotal = floors.reduce((sum, value) => sum + value, 0);
    if (floorTotal >= 100) {
      return floors.map((value) => Number(((value / floorTotal) * 100).toFixed(2)));
    }

    // 원문 너비가 열 수와 맞지 않는 표가 있습니다(표 안에 표가 든 경우).
    // 그럴 때는 고르게 나눈 값을 바탕으로 삼습니다. 없는 값을 쓰면 NaN이 됩니다.
    const safeBase = floors.map((_, index) =>
      Number.isFinite(base[index]) ? base[index] : 100 / floors.length
    );
    const baseTotal = safeBase.reduce((sum, value) => sum + value, 0) || 1;
    const spare = 100 - floorTotal;
    const widths = floors.map((value, index) => value + (safeBase[index] / baseTotal) * spare);
    const total = widths.reduce((sum, value) => sum + value, 0);
    return widths.map((value) => Number(((value / total) * 100).toFixed(2)));
  }

  // 원문 너비가 없는 표는 칸에 든 글의 길이로 너비를 정합니다.
  // 여러 칸에 걸친 칸은 자기 몫만큼만 나눠 가집니다.
  function measuredWidths(grid, columnCount) {
    const longest = Array.from({ length: columnCount }, () => 1);
    for (const row of grid) {
      for (const cell of row) {
        const span = cell.colSpan || 1;
        const each = visualLength(normalizeLine(cell.text)) / span;
        for (let offset = 0; offset < span; offset += 1) {
          const column = cell.column + offset;
          if (column < columnCount) longest[column] = Math.max(longest[column], each);
        }
      }
    }
    // 너무 좁거나 너무 넓어지지 않도록 눌러 줍니다.
    const eased = longest.map((value) => Math.sqrt(Math.min(value, 40)) + 1.2);
    const total = eased.reduce((sum, value) => sum + value, 0);
    return eased.map((value) => Number(((value / total) * 100).toFixed(2)));
  }

  function tableMarkup(caption, headers, rows) {
    const widths = contentAwareColumnWidths(headers, rows);
    return `
      <div class="source-table-scroll">
        <table class="source-criteria-table" style="--table-columns: ${columnCount}; --table-min: ${Math.round(
          needs
        )}px" data-wide="${
          columnCount >= 7 ? 1 : 0
        }" data-scroll="${scrolls ? 1 : 0}" data-column-layout="${widths
          .map((width) => width.toFixed(1))
          .join("-")}" aria-label="${escapeHtml(caption)}">
          <colgroup>
            ${widths
              .map((width) => `<col style="width: ${width.toFixed(1)}%" />`)
              .join("")}
          </colgroup>
          <thead>
            <tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (cells) => `
                  <tr>
                    <th scope="row">${escapeHtml(cells[0])}</th>
                    ${cells
                      .slice(1)
                      .map((cell) => `<td>${Array.isArray(cell) ? cellMarkup(cell) : cell}</td>`)
                      .join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // 매뉴얼 한글파일(HWPX)에 들어 있는 표를 그대로 그립니다.
  // 병합된 칸까지 원문에 적힌 그대로여서 짐작할 것이 없습니다.
  function renderSourceTable(block) {
    const tables = Array.isArray(block && block.tables) ? block.tables : [];
    if (!tables.length) return null;

    // 어느 줄이 어느 표인지는 본문을 만들 때 자리로 적어 두었습니다.
    // 줄 글자로 찾으면 같은 글이 든 표가 둘일 때 한쪽으로 몰립니다.
    const owners = new Map();
    for (const [index, table] of tables.entries()) {
      const start = table.lineStart ?? 0;
      const count = table.lineCount ?? (table.sourceLines || []).length;
      for (let offset = 0; offset < count; offset += 1) owners.set(start + offset, index);
    }

    const caption =
      String(block.title || "")
        .replace(/^매뉴얼 \d+쪽$/, "")
        .replace(/^\d+\s*\.\s*/, "")
        .replace(/^세부내용\s+/, "")
        .split(/\s*:\s*/)[0]
        .trim() || "표";

    const pieces = [];
    let buffer = [];
    const drawn = new Set();
    let drewGrid = false;
    const flush = () => {
      if (!buffer.length) return;
      pieces.push(`<div class="source-structured-intro">${cellMarkup(buffer)}</div>`);
      buffer = [];
    };

    for (const [index, line] of bodyLines(block.body).entries()) {
      const owner = owners.has(index) ? owners.get(index) : -1;
      if (owner < 0) {
        buffer.push(line);
        continue;
      }
      if (drawn.has(owner)) continue;
      drawn.add(owner);
      flush();
      const table = tables[owner];
      const headerCells = (table.headers || []).map((cell) =>
        typeof cell === "string" ? { text: cell, colSpan: 1, rowSpan: 1 } : cell
      );
      // 그림으로 그린 표는 격자로 옮기지 않고 흐름도로 그립니다.
      const flow = flowFromTable(headerCells, table.rows);
      if (flow) {
        pieces.push(flowMarkup(caption, flow));
        continue;
      }
      drewGrid = true;
      pieces.push(spannedTableMarkup(caption, headerCells, table.rows, table.widths));
    }
    flush();

    if (!drawn.size) return null;
    return {
      summary: `${caption} ${drewGrid ? "표" : "흐름도"}로 보기`,
      html: pieces.join(""),
      type: drewGrid ? "table" : "flow",
    };
  }

  function sourceOutlineItems(body) {
    const lines = bodyLines(body);
    const items = [];
    let latestPrimary = null;
    let latestNumbered = null;

    for (const rawLine of lines) {
      const line = normalizeLine(rawLine);
      // 매뉴얼 판마다 글머리표가 다릅니다. ▸(U+25B8)와 ▶(U+25B6)는 다른 글자입니다.
      // 여기 빠진 기호는 글머리표로 안 보여 앞줄 뒤에 붙어 버립니다.
      let match = line.match(/^([‣•▸▹▪□○◦])\s*(.+)$/);
      if (match) {
        const item = { marker: match[1], text: match[2], level: 0, type: "primary" };
        items.push(item);
        latestPrimary = item;
        latestNumbered = null;
        continue;
      }

      match = line.match(/^([▶])\s*(.+)$/);
      if (match) {
        const item = {
          marker: match[1],
          text: match[2],
          level: latestNumbered ? 1 : 0,
          type: "primary",
        };
        items.push(item);
        latestPrimary = item.level === 0 ? item : latestPrimary;
        continue;
      }

      match = line.match(/^([-–])\s*(.+)$/);
      if (match) {
        items.push({
          marker: match[1],
          text: match[2],
          level: latestPrimary || latestNumbered ? 1 : 0,
          type: "secondary",
        });
        continue;
      }

      match = line.match(/^((?:\d+|[가-힣])[.)])\s*(.+)$/);
      if (match) {
        const item = { marker: match[1], text: match[2], level: 0, type: "numbered" };
        items.push(item);
        latestNumbered = item;
        latestPrimary = null;
        continue;
      }

      match = line.match(/^(※|☞|\*)\s*(.+)$/);
      if (match) {
        items.push({
          marker: match[1],
          text: match[2],
          level: latestPrimary || latestNumbered ? 1 : 0,
          type: "note",
        });
        continue;
      }

      const previous = items.at(-1);
      if (previous && previous.type !== "paragraph") {
        previous.text += ` ${line}`;
      } else {
        items.push({ marker: "", text: line, level: 0, type: "paragraph" });
        latestPrimary = null;
        latestNumbered = null;
      }
    }

    return items;
  }

  function renderSourceOutline(body) {
    const items = sourceOutlineItems(body);
    if (!items.some((item) => item.marker)) {
      return `<div class="source-full-text">${escapeHtml(
        items.map((item) => item.text).join(" ")
      )}</div>`;
    }

    return `<ul class="source-detail-outline">${items
      .map(
        (item) => `
          <li class="source-outline-item source-outline-${escapeHtml(item.type)}"
              style="--outline-level: ${item.level}">
            <span class="source-outline-marker" aria-hidden="true">${escapeHtml(
              item.marker
            )}</span>
            <span class="source-outline-text">${escapeHtml(item.text)}</span>
          </li>
        `
      )
      .join("")}</ul>`;
  }

  function fallbackSummary(block) {
    const body = String(block.body || "");
    let subject = String(block.title || "")
      .replace(/^매뉴얼 \d+쪽$/, "")
      .replace(/^\d+\.\s*/, "")
      .replace(/^\d+\s+/, "")
      .replace(/^세부내용\s+/, "")
      .trim();
    if (
      !subject ||
      subject.length > 32 ||
      /^(?:TIP|업무 흐름도|관련법규 및 참고자료)$/.test(subject)
    ) {
      subject = "";
    }

    const hasConditions =
      /\d/.test(body) && /(이내|이상|이하|초과|미만|경우|제외|가능|원칙|기한|기간)/.test(body);
    const hasItems = /(?:^|\n)\s*(?:[•‣▶※]|[-–]\s|\d+[.)]\s)/m.test(body);
    if (hasConditions) {
      return subject ? `${subject} 조건·예외 보기` : "조건·예외와 세부 기준 보기";
    }
    if (hasItems) return subject ? `${subject} 항목별 내용 보기` : "항목별 세부 내용 보기";
    return subject ? `${subject} 전체 내용 보기` : "전체 내용 보기";
  }

  function render(block) {
    const body = String(block?.body || "");
    if (!body) return { summary: "전체 내용 보기", html: "", type: "text" };

    // 매뉴얼 PDF의 칸 경계선을 읽어 둔 표가 있으면 그대로 그립니다.
    // 예전에는 '이런 낱말이 있으면 이런 표'라는 목록을 손으로 적어 두었는데,
    // 목록에 없는 표는 줄글로 흘러 나왔고 원문이 바뀌면 조용히 어긋났습니다.
    const sourceTable = renderSourceTable(block);
    if (sourceTable) return sourceTable;

    return {
      summary: fallbackSummary(block),
      html: renderSourceOutline(body),
      type: "text",
    };
  }

  window.GUIDE_DETAIL_RENDERER = { render };
})();
