// 구역 머리(【교육청】·【학교】·[참고1]) 아래 항목이 그 구역에 딸린 것으로 보이는지
// 브라우저로 확인합니다.
//
// 왜 이 검사가 필요한가
//   원문은 【교육청】 아래에 1·2를, 【학교】 아래에 1~5를, [참고1] 아래에 1~8을
//   적어 둡니다. 번호가 구역마다 1부터 다시 시작하므로, 구역 머리와 그 아래
//   항목이 한 덩이로 보이지 않으면 '1·2·1·2·3·4·5·1·2…'가 줄줄이 늘어선
//   것으로만 읽힙니다. 어느 1이 교육청 일이고 어느 1이 학교 일인지 알 수 없습니다.
//
//   앞서는 구역 머리 위에 굵은 선을 긋고 이름을 크게 세우기만 했습니다.
//   그러면 '여기서부터 새 구역'은 보이지만, 아래 항목이 그 구역에 **딸린**
//   것으로는 보이지 않습니다. 머리와 항목이 여전히 나란한 형제이기 때문입니다.
//
// 그래서 두 가지를 봅니다.
//   1. 딸린 항목이 구역 머리 상자 **안에** 그려진다(형제가 아니라 자식이다)
//   2. 딸린 항목의 왼쪽 끝이 구역 머리보다 **안쪽**에 선다(눈으로 보인다)
//
// 사용법: node scripts/validate_section_nesting.mjs [--chapters 14]

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

// 구역을 여는 머리입니다. 화면 쪽(app-faithful-workflow.js)과 같은 꼴이어야 합니다.
const SECTION_HEAD = /^(?:【[^】]{1,20}】|\[(?:참고|예시|서식)\s*\d+\])$/;
// 눈으로 알아볼 수 있으려면 이만큼은 안쪽으로 들어가야 합니다.
const LEAST_INDENT = 8;

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
  const port = 8869;
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
let headsChecked = 0;
let childrenChecked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  for (const work of window[key].sections) {
    const blocks = work.contentBlocks || [];
    if (!blocks.some((block) => SECTION_HEAD.test(String(block.title || "").trim()))) continue;

    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(400);

    const stepIds = await page.evaluate(() =>
      [...document.querySelectorAll("#step-list [data-step-id]")].map((node) =>
        node.getAttribute("data-step-id")
      )
    );

    for (const stepId of stepIds.length ? stepIds : [""]) {
      if (stepId) {
        await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}&step=${stepId}`, {
          waitUntil: "load",
        });
        await page.waitForTimeout(250);
      }
      // 한 단계 안에 그려진 항목을 차례대로 훑습니다. 구역 머리를 만나면
      // 그 뒤에 오는 항목은 다음 구역 머리가 나올 때까지 그 구역에 딸립니다.
      const shown = await page.evaluate(() =>
        [...document.querySelectorAll("#step-actions [data-source-block]")].map((node) => {
          const box = node.getBoundingClientRect();
          return {
            id: node.getAttribute("data-source-block"),
            head: (node.querySelector(":scope > strong") || {}).textContent || "",
            left: Math.round(box.left),
            // 이 항목을 감싸고 있는 바깥 항목들입니다(자식인지 형제인지 가릅니다).
            inside: [...document.querySelectorAll("#step-actions [data-source-block]")]
              .filter((other) => other !== node && other.contains(node))
              .map((other) => other.getAttribute("data-source-block")),
          };
        })
      );

      let head = null;
      for (const shape of shown) {
        const title = String(shape.head || "").trim();
        if (SECTION_HEAD.test(title)) {
          head = shape;
          headsChecked += 1;
          continue;
        }
        if (!head) continue;
        childrenChecked += 1;
        const where = `제${chapterId}편 ${work.title} ${title || shape.id}`;
        if (!shape.inside.includes(head.id)) {
          problems.push(`${where}: ${head.head.trim()} 상자 밖에 그려졌습니다(형제로 섰습니다).`);
        }
        if (shape.left - head.left < LEAST_INDENT) {
          problems.push(
            `${where}: 왼쪽 끝이 ${head.head.trim()}과 ${shape.left - head.left}px 차이라 ` +
              `딸린 것으로 보이지 않습니다(${LEAST_INDENT}px 이상 필요).`
          );
        }
      }
    }
  }
}

await browser.close();
if (server) server.kill();

console.log(`구역 머리 ${headsChecked}개, 그 아래 항목 ${childrenChecked}개를 봤습니다.`);
if (problems.length) {
  problems.slice(0, 40).forEach((line) => console.log(`  ${line}`));
  console.log(`구역 나눔이 보이지 않는 곳 ${problems.length}군데`);
  process.exit(1);
}
console.log("구역 머리 아래 항목이 모두 그 구역 안에 안쪽으로 서 있습니다.");
