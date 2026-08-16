"""한글파일(HWPX)에서 표의 칸 주소를 그대로 읽어 냅니다.

표 구조를 칸 목록의 '차례'로 짐작하면 안 됩니다. 문서에 따라 병합에 가려진
자리의 빈 칸이 들어 있기도 하고 없기도 해서, 차례만 보면 한 칸씩 밀립니다.
실제로 '구 분'이 2칸 2줄을 차지하는 근무성적평정 표가 통째로 밀렸습니다.

HWPX에는 칸마다 자리와 크기가 그대로 적혀 있습니다.

    <hp:tc>
      <hp:cellAddr colAddr="0" rowAddr="0"/>
      <hp:cellSpan colSpan="2" rowSpan="2"/>
      …글자…

이 값을 읽으면 짐작할 것이 없습니다.

사용법: python3 scripts/read_hwpx_tables.py > tmp/hwpx-tables.json
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

def sources() -> dict[str, Path]:
    """source/manual-hwpx 안의 편별 한글파일을 모두 찾습니다."""
    found: dict[str, Path] = {}
    for path in sorted((ROOT / "source" / "manual-hwpx").glob("*.hwpx")):
        match = re.match(r"제(\d+)편", path.name)
        if match:
            found[match.group(1)] = path
    return found


SOURCES = sources()


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


# 한컴이 함초롬 글꼴의 개인용 영역(PUA)에 넣어 둔 기호입니다. 유니코드에 없는
# 자리라 그대로 두면 화면에 네모로 보입니다. 원문 PDF에서 그 자리에 무엇이
# 찍혀 있는지 확인해 바꿔 답니다. build_chapters_from_hwpx.mjs의 HNC_SYMBOL과
# 같아야 합니다.
HNC_SYMBOL = {
    "\U000f003b": "\u21e9",  # 제4편 외부강의 절차도의 아래 화살표
    "\U000f02fb": "\u2023",  # 제7편 보수작업의 글머리표
}
PUA = re.compile("[\U000f0000-\U000ffffd]")


def unsymbol(value: str) -> str:
    return PUA.sub(lambda mark: HNC_SYMBOL.get(mark.group(0), "\u25aa"), value)


def cell_text(cell: ET.Element) -> str:
    """칸 안의 글을 문단 차례대로 모읍니다. 문단이 바뀌면 줄을 바꿉니다."""
    lines: list[str] = []
    for paragraph in cell.iter():
        if local_name(paragraph.tag) != "p":
            continue
        # <hp:t> 안에 글자 꾸밈 태그가 끼어 있기도 합니다.
        # .text만 읽으면 '유· 초 · 중'이 '유·'로 잘립니다.
        pieces = [
            "".join(node.itertext())
            for node in paragraph.iter()
            if local_name(node.tag) == "t"
        ]
        line = re.sub(r"\s+", " ", unsymbol("".join(pieces))).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def read_table(table: ET.Element) -> dict:
    cells = []
    for cell in table.iter():
        if local_name(cell.tag) != "tc":
            continue
        address = next((node for node in cell if local_name(node.tag) == "cellAddr"), None)
        span = next((node for node in cell if local_name(node.tag) == "cellSpan"), None)
        # 칸 너비도 함께 읽습니다. 매뉴얼을 만든 사람이 정해 둔 열 너비이므로
        # 화면에서도 그대로 쓰면 사람이 보기에 가장 자연스럽습니다.
        size = next((node for node in cell if local_name(node.tag) == "cellSz"), None)
        if address is None:
            continue
        cells.append(
            {
                "col": int(address.get("colAddr", "0")),
                "row": int(address.get("rowAddr", "0")),
                "colSpan": int(span.get("colSpan", "1")) if span is not None else 1,
                "rowSpan": int(span.get("rowSpan", "1")) if span is not None else 1,
                "width": int(size.get("width", "0")) if size is not None else 0,
                "text": cell_text(cell),
            }
        )
    if not cells:
        return {"rows": 0, "cols": 0, "cells": []}

    rows = max(cell["row"] + cell["rowSpan"] for cell in cells)
    cols = max(cell["col"] + cell["colSpan"] for cell in cells)
    cells.sort(key=lambda cell: (cell["row"], cell["col"]))
    return {"rows": rows, "cols": cols, "cells": cells}


def tables_of(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as archive:
        names = sorted(
            (name for name in archive.namelist() if SECTION_RE.match(name)),
            key=lambda name: int(SECTION_RE.match(name).group(1)),
        )
        found = []
        for name in names:
            root = ET.fromstring(archive.read(name))
            # 표 안에 표가 또 있을 수 있습니다. 바깥 표부터 문서 차례대로 모읍니다.
            for element in root.iter():
                if local_name(element.tag) == "tbl":
                    found.append(read_table(element))
        return found


def main() -> None:
    out = {}
    for chapter, path in SOURCES.items():
        out[chapter] = tables_of(path)
        print(f"제{chapter}편 표 {len(out[chapter])}개", file=sys.stderr)
    target = ROOT / "tmp" / "hwpx-tables.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"{target}에 저장했습니다.", file=sys.stderr)


if __name__ == "__main__":
    main()
