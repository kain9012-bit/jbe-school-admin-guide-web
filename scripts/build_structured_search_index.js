const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");

function loadWindowScript(file, context) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function description(text, limit = 260) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}…` : normalized;
}

// 긴 본문 블록은 줄 단위로 잘라 여러 조각으로 색인합니다.
//
// 제7편 '3. 급여 및 수당의 이해'는 한 블록이 2만 3천 자짜리 표입니다. 통째로
// 색인하면 그 안의 '정근수당' 설명은 긴 글 속 한마디로 취급되어 점수가 바닥이고,
// 의미 검색(임베딩)도 2만 자를 한 점으로 뭉개 버립니다. 표는 한 줄이 한 항목
// (봉급·근속가봉·정근수당 …)이므로 줄 경계에서 자르면 항목마다 한 조각이 됩니다.
// 조각은 같은 blockId를 가리키고, 조각 첫머리(anchor)로 화면의 그 줄을 찾아
// 바로 내려갑니다(app-faithful-workflow.js scrollToTarget).
const PIECE_LIMIT = 900; // 이보다 긴 블록만 자릅니다
const PIECE_TARGET = 600; // 조각 하나의 대략 크기

// '상 여 수 당'처럼 표 머리칸에서 한 글자씩 띄어 쓴 말을 붙입니다.
function joinSpacedLetters(text) {
  return String(text || "").replace(/(?:^|(?<=\s))((?:[가-힣]\s){2,}[가-힣])(?=\s|$)/g, (m) =>
    m.replace(/\s+/g, "")
  );
}

function splitBody(body) {
  const lines = String(body || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pieces = [];
  let current = [];
  let size = 0;
  for (const line of lines) {
    if (size && size + line.length > PIECE_TARGET) {
      pieces.push(current.join("\n"));
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length;
  }
  if (current.length) pieces.push(current.join("\n"));
  // 표 머리줄('구 분 / 지 급 요 령')만 남은 자투리는 다음 조각에 붙입니다.
  const merged = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.length < 150) merged[merged.length - 1] = `${last}\n${piece}`;
    else merged.push(piece);
  }
  if (merged.length > 1 && merged[merged.length - 1].length < 150) {
    const tail = merged.pop();
    merged[merged.length - 1] += `\n${tail}`;
  }
  return merged;
}

// 조각의 이름: 블록 제목 + 그 조각의 첫머리(표라면 그 줄의 항목명).
function pieceLabel(piece) {
  // 표의 머리줄('구 분 지 급 요 령')처럼 짧은 줄은 건너뛰고 내용이 시작하는 줄로.
  const lines = piece.split("\n");
  const first =
    lines.find((line) => joinSpacedLetters(line).replace(/\s+/g, "").length >= 12) || lines[0];
  const head = joinSpacedLetters(first)
    .replace(/\s+/g, " ")
    .trim();
  // 첫 번호 매김('1.')이나 괄호 설명 뒤까지 너무 길면 잘라 둡니다.
  const cut = head.search(/\s\d+\.\s/);
  const short = (cut > 8 ? head.slice(0, cut) : head).slice(0, 48).trim();
  return short;
}

const context = vm.createContext({ window: {} });
loadWindowScript(path.join(docs, "assets", "guide-config.js"), context);

const results = [];
for (const chapter of context.window.GUIDE_CONFIG.chapters.filter((item) => item.available)) {
  loadWindowScript(path.join(docs, chapter.dataScript), context);
  const data = context.window[chapter.dataGlobal];

  for (const work of data.sections) {
    // 편 앞머리의 '한눈에 보기'(업무 0번)는 그 편을 간추린 지면입니다.
    // 검색에서는 본문보다 한 걸음 뒤에 세웁니다(docs/assets/search-query.js).
    const summary = work.number === 0 ? { weight: 0.6 } : null;
    // 업무 항목에 본문 전체를 다시 담으면 색인이 두 배로 불어나고,
    // 긴 글이 무조건 위로 올라와 순위가 뒤틀립니다. 업무를 알아보는 데
    // 필요한 만큼(업무 이름 + 소제목)만 담습니다.
    const subtitles = work.contentBlocks
      .map((block) => String(block.title || "").replace(/^세부내용\s+/, "").trim())
      .filter((title) => title && title !== "관련법규 및 참고자료" && title !== "TIP");
    results.push({
      id: work.id,
      chapterId: chapter.id,
      chapterLabel: chapter.label,
      chapterTitle: chapter.title,
      type: "업무",
      workTitle: work.title,
      title: work.title,
      // 검색 결과 카드에 그 업무가 무엇을 다루는지 한 줄로 보여 줍니다.
      // 예전에는 쪽수를 적었는데, 쪽 표시를 없앤 뒤로 'undefined쪽'만 남아 있었습니다.
      description: description(subtitles.join(" · "), 160),
      // 홈의 업무 목록에는 위 설명이 너무 깁니다. 카드가 여섯 줄로 늘어납니다.
      // 목록에서는 몇 단계짜리 업무인지만 보여 줍니다.
      steps: work.contentBlocks.filter((block) => /^세부내용\s/.test(String(block.title || "")))
        .length,
      text: [work.title, ...subtitles].join("\n"),
      workId: work.id,
      ...(summary || {}),
    });

    for (const block of work.contentBlocks) {
      // 제목이 없는 칸도 있습니다. 검색 결과에 '본문'이라고만 뜨면
      // 무엇인지 알 수 없으므로 본문 첫머리를 제목 대신 씁니다.
      const visibleTitle = /^매뉴얼 \d+쪽$/.test(block.title)
        ? `${work.title} · ${block.printedPage}쪽`
        : block.title || description(block.body, 40);
      const body = String(block.body || "");
      const pieces = body.length > PIECE_LIMIT ? splitBody(body) : [body];
      pieces.forEach((piece, at) => {
        const split = pieces.length > 1;
        const label = split ? pieceLabel(piece) : "";
        results.push({
          id: split ? `${block.id}~${at + 1}` : block.id,
          chapterId: chapter.id,
          chapterLabel: chapter.label,
          chapterTitle: chapter.title,
          type: "매뉴얼 원문",
          workTitle: work.title,
          title: split && label ? `${visibleTitle} › ${label}` : visibleTitle,
          description: description(piece || block.title),
          text: [work.title, block.title, piece].join("\n"),
          workId: work.id,
          blockId: block.id,
          // 화면에서 그 줄을 찾는 표지입니다(띄어쓰기를 걷은 첫머리 24자).
          ...(split
            ? {
                anchor: (
                  piece
                    .split("\n")
                    .find((line) => line.replace(/\s+/g, "").length >= 12) || piece
                )
                  .replace(/\s+/g, "")
                  .slice(0, 24),
              }
            : {}),
          ...(summary || {}),
        });
      });
    }

    for (const formId of work.formIds) {
      const form = data.forms.find((item) => item.id === formId);
      if (!form) continue;
      results.push({
        id: `${work.id}:form:${form.id}`,
        chapterId: chapter.id,
        chapterLabel: chapter.label,
        chapterTitle: chapter.title,
        type: "서식·예시 원문",
      workTitle: work.title,
        title: `${form.id} ${form.title}`,
        description: description(form.content),
        text: [work.title, form.id, form.title, form.content].join("\n"),
        workId: work.id,
        formId: form.id,
      });
    }

    for (const faq of data.faqs.filter((item) => work.faqCategories.includes(item.category))) {
      results.push({
        id: `${work.id}:faq:${faq.number}`,
        chapterId: chapter.id,
        chapterLabel: chapter.label,
        chapterTitle: chapter.title,
        type: "FAQ 원문",
      workTitle: work.title,
        title: `Q${faq.number}. ${faq.question}`,
        description: description(faq.answer),
        text: [work.title, faq.category, faq.question, faq.answer].join("\n"),
        workId: work.id,
        faqNumber: String(faq.number),
      });
    }
  }
}

// 같은 id가 둘이면(같은 질문이 한 업무에 두 번 묶인 경우) 뒤에 번호를 붙여 가릅니다.
// 의미 검색 서버(api/search.mjs)가 이 id로 결과를 돌려주므로 반드시 하나여야 합니다.
const seen = new Map();
for (const item of results) {
  const count = seen.get(item.id) || 0;
  seen.set(item.id, count + 1);
  if (count) item.id = `${item.id}#${count + 1}`;
}

const output = `window.GUIDE_SEARCH_INDEX = ${JSON.stringify(results, null, 2)};\n`;
fs.writeFileSync(path.join(docs, "assets", "guide-search-index.js"), output, "utf8");
console.log(`검색 색인 ${results.length}건 생성`);
