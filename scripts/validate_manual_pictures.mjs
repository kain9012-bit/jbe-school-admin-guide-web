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
// 여기서는 세 가지를 봅니다.
//   1. 본문에 남은 그림 자리마다 그림 파일이 실제로 있다
//   2. 화면 글에 '[[그림:…]]' 표가 글자로 남지 않는다
//   3. 그림 자리가 있는 화면에는 그만큼 사진이 그려지고, 다 불러와진다
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
      const src = path.join(assets, "manual-images", `chapter${label}`, `${found[1]}.jpg`);
      if (!existsSync(src)) {
        problems.push(`제${label}편 ${where}: 그림 파일이 없습니다 (${found[1]}.jpg).`);
      }
    }
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

if (problems.length) {
  problems.slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n매뉴얼 그림 문제 ${problems.length}건`);
  process.exit(1);
}
console.log(`본문 그림 자리 ${total}곳 · 화면에 그린 사진 ${drawn}장 모두 제대로 나옵니다.`);
