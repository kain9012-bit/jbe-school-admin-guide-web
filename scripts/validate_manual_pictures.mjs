// 매뉴얼 본문에 실린 사진이 화면에도 실렸는지 확인합니다.
//
// 매뉴얼은 말로 설명하기 어려운 것을 사진으로 보여 줍니다.
//
//   제1편 기록물 관리 TIP '문서 편철 및 보관 방법'
//   사진 넉 장(진행문서파일 / 발생·논리순 정리 / 철표지·집게고정 / 보존상자 보관)
//
// 예전에는 그림 자리를 그냥 지워, 사진 밑에 달린 이름만 남았습니다.
// 무엇을 설명하는 말인지 알 수 없는 글자 줄이 됩니다.
//
// 원문은 사진을 안쪽 표에 넣고, 사진 바로 아래 칸에 그 사진의 이름을 적습니다.
//
//   [사진] [사진] [사진] [사진]          ← 안쪽 표 윗줄
//   진행문서파일 / 발생‧논리순 정리 / …   ← 안쪽 표 아랫줄
//
// 처음에는 사진만 늘어놓고 이름을 한 줄에 이어 붙여, 어느 이름이 어느
// 사진의 것인지 알 수 없었습니다. 사진 아래에 제 이름이 붙어야 합니다.
//
// 여기서는 네 가지를 봅니다.
//   1. 본문에 남은 그림 자리마다 그림 파일이 실제로 있다
//   2. 화면 글에 '[[그림:…]]' 표가 글자로 남지 않는다
//   3. 그림 자리가 있는 화면에는 그만큼 사진이 그려지고, 다 불러와진다
//   4. 원문에 이름 줄이 있는 사진 묶음은 사진마다 이름이 붙어 있다
//   5. 한 줄에 놓인 사진 묶음은 화면에서도 한 줄이다
//      (원문은 한 줄짜리 표입니다. 크기로 맞추면 넉 장 가운데 한 장이
//       다음 줄로 내려가 원문과 달라집니다)
//
// 사용법: node scripts/validate_manual_pictures.mjs [--chapters 01,02]

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const assets = path.join(docs, "assets");

const MARK = /\[\[그림:([A-Za-z0-9_]+)\]\]/g;
const problems = [];
// 원문에 이름 줄이 딸린 사진 수입니다.
let captioned = 0;
const wanted = new Map(); // 편 → 그림 자리 수

for (let id = 1; id <= 19; id += 1) {
  const file = path.join(assets, `chapter${id}-data.js`);
  if (!existsSync(file)) continue;
  const box = {};
  new Function("window", readFileSync(file, "utf8"))(box);
  const data = box[`CHAPTER${id}_DATA`];
  const label = String(id).padStart(2, "0");
  let count = 0;

  const look = (where, value) => {
    for (const found of String(value ?? "").matchAll(MARK)) {
      count += 1;
      const src = path.join(assets, "manual-images", `chapter${label}`, `${found[1]}.png`);
      if (!existsSync(src)) {
        problems.push(`제${label}편 ${where}: 그림 파일이 없습니다 (${found[1]}.png).`);
      }
    }
    // 원문에 이름 줄이 딸린 사진 묶음을 세어 둡니다. 화면에서 그만큼
    // 이름이 붙어 있어야 합니다.
    const lines = String(value ?? "").split(/\r?\n/).map((line) => line.trim());
    lines.forEach((line, at) => {
      const names = (line.match(MARK) || []).length;
      MARK.lastIndex = 0;
      const onlyPictures = names > 0 && !line.replace(MARK, "").replace(/[\s/·]+/g, "");
      if (names < 2 || !onlyPictures) return;
      const next = lines[at + 1] || "";
      if (/^(?:[•‣▸▹▶▪□○◦※☞*]|[-–]\s)/.test(next)) return;
      const parts = next.split("/").map((part) => part.trim()).filter(Boolean);
      if (parts.length === names) captioned += names;
    });
  };

  for (const section of data.sections || []) {
    for (const block of section.contentBlocks || []) {
      const where = `${section.title} [${block.title}]`;
      look(where, block.body);
      for (const table of block.tables || []) {
        for (const cell of [table.headers, ...table.rows].flat()) look(`${where} 표`, cell.text);
      }
    }
  }
  if (count) wanted.set(label, count);
}

if (problems.length) {
  problems.slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n그림 파일이 없는 자리 ${problems.length}곳`);
  process.exit(1);
}

const total = [...wanted.values()].reduce((sum, count) => sum + count, 0);
if (!total) {
  console.error("본문에 그림 자리가 하나도 없습니다. 그림을 꺼내지 않은 것 같습니다.");
  console.error("  python3 scripts/extract_manual_images.py && node scripts/build_chapters_from_hwpx.mjs");
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log(`그림 자리 ${total}곳 모두 파일이 있습니다. (playwright가 없어 화면 확인은 건너뜁니다)`);
  process.exit(0);
}

async function alive(url) {
  try {
    const answer = await fetch(`${url}/index.html`, { signal: AbortSignal.timeout(1200) });
    return answer.ok;
  } catch {
    return false;
  }
}

const at = process.argv.indexOf("--chapters");
const only = at > 0 ? new Set(process.argv[at + 1].split(",")) : null;
let base = process.argv.find((value) => value.startsWith("http")) || "http://127.0.0.1:8899";
let server = null;
if (!(await alive(base))) {
  const { spawn } = await import("node:child_process");
  const port = 8873;
  base = `http://127.0.0.1:${port}`;
  server = spawn("python3", ["-m", "http.server", String(port), "--directory", "docs"], {
    cwd: root,
    stdio: "ignore",
  });
  for (let tries = 0; tries < 20; tries += 1) {
    await new Promise((done) => setTimeout(done, 250));
    if (await alive(base)) break;
  }
  if (!(await alive(base))) {
    server.kill();
    console.log("웹 서버를 띄우지 못해 건너뜁니다.");
    process.exit(0);
  }
}

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
let drawn = 0;
let drawnNamed = 0;

