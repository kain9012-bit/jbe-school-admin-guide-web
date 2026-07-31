// 실제로 그려진 화면에서 같은 문장이 두 번 나오는지 모든 업무·단계를 훑어 확인합니다.
//
// 코드를 읽어 판단하지 않고, 브라우저가 그린 결과의 글자를 직접 비교합니다.
// 사람이 눈으로 놓칠 수 있으므로 기계가 셉니다.
//
// 사용법: docs를 정적 서버로 띄운 뒤
//   python3 -m http.server 8899 --directory docs
//   node scripts/check_rendered_duplication.js [기준주소]

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const base = process.argv[2] || "http://127.0.0.1:8899";
const root = path.resolve(__dirname, "..");
const problems = [];

function loadChapters() {
  const context = vm.createContext({ window: {} });
  for (const file of [
    "assets/guide-config.js",
    "assets/chapter1-data.js",
    "assets/chapter3-data.js",
    "assets/workflow-layout.js",
  ]) {
    const filePath = path.join(root, "docs", file);
    vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  }
  return context.window;
}

const normalize = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[·․‧]/g, "")
    .trim();

async function main() {
  const guide = loadChapters();
  const layouts = guide.GUIDE_WORKFLOW_LAYOUT;
  const browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => problems.push(`스크립트 예외: ${error.message}`));

  let checkedSteps = 0;
  let sourceTableBlocks = 0;

  for (const [chapterId, key] of [
    ["01", "CHAPTER1_DATA"],
    ["03", "CHAPTER3_DATA"],
  ]) {
    for (const work of guide[key].sections) {
      const steps = layouts[work.id] || [];
      for (let index = 0; index < steps.length; index += 1) {
        const url = `${base}/index.html?chapter=${chapterId}#work=${encodeURIComponent(
          work.id
        )}&step=step-${index + 1}`;
        await page.goto(url, { waitUntil: "load" });
        await page.waitForTimeout(220);

        // 접혀 있는 내용도 펼쳐서 함께 봅니다.
        await page.evaluate(() => {
          document.querySelectorAll("details").forEach((node) => {
            node.open = true;
          });
        });

        // '업무 내용'만 봅니다. 원문의 흐름도나 TIP은 본문 문장을 다시 옮겨 적기도 하는데
        // 그것은 원문이 그런 것이라 화면이 잘못 그린 것과는 다릅니다.
        // 표의 각 칸도 같은 문구가 되풀이될 수 있으므로 표는 제외합니다.
        const lines = await page.evaluate(() => {
          const list = document.getElementById("step-actions");
          if (!list) return [];
          const out = [];
          list.querySelectorAll(".source-detail").forEach((block) => {
            if (block.querySelector("table")) return;
            // 원문이 '구 분 / 내 용' 표인 자리는 같은 문구가 여러 행에 나옵니다.
            // 매뉴얼이 그렇게 적혀 있는 것이라 화면 잘못이 아닙니다.
            const first = block.querySelector(".semantic-summary-item");
            if (first && /^구\s*분\s+내\s*용/.test(first.textContent.replace(/\s+/g, " ").trim())) {
              window.__sourceTables = (window.__sourceTables || 0) + 1;
              return;
            }
            block.querySelectorAll(".semantic-summary-item, .source-full-text").forEach(
              (node) => {
                const text = node.textContent.replace(/\s+/g, " ").trim();
                if (text.length >= 12) out.push(text);
              }
            );
          });
          return out;
        });

        sourceTableBlocks += await page.evaluate(() => {
          const count = window.__sourceTables || 0;
          window.__sourceTables = 0;
          return count;
        });
        checkedSteps += 1;

        const seen = new Map();
        for (const line of lines) {
          const value = normalize(line);
          if (!value) continue;
          seen.set(value, (seen.get(value) || 0) + 1);
        }
        for (const [value, count] of seen) {
          if (count > 1) {
            problems.push(
              `제${chapterId}편 ${work.title} ${index + 1}단계: 같은 문장이 ${count}번 ` +
                `나옵니다 — "${value.slice(0, 46)}…"`
            );
          }
        }
      }
    }
  }

  await browser.close();

  console.log(
    `단계 ${checkedSteps}개 확인 ` +
      `(원문이 표인 블록 ${sourceTableBlocks}개는 목록으로 펼쳐져 있어 제외)`
  );
  if (problems.length) {
    console.error(`\n중복 ${problems.length}건:`);
    problems.slice(0, 25).forEach((line) => console.error(` - ${line}`));
    if (problems.length > 25) console.error(` … 외 ${problems.length - 25}건`);
    process.exit(1);
  }
  console.log("화면에 같은 문장이 두 번 나오는 곳이 없습니다.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
