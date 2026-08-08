// 업무 121개를 전부 브라우저로 열어 보고, 화면이 제대로 그려지는지 확인합니다.
//
// 자료가 맞아도 화면에서 깨질 수 있습니다. 편을 19개로 늘리면서
// 눈으로 다 보기는 불가능해졌으므로, 아래 네 가지를 기계로 봅니다.
//   1. 자바스크립트 오류가 하나도 없다
//   2. 소제목마다 본문이 비어 있지 않다
//   3. 페이지 전체에 가로 스크롤이 생기지 않는다
//   4. 글이 담긴 칸 밖으로 넘쳐 잘리지 않는다
//
// 서버는 스스로 띄웁니다.
//
// 사용법: node scripts/validate_render_smoke.mjs [--chapters 01,02,03]

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

const chapterArg = (() => {
  const at = process.argv.indexOf("--chapters");
  return at > 0 ? new Set(process.argv[at + 1].split(",")) : null;
})();

let base = process.argv.find((value) => value.startsWith("http")) || "http://127.0.0.1:8899";
let server = null;
if (!(await alive(base))) {
  const { spawn } = await import("node:child_process");
  const port = 8878;
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
let works = 0;
let steps = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

let errors = [];
page.on("pageerror", (error) => errors.push(String(error.message).slice(0, 140)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text().slice(0, 140));
});

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (chapterArg && !chapterArg.has(chapterId)) continue;
  for (const work of window[key].sections) {
    const layout = window.GUIDE_WORKFLOW_LAYOUT[work.id] || [];
    if (!layout.length) {
      problems.push(`제${chapterId}편 ${work.title}: 소제목이 하나도 없습니다.`);
      continue;
    }
    works += 1;
    errors = [];
    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(220);

    for (let step = 1; step <= layout.length; step += 1) {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, `#work=${work.id}&step=step-${step}`);
      await page
        .waitForFunction(
          (id) => {
            const active = document.querySelector("#step-list .active");
            return Boolean(active) && active.dataset.stepId === id;
          },
          `step-${step}`,
          { timeout: 4000 }
        )
        .catch(() => {});
      await page.waitForTimeout(70);
      steps += 1;

      const look = await page.evaluate(() => {
        const area = document.querySelector("#step-actions");
        const text = area ? area.innerText.replace(/\s+/g, "") : "";
        // 글이 담긴 칸 밖으로 넘쳐 잘리는 곳이 있는지 봅니다.
        // 표는 스스로 가로로 넘겨 보게 해 둔 곳이 있어 여기서는 빼고 봅니다.
        const spills = [...(area ? area.querySelectorAll("p, li, h3, h4, dd, dt") : [])].filter(
          (node) => node.scrollWidth > node.clientWidth + 2
        ).length;
        return {
          empty: text.length < 2,
          spills,
          pageScroll:
            document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          title: (document.querySelector("#step-list .active")?.innerText || "").trim().slice(0, 24),
        };
      });

      const where = `제${chapterId}편 ${work.title} ${step}번째 [${look.title}]`;
      if (look.empty) problems.push(`${where}: 본문이 비어 있습니다.`);
      if (look.spills) problems.push(`${where}: 글이 칸 밖으로 넘치는 곳이 ${look.spills}군데 있습니다.`);
      if (look.pageScroll) problems.push(`${where}: 화면 전체에 가로 스크롤이 생깁니다.`);
    }

    if (errors.length) {
      problems.push(`제${chapterId}편 ${work.title}: 화면 오류 ${errors.length}건 (${errors[0]})`);
    }
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  console.error("화면이 제대로 그려지지 않는 곳이 있습니다:");
  problems.slice(0, 20).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 20) console.error(` … 외 ${problems.length - 20}건`);
  process.exit(1);
}

console.log(`render smoke valid: 업무 ${works}개 · 소제목 ${steps}개, 오류·빈칸·넘침 없음`);
