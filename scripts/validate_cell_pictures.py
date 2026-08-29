"""표 칸에 든 사진이 화면 자료의 그 칸에도 있는지 한글파일과 대조합니다.

매뉴얼은 표 칸에 사진을 넣습니다. 사진이 곧 그 칸의 내용입니다.

    제12편 물품관리 '3. 전자태그 및 장비' — 태그 종류
    구분        | 태그 사진 | 특징
    라벨형 태그 | [사진]    | ◦적용물품: TV, 모니터, 서랍장, 수납장 등
    메탈 태그   | [사진]    | ◦적용물품: 금속성분 및 전자제품처럼 …

    예전 화면 : '태그 사진' 열이 통째로 비어 있었습니다.

두 군데에서 사진을 잃고 있었습니다.

  · 한글파일을 읽는 쪽이 칸의 **글자만** 읽었습니다. 사진은 글자가 아니라서
    그 칸은 빈 칸이 됐습니다(read_hwpx_tables.py의 text_pieces).
  · 그림을 꺼내는 쪽이 **크기로 어림잡아** 버렸습니다. 태그 사진은 세로 47점
    이라 '글머리표로 쓴 작은 그림'으로 걸렸습니다(extract_manual_images.py).

칸 안에 놓였다는 사실이 크기보다 확실합니다. 자리로 판단합니다.

여기서는 만들어 낸 중간 파일을 믿지 않고 **한글파일을 직접 엽니다**.
중간 파일만 보면, 사진을 읽어 두는 쪽을 꺼도 '읽은 것이 없으니 문제도 없다'가
되어 아무것도 지키지 못합니다.

사용법: python3 scripts/validate_cell_pictures.py
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))

from read_hwpx_tables import SKIP_SUBTREE, SOURCES, local_name  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SECTION_RE = re.compile(r"^Contents/section(\d+)\.xml$")
DECORATION = re.compile(
    r"[-–—•◦‣▪▫▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）\[\]［］\s]"
)
IMAGE_MARK = re.compile(r"\[\[그림:([A-Za-z0-9_]+)\]\]")


def bare(value: str) -> str:
    return DECORATION.sub("", IMAGE_MARK.sub("", str(value or "")))


def cell_pictures(path: Path) -> list[tuple[str, str, str]]:
    """표마다 (표 글자, 칸 글자, 그림 이름)을 냅니다.

    쪽 머리글·꼬리글 같은 곁가지는 봅니다만, 그 안의 표는 본문이 아니므로
    건너뜁니다(read_hwpx_tables.py와 같은 눈).
    """
    found: list[tuple[str, str, str]] = []
    with zipfile.ZipFile(path) as archive:
        for name in sorted(n for n in archive.namelist() if SECTION_RE.match(n)):
            root = ET.fromstring(archive.read(name))

            def texts(node) -> str:
                return "".join(
                    "".join(piece.itertext())
                    for piece in node.iter()
                    if local_name(piece.tag) == "t"
                )

            def walk(node, skip: bool) -> None:
                said = local_name(node.tag).lower()
                if skip or said in SKIP_SUBTREE:
                    return
                if said == "tbl":
                    whole = texts(node)
                    for cell in [x for x in node.iter() if local_name(x.tag) == "tc"]:
                        for element in cell.iter():
                            for key, value in element.attrib.items():
                                if local_name(key) == "binaryItemIDRef" and value:
                                    found.append((whole, texts(cell), value))
                for child in node:
                    walk(child, False)

            walk(root, False)
    return found


def chapter_data(chapter: int) -> dict | None:
    file = ROOT / "docs" / "assets" / f"chapter{chapter}-data.js"
    if not file.exists():
        return None
    raw = file.read_text(encoding="utf-8")
    raw = raw.replace(f"window.CHAPTER{chapter}_DATA = ", "", 1).rstrip().rstrip(";")
    return json.loads(raw)


def drawn_pictures(data: dict) -> tuple[set[str], set[str]]:
    """화면 자료에 실린 (그림 이름, 표 글자)를 냅니다."""
    pictures: set[str] = set()
    tables: set[str] = set()

    def walk(owned) -> None:
        for table in owned or []:
            rows = [table.get("headers") or []] + (table.get("rows") or [])
            tables.add(
                bare("".join(str(cell.get("text") or "") for row in rows for cell in row))
            )
            for row in rows:
                for cell in row:
                    if not cell:
                        continue
                    pictures.update(IMAGE_MARK.findall(str(cell.get("text") or "")))
                    if cell.get("tables"):
                        walk(cell["tables"])

    for work in data.get("sections") or []:
        for block in work.get("contentBlocks") or []:
            walk(block.get("tables"))
            # 표가 글줄로 펴진 자리도 함께 봅니다. 사진이 본문 줄에 실려도
            # 읽는 사람에게는 보입니다.
            pictures.update(IMAGE_MARK.findall(str(block.get("body") or "")))
    return pictures, tables


def main() -> None:
    problems: list[str] = []
    checked = 0
    for chapter, path in sorted(SOURCES.items(), key=lambda pair: int(pair[0])):
        number = int(chapter)
        data = chapter_data(number)
        if data is None:
            continue
        shown, drawn = drawn_pictures(data)
        missing: dict[str, str] = {}
        for whole, text, name in cell_pictures(path):
            # 화면이 표로 그리지 않은 자리는 보지 않습니다. 서식 그림이나
            # 상자로 편 글은 사진을 담을 칸 자체가 없습니다.
            if bare(whole) not in drawn:
                continue
            checked += 1
            if name in shown:
                continue
            missing.setdefault(name, re.sub(r"\s+", " ", text).strip()[:24])
        for name, said in sorted(missing.items()):
            problems.append(
                f"제{number:02d}편 {name}: 표 칸에 든 사진이 화면에 없습니다"
                + (f" (같은 칸 글 '{said}')." if said else " (사진만 든 칸).")
            )

    if problems:
        for line in problems[:20]:
            print(f"  - {line}", file=sys.stderr)
        print(f"\n표 칸에서 사라진 사진 {len(problems)}가지", file=sys.stderr)
        raise SystemExit(1)

    print(f"표 칸에 든 사진 {checked}장이 화면에도 실립니다.")


if __name__ == "__main__":
    main()
