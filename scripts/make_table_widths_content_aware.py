from pathlib import Path


root = Path(__file__).resolve().parents[1]
js_path = root / "docs" / "assets" / "structured-details.js"
css_path = root / "docs" / "assets" / "structured-details.css"

js = js_path.read_text(encoding="utf-8")

old_table_start = """  function tableMarkup(caption, headers, rows) {
    return `
      <div class="source-table-scroll">
        <table class="source-criteria-table">
          <caption>${escapeHtml(caption)}</caption>
"""

new_table_start = """  function plainCellText(value) {
    const source = Array.isArray(value) ? value.join(" ") : String(value ?? "");
    return normalizeLine(source.replace(/<[^>]*>/g, " "));
  }

  function visualLength(value) {
    return [...plainCellText(value)].reduce((length, character) => {
      if (/\\s/.test(character)) return length + 0.35;
      if (/[가-힣一-龥ぁ-ゔァ-ヴー々〆〤]/.test(character)) return length + 1;
      return length + 0.58;
    }, 0);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function contentAwareColumnWidths(headers, rows) {
    const columnCount = headers.length;
    const columnValues = headers.map((header, columnIndex) => [
      header,
      ...rows.map((cells) => cells[columnIndex]),
    ]);
    const longest = columnValues.map((values) =>
      Math.max(...values.map((value) => visualLength(value)))
    );

    if (columnCount === 2) {
      const labelWidth = clamp(10 + longest[0] * 1.45, 16, 30);
      return [labelWidth, 100 - labelWidth];
    }

    if (columnCount === 3) {
      let firstWidth = clamp(10 + longest[0] * 1.35, 15, 24);
      let secondWidth = clamp(10 + longest[1] * 1.05, 16, 24);
      const descriptorTotal = firstWidth + secondWidth;
      if (descriptorTotal > 46) {
        const scale = 46 / descriptorTotal;
        firstWidth *= scale;
        secondWidth *= scale;
      }
      return [firstWidth, secondWidth, 100 - firstWidth - secondWidth];
    }

    return Array.from({ length: columnCount }, () => 100 / columnCount);
  }

  function tableMarkup(caption, headers, rows) {
    const widths = contentAwareColumnWidths(headers, rows);
    return `
      <div class="source-table-scroll">
        <table class="source-criteria-table" data-column-layout="${widths
          .map((width) => width.toFixed(1))
          .join("-")}">
          <caption>${escapeHtml(caption)}</caption>
          <colgroup>
            ${widths
              .map((width) => `<col style="width: ${width.toFixed(1)}%" />`)
              .join("")}
          </colgroup>
"""

if old_table_start not in js:
    raise SystemExit("table markup target not found")
js = js.replace(old_table_start, new_table_start, 1)
js_path.write_text(js, encoding="utf-8")


css = css_path.read_text(encoding="utf-8")
fixed_rules = """/* 고정 레이아웃 표는 첫 행에서 열 너비를 지정해야 1:1 균등 분할을 피할 수 있습니다. */
.source-criteria-table thead th:first-child:nth-last-child(2) {
  width: 22%;
}

.source-criteria-table thead th:first-child:nth-last-child(3) {
  width: 18%;
}

.source-criteria-table thead th:nth-child(2):nth-last-child(2) {
  width: 18%;
}

"""
if fixed_rules not in css:
    raise SystemExit("fixed table width rules not found")
css = css.replace(fixed_rules, "", 1)
css_path.write_text(css, encoding="utf-8")
