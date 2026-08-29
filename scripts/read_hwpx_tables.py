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


def fill_pictures(archive: zipfile.ZipFile) -> dict[str, str]:
    """칸 바탕에 그림을 깐 테두리 모음을 모읍니다.

    매뉴얼은 사진을 칸 안에 넣지 않고 **칸 바탕**으로 까는 자리가 있습니다.

        제12편 물품대장 예시 — 글 없는 칸 둘의 바탕이 물품 사진입니다
                               (borderFill 150·151 → image1·image2)

    이 자리를 읽지 않으면 사진이 통째로 사라집니다. 화면에는 빈 칸 둘만
    남습니다.
    """
    try:
        root = ET.fromstring(archive.read("Contents/header.xml"))
    except KeyError:
        return {}
    found: dict[str, str] = {}
    for element in root.iter():
        if local_name(element.tag) != "borderFill":
            continue
        for node in element.iter():
            if local_name(node.tag) == "img" and node.get("binaryItemIDRef"):
                found[element.get("id")] = node.get("binaryItemIDRef")
                break
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


IMAGE_MARK = "[[그림:{}]]"


def picture_name(node: ET.Element) -> str:
    """그림이 부르는 한글파일 안 이름입니다(binaryItemIDRef)."""
    for element in node.iter():
        for key, value in element.attrib.items():
            if local_name(key) == "binaryItemIDRef" and value:
                return value
    return ""


# 도형 안에 든 그림은 자리 표시를 남기지 않습니다. 매뉴얼은 절차도를 네모와
# 화살표로 그리고 그 안에 그림을 끼워 넣기도 하는데, 그 자리는 도형 쪽에서
# 따로 되살립니다(아래 shape_grid). 여기서 자리 표시까지 남기면 글줄 수가
# 달라져 도형 표가 제 자리를 찾지 못합니다(제1편 '비전자기록물 이관').
SHAPE_HOLDERS = {"container", "rect", "polygon", "line", "ellipse", "arc", "curve"}


def text_pieces(node: ET.Element, in_shape: bool = False):
    """문단에 찍힌 글자를 모읍니다. 여기서도 곁가지는 건너뜁니다.

    **칸에 든 그림도 글자와 같은 자리에 담아 옵니다.**

    매뉴얼은 표 칸에 사진을 넣습니다. 사진이 곧 그 칸의 내용입니다.

        제12편 물품관리 '3. 전자태그 및 장비' — 태그 종류
        구분        | 태그 사진 | 특징
        라벨형 태그 | [사진]    | ◦적용물품: TV, 모니터, …
        메탈 태그   | [사진]    | ◦적용물품: 금속성분 및 …

    글자만 읽으면 그 칸은 빈 칸이 됩니다. 실제로 표 칸에 든 그림 66장이
    화면에 한 장도 실리지 않았습니다.

    그림이 놓인 자리에 '[[그림:image21]]'을 남기면 화면이 그 자리에 사진을
    그립니다(docs/assets/structured-details.js의 withPictures).
    """
    for child in node:
        name = local_name(child.tag).lower()
        if name in SKIP_SUBTREE:
            continue
        # <hp:t> 안에 글자 꾸밈 태그가 끼어 있기도 합니다.
        # .text만 읽으면 '유· 초 · 중'이 '유·'로 잘립니다.
        if name == "t":
            yield "".join(child.itertext())
        elif name == "pic":
            found = "" if in_shape else picture_name(child)
            if found:
                yield IMAGE_MARK.format(found)
        else:
            yield from text_pieces(child, in_shape or name in SHAPE_HOLDERS)


