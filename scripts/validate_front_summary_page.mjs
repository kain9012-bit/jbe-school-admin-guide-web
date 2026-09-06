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
      // 표 머리줄이 색을 입었는지 봅니다. 원문은 이 지면의 표 머리줄을
      // 편 고유색으로 칠합니다. 흰 바탕에 가까우면 안 칠한 것입니다.
      const painted = (selector) => {
        const cell = document.querySelector(selector);
        if (!cell) return null;
        const said = getComputedStyle(cell).backgroundColor;
        const rgb = said.match(/\d+(\.\d+)?/g);
        if (!rgb || rgb.length < 3) return false;
        if (rgb.length > 3 && Number(rgb[3]) === 0) return false;
        return Math.min(Number(rgb[0]), Number(rgb[1]), Number(rgb[2])) < 200;
      };
      return {
        layers,
        headPainted: painted("#step-actions .source-criteria-table th[scope='col']"),
        // 화면에 그려진 글자를 통째로 받아 옵니다. 지면을 표 대신 카드로
        // 다시 그릴 때 칸이 통째로 빠지는 일이 있어(제2편 '기준연도' 표의
        // 가운데 열이 그랬습니다) 원문 글자가 다 남았는지 견줍니다.
        shown: (document.querySelector("#step-actions")?.textContent || "").replace(
          /[\s\u200b\u00a0\u00ad\u2060]+/g,
          ""
        ),
        // 표 대신 카드로 다시 그린 지면인지입니다. 여느 지면은 표 그대로라
        // 이미 다른 검사기가 글자를 견주고 있습니다.
        // **카드가 한 장도 남지 않았는지 셉니다.**
        //
        // 이 지면은 제가 만든 파란 카드 틀(항목 카드·단·갈래)로 죄다
        // 뭉개져 있었습니다. 편마다 다른 원문을 카드 하나로 찍어낸 것입니다.
        // 카드는 다 걷어내고 원문 표 그대로 그립니다. 한 장이라도 남으면
        // 실패합니다.
        cards: document.querySelectorAll(
          "#step-actions .sheet-flow, #step-actions .sheet-actors,"
            + " #step-actions .sheet-records, #step-actions .sheet-stacks,"
            + " #step-actions .sheet-lanes, #step-actions .front-sheet"
        ).length,
        // 원문 표(또는 그림)로 그려졌는지입니다. 지면이 그림 한 장뿐인 편도
        // 있어(제12편 물품관리 흐름도) 표 대신 그림이면 됩니다.
        gridded: Boolean(document.querySelector("#step-actions .source-criteria-table")),
        pictured: Boolean(document.querySelector("#step-actions .source-picture-row")),
        // 편마다 손으로 그린 전용 지면입니다(제2편 .ch2-front, 제5편 .ch5-front …).
        // 표도 그림도 없이 흐름만 있는 편(제5편)이라 이것도 내용으로 봅니다.
        custom: Boolean(document.querySelector('#step-actions [class$="-front"]')),
        // 표가 삼킨 줄의 마지막 한 글자가 다음 줄 맨 앞으로 밀려나는 자리가
        // 있습니다. 닫는 괄호로 시작하는 줄은 원문에 없습니다.
        //   제4편 ')자주 쓰는 휴가'  ← 원문은 '자주 쓰는 휴가'
        strays: Array.from(document.querySelectorAll("#step-actions *"))
          .filter((node) => {
            if (!["P", "LI", "SPAN", "DIV", "TD", "TH"].includes(node.tagName)) return false;
            const first = node.firstChild;
            return first && first.nodeType === 3 && /^\s*[)\]）］}」』]/.test(first.textContent);
          })
          .map((node) => (node.textContent || "").trim().slice(0, 24)),
        frames: Object.fromEntries(frames.map((one) => [one, seen(one)])),
        title: said("#work-title"),
        badge: said("#work-number"),
        stepTitle: seen("#step-title") ? said("#step-title") : "",
        room: wide(".work-content"),
        // 이 지면이 표가 아니라 그림인 편도 있습니다(제12편 물품관리 흐름도).
        // 그때는 그림이 든 줄의 폭을 잽니다.
        // 지면을 카드로 다시 그리면 표가 아예 없을 수도 있습니다.
        // 그때는 다시 그린 지면 전체의 폭을 잽니다.
        // 지면에서 가장 넓은 것을 잽니다. 제목 띠(흐름도 …)도 source-criteria-table
        // 이지만 원문 PDF 단추와 한 줄에 놓느라 폭을 줄여 두었습니다. 첫 표를
        // 재면 그 좁은 띠가 잡히므로, 여러 표 가운데 가장 넓은 것을 봅니다.
        table: Math.max(
          wide('#step-actions [class$="-front"]'),
          ...Array.from(
            document.querySelectorAll("#step-actions .source-criteria-table")
          ).map((el) => Math.round(el.getBoundingClientRect().width)),
          wide("#step-actions .source-picture-row"),
          0
        ),
      };
    },
    { frames: EMPTY_FRAMES.map(([selector]) => selector) }
  );

