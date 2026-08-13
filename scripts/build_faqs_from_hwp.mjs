// 전북교육청 게시판에서 받은 편별 FAQ 한글파일(docs/downloads/chapterN-faq.hwp)을
// 읽어 화면이 쓰는 자료(docs/assets/chapterN-data.js의 faqs)로 만듭니다.
//
// 예전에는 제1·3편만 손으로 만든 스크립트가 있었습니다. 나머지 편은 질문이
// 하나도 없어 '관련 질문'이 통째로 비어 있었습니다.
//
// 한글파일에서 질문 한 덩어리는 두 가지 모양으로 들어 있습니다.
//   1. 줄글    : 'Q' / 'A' / 번호 / 질문 / 답변…
//   2. 표      : <tr><th>Q<br>A<br>번호</th><th>질문</th></tr> + 답변 칸
// 같은 파일 안에서도 섞여 있어 둘 다 읽습니다.
//
// 분류 이름은 바로 앞에 나온 소제목(## 1. 근무일과 근무시간)을 씁니다.
// 그 이름으로 업무를 찾아 업무마다 보여 줄 질문을 정합니다.
//
// 사용법: node scripts/build_faqs_from_hwp.mjs [--chapters 02,04] [--dry]

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runKordoc } from "./lib/kordoc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const work = path.join(root, "tmp", "faq");

const squash = (value) => String(value || "").replace(/\s+/g, "");
const clean = (value) =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();

// 한글파일을 글로 바꿉니다. kordoc은 HWP5도 읽습니다.
function toMarkdown(chapterId) {
  const source = path.join(docs, "downloads", `chapter${Number(chapterId)}-faq.hwp`);
  if (!existsSync(source)) return null;
  mkdirSync(work, { recursive: true });
  const target = path.join(work, `chapter${Number(chapterId)}.md`);
  const failed = runKordoc([source, "-o", target, "--silent"]);
  if (failed || !existsSync(target)) {
    throw new Error(`chapter${Number(chapterId)}-faq.hwp를 읽지 못했습니다: ${failed || "결과 파일 없음"}`);
  }
  return readFileSync(target, "utf8");
}

