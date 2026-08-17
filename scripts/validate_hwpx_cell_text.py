"""표 칸의 글에 쪽 머리글·꼬리글이 끼어들지 않았는지 확인합니다.

표가 쪽을 넘어가면 한글은 그 자리에서 쪽 머리글을 다시 정의합니다.
그런데 그 정의를 칸 안의 문단 속에 넣어 둡니다. 칸 아래를 아무 생각 없이
다 훑으면 머리글 글자가 칸 글 한가운데 끼어듭니다.

    제7편 '2. 급여 작업' 표
    …가장 유의해야 할 작업[제7편 공무원 보수]대상자 생성을 다시 했을 경우…

이러면 이 표는 kordoc이 읽은 글과 글자가 달라집니다.
build_chapters_from_hwpx.mjs는 글자가 같은 것끼리 짝지어 칸 주소를
가져오므로, 짝을 못 찾은 표는 병합과 열 너비를 통째로 잃습니다.
실제로 제7편 '2. 급여 작업' 표에서 '기본사항관리'의 3줄 세로 병합이 풀리고
왼쪽 열이 쓸데없이 넓어졌습니다. 이런 표가 6개 편에 48개 있었습니다.

사용법: python3 scripts/validate_hwpx_cell_text.py
"""

from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))

from read_hwpx_tables import SKIP_SUBTREE, SOURCES, cell_text, local_name  # noqa: E402

SECTION_RE = re.compile(r"^Contents/section(\d+)\.xml$")


def side_texts(cell: ET.Element) -> list[str]:
    """칸 안에 들어앉은 머리글·꼬리글 같은 곁가지의 글자입니다."""
    found = []
    for node in cell.iter():
        if local_name(node.tag).lower() not in SKIP_SUBTREE:
            continue
        text = re.sub(r"\s+", "", "".join(node.itertext()))
        if len(text) >= 2:
            found.append(text)
    return found


def main() -> None:
    problems = []
    cells_checked = 0
    for chapter, path in sorted(SOURCES.items(), key=lambda item: int(item[0])):
        with zipfile.ZipFile(path) as archive:
            names = sorted(
                (name for name in archive.namelist() if SECTION_RE.match(name)),
                key=lambda name: int(SECTION_RE.match(name).group(1)),
            )
            for name in names:
                root = ET.fromstring(archive.read(name))
                for cell in root.iter():
                    if local_name(cell.tag) != "tc":
                        continue
                    sides = side_texts(cell)
                    if not sides:
                        continue
                    cells_checked += 1
                    packed = re.sub(r"\s+", "", cell_text(cell))
                    for side in sides:
                        if side and side in packed:
                            problems.append(
                                f"제{chapter}편 {name}: 표 칸의 글에 쪽 머리글이 "
                                f"끼어들었습니다 ('{side[:24]}')."
                            )
                            break

    if problems:
        for line in problems[:20]:
            print(f"  - {line}", file=sys.stderr)
        print(f"\n칸 글에 곁가지가 섞인 표 {len(problems)}개", file=sys.stderr)
        raise SystemExit(1)
    print(f"쪽 머리글이 든 표 칸 {cells_checked}개 모두 칸 글이 깨끗합니다.")


if __name__ == "__main__":
    main()
