(function () {
  "use strict";

  const config = window.GUIDE_CONFIG;
  const requestedId = new URLSearchParams(location.search).get("chapter");
  const requested = config.chapters.find((chapter) => chapter.id === requestedId);
  const fallback = config.chapters.find((chapter) => chapter.id === config.defaultChapter);
  const activeChapter = requested?.available ? requested : fallback;

  window.ACTIVE_GUIDE_CHAPTER = activeChapter;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`${src} 파일을 불러오지 못했습니다.`));
      document.body.appendChild(script);
    });
  }

  async function start() {
    try {
      await loadScript(activeChapter.dataScript);
      await loadScript(activeChapter.stepsScript);

      const chapterData = window[activeChapter.dataGlobal];
      const chapterSteps = window[activeChapter.stepsGlobal];
      if (!chapterData || !chapterSteps) throw new Error("선택한 편의 콘텐츠 형식이 올바르지 않습니다.");

      window.CHAPTER1_DATA = chapterData;
      window.CHAPTER1_STEPS = chapterSteps;
      document.dispatchEvent(
        new CustomEvent("guide:data-ready", {
          detail: { chapter: activeChapter, data: chapterData, steps: chapterSteps }
        })
      );

      await loadScript("assets/app-faithful.js");
      document.dispatchEvent(
        new CustomEvent("guide:app-ready", {
          detail: { chapter: activeChapter, data: chapterData, steps: chapterSteps }
        })
      );
    } catch (error) {
      console.error(error);
      const main = document.getElementById("main-content");
      if (main) {
        main.innerHTML = `
          <section class="content-container load-error">
            <h1>안내서를 불러오지 못했습니다.</h1>
            <p>잠시 후 다시 시도하거나 제1편으로 이동해 주세요.</p>
            <a class="krds-btn primary" href="?chapter=01#overview">제1편 열기</a>
          </section>
        `;
      }
    }
  }

  start();
})();
