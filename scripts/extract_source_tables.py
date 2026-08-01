"""매뉴얼의 표를 칸 단위로 그대로 읽어 냅니다.

표를 글자 순서로만 보면 어느 줄이 어느 칸에 속하는지 알 수 없습니다.
예를 들어 25쪽 신원조사 표의 '대 상' 칸은 항목이 셋인데, 이름표가 가운데
항목 옆에 붙어 있어 글자로는 이렇게 나옵니다.

    목 적   • 국가에 대한 충성심…
            • 교육감 또는 교육장의…      ← 이름표가 없어서 '목 적' 칸으로 보임
    대 상   • 공무원 임용예정자…
            • 사립학교 교직원…           ← 이름표가 없어서 '관련기관' 칸으로 보임

매뉴얼 PDF는 표의 칸 경계선을 실제로 그려 두었습니다. 그 선을 읽으면
어느 글자가 어느 칸 안에 있는지 좌표로 정확히 알 수 있습니다.

  · 세로 경계선이 세 개 이상 이어져 있으면 그 자리가 표의 칸 나누는 선입니다.
  · 그 세로 선 하나하나가 곧 표의 한 줄(행)입니다.
  · 첫 줄은 머리글(구 분 / 내 용)입니다.

사용법: python3 scripts/extract_source_tables.py   (혼자 실행하면 찾은 표를 보여 줍니다)
"""

from __future__ import annotations

import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
CONTENT_RIGHT_EDGE = 556

# 경계선 좌표는 소수점 아래가 조금씩 어긋나므로 이만큼은 같은 자리로 봅니다.
TOLERANCE = 1.5


def _cluster(values: list[float], tolerance: float = TOLERANCE) -> list[list[float]]:
    groups: list[list[float]] = []
    for value in sorted(values):
        if groups and value - groups[-1][-1] <= tolerance:
            groups[-1].append(value)
        else:
            groups.append([value])
    return groups


def _dividers(page) -> list[tuple[float, list[tuple[float, float]]]]:
    """세로 경계선이 여러 개 쌓여 있는 자리를 찾습니다. 그 자리가 표의 칸 나누는 선입니다."""
    verticals = [
        line
        for line in page.lines
        if abs(line["x1"] - line["x0"]) <= TOLERANCE and line["height"] > 5
    ]
    by_x: dict[float, list[tuple[float, float]]] = {}
    for group in _cluster([line["x0"] for line in verticals]):
        x = sum(group) / len(group)
        bands = sorted(
            (line["top"], line["top"] + line["height"])
            for line in verticals
            if abs(line["x0"] - x) <= TOLERANCE
        )
        if len(bands) >= 3:
            by_x[round(x, 1)] = bands
    return sorted(by_x.items())


def _tables_of_page(page):
    dividers = _dividers(page)
    if not dividers:
        return []

    horizontals = [
        line
        for line in page.lines
        if abs(line["top"] - (line["top"] + line["height"])) <= TOLERANCE
        and line["width"] > 40
    ]

    found = []
    for x, bands in dividers:
        # 맞닿은 줄끼리 묶어 표 하나로 만듭니다. 멀리 떨어져 있으면 다른 표입니다.
        runs: list[list[tuple[float, float]]] = []
        for band in bands:
            if runs and band[0] - runs[-1][-1][1] <= 2:
                runs[-1].append(band)
            else:
                runs.append([band])
        for run in runs:
            if len(run) >= 3:
                found.append({"x": x, "rows": run})

    # 칸이 셋 이상인 표는 세로 선이 여러 개입니다.
    # 줄 위치가 같은 것끼리 모아 표 하나로 봅니다.
    tables: list[dict] = []
    for item in sorted(found, key=lambda entry: (entry["rows"][0][0], entry["x"])):
        same = next(
            (
                table
                for table in tables
                if abs(table["rows"][0][0] - item["rows"][0][0]) <= 2
                and abs(table["rows"][-1][1] - item["rows"][-1][1]) <= 2
            ),
            None,
        )
        if same:
            same["xs"].append(item["x"])
        else:
            tables.append({"xs": [item["x"]], "rows": item["rows"]})

    complete = []
    for table in tables:
        top, bottom = table["rows"][0][0], table["rows"][-1][1]
        edges = [line for line in horizontals if top - 3 <= line["top"] <= bottom + 3]
        if not edges:
            continue
        left = min(line["x0"] for line in edges)
        right = max(line["x1"] for line in edges)
        if right > CONTENT_RIGHT_EDGE + 10 or right - left < 100:
            continue
        complete.append({"columns": [left, *sorted(table["xs"]), right], "rows": table["rows"]})
    return complete


