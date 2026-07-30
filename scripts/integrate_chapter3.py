from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"교체할 기존 구문을 찾지 못했습니다: {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def main() -> None:
    config = ROOT / "docs" / "assets" / "guide-config.js"
    config.write_text(
        """window.GUIDE_CONFIG = {
  defaultChapter: "01",
  chapters: Array.from({ length: 19 }, (_, index) => {
    const number = index + 1;
    const published = {
      1: { title: "행정업무 및 보안" },
      3: { title: "인사관리" }
    }[number];

    return {
      id: String(number).padStart(2, "0"),
      number,
      label: `제${number}편`,
      title: published?.title || "",
      available: Boolean(published),
      dataScript: `assets/chapter${number}-data.js`,
      stepsScript: `assets/chapter${number}-steps.js`,
      dataGlobal: `CHAPTER${number}_DATA`,
      stepsGlobal: `CHAPTER${number}_STEPS`
    };
  })
};
""",
        encoding="utf-8",
    )

    app = ROOT / "docs" / "assets" / "app-v2.js"
    replace_once(
        app,
        '  const getForm = (formId) => data.forms.find((form) => form.id === formId);\n',
        '''  const getForm = (formId) => data.forms.find((form) => form.id === formId);

  function renderSearchExamples() {
    const examples = data.meta.searchExamples || ["비전자문서", "대리결재", "폐기 공인", "기록물 이관"];
    const target = byId("quick-keywords");
    target.innerHTML = `
      <span>추천</span>
      ${examples
        .map(
          (query) =>
            `<button type="button" data-query="${escapeHtml(query)}">${escapeHtml(query)}</button>`
        )
        .join("")}
    `;
    byId("hero-search-input").placeholder = `예: ${examples.join(", ")}`;
  }
''',
    )
    replace_once(
        app,
        "    const pdfPage = Array.isArray(work.pdfPages) ? work.pdfPages[0] : 1;\n",
        '''    const pageMatch = String(step.pages || "").match(/PDF\\s+(\\d+)/);
    const pdfPage = pageMatch ? Number(pageMatch[1]) : Array.isArray(work.pdfPages) ? work.pdfPages[0] : 1;
''',
    )
    replace_once(
        app,
        '  window.addEventListener("hashchange", renderRoute);\n  renderOverview();\n',
        '  window.addEventListener("hashchange", renderRoute);\n  renderSearchExamples();\n  renderOverview();\n',
    )

    header = ROOT / "docs" / "assets" / "header-v3.js"
    replace_once(
        header,
        '      })\n      .join("");\n  }\n',
        '''      })
      .join("");

    const available = config.chapters.filter((chapter) => chapter.available);
    const note = document.getElementById("chapter-dialog-note");
    if (note) {
      note.textContent = `현재 ${available
        .map((chapter) => chapter.label)
        .join("·")}을 제공하며, 나머지 편은 자료 검수 후 순차적으로 열립니다.`;
    }
  }
''',
    )

    index = ROOT / "docs" / "index.html"
    replace_once(
        index,
        'placeholder="예: 직무대리, 공인 폐기, 기록물 이관"',
        'placeholder="업무, 질문, 서식을 검색하세요"',
    )
    replace_once(
        index,
        '<div class="quick-keywords" aria-label="추천 검색어">',
        '<div class="quick-keywords" id="quick-keywords" aria-label="추천 검색어">',
    )
    replace_once(
        index,
        '<p class="chapter-dialog-note">현재는 제1편 시범 콘텐츠만 제공하며, 다른 편은 자료 검수 후 순차적으로 열립니다.</p>',
        '<p class="chapter-dialog-note" id="chapter-dialog-note">공개된 편을 불러오는 중입니다.</p>',
    )

    print("제3편 공통 화면 연결 완료")


if __name__ == "__main__":
    main()
