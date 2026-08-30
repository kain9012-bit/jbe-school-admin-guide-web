"""원문이 테두리로 모양을 만든 표를 화면이 그대로 긋는지 봅니다.

매뉴얼의 절차도는 칸마다 테두리를 달리 그어 모양을 만듭니다.

    제13편 '유지관리자 선임'(11행 5열)
      '대한기계설비건설협회 경력신고'          sssn  ← 아래 선이 없습니다
      '유지관리자 등급산정, 경력신고서 및 …'   ssns  ← 위 선이 없습니다
                                                     두 줄이 한 상자입니다
      ' ⇩'                                     nnss  ← 상자와 상자 사이 띠

화면이 한결같은 격자선을 그으면 한 상자가 둘로 갈리고, 화살표가 위 상자
안에 들어앉습니다. 원문에 없던 선이 생기는 것입니다.

    칸의 위나 아래가 트임 → 위아래 칸과 한 상자
    칸의 양옆이 트임      → 상자와 상자 사이

이런 표는 원문 자리와 테두리를 그대로 옮겨야 합니다(화면 자료의
picture 표시와 칸마다의 border). 열이 몇 개인지, 빈 칸이 몇 개인지로
어림잡지 않습니다 — 매뉴얼 절차도는 열이 서넛뿐인 것이 많습니다.

사용법: python3 scripts/validate_border_shapes.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GRIDS = ROOT / "tmp" / "hwpx-tables.json"
SPACE = re.compile(r"\s")


def squash(value: str) -> str:
    return SPACE.sub("", str(value or ""))


def shaped(grid: dict) -> bool:
    """원문이 테두리로 모양을 만든 표인지 봅니다(빌드 쪽 shapedByBorders와 같습니다)."""
    count = 0
    for cell in grid["cells"]:
        border = str(cell.get("border") or "")
        if len(border) != 4:
            continue
        joined = border[0] != "n" and border[1] != "n" and (border[2] == "n" or border[3] == "n")
        band = border[0] == "n" and border[1] == "n" and border[2] != "n" and border[3] != "n"
        if joined or band:
            count += 1
    return count >= 2


def chapter_data(chapter: int):
    file = ROOT / "docs" / "assets" / f"chapter{chapter}-data.js"
    if not file.exists():
        return None
    raw = file.read_text(encoding="utf-8")
    return json.loads(raw.replace(f"window.CHAPTER{chapter}_DATA = ", "", 1).rstrip().rstrip(";"))


def shown_tables(data: dict) -> dict[str, dict]:
    """화면에 그린 표를 '글자 열쇠 → 표'로 모읍니다."""
    found: dict[str, dict] = {}

    def walk(tables):
        for table in tables or []:
            cells = [
                cell
                for row in [table.get("headers") or []] + (table.get("rows") or [])
                for cell in row
                if cell
            ]
            key = squash("".join(str(cell.get("text") or "") for cell in cells))
            if key:
                found.setdefault(key, table)
            for cell in cells:
                if cell.get("tables"):
                    walk(cell["tables"])

    for work in data.get("sections") or []:
        for block in work.get("contentBlocks") or []:
            walk(block.get("tables"))
    return found


def main() -> None:
    if not GRIDS.exists():
        print("tmp/hwpx-tables.json이 없습니다. python3 scripts/read_hwpx_tables.py를 먼저 실행하세요.")
        raise SystemExit(1)
    grids = json.loads(GRIDS.read_text(encoding="utf-8"))

    problems: list[str] = []
    checked = 0
    for key in sorted(grids, key=int):
        chapter = int(key)
        data = chapter_data(chapter)
        if data is None:
            continue
        shown = shown_tables(data)
        for grid in grids[key]:
            if not shaped(grid):
                continue
            mark = squash("".join(str(cell["text"] or "") for cell in grid["cells"]))
            table = shown.get(mark)
            # 화면이 표로 그리지 않은 것(상자·서식 지면)은 여기서 보지 않습니다.
            if table is None:
                continue
            # 절차로 다시 그린 표는 테두리가 상자와 화살표로 살아납니다.
            #   flow   — 가로 절차 카드
            #   folds  — 세로로 단을 나눈 자리
            #   branch — 갈래로 갈리는 세로 절차
            if table.get("flow") or table.get("folds") or table.get("branch"):
                continue
            checked += 1
            if not table.get("picture"):
                problems.append(
                    f"제{chapter:02d}편 {grid['rows']}행{grid['cols']}열: 원문이 테두리로 만든 "
                    "모양인데 화면이 한결같은 격자선을 긋습니다 — "
                    + "".join(str(cell["text"] or "")[:12] for cell in grid["cells"][:5])[:52]
                )

    if problems:
        print("원문 테두리로 만든 모양이 무너졌습니다.", file=sys.stderr)
        for line in problems[:30]:
            print("  -", line, file=sys.stderr)
        if len(problems) > 30:
            print(f"  … 그리고 {len(problems) - 30}건 더", file=sys.stderr)
        raise SystemExit(1)
    print(f"테두리로 모양을 만든 표 {checked}개가 원문 그대로 그려집니다.")


if __name__ == "__main__":
    main()
