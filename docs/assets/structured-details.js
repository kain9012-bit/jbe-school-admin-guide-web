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

  // 칸 안의 글은 줄 앞의 공백을 한 칸 남겨 둡니다.
  // 그 공백이 '앞줄에 이어지는 줄'이라는 원문의 표시입니다
  // (scripts/read_hwpx_tables.py의 cell_text). 여느 줄처럼 다 털어 내면
  // 표시가 사라져, 한 문장이 두 항목으로 갈라집니다.
  //   ◦발신 명의 표시의 마지막 글자가 공인의
  //     가운데 오도록 날인      ← 앞줄에 이어지는 줄
  const cellLines = (body) =>
    String(body || "")
      .split(/\r?\n/)
      .map((line) => (/^\s/.test(line) ? ` ${line.trim()}` : line.trim()))
      .filter((line) => line.trim());

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

  // 매뉴얼 본문에 실린 사진입니다. 빌더가 '[[그림:image7]]'라는 표를 남겨
  // 두고(scripts/build_chapters_from_hwpx.mjs), 화면이 그 자리에 그립니다.
  // 그림 파일은 scripts/extract_manual_images.py가 편별로 꺼내 둡니다.
  const PICTURE_MARK = /\[\[그림:([A-Za-z0-9_]+)\]\]/g;
  const hasPicture = (value) => {
    PICTURE_MARK.lastIndex = 0;
    return PICTURE_MARK.test(String(value || ""));
  };
  // 그림 표만 든 줄입니다. 글머리표를 붙이지 않고 사진만 늘어놓습니다.
  const pictureOnly = (value) =>
    hasPicture(value) && !String(value).replace(PICTURE_MARK, "").replace(/[\s/·]+/g, "");

  function pictureMarkup(name) {
    const chapter = (window.ACTIVE_GUIDE_CHAPTER && window.ACTIVE_GUIDE_CHAPTER.id) || "01";
    const src = `assets/manual-images/chapter${chapter}/${escapeHtml(name)}.jpg`;
    return `<img class="source-picture" src="${src}" alt="매뉴얼 그림" loading="lazy" />`;
  }

  // 사진이 잇달아 나오면 원문처럼 한 줄에 나란히 놓습니다. kordoc이 칸 사이에
  // 넣어 준 빗금은 사진을 늘어놓고 나면 뜻이 없으므로 지웁니다.
  const PICTURE_RUN = /(?:\[\[그림:[A-Za-z0-9_]+\]\]\s*(?:[/·]\s*)?)+/g;

  // 원문은 사진을 안쪽 표에 넣고, 사진 바로 아래 칸에 그 사진의 이름을 적습니다.
  //
  //   [사진] [사진] [사진] [사진]          ← 안쪽 표 윗줄
  //   진행문서파일 / 발생‧논리순 정리 / …   ← 안쪽 표 아랫줄
  //
  // kordoc은 그 표를 줄마다 펴서 칸을 ' / '로 잇습니다. 그래서 사진 줄
  // 다음 줄이 사진마다의 이름입니다. 칸 수가 꼭 같을 때만 짝지어,
  // 사진 아래에 제 이름을 답니다. 수가 다르면 짝짓지 않습니다.
  const pictureNames = (line) =>
    (String(line).match(PICTURE_MARK) || []).map((mark) =>
      mark.replace(/^\[\[그림:|\]\]$/g, "")
    );

  function pairedPictures(pictureLine, captionLine) {
    const names = pictureNames(pictureLine);
    if (!names.length || !pictureOnly(pictureLine)) return "";
    // 사진이 둘 이상일 때만 짝짓습니다. 한 장뿐이면 다음 줄이 그 사진의
    // 이름인지 그냥 본문인지 가릴 길이 없습니다. 실제로 제12편 '전자태그
    // 부착 예외 기준'에서 뒤따르는 본문 줄을 이름으로 잘못 붙였습니다.
    if (names.length < 2) return "";
    const captions = String(captionLine || "")
      .split("/")
      .map((part) => part.trim());
    if (captions.length !== names.length) return "";
    if (captions.some((caption) => !caption || hasPicture(caption))) return "";
    // 이름 줄에는 글머리표가 붙지 않습니다. 붙어 있으면 본문입니다.
    if (/^(?:[•‣▸▹▶▪□○◦※☞*]|[-–]\s)/.test(String(captionLine).trim())) return "";
    // 원문은 사진을 한 줄짜리 표에 나란히 놓습니다. 칸 수만큼 폭을 나눠
    // 언제나 한 줄에 서게 합니다. 크기로 맞추면 넉 장 가운데 한 장이
    // 다음 줄로 내려가 원문과 달라집니다.
    return `<span class="source-picture-row" style="--picture-count: ${names.length}">${names
      .map(
        (name, at) =>
          `<span class="source-picture-cell">${pictureMarkup(name)}` +
          `<span class="source-picture-caption">${escapeHtml(captions[at])}</span></span>`
      )
      .join("")}</span>`;
  }

  // 이미 글자를 안전하게 바꾼 뒤에 부릅니다. 그림 표에는 바뀌는 글자가 없습니다.
  const withPictures = (html) =>
    String(html).replace(PICTURE_RUN, (run) => {
      const names = run.match(PICTURE_MARK) || [];
      const shown = names
        .map((mark) => pictureMarkup(mark.replace(/^\[\[그림:|\]\]$/g, "")))
        .join("");
      return `<span class="source-picture-row" style="--picture-count: ${names.length}">${shown}</span>`;
    });

  // 칸 안의 줄은 원문에서 문단 하나하나입니다(한글파일의 hp:p).
  // 문단이 바뀌면 화면에서도 줄을 바꿉니다.
  //
  //   제4편 휴가 '2. 공가 사유'
  //   원문 : 사유 열한 가지가 저마다 한 문단
  //   예전 : 열한 가지가 마침표도 없이 한 문단으로 이어 붙었습니다.
  //
  // 다만 한 문장이 길어 다음 줄로 넘긴 자리가 있습니다. 그 줄은 원문에서
  // 한두 칸 들여 씌어 있습니다. 그것이 '앞줄에 이어지는 줄'이라는 표시입니다.
  //
  //   ◦발신 명의 표시의 마지막 글자가 공인의
  //     가운데 오도록 날인          ← 들여쓴 줄이므로 앞줄에 잇습니다
  //
  // 들여쓰기는 한글파일에서 읽어 옵니다(scripts/read_hwpx_tables.py의 cell_text).
  // 이것을 안 보고 '글머리표 없는 줄은 앞줄에 잇는다'로 두었더니, 저마다
  // 따로 선 문단 1200여 개가 통째로 한 줄이 됐습니다.
  //
  // 글머리표로 시작하는 줄은 들여썼어도 딸린 항목이지 이어지는 줄이 아닙니다.
  //   설계변경 등으로 … 증액된 공사(설계용역)계약 중
  //    - 시설공사: 증액 1억원 이상      ← 들여썼지만 따로 선 항목
  const CONTINUED = /^\s/;
  const MARKED = /^\s*(?:[•‣▸▹▶▪□○◦※*]|[-–]\s)/;

  function logicalItems(lines) {
    const items = [];
    let afterPicture = false;
    for (const rawLine of lines) {
      const line = normalizeLine(rawLine);
      if (!line) continue;
      // 매뉴얼이 쓰는 글머리표는 판마다 다릅니다. ▸와 ▶는 다른 글자입니다.
      // 사진 줄과 그 다음 이름 줄도 홀로 세웁니다(원문 안쪽 표의 두 줄입니다).
      const picture = pictureOnly(line);
      const startsItem =
        picture ||
        afterPicture ||
        !CONTINUED.test(String(rawLine)) ||
        MARKED.test(String(rawLine));
      if (!items.length || startsItem) items.push(line);
      else items[items.length - 1] += ` ${line}`;
      afterPicture = picture;
    }
    return items;
  }

  // 칸 앞에 붙은 글머리표를 떼어, 글자와 따로 냅니다.
  // 기호는 기호 칸에 세우고 글은 글 칸에 세워야 여러 줄로 넘어가는 항목도
  // 둘째 줄부터 기호 자리만큼 들여써져, 어디서 한 항목이 끝나는지 보입니다.
  //
  // 다만 기호 하나가 곧 내용인 칸이 있습니다.
  //   제1편 기록물 관리 TIP '서가배치'의 '○' 칸
  //   그 자리에 무엇이 서는지를 ○ 하나로 말합니다. 이것을 글머리표로 보고
  //   떼어 내면 칸이 통째로 비어, 서가 그림이 빈 격자가 됩니다.
  const CELL_MARKER = /^([•‣▸▹▶▪□○◦※⋅·*]|[-–])\s*/;
  // 원문에 기호가 없는 항목에 찍는 점입니다. 매뉴얼의 글자가 아니라 화면이
  // 항목을 가르려고 세우는 표시이므로, 가장 눈에 안 띄는 가운데점을 씁니다.
  //
  //   제4편 휴가 '2. 공가 사유'
  //   사유 열한 가지에 기호가 하나도 없어, 줄만 바꿔 놓으면 여러 줄짜리
  //   사유가 다음 사유와 붙어 보입니다. 원문 기호가 없는 항목이 3047개입니다.
  const NO_MARKER = "·";

  function splitMarker(item) {
    const found = CELL_MARKER.exec(item);
    if (!found) return { mark: "", text: item };
    const left = item.slice(found[0].length);
    // 기호를 떼면 남는 것이 없으면 그 기호가 곧 내용입니다.
    if (!left.trim()) return { mark: "", text: item };
    return { mark: found[1], text: left };
  }

  function plainCellMarkup(lines) {
    const items = logicalItems(lines);
    if (!items.length) return "";
    const shown = (item) => withPictures(escapeHtml(item));
    const pieces = [];
    for (let at = 0; at < items.length; at += 1) {
      const paired = pairedPictures(items[at], items[at + 1]);
      if (paired) {
        pieces.push(paired);
        at += 1;
        continue;
      }
      const { mark, text } = splitMarker(items[at]);
      pieces.push({ mark, text, html: shown(text) });
    }
    // 한 항목뿐이면 목록으로 만들지 않습니다. 가를 것이 없으므로 기호도
    // 찍지 않습니다. 원문에 기호가 있으면 그것만 그대로 붙여 둡니다.
    if (pieces.length === 1) {
      const only = pieces[0];
      if (typeof only === "string") return only;
      return only.mark ? `${escapeHtml(only.mark)} ${only.html}` : only.html;
    }
    // 기호는 늘 담아 두고, 보일지 말지는 그려 놓은 것을 재서 정합니다
    // (아래 showCellMarks). 항목이 한 줄에 다 들어가면 줄바꿈만으로 이미
    // 갈리므로 감춥니다. 몇 글자에서 줄이 넘어가는지는 칸 너비에 따라 달라
    // 글자 수로 어림잡을 수 없습니다. 실제로 '장학관사, 교육연구관사'처럼
    // 짧은 말도 좁은 칸에서는 두 줄로 넘어갑니다.
    return `<ul class="source-cell-list">${pieces
      .map((piece) => {
        if (typeof piece === "string") return `<li class="source-cell-plain">${piece}</li>`;
        const mark = piece.mark || NO_MARKER;
        return (
          `<li><span class="source-cell-mark" aria-hidden="true">${escapeHtml(mark)}</span>` +
          `<span class="source-cell-text">${piece.html}</span></li>`
        );
      })
      .join("")}</ul>`;
  }

  // 여러 줄로 넘어간 항목이 있는 칸에만 항목 앞 기호를 세웁니다.
  //
  // 한 항목이 두세 줄로 넘어가면 넘어간 줄과 다음 항목의 첫 줄이 같은
  // 자리에서 시작해, 어디서 한 항목이 끝나는지 보이지 않습니다
  // (제4편 휴가 '2. 공가 사유'). 기호를 세우면 넘어간 줄이 기호 칸만큼
  // 들여써져 저절로 갈립니다.
  //
  // 넘어가지 않는 칸까지 세우면, 좁은 칸 때문에 한 이름표를 두 줄로 끊어
  // 적은 자리가 목록으로 보입니다('날인' / '위치').
  //
  // 창 너비가 바뀌면 넘어가는 줄도 달라지므로 다시 잽니다.
  function showCellMarks(root) {
    const where = root && root.querySelectorAll ? root : document;
    const lists = [...where.querySelectorAll(".source-cell-list")];
    // 먼저 기호를 모두 내립니다. 기호를 세운 채로 재면 기호가 밀어낸 만큼
    // 글이 더 접혀, '접혔으니 기호가 필요하다'가 저 혼자 참이 됩니다.
    lists.forEach((list) => list.removeAttribute("data-wrapped"));
    const wrapped = lists.map((list) => {
      const items = [...list.children];
      const oneLine = parseFloat(getComputedStyle(list).lineHeight) || 20;
      // 아주 좁은 칸에는 기호를 세우지 않습니다. 기호와 사이 여백이 글자
      // 두어 자 몫을 먹어, 남은 자리로는 한 글자도 못 놓고 칸 밖으로 넘칩니다
      // (제7편 '신분변동 시 보수지급방법'의 35px짜리 '직위 / 해제' 칸).
      // 그런 칸은 짧은 이름표를 쌓아 둔 자리라 줄바꿈만으로 이미 갈립니다.
      if (list.clientWidth < oneLine * 3) return false;
      return (
        items.length > 1 &&
        items.some((item) => item.getBoundingClientRect().height > oneLine * 1.6)
      );
    });
    lists.forEach((list, at) => {
      if (wrapped[at]) list.setAttribute("data-wrapped", "1");
    });
  }

  // 검사기 몇 개는 이 파일을 브라우저가 아닌 곳에서 불러 글자만 봅니다.
  // 그런 자리에는 창도 시계도 없으므로 있을 때만 답니다.
  let redrawing = 0;
  if (typeof window.addEventListener === "function") {
    window.addEventListener("resize", () => {
      window.clearTimeout(redrawing);
      redrawing = window.setTimeout(() => showCellMarks(document), 150);
    });
  }

  // 칸 안에 표가 또 그려져 있는 자리입니다.
  //
  // 매뉴얼은 칸 안에 표를 그려 넣습니다. 상자 안에 넣은 표, 서가처럼 자리를
  // 그림으로 그린 표입니다. 한글파일을 읽는 쪽(kordoc)은 그 표를 행마다 한 줄,
  // 칸 사이는 ' / '로 이어 붙여 바깥 칸의 글로 펴 버립니다.
  //
  //   제1편 기록물 관리 TIP '서가배치'
  //   원문 : ┌ 영구 ┬ 준영구 ┬ 10년 ┐   화면 : 영구 / 준영구 / 10년 / 5년 …
  //          ├ 2010문서 ┼ ○ ┼ … ┤              2010 문서 / ○ / …
  //
  // 빌더가 그 글줄이 놓인 자리를 적어 두었습니다(lineStart·lineCount).
  // 여기서는 그 자리에 글줄 대신 표를 그립니다. 글줄은 그대로 두어야
  // 검색이 그 글자를 찾으므로, 빌더는 지우지 않고 자리만 적어 둡니다.
  // available은 이 칸이 쓸 수 있는 폭입니다. 안쪽 표는 바깥 표의 한 칸
  // 안에 들어가므로, 바깥 표와 같은 폭으로 재면 반드시 넘칩니다.
  function cellMarkup(lines, tables, available) {
    const owned = Array.isArray(tables) ? tables : [];
    // 글이 아예 없는 칸은 빈 칸으로 둡니다. 예전에 '—'를 넣었더니 원문에서
    // 비워 둔 자리마다 줄표가 늘어섰습니다.
    if (!owned.length) return plainCellMarkup(lines);
    const owners = new Map();
    owned.forEach((table, index) => {
      const start = table.lineStart ?? 0;
      const count = table.lineCount ?? 0;
      for (let offset = 0; offset < count; offset += 1) owners.set(start + offset, index);
    });
    const pieces = [];
    const drawn = new Set();
    let buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      const shown = plainCellMarkup(buffer);
      if (shown) pieces.push(shown);
      buffer = [];
    };
    lines.forEach((line, index) => {
      const owner = owners.has(index) ? owners.get(index) : -1;
      if (owner < 0) {
        buffer.push(line);
        return;
      }
      if (drawn.has(owner)) return;
      drawn.add(owner);
      flush();
      const table = owned[owner];
      pieces.push(
        spannedTableMarkup(
          "",
          headerCellsOf(table),
          table.rows || [],
          table.widths,
          available,
          table.picture
        )
      );
    });
    flush();
    return pieces.join("");
  }

  const headerCellsOf = (table) =>
    (table.headers || []).map((cell) =>
      typeof cell === "string" ? { text: cell, colSpan: 1, rowSpan: 1 } : cell
    );

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

  // 동그라미 숫자(①②③), 네모·동그라미 기호(■○◦), 로마 숫자(Ⅰ Ⅱ)는 한글
  // 글꼴에서 한글과 같은 폭으로 그려집니다. 이것을 영문처럼 좁게 세면 그 칸에
  // 필요한 폭을 너무 적게 잡아, 화면에서 낱말이 가운데에서 끊깁니다.
  //   제7편 공무원연금 '②③⑥⑦' 칸: 필요 45px인데 39px만 주었습니다.
  const WIDE_LETTER = /[가-힣一-龥ぁ-ゔァ-ヴー々〆〤\u2460-\u24FF\u2160-\u217F\u25A0-\u25FF\u3000-\u303F\uFF01-\uFF60\u203B]/;

  function visualLength(value) {
    return [...plainCellText(value)].reduce((length, character) => {
      if (/\s/.test(character)) return length + 0.35;
      if (WIDE_LETTER.test(character)) return length + 1;
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
    result.covered = covered;
    return result;
  }

  // 원문이 그림을 그리려고 둘러 둔 빈 줄·빈 열을 걷어냅니다.
  //
  // 제4편 시차출퇴근제 개념도가 그렇습니다. 11열 6줄인데 글이 든 곳은
  // 가운데 네 줄뿐이고, 양옆과 위아래는 그림 여백으로 비워 둔 자리입니다.
  // 그대로 격자로 옮기면 빈 칸만 줄줄이 보여 무엇을 나타낸 표인지 흐려집니다.
  //
  // 가운데 빈 열은 그대로 둡니다. 그것은 여백이 아니라 '이 자리에는 값이 없다'는
  // 뜻이라, 걷어내면 위아래 줄이 어긋납니다.
  function trimEmptyEdges(grid, columnCount) {
    const blank = (cell) => cell.filler || isBlankCell(cell);

    let first = columnCount;
    let last = -1;
    for (const row of grid) {
      for (const cell of row) {
        if (blank(cell)) continue;
        // 표 폭을 통째로 가로지르는 칸은 어느 열에 걸리는지를 말해 주지 않습니다.
        // 제목 띠나 눈금 줄이 그렇습니다. 이것까지 세면 양옆 여백이 안 걷힙니다.
        if ((cell.colSpan || 1) >= columnCount) continue;
        first = Math.min(first, cell.column);
        last = Math.max(last, cell.column + (cell.colSpan || 1) - 1);
      }
    }
    if (last < first) return null;

    const keep = grid.map((row) => row.some((cell) => !blank(cell)));
    if (!keep.some(Boolean)) return null;
    // 남길 줄이 몇 번째가 되는지 미리 세어 둡니다. 걸쳐 있는 칸의 줄 수를
    // 다시 매기는 데 씁니다.
    const kept = [];
    keep.forEach((alive, index) => {
      if (alive) kept.push(index);
    });

    const rows = kept.map((rowIndex) =>
      grid[rowIndex]
        .filter(
          (cell) => cell.column + (cell.colSpan || 1) - 1 >= first && cell.column <= last
        )
        .map((cell) => {
          const from = Math.max(cell.column, first);
          const to = Math.min(cell.column + (cell.colSpan || 1) - 1, last);
          const bottom = rowIndex + (cell.rowSpan || 1) - 1;
          const down = kept.filter((at) => at >= rowIndex && at <= bottom).length;
          return { ...cell, column: from - first, colSpan: to - from + 1, rowSpan: down };
        })
    );

    if (rows.length === grid.length && last - first + 1 === columnCount) return null;
    return { rows, columnCount: last - first + 1 };
  }

  // 원문에 아예 칸이 없는 자리는 빈 칸을 하나 넣어 자리를 맞춥니다.
  // 브라우저는 <td>를 앞에서부터 차례로 놓기 때문에, 첫 칸이 세 번째 열에
  // 있는 줄을 그대로 내보내면 그 칸이 첫 열로 끌려가 표 전체가 밀립니다.
  //   제14편 TIP 상자가 그랬습니다. 긴 글이 든 칸이 18% 열에 놓여 낱말이 끊겼습니다.
  // 위에서 걸쳐 내려온 자리는 브라우저가 이미 알고 있으므로 채우지 않습니다.
  function fillGaps(grid, columnCount) {
    return grid.map((row, rowIndex) => {
      const covered = grid.covered[rowIndex] || [];
      const line = [];
      let at = 0;
      for (const cell of row) {
        let missing = 0;
        for (let column = at; column < cell.column; column += 1) {
          if (!covered[column]) missing += 1;
        }
        if (missing) line.push({ filler: true, colSpan: missing });
        line.push(cell);
        at = cell.column + (cell.colSpan || 1);
      }
      let trailing = 0;
      for (let column = at; column < columnCount; column += 1) {
        if (!covered[column]) trailing += 1;
      }
      if (trailing) line.push({ filler: true, colSpan: trailing });
      return line;
    });
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

  const cellText = (cell) => String((cell && cell.text) || "");
  const isBlankCell = (cell) => !cellText(cell).trim();

  // 표를 흐름도의 뼈대로 옮깁니다. 그림형 표가 아니면 null을 돌려줍니다.
  // 눈금이 그어진 그림은 흐름이 아닙니다.
  //
  // 제4편 유연근무제의 시차출퇴근제 개념도가 그렇습니다. 한 칸에 시각이
  // '07:00 10:00 12:00 …'처럼 늘어서 있고, 그 아래 칸들이 시간대를 나눠
  // 가집니다. 이것을 칩으로 늘어놓으면 어느 시간대가 어느 시각에 걸리는지가
  // 사라집니다. 격자로 두어야 위아래가 맞습니다.
  const AXIS_TICK = /\d{1,2}\s*:\s*\d{2}/g;

  function hasAxis(cells) {
    return cells.some((cell) => (cellText(cell).match(AXIS_TICK) || []).length >= 3);
  }



  // 넓은 화면에서 표가 놓이는 자리는 780px쯤입니다(창 1280px 기준 782px).
  const AVAILABLE = 780;

  // 칸마다 어느 쪽에 선을 긋는지가 한글파일에 그대로 적혀 있습니다
  // (scripts/read_hwpx_tables.py가 네 글자로 적어 둡니다: 왼·오른·위·아래).
  //
  // 매뉴얼은 표로 그림을 그릴 때 이 선으로 모양을 만듭니다.
  //   제1편 기록물 관리 TIP '서가배치'
  //   굵은 선(1.0mm) = 서가 기둥, 얇은 선(0.12mm) = 선반, 없음 = 트인 쪽
  //
  // 이것을 읽지 않고 모든 칸에 똑같은 선을 그으면 서가 그림이 모눈종이가
  // 됩니다. 실제로 그랬습니다.
  const LINE = {
    n: "0",
    s: "1px solid var(--guide-line)",
    S: "2px solid var(--guide-muted)",
    d: "1px dashed var(--guide-line)",
  };

  // 원문 줄 높이입니다. 빈 대장 서식은 적어 넣을 자리가 곧 내용이라,
  // 높이를 버리면 빈 줄이 종잇장처럼 납작해집니다(제12편 물품 관리 확인 대장).
  // 한글 단위는 1/7200인치이므로 96dpi 화면에서는 75로 나눕니다.
  function rowHeight(cells) {
    const found = cells
      .filter((cell) => (cell.rowSpan || 1) === 1 && cell.height > 0)
      .map((cell) => cell.height);
    if (!found.length) return "";
    const px = Math.round(Math.min(...found) / 75);
    return px > 8 ? ` style="height:${px}px"` : "";
  }

  // 절차를 잇는 화살표만 든 칸입니다. 매뉴얼은 이 화살표를 글자가 아니라
  // 도형으로 그려 두는데, 그것을 읽어 와 이 자리에 세웁니다
  // (scripts/read_hwpx_tables.py의 arrows_in).
  // 화살표 칸에까지 상자를 그리면 절차가 이어지지 않고 칸 여덟 개로 흩어집니다.
  const ARROW_ONLY = /^[\s⇨⇦⇩⇧⇒⇐→←↓↑▶►▼]+$/u;
  const arrowOnly = (value) => {
    const said = String(value || "").trim();
    return Boolean(said) && ARROW_ONLY.test(said);
  };

  // 가로로 늘어선 절차입니다. 빌더가 단계의 열 구간을 적어 둡니다
  // (build_chapters_from_hwpx.mjs의 stepChain → flow.steps).
  //
  //   제1편 신원조사 (1행 6열)  [1. 서약 서명]⇨[2. 사용 신청]⇨[3. 열람 권한 신청]⇨
  //   제2편 제증명   (4행 7열)  [교육기관 방문]➡[발급 절차 …여러 줄…]➡[민원서류 수령]
  //
  // 격자로 그리면 마지막 화살표가 허공에 걸리고, 표가 여럿으로 나뉜 절차는
  // 끊겨 한 줄기로 보이지 않습니다. 원문이 이어 둔 대로 이어서 그립니다.
  // 상자도 화살표도 차례도 원문 그대로이고, 화면 폭에 맞춰 줄만 바뀝니다.

  // 단계 하나가 차지한 열 구간만 잘라 작은 격자를 만듭니다.
  // 가운데 단계가 여러 줄인 절차가 있어(제2편 '발급 절차'), 단계 하나가
  // 글 한 조각이 아니라 작은 표일 수 있습니다.
  function stepGrid(rows, from, to) {
    const kept = [];
    for (const row of rows) {
      const cells = row
        .filter((cell) => (cell.column ?? 0) >= from && (cell.column ?? 0) <= to)
        .map((cell) => ({ ...cell, column: (cell.column ?? 0) - from }));
      kept.push(cells);
    }
    // 이 단계에 아무것도 없는 줄은 뺍니다. 옆 단계가 세로로 걸쳐 있어
    // 생긴 빈 줄입니다.
    const alive = kept.map((cells) => cells.length > 0);
    const rowsLeft = alive.filter(Boolean).length;
    return kept
      .filter((cells, at) => alive[at])
      .map((cells) =>
        cells.map((cell) => ({
          ...cell,
          rowSpan: Math.min(cell.rowSpan || 1, rowsLeft),
        }))
      );
  }

  function flowMarkup(tables) {
    const cards = [];
    let link = "⇨";
    for (const table of tables) {
      const chain = table.flow;
      if (!chain || !Array.isArray(chain.steps)) continue;
      if (chain.link) link = chain.link;
      const rows = [table.headers || [], ...(table.rows || [])];
      for (const [from, to] of chain.steps) {
        const grid = stepGrid(rows, from, to);
        if (!grid.length) continue;
        const width = (table.widths || [])
          .slice(from, to + 1)
          .reduce((sum, value) => sum + Number(value || 0), 0);
        cards.push({ grid, width });
      }
    }
    if (cards.length < 2) return "";
    // 잇는 표시가 차지하는 자리를 빼고 남은 폭을 나눠 가집니다.
    const room = AVAILABLE - cards.length * 24;

    // 상자 폭은 원문 열 너비를 그대로 씁니다.
    const given = cards.map((card) => card.width || 100 / cards.length);
    const givenTotal = given.reduce((sum, one) => sum + one, 0) || 1;
    const share = given.map((value) => (value / givenTotal) * 100);

    // 다만 제 내용이 도저히 안 들어가는 단계는 넓혀 줍니다. 원문에서 22%짜리
    // 칸은 종이(가로 162mm)에서는 넉넉하지만 화면(780px)에서는 안 들어갑니다.
    // 그러면 그 단계 안에 가로 스크롤이 생겨 글이 잘립니다
    // (제8편 '결원보충 승인절차'의 첫 단계 — 안에 작은 표가 또 들어 있습니다).
    //
    // 예전에는 '어느 단계든 15%는 준다'는 고정값이었습니다. 그것은 단계마다
    // 무엇이 들었는지 보지 않으므로, 안이 빈 단계도 넓히고 정작 표가 든
    // 단계는 그대로 두었습니다.
    const { letter, frame } = cellMetrics(1);
    // 칸 하나가 드는 폭입니다. 칸 안에 표가 또 들어 있으면 그 표가 드는 폭도
    // 함께 봅니다. 안쪽 표를 안 보면 겉글자만 재게 되어, 표가 든 단계가
    // 좁은 채로 남고 그 안에 가로 스크롤이 생깁니다.
    const cellNeed = (cell) => {
      const words = spacedWords(cell.text);
      let need =
        words.reduce((most, word) => Math.max(most, visualLength(word)), 0) * letter + frame;
      for (const inner of cell.tables || []) {
        const rows = [inner.headers || [], ...(inner.rows || [])];
        const columns = rows.reduce((most, row) => {
          let at = 0;
          for (const one of row) {
            const from = one.column ?? at;
            at = from + (one.colSpan || 1);
          }
          return Math.max(most, at);
        }, 0);
        if (columns) need = Math.max(need, neededWidth(rows, columns) + frame);
      }
      return need;
    };
    const least = cards.map((card) => {
      let widest = 1;
      for (const row of card.grid) {
        // 한 줄에 칸이 여럿이면 그 줄에 드는 폭은 칸마다 드는 폭의 합입니다.
        let line = 0;
        for (const cell of row) line += cellNeed(cell);
        widest = Math.max(widest, line);
      }
      // 재는 값과 실제로 그려지는 폭은 몇 px 다릅니다(창 너비, 상자 여백,
      // 잇는 표시 자리). 그 차이만큼 넉넉히 잡습니다. 모자라면 그 단계 안에
      // 가로 스크롤이 생겨 글이 잘립니다.
      const SPARE = 12;
      return Math.min(((widest + SPARE) / room) * 100, 60);
    });

    // 모자란 만큼 끌어올리고, 그만큼을 여유 있는 단계에서 비례로 덜어 옵니다.
    const short = share.map((value, at) => Math.max(0, least[at] - value));
    const needed = short.reduce((sum, one) => sum + one, 0);
    const slack = share.map((value, at) => Math.max(0, value - least[at]));
    const slackTotal = slack.reduce((sum, one) => sum + one, 0);
    const take = Math.min(needed, slackTotal);
    const evened = share.map((value, at) =>
      needed && slackTotal
        ? value + (short[at] / needed) * take - (slack[at] / slackTotal) * take
        : value
    );
    const total = evened.reduce((sum, one) => sum + one, 0) || 1;
    // 폭을 100%로 꽉 채우면 안 됩니다. 상자 사이 틈만큼 넘쳐서, 브라우저가
    // 줄이는 대신 마지막 단계를 다음 줄로 내려 버립니다(줄 나눔이 줄이기보다
    // 먼저 일어납니다). 틈이 들어갈 자리를 남겨 둡니다.
    const ROOM_FOR_GAPS = 96;
    const shares = evened.map((value) => (value / total) * ROOM_FOR_GAPS);
    // 잇는 표시는 뒤따르는 상자와 한 덩어리로 묶습니다. 따로 두면 줄이 바뀌는
    // 자리에서 화살표만 줄 끝에 남아 허공을 가리킵니다.
    // 첫 상자 앞에도 자리는 두되 표시는 감춥니다. 그래야 줄마다 상자의
    // 왼쪽 끝이 나란히 섭니다.
    return `
      <div class="source-flow" data-source="chain" data-steps="${cards.length}">
        ${cards
          .map((card, at) => {
            const only = card.grid.length === 1 && card.grid[0].length === 1;
            const mine = (room * shares[at]) / 100 - 8;
            // 단계가 작은 표면 표로 그립니다. 상자를 또 두르면 테두리가
            // 두 겹이 되므로 이때는 상자 꾸밈을 뺍니다.
            const inside = only
              ? cellMarkup(cellLines(unwrap(card.grid[0][0].text)))
              : spannedTableMarkup("", card.grid[0], card.grid.slice(1), null, mine);
            return `
              <span class="source-flow-item" style="--flow-width: ${shares[at].toFixed(1)}%">
                <span class="source-flow-link"${
                  at ? "" : ' data-first="1"'
                } aria-hidden="true">${escapeHtml(link)}</span>
                <span class="source-flow-step"${only ? "" : ' data-table="1"'}>${inside}</span>
              </span>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function borderStyle(code) {
    const said = String(code || "");
    if (said.length !== 4) return "";
    const side = (letter) => LINE[letter] || LINE.n;
    return (
      `border-left:${side(said[0])};border-right:${side(said[1])};` +
      `border-top:${side(said[2])};border-bottom:${side(said[3])};`
    );
  }

  // 매뉴얼이 표로 '그림'을 그린 자리입니다(빌더의 drawnAsPicture가 표시합니다).
  // 서가 배치도, 시차출퇴근 개념도, 성과평가위원회 구성도, 빈 대장 서식처럼
  // 빈 칸이 곧 모양인 표입니다.
  //
  // 이런 표는 원문의 자리와 비율을 그대로 두어야 합니다. 다른 표에 쓰는
  // '어느 열도 자기 낱말보다 좁아지지 않게' 규칙을 태우면, 원문에서 폭
  // 162mm(600px 남짓)에 든 서가 그림이 1300px로 부풀어 가로로 넘어갑니다.
  // 원문에서도 '2010 문서'는 좁은 칸에서 두 줄로 접힙니다. 그것이 원문 모양입니다.
  function spannedTableMarkup(caption, headers, rows, sourceWidths, available, picture) {
    const room = Number(available) > 0 ? Number(available) : AVAILABLE;
    // 머리글과 본문을 <thead>·<tbody>로 나누면, 머리글 칸이 아래로 걸친 병합
    // (구 분: 2줄 차지)이 끊깁니다. 한 덩어리로 그리고 첫 줄만 머리글로 표시합니다.
    let grid = visibleCells([headers, ...rows]);
    // 열 수는 모든 행을 봐야 합니다. 머리글 행만 보면, 머리글이 한 칸뿐인데
    // 아래 행은 세 칸인 표에서 <col>을 하나만 만들어 표가 폭을 넘어갑니다.
    let columnCount = grid.reduce((most, row) => {
      let at = 0;
      for (const cell of row) {
        const from = cell.column ?? at;
        at = from + (cell.colSpan || 1);
      }
      return Math.max(most, at);
    }, 0) || headers.reduce((total, cell) => total + (cell.colSpan || 1), 0);

    // 그림 여백으로 둘러 둔 빈 줄·빈 열을 걷어내고 다시 셉니다.
    // 그림형 표에서는 그 빈 자리가 곧 그림이므로 걷어내지 않습니다.
    const trimmed = picture ? null : trimEmptyEdges(grid, columnCount);
    if (trimmed) {
      grid = visibleCells(trimmed.rows);
      columnCount = trimmed.columnCount;
      // 원문 열 너비는 걷어내기 전 열 수에 맞춰 둔 값이라 더는 못 씁니다.
      sourceWidths = null;
    }

    // 열 너비는 매뉴얼을 만든 사람이 정해 둔 비율을 바탕으로 하되,
    // 어느 열도 자기 낱말보다 좁아지지 않게 손봅니다.
    // 그래야 가로 스크롤 없이 한 화면에 들어가면서 글자도 안 끊깁니다.
    const base =
      Array.isArray(sourceWidths) && sourceWidths.length === columnCount
        ? sourceWidths
        : measuredWidths(grid, columnCount);
    // 폭 안에 들어갈 수 있으면 맞추고, 못 들어가면 가로로 넘겨 봅니다.
    // 우겨넣으면 낱말이 가운데에서 끊겨 오히려 못 읽습니다.
    //
    // 예전에는 690px로 보고 그보다 크면 넘겨 버렸는데, 어림값도 실제보다
    // 커서 들어갈 수 있는 표까지 가로 스크롤이 붙었습니다.
    const drawing = Boolean(picture) && Array.isArray(base) && base.length === columnCount;
    const needs = drawing ? room : neededWidth(grid, columnCount);
    const scrolls = needs > room;
    const widths = drawing ? base : fitWidths(base, grid, columnCount, scrolls ? needs : room);
    return `
      <div class="source-table-scroll" data-picture="${drawing ? 1 : 0}">
        <table class="source-criteria-table" style="--table-columns: ${columnCount}; --table-min: ${Math.round(
          needs
        )}px" data-picture="${drawing ? 1 : 0}" data-wide="${
          columnCount >= 7 ? 1 : 0
        }" data-scroll="${scrolls ? 1 : 0}" data-column-layout="${widths
          .map((width) => Number(width).toFixed(1))
          .join("-")}" aria-label="${escapeHtml(caption)}">
          <colgroup>
            ${widths.map((width) => `<col style="width: ${Number(width).toFixed(2)}%" />`).join("")}
          </colgroup>
          <tbody>
            ${fillGaps(grid, columnCount)
              .map(
                (cells, rowIndex) => `
                  <tr${drawing ? rowHeight(cells) : ""}>
                    ${(() => {
                      // 몇 번째 열에 놓인 칸인지 적어 둡니다. 맨 왼쪽 칸만
                      // 세로선을 긋지 않는데, 이것을 ':first-child'로 가리면
                      // 위 줄의 칸이 세로로 걸쳐 있는 줄에서 엉뚱한 칸이
                      // 맨 왼쪽으로 잡혀 표 한가운데 선이 끊깁니다.
                      let at = 0;
                      return cells
                        .map((cell) => {
                          const column = cell.column ?? at;
                          at = column + (cell.colSpan || 1);
                          const edge = column === 0 ? ' data-col="0"' : "";
                          // 그림형 표는 칸마다 원문에 적힌 선을 그대로 긋습니다.
                          const drawn = drawing ? ` style="${borderStyle(cell.border)}"` : "";
                          if (cell.filler) {
                            return `<td${
                              cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ""
                            }${edge}${drawn}></td>`;
                          }
                          // 원문에서 비어 있는 칸은 비워 둡니다.
                          const lines = cellLines(unwrap(cell.text));
                          // 칸 안에 표가 또 들어 있으면 이 칸이 쓸 수 있는
                          // 폭만큼만 줍니다. 바깥 표와 같은 폭으로 재면
                          // 안쪽 표가 반드시 칸을 넘어갑니다.
                          const share = widths
                            .slice(column, column + (cell.colSpan || 1))
                            .reduce((sum, value) => sum + Number(value || 0), 0);
                          const content = lines.length
                            ? cellMarkup(lines, cell.tables, (room * share) / 100 - 24)
                            : "";
                          const span = spanAttributes(cell);
                          // 절차를 잇는 화살표 칸은 상자를 그리지 않습니다.
                          const arrow = arrowOnly(cell.text) ? ' data-arrow="1"' : "";
                          // 그림형 표에는 머리글 칸이 없습니다. 원문이 표로
                          // 그린 그림이라 첫 줄·첫 열이 이름칸이 아닙니다.
                          if (drawing) {
                            return `<td${span}${edge}${drawn}${arrow}>${content}</td>`;
                          }
                          if (arrow) {
                            return `<td${span}${edge}${arrow}>${content}</td>`;
                          }
                          if (rowIndex === 0) {
                            return `<th scope="col"${span}${edge}>${content}</th>`;
                          }
                          if (column === 0) {
                            return `<th scope="row"${span}${edge}>${content}</th>`;
                          }
                          return `<td${span}${edge}>${content}</td>`;
                        })
                        .join("");
                    })()}
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

  // 한 칸이 실제로 어디에서 줄을 바꿀 수 있는지는 unwrap이 정합니다.
  // 너비를 잴 때도 같은 자리에서 끊어야 합니다. 띄어쓰기만 보고 재면
  // '징수관·재무관·물품관리관·채권관리관·…'이 끊을 수 없는 한 낱말로 잡혀,
  // 화면에서는 가운뎃점마다 줄이 바뀌는데도 표를 가로로 넘기게 만듭니다.
  // 한글·한자·가나는 글자마다 줄을 바꿀 수 있습니다. 매뉴얼도 그렇게 적혀
  // 있습니다.
  //
  //   제7편 보수작업 '대우공무원수당(지방공무원수당등에관한규정제5조의2)'
  //   원문 칸 너비 79px · 그 칸에서 다섯 줄로 접힙니다(hp:lineseg 5개).
  //
  // 이런 글자를 '끊으면 안 되는 낱말' 하나로 보면 그 열이 통째로 넓어지고,
  // 원문에서 80%였던 내용 열이 55%로 눌립니다. 원문 너비가 있는 표 280개
  // 가운데 167개가 그렇게 어긋나 있었습니다.
  //
  // 끊으면 안 되는 것은 로마자·숫자로 이어진 토막입니다('K-에듀파인', 금액,
  // 서식 이름). 한글은 원문처럼 어디서든 접힙니다.
  const CJK =
    /[\u1100-\u11FF\u2E80-\u303F\u3040-\u30FF\u3130-\u318F\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

  // 띄어쓰기로 나뉜 낱말입니다. '이 표를 제대로 보려면 가로로 몇 px 필요한가'를
  // 셀 때 씁니다. 한글도 글자 수만큼 자리를 차지하므로 여기서는 쪼개지 않습니다.
  // 쪼개면 스물두 열짜리 표가 '다 들어간다'고 나와 열마다 31px로 눌립니다
  // (제7편 '신분변동 시 보수지급방법').
  function spacedWords(value) {
    return unwrap(normalizeLine(value))
      .split(/[\s\u200B]+/)
      .filter(Boolean);
  }

  // 접을 수 없는 토막입니다. '이 열이 이보다 좁으면 낱말이 끊긴다'를 셀 때
  // 씁니다. 한글은 글자마다 접히므로 여기서는 쪼갭니다.
  function breakableWords(value) {
    return spacedWords(value)
      .flatMap((word) => word.split(new RegExp(CJK.source, "g")))
      .filter(Boolean);
  }

  // 열마다 '이보다 좁으면 낱말이 끊긴다' 하는 최소 몫을 구해,
  // 원문 비율이 그보다 좁은 열만 넓혀 줍니다. 넓힌 만큼은 여유 있는
  // 열에서 비례로 덜어 옵니다. 전체는 늘 100%라 가로 스크롤이 없습니다.
  //
  // 이 표를 낱말이 끊기지 않게 그리려면 가로로 몇 픽셀이 필요한지 어림합니다.
  // 어림값이 실제보다 크면, 들어갈 수 있는 표까지 가로 스크롤로 밀려납니다.
  // 제3편 휴직사유 표(9열)가 그랬습니다. 910px이 필요하다고 보았지만
  // 실제로는 610px이면 들어갑니다.
  //
  // 열이 일곱 이상이면 글자와 여백을 줄여 그립니다(structured-details.css의
  // data-wide). 어림도 그 크기로 해야 맞습니다.
  //   좁게 그릴 때  글자 13px · 좌우 여백과 선 18px
  //   보통          글자 15px · 좌우 여백과 선 26px
  function cellMetrics(columnCount) {
    return columnCount >= 7 ? { letter: 13.5, frame: 18 } : { letter: 15, frame: 26 };
  }

  function neededWidth(grid, columnCount) {
    const longest = Array.from({ length: columnCount }, () => 1);
    for (const row of grid) {
      for (const cell of row) {
        const span = cell.colSpan || 1;
        const words = spacedWords(cell.text);
        const most = words.reduce((top, word) => Math.max(top, visualLength(word)), 0) / span;
        for (let offset = 0; offset < span; offset += 1) {
          const column = cell.column + offset;
          if (column < columnCount) longest[column] = Math.max(longest[column], most);
        }
      }
    }
    const { letter, frame } = cellMetrics(columnCount);
    return longest.reduce((sum, value) => sum + value * letter + frame, 0);
  }

  function fitWidths(base, grid, columnCount, availablePx) {
    const longestWord = Array.from({ length: columnCount }, () => 1);
    for (const row of grid) {
      for (const cell of row) {
        const span = cell.colSpan || 1;
        // 여러 칸에 걸친 칸은 자기 몫만큼만 요구합니다.
        const words = breakableWords(cell.text);
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
    const { letter, frame } = cellMetrics(columnCount);
    const floors = longestWord.map((value) =>
      Math.min(((value * letter + frame) / availablePx) * 100, 60)
    );

    // 원문 너비가 열 수와 맞지 않는 표가 있습니다(표 안에 표가 든 경우).
    // 그럴 때는 고르게 나눈 값을 바탕으로 삼습니다. 없는 값을 쓰면 NaN이 됩니다.
    const given = floors.map((_, index) =>
      Number.isFinite(base[index]) && base[index] > 0 ? base[index] : 100 / columnCount
    );
    const givenTotal = given.reduce((sum, value) => sum + value, 0) || 1;
    const share = given.map((value) => (value / givenTotal) * 100);

    // 원문이 정해 둔 비율을 그대로 씁니다. 최소 몫에 못 미치는 열만 끌어올리고,
    // 끌어올린 만큼을 여유 있는 열에서 비례로 덜어 옵니다.
    //
    // 예전에는 반대로 했습니다. 모든 열에 최소 몫을 먼저 떼어 주고 남는 자리만
    // 원문 비율로 나눴습니다. 그러면 칸 여백(26px)까지 열마다 최소 몫으로
    // 잡혀, 좁은 열이 실제보다 넓어지고 내용이 든 열이 그만큼 눌립니다.
    //   제7편 보수작업 '지 급 요 령'  원문 80% → 화면 55%
    const short = share.map((value, index) => Math.max(0, floors[index] - value));
    const needed = short.reduce((sum, value) => sum + value, 0);
    if (!needed) return share.map((value) => Number(value.toFixed(2)));

    const slack = share.map((value, index) => Math.max(0, value - floors[index]));
    const slackTotal = slack.reduce((sum, value) => sum + value, 0);
    // 덜어 올 자리가 없으면 최소 몫끼리 비례로 나눕니다.
    if (slackTotal <= 0) {
      const floorTotal = floors.reduce((sum, value) => sum + value, 0) || 1;
      return floors.map((value) => Number(((value / floorTotal) * 100).toFixed(2)));
    }

    const take = Math.min(needed, slackTotal);
    const widths = share.map(
      (value, index) => value + (short[index] / needed) * take - (slack[index] / slackTotal) * take
    );
    const total = widths.reduce((sum, value) => sum + value, 0) || 1;
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
    let drewFlow = false;
    let drewNote = false;
    const flush = () => {
      if (!buffer.length) return;
      pieces.push(`<div class="source-structured-intro">${bodyItemsMarkup(buffer)}</div>`);
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
      // 한 줄기 절차가 표 여러 개로 나뉘어 있으면 이어서 한 덩어리로 그립니다.
      // 원문에서도 앞 표의 마지막 화살표가 다음 표의 첫 상자를 가리킵니다.
      if (table.flow) {
        const chain = [table];
        // 바로 붙어 있는 표만 잇습니다. 사이에 글줄이 하나라도 있으면 서로
        // 다른 절차입니다. 자리를 안 보고 이었더니 제8편 '채용 구분'에서
        // 신규채용 절차와 결원보충 승인절차가 여덟 칸짜리 한 줄로 붙고,
        // 그 사이에 있어야 할 소제목이 뒤로 밀렸습니다.
        let after = (table.lineStart ?? 0) + (table.lineCount ?? 0);
        for (let next = owner + 1; next < tables.length; next += 1) {
          if (!tables[next].flow) break;
          if (drawn.has(next)) break;
          if ((tables[next].lineStart ?? -1) !== after) break;
          drawn.add(next);
          chain.push(tables[next]);
          after = (tables[next].lineStart ?? 0) + (tables[next].lineCount ?? 0);
        }
        const shown = flowMarkup(chain);
        if (shown) {
          drewFlow = true;
          pieces.push(shown);
          continue;
        }
      }
      const headerCells = headerCellsOf(table);
      // 칸이 하나뿐인 것은 표가 아니라 매뉴얼이 글을 둘러 둔 상자입니다.
      // 격자로 그리면 머리글 서식이 붙어 글이 통째로 굵어지고,
      // 표를 담는 바깥 상자와 겹쳐 테두리가 두 겹으로 보입니다.
      const onlyCells = [...headerCells, ...(table.rows || []).flat()];
      if (onlyCells.length === 1) {
        const noteLines = cellLines(unwrap(onlyCells[0].text));
        if (noteLines.length) {
          drewNote = true;
          pieces.push(
            `<div class="source-note-box">${cellMarkup(
              noteLines,
              onlyCells[0].tables,
              AVAILABLE - 40
            )}</div>`
          );
          continue;
        }
      }

      // 매뉴얼이 표로 그려 둔 절차도도 표 그대로 그립니다.
      //
      // 예전에는 이런 표를 알아보고 카드와 화살표로 다시 그렸습니다. 표에서
      // 병합과 열 너비를 잃던 시절에는 그편이 나아 보였습니다. 그런데 카드로
      // 옮기려면 원문의 자리를 버리고 한 줄짜리 차례로 펴야 합니다.
      // 가지가 갈라지는 그림은 펼 수가 없어 카드 한 장에 열세 줄이 들어가고
      // (제8편 '촉탁직 노동자 (재)고용'), 상자 크기도 글자 길이대로 제각각이
      // 되어 원문과 딴판이 됩니다.
      //
      // 이제는 한글파일의 칸 주소와 열 너비를 그대로 가져오므로, 원문 자리에
      // 원문 그대로 그리는 것이 가장 정확합니다. 화살표도 원문이 놓아둔
      // 칸에 그대로 섭니다.
      drewGrid = true;
      pieces.push(
        spannedTableMarkup(caption, headerCells, table.rows, table.widths, 0, table.picture)
      );
    }
    flush();

    if (!drawn.size) return null;
    // 한 블록에 여러 가지가 섞이면 가장 무거운 것을 이름으로 삼습니다.
    const kind = drewGrid ? "table" : drewFlow ? "flow" : "note";
    const label = { table: "표", flow: "흐름도", note: "내용" }[kind];
    if (!drewGrid && !drewFlow && !drewNote) return null;
    return {
      summary: `${caption} ${label}로 보기`,
      html: pieces.join(""),
      type: kind,
    };
  }

  // 표가 든 칸에서, 표 앞뒤에 붙은 본문 줄을 그립니다.
  //
  // 예전에는 표 칸을 그리는 cellMarkup으로 그렸습니다. 그것은 칸 안의 글이라
  // 글머리표를 떼어 냅니다. 그래서 표가 있는 항목만 '▸'가 사라져, 표가 없는
  // 항목과 생김새가 달랐습니다.
  //
  // 표가 없는 항목을 그리는 쪽(app-faithful-workflow.js)과 같은 클래스를 씁니다.
  // 클래스가 같아야 기호 칸 너비·들여쓰기가 저절로 같아집니다.
  // 기호마다 들여쓰기 단계가 정해져 있습니다. 어느 항목에서나 같아야
  // 같은 기호가 늘 같은 자리에 섭니다.
  // app-faithful-workflow.js의 MARKER_LEVEL과 같아야 합니다. 다르면 표가 든
  // 항목과 없는 항목의 들여쓰기가 어긋납니다.
  // (scripts/validate_source_presentation.mjs가 화면에서 이를 확인합니다.)
  //
  // 단계는 한글파일에서 두 기호가 잇달아 나온 자리의 앞공백을 세어 정했습니다.
  // scripts/validate_marker_levels.py가 그 셈을 다시 해 이 표와 맞대어 봅니다.
  const MARKER_LEVEL = {
    "•": 0, "▶": 0, "▪": 0, "□": 0, "○": 0, "◦": 0,
    "‣": 1, "▸": 1, "▹": 1,
    "※": 2, "*": 2,
    "-": 3, "–": 3,
  };

  function levelOf(marker) {
    const level = MARKER_LEVEL[marker];
    return level === undefined ? 0 : level;
  }

  function bodyItemsMarkup(lines) {
    const items = sourceOutlineItems(lines.join("\n"));
    if (!items.length) return "—";
    // 사진 줄과 그 다음 이름 줄은 한 덩이로 그립니다.
    const paired = new Set();
    items.forEach((item, at) => {
      const next = items[at + 1];
      if (paired.has(at) || !next) return;
      if (pairedPictures(item.text, next.text)) paired.add(at + 1);
    });
    return `<ul class="semantic-summary-list">${items
      .map((item, at) => {
        if (paired.has(at)) return "";
        const level = levelOf(item.marker);
        const together = items[at + 1] && pairedPictures(item.text, items[at + 1].text);
        if (together) {
          return `<li class="semantic-summary-item semantic-summary-plain"
                      style="--summary-level: ${level}">${together}</li>`;
        }
        // 사진만 든 줄에는 글머리표를 붙이지 않습니다. 사진이 곧 내용입니다.
        if (pictureOnly(item.text)) {
          return `<li class="semantic-summary-item semantic-summary-plain"
                      style="--summary-level: ${level}">${withPictures(
            escapeHtml(item.text)
          )}</li>`;
        }
        return item.marker
          ? `<li class="semantic-summary-item" style="--summary-level: ${level}">
              <span class="semantic-summary-marker" aria-hidden="true">${escapeHtml(
                item.marker
              )}</span>
              <span class="semantic-summary-text">${withPictures(escapeHtml(item.text))}</span>
            </li>`
          : `<li class="semantic-summary-item semantic-summary-plain"
                 style="--summary-level: ${level}">
              <span class="semantic-summary-text">${withPictures(escapeHtml(item.text))}</span>
            </li>`;
      })
      .join("")}</ul>`;
  }

  function sourceOutlineItems(body) {
    const lines = bodyLines(body);
    const items = [];
    let latestPrimary = null;
    let latestNumbered = null;

    let afterPicture = false;
    for (const rawLine of lines) {
      const line = normalizeLine(rawLine);
      // 사진 줄과 그 다음 이름 줄은 홀로 세웁니다. 원문 안쪽 표의 두 줄이라
      // 앞줄에 붙여 버리면 사진과 이름을 짝지을 수 없습니다.
      const picture = pictureOnly(line);
      if (picture || afterPicture) {
        items.push({ marker: "", text: line, level: 0, type: "paragraph" });
        latestPrimary = null;
        latestNumbered = null;
        afterPicture = picture;
        continue;
      }
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

  // 사진 그리는 규칙은 app-faithful-workflow.js도 그대로 씁니다.
  // 두 곳에 같은 규칙을 적어 두면 반드시 한쪽만 고치게 되므로 여기 한 군데에 둡니다.
  window.GUIDE_PICTURES = { withPictures, pairedPictures, pictureOnly, hasPicture };
  window.GUIDE_DETAIL_RENDERER = { render, showCellMarks };
})();
