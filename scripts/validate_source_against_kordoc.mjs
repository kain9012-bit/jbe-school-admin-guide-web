// 우리가 뽑아 놓은 매뉴얼 원문을 다른 도구로 한 번 더 읽어 대조합니다.
//
// 원문을 읽는 코드는 우리 스스로 검사할 수 없습니다. 잘못 읽어도 그 잘못된
// 결과를 기준으로 검사하기 때문입니다. 실제로 두 번이나 눈으로 발견됐습니다.
//   · '→'가 글자보다 1.6pt 위에 그려져 있어 화살표만 줄 앞에 몰림
//   · 굵은 글씨를 두 번 겹쳐 찍어 'TIP'이 'TTIIPP'로 읽힘
//
// 그래서 kordoc(https://github.com/chrisryugj/kordoc)으로 같은 쪽을 다시 읽어
// 우리 결과와 견줍니다. 서로 만든 사람이 다르니 같은 실수를 함께 하지 않습니다.
//
// 두 가지를 봅니다.
//   1. 글자가 같은가  — 빠뜨렸거나 없는 글자를 지어내지 않았는가
//   2. 차례가 같은가  — 우리 줄의 글자가 kordoc 결과에서도 같은 차례로 나오는가
//
// 표 안에서 칸을 나누는 방식은 도구마다 다릅니다. kordoc은 글자 정렬로
// 칸을 짐작해서 이 매뉴얼의 '목  적'처럼 이름표 안에 공백이 있는 칸을
// 둘로 쪼갭니다. 그래서 차례는 '띄엄띄엄이라도 순서가 맞는가'로만 봅니다.
// 화살표가 앞에 몰리는 것 같은 진짜 어긋남은 이 기준으로도 걸립니다.
//
// 사용법: node scripts/validate_source_against_kordoc.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadGuideData } = require(path.join(root, "scripts/lib/load_guide_data.js"));

let parsePdf;
try {
  // KORDOC_PATH를 주면 그곳에서 찾습니다. 설치 위치가 다른 곳에서도 돌리기 위함입니다.
  const where = process.env.KORDOC_PATH || "kordoc";
  ({ parsePdf } = await import(where));
} catch {
  console.error("kordoc이 설치되어 있지 않습니다. npm install --save-dev kordoc pdfjs-dist");
  process.exit(1);
}

const SOURCES = {
  CHAPTER1_DATA: "source/chapter-01/original/제1편행정업무및보안.pdf",
  CHAPTER3_DATA: "source/chapter-03/original/제3편인사관리.pdf",
};

// 쪽마다 붙는 장식은 본문이 아니므로 견주지 않습니다.
const ORNAMENTS = [
  "제1편 행정업무 및 보안",
  "제3편 인사관리",
  "학교 행정업무 길라잡이",
  "행정업무 및 보안",
  "인사관리",
];

const squash = (value) => String(value ?? "").replace(/\s/g, "");

function stripOrnaments(text, printedPage) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== String(printedPage));
  let result = squash(lines.join(""));
  for (const word of ORNAMENTS) {
    result = result.split(squash(word)).join("");
  }
  return result;
}

// kordoc 결과를 쪽별 글자로 모읍니다. 표는 칸을 이어 붙입니다.
function kordocPages(blocks) {
  const pages = new Map();
  const push = (page, text) => {
    if (!page || !text) return;
    pages.set(page, (pages.get(page) || "") + text);
  };
  for (const block of blocks) {
    if (block.type === "table" && block.table) {
      for (const row of block.table.cells || []) {
        for (const cell of row) push(block.pageNumber, squash(cell?.text));
      }
    } else {
      push(block.pageNumber, squash(block.text));
    }
  }
  return pages;
}

function counts(text) {
  const map = new Map();
  for (const character of text) map.set(character, (map.get(character) || 0) + 1);
  return map;
}

