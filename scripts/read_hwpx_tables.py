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


# 칸마다 어느 쪽에 선을 긋는지가 한글파일에 그대로 적혀 있습니다.
#
# 매뉴얼은 표로 그림을 그릴 때 이 선으로 모양을 만듭니다.
#
#   제1편 기록물 관리 TIP '서가배치'
#   굵은 선(1.0mm) = 서가 기둥, 얇은 선(0.12mm) = 선반, NONE = 트인 쪽
#
# 이것을 읽지 않고 모든 칸에 똑같은 선을 그으면, 서가 그림이 스물일곱 열짜리
# 모눈종이가 됩니다. 실제로 그랬습니다.
#
# 칸마다 네 쪽을 한 글자씩 적습니다(왼·오른·위·아래).
#   n 없음   s 얇은 실선   S 굵은 실선(0.4mm 이상)   d 점선
LINE_NONE = "n"


def line_code(kind: str | None, width: str | None) -> str:
    """선 하나를 한 글자로 줄입니다."""
    name = (kind or "NONE").upper()
    if name in ("NONE", ""):
        return LINE_NONE
    if "DASH" in name or "DOT" in name:
        return "d"
    try:
        millimetres = float(str(width or "0").replace("mm", "").strip())
    except ValueError:
        millimetres = 0.1
    return "S" if millimetres >= 0.4 else "s"


def border_fills(archive: zipfile.ZipFile) -> dict[str, str]:
    """머리말에 적힌 테두리 모음을 칸 테두리 글자로 바꿔 둡니다."""
    try:
        root = ET.fromstring(archive.read("Contents/header.xml"))
    except KeyError:
        return {}
    found: dict[str, str] = {}
    for element in root.iter():
        if local_name(element.tag) != "borderFill":
            continue
        sides = []
        for side in ("leftBorder", "rightBorder", "topBorder", "bottomBorder"):
            border = next((c for c in element if local_name(c.tag) == side), None)
            sides.append(
                line_code(border.get("type"), border.get("width"))
                if border is not None
                else LINE_NONE
            )
        found[element.get("id")] = "".join(sides)
    return found


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


# 쪽 머리글·꼬리글은 칸에 적힌 글이 아닙니다. 그런데 표가 쪽을 넘어가면
# 한글이 그 자리에서 머리글을 다시 정의하고, 하필 그 정의를 칸 안의 문단
# 속에 넣어 둡니다. 아래로 다 훑으면 머리글 글자가 칸 글 한가운데 끼어듭니다.
#
#   제7편 '2. 급여 작업' 표
#   …가장 유의해야 할 작업[제7편 공무원 보수]대상자 생성을 다시 했을 경우…
#
# 이러면 이 표는 kordoc이 읽은 글과 글자가 달라져 짝을 찾지 못합니다.
# 짝을 못 찾은 표는 병합과 열 너비를 통째로 잃고 한 칸짜리 격자가 됩니다.
# 그래서 머리글·꼬리글·주석 같은 곁가지는 아예 내려가지 않습니다.
SKIP_SUBTREE = {"header", "footer", "footnote", "endnote", "hiddencomment"}


def paragraphs_of(node: ET.Element):
    """칸의 문단을 문서 차례대로 냅니다. 문단 속으로는 내려가지 않습니다.

    한 문단 안에 표나 글상자가 들어앉고, 그 안에 또 문단이 있습니다.
    그 속의 글은 아래 text_pieces가 자리 그대로 담아 옵니다. 그런데 여기서
    또 내려가 안쪽 문단을 따로 내면 같은 글이 두 번 실립니다.
    실제로 제1편 '비전자기록물 이관' 표의 칸 글이 원문의 갑절이 되어,
    kordoc이 읽은 글과 달라져 표가 짝을 잃었습니다.
    """
    for child in node:
        name = local_name(child.tag).lower()
        if name in SKIP_SUBTREE:
            continue
        if name == "p":
            yield child
            continue
        yield from paragraphs_of(child)


def text_pieces(node: ET.Element):
    """문단에 찍힌 글자를 모읍니다. 여기서도 곁가지는 건너뜁니다."""
    for child in node:
        name = local_name(child.tag).lower()
        if name in SKIP_SUBTREE:
            continue
        # <hp:t> 안에 글자 꾸밈 태그가 끼어 있기도 합니다.
        # .text만 읽으면 '유· 초 · 중'이 '유·'로 잘립니다.
        if name == "t":
            yield "".join(child.itertext())
        else:
            yield from text_pieces(child)


