from pathlib import Path


path = Path(__file__).resolve().with_name("install_semantic_workflow.py")
text = path.read_text(encoding="utf-8")
old = "app, count = pattern.subn(replacement, app, count=1)"
new = "app, count = pattern.subn(lambda _match: replacement, app, count=1)"
if old not in text:
    raise SystemExit("수정할 정규식 치환 코드를 찾지 못했습니다.")
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
print("fixed semantic installer")
