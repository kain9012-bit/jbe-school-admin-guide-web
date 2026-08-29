// 사진이 원본 그대로 보이는지, 사진 때문에 표가 넘치지 않는지 브라우저로 봅니다.
//
// 두 가지를 봅니다.
//
// ① 사진을 원본보다 크게 늘리지 않는다
//    늘리면 원본에 없던 흐림이 생깁니다. 제12편 태그 사진은 원본이 164점인데
//    칸 폭에 맞춰 279점으로 늘어나 글씨가 뭉개져 보였습니다.
//
//      "왜 사진의 화질이 원본에 비해서 너무 않좋지?"
//
// ② 사진이 든 표에 가로 스크롤이 생기지 않는다
//    그림 자리 표시('[[그림:image13]]')는 글자가 아닙니다. 화면에서는 사진이
//    되고 제 칸 너비에 맞춰 줄어듭니다. 그것을 글자로 세면 열다섯 글자만큼
//    칸이 넓어져, 폭 안에 들어가던 표가 넘칩니다.
//
//      제12편 '3. 전자태그 및 장비' — 필요 폭이 962px로 잡혀 스크롤이
//      생겼습니다(칸 폭은 782px).
//
//    표가 넓어 스크롤을 두는 자리는 원래 있습니다(수당표 22열). 여기서는
//    **사진이 든 표**만 봅니다. 사진은 줄어들 수 있으므로 표를 넓힐 이유가
//    되지 못합니다.
//
// 사용법: node scripts/validate_picture_fit.mjs [--chapters 01,02]

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadGuideData, chapterKeys } = require(path.join(root, "scripts/lib/load_guide_data.js"));

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("playwright가 없어 건너뜁니다. npm install --omit=optional playwright");
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
  const port = 8877;
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

const window = loadGuideData();
const problems = [];
let checked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const PICTURE = /\[\[그림:/;

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  for (const work of window[key].sections) {
    // 사진이 실리는 업무만 엽니다.
    const hasPicture = (work.contentBlocks || []).some((block) => {
      if (PICTURE.test(String(block.body || ""))) return true;
      const walk = (tables) =>
        (tables || []).some((table) =>
          [table.headers || [], ...(table.rows || [])].some((row) =>
            row.some(
              (cell) =>
                cell && (PICTURE.test(String(cell.text || "")) || walk(cell.tables))
            )
          )
        );
      return walk(block.tables);
    });
    if (!hasPicture) continue;

    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(300);
    const steps = await page.evaluate(() =>
      [...document.querySelectorAll("#step-list [data-step-id]")].map((node) =>
        node.getAttribute("data-step-id")
      )
    );
    for (const step of steps.length ? steps : [""]) {
      const address = step
        ? `${base}/index.html?chapter=${chapterId}#work=${work.id}&step=${step}`
        : `${base}/index.html?chapter=${chapterId}#work=${work.id}`;
      await page.goto(address, { waitUntil: "load" });
      // 사진은 늦게 불러옵니다(loading="lazy"). 다 실릴 때까지 기다립니다.
      await page.waitForTimeout(300);
      await page
        .evaluate(() =>
          Promise.all(
            [...document.querySelectorAll("#step-actions img.source-picture")].map((img) =>
              img.complete && img.naturalWidth
                ? null
                : new Promise((done) => {
                    img.addEventListener("load", done, { once: true });
                    img.addEventListener("error", done, { once: true });
                    setTimeout(done, 2000);
                  })
            )
          )
        )
        .catch(() => {});
      const found = await page.evaluate(() => {
        const blown = [];
        for (const img of document.querySelectorAll("#step-actions img.source-picture")) {
          const box = img.getBoundingClientRect();
          if (!img.naturalWidth || !box.width) continue;
          // 몇 픽셀은 봐 줍니다(테두리·반올림).
          if (box.width <= img.naturalWidth + 4) continue;
          blown.push({
            src: img.getAttribute("src") || "",
            shown: Math.round(box.width),
            real: img.naturalWidth,
          });
        }
        const wide = [];
        for (const box of document.querySelectorAll("#step-actions .source-table-scroll")) {
          if (!box.querySelector("img.source-picture")) continue;
          if (box.scrollWidth <= box.clientWidth + 2) continue;
          wide.push({
            over: box.scrollWidth - box.clientWidth,
            said: box.textContent.replace(/\s+/g, " ").trim().slice(0, 36),
          });
        }
        const shown = document.querySelectorAll("#step-actions img.source-picture").length;
        return { blown, wide, shown };
      });
      checked += found.shown;
      for (const one of found.blown) {
        problems.push(
          `제${chapterId}편 ${work.title}: 사진을 원본보다 크게 늘렸습니다 ` +
            `(${one.real}점짜리를 ${one.shown}점으로, ${one.src.split("/").pop()}). ` +
            "원본에 없던 흐림이 생깁니다."
        );
      }
      for (const one of found.wide) {
        problems.push(
          `제${chapterId}편 ${work.title}: 사진이 든 표가 폭을 ${one.over}px ` +
            `넘어 가로 스크롤이 생겼습니다 ('${one.said}…'). 사진은 줄어들 수 ` +
            "있으므로 표를 넓힐 이유가 되지 못합니다."
        );
      }
    }
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  [...new Set(problems)].slice(0, 20).forEach((line) => console.error(`  - ${line}`));
  console.error(`\n사진 때문에 어긋난 곳 ${new Set(problems).size}건`);
  process.exit(1);
}
console.log(`화면에 실린 사진 ${checked}장이 원본 크기 안에서 제 자리에 섭니다.`);
