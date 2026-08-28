"""쪽 머리글·꼬리글이 본문에 실리지 않았는지 한글파일과 대조합니다.

한글파일은 쪽마다 되풀이되는 머리글을 hp:header·hp:footer 안에 따로 적어
둡니다. 본문이 아니라 지면 장식입니다.

    제8편 교육공무직원              ← 왼쪽 머리글
    2025학년도 학교행정업무 길라잡이 ___   ← 오른쪽 머리글('___'은 쪽 번호 자리)

그런데 글자를 읽어 오는 쪽(kordoc)은 이것을 보통 문단처럼 함께 담아 옵니다.
그대로 실으면 업무 본문 한가운데에 편 이름과 표지 글이 끼어들고, 머리글에
깔린 띠 그림까지 본문 그림으로 실립니다.

    제8편 교육공무직원 복무
    예전 화면 : 본문 끝에 '2025학년도 학교행정업무 길라잡이 ___'와
                색색의 띠 그림이 한 덩이로 실렸습니다.

무엇이 머리글인지는 한글파일이 이미 말해 줍니다. 짐작할 것이 없습니다.

여기서는 만들어 낸 중간 파일을 믿지 않고 **한글파일을 직접 엽니다**.
중간 파일만 보면, 머리글을 읽어 두는 쪽을 꺼도 '읽은 것이 없으니 문제도
없다'가 되어 아무것도 지키지 못합니다.

줄 전체가 머리글과 같을 때만 봅니다. '【제10편 학교운영위원회】참조'처럼
본문이 다른 편을 가리키는 말은 머리글이 아닙니다.

사용법: python3 scripts/validate_running_heads.py
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SECTION_RE = re.compile(r"^Contents/section(\d+)\.xml$")
IMAGE_MARK = re.compile(r"\[\[그림:[^\]]*\]\]")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def squash(value: str) -> str:
    return re.sub(r"\s+", "", IMAGE_MARK.sub("", str(value or "")))


def running_heads(path: Path) -> set[str]:
    """한글파일에서 쪽 머리글·꼬리글에 적힌 글을 모읍니다."""
    found: set[str] = set()
    with zipfile.ZipFile(path) as archive:
        for name in sorted(n for n in archive.namelist() if SECTION_RE.match(n)):
            root = ET.fromstring(archive.read(name))
            for node in root.iter():
                if local_name(node.tag).lower() not in ("header", "footer"):
                    continue
                for paragraph in [x for x in node.iter() if local_name(x.tag) == "p"]:
                    said = squash(
                        "".join(
                            "".join(piece.itertext())
                            for piece in paragraph.iter()
                            if local_name(piece.tag) == "t"
                        )
                    )
                    if said:
                        found.add(said)
    return found


def chapter_data(chapter: int) -> dict | None:
    file = ROOT / "docs" / "assets" / f"chapter{chapter}-data.js"
    if not file.exists():
        return None
    raw = file.read_text(encoding="utf-8")
    raw = raw.replace(f"window.CHAPTER{chapter}_DATA = ", "", 1).rstrip().rstrip(";")
    return json.loads(raw)


def lines_of(data: dict):
    """화면 자료에 실린 줄을 모두 냅니다(본문과 표 칸)."""

    def walk(tables, where):
        for table in tables or []:
            for row in [table.get("headers") or []] + (table.get("rows") or []):
                for cell in row:
                    if not cell:
                        continue
                    for line in str(cell.get("text") or "").split("\n"):
                        yield line, where
                    if cell.get("tables"):
                        yield from walk(cell["tables"], where)

    for work in data.get("sections") or []:
        for block in work.get("contentBlocks") or []:
            where = f"{work.get('title')} [{block.get('title') or block.get('id')}]"
            for line in str(block.get("body") or "").split("\n"):
                yield line, where
            yield from walk(block.get("tables"), where)


def main() -> None:
    problems: list[str] = []
    checked = 0
    for path in sorted((ROOT / "source" / "manual-hwpx").glob("*.hwpx")):
        match = re.match(r"제(\d+)편", path.name)
        if not match:
            continue
        chapter = int(match.group(1))
        data = chapter_data(chapter)
        if data is None:
            continue
        heads = running_heads(path)
        if not heads:
            continue
        checked += len(heads)
        for line, where in lines_of(data):
            if squash(line) in heads:
                problems.append(
                    f"제{chapter:02d}편 {where}: 쪽 머리글이 본문에 실렸습니다 "
                    f"('{line.strip()[:40]}')."
                )

    if problems:
        for line in problems[:20]:
            print(f"  - {line}", file=sys.stderr)
        print(f"\n본문에 실린 쪽 머리글 {len(problems)}건", file=sys.stderr)
        raise SystemExit(1)

    print(f"쪽 머리글·꼬리글 {checked}가지가 본문에 실리지 않았습니다.")


if __name__ == "__main__":
    main()
