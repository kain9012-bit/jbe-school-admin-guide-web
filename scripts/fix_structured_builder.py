from pathlib import Path


path = Path(__file__).with_name("build_structured_chapters.py")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        '''                "flowStep": "",
            }
        )
        sequence.append(title)
        sequence.extend(body)
        body = []
''',
        '''                "flowStep": "",
                "sourceLineCount": len(body) + (0 if title.startswith("매뉴얼 ") else 1),
            }
        )
        body = []
''',
    ),
    (
        '''    for line in lines:
        arrow_flow = "▶" in line and len(line) <= 180
''',
        '''    for line in lines:
        sequence.append(line)
        arrow_flow = "▶" in line and len(line) <= 180
''',
    ),
    (
        '''            total_structured_lines += sum(
                1 + len(block["body"].splitlines()) if block["body"] else 1
                for block in blocks
            )
''',
        '''            total_structured_lines += sum(block["sourceLineCount"] for block in blocks)
''',
    ),
]

for old, new in replacements:
    if old not in text:
        raise RuntimeError("구조화 생성기 교체 구문을 찾지 못했습니다.")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
