// 화면에 깨진 글자가 남아 있지 않은지 확인합니다.
//
// 한글은 글머리표나 화살표를 함초롬 글꼴의 개인용 영역(PUA)에 넣어 둡니다.
// 유니코드에 없는 자리라 그대로 실으면 보는 사람 화면에서 네모(▤)로 뜹니다.
// 매뉴얼 19편 어디에든 한 글자만 남아도 그 자리가 깨져 보이므로 전부 봅니다.
//
//   U+F02FB → ‣    제7편 보수작업의 글머리표
//   U+F003B → ⇩    제4편 외부강의 절차도의 아래 화살표
//   그 밖은 ▪로 바꿉니다(scripts/read_hwpx_tables.py, build_chapters_from_hwpx.mjs).
//
// 사용법: node scripts/validate_no_broken_glyphs.js

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "docs", "assets");

// 개인용 영역(BMP와 15·16면)과 '읽지 못한 글자' 표시입니다.
const BROKEN = /[-�]|[\u{F0000}-\u{FFFFD}]|[\u{100000}-\u{10FFFD}]/u;
const BROKEN_ALL = new RegExp(BROKEN.source, "gu");

const problems = [];
let looked = 0;

function look(where, value) {
  const said = String(value ?? "");
  if (!said) return;
  looked += 1;
  const found = said.match(BROKEN_ALL);
  if (!found) return;
  const at = said.search(BROKEN_ALL);
  const marks = [...new Set(found)]
    .map((mark) => `U+${mark.codePointAt(0).toString(16).toUpperCase()}`)
    .join(", ");
  problems.push(
    `${where}: 깨진 글자 ${marks} — …${said.slice(Math.max(0, at - 12), at + 12).replace(/\n/g, " ")}…`
  );
}

for (let id = 1; id <= 19; id += 1) {
  const file = path.join(assets, `chapter${id}-data.js`);
  if (!fs.existsSync(file)) continue;
  const box = {};
  new Function("window", fs.readFileSync(file, "utf8"))(box);
  const data = box[`CHAPTER${id}_DATA`];
  const label = `제${String(id).padStart(2, "0")}편`;

  for (const section of data.sections || []) {
    look(`${label} ${section.title}`, section.title);
    for (const block of section.contentBlocks || []) {
      const where = `${label} ${section.title} [${block.title}]`;
      look(where, block.title);
      look(where, block.body);
      for (const table of block.tables || []) {
        for (const cell of [table.headers, ...table.rows].flat()) look(`${where} 표`, cell.text);
      }
    }
    for (const flow of section.flowGroups || []) look(`${label} ${section.title} 흐름도`, flow.sourceText);
  }
  for (const form of data.forms || []) look(`${label} ${form.id}`, form.title);
  for (const faq of data.faqs || []) {
    look(`${label} 질문 ${faq.number}`, faq.question);
    look(`${label} 답변 ${faq.number}`, faq.answer);
  }
}

if (problems.length) {
  problems.slice(0, 30).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n깨진 글자가 남은 자리 ${problems.length}곳`);
  process.exit(1);
}
console.log(`글 ${looked}군데에 깨진 글자가 없습니다.`);
