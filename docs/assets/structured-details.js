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

  const TWO_COLUMN_SCHEMAS = [
    {
      test: (body) => body.includes("법규문서") && body.includes("일반문서"),
      caption: "공문서의 종류",
      summary: "공문서 종류 표로 보기",
      rows: ["법규문서", "지시문서", "공고문서", "비치문서", "민원문서", "일반문서"].map(
        (label) => row(label)
      ),
    },
    {
      test: (body) => body.includes("글자 어문규범") && body.includes("문서의 끝"),
      caption: "문서작성의 일반원칙",
      summary: "문서작성 기준 표로 보기",
      rows: ["글자", "숫자", "날짜", "시간", "금액", "첨부물", "문서의 끝"].map((label) =>
        row(label)
      ),
    },
    {
      test: (body) =>
        body.includes("접수대기") &&
        body.includes("비전자문서등록") &&
        body.includes("공문게시지정"),
      caption: "전자문서와 비전자문서 처리",
      summary: "문서 수신·등록 방법 표로 보기",
      rows: ["전자문서", "비전자문서"].map((label) => row(label)),
    },
    {
      test: (body) => body.includes("비밀·암호자재취급") && body.includes("내PC지키미"),
      caption: "사이버보안 진단항목",
      summary: "보안 진단항목 표로 보기",
      rows: ["일반보안", "정보보안"].map((label) => row(label)),
    },
    {
      test: (body) =>
        body.includes("제한지역") && body.includes("제한구역") && body.includes("통제구역"),
      caption: "보호지역 구분",
      summary: "보호지역 구분 표로 보기",
      rows: ["제한지역", "제한구역", "통제구역"].map((label) => row(label)),
    },
    {
      test: (body) => body.includes("관리책임 • 실별") && body.includes("시설변경"),
      caption: "시설 관리책임과 변경",
      summary: "시설 관리 기준 표로 보기",
      rows: ["관리책임", "시설변경"].map((label) => row(label)),
    },
    {
      test: (body) =>
        body.includes("아동·청소년 관련기관 취업제한") &&
        body.includes("성범죄 경력 및 아동학대 관련 범죄 전력"),
      caption: "성범죄·아동학대 관련 범죄 전력 조회",
      summary: "범죄 전력 조회 기준 표로 보기",
      rows: ["목적", "대상", "관련기관", "방법", "관련서류"].map((label) => row(label)),
    },
    {
      test: (body) =>
        body.includes("지방공무원 임용령 제2조") &&
        body.includes("신규임용") &&
        body.includes("면직, 해임, 파면"),
      caption: "지방공무원 임용",
      summary: "임용의 발생·변경·소멸 표로 보기",
      rows: ["근 거", "발 생", "변 경", "소 멸"].map((label) => row(label)),
    },
    {
      test: (body) =>
        body.includes("필수실무요원") &&
        body.includes("승진포기") &&
        body.includes("대우공무원수당 가산금"),
      caption: "필수실무요원 기준",
      summary: "필수실무요원 기준 표로 보기",
      rows: [
        row("근거"),
        row("지정 요건", ["지정", "요건"]),
        row("실적 요건", ["실적", "요건"]),
        row("인사 관리", ["인사", "관리"]),
        row("수당"),
      ],
    },
    {
      test: (body) =>
        body.includes("업무 대행 시작 10일 전") &&
        body.includes("5인을 초과할 수 없음"),
      caption: "업무대행공무원 운영 기준",
      summary: "업무대행공무원 기준 표로 보기",
      rows: [
        row("근거"),
        row("정의"),
        row("적용 범위", ["적용", "범위"]),
        row("지정 및 해제", ["지정", "및", "해제"]),
        row("수당"),
      ],
    },
    {
      test: (body) =>
        body.includes("적극행정 우수공무원") &&
        body.includes("사전") &&
        body.includes("면책"),
      caption: "적극행정 제도",
      summary: "적극행정 제도 표로 보기",
      rows: [
        row("근거"),
        row("목적"),
        row("우대"),
        row("사전 컨설팅 제도", ["사전", "컨설팅", "제도"]),
        row("면책 제도", ["면책", "제도"]),
      ],
    },
    {
      test: (body) =>
        body.includes("보존기간이 경과한 기록물") &&
        body.includes("기록물평가심의회"),
      caption: "기록물 폐기",
      summary: "기록물 폐기 기준 표로 보기",
      rows: ["개요", "대상", "집행"].map((label) => row(label)),
    },
    {
      test: (body) =>
        body.includes("등록이 누락된 비전자기록물") &&
        body.includes("카드·도면류"),
      caption: "기록물 정리와 편철",
      summary: "기록물 정리·편철 방법 표로 보기",
      rows: [
        row("기록물 정리", ["기록물", "정리"]),
        row("기록물 편철", ["기록물", "편철"]),
        row("비전자문서 편철", ["비전자문서", "편철"]),
        row("카드·도면류 편철", ["카드·도면류", "편철"]),
      ],
    },
  ];

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

  function renderTwoColumn(body, schema) {
    const parsed = parseTwoColumn(body, schema);
    if (!parsed) return null;
    const intro = parsed.prefix.length
      ? `<div class="source-structured-intro">${cellMarkup(parsed.prefix)}</div>`
      : "";
    return {
      summary: schema.summary,
      html: `${intro}${tableMarkup(schema.caption, ["구분", "내용"], parsed.rows)}`,
      type: "table",
    };
  }

  function renderRepeatedLookupTables(body) {
    if (
      !body.includes("국가에 대한 충성심") ||
      !body.includes("파산선고") ||
      !body.includes("관련기관")
    ) {
      return null;
    }

    const chunks = String(body)
      .split(/(?=구\s*분\s+내\s*용)/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    if (chunks.length < 2) return null;
    const schema = {
      rows: ["목적", "대상", "관련기관", "방법", "관련서류"].map((label) => row(label)),
    };
    const captions = ["신원조사", "결격사유 조회"];
    const tables = chunks.slice(0, 2).map((chunk, index) => {
      const parsed = parseTwoColumn(chunk, schema);
      if (!parsed) return "";
      return tableMarkup(captions[index], ["구분", "내용"], parsed.rows);
    });
    if (tables.some((table) => !table)) return null;
    return {
      summary: "신원·결격사유 조회 기준 표로 보기",
      html: `<div class="source-table-stack">${tables.join("")}</div>`,
      type: "table",
    };
  }

  function renderDismissalTable(body) {
    if (!body.includes("종류 근거 내용") || !body.includes("당연퇴직") || !body.includes("징계면직")) {
      return null;
    }
    const lines = bodyLines(body);
    const headerIndex = lines.findIndex((line) => normalizeLine(line) === "종류 근거 내용");
    const specs = ["당연퇴직", "의원면직", "직권면직", "명예퇴직", "징계면직"].map((label) =>
      row(label)
    );
    const positions = [];
    let cursor = headerIndex + 1;
    for (const spec of specs) {
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
      const contentLines = [];
      if (position.remainder) contentLines.push(position.remainder);
      contentLines.push(...lines.slice(position.index + position.consumed, nextStart));
      const joined = contentLines.join(" ");
      const bulletIndex = joined.indexOf("•");
      const reference = bulletIndex >= 0 ? joined.slice(0, bulletIndex).trim() : "—";
      const content = bulletIndex >= 0 ? joined.slice(bulletIndex).trim() : joined;
      return [position.spec.label, escapeHtml(reference || "—"), [content]];
    });

    return {
      summary: "면직 종류·근거 표로 보기",
      html: tableMarkup("면직의 종류", ["종류", "근거", "내용"], rows),
      type: "table",
    };
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
      .replace(/세부내용$/, "")
      .trim();
    if (
      !subject ||
      subject.length > 32 ||
      /^(?:TIPTIP|업무 흐름도|관련법규 및 참고자료)$/.test(subject)
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

    const repeated = renderRepeatedLookupTables(body);
    if (repeated) return repeated;

    const dismissal = renderDismissalTable(body);
    if (dismissal) return dismissal;

    const schema = TWO_COLUMN_SCHEMAS.find((candidate) => candidate.test(body));
    if (schema) {
      const table = renderTwoColumn(body, schema);
      if (table) return table;
    }

    return {
      summary: fallbackSummary(block),
      html: renderSourceOutline(body),
      type: "text",
    };
  }

  window.GUIDE_DETAIL_RENDERER = { render };
})();