def clean_page(page):
    """본문에 없는 글자를 걸러 낸 쪽을 돌려줍니다.

    · 쪽 옆에 세로로 붙은 편 이름표는 본문이 아닙니다.
    · 매뉴얼은 굵은 글씨를 같은 자리에 두 번 겹쳐 찍어 만듭니다.
      그대로 읽으면 'TIP'이 'TTIIPP'가 되므로 겹친 글자는 하나만 셉니다.
    """
    seen: set[tuple] = set()

    def keep(obj):
        if obj.get("object_type") != "char":
            return True
        if obj.get("x1", 0) > CONTENT_RIGHT_EDGE:
            return False
        mark = (obj.get("text"), round(obj.get("x0", 0), 1), round(obj.get("top", 0), 1))
        if mark in seen:
            return False
        seen.add(mark)
        return True

    return page.filter(keep)


def lines_from_words(words) -> list[str]:
    """낱말을 지면에 보이는 줄로 묶습니다.

    화살표처럼 글자보다 조금 위에 그려진 것이 있어서, 줄을 묶은 뒤에는
    반드시 가로 위치로 다시 세워야 합니다. 그러지 않으면 한 줄이
    '→ → → → 방법 : 문서관리 접수함…'처럼 화살표만 앞에 몰립니다.
    """
    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda item: (item["top"] + item["bottom"]) / 2):
        middle = (word["top"] + word["bottom"]) / 2
        if lines:
            previous = lines[-1]
            reference = sum((item["top"] + item["bottom"]) / 2 for item in previous) / len(previous)
            if abs(middle - reference) <= 4:
                previous.append(word)
                continue
        lines.append([word])
    return [
        " ".join(word["text"] for word in sorted(line, key=lambda item: item["x0"]))
        for line in lines
    ]


def drawn_boxes(page) -> list[dict]:
    """지면에 그려진 상자를 찾습니다.

    27쪽 '가~바' 절차 상자처럼 상자 여섯 개가 두 줄로 나란히 놓인 지면이 있습니다.
    이런 곳을 그냥 줄로 읽으면 나란한 상자의 글이 한 줄에 섞입니다.
        (유·초·중 : 행정지원과/  [정보열람-결격·범죄통합조회*  바. 결격·범
    상자 테두리를 읽어 두면 어느 글이 어느 상자 안에 있는지 알 수 있습니다.
    """
    boxes = []
    for shape in [*page.curves, *page.rects]:
        if shape["width"] < 60 or shape["height"] < 30:
            continue
        if shape["x1"] > CONTENT_RIGHT_EDGE + 10:
            continue
        mark = (round(shape["x0"]), round(shape["x1"]), round(shape["top"]), round(shape["bottom"]))
        if mark in {box["mark"] for box in boxes}:
            continue
        boxes.append(
            {
                "mark": mark,
                "x0": shape["x0"],
                "x1": shape["x1"],
                "top": shape["top"],
                "bottom": shape["bottom"],
            }
        )
    # 상자 안에 상자가 또 있으면 바깥 것은 칸막이일 뿐이므로 뺍니다.
    return [
        box
        for box in boxes
        if not any(
            other is not box
            and other["x0"] >= box["x0"] - 1
            and other["x1"] <= box["x1"] + 1
            and other["top"] >= box["top"] - 1
            and other["bottom"] <= box["bottom"] + 1
            for other in boxes
        )
    ]


