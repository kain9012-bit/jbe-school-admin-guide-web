// 서식마다 '표 그대로' 붙여 넣을 수 있는 조각을 만듭니다.
//
// 미리보기 그림(SVG)에서 글자를 긁으면 글자만 옵니다. 칸이 어디서 나뉘는지는
// 그림에 선으로만 그려져 있어, 한글이나 엑셀에 붙이면 줄글이 됩니다.
//
// 한글파일 안에는 표가 표로 들어 있습니다. kordoc이 그것을 <table>로 꺼내 주므로
// 그 조각을 서식마다 한 장씩 저장해 둡니다. 화면에서 이것을 붙여 넣기용으로 쓰면
// 한글·엑셀·워드가 칸을 그대로 알아봅니다.
//
//   docs/previews/forms/chapter12/form-1.svg   보기용 (지금까지 쓰던 것)
//   docs/previews/forms/chapter12/form-1.html  붙여 넣기용 (여기서 만드는 것)
//
// 사용법: node scripts/build_form_tables.mjs [--chapters 01,12] [--force]

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { runKordoc } from "./lib/kordoc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const work = path.join(root, "tmp", "form-tables");

function loadFormAssets() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(readFileSync(path.join(docs, "assets", "form-assets.js"), "utf8"), context);
  return context.window.FORM_ASSETS || {};
}

const escape = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 마크다운이 남긴 표시를 지웁니다. \~ 처럼 앞에 붙은 역슬래시와 **굵게**입니다.
// 원문에 있던 밑줄·줄바꿈 같은 꾸밈표는 살려 둡니다. 나머지 <>는 글자로 봅니다.
const KEEP_TAGS = /&lt;(\/?)(u|b|i|em|strong|sub|sup|br\s*\/?)&gt;/gi;
const inline = (value) =>
  escape(value.replace(/\\([\\`*_{}[\]()#+\-.!~])/g, "$1"))
    .replace(KEEP_TAGS, "<$1$2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .trim();

// 표를 '| 가 | 나 |' 모양으로 내놓을 때가 있어 그것도 표로 되돌립니다.
function pipeTable(lines, from) {
  const row = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  const rows = [];
  let cursor = from;
  for (; cursor < lines.length && /^\s*\|/.test(lines[cursor]); cursor += 1) {
    const cells = row(lines[cursor]);
    // '| --- | --- |'는 머리글과 몸통을 가르는 줄일 뿐 내용이 아닙니다.
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    rows.push(cells);
  }
  if (!rows.length) return null;
  // '| [예시1] |  |'처럼 한 줄에 글 하나뿐인 것은 표가 아니라 머리말입니다.
  if (rows.length === 1 && rows[0].filter(Boolean).length <= 1) {
    return { html: `<p>${inline(rows[0].find(Boolean) || "")}</p>`, until: cursor };
  }
  const body = rows
    .map((cells) => `<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
    .join("\n");
  return { html: `<table>\n${body}\n</table>`, until: cursor };
}

function toFragment(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const value = line.trim();
    if (!value) continue;
    // 그림은 붙여 넣을 것이 없습니다.
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(value)) continue;

    if (value.startsWith("<table>")) {
      const block = [];
      for (; index < lines.length; index += 1) {
        block.push(lines[index]);
        if (lines[index].trim().endsWith("</table>")) break;
      }
      out.push(block.join("\n"));
      continue;
    }

    if (value.startsWith("|")) {
      const table = pipeTable(lines, index);
      if (table) {
        out.push(table.html);
        index = table.until - 1;
        continue;
      }
    }

    const heading = /^#{1,6}\s*(.+)$/.exec(value);
    out.push(`<p>${inline(heading ? heading[1] : value)}</p>`);
  }
  return out.join("\n");
}

const at = process.argv.indexOf("--chapters");
const only = at > 0 ? new Set(process.argv[at + 1].split(",")) : null;
const force = process.argv.includes("--force");

const assets = loadFormAssets();
mkdirSync(work, { recursive: true });

let made = 0;
let kept = 0;
const failures = [];

for (const chapterId of Object.keys(assets).sort()) {
  if (only && !only.has(chapterId)) continue;
  for (const marker of Object.keys(assets[chapterId])) {
    const asset = assets[chapterId][marker];
    const source = path.join(docs, asset.download);
    // 붙여 넣기용 조각은 보기용 그림과 이름을 맞춰 둡니다. 화면이 찾기 쉽습니다.
    const target = path.join(docs, asset.preview.replace(/\.svg$/, ".html"));
    if (!existsSync(source)) {
      failures.push(`${chapterId} ${marker}: 원본이 없습니다.`);
      continue;
    }
    if (existsSync(target) && !force) {
      kept += 1;
      continue;
    }

    // kordoc은 그림을 결과 파일 옆의 images/ 에 풀어 놓습니다. 딴 데서 만들고 지웁니다.
    const scratch = path.join(work, `${chapterId}-${marker}.md`);
    const failed = runKordoc([source, "-o", scratch, "--silent", "--keep-empty-cols"]);
    if (failed || !existsSync(scratch)) {
      failures.push(`${chapterId} ${marker}: 읽지 못했습니다. ${failed || ""}`.trim());
      continue;
    }
    const fragment = toFragment(readFileSync(scratch, "utf8"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${fragment}\n`, "utf8");
    made += 1;
  }
}

rmSync(work, { recursive: true, force: true });

failures.forEach((line) => console.error(`  - ${line}`));
console.log(`붙여 넣기용 서식 조각 ${made}개 새로 만듦 (그대로 둔 것 ${kept}개)`);
if (failures.length) {
  console.error(`만들지 못한 것 ${failures.length}개`);
  process.exit(1);
}