# 글자가 없는 칸이라고 빈 칸이 아닙니다.
#
# 매뉴얼은 절차의 화살표를 글자가 아니라 도형(hp:polygon)으로 그립니다.
# 칸에 글자가 없으니 빈 칸으로 보이고, 빌더가 그 열을 통째로 걷어냅니다.
# 그러면 절차가 이어지는 그림이 낱개 상자 여섯 개로 흩어집니다.
#
#   제1편 신원조사 '행정정보공동이용 시스템 e하나로민원 권한신청 및 이용'
#   원문 : [1. 서약 서명] ⇨ [2. 사용 신청] ⇨ [3. 열람 권한 신청] ⇨ …
#   예전 : [1. 서약 서명] [2. 사용 신청] [3. 열람 권한 신청]
#
# 화살표 도형에는 꼭짓점(hp:pt)이 적혀 있습니다. 가장 튀어나온 꼭짓점이
# 어느 쪽에 있고 그 반대 축의 한가운데인지를 보면 방향을 알 수 있습니다.
ARROW_MARK = {"right": "\u21e8", "left": "\u21e6", "down": "\u21e9", "up": "\u21e7"}
# 꼭짓점이 반대 축 한가운데에서 이만큼 안에 있어야 뾰족한 끝으로 봅니다.
ARROW_MIDDLE = 0.2


def arrow_way(shape: ET.Element) -> str:
    """화살표 도형이 어느 쪽을 가리키는지 봅니다. 화살표가 아니면 빈 글입니다."""
    points = [
        (int(pt.get("x", "0")), int(pt.get("y", "0")))
        for pt in shape.iter()
        if local_name(pt.tag) == "pt"
    ]
    if len(points) < 4:
        return ""
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    wide = max(xs) - min(xs)
    tall = max(ys) - min(ys)
    if wide <= 0 or tall <= 0:
        return ""
    middle_x = (max(xs) + min(xs)) / 2
    middle_y = (max(ys) + min(ys)) / 2
    # 네 방향마다, 가장 튀어나온 꼭짓점이 반대 축 한가운데에서 얼마나
    # 벗어나 있는지를 잽니다. 가장 적게 벗어난 쪽이 뾰족한 끝입니다.
    off = {
        "right": abs(min(y for x, y in points if x == max(xs)) - middle_y) / tall,
        "left": abs(min(y for x, y in points if x == min(xs)) - middle_y) / tall,
        "down": abs(min(x for x, y in points if y == max(ys)) - middle_x) / wide,
        "up": abs(min(x for x, y in points if y == min(ys)) - middle_x) / wide,
    }
    way = min(off, key=off.get)
    if off[way] > ARROW_MIDDLE:
        return ""
    # 도형을 돌려 놓은 자리가 있습니다. 돌린 만큼 방향도 돌립니다.
    turn = next((e for e in shape if local_name(e.tag) == "rotationInfo"), None)
    angle = int(float(turn.get("angle", "0"))) % 360 if turn is not None else 0
    order = ["right", "down", "left", "up"]
    way = order[(order.index(way) + round(angle / 90)) % 4]
    return ARROW_MARK[way]


def arrows_in(cell: ET.Element) -> str:
    """칸에 그려진 화살표 도형을 모읍니다. 칸 안에 든 표로는 내려가지 않습니다."""
    found = []
    def walk(node: ET.Element) -> None:
        for child in node:
            name = local_name(child.tag)
            if name in SKIP_SUBTREE or name == "tbl":
                continue
            if name == "polygon":
                mark = arrow_way(child)
                if mark:
                    found.append(mark)
                continue
            walk(child)
    walk(cell)
    return "".join(found)


def cell_text(cell: ET.Element) -> str:
    """칸 안의 글을 문단 차례대로 모읍니다. 문단이 바뀌면 줄을 바꿉니다.

    문단 앞의 공백은 지우지 않고 한 칸으로 줄여 남깁니다. 매뉴얼은 한 문장이
    길어 다음 줄로 넘길 때 그 줄만 한두 칸 들여 씁니다. 그 들여쓰기가 '앞줄에
    이어지는 줄'이라는 표시입니다. 지워 버리면 이어지는 줄과 새 항목을 가릴
    길이 없어, 화면 쪽이 둘 다 앞줄에 붙여 한 덩어리로 만들어 버립니다.

        ◦발신 명의 표시의 마지막 글자가 공인의
          가운데 오도록 날인            ← 앞줄에 이어지는 줄(들여씀)

        ｢병역법｣ … 훈련에 참가할 때
        공무에 관하여 국회, 법원, … 소환될 때   ← 저마다 따로 선 사유(안 들여씀)
    """
    lines: list[str] = []
    for paragraph in paragraphs_of(cell):
        raw = unsymbol("".join(text_pieces(paragraph)))
        line = re.sub(r"\s+", " ", raw).strip()
        if line:
            lines.append((" " if raw[:1].isspace() else "") + line)
    if not lines:
        # 글자가 없는 칸이라고 빈 칸이 아닙니다. 화살표가 그려져 있을 수 있습니다.
        return arrows_in(cell)
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