def reading_order(page) -> list[str]:
    """지면에 보이는 차례대로 줄을 돌려줍니다.

    나란히 놓인 상자는 왼쪽 상자를 다 읽고 오른쪽 상자로 넘어갑니다.
    상자가 하나뿐인 자리는 예전과 똑같이 위에서 아래로 읽습니다.
    """
    words = page.extract_words(x_tolerance=1.6, y_tolerance=3, keep_blank_chars=False)
    boxes = drawn_boxes(page)

    def owner(word):
        middle_x = (word["x0"] + word["x1"]) / 2
        middle_y = (word["top"] + word["bottom"]) / 2
        for index, box in enumerate(boxes):
            if box["x0"] <= middle_x <= box["x1"] and box["top"] <= middle_y <= box["bottom"]:
                return index
        return None

    inside: dict[int, list] = {}
    outside = []
    for word in words:
        index = owner(word)
        if index is None:
            outside.append(word)
        else:
            inside.setdefault(index, []).append(word)

    # 상자를 가로로 나란한 것끼리 한 묶음으로 만듭니다.
    segments = []
    used = set()
    for index, box in enumerate(boxes):
        if index in used or index not in inside:
            continue
        row = [
            other
            for other in range(len(boxes))
            if other in inside
            and boxes[other]["top"] < box["bottom"]
            and boxes[other]["bottom"] > box["top"]
        ]
        used.update(row)
        row.sort(key=lambda item: boxes[item]["x0"])
        segments.append(
            {
                "top": min(boxes[item]["top"] for item in row),
                "lines": [line for item in row for line in lines_from_words(inside[item])],
            }
        )

    for line_words in _group_lines(outside):
        segments.append(
            {
                "top": min(word["top"] for word in line_words),
                "lines": lines_from_words(line_words),
            }
        )

    segments.sort(key=lambda item: item["top"])
    return [line for segment in segments for line in segment["lines"]]


def _group_lines(words) -> list[list]:
    lines: list[list] = []
    for word in sorted(words, key=lambda item: (item["top"] + item["bottom"]) / 2):
        middle = (word["top"] + word["bottom"]) / 2
        if lines:
            previous = lines[-1]
            reference = sum((item["top"] + item["bottom"]) / 2 for item in previous) / len(previous)
            if abs(middle - reference) <= 4:
                previous.append(word)
                continue
        lines.append([word])
    return lines


def tidy(text: str) -> str:
    # 제3편은 낱말 사이를 보통 띄어쓰기가 아닌 특수 글자로 벌려 놓았습니다.
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\xa0]", " ", text)
    return re.sub(r"[^\S\n]+", " ", text).strip()


def _cell_text(page, x0, x1, top, bottom) -> str:
    words = [
        word
        for word in page.extract_words(x_tolerance=1.6, y_tolerance=3, keep_blank_chars=False)
        if x0 - 1 <= word["x0"] and word["x1"] <= x1 + 1 and top - 1 <= word["top"] < bottom - 1
    ]
    if not words:
        return ""
    return tidy("\n".join(lines_from_words(words)))


def tables_of(source) -> list[dict]:
    """한 쪽에서 찾은 표를 위에서 아래 순서로 돌려줍니다."""
    page = clean_page(source)
    found = []
    for table in _tables_of_page(page):
        columns = table["columns"]
        rows = []
        for top, bottom in table["rows"]:
            cells = [
                _cell_text(page, columns[index], columns[index + 1], top, bottom)
                for index in range(len(columns) - 1)
            ]
            rows.append(cells)
        if len(rows) < 3 or not any(any(cell for cell in row) for row in rows):
            continue
        found.append(
            {
                "top": table["rows"][0][0],
                "headers": rows[0],
                "rows": rows[1:],
            }
        )
    found.sort(key=lambda item: item["top"])
    for table in found:
        table.pop("top")
    return found



if __name__ == "__main__":
    for name in ("chapter-01/original/제1편행정업무및보안.pdf", "chapter-03/original/제3편인사관리.pdf"):
        with pdfplumber.open(ROOT / "source" / name) as document:
            for number, page in enumerate(document.pages, start=1):
                for table in tables_of(page):
                    print(f"── PDF {number}쪽  머리글 {table['headers']}")
                    for row in table["rows"]:
                        print("   ", [cell.replace("\n", " ⏎ ")[:46] for cell in row])
