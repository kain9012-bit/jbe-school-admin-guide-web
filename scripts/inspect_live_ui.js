// 실제 브라우저로 화면을 열어 콘솔 오류, 실패한 요청, 주요 요소를 점검합니다.
// 사용법: node scripts/inspect_live_ui.js [기준주소]
// 기준주소를 생략하면 http://127.0.0.1:8899 를 사용합니다.

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const base = process.argv[2] || "http://127.0.0.1:8899";
const shotDir = path.resolve(__dirname, "../tmp/live-ui");
fs.mkdirSync(shotDir, { recursive: true });

const problems = [];
const report = [];

function note(line) {
  report.push(line);
  console.log(line);
}

function attach(page, label) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      problems.push(`[${label}] 콘솔 오류: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    problems.push(`[${label}] 스크립트 예외: ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    problems.push(`[${label}] 요청 실패: ${req.url()} (${req.failure()?.errorText})`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      problems.push(`[${label}] 응답 오류 ${res.status()}: ${res.url()}`);
    }
  });
}

async function open(context, label, url) {
  const page = await context.newPage();
  attach(page, label);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(900);
  return page;
}

async function shoot(page, name) {
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
}

async function main() {
  const browser = await chromium.launch({ channel: "chromium" });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  // 1. 통합 홈 (편 미지정)
  {
    const page = await open(desktop, "통합홈", `${base}/index.html`);
    const cards = await page.locator(".global-chapter-card").count();
    const available = await page.locator(".global-chapter-card.is-available").count();
    const heroInput = await page.locator("#global-hero-search-input").count();
    note(`통합 홈: 편 카드 ${cards}개, 이용 가능 ${available}개, 히어로 검색창 ${heroInput}개`);
    if (cards !== 19) problems.push(`통합 홈 편 카드가 ${cards}개입니다 (19개여야 함).`);
    if (available !== 2) problems.push(`이용 가능 편이 ${available}개입니다 (2개여야 함).`);
    if (heroInput !== 1) problems.push("통합 홈 히어로 검색창을 찾지 못했습니다.");

    // 히어로 검색 동작
    if (heroInput === 1) {
      await page.fill("#global-hero-search-input", "기록물 이관");
      await page.press("#global-hero-search-input", "Enter");
      await page.waitForTimeout(800);
      const results = await page.locator("#search-results li, #search-results .search-result").count();
      note(`통합 홈 검색 '기록물 이관': 결과 ${results}건`);
      if (results === 0) problems.push("통합 홈 검색에서 '기록물 이관' 결과가 없습니다.");
      await shoot(page, "01-global-home-search");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    await shoot(page, "00-global-home");
    await page.close();
  }

  // 2. 편별 개요와 업무 상세
  for (const chapter of ["01", "03"]) {
    const page = await open(desktop, `제${chapter}편 개요`, `${base}/index.html?chapter=${chapter}#overview`);
    const workCards = await page.locator("a.work-card").count();
    const title = (await page.locator("h1").first().textContent().catch(() => "")) || "";
    note(`제${chapter}편 개요: 업무 카드 ${workCards}개, 제목 "${title.trim().slice(0, 40)}"`);
    if (workCards === 0) problems.push(`제${chapter}편 개요에 업무 카드가 없습니다.`);
    await shoot(page, `10-chapter${chapter}-overview`);

    const firstHref =
      workCards > 0
        ? await page.locator("a.work-card").first().getAttribute("href")
        : null;
    const firstWork = firstHref ? firstHref.split("#work=")[1] : null;
    if (firstWork) {
      const detail = await open(
        desktop,
        `제${chapter}편 ${firstWork}`,
        `${base}/index.html?chapter=${chapter}#work=${firstWork}`
      );
      const blocks = await detail.locator("[data-step-id], .step-card, .detail-block").count();
      const tables = await detail.locator("table").count();
      const faq = await detail.locator("details, .krds-accordion").count();
      note(
        `제${chapter}편 첫 업무(${firstWork}): 본문 블록 ${blocks}개, 표 ${tables}개, 아코디언 ${faq}개`
      );
      if (blocks === 0) problems.push(`제${chapter}편 ${firstWork} 상세에 본문 블록이 없습니다.`);

      // 가로 넘침 검사
      const overflow = await detail.evaluate(() => {
        const bad = [];
        document.querySelectorAll("main *").forEach((el) => {
          // 단계 표시줄의 연결선은 의도적으로 옆 칸까지 이어지므로 제외합니다.
          if (el.closest(".guide-stepper")) return;
          if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0) {
            const style = getComputedStyle(el);
            if (style.overflowX === "visible") {
              bad.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80));
            }
          }
        });
        return bad.slice(0, 5);
      });
      if (overflow.length) {
        problems.push(`제${chapter}편 ${firstWork}: 가로 넘침 요소 ${overflow.join(" | ")}`);
      }
      await shoot(detail, `11-chapter${chapter}-${firstWork}`);
      await detail.close();
    }
    await page.close();
  }

  // 3. 내려받기 링크
  {
    const page = await open(desktop, "내려받기", `${base}/index.html?chapter=01#downloads`);
    const links = await page.locator('a[href*="downloads/"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute("href"))
    );
    const unique = [...new Set(links)];
    note(`내려받기 링크 ${unique.length}종`);
    for (const href of unique) {
      const res = await page.request.get(new URL(href, `${base}/index.html`).toString());
      if (!res.ok()) problems.push(`내려받기 링크 응답 ${res.status()}: ${href}`);
    }
    await page.close();
  }

  // 4. 모바일 화면
  {
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await open(mobile, "모바일", `${base}/index.html?chapter=03#overview`);
    const hOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    note(`모바일(390px) 가로 스크롤 초과폭: ${hOverflow}px`);
    if (hOverflow > 2) problems.push(`모바일에서 가로 스크롤이 ${hOverflow}px 발생합니다.`);
    await shoot(page, "20-mobile-chapter03");
    await page.close();
    await mobile.close();
  }

  await desktop.close();
  await browser.close();

  console.log("\n===== 점검 결과 =====");
  if (problems.length === 0) {
    console.log("문제 없음");
  } else {
    problems.forEach((p, i) => console.log(`${i + 1}. ${p}`));
  }
  console.log(`\n화면 캡처: ${shotDir}`);
  fs.writeFileSync(
    path.join(shotDir, "report.txt"),
    report.join("\n") + "\n\n문제:\n" + problems.join("\n"),
    "utf8"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
