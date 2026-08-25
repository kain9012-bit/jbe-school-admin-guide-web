"""도형으로 그린 표가 화면에서도 표인지 한글파일과 대조합니다.

매뉴얼은 절차도를 표(hp:tbl)가 아니라 네모(hp:rect)와 선(hp:line)으로 그리기도
합니다. 그러면 칸 하나하나가 따로 노는 도형이라, 글자를 읽는 쪽에서는 칸 구분
없이 통째로 이어 붙습니다.

표를 쓰더라도 칸과 칸을 잇는 화살표는 도형(hp:polygon)으로 그립니다. 그 칸은
글자가 없어 빈 칸으로 보이고, 빈 열은 걷히므로 절차가 낱개 상자로 흩어집니다.
그 화살표가 화면에도 서 있는지 함께 봅니다.

    제1편 '5. 비전자기록물 이관 및 폐기 절차'
    원문 : ┌업무주체┬주요업무┬업무내용┐
           ├학교기록물담당자┼이관대상 추출┼◦K-에듀파인시스템에서…┤
    예전 화면 : 업무주체주요업무업무내용학교기록물담당자이관대상 추출◦K-에듀…

무엇이 어느 칸의 말인지 알 수 없는 글자 덩어리가 됩니다.

네모마다 자리(hp:offset)와 크기(hp:curSz)가 적혀 있으므로 같은 줄에 선 것끼리
묶으면 표로 되살릴 수 있습니다(scripts/read_hwpx_tables.py의 shape_grid).

여기서는 만들어 낸 중간 파일(tmp/hwpx-tables.json)을 믿지 않고 **한글파일을
직접 열어** 셉니다. 중간 파일만 보면, 되살리는 쪽을 통째로 꺼도 '읽은 것이
없으니 문제도 없다'가 되어 아무것도 지키지 못합니다.

사용법: python3 scripts/validate_shape_tables.py
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
# 글자가 든 네모가 이만큼은 있어야 표로 봅니다(read_hwpx_tables.py와 같은 값).
SHAPE_LEAST = 3
# 꾸밈 글자는 빼고 글자만 견줍니다(build_chapters_from_hwpx.mjs의 bare와 같습니다).
DECORATION = re.compile(
    "[-–—•◦‣▪▫▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）\\[\\]［］\\s]"
)
PUA = re.compile("[\U000f0000-\U000ffffd]")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def bare(value: str) -> str:
    return DECORATION.sub("", PUA.sub("", re.sub(r"\[\[그림:[^\]]*\]\]", "", value)))


def text_of(node: ET.Element) -> str:
    return "".join(
        "".join(piece.itertext()) for piece in node.iter() if local_name(piece.tag) == "t"
    )


def shape_texts(path: Path) -> list[str]:
    """한글파일에서 도형으로 그린 표의 글자를 모읍니다."""
    found: list[str] = []
    with zipfile.ZipFile(path) as archive:
        for name in sorted(n for n in archive.namelist() if SECTION_RE.match(n)):
            root = ET.fromstring(archive.read(name))
            for container in root.iter():
                if local_name(container.tag) != "container":
                    continue
                boxes = [
                    text_of(child)
                    for child in container
                    if local_name(child.tag) == "rect"
                ]
                boxes = [text for text in boxes if text.strip()]
                if len(boxes) < SHAPE_LEAST:
                    continue
                found.append(bare("".join(boxes)))
    return found


def chapter_data(chapter: int) -> dict | None:
    file = ROOT / "docs" / "assets" / f"chapter{chapter}-data.js"
    if not file.exists():
        return None
    raw = file.read_text(encoding="utf-8")
    raw = raw.replace(f"window.CHAPTER{chapter}_DATA = ", "", 1).rstrip().rstrip(";")
    return json.loads(raw)


def tables_of(data: dict):
    """블록에 실린 표를 칸 안에 든 표까지 모두 냅니다."""
    def walk(tables):
        for table in tables or []:
            yield table
            for row in [table.get("headers") or []] + (table.get("rows") or []):
                for cell in row:
                    if cell and cell.get("tables"):
                        yield from walk(cell["tables"])

    for section in data.get("sections") or []:
        for block in section.get("contentBlocks") or []:
            yield from walk(block.get("tables"))


# 절차를 잇는 화살표입니다. 매뉴얼은 이것을 글자가 아니라 도형(hp:polygon)으로
# 그려 둡니다. 읽지 않으면 그 칸이 빈 칸으로 보이고, 빈 열은 걷히므로 절차가
# 낱개 상자로 흩어집니다(제1편 신원조사 'e하나로민원 권한신청 및 이용').
ARROW_MARKS = "⇨⇦⇩⇧⇒⇐→←↓↑▶►▼"


def arrow_shapes(path: Path) -> int:
    """한글파일에서 표 칸에 그려진 화살표 도형을 셉니다."""
    count = 0
    with zipfile.ZipFile(path) as archive:
        for name in sorted(n for n in archive.namelist() if SECTION_RE.match(n)):
            root = ET.fromstring(archive.read(name))
            for cell in root.iter():
                if local_name(cell.tag) != "tc":
                    continue
                if text_of(cell).strip():
                    continue
                count += sum(
                    1 for node in cell.iter() if local_name(node.tag) == "polygon"
                )
    return count


def arrow_cells(data: dict) -> int:
    """화면 자료에서 화살표만 든 칸을 셉니다."""
    count = 0
    for table in tables_of(data):
        for row in [table.get("headers") or []] + (table.get("rows") or []):
            for cell in row:
                said = str((cell or {}).get("text") or "").strip()
                if said and all(letter in ARROW_MARKS for letter in said):
                    count += 1
    return count


def main() -> None:
    problems: list[str] = []
    checked = 0
    arrows_in_source = 0
    arrows_on_screen = 0
    for path in sorted((ROOT / "source" / "manual-hwpx").glob("*.hwpx")):
        match = re.match(r"제(\d+)편", path.name)
        if not match:
            continue
        chapter = int(match.group(1))
        data = chapter_data(chapter)
        if data is None:
            continue
        arrows_in_source += arrow_shapes(path)
        arrows_on_screen += arrow_cells(data)
        wanted = shape_texts(path)
        if not wanted:
            continue
        # 화면에 실린 글 전체와, 표로 그려진 것들
        shown = ""
        drawn = set()
        for table in tables_of(data):
            cells = [table.get("headers") or []] + (table.get("rows") or [])
            drawn.add(bare("".join(str((c or {}).get("text") or "") for row in cells for c in row)))
        for section in data.get("sections") or []:
            for block in section.get("contentBlocks") or []:
                shown += bare(str(block.get("body") or ""))

        for key in wanted:
            # 업무 본문에 실리지 않은 지면(서식 견본)은 세지 않습니다.
            if key not in shown and key not in "".join(drawn):
                continue
            checked += 1
            if key in drawn:
                continue
            problems.append(
                f"제{chapter:02d}편: 도형으로 그린 표가 글줄로 남았습니다 "
                f"('{key[:40]}…'). 네모마다 적힌 자리로 표를 되살려야 합니다."
            )

    if arrows_in_source and not arrows_on_screen:
        problems.append(
            f"한글파일에 절차를 잇는 화살표 도형이 {arrows_in_source}개 있는데 "
            "화면에는 하나도 없습니다. 화살표를 안 읽으면 그 칸이 빈 칸으로 보이고, "
            "빈 열은 걷혀 절차가 낱개 상자로 흩어집니다."
        )

    if problems:
        for line in problems[:20]:
            print(f"  - {line}", file=sys.stderr)
        print(f"\n도형으로 그린 표 문제 {len(problems)}건", file=sys.stderr)
        raise SystemExit(1)

    print(
        f"도형으로 그린 표 {checked}개가 모두 표로 그려집니다 · "
        f"절차를 잇는 화살표 {arrows_on_screen}칸이 화면에 섭니다."
    )


if __name__ == "__main__":
    main()
