from pathlib import Path


path = Path(__file__).resolve().parents[1] / "docs" / "assets" / "structured-details.css"
source = path.read_text(encoding="utf-8")

old_caption = """.source-criteria-table caption {
  padding: 1.2rem 1.4rem;
  color: var(--guide-blue-dark);
  background: #f1f6ff;
  font-weight: 700;
  text-align: left;
}
"""

new_caption = """.source-criteria-table caption {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* 고정 레이아웃 표는 첫 행에서 열 너비를 지정해야 1:1 균등 분할을 피할 수 있습니다. */
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

if old_caption not in source:
    raise SystemExit("caption style target not found")
source = source.replace(old_caption, new_caption, 1)

old_body_width = """.source-criteria-table tbody th {
  width: 22%;
  background: #fbfcfd;
  font-weight: 700;
}
"""
new_body_width = """.source-criteria-table tbody th {
  background: #fbfcfd;
  font-weight: 700;
}
"""
if old_body_width not in source:
    raise SystemExit("tbody width target not found")
source = source.replace(old_body_width, new_body_width, 1)

path.write_text(source, encoding="utf-8")
