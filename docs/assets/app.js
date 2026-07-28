(function () {
  "use strict";

  const data = window.CHAPTER1_DATA;
  if (!data) {
    document.getElementById("work-grid").innerHTML =
      '<p class="empty-state">길라잡이 데이터를 불러오지 못했습니다.</p>';
    return;
  }

  const workGrid = document.getElementById("work-grid");
  const searchDialog = document.getElementById("search-dialog");
  const searchInput = document.getElementById("global-search");
  const searchResults = document.getElementById("search-results");
  const resultSummary = document.getElementById("result-summary");
  const detailDialog = document.getElementById("detail-dialog");
  const detailContent = document.getElementById("detail-content");

  const categoryTargets = {
    업무관리시스템: "k-edufine",
    "공문서 관리": "official-documents",
    "기록물 관리": "records",
    "신원조사·결격사유·범죄경력조회": "background-check",
    직무대리: "acting-duty",
  };

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
      .replace(/[·․･•()[\]{}"'“”‘’,.:/\\_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const relatedSectionForForm = (title) => {
    if (/공인|도보/.test(title)) return "official-seals";
    if (/직무대리/.test(title)) return "acting-duty";
    if (/이관|기록|문서고/.test(title)) return "records";
    if (/신원|범죄|행정정보|채용/.test(title)) return "background-check";
    if (/보호지역|출입통제/.test(title)) return "facility-security";
    return "official-documents";
  };

  const searchIndex = [
    ...data.sections.map((section) => ({
      id: section.id,
      type: "업무",
      title: section.title,
      description: section.summary,
      searchText: [
        section.title,
        section.summary,
        section.keywords.join(" "),
        section.highlights.join(" "),
        section.body,
      ].join(" "),
      targetSection: section.id,
    })),
    ...data.faqs.map((faq) => ({
      id: faq.id,
      type: "FAQ",
      title: faq.question,
      description: faq.answer,
      searchText: `${faq.category} ${faq.question} ${faq.answer}`,
      targetSection: categoryTargets[faq.category] || "official-documents",
      faqId: faq.id,
    })),
    ...data.forms.map((form) => ({
      id: form.id,
      type: "서식·예시",
      title: `${form.id} ${form.title}`,
      description: "제1편 서식 및 예시자료에서 내려받아 사용할 수 있습니다.",
      searchText: `${form.searchText} ${data.formsFullText}`,
      targetSection: relatedSectionForForm(form.title),
    })),
  ].map((item) => ({
    ...item,
    normalized: normalize(`${item.title} ${item.searchText}`),
    normalizedTitle: normalize(item.title),
  }));

  function renderWorkGrid() {
    workGrid.innerHTML = data.sections
      .map(
        (section) => `
          <button class="work-card" type="button" data-section="${escapeHtml(section.id)}">
            <span class="work-number">${section.number}</span>
            <h3>${escapeHtml(section.title)}</h3>
            <p>${escapeHtml(section.summary)}</p>
            <span class="work-meta">
              <span>원문 ${escapeHtml(section.printedPages)}쪽</span>
              <span>흐름 보기 →</span>
            </span>
          </button>
        `,
      )
      .join("");
  }

  function getExcerpt(text, tokens) {
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    const lower = normalize(compact);
    const firstToken = tokens.find((token) => lower.includes(token)) || tokens[0];
    const index = lower.indexOf(firstToken);
    const approximate = index < 0 ? 0 : Math.max(0, index - 42);
    const excerpt = compact.slice(approximate, approximate + 180);
    return `${approximate > 0 ? "…" : ""}${excerpt}${compact.length > approximate + 180 ? "…" : ""}`;
  }

  function highlight(text, rawQuery) {
    let output = escapeHtml(text);
    const terms = rawQuery
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 1)
      .slice(0, 5);
    terms.forEach((term) => {
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`(${safe})`, "gi"), "<mark>$1</mark>");
    });
    return output;
  }

  function performSearch(rawQuery) {
    const query = normalize(rawQuery);
    if (!query) {
      resultSummary.textContent = "검색어를 입력하면 관련 업무와 자료를 보여드립니다.";
      searchResults.innerHTML = "";
      return;
    }

    const tokens = query.split(" ").filter(Boolean);
    const results = searchIndex
      .filter((item) => tokens.every((token) => item.normalized.includes(token)))
      .map((item) => {
        let score = 0;
        tokens.forEach((token) => {
          if (item.normalizedTitle === token) score += 12;
          else if (item.normalizedTitle.startsWith(token)) score += 8;
          else if (item.normalizedTitle.includes(token)) score += 5;
          else score += 1;
        });
        if (item.type === "업무") score += 1;
        return { ...item, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);

    resultSummary.textContent = results.length
      ? `“${rawQuery.trim()}” 검색 결과 ${results.length}건`
      : `“${rawQuery.trim()}”과 일치하는 결과가 없습니다.`;

    searchResults.innerHTML = results.length
      ? results
          .map(
            (item) => `
              <button
                class="result-card"
                type="button"
                data-result-section="${escapeHtml(item.targetSection)}"
                ${item.faqId ? `data-result-faq="${escapeHtml(item.faqId)}"` : ""}
              >
                <span class="result-type">${escapeHtml(item.type)}</span>
                <h3>${highlight(item.title, rawQuery)}</h3>
                <p>${highlight(getExcerpt(item.description || item.searchText, tokens), rawQuery)}</p>
              </button>
            `,
          )
          .join("")
      : `
          <div class="empty-state">
            <strong>다른 표현으로 검색해 보세요</strong>
            <p>예: “도장 폐기” 대신 “공인 폐기”, “문서 보관” 대신 “기록물 보존”</p>
          </div>
        `;
  }

  function openSearch(initialQuery = "") {
    if (!searchDialog.open) searchDialog.showModal();
    searchInput.value = initialQuery;
    performSearch(initialQuery);
    window.setTimeout(() => searchInput.focus(), 30);
  }

  function closeSearch() {
    if (searchDialog.open) searchDialog.close();
  }

  function relatedFaqs(sectionId) {
    return data.faqs.filter(
      (faq) => (categoryTargets[faq.category] || "official-documents") === sectionId,
    );
  }

  function renderDetail(section, pendingFaqId) {
    const faqs = relatedFaqs(section.id);
    detailContent.innerHTML = `
      <div class="detail-article">
        <header class="detail-heading">
          <span class="work-number">${section.number}</span>
          <div>
            <p class="eyebrow">CHAPTER 01 · WORKFLOW</p>
            <h1 id="detail-title">${escapeHtml(section.title)}</h1>
            <p class="detail-summary">${escapeHtml(section.summary)}</p>
            <a class="source-chip" href="${data.downloads.manual}#page=${section.pdfPages[0]}" target="_blank">
              원문 ${escapeHtml(section.printedPages)}쪽에서 확인
            </a>
          </div>
        </header>

        <section class="detail-section">
          <h2>업무 처리 흐름</h2>
          ${section.flows
            .map(
              (flow) => `
                <div class="flow-group">
                  <h3 class="flow-title">${escapeHtml(flow.title)}</h3>
                  <div class="flow-steps" aria-label="${escapeHtml(flow.title)}">
                    ${flow.steps
                      .map(
                        (step, index) => `
                          <div class="flow-step">
                            <span class="sr-only">${index + 1}단계: </span>${escapeHtml(step)}
                          </div>
                        `,
                      )
                      .join("")}
                  </div>
                </div>
              `,
            )
            .join("")}
        </section>

        <section class="detail-section">
          <h2>먼저 확인할 내용</h2>
          <ul class="highlight-list">
            ${section.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>

        ${
          faqs.length
            ? `
              <section class="detail-section">
                <h2>관련 질의응답 <small>${faqs.length}건</small></h2>
                <ul class="related-faq">
                  ${faqs
                    .map(
                      (faq) => `
                        <li id="${escapeHtml(faq.id)}">
                          <button class="faq-button" type="button" aria-expanded="false" data-faq-toggle>
                            Q. ${escapeHtml(faq.question)}
                          </button>
                          <div class="faq-answer" hidden>${escapeHtml(faq.answer || "원문 FAQ에서 답변을 확인해 주세요.")}</div>
                        </li>
                      `,
                    )
                    .join("")}
                </ul>
              </section>
            `
            : ""
        }

        <section class="detail-section">
          <h2>매뉴얼 원문 텍스트</h2>
          <p>원문 표와 배치는 PDF를 함께 확인해 주세요.</p>
          <div class="manual-text">${escapeHtml(section.body)}</div>
        </section>

        <section class="detail-section">
          <h2>원본 자료 내려받기</h2>
          <div class="detail-downloads">
            <a href="${data.downloads.manual}">매뉴얼 PDF</a>
            <a href="${data.downloads.faq}">FAQ HWP</a>
            <a href="${data.downloads.forms}">서식·예시 HWPX</a>
          </div>
        </section>
      </div>
    `;

    detailContent.querySelectorAll("[data-faq-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const answer = button.nextElementSibling;
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        answer.hidden = expanded;
      });
    });

    if (pendingFaqId) {
      window.setTimeout(() => {
        const item = document.getElementById(pendingFaqId);
        if (!item) return;
        const button = item.querySelector("[data-faq-toggle]");
        if (button) button.click();
        item.scrollIntoView({ block: "center" });
      }, 80);
    }
  }

  function openDetail(sectionId, pendingFaqId = "") {
    const section = data.sections.find((item) => item.id === sectionId);
    if (!section) return;
    renderDetail(section, pendingFaqId);
    if (!detailDialog.open) detailDialog.showModal();
    history.replaceState(null, "", `#work=${encodeURIComponent(sectionId)}`);
    detailDialog.querySelector("[data-close-detail]").focus();
  }

  function closeDetail() {
    if (detailDialog.open) detailDialog.close();
    if (location.hash.startsWith("#work=")) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
  }

  renderWorkGrid();
  document.getElementById("official-board-link").href = data.meta.officialBoardUrl;

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-search]");
    if (openButton) openSearch();

    const closeButton = event.target.closest("[data-close-search]");
    if (closeButton) closeSearch();

    const exampleButton = event.target.closest("[data-search-example]");
    if (exampleButton) openSearch(exampleButton.dataset.searchExample);

    const queryButton = event.target.closest("[data-query]");
    if (queryButton) {
      searchInput.value = queryButton.dataset.query;
      performSearch(queryButton.dataset.query);
      searchInput.focus();
    }

    const workButton = event.target.closest("[data-section]");
    if (workButton) openDetail(workButton.dataset.section);

    const resultButton = event.target.closest("[data-result-section]");
    if (resultButton) {
      const sectionId = resultButton.dataset.resultSection;
      const faqId = resultButton.dataset.resultFaq || "";
      closeSearch();
      openDetail(sectionId, faqId);
    }

    const closeDetailButton = event.target.closest("[data-close-detail]");
    if (closeDetailButton) closeDetail();
  });

  searchInput.addEventListener("input", () => performSearch(searchInput.value));
  searchInput.form.addEventListener("reset", () => {
    window.setTimeout(() => performSearch(""), 0);
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable;
    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      openSearch();
    }
  });

  detailDialog.addEventListener("close", () => {
    if (location.hash.startsWith("#work=")) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
  });

  const initialMatch = location.hash.match(/^#work=([^&]+)/);
  if (initialMatch) {
    openDetail(decodeURIComponent(initialMatch[1]));
  }
})();
