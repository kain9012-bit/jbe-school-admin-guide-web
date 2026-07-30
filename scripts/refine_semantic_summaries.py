from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "docs" / "assets" / "app-faithful-workflow.js"
text = path.read_text(encoding="utf-8")

old_start = 'function logicalSummaryItems(body) {\n    const lines = String(body || "")'
new_start = (
    "function logicalSummaryItems(block) {\n"
    '    const body = String(block.body || "");\n'
    "    const lines = body"
)
if old_start not in text:
    raise SystemExit("요약 함수 시작 부분을 찾지 못했습니다.")
text = text.replace(old_start, new_start, 1)

old_empty = "    if (!lines.length) return [];\n    const items = [];"
new_empty = (
    "    if (!lines.length) return [];\n"
    "    const heading = cleanSourceHeading(block.title);\n"
    "    const looksLikeTable = /구\\s*분\\s+내\\s*용/.test(body) || lines.length >= 12;\n"
    "    if (looksLikeTable) {\n"
    "      return [`${heading || \"이 항목\"}의 항목별 기준과 세부 내용을 확인합니다.`];\n"
    "    }\n"
    "    const items = [];"
)
if old_empty not in text:
    raise SystemExit("요약 함수 본문을 찾지 못했습니다.")
text = text.replace(old_empty, new_empty, 1)

old_call = "    const summaries = logicalSummaryItems(block.body);"
new_call = "    const summaries = logicalSummaryItems(block);"
if old_call not in text:
    raise SystemExit("요약 함수 호출부를 찾지 못했습니다.")
text = text.replace(old_call, new_call, 1)

path.write_text(text, encoding="utf-8", newline="\n")
print("refined semantic summaries")
