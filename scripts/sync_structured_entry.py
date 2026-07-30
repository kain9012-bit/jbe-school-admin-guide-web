from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
canonical = ROOT / "docs" / "index.html"
structured = ROOT / "docs" / "index-structured.html"

html = canonical.read_text(encoding="utf-8")

required = (
    "assets/structured-v2.css",
    "assets/guide-bootstrap-structured.js",
    'id="structured-content"',
    'class="source-verification"',
)
missing = [value for value in required if value not in html]
if missing:
    raise SystemExit(f"최종 진입 파일 필수 구성 누락: {', '.join(missing)}")

structured.write_text(html, encoding="utf-8", newline="\n")
print(f"synced: {structured}")
