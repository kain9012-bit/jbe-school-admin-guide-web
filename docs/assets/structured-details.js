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

  // 원문이 그림을 본문 폭의 몇 %로 놓았는지입니다. 화면도 그 폭으로 그립니다.
  // 예전에는 사진 한 장을 34rem(약 340px)으로 못박아 두어, 원문에서 본문 폭을
  // 거의 채우던 그림(제14편 [참고1] 편성절차 개요 — 본문 폭의 93%)이 절반도
  // 안 되게 쪼그라들었습니다.
  function placeOf(name) {
    const data = window.ACTIVE_GUIDE_DATA || {};
    const place = (data.pictures || {})[name];
    return Number(place) > 0 ? Math.min(Number(place), 100) : 0;
  }

  function pictureMarkup(name) {
    const chapter = (window.ACTIVE_GUIDE_CHAPTER && window.ACTIVE_GUIDE_CHAPTER.id) || "01";
    // 그림은 손실 없이(PNG) 담아 둡니다. JPEG로 줄이면 글자가 든 그림의
    // 글씨가 뭉개져 원본보다 흐려집니다(scripts/extract_manual_images.py).
    const src = `assets/manual-images/chapter${chapter}/${escapeHtml(name)}.png`;
    const place = placeOf(name);
    const room = place ? ` style="--picture-place: ${place}%"` : "";
    return `<img class="source-picture" src="${src}" alt="매뉴얼 그림" loading="lazy"${room} />`;
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
  // 원문이 지면 맨 위에 얹어 둔 '이름 띠'입니다. 딱지 한 칸과 이름 한 칸,
  // 단 두 칸으로 된 표입니다.
  //   [흐름도] 제증명 민원 발급 절차
  //   [인 사]  휴직제도
  // 원문에서는 앞 칸이 색 딱지이고 뒤 칸이 지면 이름입니다. 여느 머리줄과
  // 같이 칠하면 두 칸이 통째로 색 바탕이 되어 이름을 읽을 수 없습니다.
  // 여기서는 무엇인지만 적어 두고, 어떻게 칠할지는 화면 쪽(CSS)이 정합니다.
  // 자리와 짜임새는 그대로 둡니다 — 표 그대로 그립니다.
  const sheetBand = (table) =>
    (table.headers || []).length === 2 && !(table.rows || []).length;

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
        // 표가 삼킨 줄의 마지막 한 글자(닫는 괄호)가 다음 줄 맨 앞으로 밀려
        // 나오는 자리가 있습니다. 빌더가 글자를 견줄 때 괄호를 빼고 보아서,
        // 표는 제 줄을 찾지만 그 괄호는 표 다음 줄 앞에 남습니다.
        //   원문 … 근무상황(특별휴가 → 장기재직휴가)  [표 끝]
        //        자주 쓰는 휴가
        //   화면 ')자주 쓰는 휴가'
        // 표 바로 다음 줄일 때만 앞의 닫는 괄호를 텁니다(제4편).
        const afterTable = owners.has(index - 1);
        buffer.push(afterTable ? line.replace(/^\s*[)\]）］}」』]+\s*/, "") : line);
        return;
      }
      if (drawn.has(owner)) return;
      drawn.add(owner);
      flush();
      const table = owned[owner];
      const drawnTable = spannedTableMarkup(
        "",
        headerCellsOf(table),
        table.rows || [],
        table.widths,
        available,
        table.picture
      );
      pieces.push(
        sheetBand(table) ? `<div class="source-sheet-band">${drawnTable}</div>` : drawnTable
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
    // 그림 자리 표시는 글자가 아닙니다. 화면에는 사진으로 그려지고 제 칸
    // 너비에 맞춰 줄어듭니다. 이것을 글자로 세면 '[[그림:image13]]' 열다섯
    // 글자만큼 칸이 넓어져, 폭 안에 들어가던 표에 가로 스크롤이 생깁니다
    // (제12편 '3. 전자태그 및 장비' — 필요 폭이 962px로 잡혔습니다).
    return normalizeLine(source.replace(PICTURE_MARK, " ").replace(/<[^>]*>/g, " "));
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

  // 한 줄기 절차가 종이 폭에 안 들어가면 매뉴얼은 그것을 접어 아래 단으로
  // 내려 씁니다. 접힌 자리는 양옆이 트인 띠이고, 그 띠에 놓인 ⇩가 '여기서
  // 다음 단으로 이어진다'고 말합니다(빌더의 foldRows → flow.bands·folds).
  //
  //   제11편 공유재산의 관리 '1. 토지이동 신청'
  //   원문   [토지이동 대상 토지 현황 파악] ⇨ [토지이동 추진 내부결재…]
  //                                                        ⇩
  //          [K-에듀파인 재산대장 정리]     ⇨ [토지대장 및 …확인]
  //
  //   예전 화면 : 왼쪽 상자 하나에 단계 둘이 갇히고 그 사이에 속이 빈 띠가
  //               남았습니다. ⇩는 오른쪽 상자 안 한 줄로 들어앉았습니다.
  //
  // 단마다 따로 그리고 그 사이에 원문의 ⇩를 세웁니다. 상자 폭은 단끼리
  // 같아야 세로로 나란히 서므로, 폭은 단이 아니라 '몇째 단계인가'로 정합니다.
  function flowMarkup(tables) {
    const lanes = [];
    let lane = null;
    let link = "⇨";
    for (const table of tables) {
      const chain = table.flow;
      if (!chain || !Array.isArray(chain.steps)) continue;
      if (chain.link) link = chain.link;
      const rows = [table.headers || [], ...(table.rows || [])];
      const bands =
        Array.isArray(table.bands) && table.bands.length
          ? table.bands
          : [[0, rows.length - 1]];
      const folded = bands.length > 1;
      // 접힌 자리의 화살표가 몇째 열에 놓였는지 원문이 적어 둡니다. 그 열이
      // 든 단계 밑에 세웁니다. 늘 가운데에 세우면 원문이 오른쪽 끝에서 접은
      // 절차가 한가운데에서 접힌 것처럼 보입니다.
      const stepAt = (column) => {
        if (!(column >= 0)) return 0;
        const inside = chain.steps.findIndex(([one, other]) => column >= one && column <= other);
        if (inside >= 0) return inside;
        // 잇는 화살표 열에 놓였습니다. 가장 가까운 단계에 붙입니다.
        let best = 0;
        let near = Infinity;
        chain.steps.forEach(([one, other], at) => {
          const gap = column < one ? one - column : column - other;
          if (gap < near) {
            near = gap;
            best = at;
          }
        });
        return best;
      };
      bands.forEach((band, at) => {
        // 접힌 절차는 다른 표와 한 줄로 잇지 않습니다. 이으면 단이 뒤섞입니다.
        if (!lane || folded) {
          lane = { cards: [], fold: null };
          lanes.push(lane);
        }
        const mine = rows.slice(band[0], band[1] + 1);
        for (const [from, to] of chain.steps) {
          const grid = stepGrid(mine, from, to);
          if (!grid.length) continue;
          const width = (table.widths || [])
            .slice(from, to + 1)
            .reduce((sum, value) => sum + Number(value || 0), 0);
          // 마지막 단은 단계가 모자라기도 합니다(제11편 매점 흐름도).
          // 원문에서 그 자리는 테두리까지 트여 아무것도 없습니다. 상자를
          // 두르면 속이 빈 상자가 생기므로 자리만 비워 둡니다.
          const empty = !grid.some((row) =>
            row.some((cell) => String(cell.text || "").trim())
          );
          lane.cards.push({ grid, width, empty });
        }
        if (folded && at < bands.length - 1) {
          // 화살표가 여럿이면 저마다 제 단계 밑에 섭니다. 나란한 절차 둘이
          // 함께 접힌 자리를 하나로 뭉치면 한쪽이 사라집니다.
          const marks = (table.folds || [])[at] || [];
          lane.fold = marks.length
            ? marks.map((one) => ({ step: stepAt(one.column), mark: one.mark || "⇩" }))
            : [{ step: 0, mark: "⇩" }];
        }
      });
      if (folded) lane = null;
    }
    const shown = lanes.filter((one) => one.cards.length);
    if (!shown.length) return "";
    const columns = Math.max(...shown.map((one) => one.cards.length));
    if (columns < 2) return "";
    // 잇는 표시가 차지하는 자리를 빼고 남은 폭을 나눠 가집니다.
    const room = AVAILABLE - columns * 24;

    // 상자 폭은 원문 열 너비를 그대로 씁니다. 단이 여럿이면 같은 자리의
    // 단계끼리 같은 폭을 씁니다(원문에서도 한 표의 같은 열입니다).
    const given = [];
    for (let at = 0; at < columns; at += 1) {
      let width = 0;
      for (const one of shown) width = Math.max(width, Number(one.cards[at]?.width || 0));
      given.push(width || 100 / columns);
    }
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
    const cardNeed = (card) => {
      let widest = 1;
      for (const row of card.grid) {
        // 한 줄에 칸이 여럿이면 그 줄에 드는 폭은 칸마다 드는 폭의 합입니다.
        let line = 0;
        for (const cell of row) line += cellNeed(cell);
        widest = Math.max(widest, line);
      }
      return widest;
    };
    // 같은 자리의 단계는 단이 달라도 폭이 같아야 세로로 나란히 섭니다.
    // 그러므로 가장 넓게 드는 단을 기준으로 잡습니다.
    const least = [];
    for (let at = 0; at < columns; at += 1) {
      let widest = 1;
      for (const one of shown) {
        const card = one.cards[at];
        if (!card || card.empty) continue;
        widest = Math.max(widest, cardNeed(card));
      }
      // 재는 값과 실제로 그려지는 폭은 몇 px 다릅니다(창 너비, 상자 여백,
      // 잇는 표시 자리). 그 차이만큼 넉넉히 잡습니다. 모자라면 그 단계 안에
      // 가로 스크롤이 생겨 글이 잘립니다.
      const SPARE = 12;
      least.push(Math.min(((widest + SPARE) / room) * 100, 60));
    }

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
    const laneMarkup = (one) => `
      <div class="source-flow" data-source="chain" data-steps="${one.cards.length}">
        ${one.cards
          .map((card, at) => {
            const room100 = ` style="--flow-width: ${shares[at].toFixed(1)}%"`;
            if (card.empty) {
              // 원문이 테두리까지 트여 아무것도 두지 않은 자리입니다.
              // 자리만 비워 두어야 위아래 단의 상자가 나란히 섭니다.
              return `
              <span class="source-flow-item"${room100} aria-hidden="true">
                <span class="source-flow-link" data-first="1"></span>
                <span class="source-flow-step" data-empty="1"></span>
              </span>
            `;
            }
            const mine = (room * shares[at]) / 100 - 8;
            // 한 단계 안에서도 상자가 둘로 나뉘어 있기도 합니다. 원문 테두리가
            // 그렇게 말합니다 — 그 줄은 양옆이 트이고 위아래에만 선이 있습니다
            // (빌더의 betweenBoxes).
            //
            //   제12편 '4. 물품취득 후 출급절차'
            //   [물품관리관 / 출납 명령]   ← 상자 하나
            //           (사이)
            //   [물품출납공무원 / 물품 출납] ← 또 하나
            //
            //   예전 화면 : 넷이 한 상자에 갇히고 그 사이에 빈 칸이 남았습니다.
            const boxes = [];
            let part = [];
            for (const row of card.grid) {
              const between =
                row.length > 0 &&
                row.every((cell) => cell.gap && !String(cell.text || "").trim());
              if (between) {
                if (part.length) boxes.push(part);
                part = [];
                continue;
              }
              part.push(row);
            }
            if (part.length) boxes.push(part);
            const drawn = boxes
              .map((box) => {
                const only = box.length === 1 && box[0].length === 1;
                const inside = only
                  ? cellMarkup(cellLines(unwrap(box[0][0].text)))
                  : spannedTableMarkup("", box[0], box.slice(1), null, mine);
                return `<span class="source-flow-step"${
                  only ? "" : ' data-table="1"'
                }>${inside}</span>`;
              })
              .join("");
            return `
              <span class="source-flow-item"${room100}>
                <span class="source-flow-link"${
                  at ? "" : ' data-first="1"'
                } aria-hidden="true">${escapeHtml(link)}</span>
                ${
                  boxes.length > 1
                    ? `<span class="source-flow-stack">${drawn}</span>`
                    : drawn
                }
              </span>
            `;
          })
          .join("")}
      </div>
    `;

    // 접힌 자리입니다. 원문이 ⇩를 둔 단계 아래에 세웁니다. 가운데에 세우면
    // 오른쪽 끝에서 접은 절차가 한가운데에서 접힌 것처럼 보입니다.
    // 상자 줄과 같은 폭으로 자리를 잡아야 화살표가 제 단계 밑에 섭니다.
    const foldMarkup = (fold) => {
      const at = new Map((fold || []).map((one) => [one.step || 0, one.mark || "⇩"]));
      return `
      <div class="source-flow" data-source="chain" data-fold="1" aria-hidden="true">
        ${shares
          .map(
            (width, step) => `
              <span class="source-flow-item" style="--flow-width: ${width.toFixed(1)}%">
                <span class="source-flow-link" data-first="1"></span>
                <span class="source-flow-turn">${
                  at.has(step) ? escapeHtml(at.get(step)) : ""
                }</span>
              </span>
            `
          )
          .join("")}
      </div>
    `;
    };

    return shown
      .map((one) => laneMarkup(one) + (one.fold ? foldMarkup(one.fold) : ""))
      .join("");
  }

  // 세로로 내려가는 절차도 원문에서는 접혀 있습니다. 상자 하나하나가 따로
  // 서고, 그 사이를 트인 띠가 가르며 거기에 ⇩가 놓입니다.
  //
  //   제11편 공유재산의 취득 '2. 가설건축물 취득절차' (7행 2열)
  //   r0 ssss[학교]    ssss[◦가설건축물 계획 수립…]
  //   r1 nnss[⇩ ← 두 열을 통째로 덮는 칸 하나, 양옆이 트임]
  //   r2 ssss[교육청]  ssss[◦가설건축물 축조 신고필증 교부…]
  //
  //   예전 화면 : 상자 넷이 한 표로 붙고, 바깥 테두리가 띠를 가로질러
  //               상자가 갈라져 보이지 않았습니다. 게다가 첫 줄만 머리글로
  //               잡혀 그 상자의 글만 굵었습니다.
  //
  // 단마다 따로 그리고 그 사이에 원문의 화살표를 세웁니다.
  // 갈래로 갈리는 세로 절차입니다(빌더의 branchLanes).
  //
  //   제13편 시설물 관리위탁 '2. 유지관리자 선임'
  //     [건축물 관리주체(소유자 또는 관리자)]   ← 두 갈래를 덮는 머리 단계
  //        ⇩                    ⇩
  //     [유지관리자 지정]      [시설물 관리전문업체 위탁]
  //        ⇩
  //     [대한기계설비건설협회 경력신고 / 등급산정…]
  //        ⇩ …
  //
  // 한 줄기로 이으면 오른쪽 갈래가 왼쪽 줄기 안으로 딸려 들어갑니다.
  // 갈래마다 제 열 자리에 세우고, 그 안에서 상자를 위아래로 쌓습니다.
  function branchMarkup(caption, table) {
    const plan = table.branch;
    if (!plan || !Array.isArray(plan.lanes) || plan.lanes.length < 2) return "";
    const rows = [table.headers || [], ...(table.rows || [])];
    const widths = Array.isArray(table.widths) ? table.widths : null;

    // 한 상자입니다. 줄이 하나뿐이고 칸도 하나면 글만 놓습니다.
    const boxMarkup = (mine) => {
      if (!mine.length) return "";
      const only = mine.length === 1 && mine[0].length === 1;
      const inside = only
        ? cellMarkup(cellLines(unwrap(mine[0][0].text)))
        : spannedTableMarkup("", mine[0], mine.slice(1), null, 0, false, true);
      return `<span class="source-flow-step"${only ? "" : ' data-table="1"'}>${inside}</span>`;
    };

    const laneWidth = (lane) => {
      if (!widths) return 100 / plan.lanes.length;
      const mine = widths
        .slice(lane.columns[0], lane.columns[1] + 1)
        .reduce((sum, value) => sum + Number(value || 0), 0);
      return mine || 100 / plan.lanes.length;
    };
    const room = plan.lanes.reduce((sum, lane) => sum + laneWidth(lane), 0) || 100;

    const head = rows.slice(plan.head[0], plan.head[1] + 1);
    const headCells = head.map((row) => row.filter((cell) => !cell.filler));
    const top = headCells.some((row) => row.length) ? boxMarkup(headCells) : "";

    const lanes = plan.lanes
      .map((lane) => {
        const [left, right] = lane.columns;
        const steps = lane.steps
          .map((step, at) => {
            const mine = stepGrid(rows.slice(step[0], step[1] + 1), left, right);
            const box = boxMarkup(mine);
            if (!box) return "";
            const link = at === 0 ? lane.lead : lane.marks[at - 1];
            return (
              (link
                ? `<span class="source-flow-turn" aria-hidden="true">${escapeHtml(link)}</span>`
                : "") + box
            );
          })
          .join("");
        const share = ((laneWidth(lane) / room) * 96).toFixed(1);
        return `<div class="source-flow-lane" style="--flow-width: ${share}%">${steps}</div>`;
      })
      .join("");

    return `
      <div class="source-flow-branch" data-source="branch">
        ${caption ? `<p class="source-table-caption">${escapeHtml(caption)}</p>` : ""}
        ${top ? `<div class="source-flow-top">${top}</div>` : ""}
        <div class="source-flow-lanes">${lanes}</div>
      </div>
    `;
  }

  function foldedTableMarkup(caption, table) {
    const bands = Array.isArray(table.bands) ? table.bands : null;
    if (!bands || bands.length < 2 || table.picture) return "";
    const rows = [table.headers || [], ...(table.rows || [])];
    const marks = Array.isArray(table.folds) ? table.folds : [];
    // 단마다 줄 수가 같으면 머리글 줄이 없습니다. 같은 모양이 되풀이될 뿐인데
    // 첫 단의 첫 줄만 굵어지면 그 상자만 달라 보입니다(가설건축물 취득절차).
    // 첫 단만 줄이 더 많으면 그 첫 줄이 진짜 머리글입니다
    // (제11편 '1. 처리절차 및 방법' — 단계 | 처리절차 및 방법 | 비고).
    const sameShape = bands.every(
      ([one, other]) => other - one === bands[0][1] - bands[0][0]
    );
    const parts = bands.map((band, at) => {
      const mine = rows.slice(band[0], band[1] + 1);
      if (!mine.length) return "";
      // 단을 넘어 걸쳐 있던 병합은 이 단만큼으로 줄입니다.
      const kept = mine.map((row) =>
        row.map((cell) => ({
          ...cell,
          rowSpan: Math.min(cell.rowSpan || 1, mine.length),
        }))
      );
      const drawn = spannedTableMarkup(
        at ? "" : caption,
        kept[0],
        kept.slice(1),
        table.widths,
        0,
        false,
        sameShape || at > 0
      ).replace('<table class="source-criteria-table"', '<table data-folded="1" class="source-criteria-table"');
      const fold = marks[at];
      if (!fold || !fold.length || at === bands.length - 1) return drawn;
      // 화살표는 원문이 놓은 열 자리에 세웁니다. 나란한 절차 둘이 함께 접힌
      // 자리(제16편 '1인수의 / 2인수의')나 한 줄기가 둘로 갈리는 자리
      // (제13편 '2. 유지관리자 선임')를 하나로 뭉치면 한쪽이 사라집니다.
      const widths = Array.isArray(table.widths) ? table.widths : null;
      const spread = (one) => {
        if (!widths || !(one.column >= 0)) return null;
        const before = widths.slice(0, one.column).reduce((sum, value) => sum + Number(value || 0), 0);
        const mine = widths
          .slice(one.column, one.column + (one.span || 1))
          .reduce((sum, value) => sum + Number(value || 0), 0);
        if (!mine) return null;
        return ` style="left: ${before.toFixed(2)}%; width: ${mine.toFixed(2)}%"`;
      };
      const strip = fold
        .map(
          (one) =>
            `<span class="source-table-turn"${spread(one) || ""}>${escapeHtml(
              one.mark || "⇩"
            )}</span>`
        )
        .join("");
      return `${drawn}<div class="source-table-fold" aria-hidden="true">${strip}</div>`;
    });
    return parts.join("");
  }

  // boxed는 원문이 **바탕색으로** 상자를 만들어 둔 칸입니다. 색이 상자 모양을
  // 만들어 주므로 원문은 그 칸의 테두리를 다 긋지 않습니다.
  //
  //     제13편 '시설물 관리전문업체 위탁'
  //     원문 : 왼쪽·위에만 선. 오른쪽·아래는 청록 바탕이 닫아 줍니다.
  //     화면 : 원문 색을 쓰지 않으므로 두 면만 그어진 상자가 열려 보입니다.
  //
  // 색이 만들던 상자를 선으로 대신 닫습니다.
  function borderStyle(code, boxed) {
    const said = String(code || "");
    if (said.length !== 4) return boxed ? `border:${LINE.s};` : "";
    const side = (letter) => LINE[letter] || LINE.n;
    const line = (letter) => (boxed && letter === "n" ? LINE.s : side(letter));
    return (
      `border-left:${line(said[0])};border-right:${line(said[1])};` +
      `border-top:${line(said[2])};border-bottom:${line(said[3])};`
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
  function spannedTableMarkup(caption, headers, rows, sourceWidths, available, picture, plain) {
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
    // 칸 안에 든 표에는 가로 스크롤을 두지 않습니다.
    //
    // 스크롤은 '이 표는 넓으니 넘겨 보라'는 뜻인데, 칸 안에서는 넘겨 볼 자리
    // 자체가 좁아(제14편 앞머리 요약의 안쪽 표는 칸이 311px입니다) 스크롤바가
    // 표를 반쯤 가립니다. 게다가 바깥 표에는 스크롤이 없으니 그 안에서만
    // 따로 밀리는 것이 되어 어디를 보고 있는지 알 수 없습니다.
    //
    // 한글은 글자마다 접히므로 칸 폭에 맞춰 줄이면 줄이 늘 뿐 글자는 안
    // 끊깁니다. 원문에서도 좁은 칸의 글은 여러 줄로 접혀 있습니다.
    //
    // 폭이 정말 넓어 넘겨 봐야 하는 표(제7편 수당표 22열)는 본문에 홀로
    // 놓인 표라 여기에 걸리지 않습니다.
    const inCell = Number(available) > 0;
    const scrolls = !inCell && needs > room;
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
                          const drawn = drawing ? ` style="${borderStyle(cell.border, cell.boxed)}"` : "";
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
                          // 원문에서 양옆이 트인 띠의 칸도 마찬가지입니다.
                          // 상자와 상자 사이의 자리이지 칸이 아닙니다
                          // (빌더의 gapCells).
                          const arrow =
                            arrowOnly(cell.text) || cell.gap ? ' data-arrow="1"' : "";
                          // 그림형 표에는 머리글 칸이 없습니다. 원문이 표로
                          // 그린 그림이라 첫 줄·첫 열이 이름칸이 아닙니다.
                          if (drawing) {
                            return `<td${span}${edge}${drawn}${arrow}>${content}</td>`;
                          }
                          if (arrow) {
                            return `<td${span}${edge}${arrow}>${content}</td>`;
                          }
                          // 접힌 표를 단마다 잘라 그릴 때는 머리글 줄이
                          // 없습니다. 단마다 같은 모양이 되풀이될 뿐인데
                          // 첫 단의 첫 줄만 굵어지면 그 상자만 달라 보입니다
                          // (제11편 '2. 가설건축물 취득절차').
                          if (rowIndex === 0 && !plain) {
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
    // 그림 자리 표시는 낱말이 아닙니다(위 plainCellText).
    return unwrap(normalizeLine(String(value ?? "").replace(PICTURE_MARK, " ")))
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
      // 원문이 접어 놓은 표는 접힌 자리에서 갈라 상자마다 따로 그립니다.
      const folded = branchMarkup(caption, table) || foldedTableMarkup(caption, table);
      pieces.push(
        folded ||
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

  // ── 편 앞머리 '한눈에 보기' 지면 ─────────────────────────────
  //
  // 이 지면은 원문에서 한 장짜리 요약입니다. 한글파일에는 표 하나로
  // 들어 있지만 표가 아닙니다. 안에 세 가지가 섞여 있습니다.
  //
  //   · 구역 머리   [흐름도] 제증명 민원 발급 절차     ← 딱지 + 지면 이름
  //   · 절차        [교육기관 방문] ⇒ [발급 절차] ⇒ [민원서류 수령]
  //   · 주체별 할 일 [공통] [접수기관] [처리기관] [교부기관]
  //   · 진짜 표     구분 | 발급 기준연도
  //
  // 그대로 격자로 옮기면 이 넷이 모두 회색 칸으로 뭉개집니다. 원문에서
  // 상자였던 것은 상자로, 이어지던 것은 화살표로, 표였던 것만 표로 그립니다.
  // 글자는 원문 그대로 옮겨 놓기만 하고 하나도 지어내지 않습니다.
  //
  // 편 앞머리 지면의 블록입니다(cNN-w00-b…). 18편 모두 여기로 옵니다.
  const FRONT_SHEET = /^c\d+-w00-b/;

  // 표를 칸 자리대로 펴 둡니다. 병합된 칸이 어느 자리를 덮는지 알아야
  // '이 열은 통째로 화살표'를 셀 수 있습니다.
  function sheetGrid(table) {
    const rows = [table.headers || [], ...(table.rows || [])];
    let columns = 0;
    for (const row of rows) {
      for (const cell of row) {
        columns = Math.max(columns, (cell.column ?? 0) + (cell.colSpan || 1));
      }
    }
    const cover = rows.map(() => new Array(columns).fill(null));
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
    return { rows, columns, cover };
  }

  const said = (cell) => String((cell && cell.text) || "").trim();

  // 세로줄이 통째로 화살표인 자리가 단계와 단계의 경계입니다.
  // 빌더의 stepChain과 같은 눈으로 봅니다.
  function sheetChain(table) {
    const grid = sheetGrid(table);
    if (grid.columns < 3) return null;
    const link = [];
    for (let column = 0; column < grid.columns; column += 1) {
      let some = false;
      let all = true;
      for (let at = 0; at < grid.rows.length; at += 1) {
        const cell = grid.cover[at][column];
        if (!cell || !said(cell)) continue;
        some = true;
        if (!arrowOnly(said(cell)) || (cell.colSpan || 1) > 1) all = false;
      }
      link.push(some && all);
    }
    if (!link.some(Boolean)) return null;
    const steps = [];
    let from = -1;
    for (let column = 0; column <= grid.columns; column += 1) {
      if (column < grid.columns && !link[column]) {
        if (from < 0) from = column;
        continue;
      }
      if (from >= 0) steps.push([from, column - 1]);
      from = -1;
    }
    if (steps.length < 2) return null;
    const mark =
      grid.rows
        .flat()
        .map(said)
        .find((text) => text && arrowOnly(text)) || "⇒";
    return { grid, steps, mark, widths: table.widths, link };
  }

  // 한 단계 상자 안을 그립니다. 첫 줄이 이름이고, 그 아래가 내용입니다.
  // 한 줄에 칸이 여럿이면 원문에서 나란히 놓은 것이므로 나란히 놓습니다.
  function sheetStepMarkup(grid, [left, right]) {
    const seen = new Set();
    const lines = [];
    grid.rows.forEach((row, at) => {
      const mine = row.filter((cell) => {
        const from = cell.column ?? 0;
        return from >= left && from + (cell.colSpan || 1) - 1 <= right && said(cell);
      });
      if (!mine.length) return;
      const fresh = mine.filter((cell) => !seen.has(cell));
      if (!fresh.length) return;
      fresh.forEach((cell) => seen.add(cell));
      lines.push({ at, cells: fresh });
    });
    if (!lines.length) return "";
    return lines
      .map(({ cells }, index) => {
        if (index === 0 && cells.length === 1) {
          return `<strong class="sheet-step-name">${escapeHtml(said(cells[0]))}</strong>`;
        }
        if (cells.length > 1) {
          return `<div class="sheet-step-chips">${cells
            .map((cell) => `<span>${cellMarkup(cellLines(cell.text))}</span>`)
            .join("")}</div>`;
        }
        const only = said(cells[0]);
        // '분 류'처럼 짧은 줄은 원문에서 그 아래를 묶는 작은 이름표입니다.
        if ([...only].length <= 10) {
          return `<strong class="sheet-step-sub">${escapeHtml(only)}</strong>`;
        }
        return `<div class="sheet-step-line">${cellMarkup(cellLines(cells[0].text))}</div>`;
      })
      .join("");
  }

  // 단계 상자의 폭은 원문이 정해 둔 열 너비를 그대로 씁니다.
  // 똑같이 나누면 글 한 줄뿐인 상자가 내용이 가득한 상자만큼 넓어져,
  // 종이에서 좁던 칸이 화면에서만 텅 빈 채로 벌어집니다.
  //   원문 제2편 '1. 발급 절차'  12% : 72% : 8%
  // 너무 좁아 낱말이 토막 나지 않도록 가장 좁은 폭만 정해 둡니다.
  function sheetFlowRoom(chain) {
    const widths = Array.isArray(chain.widths) ? chain.widths : null;
    if (!widths) return "";
    const sum = (from, to) => {
      let total = 0;
      for (let at = from; at <= to; at += 1) total += Number(widths[at] || 0);
      return total;
    };
    const tracks = [];
    chain.steps.forEach((step, index) => {
      if (index > 0) tracks.push("auto");
      const share = sum(step[0], step[1]);
      if (!share) return;
      tracks.push(`minmax(8rem, ${share.toFixed(2)}fr)`);
    });
    // 단계 수와 칸 수가 맞지 않으면(너비를 못 읽은 표) 그냥 고르게 둡니다.
    if (tracks.filter((one) => one !== "auto").length !== chain.steps.length) return "";
    return tracks.join(" ");
  }

  function sheetChainMarkup(chain) {
    const boxes = chain.steps
      .map((step) => sheetStepMarkup(chain.grid, step))
      .filter(Boolean)
      .map((inside) => `<div class="sheet-step">${inside}</div>`);
    if (boxes.length < 2) return "";
    const room = boxes.length === chain.steps.length ? sheetFlowRoom(chain) : "";
    return `<div class="sheet-flow"${
      room ? ` style="--flow-columns: ${room}"` : ""
    }>${boxes.join(
      `<span class="sheet-flow-mark" aria-hidden="true">${escapeHtml(chain.mark)}</span>`
    )}</div>`;
  }

  // 주체마다 할 일을 적어 둔 표입니다. 왼쪽 칸이 주체 이름이고
  // 오른쪽 칸이 그 주체가 하는 일입니다(공통·접수기관·처리기관·교부기관).
  function sheetActors(table) {
    const grid = sheetGrid(table);
    if (grid.columns < 2) return null;
    const last = grid.columns - 1;
    // 가운데 열에 글이 있으면 주체별 목록이 아니라 진짜 표입니다.
    //   주체별  [공통] [   ] [발 급 절 차 …]        ← 가운데가 빈 자리
    //   진짜 표 [학생] [성적증명서] [2003년 이후…]   ← 가운데도 내용
    // 이것을 가리지 않으면 가운데 열이 통째로 사라집니다.
    for (let at = 0; at < grid.rows.length; at += 1) {
      for (let column = 1; column < last; column += 1) {
        const cell = grid.cover[at][column];
        if (cell && said(cell) && !arrowOnly(said(cell))) return null;
      }
    }
    for (const row of grid.rows) {
      for (const cell of row) {
        const text = said(cell);
        if (!text) continue;
        // 첫 칸이 이름표 노릇을 하려면 짧아야 합니다. 여러 줄짜리 긴 글이면
        // 그것은 이름이 아니라 내용입니다(제10편 '학교운영위원회 구성 절차',
        // 제15편 '징수결정 (수요조사, 계획수립 등)'). 표 그대로 그립니다.
        if ((cell.column ?? 0) === 0 && (cell.colSpan || 1) === 1) {
          if (!arrowOnly(text) && [...text].length > 8) return null;
        }
        // 줄 하나가 표 폭을 통째로 덮으면 구역을 가르는 띠입니다
        // (제15편 '징수행위'·'수납행위'). 주체별 목록이 아닙니다.
        if ((cell.colSpan || 1) >= grid.columns && grid.columns > 1) return null;
      }
    }
    const actors = [];
    grid.rows.forEach((row, at) => {
      const name = row.find((cell) => (cell.column ?? 0) === 0 && said(cell));
      if (name && [...said(name)].length <= 8) actors.push({ name: said(name), lines: [] });
      const body = grid.cover[at][last];
      if (!body || !said(body) || !actors.length) return;
      const seat = actors[actors.length - 1];
      if (seat.lines.includes(body)) return;
      if (actors.some((one) => one.lines.includes(body))) return;
      seat.lines.push(body);
    });
    if (actors.length < 2 || actors.some((one) => !one.lines.length)) return null;
    return actors;
  }

  function sheetActorsMarkup(actors) {
    // 첫 줄이 '월별 | 주요 일정'처럼 이름표 두 개뿐이면 머리줄입니다.
    // 카드로 세우면 내용 없는 빈 카드가 맨 위에 하나 서 버립니다.
    const head =
      actors.length > 2 &&
      actors[0].lines.length === 1 &&
      [...said(actors[0].lines[0])].length <= 10
        ? actors.shift()
        : null;
    return `${
      head
        ? `<div class="sheet-actors-head">
             <span class="sheet-actor-name">${escapeHtml(head.name)}</span>
             <strong>${escapeHtml(said(head.lines[0]))}</strong>
           </div>`
        : ""
    }<ol class="sheet-actors">${actors
      .map(
        (actor) => `
          <li>
            <span class="sheet-actor-name">${escapeHtml(actor.name)}</span>
            <div class="sheet-actor-body">${actor.lines
              .map((cell) => {
                const only = said(cell);
                if ([...only].length <= 10) {
                  return `<strong class="sheet-actor-sub">${escapeHtml(only)}</strong>`;
                }
                return cellMarkup(cellLines(cell.text));
              })
              .join("")}</div>
          </li>
        `
      )
      .join("")}</ol>`;
  }

  // 빈 열·빈 행과 화살표만 든 열·행을 걷어낸 눈으로 표를 봅니다.
  //
  // 매뉴얼은 절차를 잇는 화살표를 표의 칸 하나로 그려 둡니다. 그 칸 때문에
  // 네 갈래짜리 표가 일곱 열이 되고, '줄마다 한 항목'을 알아보지 못했습니다.
  //
  //   제5편 원문 구분 | 주체 | 시기 | 주요내용     (칸 사이에 ↓)
  //   표     구분 |   | 주체 |   | 시기 |   | 주요내용
  //
  // 걷어낸 화살표는 버리지 않고 기억해 두었다가, 카드와 카드 사이에 다시
  // 세웁니다(gap). 원문에서 아래로 흐르던 절차가 화면에서도 흐릅니다.
  function sheetView(table) {
    const grid = sheetGrid(table);
    // 글머리 기호 한 글자만 든 칸은 빈 칸입니다. 매뉴얼은 단계와 단계를
    // 잇는 자리에 이 한 글자를 찍어 둡니다. 글머리표라면 뒤에 글이 따라오므로
    // 한 글자만 든 칸은 글머리표가 아닙니다(제5편 단계 사이의 '▪').
    const linkOnly = (text) => [...text].length === 1 && MARKED.test(text);
    const solid = (cell) => {
      const text = said(cell);
      return Boolean(text) && !arrowOnly(text) && !linkOnly(text);
    };
    // 그 줄에서 **새로 시작하는** 칸만 봅니다. 위 칸이 아래로 걸쳐 있는 것은
    // 그 줄을 살리지 않습니다. 이것을 안 가리면, 화살표만 든 줄 옆에 걸쳐
    // 있는 묶음 칸 때문에 그 줄이 살아남아 화살표가 안 걷힙니다
    // (제6편 '계획수립'이 다섯 줄을 덮고, 그 옆줄에 ⇩만 있습니다).
    const liveRow = [];
    for (let at = 0; at < grid.rows.length; at += 1) {
      let alive = false;
      for (let column = 0; column < grid.columns; column += 1) {
        const cell = grid.cover[at][column];
        if (!solid(cell)) continue;
        if (at > 0 && grid.cover[at - 1][column] === cell) continue;
        alive = true;
      }
      liveRow.push(alive);
    }
    // 열도 같습니다. 옆 칸이 가로로 걸쳐 온 것은 그 열을 살리지 않습니다.
    // 이것을 안 가리면, 두 칸을 덮은 이름 칸 때문에 그 옆의 빈 열이
    // 살아남습니다(제9편 'Ⅰ. 운영계획 수립'이 두 열을 덮습니다).
    const liveColumn = [];
    for (let column = 0; column < grid.columns; column += 1) {
      let alive = false;
      for (let at = 0; at < grid.rows.length; at += 1) {
        const cell = grid.cover[at][column];
        if (!liveRow[at] || !solid(cell)) continue;
        if (column > 0 && grid.cover[at][column - 1] === cell) continue;
        alive = true;
      }
      liveColumn.push(alive);
    }
    const keptRows = [];
    for (let at = 0; at < grid.rows.length; at += 1) if (liveRow[at]) keptRows.push(at);
    const keptColumns = [];
    for (let column = 0; column < grid.columns; column += 1) {
      if (liveColumn[column]) keptColumns.push(column);
    }
    if (!keptRows.length || !keptColumns.length) return null;
    // 걷어낸 줄에 화살표가 있었으면 그 자리를 기억합니다.
    const gap = new Map();
    for (let seat = 0; seat + 1 < keptRows.length; seat += 1) {
      let mark = "";
      for (let at = keptRows[seat] + 1; at < keptRows[seat + 1]; at += 1) {
        for (const cell of grid.cover[at]) {
          const text = said(cell);
          if (text && arrowOnly(text) && !mark) mark = text;
        }
      }
      if (mark) gap.set(seat, mark);
    }
    const cover = keptRows.map((at) => keptColumns.map((column) => grid.cover[at][column]));
    const at = (row, column) =>
      row >= 0 && row < cover.length && column >= 0 && column < keptColumns.length
        ? cover[row][column]
        : null;
    // 이 자리에서 처음 나타나는 칸인지입니다(병합된 칸은 한 번만 셉니다).
    const fresh = (row, column) => {
      const cell = at(row, column);
      if (!cell) return false;
      return cell !== at(row - 1, column) && cell !== at(row, column - 1);
    };
    // 이 칸이 아래로 몇 줄을 덮는지입니다(걷어낸 뒤의 줄 수).
    const deep = (row, column) => {
      const cell = at(row, column);
      let count = 0;
      while (at(row + count, column) === cell) count += 1;
      return count;
    };
    // 이 칸이 옆으로 몇 열을 덮는지입니다.
    const wide = (row, column) => {
      const cell = at(row, column);
      let count = 0;
      while (at(row, column + count) === cell) count += 1;
      return count;
    };
    return { rows: cover.length, columns: keptColumns.length, at, fresh, deep, wide, gap };
  }

  // 줄마다 한 항목인 표입니다. 왼쪽 열이 항목 이름이고 오른쪽이 그 내용입니다.
  //
  //   제3편  구 분 | 사 유 | 기 간 | 보 수          (직권 휴직 ▸ 질병휴직 …)
  //   제5편  구분 | 주체 | 시기 | 주요내용           (아래로 흐르는 감사 절차)
  //   제7편  일자 | 작업 단계 | 나이스 업무 처리
  //   제9편  Ⅰ. 운영계획 수립[사업부서] | 내용        (머리줄 없음)
  //   제13편 분야 | 점검 주기 | 점검 자격 | 안전관리자 선임(대상 | 자격 및 선임기한)
  //   제14편 구분 | 흐름도 | 주요 내용 | 주의 사항
  //   제18·19편 추진기관 | 분야 | 주요내용
  //
  // 격자로 두면 한 칸에 열 줄씩 든 글이 좁은 칸에 갇혀 옆으로 밀립니다.
  // 항목마다 카드 한 장을 세우고, 열 이름은 작은 딱지로 내용 위에 답니다.
  // 열 이름이 없으면 '◦자격: 전기산업기사 이상'이 어느 열의 값인지 알 수
  // 없게 되므로, 머리줄이 있는 표에서는 반드시 남깁니다.
  //
  // 머리줄이 없는 표도 있습니다(제9·10편). 그때는 딱지 없이 이름과 내용만
  // 세웁니다.
  // 이름표에 들어갈 수 있는 글자 수입니다. 원문에는 시기까지 적어 둔 긴
  // 이름표가 있습니다(제10편 '선거공고 및 홍보, 입후보 등록
  // (선관위 구성 후 ~ 3월 14일 이전)'). 길이만으로 자르면 그런 편이
  // 통째로 표로 남습니다. 아래 '이름표는 내용의 절반보다 짧아야 한다'는
  // 견줌이 진짜 가늠자이고, 이 값은 그 위의 상한입니다.
  const NAME_ROOM = 40; // 이름표에 들어갈 수 있는 글자 수
  const LABEL_ROOM = 14; // 열 이름으로 볼 수 있는 글자 수
  const BRANCH_ROOM = 20; // 묶음 아래 이름표에 들어갈 수 있는 글자 수

  function sheetRecords(table) {
    const view = sheetView(table);
    if (!view || view.columns < 2 || view.rows < 3) return null;

    // 머리줄이 몇 줄인지 봅니다. 첫 줄의 칸이 다 짧은 이름이어야 머리줄입니다.
    // 아니면 머리줄이 없는 표입니다(heads = 0).
    const shortRow = (row) => {
      let some = false;
      for (let column = 0; column < view.columns; column += 1) {
        if (!view.fresh(row, column)) continue;
        const text = said(view.at(row, column));
        if (!text || [...text].length > LABEL_ROOM || MARKED.test(text)) return false;
        some = true;
      }
      return some;
    };
    // 머리줄 밑으로 이어져 내려가는 칸은 머리줄 칸이 아니라 본문 칸입니다
    // (제7편 '1~3일'은 머리 둘째 줄에서 시작해 여덟 줄을 덮습니다).
    const runsPast = (row, column, floor) => view.deep(row, column) > floor - row;
    // 머리 둘째 줄인지 봅니다. 두 가지 꼴이 있습니다.
    //   ① 첫 열 칸이 아래로 걸쳐 있고 그 옆이 짧은 이름
    //      (제13편 '분야' 아래 '안전관리자 선임 ▸ 대상 | 자격 및 선임기한')
    //   ② 첫 줄에 가로로 걸친 칸이 있고 둘째 줄이 그 아래를 짧은 이름으로 나눔
    //      (제7편 '매월 급여 업무 흐름' 아래 '작업 단계 | 나이스 업무 처리')
    const subHead = (row) => {
      if (view.at(row, 0) === view.at(0, 0)) return shortRow(row);
      // 첫 열이 옆으로 걸쳐 있으면 그것은 머리줄이 두 줄인 표가 아니라
      // 머리줄 한 줄짜리 표입니다. 둘째 줄은 이미 첫 항목입니다
      // (제2편 '기준연도'의 '구 분'은 두 열을 덮고, 그 아래 '학생 |
      // 성적증명서 | 2003년 이후 졸업생부터'는 머리줄이 아니라 내용입니다).
      if (view.wide(0, 0) > 1) return false;
      let spanned = false;
      for (let column = 1; column < view.columns; column += 1) {
        if (view.at(0, column) === view.at(0, column - 1)) spanned = true;
      }
      if (!spanned) return false;
      let some = false;
      for (let column = 0; column < view.columns; column += 1) {
        if (!view.fresh(row, column)) continue;
        // 아래로 이어지는 칸은 본문입니다. 머리줄 판단에서 뺍니다.
        if (runsPast(row, column, row + 1)) continue;
        const text = said(view.at(row, column));
        if (!text || [...text].length > LABEL_ROOM || MARKED.test(text)) return false;
        some = true;
      }
      return some;
    };
    let heads = shortRow(0) ? 1 : 0;
    // 머리줄이 두 줄일 수 있습니다.
    while (heads > 0 && heads < view.rows - 2) {
      if (!subHead(heads)) break;
      heads += 1;
    }
    if (view.rows - heads < 2) return null;

    const label = (column) => {
      const parts = [];
      for (let row = 0; row < heads; row += 1) {
        // 머리 영역 밖으로 이어지는 칸은 본문입니다(제7편 '1~3일').
        // 열 이름에 섞으면 '일자 · 1~3일'이 됩니다.
        if (view.deep(row, column) > heads - row) continue;
        const text = said(view.at(row, column));
        if (text && !parts.includes(text)) parts.push(text);
      }
      return parts.join(" · ");
    };
    // 카드에 다는 딱지는 마지막 마디만 씁니다. 갈래 전체를 한 이름으로 묶은
    // 윗머리를 딱지마다 되풀이하면 '매월 급여 업무 흐름 · 작업 단계'가 카드
    // 열한 장에 다 섭니다. 윗머리는 표 머리줄에 한 번만 세웁니다.
    const leaf = (column) => {
      const parts = label(column).split(" · ");
      return parts[parts.length - 1] || "";
    };

    // 이름 열은 짧아야 합니다. 여러 줄에 걸치는 것은 괜찮습니다
    // (제13편 '전기'가 두 줄, 제3편 '직권 휴직'이 여섯 줄).
    // single이면 줄마다 새로 바뀌는 이름이어야 합니다. 빈 칸은 건너뜁니다 —
    // 묶음 없이 홑으로 선 줄이 있습니다(제7편 '10일'·'14일'은 작업 단계
    // 칸이 없고 일자가 곧 이름입니다). 그런 줄은 첫 열이 이름을 맡습니다.
    const namely = (column, single) => {
      let some = false;
      for (let row = heads; row < view.rows; row += 1) {
        const cell = view.at(row, column);
        if (!cell || !said(cell)) {
          if (single) continue;
          return false;
        }
        // 옆으로 걸친 칸은 이름이 아니라 그 줄의 내용입니다. 그 줄의 첫 열에
        // 제 이름이 새로 서 있으면 첫 열이 이름을 맡습니다
        // (제7편 '10일'의 '◦ 원천세 신고 및 납부 …').
        // 첫 열이 위에서 이어져 내려온 것이라면 그 줄은 홑 항목이 아니라
        // 바로 위 항목에 딸린 부속입니다. 그때는 묶음이 아닙니다
        // (제4편 휴가마다 붙은 '경로 개인근무상황관리 → 신청 → …').
        if (view.wide(row, column) > 1) {
          // 묶음 아래 이름 열이라면 그 줄만 첫 열이 이름을 맡으면 됩니다.
          if (single) continue;
          // 이름 열 자신이 옆으로 걸치는 표는 이름과 내용이 아니라
          // 머리줄을 가진 여느 표입니다(제2편 '기준연도').
          return false;
        }
        const text = said(cell);
        // 묶음 아래 이름 열은 더 짧아야 합니다. 이 자리가 헐거우면 '내용'이
        // 이름 행세를 하고, 진짜 이름인 첫 열이 묶음 띠로 밀려납니다
        // (제4편 '(여성공무원) 임신 중 휴식과 병원 진료'는 이름이 아닙니다).
        if ([...text].length > (single ? BRANCH_ROOM : NAME_ROOM)) return false;
        if (MARKED.test(text)) return false;
        some = true;
      }
      return some;
    };

    // 첫 열이 여러 줄에 걸쳐 있고 둘째 열이 줄마다 바뀌는 짧은 이름이면,
    // 첫 열은 묶음 띠이고 둘째 열이 항목 이름입니다(제18·19편 추진기관 ▸ 분야,
    // 제3편 직권 휴직 ▸ 질병휴직).

    // 첫 열이 둘째 열보다 더 많은 줄을 덮어야 묶음입니다. 둘이 같은 깊이면
    // 첫 열이 곧 이름입니다(제13편 '전기'가 두 줄, 그 옆도 두 줄).
    // 본문에서 한 칸이 잇달아 덮는 줄 수입니다. 머리줄 자리에서 시작해
    // 본문까지 내려오는 칸도 세어야 합니다(제7편 '1~3일'은 머리 둘째 줄에서
    // 시작해 본문 일곱 줄을 덮습니다).
    const deepest = (column) => {
      let most = 0;
      let run = 0;
      let seen = null;
      for (let row = heads; row < view.rows; row += 1) {
        const cell = view.at(row, column);
        if (cell !== seen) {
          seen = cell;
          run = 0;
        }
        run += 1;
        if (said(cell)) most = Math.max(most, run);
      }
      return most;
    };
    const grouped =
      deepest(0) > 1 &&
      view.columns > 2 &&
      deepest(0) > deepest(1) &&
      namely(1, true);
    const nameColumn = grouped ? 1 : 0;
    if (!grouped && !namely(0, false)) return null;

    const groups = [];
    let group = null;
    let record = null;
    const used = new Set();
    for (let row = heads; row < view.rows; row += 1) {
      // 이름 칸이 비었거나 옆으로 걸친 줄은 첫 열이 이름을 맡습니다
      // (제7편 '10일'은 작업 단계 칸이 없고 일자가 곧 이름입니다).
      const own = view.at(row, nameColumn);
      const mine =
        own && said(own) && (nameColumn === 0 || view.wide(row, nameColumn) === 1) ? own : null;
      const nameCell = mine || view.at(row, 0);
      if (!nameCell || !said(nameCell)) return null;
      // 첫 열이 곧 그 줄의 이름이면 묶음이 아닙니다. 띠를 세우면 같은 말이
      // 띠와 카드에 두 번 섭니다.
      const bandCell = grouped && mine ? view.at(row, 0) : null;
      if (!group || group.cell !== bandCell) {
        group = { cell: bandCell, name: bandCell ? said(bandCell) : "", records: [] };
        groups.push(group);
      }
      if (!record || record.cell !== nameCell) {
        record = { cell: nameCell, name: said(nameCell), fields: new Map(), gap: "" };
        group.records.push(record);
      }
      // 이 줄 뒤에 화살표가 있었으면 카드 사이에 세웁니다.
      if (view.gap.has(row)) record.gap = view.gap.get(row);
      for (let column = nameColumn + 1; column < view.columns; column += 1) {
        const cell = view.at(row, column);
        if (!cell || !said(cell) || used.has(cell)) continue;
        used.add(cell);
        if (!record.fields.has(column)) record.fields.set(column, []);
        record.fields.get(column).push(cell);
      }
    }
    const all = groups.flatMap((one) => one.records);
    if (all.length < 2) return null;
    if (all.some((one) => !one.name || !one.fields.size)) return null;
    // 이름표 열은 내용 열의 절반보다 짧아야 이름표입니다. 두 열이 다 긴
    // 글이면 그것은 이름과 내용이 아니라 견주어 보는 표입니다. 표 그대로
    // 그립니다. 낱개 항목이 아니라 열끼리 견줍니다 — 한 항목만 내용이
    // 짧아도(제10편 '구성계획 수립 및 선거홍보') 그 표는 여전히
    // 이름과 내용입니다.
    const longest = (cells) =>
      cells.reduce((most, cell) => Math.max(most, [...said(cell)].length), 0);
    const nameRoom = longest(all.map((one) => one.cell));
    const bodyRoom = longest(all.flatMap((one) => [...one.fields.values()].flat()));
    if (nameRoom * 2 > bodyRoom) return null;

    const columns = [];
    for (let column = nameColumn + 1; column < view.columns; column += 1) {
      if (all.some((one) => one.fields.has(column))) columns.push(column);
    }
    if (!columns.length) return null;
    // 이름 열의 머리글입니다('분야'·'구분'). 카드에는 이름만 서므로
    // 이 한 마디가 없으면 그 이름이 무엇의 이름인지 알 수 없습니다.
    const naming = heads
      ? [grouped ? label(0) : "", label(nameColumn)].filter(Boolean).join(" · ")
      : "";
    return {
      groups,
      columns,
      label,
      leaf,
      grouped,
      naming,
      heads,
      single: columns.length === 1,
    };
  }

  // 한 열 안에서 이름과 내용이 번갈아 내려오는 지면입니다.
  //
  //   제9편 '한 장으로 보는 학교급식 업무 흐름' (두 단)
  //     왼쪽 단            오른쪽 단
  //     Ⅰ. 운영계획 수립     Ⅳ. 급식비 징수 / 반환
  //     1. 연간 …           1. 징수대상 …
  //     Ⅱ. 학교운영위원회 심의  Ⅴ. 급식비 집행
  //     …                  …
  //
  // 원문이 종이 한 장에 담으려고 세로 흐름을 두 단으로 접어 둔 것입니다.
  // 왼쪽·오른쪽이 서로 견주는 두 갈래가 아니라 한 줄기입니다. 격자로 두면
  // 이름과 내용이 같은 칸 폭에 갇혀 회색 덩어리가 됩니다.
  // 단마다 위에서 아래로 상자를 세우고, 단은 나란히 놓습니다.
  function sheetStacks(table) {
    const view = sheetView(table);
    if (!view || view.columns < 2 || view.rows < 4) return null;
    const stacks = [];
    for (let column = 0; column < view.columns; column += 1) {
      const cells = [];
      for (let row = 0; row < view.rows; row += 1) {
        if (view.fresh(row, column) && said(view.at(row, column))) {
          cells.push(view.at(row, column));
        }
      }
      if (!cells.length) return null;
      stacks.push(cells);
    }
    // 단마다 [짧은 이름] 다음 [긴 내용]이 번갈아 와야 합니다. 이름 뒤에
    // 내용이 없는 자리도 있습니다(제9편 'Ⅵ. 납품 및 검수'는 칸이 빕니다).
    const boxes = [];
    for (const cells of stacks) {
      const seats = [];
      let seat = null;
      for (const cell of cells) {
        const text = said(cell);
        const short = [...text].length <= NAME_ROOM && !MARKED.test(text);
        if (short) {
          seat = { name: text, lines: [] };
          seats.push(seat);
          continue;
        }
        if (!seat) return null; // 이름 없이 내용부터 나오면 이 꼴이 아닙니다
        seat.lines.push(cell);
      }
      if (seats.length < 2) return null;
      boxes.push(seats);
    }
    if (boxes.reduce((total, seats) => total + seats.length, 0) < 4) return null;
    // **단마다** 내용이 있어야 단입니다. 한 열이 짧은 이름만 늘어선 것은
    // 단이 아니라 표의 머리 열입니다(제2편 '기준연도'의 구분 | 학생 | 교직원).
    // 이 조건이 없으면 멀쩡한 표가 단으로 뜯깁니다.
    if (!boxes.every((seats) => seats.some((one) => one.lines.length))) return null;
    return boxes;
  }

  // 갈래가 나란히 아래로 흐르는 절차도입니다.
  //
  //   제17편 '계약흐름도' (28행 17열)
  //     [예정가격조사] ≫ [품 의] ≪ [시방서·과업설명서]
  //                        ↓
  //                   [계약방법결정]
  //     ┌───────┬───────┬──────┬───────┬────────┐
  //     1인견적   2인견적   입찰    조달구매   다수공급자
  //     견적서제출 견적제출  입찰공고  상품검색   구매 추진계획
  //       ↓        ↓       ↓      ↓        ↓
  //
  // 이 지면은 자리 배치가 곧 그림입니다. 항목 카드로 뜯으면 다섯 갈래가
  // 한 줄로 섞여 어느 것이 어느 갈래인지 알 수 없게 됩니다. 자리는 원문
  // 그대로 두고, 원문이 상자로 그린 칸에 상자를, 화살표 자리에 화살표를
  // 되살립니다. 원문 표는 테두리를 다 지워 두어서 화면에서는 글자만
  // 허공에 떠 있었습니다.
  const LANE_ROOM = 40; // 절차 상자 한 칸에 들어가는 글자 수

  function sheetLanes(table) {
    const grid = sheetGrid(table);
    if (grid.columns < 8) return null;
    const widths = Array.isArray(table.widths) ? table.widths : null;
    if (!widths || widths.length !== grid.columns) return null;
    const boxes = [];
    const marks = [];
    const notes = [];
    const seen = new Set();
    for (let at = 0; at < grid.rows.length; at += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const cell = grid.cover[at][column];
        if (!cell || seen.has(cell)) continue;
        if (grid.cover[at - 1] && grid.cover[at - 1][column] === cell) continue;
        if (column > 0 && grid.cover[at][column - 1] === cell) continue;
        seen.add(cell);
        const text = said(cell);
        if (!text) continue;
        const seat = {
          text,
          cell,
          row: at,
          column,
          rows: cell.rowSpan || 1,
          columns: cell.colSpan || 1,
        };
        const link = arrowOnly(text) || ([...text].length === 1 && MARKED.test(text));
        if (link) marks.push(seat);
        else if ([...text].length <= LANE_ROOM) boxes.push(seat);
        // 그림 아래에 붙여 둔 각주입니다(제17편 '※수의시담: 업체가 견적서를 …').
        // 상자가 아니므로 그림 밖에 둡니다.
        else if (MARKED.test(text)) notes.push(seat);
        else return null; // 긴 글이 섞여 있으면 절차도가 아니라 표입니다
      }
    }
    if (marks.length < 3 || boxes.length < 6) return null;
    // 한글파일은 절차를 잇는 화살표를 도형으로 그려 두어 글자로 읽히지
    // 않습니다. 그 자리에 남은 것은 이음표 한 글자('▪')뿐입니다.
    // 위아래에 상자가 있으면 원문에서 아래로 흐르는 화살표입니다.
    const boxAt = new Set(boxes.map((one) => `${one.row}:${one.column}`));
    const above = (one) => {
      for (let at = one.row - 1; at >= 0; at -= 1) {
        if (boxAt.has(`${at}:${one.column}`)) return true;
      }
      return false;
    };
    const below = (one) => {
      for (let at = one.row + 1; at < grid.rows.length; at += 1) {
        if (boxAt.has(`${at}:${one.column}`)) return true;
      }
      return false;
    };
    for (const one of marks) {
      if (!arrowOnly(one.text) && above(one) && below(one)) one.text = "↓";
    }
    return { rows: grid.rows.length, columns: grid.columns, widths, boxes, marks, notes };
  }

  function sheetLanesMarkup(lanes) {
    const seat = (one, kind) =>
      `<div class="${kind}" style="grid-area: ${one.row + 1} / ${one.column + 1} / span ${
        one.rows
      } / span ${one.columns}">${
        kind === "sheet-lane-mark"
          ? escapeHtml(one.text)
          : cellMarkup(cellLines(one.cell.text), one.cell.tables)
      }</div>`;
    const tracks = lanes.widths.map((share) => `minmax(0, ${Number(share) || 1}fr)`).join(" ");
    return (
      `<div class="sheet-lanes" style="--lane-columns: ${tracks}">${lanes.boxes
        .map((one) => seat(one, "sheet-lane-box"))
        .join("")}${lanes.marks
        .map((one) => seat(one, "sheet-lane-mark"))
        .join("")}</div>` +
      lanes.notes
        .map(
          (one) =>
            `<p class="sheet-note">${cellMarkup(cellLines(one.cell.text), one.cell.tables)}</p>`
        )
        .join("")
    );
  }

  function sheetStacksMarkup(stacks) {
    return `<div class="sheet-stacks" style="--stack-columns: ${stacks.length}">${stacks
      .map(
        (seats) => `
          <div class="sheet-stack">${seats
            .map(
              (seat) => `
                <div class="sheet-step">
                  <strong class="sheet-step-name">${escapeHtml(seat.name)}</strong>
                  ${seat.lines
                    .map(
                      (cell) =>
                        `<div class="sheet-step-line">${cellMarkup(
                          cellLines(cell.text),
                          cell.tables
                        )}</div>`
                    )
                    .join("")}
                </div>
              `
            )
            .join("")}</div>
        `
      )
      .join("")}</div>`;
  }

  function sheetRecordsMarkup(records) {
    const fieldMarkup = (record, column) => {
      const cells = record.fields.get(column) || [];
      if (!cells.length) return "";
      const inside = cells
        .map((cell) => cellMarkup(cellLines(cell.text), cell.tables))
        .join("");
      if (!inside) return "";
      // 갈래가 하나뿐이면 딱지를 달지 않습니다. 카드마다 '주요내용'이
      // 되풀이될 뿐 가려 주는 것이 없습니다(제18·19편).
      const tag =
        records.heads && !records.single
          ? `<span class="sheet-field-label">${escapeHtml(records.leaf(column))}</span>`
          : "";
      // 한두 마디짜리 값은 딱지와 한 줄에 놓고, 그런 갈래끼리 나란히
      // 세웁니다. 줄마다 딱지 한 개씩 쌓으면 원문에서 가로 네 칸이던 것이
      // 화면에서만 세로로 길어집니다(제5편 주체 '교육청' · 시기 '1~2월 중').
      const brief = cells.every(
        (cell) => [...said(cell)].length <= 24 && !said(cell).includes("\n")
      );
      return `<div class="sheet-field${
        brief ? " sheet-field-brief" : ""
      }">${tag}<div class="sheet-field-body">${inside}</div></div>`;
    };
    const cardMarkup = (record) =>
      `<li class="sheet-record">
        <span class="sheet-record-name">${escapeHtml(record.name)}</span>
        <div class="sheet-record-body">${records.columns
          .map((column) => fieldMarkup(record, column))
          .join("")}</div>
      </li>` +
      (record.gap
        ? `<li class="sheet-record-mark" aria-hidden="true">${escapeHtml(record.gap)}</li>`
        : "");
    // 표 머리줄을 한 번만 세웁니다. 갈래가 하나뿐이면 카드에 딱지를 달지
    // 않으므로(위 fieldMarkup) 그 이름을 여기서 밝힙니다.
    const headMarkup = records.heads
      ? `<div class="sheet-records-head">
           <span class="sheet-record-name">${escapeHtml(records.naming)}</span>
           <div>${records.columns
             .map(
               (column) =>
                 `<span class="sheet-field-label">${escapeHtml(records.label(column))}</span>`
             )
             .join("")}</div>
         </div>`
      : "";
    return (
      headMarkup +
      records.groups
        .map(
          (group) => `
          <section class="sheet-group">
            ${
              records.grouped && group.name
                ? `<h4 class="sheet-group-head">${escapeHtml(group.name)}</h4>`
                : ""
            }
            <ol class="sheet-records">${group.records.map(cardMarkup).join("")}</ol>
          </section>
        `
        )
        .join("")
    );
  }

  // 표가 삼킨 줄의 마지막 한 글자가 다음 줄 맨 앞으로 밀려나는 자리가 있습니다.
  //
  // 빌더는 펴진 글줄과 한글파일 칸을 견줄 때 괄호를 빼고 봅니다
  // (scripts/build_chapters_from_hwpx.mjs의 DECORATION). 법령 이름에 걸린
  // 링크를 글자로 되돌리다 닫는 괄호 하나가 사라지는 자리가 있어서입니다.
  // 그 덕에 표는 제 줄을 찾지만, 빼고 본 괄호는 어느 줄에도 안 실립니다.
  //
  //   원문   … 근무상황(특별휴가 → 장기재직휴가)   [표 여기까지]
  //          자주 쓰는 휴가                        ← 지면 이름
  //   화면   ')자주 쓰는 휴가'
  //
  // 닫는 괄호로 시작하는 줄은 원문에 없습니다. 표 바로 다음 줄일 때만 텁니다.
  // 18편을 통틀어 이 한 곳입니다(제4편).
  const SHED = /^\s*[)\]）］}」』]+\s*/;

  // 지면 한 구역입니다. 머리 띠 하나와 그 아래 내용으로 이루어집니다.
  function sheetPartMarkup(lines, tables) {
    const owners = new Map();
    tables.forEach((table, index) => {
      const start = table.lineStart ?? 0;
      for (let step = 0; step < (table.lineCount ?? 0); step += 1) owners.set(start + step, index);
    });
    let head = null;
    const pieces = [];
    const drawn = new Set();
    // 띠가 없는 지면은 표 밖에 남은 짧은 이름 한 줄이 곧 지면 이름입니다.
    // 원문은 그 이름을 지면 맨 위 띠에 얹습니다(한눈에 쏙쏙 ▮ 자주 쓰는 휴가).
    // 맨 아래 각주 자리에 두면 표 뒤에 이름이 따라붙는 꼴이 됩니다.
    // 이름 같은 줄이 둘 이상이면 그것은 소제목이므로 건드리지 않습니다
    // (제2편 '1. 발급 절차'·'2. 나이스 미조회 시 …').
    const names = [];
    lines.forEach((line, index) => {
      if (owners.has(index)) return;
      const only = line.replace(SHED, "").trim();
      if (only && /^[\p{L}\p{N}]/u.test(only) && [...only].length <= 20) names.push(index);
    });
    const banded = tables.some((table) => sheetBand(table));
    const titleAt = !banded && names.length === 1 ? names[0] : -1;
    lines.forEach((line, index) => {
      const owner = owners.has(index) ? owners.get(index) : -1;
      if (owner < 0) {
        const only = (owners.has(index - 1) ? line.replace(SHED, "") : line).trim();
        if (!only) return;
        if (index === titleAt) {
          head = { tag: "", name: only };
          return;
        }
        // 표 밖에 남은 줄이 다 소제목은 아닙니다. 각주와 덧붙임도 여기로
        // 옵니다(제11편 '▪ 금액 또는 면적 중 하나만 …', 제4편 '※ 참고 …').
        // 번호로 시작하거나 짧은 이름만 소제목으로 세우고, 기호로 시작하는
        // 줄은 본문 그대로 둡니다. 다 굵게 세우면 각주가 제목 행세를 합니다.
        const heading =
          /^\d+\s*\./.test(only) || (/^[\p{L}\p{N}]/u.test(only) && [...only].length <= 20);
        pieces.push(
          heading
            ? `<h4 class="sheet-step-title">${escapeHtml(only)}</h4>`
            : `<p class="sheet-note">${cellMarkup([only])}</p>`
        );
        return;
      }
      if (drawn.has(owner)) return;
      drawn.add(owner);
      const table = tables[owner];
      if (!head && sheetBand(table)) {
        const cells = (table.headers || []).map(said);
        head = { tag: cells[0] || "", name: cells[1] || "" };
        return;
      }
      const chain = sheetChain(table);
      if (chain) {
        const drawnChain = sheetChainMarkup(chain);
        if (drawnChain) {
          pieces.push(drawnChain);
          return;
        }
      }
      const actors = sheetActors(table);
      if (actors) {
        pieces.push(sheetActorsMarkup(actors));
        return;
      }
      // 줄마다 한 항목인 표는 카드로 세웁니다.
      //
      // 예전에는 이 갈래를 바깥 표에만 걸어 두었습니다. 그래서 지면을 감싼
      // 테두리 '안쪽' 표는 여기까지 와서 격자로 떨어졌고, 열한 편이 표 그대로
      // 남았습니다(제3·4·5·6·7·9·10·11·15·16·17편). 안쪽 표에도 겁니다.
      const records = sheetRecords(table);
      if (records) {
        pieces.push(sheetRecordsMarkup(records));
        return;
      }
      const stacks = sheetStacks(table);
      if (stacks) {
        pieces.push(sheetStacksMarkup(stacks));
        return;
      }
      const lanes = sheetLanes(table);
      if (lanes) {
        pieces.push(sheetLanesMarkup(lanes));
        return;
      }
      pieces.push(
        spannedTableMarkup(
          "",
          headerCellsOf(table),
          table.rows || [],
          table.widths,
          0,
          table.picture
        )
      );
    });
    if (!pieces.length) return "";
    return `
      <section class="sheet-part">
        ${head ? sheetHeadMarkup(head.tag, head.name) : ""}
        <div class="sheet-part-body">${pieces.join("")}</div>
      </section>
    `;
  }

  // 바깥 표가 지면을 감싼 '테두리'인지 봅니다. 한 열짜리이고, 칸마다
  // 안쪽 표를 품고 있어야 테두리입니다.
  //
  // 제14편처럼 바깥 표 자체가 내용인 편도 있습니다(구분|흐름도|주요 내용|
  // 주의 사항). 그것을 테두리로 잘못 보면 바깥 표가 통째로 사라지고
  // 안쪽 표 몇 개만 남습니다. 실제로 그랬고, 아래 검사기가 잡았습니다.
  function sheetFrame(table) {
    const rows = [table.headers || [], ...(table.rows || [])];
    let columns = 0;
    for (const row of rows) {
      for (const cell of row) {
        columns = Math.max(columns, (cell.column ?? 0) + (cell.colSpan || 1));
      }
    }
    if (columns !== 1) return false;
    return rows.every((row) =>
      row.every((cell) => (cell.tables || []).length || !said(cell))
    );
  }

  const sheetHeadMarkup = (tag, name) =>
    name
      ? `<h3 class="sheet-part-head">
           ${tag ? `<span class="sheet-tag">${escapeHtml(tag)}</span>` : ""}
           <span>${escapeHtml(name)}</span>
         </h3>`
      : "";

  function renderFrontSheet(block) {
    const outer = (block.tables || [])[0];
    if (!outer || (block.tables || []).length !== 1) return null;
    // 바깥 표가 테두리가 아니라 곧 지면인 편입니다(제13·14·18·19편).
    // 줄마다 한 항목인 표라면 격자 대신 항목 카드로 세웁니다.
    if (!sheetFrame(outer)) {
      const records = sheetRecords(outer);
      if (!records) return null;
      // 지면 이름 띠는 세우지 않습니다. 이 편들은 블록 이름이 곧 지면
      // 이름이라(제18편 '신설학교 설립 및 개교 준비 개요') 카드 머리에
      // 이미 서 있습니다. 여기서 또 세우면 같은 말이 두 번 섭니다.
      return {
        summary: "한눈에 보기",
        html: `<div class="front-sheet">
                 <section class="sheet-part">
                   <div class="sheet-part-body">${sheetRecordsMarkup(records)}</div>
                 </section>
               </div>`,
        type: "table",
      };
    }
    const parts = [];
    for (const row of [outer.headers || [], ...(outer.rows || [])]) {
      for (const cell of row) {
        if (!(cell.tables || []).length) continue;
        const drawnPart = sheetPartMarkup(cellLines(cell.text), cell.tables);
        if (drawnPart) parts.push(drawnPart);
      }
    }
    if (!parts.length) return null;
    return {
      summary: "한눈에 보기",
      html: `<div class="front-sheet">${parts.join("")}</div>`,
      type: "table",
    };
  }

  // ── 제2편 '한눈에 보기' 전용 그림 ────────────────────────────────
  //
  // 이 지면은 편마다 짜임새가 다릅니다. 하나의 틀로 다 그리려다 죄다
  // 뭉개졌습니다. 그래서 편마다 원문 지면을 따로 봅니다. 제2편은 세 조각입니다.
  //
  //   ① [흐름도] 제증명 민원 발급 절차
  //      1. 발급 절차 — [교육기관 방문 후 신분증 제시] ⇒ [발급 절차(+분류)] ⇒ [민원서류 수령]
  //      2. 나이스 미조회 시 … — 공통·접수기관·처리기관·교부기관 주체별 절차
  //   ② [기준연도] 나이스 민원발급 제증명 종류 및 발급 가능 기준연도 — 표
  //
  // 글자는 하나도 새로 쓰지 않고 원문 칸에서 그대로 가져옵니다. 색은 원문의
  // 주황을 따라하지 않고 누리집 파랑 하나로 칠합니다.
  function renderChapter2Front(block) {
    const outer = (block.tables || [])[0];
    if (!outer) return null;
    const cellA = (outer.headers || [])[0];
    const cellB = ((outer.rows || [])[0] || [])[0];
    if (!cellA || !cellB || (cellA.tables || []).length < 3 || (cellB.tables || []).length < 2) {
      return null;
    }
    const say = (cell) => String((cell && cell.text) || "").trim();

    const band = (table) => {
      const head = (table.headers || []).map(say);
      return `<h3 class="ch2-band">
        <span class="ch2-band-tag">${escapeHtml(head[0] || "")}</span>
        <span class="ch2-band-name">${escapeHtml(head[1] || "")}</span>
      </h3>`;
    };

    const linesOf = cellLines(cellA.text);

    // ① 흐름도 — 세 안쪽 표(띠·흐름·주체별)
    const flowBand = cellA.tables[0];
    const flowTable = cellA.tables[1];
    const actorTable = cellA.tables[2];
    const sub1 = (linesOf[1] || "").trim(); // "1. 발급 절차"
    const sub2 = (linesOf[6] || "").trim(); // "2. 나이스 미조회 시 …"

    // 가로 3단 흐름을 원문 칸 자리대로 폅니다.
    const fg = sheetGrid(flowTable);
    const at = (r, c) => (fg.cover[r] ? fg.cover[r][c] : null);
    const last = fg.columns - 1;
    const boxStart = say(at(0, 0));
    const boxEnd = say(at(0, last));
    const arrow = say(at(0, 1)) || "⇒";
    const mainHead = say(at(0, 2)); // 발급 절차
    const stepCell = at(1, 2);
    const catTag = say(at(2, 2)); // 분 류
    const catCells = [];
    const seen = new Set();
    for (let c = 2; c <= last; c += 1) {
      const cell = at(3, c);
      if (!cell || !say(cell)) continue;
      // 끝 상자(민원서류 수령)와 화살표는 위에서 아래로 걸쳐 있어 이 줄에도
      // 나타납니다. 이 줄에서 새로 시작하는 칸(분류 세 갈래)만 셉니다.
      if (at(2, c) === cell) continue;
      if (seen.has(cell)) continue;
      seen.add(cell);
      catCells.push(cell);
    }
    const stepMarkup = cellLines(stepCell ? stepCell.text : "")
      .map((line) => `<li>${cellMarkup([line])}</li>`)
      .join("");
    const catMarkup = catCells
      .map((cell) => {
        const lines = cellLines(cell.text);
        const name = lines[0] || "";
        const note = lines.slice(1).join(" ");
        return `<div class="ch2-cat-col">
          <strong>${escapeHtml(name)}</strong>
          ${note ? `<span>${escapeHtml(note)}</span>` : ""}
        </div>`;
      })
      .join("");
    const flowMarkup = `
      <div class="ch2-flow">
        <div class="ch2-flow-box">${escapeHtml(boxStart)}</div>
        <span class="ch2-flow-arrow" aria-hidden="true">${escapeHtml(arrow)}</span>
        <div class="ch2-flow-main">
          <div class="ch2-flow-main-head">${escapeHtml(mainHead)}</div>
          <ul class="ch2-flow-steps">${stepMarkup}</ul>
          <div class="ch2-cat">
            <span class="ch2-cat-tag">${escapeHtml(catTag)}</span>
            <div class="ch2-cat-cols">${catMarkup}</div>
          </div>
        </div>
        <span class="ch2-flow-arrow" aria-hidden="true">${escapeHtml(arrow)}</span>
        <div class="ch2-flow-box">${escapeHtml(boxEnd)}</div>
      </div>`;

    // 주체별 절차(공통·접수기관·처리기관·교부기관). 첫 칸이 주체, 마지막 칸이 내용.
    const ag = sheetGrid(actorTable);
    const alast = ag.columns - 1;
    const actors = [];
    let current = null;
    const usedBody = new Set();
    for (let r = 0; r < ag.rows.length; r += 1) {
      const nameCell = ag.cover[r] && ag.cover[r][0];
      if (nameCell && say(nameCell) && (!current || current.cell !== nameCell)) {
        current = { cell: nameCell, name: say(nameCell), lines: [] };
        actors.push(current);
      }
      const bodyCell = ag.cover[r] && ag.cover[r][alast];
      if (bodyCell && say(bodyCell) && current && !usedBody.has(bodyCell)) {
        usedBody.add(bodyCell);
        current.lines.push(bodyCell);
      }
    }
    const actorMarkup = actors
      .map(
        (actor) => `
        <li class="ch2-actor">
          <span class="ch2-actor-name">${escapeHtml(actor.name)}</span>
          <div class="ch2-actor-body">${actor.lines
            .map((cell) => `<div class="ch2-actor-line">${cellMarkup(cellLines(cell.text))}</div>`)
            .join("")}</div>
        </li>`
      )
      .join("");

    // ② 기준연도 — 원문 표 그대로(파란 머리줄)
    const yearBand = cellB.tables[0];
    const yearTable = cellB.tables[1];
    const yearMarkup = spannedTableMarkup(
      "",
      headerCellsOf(yearTable),
      yearTable.rows || [],
      yearTable.widths,
      0,
      yearTable.picture
    );

    return {
      summary: "한눈에 보기",
      type: "table",
      html: `
        <div class="ch2-front">
          <section class="ch2-sec">
            ${band(flowBand)}
            ${sub1 ? `<h4 class="ch2-sub">${escapeHtml(sub1)}</h4>` : ""}
            ${flowMarkup}
            ${sub2 ? `<h4 class="ch2-sub">${escapeHtml(sub2)}</h4>` : ""}
            <ol class="ch2-actors">${actorMarkup}</ol>
          </section>
          <section class="ch2-sec">
            ${band(yearBand)}
            <div class="ch2-year">${yearMarkup}</div>
          </section>
        </div>`,
    };
  }

  // ── 제3편 '한눈에 보기' 전용 그림 ────────────────────────────────
  //
  // 제3편 지면은 한 장짜리 표입니다.
  //   [인사] 휴직제도 — 구분(직권휴직·청원휴직) | 사유 | 기간 | 보수
  // 원문 표 그대로 그리되 머리줄만 누리집 파랑으로 칠합니다. 글자는 하나도
  // 새로 쓰지 않고 원문 칸에서 가져옵니다. 이 함수는 제3편에만 씁니다
  // (.ch3-* 서식도 제3편 밖으로 나가지 않습니다).
  function renderChapter3Front(block) {
    const outer = (block.tables || [])[0];
    if (!outer) return null;
    const cell = (outer.headers || [])[0];
    if (!cell || (cell.tables || []).length < 2) return null;
    const bandTable = cell.tables[0];
    const table = cell.tables[1];
    const head = (bandTable.headers || []).map((c) => String((c && c.text) || "").trim());
    const tableMarkup = spannedTableMarkup(
      "",
      headerCellsOf(table),
      table.rows || [],
      table.widths,
      0,
      table.picture
    );
    return {
      summary: "한눈에 보기",
      type: "table",
      html: `
        <div class="ch3-front">
          <h3 class="ch3-band">
            <span class="ch3-band-tag">${escapeHtml(head[0] || "")}</span>
            <span class="ch3-band-name">${escapeHtml(head[1] || "")}</span>
          </h3>
          <div class="ch3-table">${tableMarkup}</div>
        </div>`,
    };
  }

  // ── 제4편 '한눈에 보기' 전용 그림 ────────────────────────────────
  //
  // 제4편 지면은 '자주 쓰는 휴가' 표입니다. 종류 | 내용 | 기간 | 증빙서류 | 비고.
  // 휴가마다 그 아래에 전폭 '경로' 줄(신청 경로)이 한 줄씩 붙습니다. 원문은
  // 이 경로 줄을 옅은 바탕에 '경로' 딱지를 달아 구분합니다. 그대로 살립니다.
  // 글자는 원문 칸에서 그대로 가져오고 색은 누리집 파랑 하나입니다.
  // 이 함수와 .ch4-* 서식은 제4편에만 씁니다.
  function renderChapter4Front(block) {
    const outer = (block.tables || [])[0];
    if (!outer) return null;
    const cell = (outer.headers || [])[0];
    if (!cell || !(cell.tables || []).length) return null;
    const table = cell.tables[0];
    const grid = sheetGrid(table);
    if (grid.rows.length < 3) return null;
    const say = (c) => String((c && c.text) || "").trim();
    const freshAt = (r, c) => {
      const one = grid.cover[r] && grid.cover[r][c];
      if (!one) return false;
      if (r > 0 && grid.cover[r - 1][c] === one) return false;
      if (c > 0 && grid.cover[r][c - 1] === one) return false;
      return true;
    };

    // 지면 이름과 각주는 표 밖 줄에서 가져옵니다. 표가 삼킨 닫는 괄호가
    // 이름 앞에 밀려 나온 자리를 텁니다(')자주 쓰는 휴가' → '자주 쓰는 휴가').
    const loose = cellLines(cell.text).map((l) => l.trim());
    const title =
      (loose.find((l) => /자주\s*쓰는\s*휴가/.test(l)) || "자주 쓰는 휴가")
        .replace(/^\s*[)\]）］}」』]+\s*/, "")
        .trim();
    const foot = loose.find((l) => /^※/.test(l)) || "";

    const headHtml = (grid.rows[0] || [])
      .map((c) => `<th scope="col">${escapeHtml(say(c))}</th>`)
      .join("");

    const bodyRows = [];
    let r = 1;
    while (r < grid.rows.length) {
      const typeCell = grid.cover[r][0];
      if (!typeCell) {
        r += 1;
        continue;
      }
      const span = typeCell.rowSpan || 1;
      // 이 종류의 본문 줄 — 이 줄에서 새로 시작하는 내용~비고 칸
      const detail = [];
      for (let c = 1; c < grid.columns; c += 1) {
        if (freshAt(r, c)) detail.push(grid.cover[r][c]);
      }
      const detailHtml = detail
        .map(
          (c) =>
            `<td colspan="${c.colSpan || 1}">${cellMarkup(cellLines(c.text))}</td>`
        )
        .join("");
      bodyRows.push(
        `<tr>
          <th scope="row" class="ch4-type" data-col="0" rowspan="${span}">${escapeHtml(
          say(typeCell)
        )}</th>
          ${detailHtml}
        </tr>`
      );
      // 딸린 줄(경로·덧붙임) — 종류 칸이 아래로 걸친 만큼
      for (let sub = r + 1; sub < r + span; sub += 1) {
        const line = grid.cover[sub][1];
        if (!line || !say(line)) continue;
        const text = say(line);
        const isPath = /^경\s*로/.test(text);
        if (isPath) {
          const rest = text.replace(/^경\s*로\s*/, "");
          bodyRows.push(
            `<tr class="ch4-path">
              <td colspan="${grid.columns - 1}">
                <span class="ch4-path-tag">경로</span>
                <span class="ch4-path-text">${escapeHtml(rest)}</span>
              </td>
            </tr>`
          );
        } else {
          bodyRows.push(
            `<tr class="ch4-note">
              <td colspan="${grid.columns - 1}">${cellMarkup(cellLines(line.text))}</td>
            </tr>`
          );
        }
      }
      r += span;
    }

    return {
      summary: "한눈에 보기",
      type: "table",
      html: `
        <div class="ch4-front">
          <h3 class="ch4-band">
            <span class="ch4-band-tag">한눈에 쏙쏙</span>
            <span class="ch4-band-name">${escapeHtml(title)}</span>
          </h3>
          <div class="source-table-scroll ch4-table">
            <table class="source-criteria-table">
              <thead><tr>${headHtml}</tr></thead>
              <tbody>${bodyRows.join("")}</tbody>
            </table>
          </div>
          ${foot ? `<p class="ch4-foot">${escapeHtml(foot)}</p>` : ""}
        </div>`,
    };
  }

  function render(block) {
    const body = String(block?.body || "");
    if (!body) return { summary: "전체 내용 보기", html: "", type: "text" };

    // 편 앞머리 '한눈에 보기'도 여느 지면과 똑같이 원문 표 그대로 그립니다.
    //
    // 예전에 이 지면만 카드로 다시 그렸습니다(항목 카드·단·갈래). 편마다
    // 다른 원문을 제가 만든 파란 카드 틀 하나로 죄다 뭉갰고, 표였던 것이
    // 딱지 붙은 카드가 되어 원문과 달라졌습니다. 카드는 다 걷어냅니다.
    // 표는 표대로, 원문 짜임새 그대로 둡니다. 색만 누리집 파랑으로 입힙니다
    // (아래 renderFrontSheet·sheetRecords 따위는 더는 부르지 않습니다).

    // 편마다 원문 지면을 따로 그립니다. 하나의 틀로 다 그리려다 뭉갰습니다.
    if (String(block.id || "") === "c02-w00-b1") {
      const ch2 = renderChapter2Front(block);
      if (ch2) return ch2;
    }
    if (String(block.id || "") === "c03-w00-b1") {
      const ch3 = renderChapter3Front(block);
      if (ch3) return ch3;
    }
    if (String(block.id || "") === "c04-w00-b1") {
      const ch4 = renderChapter4Front(block);
      if (ch4) return ch4;
    }

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