// 답변이 끝나는 곳: 다음 질문, 다음 소제목, 표의 시작입니다.
const ENDS = /^(?:Q\s*$|#{1,6}\s|<table>|\|)/;
const HEADING = /^#{1,6}\s*(.+?)\s*$/;
const TABLE_HEAD = /<tr><th>Q(?:<br>)?A?(?:<br>)?\s*(\d+)\s*<\/th><th>(.*?)<\/th><\/tr>/i;
const TABLE_BODY = /<td[^>]*>([\s\S]*?)<\/td>/i;

function parseFaqs(markdown, fallbackCategory) {
  const lines = markdown.split(/\r?\n/);

  // 앞머리 '목 차'는 제목만 늘어놓은 자리라 분류로 읽으면 안 됩니다.
  // 목차가 끝나는 곳은 첫 질문이 나오기 직전입니다.
  const firstQuestion = lines.findIndex(
    (line) => line.trim() === "Q" || TABLE_HEAD.test(line)
  );
  const bodyFrom = firstQuestion < 0 ? 0 : firstQuestion;

  // 분류 이름 후보: 소제목이거나, 홀로 선 '1. 무엇무엇' 줄입니다.
  // 매뉴얼 판마다 이 줄을 소제목으로 넣기도 하고 그냥 글로 두기도 합니다.
  const categoryAt = (index) => {
    let name = "";
    for (let cursor = Math.min(index, lines.length - 1); cursor >= 0; cursor -= 1) {
      const line = lines[cursor].trim();
      if (!line) continue;
      const heading = HEADING.exec(line);
      const plain = /^\d+\.\s*(\S.*)$/.exec(line);
      const raw = heading ? heading[1] : plain ? line : "";
      if (!raw) continue;
      // 목차 줄은 뒤에 쪽 번호가 붙어 있습니다.
      if (/\t\s*\d+\s*$/.test(raw)) continue;
      name = raw.replace(/^#{1,6}\s*/, "").replace(/^[ⅠⅡⅢⅣⅤ]+\.?\s*/, "").replace(/^\d+\.\s*/, "").trim();
      if (!name || /^목\s*차$/.test(name) || /^\d+\.?$/.test(name)) { name = ""; continue; }
      if (cursor < bodyFrom) return "";
      return name;
    }
    return name;
  };

  const items = [];
  for (let index = bodyFrom; index < lines.length; index += 1) {
    const line = lines[index].trim();

    // 1) 표로 든 질문
    const head = TABLE_HEAD.exec(lines[index]);
    if (head) {
      const body = TABLE_BODY.exec(lines[index + 1] || "");
      items.push({
        number: Number(head[1]),
        category: categoryAt(index - 1),
        question: clean(head[2]),
        answer: clean(body ? body[1] : ""),
      });
      continue;
    }

    // 2) 줄글로 든 질문
    if (line !== "Q") continue;
    let cursor = index + 1;
    const next = () => {
      while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
      return lines[cursor] === undefined ? "" : lines[cursor].trim();
    };
    if (next() !== "A") continue;
    cursor += 1;
    const numberLine = next();
    if (!/^\d+$/.test(numberLine)) continue;
    cursor += 1;
    const question = next();
    if (!question) continue;
    cursor += 1;

    const answer = [];
    for (; cursor < lines.length; cursor += 1) {
      const value = lines[cursor].trim();
      if (!value) continue;
      if (ENDS.test(value) || TABLE_HEAD.test(lines[cursor])) break;
      answer.push(value);
    }
    items.push({
      number: Number(numberLine),
      category: categoryAt(index - 1),
      question: clean(question),
      answer: clean(answer.join("\n")),
    });
    index = cursor - 1;
  }

  const counters = new Map();
  return items
    .filter((item) => item.question && item.answer)
    .map((item) => {
      const key = item.category || fallbackCategory;
      const seen = (counters.get(key) || 0) + 1;
      counters.set(key, seen);
      return {
        id: `faq-${squash(key).slice(0, 24)}-${item.number}-${seen}`,
        category: key,
        number: item.number,
        question: item.question,
        answer: item.answer,
      };
    });
}

// 질문을 어느 업무에 붙일지 정합니다.
//
// 원문 소제목을 그대로 쓰면 엉뚱한 것이 분류가 됩니다. 답변 문장이
// '3. 12부터 2021. 7. 9까지…'처럼 번호로 시작하는 일이 흔하기 때문입니다.
// 그래서 질문 글을 업무 본문과 맞대어, 가장 많이 겹치는 업무에 붙입니다.
//
// 흔한 낱말은 어느 업무에나 나오므로 값을 낮게 봅니다(적게 나올수록 귀한 낱말).
const WORDS = /[가-힣]{2,}|[A-Za-z]{3,}/g;
const STOP = new Set([
  "경우", "가능", "여부", "관련", "규정", "부서", "사항", "내용", "기준", "처리",
  "해당", "따라", "대한", "대하여", "있는", "있음", "없음", "하는", "위한", "이란",
  "또는", "그리고", "다만", "학교", "교육", "교육청", "공무원", "업무", "신청", "지급",
]);

function tokens(value) {
  return (String(value || "").match(WORDS) || []).filter((word) => !STOP.has(word));
}

function sectionCorpus(section) {
  const bag = new Map();
  const add = (value, weight) => {
    for (const word of tokens(value)) bag.set(word, (bag.get(word) || 0) + weight);
  };
  add(section.title, 8);
  for (const block of section.contentBlocks || []) {
    add(block.title, 2);
    add(block.body, 1);
  }
  return bag;
}

function assignSections(sections, faqs) {
  const corpora = sections.map(sectionCorpus);
  // 몇 개 업무에 나오는 낱말인지 세어 흔한 낱말의 값을 낮춥니다.
  const spread = new Map();
  for (const bag of corpora) {
    for (const word of bag.keys()) spread.set(word, (spread.get(word) || 0) + 1);
  }

  return faqs.map((faq) => {
    const asked = tokens(faq.question);
    const answered = tokens(String(faq.answer).slice(0, 400));
    const scores = corpora.map((bag) => {
      let score = 0;
      const count = (word, weight) => {
        const found = bag.get(word);
        if (!found) return;
        const rare = Math.log(1 + sections.length / (spread.get(word) || 1));
        score += weight * rare * Math.log(1 + found);
      };
      for (const word of asked) count(word, 3);
      for (const word of answered) count(word, 1);
      return score;
    });
    let best = 0;
    for (let index = 1; index < scores.length; index += 1) {
      if (scores[index] > scores[best]) best = index;
    }
    return { faq, section: sections[best], score: scores[best] };
  });
}

function dataPath(chapterId) {
  return path.join(docs, "assets", `chapter${Number(chapterId)}-data.js`);
}

function loadData(chapterId) {
  const file = dataPath(chapterId);
  const raw = readFileSync(file, "utf8");
  const head = `window.CHAPTER${Number(chapterId)}_DATA = `;
  return JSON.parse(raw.slice(head.length).replace(/;\s*$/, ""));
}

function saveData(chapterId, data) {
  writeFileSync(
    dataPath(chapterId),
    `window.CHAPTER${Number(chapterId)}_DATA = ${JSON.stringify(data)};\n`,
    "utf8"
  );
}

const at = process.argv.indexOf("--chapters");
const only = at > 0 ? new Set(process.argv[at + 1].split(",")) : null;
const dry = process.argv.includes("--dry");

// 제1·3편은 예전 스크립트가 만들어 둔 분류를 그대로 둡니다.
const CHAPTERS = ["02", "04", "06", "07", "09", "10", "11", "12", "14", "16"];
const report = [];

for (const chapterId of CHAPTERS) {
  if (only && !only.has(chapterId)) continue;
  const markdown = toMarkdown(chapterId);
  if (markdown === null) {
    report.push(`제${chapterId}편: FAQ 한글파일이 없습니다.`);
    continue;
  }
  const data = loadData(chapterId);
  const fallback = data.meta?.title || `제${Number(chapterId)}편`;
  const faqs = parseFaqs(markdown, fallback);
  if (!faqs.length) {
    report.push(`제${chapterId}편: 질문을 하나도 읽지 못했습니다.`);
    continue;
  }

  // 질문마다 가장 잘 맞는 업무를 찾아, 그 업무 이름을 분류로 씁니다.
  // 화면은 업무의 faqCategories로 질문을 고르므로 이름이 곧 연결 고리입니다.
  const placed = assignSections(data.sections, faqs);
  const counts = new Map();
  for (const { faq, section } of placed) {
    faq.category = section.title;
    counts.set(section.title, (counts.get(section.title) || 0) + 1);
  }

  data.faqs = faqs;
  for (const section of data.sections) {
    section.faqCategories = counts.has(section.title) ? [section.title] : [];
  }
  if (!dry) saveData(chapterId, data);

  report.push(
    `제${chapterId}편: 질문 ${faqs.length}건 → ` +
      [...counts.entries()].map(([title, n]) => `${title} ${n}`).join(", ")
  );
}

report.forEach((line) => console.log(line));
console.log(dry ? "\n미리보기만 했습니다(--dry)." : "\nfaqs 반영 완료.");
