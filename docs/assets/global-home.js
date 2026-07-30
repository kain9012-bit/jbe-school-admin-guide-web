(function () {
  "use strict";

  const config = window.GUIDE_CONFIG;
  const searchIndex = Array.isArray(window.GUIDE_SEARCH_INDEX)
    ? window.GUIDE_SEARCH_INDEX
    : [];
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const normalize = (value) =>
    String(value ?? "").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();

  const overviewView = byId("overview-view");
  const workView = byId("work-view");
  const searchDialog = byId("search-dialog");
  const searchInput = byId("search-input");
  const searchResults = byId("search-results");
  const searchStatus = byId("search-status");
  let lastFocusedElement = null;

  function chapterName(chapter) {
    return `${chapter.label} ${chapter.title}`.trim();
  }

  function chapterCard(chapter) {
    const name = chapterName(chapter);
    if (chapter.available) {
      return `
        <a class="global-chapter-card is-available"
           href="?chapter=${encodeURIComponent(chapter.id)}#overview">
          <span class="global-chapter-number">${chapter.number}</span>
          <span class="global-chapter-copy">
            <small>${escapeHtml(chapter.label)}</small>
            <strong>${escapeHtml(chapter.title)}</strong>
            <span class="chapter-state available">웹판 이용 가능</span>
          </span>
          <span class="global-chapter-arrow" aria-hidden="true">→</span>
        </a>
      `;
    }
    return `
      <article class="global-chapter-card is-planned" aria-label="${escapeHtml(
        `${name}, 웹판 준비 중`
      )}">
        <span class="global-chapter-number">${chapter.number}</span>
        <span class="global-chapter-copy">
          <small>${escapeHtml(chapter.label)}</small>
          <strong>${escapeHtml(chapter.title)}</strong>
          <span class="chapter-state planned">웹판 준비 중</span>
        </span>
      </article>
    `;
  }

  function renderGlobalHome() {
    const available = config.chapters.filter((chapter) => chapter.available);
    document.body.classList.add("global-home-mode");
    workView.hidden = true;
    overviewView.hidden = false;
    overviewView.innerHTML = `
      <div class="guide-hero global-home-hero">
        <div class="inner">
          <div class="hero-copy">
            <span class="krds-badge bg-light-primary">학교행정업무 길라잡이</span>
            <h1>학교행정업무를<br />한곳에서 찾고 확인하세요</h1>
            <p>
              어느 분야인지 몰라도 괜찮습니다. 궁금한 업무나 문장을 그대로 검색하면
              해당 업무의 처리 순서와 세부 기준으로 바로 이어집니다.
            </p>
            <form class="hero-search" id="global-hero-search-form" role="search">
              <label class="sr-only" for="global-hero-search-input">
                업무, 질문, 서식 검색
              </label>
              <input id="global-hero-search-input" class="krds-input" type="search"
                     placeholder="찾는 업무를 자연스럽게 입력하세요"
                     autocomplete="off" />
              <button class="krds-btn primary" type="submit">통합검색</button>
            </form>
            <div class="quick-keywords global-quick-keywords" aria-label="추천 검색어">
              <span>추천</span>
              <button type="button" data-global-query="공문서">공문서</button>
              <button type="button" data-global-query="신원조사">신원조사</button>
              <button type="button" data-global-query="휴직">휴직</button>
              <button type="button" data-global-query="인사교류">인사교류</button>
            </div>
          </div>
          <aside class="hero-guide global-usage-guide" aria-label="이용 방법">
            <p class="guide-kicker">이용 방법</p>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>궁금한 내용 검색</strong>
                  <p>업무·질문·서식을 한 번에 찾습니다.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>업무 분야 선택</strong>
                  <p>찾는 분야를 골라 해당 업무의 흐름으로 이동합니다.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>처리 단계 확인</strong>
                  <p>세부 기준·서식·FAQ·근거를 단계 안에서 함께 봅니다.</p>
                </div>
              </li>
            </ol>
          </aside>
        </div>
      </div>

      <div class="content-container global-overview-content">
        <section id="chapters" class="global-chapter-section" aria-labelledby="chapter-overview-title">
          <div class="section-title-row">
            <div>
              <p class="section-kicker">업무 분야</p>
              <h2 id="chapter-overview-title">찾는 업무 분야를 선택하세요</h2>
            </div>
            <p>
              현재 ${available.length}개 분야를 웹에서 볼 수 있으며,
              나머지도 같은 구조로 순차 공개됩니다.
            </p>
          </div>
          <div class="global-chapter-grid">
            ${config.chapters.map(chapterCard).join("")}
          </div>
        </section>

        <section id="downloads" class="global-source-section" aria-labelledby="global-source-title">
          <div>
            <p class="section-kicker">공식 원문</p>
            <h2 id="global-source-title">원본 자료도 확인하세요</h2>
            <p>
              웹판은 빠른 탐색을 위한 서비스입니다. 최종 판단에는 교육청이 제공하는
              최신 매뉴얼·FAQ·서식을 확인하세요.
            </p>
          </div>
          <a class="krds-btn secondary" href="${escapeHtml(
            config.officialBoardUrl
          )}" target="_blank" rel="noopener">
            교육청 전체 원문 목록
          </a>
        </section>
      </div>
    `;

    byId("breadcrumb").innerHTML =
      '<li class="home"><span aria-current="page">홈</span></li>';
    document.querySelectorAll("[data-current-chapter]").forEach((target) => {
      target.textContent = "전체 업무";
    });
    document.querySelectorAll(".pdf-link").forEach((link) => {
      link.hidden = true;
    });
    const desktopChapterLink = document.querySelector(
      '.global-nav > a.global-nav-item[href="#overview"]'
    );
    if (desktopChapterLink) {
      desktopChapterLink.href = "#chapters";
      desktopChapterLink.textContent = "업무 분야";
    }
    const mobileChapterLink = document.querySelector(
      '.mobile-global-nav a.global-nav-item[href="#overview"]'
    );
    if (mobileChapterLink) {
      mobileChapterLink.href = "#chapters";
      const label = mobileChapterLink.querySelector("span");
      if (label) label.textContent = "업무 분야";
    }
    document.querySelector(".guide-footer strong").textContent =
      "학교행정업무 길라잡이 웹판";
    const footerContext = document.querySelector(".guide-footer [data-current-chapter]");
    if (footerContext) footerContext.textContent = "전체 업무";
    document.title = "학교행정업무 길라잡이 웹판";
  }

  function resultHref(item) {
    const chapterId = item.chapterId || config.defaultChapter;
    const params = new URLSearchParams();
    if (item.workId) params.set("work", item.workId);
    if (item.blockId) params.set("block", item.blockId);
    if (item.formId) params.set("form", item.formId);
    if (item.faqNumber) params.set("faq", item.faqNumber);
    const hash = params.toString() ? `#${params.toString()}` : "#overview";
    return `?chapter=${encodeURIComponent(chapterId)}${hash}`;
  }

  function scoreResult(item, query) {
    const terms = normalize(query).split(" ").filter(Boolean);
    const source = normalize(item.text);
    if (!terms.length || !terms.every((term) => source.includes(term))) return 0;
    const title = normalize(item.title);
    return terms.reduce(
      (score, term) => score + (title.includes(term) ? 10 : 2),
      0
    );
  }

  function runSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      searchStatus.textContent =
        "학교행정업무 전체에서 업무·단계·질문·서식 원문을 검색합니다.";
      searchResults.innerHTML = "";
      return;
    }
    const results = searchIndex
      .map((item) => ({ item, score: scoreResult(item, trimmed) }))
      .filter((result) => result.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.item.title.localeCompare(b.item.title, "ko")
      )
      .slice(0, 30);

    searchStatus.textContent = results.length
      ? `‘${trimmed}’ 검색 결과 ${results.length}건`
      : `‘${trimmed}’과 일치하는 원문을 찾지 못했습니다.`;
    searchResults.innerHTML = results.length
      ? results
          .map(({ item }) => {
            const chapter = config.chapters.find(
              (candidate) => candidate.id === item.chapterId
            );
            return `
              <a class="search-result" href="${escapeHtml(resultHref(item))}">
                <div class="search-result-meta">
                  <span>${escapeHtml(chapter ? chapterName(chapter) : item.chapterLabel)}</span>
                  <span aria-hidden="true">·</span>
                  <span>${escapeHtml(item.type)}</span>
                </div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.description)}</p>
              </a>
            `;
          })
          .join("")
      : '<p class="empty-state">다른 업무명이나 문장으로 검색해 보세요.</p>';
  }

  function openSearch(query = "") {
    lastFocusedElement = document.activeElement;
    if (typeof searchDialog.showModal === "function") searchDialog.showModal();
    else searchDialog.setAttribute("open", "");
    searchInput.value = query;
    runSearch(query);
    requestAnimationFrame(() => searchInput.focus());
  }

  function closeSearch() {
    if (typeof searchDialog.close === "function" && searchDialog.open) {
      searchDialog.close();
    } else {
      searchDialog.removeAttribute("open");
    }
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  }

  renderGlobalHome();

  document.querySelectorAll("[data-open-search]").forEach((button) => {
    button.addEventListener("click", () => openSearch());
  });
  document.querySelectorAll("[data-close-search]").forEach((button) => {
    button.addEventListener("click", closeSearch);
  });
  byId("global-hero-search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    openSearch(byId("global-hero-search-input").value);
  });
  byId("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch(searchInput.value);
  });
  searchInput.addEventListener("input", () => runSearch(searchInput.value));
  // 검색 입력칸에서 Esc를 누르면 브라우저가 입력값만 지우고 이벤트를 멈추므로
  // 대화상자를 직접 닫아 줍니다.
  searchDialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  });
  searchDialog.addEventListener("close", () => {
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  });
  searchResults.addEventListener("click", (event) => {
    if (event.target.closest(".search-result")) closeSearch();
  });
  document.querySelector(".global-quick-keywords").addEventListener("click", (event) => {
    const button = event.target.closest("[data-global-query]");
    if (button) openSearch(button.dataset.globalQuery);
  });

  if (location.hash === "#chapters" || location.hash === "#downloads") {
    requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
  }
})();
