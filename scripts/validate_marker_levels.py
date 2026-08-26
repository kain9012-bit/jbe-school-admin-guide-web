"""글머리표의 위계가 원문과 뒤집히지 않았는지 한글파일과 대조합니다.

매뉴얼은 들여쓰기로 위계를 나타냅니다. 딸린 항목은 거느린 항목보다 안쪽에
섭니다. 화면 쪽은 기호마다 단계를 못박아 두었는데(MARKER_LEVEL), 그 단계가
원문의 들여쓰기와 어긋나면 위아래가 뒤집혀 보입니다.

    원문 : ▪ 파면과 해임의 차이점
             ▸파면: 공무원관계로부터 배제, 5년간 공무원임용 제한
    예전 화면 :   ▪ 파면과 해임의 차이점
                ▸ 파면: 공무원관계로부터 배제, 5년간 공무원임용 제한

거느린 '▪'가 딸린 '▸'보다 오히려 안쪽에 서서, 무엇이 무엇에 딸린 말인지
거꾸로 읽힙니다.

원문에서 두 기호가 잇달아 나온 자리마다 앞공백을 견주어 어느 쪽이 안쪽인지
셉니다. 한쪽으로 뚜렷하게 치우친 짝만 근거로 삼고, 엇비슷한 짝은 넘어갑니다.
그 근거를 화면 쪽 표 두 개(structured-details.js, app-faithful-workflow.js)와
맞대어 봅니다. 두 표가 서로 다른지도 함께 봅니다. 달라지면 표가 든 항목과
없는 항목의 들여쓰기가 어긋납니다.

여기서는 만들어 낸 중간 파일을 믿지 않고 **한글파일을 직접 엽니다**. 중간
파일은 줄 앞의 공백을 이미 걷어 낸 뒤라 위계의 근거가 남아 있지 않습니다.

사용법: python3 scripts/validate_marker_levels.py
"""

from __future__ import annotations

import collections
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SECTION_RE = re.compile(r"^Contents/section(\d+)\.xml$")

# 한글 기호 글꼴(함초롬)은 글머리표를 개인용 영역(PUA)에 넣어 둡니다. 화면에
# 옮기는 쪽(scripts/build_chapters_from_hwpx.mjs의 symbolBullet)이 이것을 모두
# '▪'로 바꾸므로, 여기서도 똑같이 바꾸어야 같은 기호를 견주게 됩니다.
PUA_RE = re.compile("[\uf000-\uf0ff\U000f0000-\U000ffffd]")
MARKS = "‣•▸▹▪□○◦※*-–"

# 이만큼은 나와야 근거로 삼습니다. 한두 번 나온 짝은 그날의 편집일 뿐입니다.
LEAST_CASES = 10
# 한쪽이 다른 쪽보다 이만큼 많아야 '뚜렷하다'고 봅니다.
CLEAR_TIMES = 3


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def marked_lines(path: Path) -> list[tuple[str, int]]:
    """한글파일에서 글머리표로 시작하는 줄을 (기호, 앞공백) 으로 냅니다.

    TIP 상자는 여러 줄이 한 문단 안에 줄바꿈으로 들어 있기도 합니다.
    그래서 문단만 보지 않고 문단 안의 줄까지 나누어 봅니다.
    """
    found: list[tuple[str, int]] = []
    with zipfile.ZipFile(path) as archive:
        for name in sorted(n for n in archive.namelist() if SECTION_RE.match(n)):
            root = ET.fromstring(archive.read(name))
            for para in root.iter():
                if local_name(para.tag) != "p":
                    continue
                text = "".join(
                    "".join(piece.itertext())
                    for piece in para.iter()
                    if local_name(piece.tag) == "t"
                )
                for line in re.split(r"[\r\n]", text):
                    head = re.match(r"^([ \t　]*)(.)", line)
                    if not head:
                        continue
                    mark = PUA_RE.sub("▪", head.group(2))
                    if mark not in MARKS:
                        continue
                    found.append((mark, len(head.group(1))))
    return found


def evidence() -> dict[tuple[str, str], int]:
    """(바깥 기호, 안쪽 기호) → 그렇게 적힌 횟수."""
    deeper: collections.Counter = collections.Counter()
    for path in sorted((ROOT / "source" / "manual-hwpx").glob("*.hwpx")):
        lines = marked_lines(path)
        for (one, left_one), (two, left_two) in zip(lines, lines[1:]):
            if one == two:
                continue
            if left_two > left_one:
                deeper[(one, two)] += 1
            elif left_two < left_one:
                deeper[(two, one)] += 1
    return deeper


