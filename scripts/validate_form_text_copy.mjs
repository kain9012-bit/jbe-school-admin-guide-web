// 서식 미리보기의 글자와 표를 복사할 수 있는지 확인합니다.
//
// 미리보기는 오랫동안 <img>로 걸려 있었습니다. 그림 한 장이라 화면에서는
// 글자로 보여도 끌어 담을 수 없었습니다. 지금은 같은 SVG를 화면 안에 그대로
// 펼쳐 넣어 글자가 진짜 글자로 남습니다. 표는 한글파일에서 꺼낸 <table> 조각을
// 화면 밖에 깔아 두었다가 '복사'를 누를 때 씁니다. 둘 다 유지되는지 봅니다.
//   1. 서식을 열면 그림 대신 펼쳐 넣은 것이 보인다
//   2. 그 안에 글자 마디가 넉넉히 들어 있다
//   3. 마우스로 긁으면 글자가 잡힌다
//   4. 붙여 넣기용 조각이 서식마다 있다
//   5. '복사'를 누르면 클립보드에 표(text/html)가 실제로 담긴다
//
// 5번이 핵심입니다. 글자만 담기면 한글에 붙여도 줄글이 됩니다.
//
// 사용법: node scripts/validate_form_text_copy.mjs [--chapters 01,12]

import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
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

function fragmentPath(chapterId, marker) {
  const asset = window.FORM_ASSETS?.[chapterId]?.[marker];
  return asset ? path.join(root, "docs", asset.preview.replace(/\.svg$/, ".html")) : "";
}

// 붙여 넣기용 조각에 표가 몇 개 들어 있는지 셉니다. 화면에 뜬 수와 맞춰 봅니다.
function tablesInFile(chapterId, marker) {
  const where = fragmentPath(chapterId, marker);
  if (!where || !existsSync(where)) return 0;
  return (readFileSync(where, "utf8").match(/<table>/g) || []).length;
}

const browser = await chromium.launch({ channel: "chromium" });
// 클립보드에 무엇이 담겼는지 읽어 봐야 하므로 미리 허락을 받아 둡니다.
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await context.newPage();

for (const { id: chapterId, key } of chapterKeys(window)) {
  if (only && !only.has(chapterId)) continue;
  const data = window[key];
  const linked = (data.forms || []).filter((item) =>
    (data.sections || []).some((s) => (s.formIds || []).includes(item.id))
  );
  // 편마다 서식 하나만 봐도 충분합니다. 만드는 길이 편마다 같기 때문입니다.
  // 표가 든 것을 골라 봅니다. 표가 하나도 없는 서식(휴직원 같은 줄글)은
  // 표 보기를 확인할 수 없습니다.
  const form =
    linked.find((item) => tablesInFile(chapterId, item.id) > 0) || linked[0];
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

  // 붙여 넣기용 조각은 서식마다 한 장씩 있어야 합니다. 이것은 편 전체를 셉니다.
  const missing = Object.keys(window.FORM_ASSETS?.[chapterId] || {}).filter(
    (marker) => !existsSync(fragmentPath(chapterId, marker))
  );
  if (missing.length) {
    problems.push(
      `제${chapterId}편: 붙여 넣기용 조각이 없는 서식 ${missing.length}개 (${missing.slice(0, 4).join(", ")})`
    );
  }

  // 붙여 넣기용 표가 화면 밖에 깔려야 합니다. 화면에는 보이면 안 됩니다.
  const laid = await page
    .waitForFunction(() => document.getElementById("form-copy-source")?.dataset.ready === "yes", {
      timeout: 8000,
    })
    .then(() => true)
    .catch(() => false);
  const expected = tablesInFile(chapterId, form.id);
  if (!laid) {
    problems.push(`제${chapterId}편 ${form.id}: 붙여 넣기용 조각을 화면이 읽지 못했습니다.`);
  } else {
    const source = await page.evaluate(() => {
      const box = document.getElementById("form-copy-source");
      const where = box.getBoundingClientRect();
      return {
        tables: box.querySelectorAll("table").length,
        cells: box.querySelectorAll("td, th").length,
        // 화면 밖으로 밀려 있어야 미리보기를 가리지 않습니다.
        offscreen: where.right <= 0 || where.left >= window.innerWidth,
      };
    });
    if (source.tables !== expected) {
      problems.push(
        `제${chapterId}편 ${form.id}: 표가 조각에는 ${expected}개인데 화면에는 ${source.tables}개입니다.`
      );
    }
    if (expected && source.cells < 4) {
      problems.push(`제${chapterId}편 ${form.id}: 표는 깔렸는데 칸이 ${source.cells}개뿐입니다.`);
    }
    if (!source.offscreen) {
      problems.push(`제${chapterId}편 ${form.id}: 붙여 넣기용 표가 화면 안에 보입니다.`);
    }

    // 여기가 핵심입니다. '복사'를 누르면 클립보드에 표가 실제로 담겨야 합니다.
    await page.click("[data-form-copy-text]");
    const copied = await page.evaluate(async () => {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes("text/html")) {
            return await (await item.getType("text/html")).text();
          }
        }
      } catch (error) {
        return "";
      }
      return "";
    });
    const pasted = (copied.match(/<table/g) || []).length;
    if (expected && pasted !== expected) {
      problems.push(
        `제${chapterId}편 ${form.id}: 복사한 것에 표가 ${pasted}개뿐입니다(조각에는 ${expected}개). 한글에 붙이면 줄글이 됩니다.`
      );
    }
    // 사람이 긁어서 Ctrl+C 한 것과 같은 길로 갔는지 봅니다.
    // 그 길로 가면 브라우저가 칸마다 실제 모양(font-family 등)을 적어 넣습니다.
    // 우리가 만든 글자를 그대로 클립보드에 얹으면 이 흔적이 없고,
    // 그때는 한글이 표를 못 알아보고 글자만 받아 갑니다.
    if (expected && !/<table[^>]*style="[^"]*font-family/.test(copied)) {
      problems.push(
        `제${chapterId}편 ${form.id}: 표를 브라우저가 아니라 글자로 얹었습니다. 한글이 표로 못 받습니다.`
      );
    }
  }

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
console.log(
  `form text copy valid: 서식 ${checked}개에서 글자를 긁어 복사하고 표째로 붙일 수 있습니다.`
);