def backdrop_text(cell: ET.Element, backdrops: dict[str, str]) -> str:
    """칸의 글을 읽되, 글이 없고 바탕에 사진이 깔린 칸은 그 사진을 냅니다."""
    said = cell_text(cell)
    if said.strip():
        return said
    picture = backdrops.get(cell.get("borderFillIDRef") or "")
    return IMAGE_MARK.format(picture) if picture else said


def read_table(
    table: ET.Element, fills: dict[str, str], backdrops: dict[str, str] | None = None
) -> dict:
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
                "text": backdrop_text(cell, backdrops or {}),
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


# ── 도형으로 그린 표 ────────────────────────────────────────────────────
#
# 매뉴얼은 절차도를 표가 아니라 네모(hp:rect)와 선(hp:line)으로 그리기도 합니다.
# 그러면 칸 하나하나가 따로 노는 도형이라, 글자를 읽는 쪽에서는 칸 구분 없이
# 통째로 이어 붙습니다.
#
#   제1편 '5. 비전자기록물 이관 및 폐기 절차'
#   원문 : ┌업무주체┬주요업무┬업무내용┐
#          ├학교기록물담당자┼이관대상 추출┼◦K-에듀파인시스템에서…┤
#   화면 : 업무주체주요업무업무내용학교기록물담당자이관대상 추출◦K-에듀파인…
#
# 네모마다 자리(hp:offset)와 크기(hp:curSz)가 적혀 있습니다. 같은 줄에 선
# 것끼리 묶으면 표로 되살릴 수 있습니다.
SHAPE_LEAST = 3  # 글자가 든 네모가 이만큼은 있어야 표로 봅니다


def clusters(values: list[int], gap: int) -> list[int]:
    """가까이 붙은 자리를 한 줄(또는 한 열)로 묶어 그 시작값을 냅니다."""
    starts: list[int] = []
    for value in sorted(set(values)):
        if starts and value - starts[-1] <= gap:
            continue
        starts.append(value)
    return starts


def slot_of(starts: list[int], value: int) -> int:
    at = 0
    for index, start in enumerate(starts):
        if value >= start:
            at = index
    return at