// 우리 줄의 글자가 상대 글에서도 같은 차례로 나오는지 봅니다.
// 사이에 다른 글자가 끼어드는 것은 괜찮고, 앞뒤가 뒤집히면 걸립니다.
function isOrderedWithin(line, haystack, from) {
  let cursor = from;
  for (const character of line) {
    const found = haystack.indexOf(character, cursor);
    if (found < 0) return -1;
    cursor = found + 1;
  }
  return cursor;
}

const window = loadGuideData();
const problems = [];
let checkedPages = 0;
let checkedLines = 0;

for (const [key, relative] of Object.entries(SOURCES)) {
  const file = readFileSync(path.join(root, relative));
  const wanted = window[key].sections
    .flatMap((work) => work.sourcePages.map((page) => page.pdfPage))
    .sort((a, b) => a - b);
  const parsed = await parsePdf(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    { pages: wanted }
  );
  if (!parsed.success) {
    problems.push(`${relative}: kordoc이 읽지 못했습니다.`);
    continue;
  }
  const theirs = kordocPages(parsed.blocks);

  for (const work of window[key].sections) {
    for (const page of work.sourcePages) {
      const mine = stripOrnaments(page.text, page.printedPage);
      const other = stripOrnaments(theirs.get(page.pdfPage) || "", page.printedPage);
      const where = `${work.title} ${page.printedPage}쪽`;
      if (!other) {
        problems.push(`${where}: kordoc 결과가 비어 있습니다.`);
        continue;
      }
      checkedPages += 1;

      // 1. 우리에게만 있는 글자는 지어냈거나 겹쳐 읽은 것입니다.
      const ours = counts(mine);
      const others = counts(other);
      const invented = [];
      for (const [character, count] of ours) {
        const extra = count - (others.get(character) || 0);
        if (extra > 0) invented.push(`${character}×${extra}`);
      }
      if (invented.length) {
        problems.push(
          `${where}: kordoc에는 없는 글자가 있습니다 → ${invented.slice(0, 12).join(" ")}`
        );
      }

      // 2. 줄 안의 차례가 뒤집히지 않았는지 봅니다.
      //
      // 표에 실린 줄은 빼고 봅니다. 지면에서 좌우로 나란한 칸은 높이가 같아
      // 줄로 읽으면 서로 다른 칸의 글이 한 줄에 붙습니다.
      //   13쪽 '• 관계회계공무원 직인 : 행정실장' + '오도록 날인'
      // 화면은 칸 정보로 그리므로 이것은 잘못이 아니고, 도구마다 칸을 나누는
      // 방식이 달라 견줄 수도 없습니다. 표 밖의 글만 차례를 따집니다.
      const inTable = new Set();
      for (const block of work.contentBlocks) {
        if (block.pdfPage !== page.pdfPage || !block.tables) continue;
        for (const table of block.tables) {
          for (const line of table.sourceLines || []) inTable.add(line.trim());
        }
      }

      let cursor = 0;
      for (const raw of String(page.text).split(/\r?\n/)) {
        if (inTable.has(raw.trim())) continue;
        const line = stripOrnaments(raw, page.printedPage);
        if (line.length < 8) continue;
        checkedLines += 1;
        const next = isOrderedWithin(line, other, cursor);
        if (next < 0) {
          const restart = isOrderedWithin(line, other, 0);
          if (restart < 0) {
            problems.push(`${where}: 글자 차례가 kordoc과 다릅니다 → '${raw.trim().slice(0, 40)}'`);
            continue;
          }
          cursor = restart;
          continue;
        }
        cursor = next;
      }
    }
  }
}

if (problems.length) {
  console.error("kordoc으로 다시 읽은 결과와 어긋납니다:");
  problems.slice(0, 25).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 25) console.error(` … 외 ${problems.length - 25}건`);
  process.exit(1);
}

console.log(
  `source matches kordoc: 원문 ${checkedPages}쪽 · ${checkedLines}줄을 ` +
    `다른 도구로 다시 읽어 대조, 지어낸 글자와 뒤바뀐 차례 없음`
);
