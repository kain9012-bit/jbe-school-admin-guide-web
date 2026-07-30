from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
APP = DOCS / "assets" / "app-faithful-workflow.js"
CSS = DOCS / "assets" / "workflow-faithful.css"
ENTRY_FILES = (
    DOCS / "index.html",
    DOCS / "index-structured.html",
    DOCS / "index-workflow.html",
)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError(f"{label}: 교체 대상이 {source.count(old)}개입니다.")
    return source.replace(old, new, 1)


app = APP.read_text(encoding="utf-8")

source_meta = """        <span class="source-detail-meta">
          <span>매뉴얼 ${block.printedPage}쪽</span>
          <a href="${escapeHtml(data.downloads.manual)}#page=${block.pdfPage}"
             target="_blank" rel="noopener">PDF 원문</a>
        </span>
"""
app = replace_once(app, source_meta, "", "본문 반복 출처")

old_dialog = """  function ensureFormDialog() {
    if (byId("form-source-dialog")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <dialog class="form-source-dialog" id="form-source-dialog" aria-labelledby="form-source-title">
          <div class="form-source-dialog-inner">
            <header>
              <h2 id="form-source-title"></h2>
              <button class="dialog-close" type="button" data-close-form aria-label="서식 닫기">×</button>
            </header>
            <div class="form-source-content" id="form-source-content"></div>
            <footer>
              <a class="krds-btn tertiary" href="${escapeHtml(data.downloads.forms)}" download>
                전체 서식·예시 원본 HWPX
              </a>
            </footer>
          </div>
        </dialog>
      `
    );
    byId("form-source-dialog")
      .querySelector("[data-close-form]")
      .addEventListener("click", () => byId("form-source-dialog").close());
  }

  function openForm(formId) {
    const form = getForm(formId);
    if (!form) return;
    ensureFormDialog();
    byId("form-source-title").textContent = `${form.id} ${form.title}`;
    byId("form-source-content").textContent = form.content;
    const dialog = byId("form-source-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
"""

new_dialog = """  let formPreviewZoom = 100;

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
"""

app = replace_once(app, old_dialog, new_dialog, "서식 미리보기 모달")
APP.write_text(app, encoding="utf-8")


css = CSS.read_text(encoding="utf-8")
css = css.replace(
    "width: min(calc(100% - 4rem), 92rem);",
    "width: min(calc(100% - 4rem), 112rem);",
    1,
)

old_content_css = """.form-source-content {
  overflow: auto;
  padding: 3rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 1.5rem;
  line-height: 1.75;
}
"""

new_content_css = """.form-source-content {
  display: grid;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: #eef1f5;
}

.form-preview-kicker {
  margin: 0 0 0.4rem;
  color: var(--guide-blue);
  font-size: 1.3rem;
  font-weight: 700;
}

.form-preview-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 1.6rem;
  align-items: center;
  min-height: 5.2rem;
  padding: 0.8rem 2rem;
  border-bottom: 1px solid var(--guide-line);
  background: #fff;
  color: var(--guide-muted);
  font-size: 1.35rem;
}

.form-preview-controls {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

.form-preview-controls button {
  min-width: 3.6rem;
  min-height: 3.4rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--guide-line);
  border-radius: 0.6rem;
  background: #fff;
  color: var(--guide-ink);
  cursor: pointer;
}

.form-preview-controls button:hover {
  border-color: var(--guide-blue);
  color: var(--guide-blue);
}

.form-preview-controls output {
  min-width: 5rem;
  color: var(--guide-ink);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.form-preview-viewport {
  min-height: 36rem;
  overflow: auto;
  padding: 2.4rem;
  background:
    linear-gradient(rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.35)),
    #dfe3e8;
}

.form-preview-image {
  display: block;
  width: 100%;
  height: auto;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 0.8rem 2.4rem rgba(19, 20, 22, 0.16);
  transition: width 160ms ease;
}

.form-preview-fallback {
  max-width: 52rem;
  margin: 8rem auto;
  padding: 2.4rem;
  border-radius: 1rem;
  background: #fff;
  color: var(--guide-muted);
  text-align: center;
}

.form-download-note {
  margin-right: auto;
  color: var(--guide-muted);
  font-size: 1.35rem;
}
"""

css = replace_once(css, old_content_css, new_content_css, "서식 미리보기 스타일")
css += """
@media (max-width: 767px) {
  .form-preview-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .form-preview-controls {
    width: 100%;
  }

  .form-preview-controls button:last-child {
    margin-left: auto;
  }

  .form-preview-viewport {
    min-height: 28rem;
    padding: 1.2rem;
  }

  .form-source-dialog footer {
    align-items: stretch;
    flex-direction: column;
  }
}
"""
CSS.write_text(css, encoding="utf-8")


for entry in ENTRY_FILES:
    html = entry.read_text(encoding="utf-8")
    old_scripts = """    <script src="assets/guide-search-index.js"></script>
    <script src="assets/header-v3.js"></script>
"""
    new_scripts = """    <script src="assets/guide-search-index.js"></script>
    <script src="assets/form-assets.js"></script>
    <script src="assets/header-v3.js"></script>
"""
    html = replace_once(html, old_scripts, new_scripts, f"{entry.name} 자산 스크립트")
    entry.write_text(html, encoding="utf-8")
