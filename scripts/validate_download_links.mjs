// 화면에 보이는 내려받기·원문 단추가 실제로 열리는지 19편 모두 확인합니다.
//
// '원문 PDF'를 누르면 404가 나던 일이 있었습니다. PDF는 제1·3편에만 있는데
// 단추 주소를 편마다 갈아 끼우면서, 없는 편에서는 주소가 'undefined'가 되었습니다.
// 화면에는 단추가 멀쩡히 보이니 편을 하나씩 눌러 보지 않으면 알 수 없습니다.
//
// 규칙은 둘입니다.
//   1. 보이는 단추는 반드시 열려야 한다 (200)
//   2. 그 편에 없는 자료의 단추는 보이지 않아야 한다
//
// 사용법: node scripts/validate_download_links.mjs

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

let base = process.argv.find((value) => value.startsWith("http")) || "http://127.0.0.1:8899";
let server = null;
if (!(await alive(base))) {
  const { spawn } = await import("node:child_process");
  const port = 8876;
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
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

for (const { id: chapterId, key } of chapterKeys(window)) {
  const data = window[key];
  const firstWork = data.sections[0];
  if (!firstWork) continue;

  // 업무 화면과 '자료 내려받기' 화면에 있는 단추가 서로 다릅니다. 둘 다 봅니다.
  await page.goto(`${base}/index.html?chapter=${chapterId}#work=${firstWork.id}`, {
    waitUntil: "load",
  });
  await page.waitForTimeout(500);
  const workLinks = await collect();
  await page.evaluate(() => {
    location.hash = "downloads";
  });
  await page.waitForTimeout(500);
  const links = [...workLinks, ...(await collect())];

  async function collect() {
    return page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .filter((node) => /downloads\/|undefined/.test(node.getAttribute("href") || ""))
      .map((node) => ({
        href: node.getAttribute("href"),
        text: (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 22),
        // hidden 속성이나 CSS로 감춘 것 모두 '안 보이는 것'으로 봅니다.
        hidden: node.hidden || node.offsetParent === null,
      }))
    );
  }

  const seen = new Set();
  for (const link of links) {
    if (link.hidden) continue;
    const token = `${link.href}|${link.text}`;
    if (seen.has(token)) continue;
    seen.add(token);
    checked += 1;

    if (!link.href || /undefined/.test(link.href)) {
      problems.push(`제${chapterId}편 '${link.text}' 단추의 주소가 비어 있습니다 (${link.href}).`);
      continue;
    }
    const answer = await fetch(`${base}/${encodeURI(link.href.replace(/^\.?\//, ""))}`, {
      method: "HEAD",
    }).catch(() => null);
    if (!answer || !answer.ok) {
      problems.push(
        `제${chapterId}편 '${link.text}' 단추가 열리지 않습니다 (${answer ? answer.status : "연결 실패"}): ${link.href}`
      );
    }
  }
}

await browser.close();
if (server) server.kill();

if (problems.length) {
  console.error("내려받기 단추가 열리지 않습니다:");
  problems.slice(0, 20).forEach((line) => console.error(` - ${line}`));
  if (problems.length > 20) console.error(` … 외 ${problems.length - 20}건`);
  process.exit(1);
}

console.log(`download links valid: 19편에서 보이는 단추 ${checked}개 모두 열림`);
