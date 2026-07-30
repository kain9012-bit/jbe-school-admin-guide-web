from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
GIT_CANDIDATES = [
    shutil.which("git"),
    r"C:\Users\kain9\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe",
]
git = next((candidate for candidate in GIT_CANDIDATES if candidate and Path(candidate).exists()), None)
if not git:
    raise SystemExit("Git 실행 파일을 찾지 못했습니다.")

result = subprocess.run(
    [git, "show", "HEAD:docs/index.html"],
    cwd=ROOT,
    check=True,
    capture_output=True,
)
html = result.stdout.decode("utf-8")

html = html.replace(
    '<link rel="stylesheet" href="assets/header-v3.css" />',
    '<link rel="stylesheet" href="assets/header-v3.css" />\n'
    '    <link rel="stylesheet" href="assets/workflow-faithful.css" />',
)
html = html.replace(
    "원문을 길게 읽지 않아도 됩니다. 하려는 업무를 고르면 단계별 행동,\n"
    "                확인사항, 서식과 근거가 한 흐름으로 이어집니다.",
    "매뉴얼에 실제로 제시된 업무 흐름을 따라 세부 내용과 관련 법규,\n"
    "                TIP, 서식과 FAQ를 한 화면에서 확인할 수 있습니다.",
)
html = html.replace("✓</span> 이 단계에서 할 일", "✓</span> 원문 상세 내용")
html = html.replace("<h3>확인사항</h3>", "<h3>관련 법규·참고자료</h3>")
html = html.replace("<h3>주의·예외</h3>", "<h3>TIP·주의사항</h3>")
html = html.replace(
    '<script src="assets/guide-bootstrap.js"></script>',
    '<script src="assets/guide-bootstrap-workflow.js"></script>',
)

required = (
    'id="step-list"',
    'id="step-panel"',
    'id="step-actions"',
    "assets/workflow-faithful.css",
    "assets/guide-bootstrap-workflow.js",
)
missing = [value for value in required if value not in html]
if missing:
    raise SystemExit(f"기존 UI 복원 구성 누락: {', '.join(missing)}")

for name in ("index.html", "index-structured.html", "index-workflow.html"):
    target = ROOT / "docs" / name
    target.write_text(html, encoding="utf-8", newline="\n")
    print(f"restored: {target}")
