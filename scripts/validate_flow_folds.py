"""원문이 접어 놓은 표가 화면 자료에서도 단으로 갈라져 있는지 대조합니다.

한 줄기 절차가 종이 폭에 안 들어가면 매뉴얼은 그것을 접어 아래 단으로
내려 씁니다. 접힌 자리에는 **양옆이 트인 띠**를 두고, 그 띠에 ⇩를 놓아
'여기서 다음 단으로 이어진다'고 말합니다.

    제11편 공유재산의 관리 '1. 토지이동 신청'
    r0 ssss[토지이동 대상 토지 현황 파악]  ssnn[⇨]  ssss[토지이동 추진 …]
    r1 ssss[(합병) 인접한 토지…]                    ssss[(준비서류) 공문…]
    r2 nnss[         ]           nnnn[  ]  nnss[⇩]   ← 접힌 자리
    r3 ssss[K-에듀파인 재산대장 정리]      ssnn[⇨]  ssss[토지대장 및 …]
    r4 ssss[(합병, 분할) 재산대장관리…]              ssss[토지대장: 정부24…]

이 띠를 보통 줄로 그리면

    예전 화면 : 왼쪽 상자 하나에 단계 둘이 갇히고 그 사이에 속이 빈 띠가
                남았습니다. ⇩는 오른쪽 상자 안 한 줄로 들어앉았습니다.

가로로 늘어선 절차만 그런 것이 아닙니다. 세로로 내려가는 절차도 같은 방식으로
접혀 있고, 이때는 띠가 한 칸으로 여러 열을 통째로 덮습니다.

    제11편 공유재산의 취득 '2. 가설건축물 취득절차' (7행 2열)
    r0 ssss[학교]    ssss[◦가설건축물 계획 수립…]
    r1 nnss[⇩ ← 두 열을 통째로 덮는 칸 하나, 양옆이 트임]
    r2 ssss[교육청]  ssss[◦가설건축물 축조 신고필증 교부…]

    예전 화면 : 상자 넷이 한 표로 붙고, 바깥 테두리가 띠를 가로질러 상자가
                갈라져 보이지 않았습니다. 첫 줄만 머리글로 잡혀 그 상자의
                글만 굵기까지 했습니다.

무엇이 접힌 자리인지는 한글파일이 이미 말해 줍니다(아래 fold_rows).
테두리만 보면 트인 줄이 674개나 되어(법령 상자의 여백 줄 따위) 멀쩡한 표까지
잘립니다. 글자만 보면 원문이 한 상자로 둔 빈 줄까지 자릅니다.

여기서는 만들어 낸 중간 파일(tmp/hwpx-tables.json)을 믿지 않고 **한글파일을
직접 엽니다**. 중간 파일만 보면, 접힌 자리를 읽는 쪽을 통째로 꺼도 '읽은 것이
없으니 문제도 없다'가 되어 아무것도 지키지 못합니다.

사용법: python3 scripts/validate_flow_folds.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from read_hwpx_tables import SOURCES, tables_of  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
# 절차를 잇는 화살표만 든 칸입니다(빌더의 ARROW_ONLY와 같아야 합니다).
ARROW_ONLY = re.compile(r"^[\s⇨⇦⇩⇧⇒⇐→←↑↓➡➔➜⟹≫▼▶►]+$")
DECORATION = re.compile(
    r"[-–—•◦‣▪▫▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）\[\]［］\s]"
)


def bare(value: str) -> str:
    return DECORATION.sub("", str(value or ""))


def fold_rows(grid: dict, need_mark: bool) -> list[int]:
    """접힌 자리의 줄 번호입니다.

    빌더(foldRows)와 같은 눈으로 봅니다.
      · 표 폭을 통째로 덮는 줄이어야 합니다(칸 하나든 여럿이든).
      · 그 줄의 칸이 모두 양옆이 트여 있어야 합니다.
      · 읽을 글이 없어야 합니다(비었거나 화살표뿐).
      · 화살표가 몇 개든 상관없습니다. 나란한 절차 둘이 함께 접히기도 하고
        (제16편 '1인수의 / 2인수의'), 한 줄기가 둘로 갈리기도 합니다
        (제13편 '2. 유지관리자 선임'). 화살표를 제 열 자리에 세우면 됩니다.
      · 보통 표에서는 화살표가 놓인 띠만 봅니다. 화살표 없이 트이기만 한
        줄은 상자를 가르는 자리일 수도, 그저 여백일 수도 있습니다.
    """
    rows: dict[int, list[dict]] = {}
    for cell in grid["cells"]:
        rows.setdefault(cell["row"], []).append(cell)
    found = []
    for row, cells in sorted(rows.items()):
        if row == 0 or row == grid["rows"] - 1:
            continue
        if sum(cell.get("colSpan") or 1 for cell in cells) != grid["cols"]:
            continue
        border = [str(cell.get("border") or "") for cell in cells]
        if any(len(side) != 4 or side[0] != "n" or side[1] != "n" for side in border):
            continue
        said = [str(cell["text"] or "").strip() for cell in cells]
        if any(text and not ARROW_ONLY.match(text) for text in said):
            continue
        marked = [text for text in said if text]
        if need_mark and not marked:
            continue
        found.append(row)
    return found


def chapter_data(chapter: int) -> dict | None:
    file = ROOT / "docs" / "assets" / f"chapter{chapter}-data.js"
    if not file.exists():
        return None
    raw = file.read_text(encoding="utf-8")
    raw = raw.replace(f"window.CHAPTER{chapter}_DATA = ", "", 1).rstrip().rstrip(";")
    return json.loads(raw)


def drawn_tables(data: dict):
    """화면 자료에 실린 표를 냅니다(그림으로 그린 표는 뺍니다)."""
    for work in data.get("sections") or []:
        for block in work.get("contentBlocks") or []:
            for table in block.get("tables") or []:
                if not table.get("picture"):
                    yield work, block, table


def table_key(table: dict) -> str:
    rows = [table.get("headers") or []] + (table.get("rows") or [])
    return bare("".join(str(cell.get("text") or "") for row in rows for cell in row))


def main() -> None:
    problems: list[str] = []
    folded = 0
    for chapter, path in sorted(SOURCES.items(), key=lambda pair: int(pair[0])):
        number = int(chapter)
        data = chapter_data(number)
        if data is None:
            continue
        drawn = {}
        for work, block, table in drawn_tables(data):
            drawn.setdefault(table_key(table), []).append((work, block, table))

        for grid in tables_of(path):
            key = bare("".join(str(cell["text"] or "") for cell in grid["cells"]))
            mine = drawn.get(key)
            if not mine:
                continue  # 화면에 실리지 않았거나 그림으로 그린 표입니다.
            work, block, table = mine[0]
            folds = fold_rows(grid, not table.get("flow"))
            if not folds:
                continue
            folded += 1
            bands = table.get("bands") or []
            want = len(folds) + 1
            if len(bands) != want:
                problems.append(
                    f"제{number:02d}편 {work.get('title')} [{block.get('title') or block.get('id')}]: "
                    f"원문은 {len(folds)}번 접혀 단이 {want}개인데 화면 자료는 "
                    f"{len(bands) or 1}개입니다. 접힌 자리가 상자 안의 빈 띠로 남습니다."
                )
                continue
            marks = table.get("folds") or []
            if len(marks) != want - 1:
                problems.append(
                    f"제{number:02d}편 {work.get('title')} [{block.get('title') or block.get('id')}]: "
                    f"단은 {want}개인데 접힌 자리 표시가 {len(marks)}개입니다."
                )

    if problems:
        for line in problems[:20]:
            print(f"  - {line}", file=sys.stderr)
        print(f"\n접힌 표가 이어 붙은 곳 {len(problems)}건", file=sys.stderr)
        raise SystemExit(1)

    print(f"원문이 접어 놓은 표 {folded}개가 화면에서도 단으로 갈라집니다.")


if __name__ == "__main__":
    main()
