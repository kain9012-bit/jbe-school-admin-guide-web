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


def _cell_text(page, x0, x1, top, bottom) -> str:
    words = [
        word
        for word in page.extract_words(x_tolerance=1.6, y_tolerance=3, keep_blank_chars=False)
        if x0 - 1 <= word["x0"] and word["x1"] <= x1 + 1 and top - 1 <= word["top"] < bottom - 1
    ]
    if not words:
        return ""
    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda item: (round(item["top"], 1), item["x0"])):
        if lines and abs(word["top"] - lines[-1][0]["top"]) <= 3:
            lines[-1].append(word)
        else:
            lines.append([word])
    text = "\n".join(" ".join(word["text"] for word in line) for line in lines)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\xa0]", " ", text)
    return re.sub(r"[^\S\n]+", " ", text).strip()


def tables_of(page) -> list[dict]:
    """한 쪽에서 찾은 표를 위에서 아래 순서로 돌려줍니다."""
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