const squash = (said) => String(said || "").replace(/\s+/g, "");

// 글자를 견주기 전에 눈에 안 보이는 것을 다 텁니다. 화면은 긴 낱말이
// 접힐 자리에 폭 없는 공백(U+200B)을 끼워 넣으므로, 그대로 견주면
// 멀쩡히 그려진 글도 '사라졌다'가 됩니다.
// \uc0c1\uc790\uadf8\ub9ac\uae30 \ub300\uc2dc(\u2574\u2576\u2500\u2501)\ub294 \ud558\uc774\ud508\uacfc \uac19\uac8c \ubd05\ub2c8\ub2e4. \uc6d0\ubb38 \ud55c\uae00\ud30c\uc77c\uc774 \ud558\uc774\ud508
// \ub300\uc2e0 \uc774 \uae00\uc790\ub97c \uc4f4 \uc790\ub9ac\uac00 \uc788\ub294\ub370(\uc81c10\ud3b8 '\u2574(\uad50\uc6d0\uc704\uc6d0)\u2026'), \ud654\uba74\uc5d0\uc11c\ub294
// \ud558\uc774\ud508\uc73c\ub85c \uace0\uccd0 \uadf8\ub9ac\ubbc0\ub85c \uacac\uc904 \ub54c\ub3c4 \uac19\uc740 \uae00\uc790\ub85c \ub9de\ucda5\ub2c8\ub2e4.
const bare = (said) =>
  String(said || "")
    .replace(/[\u2574\u2576\u2500\u2501]/g, "-")
    // kordoc\uc774 \uc0c8\uc5b4\ub123\uc740 \uc55e \uae00\uc790 '\'(\uc81c17\ud3b8 '\ \uacc4\uc57d\uccb4\uacb0')\ub294 \ud654\uba74\uc5d0\uc11c \ud141\ub2c8\ub2e4.
    // \uc0c1\uc790 \ub300\uc2dc\ucc98\ub7fc \ub73b \uc5c6\ub294 \uad70\ub354\ub354\uae30\ub77c, \uacac\uc904 \ub54c\ub3c4 \ubb34\uc2dc\ud569\ub2c8\ub2e4.
    .replace(/\\/g, "")
    .replace(/[\s\u200b\u00a0\u00ad\u2060]+/g, "");

