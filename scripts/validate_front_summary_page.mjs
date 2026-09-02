// 편 앞머리의 '한눈에 보기' 지면이 업무 화면 틀에 갇혀 있지 않은지 봅니다.
//
// 이 지면은 업무가 아닙니다. 원문에서 한 장짜리 요약 지면(한눈에 쏙쏙)이고,
// 항목이 하나뿐이며, 딸린 서식도 FAQ도 없습니다. 그런데 업무 화면 틀에
// 그대로 끼워 넣어 두어서 그 틀이 통째로 빈껍데기로 남았습니다.
//
//   · '목차 / 전체 1개 항목 중 1번째' + 칩 한 개   ← 고를 것이 없습니다
//   · '서식·근거'                                18편 모두 서식 0개
//   · '관련 질문'                                18편 모두 FAQ 0개
//   · '이전 항목 / 마지막 항목'                    둘 다 눌리지 않습니다
//
//   그리고 '한눈에 보기'라는 말이 한 화면에 여섯 번 나왔습니다
//   (빵부스러기 · 왼쪽 목록 · 배지 · 큰 제목 · 단계 칩 · 카드 제목).
//   정작 어느 편인지는 어디에도 없었습니다.
//
// 그래서 이 지면에서만 빈 틀을 걷고, 큰 제목에 편 이름을 답니다.
//
// **여느 업무 화면은 건드리지 않습니다.** 빈 상자를 감추는 것은 이 지면에만
// 해당합니다. 그래서 여기서는 업무 화면도 함께 열어 그 틀이 그대로 있는지
// 확인합니다. 확인하지 않으면 규칙이 슬그머니 온 화면에 번져도 모릅니다.
//
// 사용법: node scripts/validate_front_summary_page.mjs [--chapters 03,13]

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
  const port = 8895;
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

// 이 지면에서 걷어 내야 하는 빈 틀입니다.
const EMPTY_FRAMES = [
  [".workflow-section", "목차와 단계 칩"],
  [".resource-block", "서식·근거"],
  [".related-section", "관련 질문"],
  [".step-navigation", "이전·다음 항목 단추"],
];

const shape = (page) =>
  page.evaluate(
    ({ frames }) => {
      const seen = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return false;
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      };
      const said = (selector) => (document.querySelector(selector)?.textContent || "").trim();
      const wide = (selector) =>
        Math.round(document.querySelector(selector)?.getBoundingClientRect().width || 0);
      // 내용을 감싼 상자가 몇 겹인지 셉니다. 바탕색이나 테두리를 가진
      // 조상만 셉니다 — 눈에 상자로 보이는 것이 그것들뿐입니다.
      const layers = (() => {
        const inside =
          document.querySelector("#step-actions .source-criteria-table") ||
          document.querySelector("#step-actions .source-picture-row");
        const stop = document.querySelector(".work-content");
        if (!inside || !stop) return 0;
        let count = 0;
        let node = inside.parentElement;
        while (node && node !== stop) {
          const style = getComputedStyle(node);
          const painted = style.backgroundColor !== "rgba(0, 0, 0, 0)";
          const lined = ["Top", "Right", "Bottom", "Left"].some(
            (side) => parseFloat(style[`border${side}Width`]) > 0
          );
          if (painted || lined) count += 1;
          node = node.parentElement;
        }
        return count;
      })();
      return {
        layers,
        frames: Object.fromEntries(frames.map((one) => [one, seen(one)])),
        title: said("#work-title"),
        badge: said("#work-number"),
        stepTitle: seen("#step-title") ? said("#step-title") : "",
        room: wide(".work-content"),
        // 이 지면이 표가 아니라 그림인 편도 있습니다(제12편 물품관리 흐름도).
        // 그때는 그림이 든 줄의 폭을 잽니다.
        table: wide("#step-actions .source-criteria-table") || wide("#step-actions .source-picture-row"),
      };
    },
    { frames: EMPTY_FRAMES.map(([selector]) => selector) }
  );

