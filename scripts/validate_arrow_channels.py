"""상자와 상자 사이 '화살표 통로'가 화면에도 남아 있는지 한글파일과 대조합니다.

매뉴얼은 절차도를 표로 그립니다. 상자는 네 면을 다 두른 칸이고, 상자와 상자
사이는 **두 면만 그은 칸**입니다. 그 칸에는 화살표만 들어 있습니다.

    제19편 물품 관리 '1. 처리 절차' (칸 안에 든 3행 3열 표)
      ssss[재물조사]      ssnn[≫]      ssss[불용 결정]
      ssss[물품등록…]                  ssss[모든 물품]
      ssss[폐지학교]                   ssss[폐지학교]

    ssnn = 왼·오른에만 선, 위·아래는 트임.
    곧 이 칸은 상자가 아니라 **상자와 상자 사이 통로**입니다. 종이에서는
    두 상자가 따로 서고 그 사이 빈자리에 ≫가 놓입니다.

이 테두리를 버리고 여느 표처럼 격자로 그리면, 통로에도 위아래 선이 그어져
화살표가 세 번째 상자가 되어 버립니다. 실제로 그랬습니다.

    예전 화면 : ┌재물조사┬≫┬불용 결정┐   ← ≫가 상자 안에 갇힘
                ├물품등록┤  ├모든 물품┤
                └폐지학교┴  ┴폐지학교┘

특히 **칸 안에 든 표**가 그랬습니다. 바깥 표는 그림으로 그린 것을 가려내
원문 테두리를 살렸지만, 안쪽 표는 그 갈림길을 지나지 않아 늘 격자로만
그려졌습니다.

여기서는 만들어 낸 중간 파일을 믿지 않고 **한글파일을 직접 열어** 통로 칸을
셉니다. 중간 파일만 보면 읽는 쪽을 통째로 꺼도 '읽은 것이 없으니 문제도
없다'가 되어 아무것도 지키지 못합니다.

사용법: python3 scripts/validate_arrow_channels.py
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source" / "manual-hwpx"
ASSETS = ROOT / "docs" / "assets"
SECTION_RE = re.compile(r"^Contents/section(\d+)\.xml$")
# 화살표만 든 칸입니다. 화면 쪽(ARROW_ONLY)과 같은 글자를 씁니다.
ARROW_ONLY = re.compile(r"^[⇒⇨▶→➡≫⇓⇙⇘↓⬇▼⇩\s]+$")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def line_code(kind: str | None, width: str | None) -> str:
    """테두리 한 면을 글자 하나로 적습니다(read_hwpx_tables.py와 같은 규칙)."""
    if not kind or kind in {"NONE"}:
        return "n"
    if kind in {"DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE"}:
        return "d"
    # 굵기는 원문이 적어 둔 값을 그대로 봅니다. 굵은 선은 대문자로 적습니다.
    thick = {"0.4 mm", "0.5 mm", "0.6 mm", "0.7 mm", "1.0 mm", "1.5 mm", "2.0 mm"}
    return "S" if (width or "") in thick else "s"


def border_fills(archive: zipfile.ZipFile) -> dict[str, str]:
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
                else "n"
            )
        found[element.get("id")] = "".join(sides)
    return found


def cell_text(cell: ET.Element) -> str:
    return "".join(node.text or "" for node in cell.iter() if local_name(node.tag) == "t")


def own_cells(table: ET.Element):
    """이 표의 칸만 냅니다. 칸 안에 든 다른 표로는 내려가지 않습니다."""
    for child in table:
        name = local_name(child.tag)
        if name == "tbl":
            continue
        if name == "tc":
            yield child
            continue
        yield from own_cells(child)


def is_channel(border: str) -> bool:
    """상자와 상자 사이 통로인가. 두 면만 그어져 있고 마주 보는 두 면이 트였는가."""
    if len(border) != 4:
        return False
    down = border[0] != "n" and border[1] != "n" and border[2] == "n" and border[3] == "n"
    across = border[0] == "n" and border[1] == "n" and border[2] != "n" and border[3] != "n"
    return down or across


def squash(said: str) -> str:
    return re.sub(r"\s+", "", said)


def channels_in(path: Path) -> list[str]:
    """통로 칸을 가진 표의 글자 지문을 냅니다."""
    found = []
    with zipfile.ZipFile(path) as archive:
        fills = border_fills(archive)
        for name in sorted(archive.namelist()):
            if not SECTION_RE.match(name):
                continue
            root = ET.fromstring(archive.read(name))
            for table in root.iter():
                if local_name(table.tag) != "tbl":
                    continue
                cells = list(own_cells(table))
                if not cells:
                    continue
                def arrow_channel(cell: ET.Element) -> bool:
                    said = cell_text(cell).strip()
                    if not said or not ARROW_ONLY.match(said):
                        return False
                    return is_channel(fills.get(cell.get("borderFillIDRef"), ""))

                channel = any(arrow_channel(cell) for cell in cells)
                if not channel:
                    continue
                mark = squash("".join(cell_text(cell) for cell in cells))
                if mark:
                    found.append(mark)
    return found


def built_tables(chapter: int) -> list[dict]:
    """화면이 쓰는 자료에서 표를 모두 모읍니다(칸 안에 든 표까지)."""
    path = ASSETS / f"chapter{chapter}-data.js"
    said = path.read_text(encoding="utf-8")
    data = json.loads(said[said.index("{") : said.rindex("}") + 1])
    out: list[dict] = []

    def walk(table: dict) -> None:
        out.append(table)
        for row in [table.get("headers") or [], *(table.get("rows") or [])]:
            for cell in row:
                for inner in cell.get("tables") or []:
                    walk(inner)

    for work in data.get("sections", []):
        for block in work.get("contentBlocks", []):
            for table in block.get("tables") or []:
                walk(table)
    return out


def mark_of(table: dict) -> str:
    said = []
    for row in [table.get("headers") or [], *(table.get("rows") or [])]:
        for cell in row:
            said.append(str(cell.get("text") or ""))
    return squash("".join(said))


def main() -> None:
    problems = []
    checked = 0
    for path in sorted(SOURCE.glob("*.hwpx")):
        number = re.search(r"제(\d+)편", path.name)
        if not number:
            continue
        chapter = int(number.group(1))
        wanted = channels_in(path)
        if not wanted:
            continue
        drawn = built_tables(chapter)
        for mark in wanted:
            checked += 1
            # 원문 글자가 그대로 든 표를 찾습니다. 화면이 줄을 다시 나누므로
            # 띄어쓰기는 지우고 견줍니다.
            seat = next((table for table in drawn if mark_of(table) == mark), None)
            if seat is None:
                # 화면에 안 실린 표가 있습니다(앞머리 요약 등). 여기서는
                # 그린 것만 봅니다.
                checked -= 1
                continue
            # 통로를 살리는 길은 둘입니다.
            #   · 절차 카드로 다시 그린다 — 상자가 따로 서고 그 사이에
            #     화살표가 놓입니다(flow·branch·bands).
            #   · 원문 테두리를 그대로 긋는다 — 통로 칸의 위·아래를
            #     비워 둡니다(picture).
            # 둘 다 아니면 여느 격자가 되어 화살표가 상자 안에 갇힙니다.
            asCards = bool(seat.get("flow") or seat.get("branch") or seat.get("bands"))
            asDrawn = bool(seat.get("picture")) and any(
                cell.get("border")
                for row in [seat.get("headers") or [], *(seat.get("rows") or [])]
                for cell in row
            )
            if not asCards and not asDrawn:
                problems.append(
                    f"제{chapter}편: 상자 사이 통로가 여느 격자로 그려져 화살표가"
                    f" 상자 안에 갇혔습니다 — {mark[:40]}"
                )

    print(f"상자 사이 통로를 가진 표 {checked}개를 봤습니다.")
    if problems:
        for line in problems:
            print(f"  {line}")
        print(f"통로가 지워진 표 {len(problems)}개")
        sys.exit(1)
    print("통로 칸의 원문 테두리가 모두 살아 있습니다.")


if __name__ == "__main__":
    main()