// 표 한 그루의 모든 칸 글자입니다(칸 안에 든 표까지).
function cellTexts(table) {
  const out = [];
  for (const row of [table.headers || [], ...(table.rows || [])]) {
    for (const cell of row) {
      const text = String(cell.text || "").trim();
      const inners = cell.tables || [];
      // 칸 안에 표가 든 칸의 글은 그 안쪽 표를 한 줄로 편 사본입니다.
      // 같은 글을 두 번 세게 되고, 화면은 안쪽 표를 표로 그리므로
      // 편 사본은 어디에도 없습니다. 안쪽 표만 따라 들어갑니다.
      // 줄 단위로 셉니다. 화면은 칸 안의 줄마다 글머리표를 세우므로
      // (·중: 2013년…·고: 2014년…) 칸을 통째로 견주면 그 기호에 걸립니다.
      if (text && !inners.length && !text.includes("[[그림:")) {
        out.push(...text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
      }
      for (const inner of inners) out.push(...cellTexts(inner));
    }
  }
  return out;
}
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
    // 같은 말을 배지와 큰 제목에서 되풀이하지 않습니다.
    if (now.stepTitle && squash(now.stepTitle) === squash(now.badge)) {
      problems.push(`${where}: 작은 제목이 배지와 같은 말('${now.badge}')입니다.`);
    }
    if (now.stepTitle && squash(now.stepTitle) === squash(now.title)) {
      problems.push(`${where}: 작은 제목이 큰 제목과 같은 말입니다.`);
    }
    // 이 지면은 원문 표(또는 그림) 그대로 그립니다.
    //
    // 제가 만든 파란 카드 틀(항목 카드·단·갈래)로 편마다 다른 원문을 죄다
    // 뭉갰습니다. 카드는 다 걷어냈습니다. 한 장이라도 남으면 실패합니다.
    if (now.cards) {
      problems.push(`${where}: 카드 디자인이 ${now.cards}개 남았습니다 — 원문 표 그대로여야 합니다.`);
    }
    // 표도 그림도 편별 전용 지면도 없으면 지면이 통째로 사라진 것입니다.
    if (!now.gridded && !now.pictured && !now.custom) {
      problems.push(`${where}: 원문 표도 그림도 그려지지 않았습니다.`);
    }
    for (const stray of now.strays || []) {
      problems.push(`${where}: 닫는 괄호로 시작하는 줄이 남았습니다 — '${stray}'`);
    }
    // 원문 표의 칸 글자가 화면에서 빠지지 않았는지 견줍니다.
    //
    // 제9편은 예외입니다. 이 편만 사용자 결정에 따라 한글파일이 아니라 원문
    // PDF를 기준으로 그립니다. 한글파일에는 'Ⅲ. 매월 품의'와 열 줄짜리
    // 심의내용이 더 들어 있지만 PDF에는 없어, 화면에도 없습니다. 그래서
    // 한글파일 칸과 견주면 당연히 '사라졌다'가 됩니다 — 이 편만 건너뜁니다.
    const missing = [];
    const pdfBased = chapterId === "09";
    for (const block of pdfBased ? [] : front.contentBlocks || []) {
      for (const table of block.tables || []) {
        for (const text of cellTexts(table)) {
          const want = bare(text);
          if (want.length < 2) continue;
          if (!now.shown.includes(want)) missing.push(text);
        }
      }
    }
    if (missing.length) {
      problems.push(
        `${where}: 원문 칸 ${missing.length}개가 화면에서 사라졌습니다` +
          ` — ${missing.slice(0, 3).map((one) => `'${one.slice(0, 18)}'`).join(", ")}`
      );
    }
    // 원문은 이 지면의 표 머리줄을 색으로 칠합니다(제2편 주황·제3편 보라·
    // 제13편 청록). 화면은 편마다 색을 달리하지 않고 누리집 파랑 하나로
    // 칠하되, 칠하는 자리는 원문과 같게 둡니다.
    // headPainted가 null이면 머리칸이 없는 지면입니다(그림으로 그린 편).
    if (now.headPainted === false) {
      problems.push(`${where}: 표 머리줄이 흰 바탕 그대로입니다.`);
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
    // 표 칠하기도 앞머리 지면에만 해당합니다. 여느 업무 화면의 표는
    // 흰 바탕 그대로여야 합니다. 예전에 온 화면 표 칸에 색을 넣었다가
    // 통째로 되돌린 적이 있습니다. 다시 번지지 않는지 여기서 봅니다.
    if (now.headPainted === true) {
      problems.push(`${where}: 업무 화면의 표 머리줄까지 색이 칠해졌습니다.`);
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
