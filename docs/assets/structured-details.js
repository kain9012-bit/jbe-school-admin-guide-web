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
      const startsItem = /^(?:[•‣▶※]|[-–]\s|\d+[.)]\s|[가-힣]\.\s)/.test(line);
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
      .map((item) => `<li>${escapeHtml(item.replace(/^[•‣▶]\s*/, ""))}</li>`)
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

  // 한글은 병합에 가려진 자리도 빈 칸으로 남겨 둡니다.
  // 그대로 그리면 칸이 밀리므로, 가려진 자리는 빼고 그립니다.
  function visibleCells(rows) {
    const covered = rows.map(() => []);
    const result = [];
    for (const [rowIndex, row] of rows.entries()) {
      const line = [];
      let column = 0;
      for (const cell of row) {
        // 가려진 자리에도 빈 칸이 하나씩 들어 있습니다. 그 칸은 그리지 않고 넘어갑니다.
        if (covered[rowIndex][column]) {
          column += 1;
          continue;
        }
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
        column += colSpan;
      }
      result.push(line);
    }
    return result;
  }

  function spannedTableMarkup(caption, headers, rows) {
    const text = (cell) => normalizeLine(cell && cell.text);
    const columnCount = headers.reduce((total, cell) => total + (cell.colSpan || 1), 0);
    const widths = Array.from({ length: columnCount }, () => 100 / columnCount);
    const body = visibleCells(rows);
    return `
      <div class="source-table-scroll">
        <table class="source-criteria-table" data-column-layout="${widths
          .map((width) => width.toFixed(1))
          .join("-")}" aria-label="${escapeHtml(caption)}">
          <thead>
            <tr>${headers
              .map((cell) => `<th scope="col"${spanAttributes(cell)}>${escapeHtml(text(cell))}</th>`)
              .join("")}</tr>
          </thead>
          <tbody>
            ${body
              .map(
                (cells) => `
                  <tr>
                    ${cells
                      .map((cell) => {
                        // 원문에서 비어 있는 칸은 비워 둡니다.
                        // 줄표를 찍으면 없는 내용을 있는 것처럼 보이게 합니다.
                        const lines = bodyLines(unwrap(cell.text));
                        const content = lines.length ? cellMarkup(lines) : "";
                        // 첫 칸만 행 머리입니다. 위 칸이 여러 줄을 차지해 첫 칸이
                        // 가려진 줄에서는 그다음 칸이 행 머리가 아닙니다.
                        if (cell.column === 0) {
                          return `<th scope="row"${spanAttributes(cell)}>${content}</th>`;
                        }
                        return `<td${spanAttributes(cell)}>${content}</td>`;
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
  const unwrap = (value) => String(value ?? "");

  function tableMarkup(caption, headers, rows) {
    const widths = contentAwareColumnWidths(headers, rows);
    return `
      <div class="source-table-scroll">
        <table class="source-criteria-table" data-column-layout="${widths
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
      pieces.push(spannedTableMarkup(caption, headerCells, table.rows));
    }
    flush();

    if (!drawn.size) return null;
    return { summary: `${caption} 표로 보기`, html: pieces.join(""), type: "table" };
  }

  function sourceOutlineItems(body) {
    const lines = bodyLines(body);
    const items = [];
    let latestPrimary = null;
    let latestNumbered = null;

    for (const rawLine of lines) {
      const line = normalizeLine(rawLine);
      let match = line.match(/^([‣•])\s*(.+)$/);
      if (match) {
        const item = { marker: match[1], text: match[2], level: 0, type: "primary" };
        items.push(item);
        latestPrimary = item;
        latestNumbered = null;
        continue;
      }

      match = line.match(/^(▶)\s*(.+)$/);
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

      match = line.match(/^(※|☞)\s*(.+)$/);
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
