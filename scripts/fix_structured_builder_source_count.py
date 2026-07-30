from pathlib import Path


path = Path(__file__).with_name("build_structured_chapters.py")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        '''    title = f"매뉴얼 {page['printedPage']}쪽"
    body: list[str] = []
''',
        '''    title = f"매뉴얼 {page['printedPage']}쪽"
    title_from_source = False
    body: list[str] = []
''',
    ),
    (
        '''    def flush() -> None:
        nonlocal title, body
''',
        '''    def flush() -> None:
        nonlocal title, title_from_source, body
''',
    ),
    (
        '''                "sourceLineCount": len(body) + (0 if title.startswith("매뉴얼 ") else 1),
''',
        '''                "sourceLineCount": len(body) + (1 if title_from_source else 0),
''',
    ),
    (
        '''            title = "업무 흐름도" if arrow_flow else line
            body = [line] if arrow_flow else []
''',
        '''            title = "업무 흐름도" if arrow_flow else line
            title_from_source = not arrow_flow
            body = [line] if arrow_flow else []
''',
    ),
]

for old, new in replacements:
    if old not in text:
        raise RuntimeError("원문 줄 수 교체 구문을 찾지 못했습니다.")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
