(function () {
  "use strict";

  const data = window.CHAPTER1_DATA;
  const activeChapter =
    window.ACTIVE_GUIDE_CHAPTER || { id: "01", label: "제1편", title: "행정업무 및 보안" };
  const globalSearchIndex = Array.isArray(window.GUIDE_SEARCH_INDEX)
    ? window.GUIDE_SEARCH_INDEX
    : [];

  const byId = (id) => document.getElementById(id);
  const overviewView = byId("overview-view");
  const workView = byId("work-view");
  const workGrid = byId("work-grid");
  const sideWorkList = byId("side-work-list");
  const breadcrumb = byId("breadcrumb");
  const searchDialog = byId("search-dialog");
  const searchInput = byId("search-input");
  const searchResults = byId("search-results");
  const searchStatus = byId("search-status");
  const mobileWorkMenu = byId("mobile-work-menu");
  const sideNavigation = byId("side-navigation");

  let currentWorkId = "";
  let lastFocusedElement = null;

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const normalize = (value) =>
    String(value ?? "")
      .toLocaleLowerCase("ko-KR")
      .replace(/\s+/g, " ")
      .trim();

  const chapterName = (chapter = activeChapter) =>
    [chapter.label, chapter.title].filter(Boolean).join(" ");

  const routeFor = ({ workId, page, formId, faqNumber } = {}) => {
    if (!workId) return "#overview";
    const params = new URLSearchParams({ work: workId });
    if (page) params.set("page", page);
    if (formId) params.set("form", formId);
    if (faqNumber) params.set("faq", faqNumber);
    return `#${params.toString()}`;
  };

  function searchHref(item) {
    const hash = routeFor({
      workId: item.workId,
      page: item.page,
      formId: item.formId,
      faqNumber: item.faqNumber,
    });
    if (!item.chapterId || item.chapterId === activeChapter.id) return hash;
    return `?chapter=${encodeURIComponent(item.chapterId)}${hash}`;
  }

  function renderSearchExamples() {
    const examples = data.meta.searchExamples || [];
    byId("quick-keywords").innerHTML = `
      <span>추천</span>
      ${examples
        .map(
          (query) =>
            `<button type="button" data-query="${escapeHtml(query)}">${escapeHtml(query)}</button>`
        )
        .join("")}
    `;
    byId("hero-search-input").placeholder = examples.length
      ? `예: ${examples.join(", ")}`
      : "업무, 질문, 서식을 검색하세요";
  }

  function flowMarkup(flowGroups) {
    if (!flowGroups.length) {
      return '<p class="source-only-note">이 항목은 원문에 별도 업무 흐름도가 없습니다. 아래 매뉴얼 원문을 항목 순서대로 제공합니다.</p>';
    }
    return flowGroups
      .map(
        (group) => `
          <div class="faithful-flow-group">
            <strong>${escapeHtml(group.label)}</strong>
            <ol>
              ${group.steps
                .map(
                  (step, index) => `
                    <li>
                      <span class="flow-number">${index + 1}</span>
                      <span>${escapeHtml(step)}</span>
                    </li>
                  `
                )
                .join("")}
            </ol>
          </div>
        `
      )
      .join("");
  }

  function renderOverview() {
    workGrid.innerHTML = data.sections
      .map((work) => {
        const flowSteps = work.flowGroups.flatMap((group) => group.steps);
        const preview = flowSteps.length
          ? `<div class="work-card-flow">${flowSteps
              .slice(0, 4)
              .map((step) => `<span>${escapeHtml(step)}</span>`)
              .join("")}</div>`
          : '<p class="work-card-source-note">원문 항목별 내용 보기</p>';
        return `
          <a class="structured-item work-card" href="${routeFor({ workId: work.id })}">
            <div class="work-card-top">
              <span class="work-card-number">업무 ${String(work.number).padStart(2, "0")}</span>
              <span class="work-card-pages">원문 ${escapeHtml(work.printedPages)}쪽</span>
            </div>
            <h3>${escapeHtml(work.title)}</h3>
            ${preview}
            <span class="work-card-link"><span>원문 전체 보기</span><span aria-hidden="true">→</span></span>
          </a>
        `;
      })
      .join("");
  }

  function renderSideNavigation() {
    sideWorkList.innerHTML = data.sections
      .map(
        (work) => `
          <li class="lnb-item">
            <a class="lnb-btn${work.id === currentWorkId ? " active" : ""}"
               href="${routeFor({ workId: work.id })}"
               ${work.id === currentWorkId ? 'aria-current="page"' : ""}>
              <span class="side-number">${String(work.number).padStart(2, "0")}</span>
              <span>${escapeHtml(work.title)}</span>
            </a>
          </li>
        `
      )
      .join("");
  }

  function renderSourcePages(work) {
    byId("source-pages").innerHTML = work.sourcePages
      .map(
        (page) => `
          <article class="source-page-card" id="source-page-${page.pdfPage}">
            <header>
              <div>
                <span class="krds-badge bg-light-primary">매뉴얼 ${page.printedPage}쪽</span>
                <span>PDF ${page.pdfPage}쪽</span>
              </div>
              <a class="krds-btn small tertiary" href="${escapeHtml(
                data.downloads.manual
              )}#page=${page.pdfPage}" target="_blank" rel="noopener">원문 PDF 페이지</a>
            </header>
            <div class="source-page-text">${escapeHtml(page.text)}</div>
          </article>
        `
      )
      .join("");
  }

  function renderForms(work, requestedFormId = "") {
    const section = byId("forms-section");
    const forms = work.formIds
      .map((formId) => data.forms.find((form) => form.id === formId))
      .filter(Boolean);
    section.hidden = forms.length === 0;
    if (!forms.length) return;

    byId("related-forms").innerHTML = forms
      .map((form) => {
        const open = form.id === requestedFormId;
        return `
          <details class="source-form" id="form-${escapeHtml(form.id)}"${open ? " open" : ""}>
            <summary>
              <span><strong>${escapeHtml(form.id)}</strong> ${escapeHtml(form.title)}</span>
              <span>원문 보기</span>
            </summary>
            <div class="source-form-body">
              <p class="source-form-notice">아래 내용은 교육청이 제공한 통합 HWPX에서 추출한 해당 항목의 원문입니다.</p>
              <div class="source-page-text">${escapeHtml(form.content)}</div>
              <a class="krds-btn tertiary" href="${escapeHtml(
                data.downloads.forms
              )}" download>전체 서식·예시 원본 HWPX</a>
            </div>
          </details>
        `;
      })
      .join("");
  }

  function renderFaqs(work, requestedFaqNumber = "") {
    const section = byId("faq-section");
    const faqs = data.faqs.filter((faq) => work.faqCategories.includes(faq.category));
    section.hidden = faqs.length === 0;
    if (!faqs.length) return;

    byId("related-faqs").innerHTML = faqs
      .map((faq) => {
        const open = String(faq.number) === String(requestedFaqNumber);
        return `
          <details class="source-faq" id="faq-${faq.number}"${open ? " open" : ""}>
            <summary><span>Q${faq.number}.</span> ${escapeHtml(faq.question)}</summary>
            <div class="source-page-text">${escapeHtml(faq.answer)}</div>
          </details>
        `;
      })
      .join("");
  }

  function renderWork(workId, options = {}) {
    const work = data.sections.find((item) => item.id === workId);
    if (!work) {
      location.hash = "#overview";
      return;
    }

    currentWorkId = workId;
    overviewView.hidden = true;
    workView.hidden = false;
    renderSideNavigation();

    byId("work-number").textContent = `업무 ${String(work.number).padStart(2, "0")}`;
    byId("work-pages").textContent = `원문 ${work.printedPages}쪽`;
    byId("work-title").textContent = work.title;
    byId("work-source-policy").textContent = "매뉴얼 원문 전체를 페이지 순서대로 제공합니다.";
    byId("source-workflow").innerHTML = flowMarkup(work.flowGroups);
    renderSourcePages(work);
    renderForms(work, options.formId);
    renderFaqs(work, options.faqNumber);

    breadcrumb.innerHTML = `
      <li class="home"><a href="#overview">홈</a></li>
      <li><a href="#overview">${escapeHtml(chapterName())}</a></li>
      <li><span>${escapeHtml(work.title)}</span></li>
    `;
    document.title = `${work.title} | 학교행정업무 길라잡이`;

    requestAnimationFrame(() => {
      const target = options.formId
        ? byId(`form-${options.formId}`)
        : options.faqNumber
          ? byId(`faq-${options.faqNumber}`)
          : options.page
            ? byId(`source-page-${options.page}`)
            : null;
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "instant" });
    });
  }

  function renderRoute() {
    const raw = location.hash.replace(/^#/, "");
    if (!raw || raw === "overview" || raw === "downloads") {
      currentWorkId = "";
      workView.hidden = true;
      overviewView.hidden = false;
      breadcrumb.innerHTML = `
        <li class="home"><a href="#overview">홈</a></li>
        <li><span>${escapeHtml(chapterName())}</span></li>
      `;
      document.title = `학교행정업무 길라잡이 웹판 | ${chapterName()}`;
      if (raw === "downloads") {
        requestAnimationFrame(() => byId("downloads").scrollIntoView({ behavior: "smooth" }));
      }
      return;
    }

    const params = new URLSearchParams(raw);
    renderWork(params.get("work"), {
      page: params.get("page") || "",
      formId: params.get("form") || "",
      faqNumber: params.get("faq") || "",
    });
  }

  function scoreResult(item, query) {
    const source = normalize(item.text);
    const title = normalize(item.title);
    const terms = normalize(query).split(" ").filter(Boolean);
    if (!terms.length || !terms.every((term) => source.includes(term))) return 0;
    return terms.reduce((score, term) => score + (title.includes(term) ? 10 : 2), 0);
  }

  function runSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      searchStatus.textContent = "공개된 모든 편의 매뉴얼·FAQ·서식 원문을 검색합니다.";
      searchResults.innerHTML = "";
      return;
    }
    const results = globalSearchIndex
      .map((item) => ({ item, score: scoreResult(item, trimmed) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "ko"))
      .slice(0, 40);

    searchStatus.textContent = results.length
      ? `전체 편 ‘${trimmed}’ 검색 결과 ${results.length}건`
      : `‘${trimmed}’과 일치하는 원문이 없습니다.`;
    searchResults.innerHTML = results.length
      ? results
          .map(
            ({ item }) => `
              <a class="search-result" href="${escapeHtml(searchHref(item))}">
                <div class="search-result-meta">
                  <span>${escapeHtml(item.chapterLabel)} ${escapeHtml(item.chapterTitle)}</span>
                  <span aria-hidden="true">·</span>
                  <span>${escapeHtml(item.type)}</span>
                </div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.description)}</p>
              </a>
            `
          )
          .join("")
      : '<p class="empty-state">단어를 줄이거나 원문에 사용된 다른 표현으로 검색해 보세요.</p>';
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
    if (typeof searchDialog.close === "function" && searchDialog.open) searchDialog.close();
    else searchDialog.removeAttribute("open");
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  }

  document.querySelectorAll("[data-open-search]").forEach((button) => {
    button.addEventListener("click", () => openSearch());
  });
  document.querySelectorAll("[data-close-search]").forEach((button) => {
    button.addEventListener("click", closeSearch);
  });
  byId("hero-search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    openSearch(byId("hero-search-input").value);
  });
  byId("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch(searchInput.value);
  });
  searchInput.addEventListener("input", () => runSearch(searchInput.value));
  searchDialog.addEventListener("click", (event) => {
    if (event.target === searchDialog) closeSearch();
  });
  searchResults.addEventListener("click", (event) => {
    if (event.target.closest(".search-result")) closeSearch();
  });
  byId("quick-keywords").addEventListener("click", (event) => {
    const button = event.target.closest("[data-query]");
    if (button) openSearch(button.dataset.query);
  });
  mobileWorkMenu.addEventListener("click", () => {
    const expanded = mobileWorkMenu.getAttribute("aria-expanded") === "true";
    mobileWorkMenu.setAttribute("aria-expanded", String(!expanded));
    sideNavigation.classList.toggle("mobile-open", !expanded);
  });
  window.addEventListener("hashchange", renderRoute);

  renderSearchExamples();
  renderOverview();
  renderRoute();
})();
