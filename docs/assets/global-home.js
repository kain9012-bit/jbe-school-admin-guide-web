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

  // 통합검색 색인에 들어 있는 업무 항목으로 분야별 업무 목록을 만듭니다.
  // 편별 원문 데이터를 따로 불러오지 않아도 됩니다.
  function worksOf(chapterId) {
    return searchIndex.filter(
      (item) => item.type === "업무" && item.chapterId === chapterId
    );
  }

  function workHref(item) {
    return `?chapter=${encodeURIComponent(item.chapterId)}#work=${encodeURIComponent(
      item.workId
    )}`;
  }

  function chapterCard(chapter) {
    const name = chapterName(chapter);
    if (!chapter.available) {
      return `
        <article class="global-chapter-card is-planned">
          <span class="global-chapter-number" aria-hidden="true">${chapter.number}</span>
          <span class="global-chapter-copy">
            <small>${escapeHtml(chapter.label)}</small>
            <strong>${escapeHtml(chapter.title)}</strong>
          </span>
          <span class="sr-only">${escapeHtml(`${name}은 아직 웹에서 볼 수 없습니다.`)}</span>
        </article>
      `;
    }

    const works = worksOf(chapter.id);
    const panelId = `chapter-works-${chapter.id}`;
    return `
      <div class="global-chapter-item" data-chapter-item="${escapeHtml(chapter.id)}">
        <button class="global-chapter-card is-available" type="button"
                aria-expanded="false" aria-controls="${panelId}"
                data-toggle-chapter="${escapeHtml(chapter.id)}">
          <span class="global-chapter-number" aria-hidden="true">${chapter.number}</span>
          <span class="global-chapter-copy">
            <small>${escapeHtml(chapter.label)}</small>
            <strong>${escapeHtml(chapter.title)}</strong>
            <span class="global-chapter-count">업무 ${works.length}개</span>
          </span>
          <span class="global-chapter-arrow" aria-hidden="true">⌄</span>
        </button>
        <div class="global-work-panel" id="${panelId}" hidden>
          <div class="global-work-panel-inner">
            <p class="global-work-lead">${escapeHtml(
              `${chapter.title}의 업무를 선택하면 처리 단계로 바로 이동합니다.`
            )}</p>
            <ul class="global-work-list">
              ${works
                .map(
                  (item, index) => `
                <li>
                  <a class="global-work-link" href="${escapeHtml(workHref(item))}">
                    <span class="global-work-number">${String(index + 1).padStart(2, "0")}</span>
                    <span class="global-work-copy">
                      <strong>${escapeHtml(item.title)}</strong>
                      <small>${escapeHtml(item.steps ? `세부 ${item.steps}단계` : "원문 보기")}</small>
                    </span>
                    <span class="global-work-arrow" aria-hidden="true">→</span>
                  </a>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  // 카드를 누르면 그 자리에서 업무 목록이 부드럽게 열리고 닫힙니다.
  function bindChapterToggles() {
    document.querySelectorAll("[data-toggle-chapter]").forEach((button) => {
      button.addEventListener("click", () => {
        const panel = byId(button.getAttribute("aria-controls"));
        if (!panel) return;
        const willOpen = button.getAttribute("aria-expanded") !== "true";

        // 한 번에 하나만 열어 화면이 길어지지 않게 합니다.
        document.querySelectorAll("[data-toggle-chapter]").forEach((other) => {
          if (other === button) return;
          const otherPanel = byId(other.getAttribute("aria-controls"));
          other.setAttribute("aria-expanded", "false");
          if (otherPanel) {
            otherPanel.hidden = true;
            otherPanel.classList.remove("is-open");
          }
        });

        button.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) {
          panel.hidden = false;
          requestAnimationFrame(() => panel.classList.add("is-open"));
        } else {
          panel.classList.remove("is-open");
          panel.hidden = true;
        }
      });
    });
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

    // 통합 홈은 이동 경로의 출발점이라 표시할 앞 단계가 없습니다.
    // '홈' 한 글자만 남는 빈 줄을 없앱니다.
    const breadcrumbWrap = document.querySelector(".krds-breadcrumb-wrap");
    if (breadcrumbWrap) breadcrumbWrap.hidden = true;
    byId("breadcrumb").innerHTML = "";
    document.querySelectorAll("[data-current-chapter]").forEach((target) => {
      target.textContent = "전체 업무";
    });
    document.querySelectorAll(".pdf-link").forEach((link) => {
      link.hidden = true;
    });
    // 통합 홈에는 분야 목록이 화면에 이미 펼쳐져 있으므로
    // 같은 일을 하는 상단의 분야 선택 버튼은 숨깁니다.
    document.querySelectorAll(".global-nav-item.chapter-select").forEach((button) => {
      button.hidden = true;
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

  // 찾는 자료 종류를 골라 결과를 좁힐 수 있게 합니다.
  // 예전에는 '업무' 단추가 매뉴얼 본문까지 함께 남겨 아무것도 걸러지지 않았습니다.
  const SEARCH_SCOPES = {
    all: { label: "전체", types: ["업무", "매뉴얼 원문", "FAQ 원문", "서식·예시 원문"] },
    manual: { label: "매뉴얼", types: ["업무", "매뉴얼 원문"] },
    faq: { label: "질문", types: ["FAQ 원문"] },
    form: { label: "서식", types: ["서식·예시 원문"] },
  };
  const SEARCH_KIND_LABELS = { work: "본문", faq: "질문", form: "서식" };
  let currentSearchScope = "all";

  function searchKindOf(item) {
    if (item.type === "FAQ 원문") return "faq";
    if (item.type === "서식·예시 원문") return "form";
    return "work";
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

  // 검색어가 나온 자리를 잘라 굵게 보여 줍니다.
  // 첫 줄만 보여 주면 '이 결과가 왜 나왔는지'를 알 수 없습니다.
  // 색인의 text는 맨 앞에 업무 이름을 달고 있습니다. 발췌에 그대로 쓰면
  // 항목마다 같은 업무 이름으로 시작해 읽기 어렵습니다.
  function bodyOf(item) {
    const lines = String(item.text || "").split("\n");
    return lines.length > 1 ? lines.slice(1).join(" ") : lines[0] || "";
  }

  function snippetMarkup(text, query) {
    return window.GUIDE_SEARCH.snippet(text, query, 150)
      .map((piece) =>
        piece.hit ? `<mark>${escapeHtml(piece.text)}</mark>` : escapeHtml(piece.text)
      )
      .join("");
  }

  function labelOf(item) {
    const chapter = config.chapters.find((candidate) => candidate.id === item.chapterId);
    return chapter ? chapterName(chapter) : item.chapterLabel;
  }

  function runSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      searchStatus.textContent =
        "업무명이나 궁금한 문장을 입력하고 검색을 누르세요.";
      searchResults.innerHTML = "";
      return;
    }
    const scope = SEARCH_SCOPES[currentSearchScope] || SEARCH_SCOPES.all;
    const found = window.GUIDE_SEARCH.search(searchIndex, trimmed, {
      types: scope.types,
      limit: 300,
    });
    // 업무별로 묶습니다. 묶지 않으면 한 업무의 세부 항목이 첫 화면을 다 차지합니다.
    const groups = window.GUIDE_SEARCH.groupByWork(found.results).slice(0, 20);

    const where = currentSearchScope === "all" ? "" : `${scope.label}에서 `;
    searchStatus.textContent = found.total
      ? `${where}‘${trimmed}’ 검색 결과 업무 ${groups.length}곳 · 원문 ${found.total}건`
      : `${where}‘${trimmed}’과 일치하는 원문을 찾지 못했습니다.`;

    if (!found.total) {
      searchResults.innerHTML = `<p class="empty-state">${
        currentSearchScope === "all"
          ? "원문에 그 말이 없습니다. 매뉴얼에 쓰인 다른 말로 찾아보세요."
          : `${scope.label}에는 없습니다. 전체로 바꿔 찾아보세요.`
      }</p>`;
      return;
    }

    searchResults.innerHTML = groups
      .map((group) => {
        const head = group.work;
        const kind = searchKindOf(head);
        // 묶음 머리글에는 그 업무가 무엇을 다루는지 적습니다.
        // 여기까지 발췌를 넣으면 바로 아래 항목과 똑같은 글이 두 번 나옵니다.
        // 적을 것이 없으면 줄을 빼야지, 업무 이름을 한 번 더 적으면 안 됩니다.
        const lead = head.description ? escapeHtml(head.description) : "";
        const inside = group.hits
          .filter((entry) => entry.item !== head)
          .slice(0, 4)
          .map(
            (entry) => `
              <a class="search-hit" href="${escapeHtml(resultHref(entry.item))}">
                <span class="search-hit-kind kind-${searchKindOf(entry.item)}">${escapeHtml(
                  SEARCH_KIND_LABELS[searchKindOf(entry.item)]
                )}</span>
                <span class="search-hit-title">${escapeHtml(
                  String(entry.item.title).replace(/^세부내용\s+/, "") || "본문"
                )}</span>
                <span class="search-hit-text">${snippetMarkup(bodyOf(entry.item), trimmed)}</span>
              </a>`
          )
          .join("");
        const more = group.hits.length > 5 ? group.hits.length - 5 : 0;
        return `
          <section class="search-group">
            <a class="search-result" href="${escapeHtml(resultHref(head))}">
              <div class="search-result-meta">
                <span class="search-result-kind kind-${kind}">${escapeHtml(
                  SEARCH_KIND_LABELS[kind]
                )}</span>
                <span>${escapeHtml(labelOf(head))}</span>
              </div>
              <h3>${escapeHtml(String(head.title).replace(/^세부내용\s+/, ""))}</h3>
              ${lead ? `<p>${lead}</p>` : ""}
            </a>
            ${inside ? `<div class="search-hits">${inside}</div>` : ""}
            ${more ? `<p class="search-more">이 업무 안에 ${more}곳 더 있습니다.</p>` : ""}
          </section>
        `;
      })
      .join("");
  }

  function bindSearchFilters() {
    const buttons = document.querySelectorAll("[data-search-scope]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        currentSearchScope = button.dataset.searchScope;
        buttons.forEach((other) => {
          const selected = other === button;
          other.classList.toggle("is-selected", selected);
          other.setAttribute("aria-pressed", String(selected));
        });
        runSearch(searchInput.value);
      });
    });
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
  bindChapterToggles();

  // 편만 지정한 주소로 들어온 경우 그 분야를 펼친 채로 보여 줍니다.
  const openChapterId = window.GUIDE_HOME_OPEN_CHAPTER;
  if (openChapterId) {
    const target = document.querySelector(
      `[data-toggle-chapter="${CSS.escape(openChapterId)}"]`
    );
    if (target) {
      target.click();
      requestAnimationFrame(() =>
        target.scrollIntoView({ block: "center", behavior: "instant" })
      );
    }
  }

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
  bindSearchFilters();
  // 결과는 검색 단추나 Enter를 눌렀을 때만 바꿉니다.
  // 치는 동안 바뀌면 읽는 중에 결과가 사라져 오히려 불편합니다.
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