def cell_text(cell: ET.Element) -> str:
    """칸 안의 글을 문단 차례대로 모읍니다. 문단이 바뀌면 줄을 바꿉니다."""
    lines: list[str] = []
    for paragraph in paragraphs_of(cell):
        line = re.sub(r"\s+", " ", unsymbol("".join(text_pieces(paragraph)))).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def cells_of(table: ET.Element):
    """이 표의 칸만 냅니다. 칸 안에 든 다른 표로는 내려가지 않습니다.

    칸 안에 표가 또 들어 있는 자리가 있습니다. 아래로 다 훑으면 안쪽 표의
    칸까지 바깥 표의 칸으로 딸려 옵니다. 두 표의 칸 주소는 서로 다른
    좌표인데, 이것을 한 격자에 섞어 놓고 (행, 열)로 줄을 세우면
    격자가 통째로 엉킵니다.

        제7편 '구비서류' 표(3열)
        XML  : 구분 구분 번호 직무수행 서류명 출퇴근중 번호 구비서류 …
        kordoc: 구분 구비서류 비고 공통서류 1.공무상요양승인신청서 …

    이렇게 글자가 달라지면 kordoc이 읽은 표와 짝을 찾지 못하고,
    그 표는 병합과 열 너비를 통째로 잃습니다.

    칸 안의 글은 cell_text가 안쪽 표까지 읽어 옵니다. kordoc도 안쪽 표를
    바깥 칸의 글로 펴서 담으므로, 그래야 두 쪽의 글자가 같아집니다.
    """
    for child in table:
        name = local_name(child.tag)
        if name == "tbl":
            continue
        if name == "tc":
            yield child
            continue
        yield from cells_of(child)


def read_table(table: ET.Element, fills: dict[str, str]) -> dict:
    cells = []
    for cell in cells_of(table):
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
                # 줄 높이도 읽습니다. 빈 대장 서식은 적어 넣을 자리가 곧
                # 내용이라, 높이를 버리면 줄이 종잇장처럼 납작해집니다.
                "height": int(size.get("height", "0")) if size is not None else 0,
                "text": cell_text(cell),
                # 이 칸의 네 쪽 테두리입니다. 매뉴얼이 표로 그린 그림은
                # 이 선이 곧 모양입니다.
                "border": fills.get(cell.get("borderFillIDRef"), ""),
            }
        )
    if not cells:
        return {"rows": 0, "cols": 0, "cells": []}

    rows = max(cell["row"] + cell["rowSpan"] for cell in cells)
    cols = max(cell["col"] + cell["colSpan"] for cell in cells)
    cells.sort(key=lambda cell: (cell["row"], cell["col"]))
    return {"rows": rows, "cols": cols, "cells": cells}


def enclosing(parents: dict, node: ET.Element) -> tuple[ET.Element | None, ET.Element | None]:
    """이 표를 담고 있는 바깥 표와 그 칸을 찾습니다.

    칸 안에 든 표는 '그 칸의 글'이 아니라 그 칸에 그려진 표입니다.
    어느 칸에 들었는지 적어 두지 않으면, 나중에 그 표를 되살릴 자리를
    알 수 없습니다.
    """
    cell = None
    at = parents.get(id(node))
    while at is not None:
        name = local_name(at.tag)
        if name == "tc" and cell is None:
            cell = at
        elif name == "tbl":
            return at, cell
        at = parents.get(id(at))
    return None, None


def tables_of(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as archive:
        names = sorted(
            (name for name in archive.namelist() if SECTION_RE.match(name)),
            key=lambda name: int(SECTION_RE.match(name).group(1)),
        )
        fills = border_fills(archive)
        found = []
        for name in names:
            root = ET.fromstring(archive.read(name))
            # 파이썬 XML에는 부모를 거슬러 올라가는 길이 없어 따로 적어 둡니다.
            parents = {id(child): node for node in root.iter() for child in node}
            # 표 안에 표가 또 있을 수 있습니다. 바깥 표부터 문서 차례대로 모읍니다.
            here = [
                element for element in root.iter() if local_name(element.tag) == "tbl"
            ]
            index_of = {id(element): len(found) + at for at, element in enumerate(here)}
            for element in here:
                grid = read_table(element, fills)
                outer, cell = enclosing(parents, element)
                if outer is not None and cell is not None and id(outer) in index_of:
                    address = next(
                        (node for node in cell if local_name(node.tag) == "cellAddr"), None
                    )
                    if address is not None:
                        grid["parent"] = index_of[id(outer)]
                        grid["parentCell"] = {
                            "row": int(address.get("rowAddr", "0")),
                            "col": int(address.get("colAddr", "0")),
                        }
                found.append(grid)
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
