from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
app_path = ROOT / "docs" / "assets" / "app-faithful-workflow.js"
app = app_path.read_text(encoding="utf-8")

replacement = r'''function logicalSummaryItems(body) {
    const lines = String(body || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return [];
    const items = [];
    for (const line of lines) {
      const startsItem =
        /^(?:[•‣▶※]|[-–]\s|\d+[.)]\s|[가-힣]\.\s)/.test(line) ||
        line.includes(" : ");
      if (!items.length || startsItem) items.push(line);
      else items[items.length - 1] += ` ${line}`;
    }
    return items.slice(0, 3).map((item) => excerpt(item, 170));
  }

  function sourceBlockMarkup(block) {
    const generatedTitle = /^매뉴얼 \d+쪽$/.test(block.title);
    const structural =
      !block.body && (block.title.endsWith("세부내용") || block.title === "업무 흐름도");
    const heading = generatedTitle ? "" : cleanSourceHeading(block.title);
    const summaries = logicalSummaryItems(block.body);
    return `
      <li class="source-detail${structural ? " structural-marker" : ""}"
          data-source-block="${escapeHtml(block.id)}">
        ${heading ? `<strong>${escapeHtml(heading)}</strong>` : ""}
        ${
          summaries.length
            ? `<ul class="semantic-summary-list">${summaries
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join("")}</ul>`
            : ""
        }
        ${
          block.body
            ? `<details class="source-full-detail">
                 <summary>수치·조건·예외를 포함한 세부 기준 전체 보기</summary>
                 <div class="source-full-content">${escapeHtml(block.body)}</div>
               </details>`
            : ""
        }
        <span class="source-detail-meta">
          <span>매뉴얼 ${block.printedPage}쪽</span>
          <a href="${escapeHtml(data.downloads.manual)}#page=${block.pdfPage}"
             target="_blank" rel="noopener">PDF 원문</a>
        </span>
      </li>
    `;
  }'''

pattern = re.compile(
    r"function sourceBlockMarkup\(block\) \{.*?\n  \}",
    re.DOTALL,
)
app, count = pattern.subn(lambda _match: replacement, app, count=1)
if count != 1:
    raise SystemExit("원문 블록 표시 함수 교체 실패")
app_path.write_text(app, encoding="utf-8", newline="\n")

for name in ("index.html", "index-structured.html", "index-workflow.html"):
    path = ROOT / "docs" / name
    html = path.read_text(encoding="utf-8")
    html = html.replace(
        '<link rel="stylesheet" href="assets/workflow-faithful.css" />',
        '<link rel="stylesheet" href="assets/workflow-faithful.css" />\n'
        '    <link rel="stylesheet" href="assets/semantic-workflow.css" />',
    )
    html = html.replace("✓</span> 원문 상세 내용", "✓</span> 업무 내용")
    path.write_text(html, encoding="utf-8", newline="\n")

print("installed semantic presentation")
