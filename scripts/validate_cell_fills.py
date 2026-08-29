"""칸 바탕에 칠한 색이 화면에도 실렸는지 봅니다.

매뉴얼의 절차도와 표는 **칸 배경색**으로 무엇이 단계이고 무엇이 그 단계의
설명인지 보여 줍니다.

    제13편 '유지관리자 선임'
      건축물 관리주체 · 유지관리자 지정 · 유지관리자 선임   청록  ← 단계
      유지관리자 등급산정, 경력신고서 및 수첩 발급          흰색  ← 설명
      시설물 관리전문업체 위탁                              청록  ← 다른 갈래

색을 빼면 상자만 남습니다. 원문에서 한눈에 읽히던 절차가 화면에서는
글자만 늘어선 표가 됩니다. 원문 그림과 전혀 다른 것이 됩니다.

한글파일은 색을 `hh:borderFill` 안의 `hc:fillBrush > hc:winBrush@faceColor`에
적어 둡니다. 짐작하지 않고 그 값을 그대로 씁니다.

여기서는 화면이 표로 그린 표만 봅니다(상자·서식 지면은 표가 아닙니다).

사용법: python3 scripts/validate_cell_fills.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GRIDS = ROOT / "tmp" / "hwpx-tables.json"
SPACE = re.compile(r"\s")


def squash(value: str) -> str:
    return SPACE.sub("", str(value or ""))


def chapter_data(chapter: int):
    file = ROOT / "docs" / "assets" / f"chapter{chapter}-data.js"
    if not file.exists():
        return None
    raw = file.read_text(encoding="utf-8")
    return json.loads(raw.replace(f"window.CHAPTER{chapter}_DATA = ", "", 1).rstrip().rstrip(";"))


def shown_tables(data: dict) -> dict[str, list[list[dict]]]:
    """화면에 그린 표를 '글자 열쇠 → 칸 목록들'로 모읍니다.

    글자가 같은 표가 두 군데 있기도 합니다(제2편 '발급 기준연도'는 편 앞머리
    요약과 본문에 한 번씩 나오고, 한쪽에만 머리글 색이 있습니다). 하나만
    남기면 엉뚱한 쪽과 견주게 되므로 다 담아 둡니다.
    """
    found: dict[str, list[list[dict]]] = {}

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
                found.setdefault(key, []).append(cells)
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
    tables = colored = 0
    for key in sorted(grids, key=int):
        chapter = int(key)
        data = chapter_data(chapter)
        if data is None:
            continue
        shown = shown_tables(data)
        for grid in grids[key]:
            # 같은 글이 든 칸이 여럿이고 색이 서로 다를 수 있습니다
            #   제14편 '교육운영비' — 적합한 비목 칸은 노랑, 부적합 칸은 흰색
            # 마지막 것만 남기면 없는 잘못이 잡히므로 '글자+색'을 세어 견줍니다.
            want = Counter(
                (squash(cell["text"]), cell["fill"], cell.get("ink") or "")
                for cell in grid["cells"]
                if cell.get("fill") and squash(cell["text"])
            )
            if not want:
                continue
            mark = squash("".join(str(cell["text"] or "") for cell in grid["cells"]))
            everywhere = shown.get(mark)
            # 화면이 표로 그리지 않은 것(상자·서식 지면)은 여기서 보지 않습니다.
            if not everywhere:
                continue
            tables += 1
            # 같은 글의 표가 여럿이면 색이 맞는 쪽이 하나라도 있으면 됩니다.
            counts = [
                Counter(
                    (squash(cell.get("text") or ""), cell.get("fill"), cell.get("ink") or "")
                    for cell in cells
                    if squash(cell.get("text") or "")
                )
                for cells in everywhere
            ]
            have = max(counts, key=lambda one: sum(one[key] for key in want))
            # 화면에 옮겨지지 않은 칸(빈 열을 걷어낸 자리 등)은 여기서 보지 않습니다.
            said_on_screen = {said for said, _, _ in have}
            for (said, color, ink), count in want.items():
                if said not in said_on_screen:
                    continue
                colored += count
                if have[(said, color, ink)] < count:
                    problems.append(
                        f"제{chapter:02d}편 {grid['rows']}행{grid['cols']}열 '{said[:22]}': "
                        f"원문 바탕 {color}·글자 {ink or '기본'}인 칸이 {count}개인데 "
                        f"화면에는 {have[(said, color, ink)]}개입니다."
                    )

    if problems:
        print("칸 바탕색이 원문과 다릅니다.", file=sys.stderr)
        for line in problems[:30]:
            print("  -", line, file=sys.stderr)
        if len(problems) > 30:
            print(f"  … 그리고 {len(problems) - 30}건 더", file=sys.stderr)
        raise SystemExit(1)
    print(f"바탕색이 든 표 {tables}개 · 칸 {colored}개가 원문 색 그대로입니다.")


if __name__ == "__main__":
    main()
