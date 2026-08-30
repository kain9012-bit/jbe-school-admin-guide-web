(function () {
  "use strict";

  const config = window.GUIDE_CONFIG;
  const requestedId = new URLSearchParams(location.search).get("chapter");
  const requested = config.chapters.find(
    (chapter) => chapter.id === requestedId && chapter.available
  );
  // 업무를 지정하지 않고 편만 지정해 들어오면 따로 개요 화면을 보여 주지 않고
  // 통합 홈에서 그 분야를 펼쳐 줍니다. 홈과 똑같이 생긴 화면이 하나 더 있으면
  // 이용자가 어디로 왔는지 헷갈리기 때문입니다.
  const hasWorkRoute = /(^|&)work=/.test(location.hash.replace(/^#/, ""));
  const goHomeWithChapter = Boolean(requested) && !hasWorkRoute;
  const activeChapter = goHomeWithChapter ? null : requested || null;
  // 자산마다 파일 내용에서 뽑은 번호가 있습니다(scripts/stamp_asset_versions.js).
  // 예전에는 여기에 날짜를 손으로 적어 두었는데 한 번도 고치지 않아,
  // 화면 코드를 고쳐도 이용자에게는 예전 파일이 그대로 나갔습니다.
  const assetVersions = window.GUIDE_ASSET_VERSIONS || {};

  window.ACTIVE_GUIDE_CHAPTER = activeChapter;
  // 그림 크기처럼 편 자료에만 적힌 값을 화면 곳곳에서 읽습니다
  // (docs/assets/structured-details.js의 placeOf).
  Object.defineProperty(window, "ACTIVE_GUIDE_DATA", {
    configurable: true,
    get() {
      return activeChapter ? window[activeChapter.dataGlobal] || {} : {};
    },
  });
  window.GUIDE_HOME_OPEN_CHAPTER = goHomeWithChapter ? requested.id : "";

  if (goHomeWithChapter && typeof history.replaceState === "function") {
    history.replaceState(null, "", `${location.pathname}#chapters`);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const version = assetVersions[src];
      script.src = version ? `${src}${src.includes("?") ? "&" : "?"}v=${version}` : src;
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
            <p>잠시 후 다시 시도하거나 통합 홈으로 이동해 주세요.</p>
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
