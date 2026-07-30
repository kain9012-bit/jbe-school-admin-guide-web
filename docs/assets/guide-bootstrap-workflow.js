(function () {
  "use strict";

  const config = window.GUIDE_CONFIG;
  const requestedId = new URLSearchParams(location.search).get("chapter");
  const requested = config.chapters.find(
    (chapter) => chapter.id === requestedId && chapter.available
  );
  const activeChapter = requested || null;
  const version = "20260730-global-home";

  window.ACTIVE_GUIDE_CHAPTER = activeChapter;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${src}${src.includes("?") ? "&" : "?"}v=${version}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`${src} 파일을 불러오지 못했습니다.`));
      document.body.appendChild(script);
    });
  }

  async function start() {
    try {
      if (!activeChapter) {
        await loadScript("assets/global-home.js");
        document.dispatchEvent(new CustomEvent("guide:global-ready"));
        return;
      }

      await loadScript(activeChapter.dataScript);
      await loadScript("assets/workflow-layout.js");
      const chapterData = window[activeChapter.dataGlobal];
      if (!chapterData) throw new Error("선택한 편의 원문 데이터를 불러오지 못했습니다.");

      window.CHAPTER1_DATA = chapterData;
      document.dispatchEvent(
        new CustomEvent("guide:data-ready", {
          detail: { chapter: activeChapter, data: chapterData },
        })
      );

      await loadScript("assets/app-faithful-workflow.js");
      document.dispatchEvent(
        new CustomEvent("guide:app-ready", {
          detail: { chapter: activeChapter, data: chapterData },
        })
      );
    } catch (error) {
      console.error(error);
      const main = document.getElementById("main-content");
      if (main) {
        main.innerHTML = `
          <section class="content-container load-error">
            <h1>안내서를 불러오지 못했습니다.</h1>
            <p>잠시 후 다시 시도하거나 19개 편 통합 홈으로 이동해 주세요.</p>
            <a class="krds-btn primary" href="${location.pathname}#overview">
              통합 홈으로
            </a>
          </section>
        `;
      }
    }
  }

  start();
})();
