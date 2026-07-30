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

  function chapterName(chapter) {
    if (!chapter) return "전체 업무";
    return chapter.title ? `${chapter.label} ${chapter.title}` : chapter.label;
  }

  function globalHomeHref() {
    return `${location.href.split(/[?#]/)[0]}#overview`;
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
                <small>준비 중</small>
              </span>
            </li>
          `;
        }
        return `
          <li class="chapter-item${current ? " is-current" : ""}">
            <a class="chapter-link" href="?chapter=${chapter.id}#overview"${current ? ' aria-current="page"' : ""}>
              <strong>${chapter.label}</strong>
              <span>${chapter.title}</span>
              <small>${current ? "현재 편" : "이동"}</small>
            </a>
          </li>
        `;
      })
      .join("");

    const available = config.chapters.filter((chapter) => chapter.available);
    const note = document.getElementById("chapter-dialog-note");
    if (note) {
      note.textContent = `현재 ${available
        .map((chapter) => chapter.label)
        .join("·")}을 제공하며, 나머지 편은 자료 검수 후 순차적으로 열립니다.`;
    }
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

  document.querySelectorAll("[data-global-home]").forEach((link) => {
    link.href = globalHomeHref();
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
    document.querySelectorAll("[data-download='manual']").forEach((link) => {
      link.href = data.downloads.manual;
      if (link.dataset.label === "chapter") link.textContent = `${chapter.label} PDF 보기`;
    });
    document.querySelectorAll("[data-download='forms']").forEach((link) => {
      link.href = data.downloads.forms;
    });
    document.querySelectorAll("[data-download='faq']").forEach((link) => {
      link.href = data.downloads.faq;
    });
  }

  function patchGeneratedContext() {
    const currentChapter = window.ACTIVE_GUIDE_CHAPTER || active;
    if (!currentChapter) return;
    const fullName = chapterName(currentChapter);
    const sideTitle = document.getElementById("side-chapter-title");
    if (sideTitle) sideTitle.textContent = `${currentChapter.label} 업무 목록`;

    const breadcrumb = document.getElementById("breadcrumb");
    if (breadcrumb) {
      const items = breadcrumb.querySelectorAll("li");
      if (items.length >= 2) {
        const target = items[1].querySelector("a, span");
        if (target) target.textContent = fullName;
      }
    }
  }

  document.addEventListener("guide:data-ready", applyChapterContext);
  document.addEventListener("guide:app-ready", patchGeneratedContext);
  window.addEventListener("hashchange", () => setTimeout(patchGeneratedContext, 0));

  renderChapterGrid();
})();
