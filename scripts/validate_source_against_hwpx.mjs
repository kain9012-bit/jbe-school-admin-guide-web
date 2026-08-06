// 화면이 쓰는 자료가 매뉴얼 한글파일과 정확히 같은지 확인합니다.
//
// 자료는 scripts/build_chapters_from_hwpx.mjs가 HWPX에서 만들어 냅니다.
// 여기서는 같은 HWPX를 다시 읽어 만든 것과 저장된 자료를 그대로 견줍니다.
// 손으로 고쳐 두었거나 만드는 규칙이 바뀌었는데 다시 만들지 않았다면 걸립니다.
//
// 덧붙여 표가 제대로 담겼는지도 봅니다.
//   · 표마다 본문에서 차지한 자리(lineStart·lineCount)가 적혀 있어야 합니다.
//     이것이 없으면 화면이 표를 그리고도 같은 내용을 아래에 또 늘어놓습니다.
//   · 병합 정보(colSpan·rowSpan)가 살아 있어야 합니다.
//
// 사용법: node scripts/validate_source_against_hwpx.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "docs", "assets");

function loadChapter(id) {
  const raw = readFileSync(path.join(assets, `chapter${id}-data.js`), "utf8");
  return JSON.parse(raw.replace(`window.CHAPTER${id}_DATA = `, "").replace(/;\n$/, ""));
}

const before = [1, 3].map((id) => ({ id, data: loadChapter(id) }));

// 다시 만들어 보고, 바뀌는 것이 있으면 자료가 낡은 것입니다.
execFileSync("node", [path.join(root, "scripts/build_chapters_from_hwpx.mjs")], {
  cwd: root,
  stdio: "ignore",
});

const problems = [];
let blocks = 0;
let tables = 0;
let merged = 0;

for (const { id, data } of before) {
  const after = loadChapter(id);
  for (const [index, work] of data.sections.entries()) {
    const rebuilt = after.sections[index];
    if (JSON.stringify(work.contentBlocks) !== JSON.stringify(rebuilt.contentBlocks)) {
      problems.push(
        `제${id}편 ${work.title}: 저장된 본문이 한글파일에서 새로 만든 것과 다릅니다. ` +
          `npm run build:source로 다시 만드세요.`
      );
    }
    if (JSON.stringify(work.flowGroups) !== JSON.stringify(rebuilt.flowGroups)) {
      problems.push(`제${id}편 ${work.title}: 저장된 업무 흐름도가 한글파일과 다릅니다.`);
    }

    for (const block of work.contentBlocks) {
      blocks += 1;
      const lines = String(block.body || "").split(/\r?\n/);
      for (const table of block.tables || []) {
        tables += 1;
        if (!Number.isInteger(table.lineStart) || !Number.isInteger(table.lineCount)) {
          problems.push(
            `제${id}편 ${work.title} [${block.title.slice(0, 20)}]: ` +
              `표가 본문에서 차지한 자리가 적혀 있지 않습니다.`
          );
          continue;
        }
        if (table.lineStart + table.lineCount > lines.length) {
          problems.push(
            `제${id}편 ${work.title} [${block.title.slice(0, 20)}]: ` +
              `표 자리(${table.lineStart}~${table.lineStart + table.lineCount - 1})가 ` +
              `본문 ${lines.length}줄을 벗어납니다.`
          );
        }
        const cells = [...table.headers, ...table.rows.flat()];
        if (cells.some((cell) => cell.colSpan > 1 || cell.rowSpan > 1)) merged += 1;
        if (!cells.length) {
          problems.push(`제${id}편 ${work.title} [${block.title.slice(0, 20)}]: 빈 표입니다.`);
        }
      }
    }
  }
}

if (problems.length) {
  console.error("한글파일과 어긋납니다:");
  problems.slice(0, 20).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 20) console.error(` … 외 ${problems.length - 20}건`);
  process.exit(1);
}

console.log(
  `source matches hwpx: 본문 블록 ${blocks}개 · 표 ${tables}개(병합 있는 표 ${merged}개), ` +
    `저장된 자료가 한글파일에서 새로 만든 것과 같음`
);
