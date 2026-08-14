(function () {
  "use strict";

  const config = window.GUIDE_CONFIG;
  const chapterDialog = document.getElementById("chapter-dialog");
  const chapterGrid = document.getElementById("chapter-grid");
  const mobileMenuButton = document.getElementById("global-menu-toggle");
  const mobileMenu = document.getElementById("mobile-global-nav");
  const requestedId = new URLSearchParams(location.search).get("chapter");
  const active =
    config.chapters.find(
      (chapter) => chapter.id === requestedId && chapter.available
    ) || null;


  // 내려받기 단추 하나를 잇습니다. 그 편에 없는 자료면 단추를 감춥니다.
  // 감추지 않으면 주소가 'undefined'가 되어 누를 때 404가 납니다.
  function setDownload(link, href, fileName) {
    if (!href) {
      link.hidden = true;
      link.setAttribute("aria-hidden", "true");
      link.tabIndex = -1;
      return;
    }
    link.hidden = false;
    link.removeAttribute("aria-hidden");
    link.removeAttribute("tabindex");
    link.href = href;
    if (fileName) link.setAttribute("download", fileName);
  }

  function chapterName(chapter) {
    if (!chapter) return "전체 업무";
    return chapter.title ? `${chapter.label} ${chapter.title}` : chapter.label;
  }

  function globalHomeHref() {
    return `${location.href.split(/[?#]/)[0]}#overview`;
  }

  const searchIndex = Array.isArray(window.GUIDE_SEARCH_INDEX)
    ? window.GUIDE_SEARCH_INDEX
    : [];

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  // 분야 안의 업무 목록은 통합검색 색인에서 가져옵니다.
  function worksOf(chapterId) {
    return searchIndex.filter(
      (item) => item.type === "업무" && item.chapterId === chapterId
    );
  }

  function renderChapterGrid() {
    chapterGrid.innerHTML = config.chapters
      .map((chapter) => {
        const current = Boolean(active && chapter.id === active.id);
        if (!chapter.available) {
          return `
            <li class="chapter-item is-planned">
              <span class="chapter-link" aria-disabled="true">
                <strong>${chapter.label}</strong>
                <span>${escapeHtml(chapter.title)}</span>
                <span class="sr-only">아직 웹에서 볼 수 없습니다.</span>
              </span>
            </li>
          `;
        }
        const works = worksOf(chapter.id);
        const panelId = `chapter-dialog-works-${chapter.id}`;
        return `
          <li class="chapter-item${current ? " is-current" : ""}">
            <button class="chapter-link" type="button"
                    aria-expanded="false" aria-controls="${panelId}"
                    data-dialog-chapter="${chapter.id}"${
                      current ? ' aria-current="page"' : ""
                    }>
              <strong>${chapter.label}</strong>
              <span>${escapeHtml(chapter.title)}</span>
              <small>업무 ${works.length}개</small>
              <span class="chapter-link-arrow" aria-hidden="true">⌄</span>
            </button>
            <div class="chapter-works" id="${panelId}" hidden>
              <ul>
                ${works
                  .map(
                    (item, index) => `
                  <li>
                    <a href="?chapter=${encodeURIComponent(
                      item.chapterId
                    )}#work=${encodeURIComponent(item.workId)}"
                       data-dialog-work="${escapeHtml(item.workId)}"
                       data-dialog-work-chapter="${escapeHtml(item.chapterId)}">
                      <span class="chapter-work-number">${String(index + 1).padStart(
                        2,
                        "0"
                      )}</span>
                      <span class="chapter-work-copy">
                        <strong>${escapeHtml(item.title)}</strong>
                        <small>${escapeHtml(item.steps ? `세부 ${item.steps}단계` : "원문 보기")}</small>
                      </span>
                      <span aria-hidden="true">→</span>
                    </a>
                  </li>
                `
                  )
                  .join("")}
              </ul>
            </div>
          </li>
        `;
      })
      .join("");

    bindChapterToggles();

  }

  // 분야를 누르면 그 자리에서 업무 목록이 펼쳐집니다.
  function bindChapterToggles() {
    const buttons = chapterGrid.querySelectorAll("[data-dialog-chapter]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const panel = document.getElementById(button.getAttribute("aria-controls"));
        if (!panel) return;
        const willOpen = button.getAttribute("aria-expanded") !== "true";

        buttons.forEach((other) => {
          if (other === button) return;
          const otherPanel = document.getElementById(other.getAttribute("aria-controls"));
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

    // 지금 보고 있는 분야 안에서 업무를 고르면 새로 불러오지 않고 바로 이동합니다.
    chapterGrid.querySelectorAll("[data-dialog-work]").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (!active || link.dataset.dialogWorkChapter !== active.id) return;
        event.preventDefault();
        closeChapterDialog();
        location.hash = `#work=${encodeURIComponent(link.dataset.dialogWork)}`;
      });
    });
  }

  function openChapterDialog() {
    if (typeof chapterDialog.showModal === "function") chapterDialog.showModal();
    else chapterDialog.setAttribute("open", "");
  }

  function closeChapterDialog() {
    if (typeof chapterDialog.close === "function" && chapterDialog.open) chapterDialog.close();
    else chapterDialog.removeAttribute("open");
  }

  document.querySelectorAll("[data-open-chapters]").forEach((button) => {
    button.addEventListener("click", openChapterDialog);
  });
  document.querySelectorAll("[data-close-chapters]").forEach((button) => {
    button.addEventListener("click", closeChapterDialog);
  });
  chapterDialog.addEventListener("click", (event) => {
    if (event.target === chapterDialog) closeChapterDialog();
  });

  mobileMenuButton.addEventListener("click", () => {
    const expanded = mobileMenuButton.getAttribute("aria-expanded") === "true";
    mobileMenuButton.setAttribute("aria-expanded", String(!expanded));
    mobileMenu.hidden = expanded;
  });

  mobileMenu.querySelectorAll("a, button").forEach((item) => {
    item.addEventListener("click", () => {
      mobileMenuButton.setAttribute("aria-expanded", "false");
      mobileMenu.hidden = true;
    });
  });

  document.querySelectorAll("[data-current-chapter]").forEach((target) => {
    target.textContent = chapterName(active);
  });

  // 첫 화면으로 되돌립니다. 열어 둔 분야를 접고, 대화상자를 닫고, 맨 위로 올립니다.
  // 로고를 눌렀는데 아무 일도 일어나지 않으면 눌러도 되는 것인지 알 수 없습니다.
  function resetToHome() {
    document.querySelectorAll("dialog[open]").forEach((dialog) => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });
    // 홈과 분야 대화상자 양쪽의 펼친 분야를 모두 접습니다.
    document
      .querySelectorAll("[data-toggle-chapter][aria-expanded='true'], [data-dialog-chapter][aria-expanded='true']")
      .forEach((button) => {
        const panel = document.getElementById(button.getAttribute("aria-controls"));
        button.setAttribute("aria-expanded", "false");
        if (panel) {
          panel.classList.remove("is-open");
          panel.hidden = true;
        }
      });
    if (typeof history.replaceState === "function") {
      history.replaceState(null, "", location.pathname);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll("[data-global-home]").forEach((link) => {
    link.href = globalHomeHref();
    link.addEventListener("click", (event) => {
      // 편 화면에서는 통합 홈을 새로 불러와야 합니다. 주소가 달라 그대로 둡니다.
      if (window.ACTIVE_GUIDE_CHAPTER) return;
      // 이미 통합 홈이면 새로 불러올 것이 없습니다. 그 자리에서 첫 화면으로 되돌립니다.
      event.preventDefault();
      resetToHome();
    });
  });

  function applyChapterContext(event) {
    const { chapter, data } = event.detail;
    const fullName = chapterName(chapter);

    document.querySelectorAll("[data-current-chapter]").forEach((target) => {
      target.textContent = fullName;
    });
    document.querySelectorAll("[data-section-count]").forEach((target) => {
      target.textContent = String(data.sections.length);
    });
    // 원문 단추는 교육청이 배포한 공식 매뉴얼 PDF만 가리킵니다.
    // 그 편 PDF가 아직 없으면 단추를 감춥니다. 한글 원문 같은 다른 파일을
    // 대신 붙이면 공식 자료가 아닌 것을 '원문'이라고 내놓는 셈입니다.
    //   PDF 받기: node scripts/fetch_official_manuals.mjs
    document.querySelectorAll("[data-download='manual']").forEach((link) => {
      setDownload(link, data.downloads.manual);
      if (link.dataset.label === "chapter") link.textContent = `${chapter.label} PDF 보기`;
    });
    // 저장되는 파일 이름을 무엇인지 알아볼 수 있게 정해 줍니다.
    // 정해 주지 않으면 'chapter1-forms.hwpx'가 그대로 이름이 됩니다.
    document.querySelectorAll("[data-download='forms']").forEach((link) => {
      setDownload(link, data.downloads.forms, `${fullName} 서식·예시 모음.hwpx`);
    });
    document.querySelectorAll("[data-download='faq']").forEach((link) => {
      setDownload(link, data.downloads.faq, `${fullName} 자주 묻는 질문.hwp`);
    });
  }

  function patchGeneratedContext() {
    const currentChapter = window.ACTIVE_GUIDE_CHAPTER || active;
    if (!currentChapter) return;
    const fullName = chapterName(currentChapter);
    const sideTitle = document.getElementById("side-chapter-title");
    if (sideTitle) sideTitle.textContent = `${currentChapter.label} 업무 목록`;

    // 이동 경로는 '홈 > 업무명' 두 단계입니다.
    // 편 이름을 덮어쓰면 지금 보고 있는 업무명이 사라지므로 손대지 않습니다.
  }

  document.addEventListener("guide:data-ready", applyChapterContext);
  document.addEventListener("guide:app-ready", patchGeneratedContext);
  window.addEventListener("hashchange", () => setTimeout(patchGeneratedContext, 0));

  renderChapterGrid();
})();
