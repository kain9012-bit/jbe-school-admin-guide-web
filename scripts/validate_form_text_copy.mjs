// 서식 미리보기의 글자를 긁어서 복사할 수 있는지 확인합니다.
//
// 미리보기는 오랫동안 <img>로 걸려 있었습니다. 그림 한 장이라 화면에서는
// 글자로 보여도 끌어 담을 수 없었습니다. 지금은 같은 SVG를 화면 안에 그대로
// 펼쳐 넣어 글자가 진짜 글자로 남습니다. 그것이 유지되는지 봅니다.
//   1. 서식을 열면 그림 대신 펼쳐 넣은 것이 보인다
//   2. 그 안에 글자 마디가 넉넉히 들어 있다
//   3. 마우스로 긁으면 글자가 잡힌다
//
// 사용법: node scripts/validate_form_text_copy.mjs [--chapters 01,12]

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

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  const data = window[key];
  // 편마다 서식 하나만 봐도 충분합니다. 만드는 길이 편마다 같기 때문입니다.
  const form = (data.forms || []).find((item) => (data.sections || []).some((s) => (s.formIds || []).includes(item.id)));
  if (!form) continue;
  const work = data.sections.find((section) => (section.formIds || []).includes(form.id));

  await page.goto(`${base}/index.html?chapter=${chapterId}#work=${work.id}`, {
    waitUntil: "load",
  });
  await page.waitForSelector(`[data-form-id="${form.id}"]`, { timeout: 8000 }).catch(() => null);
  const chip = await page.$(`[data-form-id="${form.id}"]`);
  if (!chip) {
    problems.push(`제${chapterId}편 ${form.id}: 서식 단추가 화면에 없습니다.`);
    continue;
  }
  await chip.click();

  const ready = await page
    .waitForFunction(
      () => {
        const sheet = document.getElementById("form-preview-sheet");
        return Boolean(sheet && !sheet.hidden && sheet.querySelector("svg text"));
      },
      { timeout: 8000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    problems.push(`제${chapterId}편 ${form.id}: 미리보기가 그림으로만 떠 글자를 긁을 수 없습니다.`);
    continue;
  }

  const seen = await page.evaluate(() => {
    const sheet = document.getElementById("form-preview-sheet");
    const image = document.getElementById("form-preview-image");
    const nodes = [...sheet.querySelectorAll("text")];
    // 실제로 긁히는지 봅니다. 글자 마디 여럿을 골라 선택 길이를 잽니다.
    const range = document.createRange();
    range.setStart(nodes[0], 0);
    const last = nodes[Math.min(nodes.length - 1, 20)];
    range.setEnd(last, last.childNodes.length);
    const picked = window.getSelection();
    picked.removeAllRanges();
    picked.addRange(range);
    const grabbed = String(picked).replace(/\s+/g, " ").trim();
    picked.removeAllRanges();
    return { imageHidden: Boolean(image.hidden), texts: nodes.length, grabbed: grabbed.length };
  });

  checked += 1;
  if (!seen.imageHidden) {
    problems.push(`제${chapterId}편 ${form.id}: 그림 미리보기가 그대로 남아 있습니다.`);
  }
  if (seen.texts < 5) {
    problems.push(`제${chapterId}편 ${form.id}: 글자 마디가 ${seen.texts}개뿐입니다.`);
  }
  if (seen.grabbed < 5) {
    problems.push(`제${chapterId}편 ${form.id}: 긁어도 글자가 잡히지 않습니다(${seen.grabbed}자).`);
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  problems.forEach((line) => console.error(`  - ${line}`));
  console.error(`\n서식 글자 복사에 문제 ${problems.length}건`);
  process.exit(1);
}
console.log(`form text copy valid: 서식 ${checked}개에서 글자를 긁어 복사할 수 있습니다.`);
