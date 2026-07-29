(function () {
  "use strict";

  const data = window.CHAPTER1_DATA;
  const stepData = window.CHAPTER1_STEPS;
  const activeChapter = window.ACTIVE_GUIDE_CHAPTER || { id: "01", label: "제1편", title: "행정업무 및 보안" };
  const allChapterSearchIndex = Array.isArray(window.GUIDE_SEARCH_INDEX) ? window.GUIDE_SEARCH_INDEX : [];


  if (!data || !stepData) {
    document.body.innerHTML = "<p>안내서 데이터를 불러오지 못했습니다.</p>";
    return;
  }

  const byId = (id) => document.getElementById(id);
  const overviewView = byId("overview-view");
  const workView = byId("work-view");
  const breadcrumb = byId("breadcrumb");
  const workGrid = byId("work-grid");
  const sideWorkList = byId("side-work-list");
  const searchDialog = byId("search-dialog");
  const searchInput = byId("search-input");
  const searchResults = byId("search-results");
  const searchStatus = byId("search-status");
  const mobileWorkMenu = byId("mobile-work-menu");
  const sideNavigation = byId("side-navigation");

  let currentWorkId = null;
  let currentStepId = null;
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

  function routeFor(workId, stepId, faqNumber = "") {
    const params = new URLSearchParams();
    params.set("work", workId);
    params.set("step", stepId);
    if (faqNumber !== "" && faqNumber !== null && faqNumber !== undefined) {
      params.set("faq", String(faqNumber));
    }
    return `#${params.toString()}`;
  }

  function searchResultHref(item) {
    const hash = routeFor(item.workId, item.stepId, item.faqNumber);
    if (!item.chapterId || item.chapterId === activeChapter.id) return hash;
    return `?chapter=${encodeURIComponent(item.chapterId)}${hash}`;
  }

  const chapterName = (item) =>
    [item.chapterLabel, item.chapterTitle].filter(Boolean).join(" ") || activeChapter.label;

  const getWork = (workId) => data.sections.find((work) => work.id === workId);
  const getSteps = (workId) => stepData[workId]?.steps || [];

  const getForm = (formId) => data.forms.find((form) => form.id === formId);

  function renderOverview() {
    workGrid.innerHTML = data.sections
      .map((work) => {
        const workflow = stepData[work.id];
        const steps = workflow.steps;
        const visibleSteps = steps.slice(0, 4);
        const flowText = visibleSteps
          .map((step) => `<span>${escapeHtml(step.title)}</span>`)
          .join("");
        return `
          <a class="structured-item work-card" href="${routeFor(work.id, steps[0].id)}">
            <div class="work-card-top">
              <span class="work-card-number">업무 ${String(work.number).padStart(2, "0")}</span>
              <span class="work-card-pages">원문 ${escapeHtml(work.printedPages)}쪽</span>
            </div>
            <h3>${escapeHtml(work.title)}</h3>
            <p>${escapeHtml(workflow.intro)}</p>
            <div class="work-card-flow" aria-label="주요 흐름">${flowText}</div>
            <span class="work-card-link">
              <span>${steps.length}단계로 보기</span><span aria-hidden="true">→</span>
            </span>
          </a>
        `;
      })
      .join("");
  }

  function renderSideNavigation() {
    sideWorkList.innerHTML = data.sections
      .map((work) => {
        const firstStep = getSteps(work.id)[0];
        return `
          <li class="lnb-item">
            <a class="lnb-btn${work.id === currentWorkId ? " active" : ""}"
               href="${routeFor(work.id, firstStep.id)}"
               ${work.id === currentWorkId ? 'aria-current="page"' : ""}>
              <span class="side-number">${String(work.number).padStart(2, "0")}</span>
              <span>${escapeHtml(work.title)}</span>
            </a>
          </li>
        `;
      })
      .join("");
  }

  function renderStepList(steps, activeIndex) {
    const stepList = byId("step-list");
    stepList.style.setProperty("--step-count", steps.length);
    stepList.innerHTML = steps
      .map((step, index) => {
        const stateClass = index === activeIndex ? " active" : index < activeIndex ? " complete" : "";
        const stateText = index === activeIndex ? ' aria-current="step"' : "";
        return `
          <li>
            <button class="step-button${stateClass}" type="button" data-step-id="${escapeHtml(step.id)}"${stateText}>
              <span class="step-circle">${index < activeIndex ? "✓" : index + 1}</span>
              <span>${escapeHtml(step.title)}</span>
            </button>
          </li>
        `;
      })
      .join("");

    stepList.querySelectorAll("[data-step-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextStepId = button.dataset.stepId;
        if (nextStepId !== currentStepId) {
          location.hash = routeFor(currentWorkId, nextStepId);
        }
      });
    });
  }

  function renderList(targetId, values) {
    const target = byId(targetId);
    target.innerHTML = values.map((value) => `<li>${escapeHtml(value)}</li>`).join("");
  }

  function renderResources(step) {
    const formsTarget = byId("step-forms");
    if (step.forms.length) {
      formsTarget.innerHTML = `
        <span class="resource-links">
          ${step.forms
            .map((formId) => {
              const form = getForm(formId);
              const title = form ? `${form.id} ${form.title}` : formId;
              return `<a class="resource-chip" href="${escapeHtml(data.downloads.forms)}" download>${escapeHtml(title)}</a>`;
            })
            .join("")}
        </span>
      `;
    } else {
      formsTarget.textContent = "이 단계에 별도 지정 서식 없음";
    }

    byId("step-basis").innerHTML = step.basis.map(escapeHtml).join("<br />");
    byId("step-pages").textContent = step.pages;
  }

  function relatedFaqsFor(work, step, requestedFaqNumber = "") {
    const categories = stepData[work.id].faqCategories;
    const requestedFaq = data.faqs.find((faq) => String(faq.number) === String(requestedFaqNumber));
    if (!categories.length && !requestedFaq) return [];

    const stepTerms = normalize(
      [work.title, step.title, step.summary, ...step.actions, ...step.checks].join(" ")
    )
      .split(" ")
      .filter((term) => term.length >= 2);

    const ranked = data.faqs
      .filter((faq) => categories.includes(faq.category))
      .map((faq) => {
        const searchable = normalize(`${faq.question} ${faq.answer}`);
        const score = stepTerms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
        return { faq, score };
      })
      .sort((a, b) => b.score - a.score || a.faq.number - b.faq.number)
      .slice(0, 5)
      .map((item) => item.faq);

    if (requestedFaq && !ranked.some((faq) => String(faq.number) === String(requestedFaq.number))) {
      return [requestedFaq, ...ranked].slice(0, 5);
    }
    return ranked;
  }

  function renderFaqs(work, step, requestedFaqNumber = "") {
    const target = byId("related-faqs");
    const faqs = relatedFaqsFor(work, step, requestedFaqNumber);

    if (!faqs.length) {
      target.innerHTML = '<p class="empty-state">이 업무는 현재 별도 FAQ가 없습니다. 단계의 확인사항과 원문 근거를 확인하세요.</p>';
      return;
    }

    target.innerHTML = faqs
      .map((faq) => {
        const faqNumber = String(faq.number);
        const panelId = `faq-panel-${faqNumber}`;
        const expanded = faqNumber === String(requestedFaqNumber);
        const targetedClass = expanded ? " faq-targeted" : "";
        const hiddenAttribute = expanded ? "" : " hidden";
        return `
          <div class="accordion-item${targetedClass}">
            <h3>
              <button class="btn-accordion" type="button" data-faq-number="${faqNumber}" aria-expanded="${expanded}" aria-controls="${panelId}">
                <span>Q. ${escapeHtml(faq.question)}</span>
              </button>
            </h3>
            <div class="accordion-collapse" id="${panelId}"${hiddenAttribute}>
              <div class="accordion-body">${escapeHtml(faq.answer)}</div>
            </div>
          </div>
        `;
      })
      .join("");

    target.querySelectorAll(".btn-accordion").forEach((button) => {
      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        const panel = target.querySelector(`#${button.getAttribute("aria-controls")}`);
        if (panel) panel.hidden = expanded;
      });
    });

    const requestedButton = Array.from(target.querySelectorAll(".btn-accordion")).find(
      (button) => button.dataset.faqNumber === String(requestedFaqNumber)
    );
    if (requestedButton) {
      requestAnimationFrame(() => {
        requestedButton.focus({ preventScroll: true });
        requestedButton.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }

  function renderStep(work, steps, activeIndex, requestedFaqNumber = "") {
    const step = steps[activeIndex];
    currentStepId = step.id;

    byId("step-label").textContent = `${activeIndex + 1}단계`;
    byId("step-title").textContent = step.title;
    byId("step-summary").textContent = step.summary;
    byId("step-progress").textContent = `전체 ${steps.length}단계 중 ${activeIndex + 1}단계`;
    renderList("step-actions", step.actions);
    renderList("step-checks", step.checks);
    renderList("step-cautions", step.cautions);
    byId("caution-block").hidden = step.cautions.length === 0;
    renderResources(step);
    renderFaqs(work, step, requestedFaqNumber);

    const pdfPage = Array.isArray(work.pdfPages) ? work.pdfPages[0] : 1;
    byId("source-page-link").href = `${data.downloads.manual}#page=${pdfPage}`;

    const prevButton = byId("prev-step");
    const nextButton = byId("next-step");
    prevButton.disabled = activeIndex === 0;
    nextButton.disabled = activeIndex === steps.length - 1;
    nextButton.textContent = activeIndex === steps.length - 1 ? "마지막 단계" : "다음 단계";

    prevButton.onclick = () => {
      if (activeIndex > 0) location.hash = routeFor(work.id, steps[activeIndex - 1].id);
    };
    nextButton.onclick = () => {
      if (activeIndex < steps.length - 1) location.hash = routeFor(work.id, steps[activeIndex + 1].id);
    };

    renderStepList(steps, activeIndex);
  }

  function renderWork(workId, stepId, focusPanel, requestedFaqNumber = "") {
    const work = getWork(workId);
    if (!work || !stepData[workId]) {
      location.hash = "#overview";
      return;
    }

    const steps = getSteps(workId);
    let activeIndex = steps.findIndex((step) => step.id === stepId);
    if (activeIndex < 0) activeIndex = 0;

    currentWorkId = workId;
    overviewView.hidden = true;
    workView.hidden = false;
    renderSideNavigation();

    byId("work-number").textContent = `업무 ${String(work.number).padStart(2, "0")}`;
    byId("work-pages").textContent = `원문 ${work.printedPages}쪽`;
    byId("work-title").textContent = work.title;
    byId("work-intro").textContent = stepData[work.id].intro;
    breadcrumb.innerHTML = `
      <li class="home"><a href="#overview">홈</a></li>
      <li><a href="#overview">${escapeHtml(`${activeChapter.label} ${activeChapter.title}`)}</a></li>
      <li><span>${escapeHtml(work.title)}</span></li>
    `;

    renderStep(work, steps, activeIndex, requestedFaqNumber);
    document.title = `${work.title} · ${steps[activeIndex].title} | 학교행정업무 길라잡이`;

    if (focusPanel) {
      requestAnimationFrame(() => {
        byId("step-panel").focus({ preventScroll: true });
        byId("step-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  function renderRoute() {
    const raw = location.hash.replace(/^#/, "");
    if (!raw || raw === "overview" || raw === "downloads") {
      currentWorkId = null;
      currentStepId = null;
      workView.hidden = true;
      overviewView.hidden = false;
      breadcrumb.innerHTML = `
        <li class="home"><a href="#overview">홈</a></li>
        <li><span>${escapeHtml(`${activeChapter.label} ${activeChapter.title}`)}</span></li>
      `;
      document.title = `학교행정업무 길라잡이 웹판 | ${activeChapter.label} ${activeChapter.title}`;
      if (raw === "downloads") {
        requestAnimationFrame(() => byId("downloads").scrollIntoView({ behavior: "smooth" }));
      }
      return;
    }

    const params = new URLSearchParams(raw);
    const nextWorkId = params.get("work");
    const nextStepId = params.get("step");
    const requestedFaqNumber = params.get("faq") || "";
    const focusPanel = currentWorkId === nextWorkId && currentStepId !== nextStepId;
    renderWork(nextWorkId, nextStepId, focusPanel, requestedFaqNumber);
  }

  function formTarget(formId) {
    for (const work of data.sections) {
      const step = getSteps(work.id).find((candidate) => candidate.forms.includes(formId));
      if (step) return { workId: work.id, stepId: step.id };
    }
    const fallbackWork = data.sections[0];
    const fallbackStep = fallbackWork ? getSteps(fallbackWork.id)[0] : null;
    return { workId: fallbackWork?.id || "", stepId: fallbackStep?.id || "" };
  }

  function buildSearchIndex() {
    const index = [];
    const withActiveChapter = (entry) => ({
      chapterId: activeChapter.id,
      chapterLabel: activeChapter.label,
      chapterTitle: activeChapter.title,
      ...entry
    });


    data.sections.forEach((work) => {
      const workflow = stepData[work.id];
      index.push(withActiveChapter({
        type: "업무",
        workId: work.id,
        stepId: workflow.steps[0].id,
        title: work.title,
        description: workflow.intro,
        text: [work.title, workflow.intro, ...(work.keywords || [])].join(" ")
      }));

      workflow.steps.forEach((step) => {
        index.push(withActiveChapter({
          type: "업무 단계",
          workId: work.id,
          stepId: step.id,
          title: `${work.title} · ${step.title}`,
          description: step.summary,
          text: [
            work.title,
            step.title,
            step.summary,
            ...step.actions,
            ...step.checks,
            ...step.cautions,
            ...step.basis,
            ...step.forms
          ].join(" ")
        }));
      });
    });

    data.faqs.forEach((faq) => {
      const matchingWork =
        data.sections.find((work) => stepData[work.id].faqCategories.includes(faq.category)) ||
        data.sections[0];
      const matchingStep = getSteps(matchingWork.id)
        .map((step) => {
          const words = normalize(`${step.title} ${step.summary}`).split(" ").filter((word) => word.length >= 2);
          const faqText = normalize(`${faq.question} ${faq.answer}`);
          return { step, score: words.reduce((sum, word) => sum + (faqText.includes(word) ? 1 : 0), 0) };
        })
        .sort((a, b) => b.score - a.score)[0].step;

      index.push(withActiveChapter({
        type: "자주 묻는 질문",
        workId: matchingWork.id,
        stepId: matchingStep.id,
        faqNumber: faq.number,
        title: faq.question,
        description: faq.answer,
        text: `${faq.category} ${faq.question} ${faq.answer}`
      }));
    });

    data.forms.forEach((form) => {
      const target = formTarget(form.id);
      index.push(withActiveChapter({
        type: "서식·예시",
        workId: target.workId,
        stepId: target.stepId,
        title: `${form.id} ${form.title}`,
        description: "관련 업무 단계에서 사용 방법과 함께 확인할 수 있습니다.",
        text: `${form.id} ${form.title} ${form.searchText}`
      }));
    });

    return index;
  }

  const searchIndex = allChapterSearchIndex.length ? allChapterSearchIndex : buildSearchIndex();

  function scoreResult(item, query) {
    const source = normalize(item.text);
    const title = normalize(item.title);
    const terms = normalize(query).split(" ").filter(Boolean);
    if (!terms.length || !terms.every((term) => source.includes(term))) return 0;

    return terms.reduce((score, term) => {
      if (title === term) return score + 20;
      if (title.includes(term)) return score + 10;
      return score + 2;
    }, 0);
  }

  function highlight(value, query) {
    let output = escapeHtml(value);
    const terms = normalize(query).split(" ").filter((term) => term.length >= 2);
    terms.forEach((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
    });
    return output;
  }

  function runSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      searchStatus.textContent = "전체 편에서 업무명이나 궁금한 문장을 검색합니다.";
      searchResults.innerHTML = "";
      return;
    }

    const results = searchIndex
      .map((item) => ({ item, score: scoreResult(item, trimmed) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "ko"))
      .slice(0, 30);

    searchStatus.textContent = results.length
      ? `전체 편 ‘${trimmed}’ 검색 결과 ${results.length}건`
      : `‘${trimmed}’과 일치하는 결과가 없습니다.`;

    if (!results.length) {
      searchResults.innerHTML = '<p class="empty-state">단어를 줄이거나 다른 표현으로 검색해 보세요.</p>';
      return;
    }

    searchResults.innerHTML = results
      .map(
        ({ item }) => `
          <a class="search-result" href="${escapeHtml(searchResultHref(item))}">
            <div class="search-result-meta">
              <span>${escapeHtml(chapterName(item))}</span>
              <span aria-hidden="true">·</span>
              <span>${escapeHtml(item.type)}</span>
            </div>
            <h3>${highlight(item.title, trimmed)}</h3>
            <p>${highlight(item.description, trimmed)}</p>
          </a>
        `
      )
      .join("");

    searchResults.querySelectorAll(".search-result").forEach((link) => {
      link.addEventListener("click", closeSearch);
    });
  }

  function openSearch(query = "") {
    lastFocusedElement = document.activeElement;
    if (typeof searchDialog.showModal === "function") {
      searchDialog.showModal();
    } else {
      searchDialog.setAttribute("open", "");
    }
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

  document.querySelectorAll("[data-open-search]").forEach((button) => {
    button.addEventListener("click", () => openSearch());
  });

  document.querySelectorAll("[data-close-search]").forEach((button) => {
    button.addEventListener("click", closeSearch);
  });

  document.querySelectorAll("[data-query]").forEach((button) => {
    button.addEventListener("click", () => openSearch(button.dataset.query));
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

  document.addEventListener("keydown", (event) => {
    const tagName = document.activeElement?.tagName;
    const typing = tagName === "INPUT" || tagName === "TEXTAREA";
    if (event.key === "/" && !typing) {
      event.preventDefault();
      openSearch();
    }
    if (event.key === "Escape" && searchDialog.open) closeSearch();
  });

  mobileWorkMenu.addEventListener("click", () => {
    const expanded = mobileWorkMenu.getAttribute("aria-expanded") === "true";
    mobileWorkMenu.setAttribute("aria-expanded", String(!expanded));
    sideNavigation.classList.toggle("mobile-open", !expanded);
  });

  window.addEventListener("hashchange", renderRoute);
  renderOverview();
  renderRoute();
})();
