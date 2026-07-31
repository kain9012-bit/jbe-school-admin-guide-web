(function () {
  "use strict";

  const data = window.CHAPTER1_DATA;
  const activeChapter =
    window.ACTIVE_GUIDE_CHAPTER || { id: "01", label: "제1편", title: "행정업무 및 보안" };
  const allChapterSearchIndex = Array.isArray(window.GUIDE_SEARCH_INDEX)
    ? window.GUIDE_SEARCH_INDEX
    : [];

  if (!data) {
    document.body.innerHTML = "<p>안내서 데이터를 불러오지 못했습니다.</p>";
    return;
  }

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
  const excerpt = (value, limit = 180) => {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
  };

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
  let currentWorkId = "";
  let currentStepId = "";
  let currentStepTitle = "";
  let lastFocusedElement = null;

  function isSourceFlowBlock(work, block) {
    return work.flowGroups.some(
      (flow) =>
        flow.sourceText === block.body &&
        flow.pdfPage === block.pdfPage &&
        flow.printedPage === block.printedPage
    );
  }

  function flowTitles(work) {
    const titles = [];
    for (const flow of work.flowGroups) {
      for (const part of String(flow.sourceText).split(/\s*▶\s*|\n+/)) {
        const title = part.trim();
        if (title && !titles.some((item) => normalize(item) === normalize(title))) titles.push(title);
      }
    }
    return titles;
  }

  function sourceHeadingSteps(work, blocks) {
    const candidates = blocks.filter(
      (block) =>
        /^\d+\.\s*\S/.test(block.title) &&
        !/^매뉴얼 \d+쪽$/.test(block.title)
    );
    if (!candidates.length) {
      return [{ title: work.title, anchorIndex: 0 }];
    }
    return candidates.map((block) => ({
      title: block.title,
      anchorIndex: blocks.indexOf(block),
      anchorId: block.id,
    }));
  }

  function titleTerms(title) {
    const withoutLabels = String(title)
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\([^)]*\)/g, " ");
    const terms = withoutLabels
      .split(/[^\p{L}\p{N}]+/u)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);
    return [...new Set(terms)];
  }

  function relevance(block, title) {
    const source = normalize(`${block.title} ${block.body}`);
    const cleanTitle = normalize(
      String(title).replace(/\[[^\]]+\]/g, " ").replace(/\([^)]*\)/g, " ")
    );
    let score = cleanTitle && source.includes(cleanTitle) ? 100 : 0;
    for (const term of titleTerms(title)) {
      if (source.includes(normalize(term))) score += 10;
    }
    return score;
  }

  function uniquePages(blocks) {
    return [...new Set(blocks.map((block) => block.printedPage))];
  }

  function cleanSourceHeading(title) {
    return String(title || "")
      .replace(/^\d+\.\s*/, "")
      .replace(/^\d+\s+/, "")
      .replace(/세부내용$/, "")
      .trim();
  }

  function isStandaloneLawLine(line) {
    const normalized = String(line || "").replace(/\s+/g, " ").trim();
    return /^(?:[•‣▶]\s*)?[「『].+[」』](?:\s*제[\d조항호~,.·\s]+.*)?$/.test(normalized);
  }

  function splitLawReferences(block) {
    const lines = String(block.body || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const lawLines = lines.filter(isStandaloneLawLine);
    const contentLines = lines.filter((line) => !isStandaloneLawLine(line));
    const isLawHeading = block.title === "관련법규 및 참고자료";
    const isLawOnly = lines.length > 0 && lawLines.length === lines.length;

    return {
      contentBlock:
        !isLawHeading && !isLawOnly && (contentLines.length || !block.body)
          ? {
              ...block,
              body: contentLines.length ? contentLines.join("\n") : block.body,
            }
          : null,
      lawBlock:
        lawLines.length
          ? {
              ...block,
              id: `${block.id}-law-reference`,
              title: "관련법규 및 참고자료",
              body: lawLines.join("\n"),
            }
          : null,
    };
  }

  function buildWorkflow(work) {
    const layout = window.GUIDE_WORKFLOW_LAYOUT?.[work.id];
    if (!Array.isArray(layout) || !layout.length) {
      throw new Error(`${work.title}의 의미 구조가 없습니다.`);
    }

    const blockById = new Map(work.contentBlocks.map((block) => [block.id, block]));
    const substantiveBlocks = work.contentBlocks.filter(
      (block) =>
        !isSourceFlowBlock(work, block) &&
        !(block.title === "업무 흐름도" && !block.body)
    );
    const assignedIds = layout.flatMap((step) => step.blocks);
    const duplicateIds = assignedIds.filter(
      (id, index) => assignedIds.indexOf(id) !== index
    );
    const missingIds = substantiveBlocks
      .map((block) => block.id)
      .filter((id) => !assignedIds.includes(id));
    const unknownIds = assignedIds.filter((id) => !blockById.has(id));
    if (duplicateIds.length || missingIds.length || unknownIds.length) {
      throw new Error(
        `${work.title} 의미 구조 오류: 중복 ${duplicateIds.join(",")}; ` +
        `누락 ${missingIds.join(",")}; 알 수 없음 ${unknownIds.join(",")}`
      );
    }

    const steps = layout.map((sourceStep, index) => {
      const stepBlocks = sourceStep.blocks.map((id) => blockById.get(id));
      const tipBlocks = stepBlocks.filter((block) => block.title === "TIPTIP");
      const classifiedBlocks = stepBlocks
        .filter((block) => block.title !== "TIPTIP")
        .map(splitLawReferences);
      const mainBlocks = classifiedBlocks
        .map((entry) => entry.contentBlock)
        .filter(Boolean);
      const lawBlocks = classifiedBlocks
        .map((entry) => entry.lawBlock)
        .filter(Boolean);
      const topics = mainBlocks
        .map((block) => cleanSourceHeading(block.title))
        .filter(
          (title) =>
            title &&
            !/^매뉴얼 \d+쪽$/.test(title) &&
            title !== work.title &&
            !topicsStructural(title)
        );
      const uniqueTopics = [...new Set(topics)];
      // 소제목이 이미 위에 적혀 있으므로 같은 말을 되풀이하지 않습니다.
      const summary = "";
      return {
        id: `step-${index + 1}`,
        title: sourceStep.title,
        blocks: stepBlocks,
        mainBlocks,
        lawBlocks,
        tipBlocks,
        summary,
        pages: uniquePages(stepBlocks),
      };
    });

    const intro = "";
    return {
      intro,
      steps,
      faqCategories: work.faqCategories,
      sourceFlows: work.flowGroups,
    };
  }

  function topicsStructural(title) {
    return /^(공문서 관리|업무관리시스템|공인관리|직무대리|사무인계인수|기록물 관리|신원조사 등 전력조회|사이버보안진단의 날 운영|시설보안|지방공무원 인사|근무성적평정|교육훈련|포상|신분 및 권익보장)$/.test(
      title
    );
  }

  const workflows = Object.fromEntries(
    data.sections.map((work) => [work.id, buildWorkflow(work)])
  );
  const getWork = (workId) => data.sections.find((work) => work.id === workId);
  const getSteps = (workId) => workflows[workId]?.steps || [];
  const getForm = (formId) => data.forms.find((form) => form.id === formId);

  function routeFor(workId, stepId, options = {}) {
    const params = new URLSearchParams({ work: workId });
    if (stepId) params.set("step", stepId);
    if (options.blockId) params.set("block", options.blockId);
    if (options.formId) params.set("form", options.formId);
    if (options.faqNumber) params.set("faq", options.faqNumber);
    return `#${params.toString()}`;
  }

  function findStep(workId, { stepId, blockId } = {}) {
    const steps = getSteps(workId);
    if (stepId) {
      const explicit = steps.find((step) => step.id === stepId);
      if (explicit) return explicit;
    }
    if (blockId) {
      const containing = steps.find((step) =>
        step.blocks.some((block) => block.id === blockId)
      );
      if (containing) return containing;
    }
    return steps[0];
  }

  function chapterName(item = activeChapter) {
    return [item.chapterLabel || item.label, item.chapterTitle || item.title]
      .filter(Boolean)
      .join(" ");
  }

  function globalHomeHref() {
    return `${location.href.split(/[?#]/)[0]}#chapters`;
  }

  // 편만 지정한 주소는 더 이상 따로 화면을 갖지 않고 통합 홈에서 그 분야를 펼칩니다.
  function chapterHomeHref() {
    return `${location.href.split(/[?#]/)[0]}?chapter=${encodeURIComponent(
      activeChapter.id
    )}`;
  }

  function renderSearchExamples() {
    const examples = data.meta.searchExamples || [];
    const target = document.querySelector(".quick-keywords");
    if (!target) return;
    target.innerHTML = `
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

  function renderOverview() {
    workGrid.innerHTML = data.sections
      .map((work) => {
        const workflow = workflows[work.id];
        const visibleSteps = workflow.steps.slice(0, 4);
        return `
          <a class="structured-item work-card"
             href="${routeFor(work.id, workflow.steps[0]?.id)}">
            <div class="work-card-top">
              <span class="work-card-number">업무 ${String(work.number).padStart(2, "0")}</span>
              <span class="work-card-pages">원문 ${escapeHtml(work.printedPages)}쪽</span>
            </div>
            <h3>${escapeHtml(work.title)}</h3>
            <p>${escapeHtml(workflow.intro)}</p>
            <div class="work-card-flow" aria-label="원문 주요 흐름">
              ${visibleSteps.map((step) => `<span>${escapeHtml(step.title)}</span>`).join("")}
            </div>
            <span class="work-card-link">
              <span>${workflow.steps.length}단계로 보기</span><span aria-hidden="true">→</span>
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
               href="${routeFor(work.id, firstStep?.id)}"
               ${work.id === currentWorkId ? 'aria-current="page"' : ""}>
              <span class="side-number">${String(work.number).padStart(2, "0")}</span>
              <span>${escapeHtml(work.title)}</span>
            </a>
          </li>
        `;
      })
      .join("");
  }

  function renderStepList(work, steps, activeIndex) {
    const stepList = byId("step-list");
    // 단계 목록을 다시 그리면 지금 눌린 버튼이 사라집니다.
    // 그대로 두면 브라우저가 포커스를 잃으면서 화면을 위로 끌어올리므로,
    // 다시 그린 뒤 같은 자리의 버튼으로 포커스를 옮겨 줍니다.
    const hadFocusInStepList = stepList.contains(document.activeElement);
    stepList.style.setProperty("--step-count", steps.length);
    stepList.innerHTML = steps
      .map((step, index) => {
        const stateClass =
          index === activeIndex ? " active" : index < activeIndex ? " complete" : "";
        const current = index === activeIndex ? ' aria-current="step"' : "";
        return `
          <li>
            <button class="step-button${stateClass}" type="button"
                    data-step-id="${escapeHtml(step.id)}"${current}>
              <span class="step-circle">${index < activeIndex ? "✓" : index + 1}</span>
              <span>${escapeHtml(step.title)}</span>
            </button>
          </li>
        `;
      })
      .join("");
    stepList.querySelectorAll("[data-step-id]").forEach((button) => {
      button.addEventListener("click", () => {
        location.hash = routeFor(work.id, button.dataset.stepId);
      });
    });

    if (hadFocusInStepList) {
      const activeButton = stepList.querySelector(".step-button.active");
      // preventScroll을 주어 포커스를 옮기는 것만으로 화면이 움직이지 않게 합니다.
      if (activeButton) activeButton.focus({ preventScroll: true });
    }

    // 단계가 많으면 가로로 밀지 않고 여러 줄로 나눠 전부 보이게 합니다.
    // 한 줄에 몇 칸이 들어갈지는 화면 너비에 맞춰 정하고,
    // 줄 끝에 놓인 단계는 다음 단계로 이어지는 선을 지웁니다.
    const MIN_STEP_WIDTH = 128;
    const layOutSteps = () => {
      const items = [...stepList.children];
      if (!items.length) return;
      const width = stepList.clientWidth;
      const columns = Math.max(1, Math.min(items.length, Math.floor(width / MIN_STEP_WIDTH)));
      stepList.style.setProperty("--step-cols", columns);
      items.forEach((item, index) => {
        const endOfRow = (index + 1) % columns === 0;
        item.classList.toggle("is-row-end", endOfRow);
      });
    };
    if (!stepList.dataset.layoutBound) {
      stepList.dataset.layoutBound = "true";
      window.addEventListener("resize", layOutSteps);
    }
    layOutSteps();

  }

  // 매뉴얼의 업무 흐름도를 그대로 보여 줍니다.
  // 누르는 곳이 아니라 이 업무가 어떤 순서로 이뤄지는지 알려 주는 그림입니다.
  function renderWorkFlowDiagram(work) {
    const section = byId("work-flow-section");
    const diagram = byId("work-flow-diagram");
    const note = byId("work-flow-note");
    const flows = workflows[work.id].sourceFlows;

    if (!flows.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    diagram.innerHTML = flows
      .map((flow) => {
        const steps = String(flow.sourceText)
          .split(/\s*▶\s*/)
          .map((part) => part.trim())
          .filter(Boolean);
        return steps
          .map(
            (step, index) => `
              <li class="work-flow-step">
                <span class="work-flow-name">${escapeHtml(step)}</span>
                ${
                  index < steps.length - 1
                    ? '<span class="work-flow-arrow" aria-hidden="true">▶</span>'
                    : ""
                }
              </li>
            `
          )
          .join("");
      })
      .join("");

    note.hidden = true;
  }

  function allLogicalItems(block) {
    const lines = String(block.body || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const items = [];
    for (const line of lines) {
      const startsItem =
        /^(?:[•‣▶※*]|[-–]\s|\d+[.)]\s|[가-힣]\.\s)/.test(line) ||
        line.includes(" : ");
      if (!items.length || startsItem) items.push(line);
      else items[items.length - 1] += ` ${line}`;
    }
    return items;
  }

  function logicalSummaryItems(block) {
    const body = String(block.body || "");
    const lines = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return [];
    const heading = cleanSourceHeading(block.title);
    const looksLikeTable = /구\s*분\s+내\s*용/.test(body) || lines.length >= 12;
    if (looksLikeTable) {
      return [`${heading || "이 항목"}의 항목별 기준과 세부 내용을 확인합니다.`];
    }
    const items = [];
    for (const line of lines) {
      const startsItem =
        /^(?:[•‣▶※*]|[-–]\s|\d+[.)]\s|[가-힣]\.\s)/.test(line) ||
        line.includes(" : ");
      if (!items.length || startsItem) items.push(line);
      else items[items.length - 1] += ` ${line}`;
    }
    return items.slice(0, 3).map((item) => excerpt(item, 170));
  }

  function summaryItemMarkup(item) {
    const match = String(item).match(/^([•‣▶※]|[-–])\s*(.*)$/);
    if (!match) {
      return `<li class="semantic-summary-item semantic-summary-plain">
        <span class="semantic-summary-text">${escapeHtml(item)}</span>
      </li>`;
    }
    const level = /^[-–]$/.test(match[1]) ? 1 : 0;
    return `<li class="semantic-summary-item" style="--summary-level: ${level}">
      <span class="semantic-summary-marker" aria-hidden="true">${escapeHtml(match[1])}</span>
      <span class="semantic-summary-text">${escapeHtml(match[2])}</span>
    </li>`;
  }

  function sourceBlockMarkup(block) {
    const generatedTitle = /^매뉴얼 \d+쪽$/.test(block.title);
    const structural =
      !block.body && (block.title.endsWith("세부내용") || block.title === "업무 흐름도");
    // 원문의 항목 번호('1. 정의')는 매뉴얼과 대조할 때 필요하므로 그대로 둡니다.
    // 다만 지금 보고 있는 목차 항목과 같은 제목이면 바로 위에 이미 적혀 있으므로 뺍니다.
    const raw = String(block.title || "").trim();
    const heading =
      generatedTitle || squash(raw) === squash(currentStepTitle) ? "" : raw;
    // 안내서는 읽으라고 만든 문서입니다. 앞 몇 줄만 보여 주고 나머지를 접어 두면
    // 같은 글을 두 번 싣게 되고, 읽는 사람은 한 번 더 눌러야 합니다.
    // 그래서 본문은 접지 않고 한 번만, 전부 보여 줍니다.
    const rendered = block.body ? window.GUIDE_DETAIL_RENDERER?.render(block) : null;

    // 표로 정리해 보여 줄 수 있으면 표로만 보여 줍니다. 줄 목록을 함께 내지 않습니다.
    const asTable = rendered && rendered.type !== "text" && rendered.html;
    const items = block.body && !asTable ? allLogicalItems(block) : [];

    return `
      <li class="source-detail${structural ? " structural-marker" : ""}"
          data-source-block="${escapeHtml(block.id)}">
        ${heading ? `<strong>${escapeHtml(heading)}</strong>` : ""}
        ${
          asTable
            ? `<div class="source-full-content" data-detail-type="${escapeHtml(
                rendered.type
              )}">${rendered.html}</div>`
            : ""
        }
        ${
          items.length
            ? `<ul class="semantic-summary-list">${items
                .map((item) => summaryItemMarkup(item))
                .join("")}</ul>`
            : ""
        }
      </li>
    `;
  }

  // 원문에서 소제목 노릇만 하던 줄은 화면에서 빈 항목으로만 보이므로 내지 않습니다.
  // '2. 결재의 순서 : 기안자 → …'처럼 제목 자체가 내용을 담은 줄은 그대로 보여 줍니다.
  const squash = (value) => String(value || "").replace(/\s+/g, "");

  function isEmptyStructuralBlock(block, work) {
    if (block.body) return false;
    const raw = String(block.title || "").trim();
    if (!raw) return true;
    // '문서작성세부내용'처럼 원문의 구역 표시로만 쓰인 줄입니다.
    if (/세부내용$/.test(raw)) return true;
    if (raw === "업무 흐름도" || raw === "관련법규 및 참고자료") return true;
    // '3 공인관리'처럼 업무 이름을 되풀이하는 줄입니다. 띄어쓰기 차이는 무시합니다.
    return Boolean(work) && squash(cleanSourceHeading(raw)) === squash(work.title);
  }

  function renderSourceBlocks(targetId, blocks) {
    const target = byId(targetId);
    const work = data.sections.find((section) => section.id === currentWorkId);
    const visible = blocks.filter((block) => !isEmptyStructuralBlock(block, work));
    const container = target.closest(".task-block");
    container.hidden = visible.length === 0;
    target.classList.add("source-detail-list");
    target.innerHTML = visible.map(sourceBlockMarkup).join("");
  }

  let formPreviewZoom = 100;

  function getFormAsset(formId) {
    const chapterId = window.ACTIVE_GUIDE_CHAPTER?.id || "01";
    return window.FORM_ASSETS?.[chapterId]?.[formId] || null;
  }

  function setFormPreviewZoom(nextZoom) {
    formPreviewZoom = Math.max(60, Math.min(200, nextZoom));
    const image = byId("form-preview-image");
    const output = byId("form-preview-zoom");
    if (image) image.style.width = `${formPreviewZoom}%`;
    if (output) output.textContent = `${formPreviewZoom}%`;
  }

  function ensureFormDialog() {
    if (byId("form-source-dialog")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <dialog class="form-source-dialog" id="form-source-dialog" aria-labelledby="form-source-title">
          <div class="form-source-dialog-inner">
            <header>
              <div>
                <p class="form-preview-kicker">원본 서식 미리보기</p>
                <h2 id="form-source-title"></h2>
              </div>
              <button class="dialog-close" type="button" data-close-form aria-label="서식 닫기">×</button>
            </header>
            <div class="form-source-content" id="form-source-content">
              <div class="form-preview-toolbar" aria-label="미리보기 도구">
                <span id="form-preview-status"></span>
                <div class="form-preview-controls">
                  <button type="button" data-form-zoom-out aria-label="미리보기 축소">−</button>
                  <output id="form-preview-zoom">100%</output>
                  <button type="button" data-form-zoom-in aria-label="미리보기 확대">＋</button>
                  <button type="button" data-form-zoom-reset>화면 맞춤</button>
                </div>
              </div>
              <div class="form-preview-viewport" id="form-preview-viewport" tabindex="0">
                <img class="form-preview-image" id="form-preview-image" alt="" draggable="false" />
                <p class="form-preview-fallback" id="form-preview-fallback" hidden>
                  미리보기를 준비하지 못했습니다. 아래 HWPX 파일을 내려받아 확인해 주세요.
                </p>
              </div>
            </div>
            <footer>
              <span class="form-download-note" id="form-download-note"></span>
              <a class="krds-btn primary" id="form-download-link" href="" download>
                해당 항목 HWPX 내려받기
              </a>
            </footer>
          </div>
        </dialog>
      `
    );

    const dialog = byId("form-source-dialog");
    dialog
      .querySelector("[data-close-form]")
      .addEventListener("click", () => dialog.close());
    dialog
      .querySelector("[data-form-zoom-out]")
      .addEventListener("click", () => setFormPreviewZoom(formPreviewZoom - 20));
    dialog
      .querySelector("[data-form-zoom-in]")
      .addEventListener("click", () => setFormPreviewZoom(formPreviewZoom + 20));
    dialog
      .querySelector("[data-form-zoom-reset]")
      .addEventListener("click", () => setFormPreviewZoom(100));
  }

  function openForm(formId) {
    const form = getForm(formId);
    if (!form) return;
    ensureFormDialog();

    const asset = getFormAsset(formId);
    const image = byId("form-preview-image");
    const fallback = byId("form-preview-fallback");
    const download = byId("form-download-link");
    const status = byId("form-preview-status");
    const viewport = byId("form-preview-viewport");

    byId("form-source-title").textContent = `${form.id} ${form.title}`;
    setFormPreviewZoom(100);
    viewport.scrollTo({ top: 0, left: 0 });

    if (asset) {
      image.hidden = false;
      image.src = asset.preview;
      image.alt = `${form.id} ${form.title} 원본 문서 미리보기`;
      fallback.hidden = true;
      status.textContent = `${asset.pageCount}쪽 · HWPX 원본 배치`;
      download.hidden = false;
      download.href = asset.download;
      download.textContent = `${form.id} HWPX 내려받기`;
      byId("form-download-note").textContent =
        "현재 보고 있는 항목만 개별 파일로 내려받습니다.";
    } else {
      image.hidden = true;
      image.removeAttribute("src");
      fallback.hidden = false;
      status.textContent = "미리보기 준비 중";
      download.hidden = true;
      byId("form-download-note").textContent = "";
    }

    const dialog = byId("form-source-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function renderResources(work, step) {
    const formsTarget = byId("step-forms");
    const forms = work.formIds.map(getForm).filter(Boolean);
    formsTarget.innerHTML = forms.length
      ? `<span class="resource-links">${forms
          .map(
            (form) => `
              <button class="resource-chip" type="button" data-form-id="${escapeHtml(form.id)}">
                ${escapeHtml(form.id)} ${escapeHtml(form.title)}
              </button>
            `
          )
          .join("")}</span>`
      : '<span class="source-note">원문에 별도 서식·예시가 연결되어 있지 않습니다.</span>';
    formsTarget.querySelectorAll("[data-form-id]").forEach((button) => {
      button.addEventListener("click", () => openForm(button.dataset.formId));
    });

    byId("step-basis").innerHTML = step.lawBlocks.length
      ? step.lawBlocks
          .map((block) => {
            const references = String(block.body || block.title)
              .split(/\r?\n/)
              .map((line) => line.replace(/^[•‣▶]\s*/, "").trim())
              .filter(Boolean);
            return `
              <div class="basis-reference-group">
                <ul class="basis-reference-list">
                  ${references
                    .map((reference) => `<li>${escapeHtml(reference)}</li>`)
                    .join("")}
                </ul>
                <a class="basis-source-link"
                   href="${escapeHtml(data.downloads.manual)}#page=${block.pdfPage}"
                   target="_blank" rel="noopener">매뉴얼 ${block.printedPage}쪽 원문</a>
              </div>
            `;
          })
          .join("")
      : "—";
    byId("step-pages").textContent = step.pages.length
      ? step.pages.map((page) => `매뉴얼 ${page}쪽`).join(", ")
      : work.printedPages;
  }

  function relatedFaqsFor(work, step, requestedFaqNumber = "") {
    const requested = data.faqs.find(
      (faq) => String(faq.number) === String(requestedFaqNumber)
    );
    const terms = titleTerms(
      `${work.title} ${step.title} ${step.blocks.map((block) => block.title).join(" ")}`
    );
    const ranked = data.faqs
      .filter((faq) => work.faqCategories.includes(faq.category))
      .map((faq) => {
        const source = normalize(`${faq.question} ${faq.answer}`);
        const score = terms.reduce(
          (total, term) => total + (source.includes(normalize(term)) ? 1 : 0),
          0
        );
        return { faq, score };
      })
      .sort((a, b) => b.score - a.score || a.faq.number - b.faq.number)
      .slice(0, 5)
      .map((item) => item.faq);
    if (requested && !ranked.some((faq) => faq.id === requested.id)) {
      return [requested, ...ranked].slice(0, 5);
    }
    return ranked;
  }

  function parseFaqContent(answer) {
    const contentLines = [];
    const metadata = [];

    String(answer || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .forEach((line) => {
        const metaMatch = line.match(/^【([^】]+)】\s*(.*)$/);
        if (metaMatch) metadata.push({ label: metaMatch[1], value: metaMatch[2] });
        else contentLines.push(line);
      });

    let questionLines = [];
    let answerLines = contentLines;
    if (/^질문\s*내용$/.test(contentLines[0] || "")) {
      const embedded = contentLines.slice(1);
      const blankIndex = embedded.findIndex((line) => !line);
      const answerStart =
        blankIndex >= 0
          ? blankIndex + 1
          : embedded.findIndex(
              (line, index) => index > 0 && /^[･․•‣▶○]\s*/.test(line)
            );

      if (answerStart >= 0) {
        const questionEnd = blankIndex >= 0 ? blankIndex : answerStart;
        questionLines = embedded.slice(0, questionEnd).filter(Boolean);
        answerLines = embedded.slice(answerStart).filter(Boolean);
      } else {
        questionLines = embedded.filter(Boolean);
        answerLines = [];
      }
    } else {
      answerLines = contentLines.filter(Boolean);
    }

    return { questionLines, answerLines, metadata };
  }

  function faqTextMarkup(lines) {
    const entries = [];
    lines.forEach((rawLine) => {
      const line = String(rawLine || "").trim();
      if (!line) return;
      const bulletMatch = line.match(/^[･․•‣▶○]\s*(.*)$/);
      if (bulletMatch) {
        entries.push({ type: "bullet", text: bulletMatch[1] });
        return;
      }
      const previous = entries.at(-1);
      if (previous) previous.text += ` ${line}`;
      else entries.push({ type: "paragraph", text: line });
    });

    return `<div class="faq-text-body">${entries
      .map((entry) =>
        entry.type === "bullet"
          ? `<div class="faq-text-item">
               <span class="faq-text-marker" aria-hidden="true">•</span>
               <span>${escapeHtml(entry.text)}</span>
             </div>`
          : `<p>${escapeHtml(entry.text)}</p>`
      )
      .join("")}</div>`;
  }

  function faqContentMarkup(faq) {
    const parsed = parseFaqContent(faq.answer);
    return `
      <div class="faq-content-stack">
        ${
          parsed.questionLines.length
            ? `<section class="faq-question-card" aria-label="질문 내용">
                 <div class="faq-section-head">
                   <span class="faq-role-badge question">질문 내용</span>
                 </div>
                 ${faqTextMarkup(parsed.questionLines)}
               </section>`
            : ""
        }
        <section class="faq-answer-card" aria-label="답변">
          <div class="faq-section-head">
            <span class="faq-role-badge answer">답변</span>
          </div>
          ${faqTextMarkup(parsed.answerLines)}
          ${
            parsed.metadata.length
              ? `<dl class="faq-answer-meta">${parsed.metadata
                  .map(
                    (item) => `
                      <div>
                        <dt>${escapeHtml(item.label)}</dt>
                        <dd>${escapeHtml(item.value)}</dd>
                      </div>
                    `
                  )
                  .join("")}</dl>`
              : ""
          }
        </section>
      </div>
    `;
  }

  function renderFaqs(work, step, requestedFaqNumber = "") {
    const target = byId("related-faqs");
    const faqs = relatedFaqsFor(work, step, requestedFaqNumber);
    if (!faqs.length) {
      target.innerHTML = '<p class="empty-state">이 업무에 연결된 FAQ 원문이 없습니다.</p>';
      return;
    }
    target.innerHTML = faqs
      .map((faq) => {
        const number = String(faq.number);
        const panelId = `faq-panel-${number}`;
        const expanded = number === String(requestedFaqNumber);
        return `
          <div class="accordion-item${expanded ? " faq-targeted" : ""}">
            <h3>
              <button class="btn-accordion" id="${panelId}-button" type="button"
                      aria-expanded="${expanded}" aria-controls="${panelId}">
                <span class="faq-question-layout">
                  <span class="faq-list-icon" aria-hidden="true">Q</span>
                  <span class="faq-question-text">${escapeHtml(faq.question)}</span>
                </span>
              </button>
            </h3>
            <div class="accordion-collapse" id="${panelId}"
                 aria-labelledby="${panelId}-button"${expanded ? "" : " hidden"}>
              <div class="accordion-body">${faqContentMarkup(faq)}</div>
            </div>
          </div>
        `;
      })
      .join("");
    target.querySelectorAll(".btn-accordion").forEach((button) => {
      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        byId(button.getAttribute("aria-controls")).hidden = expanded;
      });
    });
  }

  function renderStep(work, step, requestedFaqNumber = "") {
    const steps = getSteps(work.id);
    const activeIndex = steps.indexOf(step);
    currentStepId = step.id;
    currentStepTitle = step.title;
    byId("step-title").textContent = step.title;
    const summaryNode = byId("step-summary");
    summaryNode.textContent = step.summary;
    summaryNode.hidden = !step.summary;
    byId("step-progress").textContent = `전체 ${steps.length}개 항목 중 ${activeIndex + 1}번째`;
    renderSourceBlocks("step-actions", step.mainBlocks);
    renderSourceBlocks("step-checks", []);
    renderSourceBlocks("step-cautions", step.tipBlocks);
    renderResources(work, step);
    renderFaqs(work, step, requestedFaqNumber);

    const firstBlock = step.blocks[0];
    byId("source-page-link").href = firstBlock
      ? `${data.downloads.manual}#page=${firstBlock.pdfPage}`
      : data.downloads.manual;

    const prevButton = byId("prev-step");
    const nextButton = byId("next-step");
    prevButton.disabled = activeIndex === 0;
    nextButton.disabled = activeIndex === steps.length - 1;
    nextButton.textContent = activeIndex === steps.length - 1 ? "마지막 항목" : "다음 항목";
    prevButton.onclick = () => {
      if (activeIndex > 0) location.hash = routeFor(work.id, steps[activeIndex - 1].id);
    };
    nextButton.onclick = () => {
      if (activeIndex < steps.length - 1) {
        location.hash = routeFor(work.id, steps[activeIndex + 1].id);
      }
    };
    renderStepList(work, steps, activeIndex);
    renderWorkFlowDiagram(work);
  }

  function renderWork(workId, options = {}) {
    const work = getWork(workId);
    if (!work) {
      location.href = chapterHomeHref();
      return;
    }
    const step = findStep(work.id, options);
    if (!step) {
      location.href = chapterHomeHref();
      return;
    }
    // 같은 업무 안에서 단계만 바꾼 것인지 판단합니다.
    // 단계만 바뀐 경우에는 보던 위치를 그대로 두어야 읽던 자리를 잃지 않습니다.
    const stayedInSameWork = currentWorkId === work.id;
    currentWorkId = work.id;
    overviewView.hidden = true;
    workView.hidden = false;
    renderSideNavigation();
    byId("work-number").textContent = `업무 ${String(work.number).padStart(2, "0")}`;
    byId("work-pages").textContent = `원문 ${work.printedPages}쪽`;
    byId("work-title").textContent = work.title;
    const introNode = byId("work-intro");
    introNode.textContent = workflows[work.id].intro;
    introNode.hidden = !workflows[work.id].intro;
    breadcrumb.innerHTML = `
      <li class="home"><a href="${escapeHtml(chapterHomeHref())}">홈</a></li>
      <li><span>${escapeHtml(work.title)}</span></li>
    `;
    renderStep(work, step, options.faqNumber);
    document.title = `${work.title} · ${step.title} | 학교행정업무 길라잡이`;
    if (options.formId) requestAnimationFrame(() => openForm(options.formId));
    else if (!stayedInSameWork) window.scrollTo({ top: 0, behavior: "instant" });
  }

  function renderRoute() {
    const raw = location.hash.replace(/^#/, "");
    if (!raw || raw === "overview" || raw === "downloads") {
      currentWorkId = "";
      currentStepId = "";
      workView.hidden = true;
      overviewView.hidden = false;
      breadcrumb.innerHTML = `
        <li class="home"><a href="${escapeHtml(globalHomeHref())}">홈</a></li>
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
      stepId: params.get("step") || "",
      blockId: params.get("block") || "",
      formId: params.get("form") || "",
      faqNumber: params.get("faq") || "",
    });
  }

  // 찾는 자료 종류를 골라 결과를 좁힐 수 있게 합니다.
  const SEARCH_SCOPES = {
    all: { label: "전체", types: ["업무", "매뉴얼 원문", "FAQ 원문", "서식·예시 원문"] },
    work: { label: "업무", types: ["업무", "매뉴얼 원문"] },
    faq: { label: "질문", types: ["FAQ 원문"] },
    form: { label: "서식", types: ["서식·예시 원문"] },
  };
  const SEARCH_KIND_LABELS = { work: "업무", faq: "질문", form: "서식" };
  let currentSearchScope = "all";

  function searchKindOf(item) {
    if (item.type === "FAQ 원문") return "faq";
    if (item.type === "서식·예시 원문") return "form";
    return "work";
  }

  function searchResultHref(item) {
    const options = {
      blockId: item.blockId || "",
      formId: item.formId || "",
      faqNumber: item.faqNumber || "",
    };
    let stepId = "";
    if (!item.chapterId || item.chapterId === activeChapter.id) {
      stepId = findStep(item.workId, { blockId: item.blockId })?.id || "";
    }
    const hash = routeFor(item.workId, stepId, options);
    return !item.chapterId || item.chapterId === activeChapter.id
      ? hash
      : `?chapter=${encodeURIComponent(item.chapterId)}${hash}`;
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
    const found = window.GUIDE_SEARCH.search(allChapterSearchIndex, trimmed, {
      types: scope.types,
      limit: 30,
    });
    const results = found.results;

    const where = currentSearchScope === "all" ? "" : `${scope.label}에서 `;
    const shown =
      found.total > results.length ? ` (관련 높은 ${results.length}건 표시)` : "";
    searchStatus.textContent = results.length
      ? `${where}‘${trimmed}’ 검색 결과 ${found.total}건${shown}`
      : `${where}‘${trimmed}’과 일치하는 원문이 없습니다.`;
    searchResults.innerHTML = results.length
      ? results
          .map(
            ({ item }) => `
              <a class="search-result" href="${escapeHtml(searchResultHref(item))}">
                <div class="search-result-meta">
                  <span class="search-result-kind kind-${escapeHtml(
                    searchKindOf(item)
                  )}">${escapeHtml(SEARCH_KIND_LABELS[searchKindOf(item)])}</span>
                  <span>${escapeHtml(chapterName(item))}</span>
                </div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.description)}</p>
              </a>
            `
          )
          .join("")
      : `<p class="empty-state">${
          currentSearchScope === "all"
            ? "원문에 사용된 다른 단어나 문장으로 검색해 보세요."
            : `${scope.label}에는 없습니다. 전체로 바꿔 찾아보세요.`
        }</p>`;
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
  bindSearchFilters();
  // 글자를 칠 때마다 결과가 바뀌면 읽기 어려우므로
  // 검색 버튼을 누르거나 Enter를 쳤을 때만 결과를 바꿉니다.
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
  document.querySelector(".quick-keywords")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-query]");
    if (button) openSearch(button.dataset.query);
  });
  mobileWorkMenu.addEventListener("click", () => {
    const expanded = mobileWorkMenu.getAttribute("aria-expanded") === "true";
    mobileWorkMenu.setAttribute("aria-expanded", String(!expanded));
    sideNavigation.classList.toggle("mobile-open", !expanded);
  });
  window.addEventListener("hashchange", renderRoute);

  // 편만 지정한 주소는 더 이상 따로 화면을 갖지 않으므로
  // 상단의 '업무 흐름'은 그 분야를 펼친 홈으로 보냅니다.
  document
    .querySelectorAll('.global-nav a[href="#overview"], .mobile-global-nav a[href="#overview"]')
    .forEach((link) => {
      link.href = chapterHomeHref();
      const label = link.querySelector("span");
      if (label) label.textContent = "다른 업무 보기";
      else link.textContent = "다른 업무 보기";
    });

  ensureFormDialog();
  renderSearchExamples();
  renderRoute();
})();
