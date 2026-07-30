from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
APP = DOCS / "assets" / "app-faithful-workflow.js"
ENTRY_FILES = (
    DOCS / "index.html",
    DOCS / "index-structured.html",
    DOCS / "index-workflow.html",
)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: 교체 대상이 {count}개입니다.")
    return source.replace(old, new, 1)


app = APP.read_text(encoding="utf-8")
old_setup = """    const heading = generatedTitle ? "" : cleanSourceHeading(block.title);
    const summaries = logicalSummaryItems(block);
    return `
"""
new_setup = """    const heading = generatedTitle ? "" : cleanSourceHeading(block.title);
    const summaries = logicalSummaryItems(block);
    const fullDetail = block.body
      ? window.GUIDE_DETAIL_RENDERER?.render(block)
      : null;
    return `
"""
app = replace_once(app, old_setup, new_setup, "상세 렌더러 준비")

old_detail = """        ${
          block.body
            ? `<details class="source-full-detail">
                 <summary>수치·조건·예외를 포함한 세부 기준 전체 보기</summary>
                 <div class="source-full-content">${escapeHtml(block.body)}</div>
               </details>`
            : ""
        }
"""
new_detail = """        ${
          block.body
            ? `<details class="source-full-detail" data-detail-type="${escapeHtml(
                fullDetail?.type || "text"
              )}">
                 <summary>${escapeHtml(fullDetail?.summary || "전체 내용 보기")}</summary>
                 <div class="source-full-content">${
                   fullDetail?.html ||
                   `<div class="source-full-text">${escapeHtml(block.body)}</div>`
                 }</div>
               </details>`
            : ""
        }
"""
app = replace_once(app, old_detail, new_detail, "상세 본문 출력")
APP.write_text(app, encoding="utf-8")


for entry in ENTRY_FILES:
    html = entry.read_text(encoding="utf-8")
    old_styles = """    <link rel="stylesheet" href="assets/workflow-faithful.css" />
    <link rel="stylesheet" href="assets/semantic-workflow.css" />
"""
    new_styles = """    <link rel="stylesheet" href="assets/workflow-faithful.css" />
    <link rel="stylesheet" href="assets/semantic-workflow.css" />
    <link rel="stylesheet" href="assets/structured-details.css" />
"""
    html = replace_once(html, old_styles, new_styles, f"{entry.name} 상세 스타일")

    old_scripts = """    <script src="assets/form-assets.js"></script>
    <script src="assets/header-v3.js"></script>
"""
    new_scripts = """    <script src="assets/form-assets.js"></script>
    <script src="assets/structured-details.js"></script>
    <script src="assets/header-v3.js"></script>
"""
    html = replace_once(html, old_scripts, new_scripts, f"{entry.name} 상세 렌더러")
    entry.write_text(html, encoding="utf-8")