for (const [label, count] of wanted) {
  if (only && !only.has(label)) continue;
  const box = {};
  new Function("window", readFileSync(path.join(assets, `chapter${Number(label)}-data.js`), "utf8"))(box);
  const data = box[`CHAPTER${Number(label)}_DATA`];

  for (const section of data.sections || []) {
    const blocks = (section.contentBlocks || []).filter((block) => {
      const inTables = (block.tables || [])
        .flatMap((table) => [table.headers, ...table.rows].flat())
        .map((cell) => cell.text)
        .join("");
      MARK.lastIndex = 0;
      return MARK.test(`${block.body || ""}${inTables}`);
    });
    if (!blocks.length) continue;

    await page.goto(`${base}/index.html?chapter=${label}#work=${section.id}`, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const steps = await page.evaluate(() =>
      [...document.querySelectorAll("#step-list [data-step-id]")].map((node) =>
        node.getAttribute("data-step-id")
      )
    );
    const seen = new Set();
    for (const step of steps.length ? steps : [""]) {
      const address = step
        ? `${base}/index.html?chapter=${label}#work=${section.id}&step=${step}`
        : `${base}/index.html?chapter=${label}#work=${section.id}`;
      await page.goto(address, { waitUntil: "load" });
      await page.waitForTimeout(300);
      // 사진은 화면에 들어와야 불러옵니다(loading="lazy").
      // 다 보이게 한 번 훑고 나서 셉니다.
      await page.evaluate(async () => {
        for (const image of document.querySelectorAll("#step-actions .source-picture")) {
          image.scrollIntoView({ block: "center" });
          await new Promise((done) => setTimeout(done, 60));
        }
      });
      await page.waitForTimeout(400);
      const found = await page.evaluate(() => ({
        // 표가 글자로 남으면 화면에 '[[그림:image7]]'이 그대로 보입니다.
        leftover: (document.body.innerText.match(/\[\[그림:/g) || []).length,
        pictures: [...document.querySelectorAll("#step-actions .source-picture")].map((image) => ({
          src: image.getAttribute("src"),
          ready: image.naturalWidth > 0,
        })),
        // 사진 아래에 제 이름이 붙은 칸입니다.
        named: document.querySelectorAll("#step-actions .source-picture-cell").length,
        // 한 묶음의 사진이 몇 줄에 걸쳐 있는지 봅니다. 원문은 한 줄입니다.
        wrapped: [...document.querySelectorAll("#step-actions .source-picture-row")]
          .map((row) => {
            const tops = [...row.querySelectorAll("img")].map((image) =>
              Math.round(image.getBoundingClientRect().top)
            );
            return { count: tops.length, lines: new Set(tops).size };
          })
          .filter((row) => row.count > 1 && row.lines > 1),
        blocks: [...document.querySelectorAll("#step-actions [data-source-block]")].map((node) =>
          node.getAttribute("data-source-block")
        ),
      }));
      if (found.leftover) {
        problems.push(
          `제${label}편 ${section.title}: 그림 자리 표가 글자로 남았습니다 (${found.leftover}개).`
        );
      }
      for (const picture of found.pictures) {
        drawn += 1;
        if (!picture.ready) {
          problems.push(`제${label}편 ${section.title}: 사진을 불러오지 못했습니다 (${picture.src}).`);
        }
      }
      for (const row of found.wrapped) {
        problems.push(
          `제${label}편 ${section.title}: 사진 ${row.count}장이 ${row.lines}줄로 접혔습니다. ` +
            "원문은 한 줄짜리 표입니다."
        );
      }
      drawnNamed += found.named;
      found.blocks.forEach((id) => seen.add(id));
    }
    for (const block of blocks) {
      if (!seen.has(block.id)) {
        problems.push(
          `제${label}편 ${section.title} [${block.title}]: 그림이 든 항목이 화면에 없습니다.`
        );
      }
    }
  }
}

await browser.close();
if (server) server.kill();

// 편을 골라 돌릴 때는 셈이 맞지 않으므로 전체를 돌 때만 봅니다.
if (!only && drawnNamed < captioned) {
  problems.push(
    `원문에 이름 줄이 딸린 사진 ${captioned}장 가운데 ${drawnNamed}장만 이름이 붙었습니다. ` +
      "사진 아래에 그 사진의 이름이 있어야 합니다."
  );
}

if (problems.length) {
  problems.slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n매뉴얼 그림 문제 ${problems.length}건`);
  process.exit(1);
}
console.log(
  `본문 그림 자리 ${total}곳 · 화면에 그린 사진 ${drawn}장 · ` +
    `이름이 딸린 사진 ${captioned}장 모두 제 이름과 함께 나옵니다.`
);
