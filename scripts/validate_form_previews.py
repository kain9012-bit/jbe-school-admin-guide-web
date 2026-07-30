"""서식 미리보기와 내려받기 파일이 온전한지 확인합니다.

두 가지를 봅니다.
1. 미리보기 SVG에서 글자가 표 안에 겹쳐 그려지지 않았는지
2. 내려받기 HWPX가 원본의 용지·여백과 단 설정을 그대로 갖고 있는지
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
SECTION_RE = re.compile(r"^Contents/section(\d+)\.xml$")

CHAPTERS = {
    "01": DOCS / "downloads" / "chapter1-forms.hwpx",
    "03": DOCS / "downloads" / "chapter3-forms.hwpx",
}

problems: list[str] = []


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def setup_of_section(root: ET.Element) -> tuple[dict[str, str], dict[str, str], bool]:
    page = next((node for node in root.iter() if local_name(node.tag) == "pagePr"), None)
    if page is None:
        return {}, {}, False
    margin = next((node for node in page if local_name(node.tag) == "margin"), None)

    paragraph = next(node for node in root if local_name(node.tag) == "p")
    run = next(node for node in paragraph if local_name(node.tag) == "run")
    has_columns = any(local_name(node.tag) == "colPr" for node in run.iter())

    return dict(page.attrib), dict(margin.attrib) if margin is not None else {}, has_columns


def all_page_setups(hwpx: Path) -> list[tuple[dict[str, str], dict[str, str], bool]]:
    """구역마다 용지 설정이 다를 수 있으므로 전부 모읍니다."""
    with zipfile.ZipFile(hwpx) as archive:
        names = sorted(name for name in archive.namelist() if SECTION_RE.match(name))
        return [setup_of_section(ET.fromstring(archive.read(name))) for name in names]


def page_setup(hwpx: Path) -> tuple[dict[str, str], dict[str, str], bool]:
    return all_page_setups(hwpx)[0]


def text_boxes(page: ET.Element) -> list[tuple[float, float, float, float, str]]:
    """글자가 실제로 차지하는 네모(왼쪽, 위, 오른쪽, 아래)를 계산합니다."""
    boxes = []
    for node in page.iter():
        if local_name(node.tag) != "text":
            continue
        content = "".join(node.itertext()).strip()
        if not content:
            continue
        try:
            x = float(node.attrib.get("x", "0"))
            baseline = float(node.attrib.get("y", "0"))
            size = float(node.attrib.get("font-size", "10"))
        except ValueError:
            continue

        length = node.attrib.get("textLength")
        try:
            width = float(length) if length else size * len(content)
        except ValueError:
            width = size * len(content)

        # 기준선 위쪽이 글자 높이, 아래쪽은 내려긋는 부분입니다.
        top = baseline - size * 0.82
        bottom = baseline + size * 0.18
        boxes.append((x, top, x + width, bottom, baseline, size, content))
    return boxes


def check_overlap(svg_path: Path) -> None:
    """글자끼리 실제로 겹쳐 그려진 곳이 있는지 봅니다.

    통합 문서에서 서식을 떼어내면 원본의 조판 캐시가 맞지 않아
    제목이 표 안에 겹쳐 그려지는 일이 있었습니다. 정상적인 문서에서는
    서로 다른 글자의 네모가 겹치지 않습니다.
    """
    root = ET.parse(svg_path).getroot()
    pages = [
        child
        for child in list(root)
        if local_name(child.tag) == "g" and child.attrib.get("data-page")
    ]
    for page_number, page in enumerate(pages or [root], start=1):
        boxes = text_boxes(page)
        # 세로로 가까운 것끼리만 비교하면 되므로 위쪽 기준으로 정렬합니다.
        boxes.sort(key=lambda box: box[1])
        for index, (left, top, right, bottom, baseline, size, text) in enumerate(boxes):
            for other in boxes[index + 1 :]:
                (
                    other_left,
                    other_top,
                    other_right,
                    other_bottom,
                    other_baseline,
                    other_size,
                    other_text,
                ) = other
                if other_top >= bottom:
                    break

                # 같은 줄에 나란히 놓인 글자는 서로 스쳐도 정상입니다.
                # 줄이 다른데 겹치는 경우만 조판이 어긋난 것으로 봅니다.
                line_gap = abs(baseline - other_baseline)
                if line_gap < max(size, other_size) * 0.3:
                    continue

                overlap_x = min(right, other_right) - max(left, other_left)
                overlap_y = min(bottom, other_bottom) - max(top, other_top)
                narrow = min(right - left, other_right - other_left)
                if overlap_x > max(3.0, narrow * 0.3) and overlap_y > 3.0:
                    problems.append(
                        f"{svg_path.name} {page_number}쪽: 글자가 겹쳐 그려집니다. "
                        f"'{text[:16]}' 와 '{other_text[:16]}'"
                    )
                    return


def main() -> int:
    assets_file = DOCS / "assets" / "form-assets.js"
    raw = assets_file.read_text(encoding="utf-8")
    assets = json.loads(raw.split("=", 1)[1].strip().rstrip(";"))

    checked_previews = 0
    checked_downloads = 0

    for chapter_id, forms in assets.items():
        source = CHAPTERS.get(chapter_id)
        if source is None or not source.exists():
            problems.append(f"제{chapter_id}편 통합 서식 원본을 찾지 못했습니다.")
            continue
        source_setups = all_page_setups(source)
        if not any(margin for _, margin, _ in source_setups):
            problems.append(f"제{chapter_id}편 원본에서 여백 설정을 찾지 못했습니다.")
            continue
        allowed_margins = [margin for _, margin, _ in source_setups]
        allowed_pages = [
            (page.get("width"), page.get("height")) for page, _, _ in source_setups
        ]

        for marker, asset in forms.items():
            preview = DOCS / str(asset["preview"])
            download = DOCS / str(asset["download"])

            if not preview.exists():
                problems.append(f"{marker}: 미리보기 파일이 없습니다.")
            else:
                check_overlap(preview)
                checked_previews += 1

            if not download.exists():
                problems.append(f"{marker}: 내려받기 파일이 없습니다.")
                continue

            page, margin, columns = page_setup(download)
            checked_downloads += 1
            # 서식마다 어느 구역에서 왔는지 다르므로, 원본 구역 중 하나와 맞으면 됩니다.
            if margin not in allowed_margins:
                problems.append(
                    f"{marker}: 여백이 원본 어느 구역과도 맞지 않습니다. 개별 {margin}"
                )
            if (page.get("width"), page.get("height")) not in allowed_pages:
                problems.append(f"{marker}: 용지 크기가 원본 어느 구역과도 맞지 않습니다.")
            if not columns:
                problems.append(f"{marker}: 단 설정이 빠져 한글이 여백을 기본값으로 되돌립니다.")

    if problems:
        print("서식 자산 점검 실패:")
        for line in problems:
            print(f" - {line}")
        return 1

    print(
        f"form assets valid: 미리보기 {checked_previews}건 겹침 없음, "
        f"내려받기 {checked_downloads}건 용지·여백·단 설정 일치"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