def shape_grid(container: ET.Element) -> dict | None:
    """네모 도형으로 그린 표를 칸 주소가 있는 표로 되살립니다."""
    boxes = []
    for rect in container:
        if local_name(rect.tag) != "rect":
            continue
        offset = next((e for e in rect if local_name(e.tag) == "offset"), None)
        size = next(
            (e for e in rect if local_name(e.tag) in ("curSz", "orgSz")), None
        )
        if offset is None or size is None:
            continue
        text = cell_text(rect)
        if not text.strip():
            continue
        boxes.append(
            {
                "x": int(offset.get("x", "0")),
                "y": int(offset.get("y", "0")),
                "w": int(size.get("width", "0")),
                "h": int(size.get("height", "0")),
                "text": text,
            }
        )
    if len(boxes) < SHAPE_LEAST:
        return None

    widths = sorted(box["w"] for box in boxes)
    heights = sorted(box["h"] for box in boxes)
    middle_width = widths[len(widths) // 2] or 1
    middle_height = heights[len(heights) // 2] or 1
    columns = clusters([box["x"] for box in boxes], middle_width // 3)
    rows = clusters([box["y"] for box in boxes], middle_height // 2)
    if len(columns) < 2 or len(rows) < 2:
        return None

    cells = []
    for box in boxes:
        column = slot_of(columns, box["x"])
        row = slot_of(rows, box["y"])
        # 여러 열에 걸쳐 그린 네모가 있습니다. 오른쪽 끝이 어느 열까지
        # 닿는지를 보고 걸친 칸 수를 셉니다.
        span = 1
        for index in range(column + 1, len(columns)):
            if columns[index] < box["x"] + box["w"] - middle_width // 3:
                span += 1
        cells.append(
            {
                "col": column,
                "row": row,
                "colSpan": span,
                "rowSpan": 1,
                "width": box["w"],
                "text": box["text"],
                # 네모는 저마다 테두리가 그려져 있습니다.
                "border": "ssss",
            }
        )
    # 같은 자리에 둘이 겹치면 표로 되살릴 수 없습니다. 그대로 둡니다.
    seen = {(cell["row"], cell["col"]) for cell in cells}
    if len(seen) != len(cells):
        return None
    cells.sort(key=lambda cell: (cell["row"], cell["col"]))
    return {
        "rows": len(rows),
        "cols": len(columns),
        "cells": cells,
        # 도형으로 그린 표라는 표시입니다. 글자가 이어 붙어 오므로 빌더가
        # 그 자리를 글자로 찾아야 합니다.
        "shapes": True,
    }


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
        backdrops = fill_pictures(archive)
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
                grid = read_table(element, fills, backdrops)
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

            # 도형으로 그린 표도 같은 목록에 담습니다. 어느 칸(또는 어느
            # 문단)에 그려져 있는지를 함께 적어 두어야 빌더가 그 자리에
            # 표를 그립니다.
            for element in root.iter():
                if local_name(element.tag) != "container":
                    continue
                grid = shape_grid(element)
                if grid is None:
                    continue
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


def running_heads(path: Path) -> list[str]:
    """쪽 머리글·꼬리글에 적힌 글을 모읍니다.

    한글파일은 쪽마다 되풀이되는 머리글을 hp:header·hp:footer 안에 따로
    적어 둡니다('제8편 교육공무직원', '2025학년도 학교행정업무 길라잡이 ___').
    본문이 아니라 지면 장식입니다.

    그런데 글자를 읽어 오는 쪽(kordoc)은 이것을 보통 문단처럼 함께 담아
    옵니다. 그대로 실으면 업무 본문 한가운데에 편 이름과 표지 글이, 머리글에
    깔린 띠 그림까지 끼어듭니다(제8편 교육공무직원 복무).

    무엇이 머리글인지는 한글파일이 이미 말해 주고 있으므로, 여기서 그 글을
    그대로 적어 두고 빌더가 그 문단만 걷어 냅니다.
    """
    found: set[str] = set()
    with zipfile.ZipFile(path) as archive:
        for name in sorted(n for n in archive.namelist() if SECTION_RE.match(n)):
            root = ET.fromstring(archive.read(name))
            for node in root.iter():
                if local_name(node.tag).lower() not in ("header", "footer"):
                    continue
                for paragraph in [x for x in node.iter() if local_name(x.tag) == "p"]:
                    said = "".join(
                        "".join(piece.itertext())
                        for piece in paragraph.iter()
                        if local_name(piece.tag) == "t"
                    ).strip()
                    if said:
                        found.add(said)
    return sorted(found)


def main() -> None:
    out = {}
    heads = {}
    for chapter, path in SOURCES.items():
        out[chapter] = tables_of(path)
        heads[chapter] = running_heads(path)
        print(f"제{chapter}편 표 {len(out[chapter])}개", file=sys.stderr)
    target = ROOT / "tmp" / "hwpx-tables.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"{target}에 저장했습니다.", file=sys.stderr)
    beside = ROOT / "tmp" / "hwpx-headers.json"
    beside.write_text(json.dumps(heads, ensure_ascii=False), encoding="utf-8")
    print(f"{beside}에 쪽 머리글을 저장했습니다.", file=sys.stderr)


if __name__ == "__main__":
    main()