def chapter_data(file: Path) -> dict:
    raw = file.read_text(encoding="utf-8")
    raw = re.sub(r"^window\.[A-Z0-9_]+ = ", "", raw, count=1).rstrip().rstrip(";")
    return json.loads(raw)


def meeting_pairs() -> set[frozenset[str]]:
    """한 업무 화면 안에서 함께 보이는 기호 짝을 모읍니다.

    들여쓰기 단계는 위아래로 나란히 놓였을 때만 뜻이 있습니다. 한 화면에서
    마주칠 일이 없는 짝(예: '□'와 '○'는 121개 업무 어디에서도 함께 나오지
    않습니다)까지 단계를 벌리면, 읽는 사람 눈에는 보이지도 않는 위계 때문에
    가장 흔한 기호들이 통째로 안쪽으로 밀려 들어갑니다.
    """
    pairs: set[frozenset[str]] = set()
    for file in sorted((ROOT / "docs" / "assets").glob("chapter*-data.js")):
        data = chapter_data(file)
        for work in data.get("sections") or []:
            marks = set()
            for block in work.get("contentBlocks") or []:
                for line in re.split(r"[\r\n]", str(block.get("body") or "")):
                    line = line.strip()
                    if line and line[0] in MARKS:
                        marks.add(line[0])
            for one in marks:
                for two in marks:
                    if one != two:
                        pairs.add(frozenset((one, two)))
    return pairs


def levels_in(file: Path) -> dict[str, int]:
    """자바스크립트 파일에서 MARKER_LEVEL 표를 읽습니다."""
    raw = file.read_text(encoding="utf-8")
    block = re.search(r"MARKER_LEVEL\s*=\s*\{(.*?)\}", raw, re.S)
    if not block:
        raise SystemExit(f"{file.name}에서 MARKER_LEVEL을 찾지 못했습니다.")
    return {
        mark: int(level)
        for mark, level in re.findall(r'"(.+?)"\s*:\s*(\d+)', block.group(1))
    }


def main() -> None:
    problems: list[str] = []

    one = ROOT / "docs" / "assets" / "structured-details.js"
    two = ROOT / "docs" / "assets" / "app-faithful-workflow.js"
    levels = levels_in(one)
    other = levels_in(two)
    if levels != other:
        different = sorted(
            set(levels) | set(other),
            key=lambda mark: mark,
        )
        said = ", ".join(
            f"'{mark}' {levels.get(mark, '없음')}↔{other.get(mark, '없음')}"
            for mark in different
            if levels.get(mark) != other.get(mark)
        )
        problems.append(
            f"두 파일의 MARKER_LEVEL이 다릅니다 ({said}). 표가 든 항목과 없는 항목의 "
            "들여쓰기가 어긋납니다."
        )

    deeper = evidence()
    meets = meeting_pairs()
    checked = 0
    skipped = 0
    for (outer, inner), count in sorted(deeper.items(), key=lambda kv: -kv[1]):
        back = deeper[(inner, outer)]
        if count < LEAST_CASES or count < back * CLEAR_TIMES:
            continue
        if outer not in levels or inner not in levels:
            continue
        # 화면에서 한 번도 마주치지 않는 짝은 단계를 벌려도 보이지 않습니다.
        if frozenset((outer, inner)) not in meets:
            skipped += 1
            continue
        checked += 1
        if levels[inner] > levels[outer]:
            continue
        problems.append(
            f"원문은 '{inner}'를 '{outer}'보다 안쪽에 적습니다({count}곳, 반대는 {back}곳). "
            f"화면은 '{outer}' {levels[outer]}단계, '{inner}' {levels[inner]}단계로 두어 "
            "위아래가 뒤집혔거나 나란합니다."
        )

    if problems:
        for line in problems[:20]:
            print(f"  - {line}", file=sys.stderr)
        print(f"\n글머리표 위계 문제 {len(problems)}건", file=sys.stderr)
        raise SystemExit(1)

    print(
        f"글머리표 위계 {checked}짝이 원문의 들여쓰기와 같습니다"
        f"(한 화면에서 마주칠 일이 없는 {skipped}짝은 빼고 봤습니다)."
    )


if __name__ == "__main__":
    main()
