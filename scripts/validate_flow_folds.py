"""원문이 접어 놓은 절차가 화면 자료에서도 단으로 갈라져 있는지 대조합니다.

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

무엇이 접힌 자리인지는 한글파일이 이미 말해 줍니다. 두 가지를 함께 봅니다.
  · 그 줄의 칸이 모두 양옆이 트여 있다(테두리 왼·오른이 NONE)
  · 그 줄에 읽을 글이 없다(비었거나 화살표뿐)
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


def is_flow(grid: dict) -> bool:
    """세로줄이 통째로 화살표인 자리가 있으면 절차 표입니다(빌더의 stepChain)."""
    if grid["cols"] < 3:
        return False
    columns: dict[int, list[str]] = {}
    for cell in grid["cells"]:
        columns.setdefault(cell["col"], []).append(str(cell["text"] or "").strip())
    for said in columns.values():
        spoken = [text for text in said if text]
        if spoken and all(ARROW_ONLY.match(text) for text in spoken):
            return True
    return False


def fold_rows(grid: dict) -> list[int]:
    """접힌 자리(양옆이 트이고 읽을 글이 없는 줄)의 줄 번호입니다."""
    rows: dict[int, list[dict]] = {}
    for cell in grid["cells"]:
        rows.setdefault(cell["row"], []).append(cell)
    found = []
    for row, cells in sorted(rows.items()):
        if row == 0 or row == grid["rows"] - 1:
            continue
        if len(cells) < 2:
            continue
        border = [str(cell.get("border") or "") for cell in cells]
        if any(len(side) != 4 or side[0] != "n" or side[1] != "n" for side in border):
            continue
        said = [str(cell["text"] or "").strip() for cell in cells]
        if any(text and not ARROW_ONLY.match(text) for text in said):
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


def flow_tables(data: dict):
    """화면 자료에 실린 절차 표를 냅니다."""
    for work in data.get("sections") or []:
        for block in work.get("contentBlocks") or []:
            for table in block.get("tables") or []:
                if table.get("flow"):
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
        for work, block, table in flow_tables(data):
            drawn.setdefault(table_key(table), []).append((work, block, table))

        for grid in tables_of(path):
            if not is_flow(grid):
                continue
            folds = fold_rows(grid)
            if not folds:
                continue
            key = bare("".join(str(cell["text"] or "") for cell in grid["cells"]))
            mine = drawn.get(key)
            if not mine:
                continue  # 화면에 절차로 실리지 않은 표입니다.
            folded += 1
            work, block, table = mine[0]
            bands = (table.get("flow") or {}).get("bands") or []
            want = len(folds) + 1
            if len(bands) != want:
                problems.append(
                    f"제{number:02d}편 {work.get('title')} [{block.get('title') or block.get('id')}]: "
                    f"원문은 {len(folds)}번 접혀 단이 {want}개인데 화면 자료는 "
                    f"{len(bands) or 1}개입니다. 접힌 자리가 상자 안의 빈 띠로 남습니다."
                )
                continue
            marks = (table.get("flow") or {}).get("folds") or []
            if len(marks) != want - 1:
                problems.append(
                    f"제{number:02d}편 {work.get('title')} [{block.get('title') or block.get('id')}]: "
                    f"단은 {want}개인데 접힌 자리 표시가 {len(marks)}개입니다."
                )

    if problems:
        for line in problems[:20]:
            print(f"  - {line}", file=sys.stderr)
        print(f"\n접힌 절차가 이어 붙은 곳 {len(problems)}건", file=sys.stderr)
        raise SystemExit(1)

    print(f"원문이 접어 놓은 절차 {folded}개가 화면에서도 단으로 갈라집니다.")


if __name__ == "__main__":
    main()
