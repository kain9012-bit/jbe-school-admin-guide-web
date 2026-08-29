"""편 앞머리의 '한눈에 쏙쏙' 요약 지면이 화면에 실렸는지 봅니다.

매뉴얼은 편마다 첫 업무 앞에 지면을 둘 둡니다.
  ① 차례 표('구분 | 세부내용 | 페이지')
  ② 요약 지면('한눈에 쏙쏙' · '흐름도' · 'POINT')

②는 그 편을 한 장으로 보여 주는 표라 원문에서 가장 먼저 눈에 들어옵니다.
그런데 화면은 첫 업무부터 읽어서 이 지면이 통째로 빠져 있었습니다.

    제4편  '자주 쓰는 휴가'(22행 5열) — 모성보호시간·임신검진휴가·출산휴가·
           육아시간·가족돌봄휴가·자녀보육휴가·학습휴가·새내기휴가
    제13편 '학교시설관리 요약'(17행 5열) — 분야별 점검 주기·자격·선임기한
    제12편 'POINT 물품관리 흐름도' — 그림 두 장

②의 칸 글자가 화면 자료에 그대로 있는지만 봅니다. ①은 화면이 제 나름의
차례를 그리므로 보지 않습니다.

②가 어디까지인지는 자리로 가립니다. 차례 표 다음부터, 업무 본문이
시작하는 표('세부내용'·'관련법규' 상자) 앞까지입니다.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GRIDS = ROOT / "tmp" / "hwpx-tables.json"

# 꾸밈 글자를 뺀 글자로 견줍니다. 화면은 화살표와 글머리표를 제 나름의
# 모양으로 그리므로 그대로 견주면 멀쩡한 칸도 다르다고 나옵니다.
DECORATION = re.compile(
    r"[-–—•◦‣▪▫▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）\[\]［］\s"
    "​‌‍﻿­　-]"
)
# 한컴 글꼴이 쓰는 넓은 개인용 영역입니다(제13편 '󰋻' 같은 기호).
PRIVATE = re.compile(r"[\U000f0000-\U000ffffd-]")
IMAGE_MARK = re.compile(r"\[\[그림:[A-Za-z0-9_]+\]\]")
LINK = re.compile(r"\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)")


def bare(value: str) -> str:
    said = IMAGE_MARK.sub("", str(value or ""))
    said = LINK.sub(r"\1", said)
    return DECORATION.sub("", PRIVATE.sub("", said))


def chapter_data(chapter: int):
    file = ROOT / "docs" / "assets" / f"chapter{chapter}-data.js"
    if not file.exists():
        return None
    raw = file.read_text(encoding="utf-8")
    raw = raw.replace(f"window.CHAPTER{chapter}_DATA = ", "", 1).rstrip().rstrip(";")
    return json.loads(raw)


def screen_text(data: dict) -> str:
    parts: list[str] = []

    def walk(tables):
        for table in tables or []:
            for row in [table.get("headers") or []] + (table.get("rows") or []):
                for cell in row:
                    if not cell:
                        continue
                    parts.append(str(cell.get("text") or ""))
                    if cell.get("tables"):
                        walk(cell["tables"])

    for work in data.get("sections") or []:
        for block in work.get("contentBlocks") or []:
            parts.append(str(block.get("body") or ""))
            walk(block.get("tables"))
        for group in work.get("flowGroups") or []:
            parts.append(str(group.get("sourceText") or ""))
    return bare("".join(parts))


def front_tables(grids: list[dict]) -> list[dict]:
    """차례 표 다음부터 업무 본문이 시작하기 전까지의 표입니다."""
    toc = -1
    for index, grid in enumerate(grids[:6]):
        whole = bare("".join(str(cell["text"] or "") for cell in grid["cells"]))
        if whole.startswith("구분세부내용"):
            toc = index
    found = []
    for grid in grids[toc + 1 :]:
        whole = bare("".join(str(cell["text"] or "") for cell in grid["cells"]))
        if whole.startswith("세부내용") or whole.startswith("관련법규"):
            break
        found.append(grid)
    return found


def main() -> None:
    if not GRIDS.exists():
        print("tmp/hwpx-tables.json이 없습니다. python3 scripts/read_hwpx_tables.py를 먼저 실행하세요.")
        raise SystemExit(1)
    all_grids = json.loads(GRIDS.read_text(encoding="utf-8"))

    problems: list[str] = []
    tables = cells = 0
    for key in sorted(all_grids, key=int):
        chapter = int(key)
        data = chapter_data(chapter)
        if data is None:
            continue
        screen = screen_text(data)
        for grid in front_tables(all_grids[key]):
            said = [bare(cell["text"]) for cell in grid["cells"]]
            said = [one for one in said if len(one) >= 4]
            if not said:
                continue
            tables += 1
            cells += len(said)
            missing = [one for one in said if one not in screen]
            if missing:
                problems.append(
                    f"제{chapter:02d}편 앞머리 요약 표({grid['rows']}행{grid['cols']}열)에서 "
                    f"{len(missing)}/{len(said)}칸이 화면에 없습니다: "
                    + " | ".join(one[:30] for one in missing[:3])
                )

    if problems:
        print("편 앞머리 요약 지면이 화면에 실리지 않았습니다.", file=sys.stderr)
        for line in problems:
            print("  -", line, file=sys.stderr)
        raise SystemExit(1)
    print(f"앞머리 요약 표 {tables}개 · 칸 {cells}개 모두 화면에 있습니다.")


if __name__ == "__main__":
    main()
