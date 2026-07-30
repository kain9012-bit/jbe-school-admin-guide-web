from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "docs" / "index-structured.html"
target = ROOT / "docs" / "index.html"

html = source.read_text(encoding="utf-8")
html = html.replace(
    '<link rel="stylesheet" href="assets/structured.css" />',
    '<link rel="stylesheet" href="assets/structured.css" />\n'
    '    <link rel="stylesheet" href="assets/structured-v2.css" />',
)
html = html.replace(
    '<script src="assets/guide-bootstrap.js"></script>',
    '<script src="assets/guide-bootstrap-structured.js"></script>',
)

if "assets/structured-v2.css" not in html:
    raise SystemExit("structured-v2.css 연결 실패")
if "assets/guide-bootstrap-structured.js" not in html:
    raise SystemExit("구조화 부트스트랩 연결 실패")

target.write_text(html, encoding="utf-8", newline="\n")
print(f"installed: {target}")