const squash = (said) => String(said || "").replace(/\s+/g, "");
// 표가 본문 폭에서 이만큼은 써야 원문 지면처럼 보입니다.
const LEAST_SHARE = 0.85;
// 내용을 감싸는 상자는 이만큼까지만 둡니다(원문 표의 선 + 바깥 카드).
const MOST_LAYERS = 2;
// 여느 업무 화면은 하늘색 '업무 내용' 상자가 한 겹 더 있어야 합니다.
// 상자 걷어 내기가 그쪽으로 번지지 않았는지 이 값으로 봅니다.
const WORK_LAYERS = 3;

const window = loadGuideData();
const problems = [];
let frontChecked = 0;
let workChecked = 0;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  const works = window[key].sections || [];
  const front = works.find((work) => work.number === 0);
  const plain = works.find((work) => work.number > 0);

  if (front) {
    frontChecked += 1;
    const where = `제${chapterId}편 한눈에 보기`;
    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${front.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(500);
    const now = await shape(page);

    for (const [selector, name] of EMPTY_FRAMES) {
      if (now.frames[selector]) {
        problems.push(`${where}: 빈 ${name}이(가) 그대로 남아 있습니다.`);
      }
    }
    // 큰 제목이 어느 편인지 말해 주어야 합니다.
    if (!/^제\d+편\s/.test(now.title)) {
      problems.push(
        `${where}: 큰 제목이 '${now.title}'이라 어느 편인지 알 수 없습니다.`
      );
    }
    // 같은 말을 배지와 카드 제목에서 되풀이하지 않습니다.
    if (now.stepTitle && squash(now.stepTitle) === squash(now.badge)) {
      problems.push(`${where}: 카드 제목이 배지와 같은 말('${now.badge}')입니다.`);
    }
    if (now.stepTitle && squash(now.stepTitle) === squash(now.title)) {
      problems.push(`${where}: 카드 제목이 큰 제목과 같은 말입니다.`);
    }
    // 상자가 겹겹이 쌓이면 어디를 봐야 할지 알 수 없습니다. 네 겹이었습니다
    // (표 상자 · 바깥 한 칸 상자 · 하늘색 업무 상자 · 바깥 카드).
    // 원문 표의 선과 바깥 카드, 두 겹까지만 둡니다.
    if (now.layers > MOST_LAYERS) {
      problems.push(
        `${where}: 내용을 감싼 상자가 ${now.layers}겹입니다` +
          ` (${MOST_LAYERS}겹까지).`
      );
    }
    // 원문은 이 지면을 종이 폭 꽉 차게 씁니다.
    const share = now.room ? now.table / now.room : 0;
    if (share < LEAST_SHARE) {
      problems.push(
        `${where}: 표가 본문 폭의 ${Math.round(share * 100)}%밖에 안 됩니다` +
          ` (${now.table}px / ${now.room}px, ${Math.round(LEAST_SHARE * 100)}% 이상 필요).`
      );
    }
  }

  // 여느 업무 화면은 그대로여야 합니다. 빈 틀 걷어 내기는 앞머리 지면에만
  // 해당합니다. 여기서 함께 보지 않으면 규칙이 온 화면에 번져도 모릅니다.
  if (plain) {
    workChecked += 1;
    const where = `제${chapterId}편 ${plain.title}`;
    await page.goto(`${base}/index.html?chapter=${chapterId}#work=${plain.id}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(500);
    const now = await shape(page);
    for (const [selector, name] of EMPTY_FRAMES) {
      if (!now.frames[selector]) {
        problems.push(`${where}: 업무 화면에서 ${name}이(가) 사라졌습니다.`);
      }
    }
    // 상자 걷어 내기도 앞머리 지면에만 해당합니다.
    if (now.layers && now.layers < WORK_LAYERS) {
      problems.push(
        `${where}: 업무 화면의 상자가 ${now.layers}겹으로 줄었습니다` +
          ` (${WORK_LAYERS}겹이어야 합니다).`
      );
    }
  }
}

await browser.close();
if (server) server.kill();

console.log(`한눈에 보기 ${frontChecked}곳, 여느 업무 ${workChecked}곳을 봤습니다.`);
if (problems.length) {
  problems.slice(0, 40).forEach((line) => console.log(`  ${line}`));
  console.log(`어긋난 곳 ${problems.length}군데`);
  process.exit(1);
}
console.log("한눈에 보기는 빈 틀 없이 원문 지면처럼 서고, 업무 화면은 그대로입니다.");
