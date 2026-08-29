"""칸 안의 문단 나눔이 살아 있는지 한글파일과 대조합니다.

한 칸에 문단이 여럿 들어 있는 자리가 많습니다. 한글파일은 문단마다 따로
적어 두는데(hp:p), 글자를 읽어 오는 쪽(kordoc)은 그것을 한 줄로 이어 붙입니다.
자리와 크기는 한글파일에서, 글자는 kordoc에서 가져오다 보니 줄 나눔이
통째로 사라졌습니다.

    제4편 휴가 '2. 공가 사유'
    원문 : ｢병역법｣ … 훈련에 참가할 때
           공무에 관하여 국회, 법원, … 소환될 때
           법률에 따라 투표에 참가할 때, …          (문단 11개)
    예전 화면 : ｢병역법｣ … 참가할 때 공무에 관하여 국회, … 소환될 때 법률에 …

사유 열한 가지가 마침표도 없이 한 문단으로 붙어, 어디서 하나가 끝나고
다음이 시작하는지 알 수 없었습니다.

한 문장이 길어 다음 줄로 넘긴 자리는 셈에서 뺍니다. 그런 줄은 원문에서
한두 칸 들여 씌어 있습니다('◦발신 명의 표시의 마지막 글자가 공인의 /
  가운데 오도록 날인'). 그 들여쓰기가 '앞줄에 이어지는 줄'이라는 표시입니다.

여기서는 만들어 낸 중간 파일을 믿지 않고 **한글파일을 직접 엽니다**.
중간 파일만 보면, 읽어 오는 쪽을 꺼도 '읽은 것이 없으니 문제도 없다'가
되어 아무것도 지키지 못합니다.

글자가 짧은 칸은 우연히 같은 글이 여기저기 있어 짝을 못 믿습니다.
넉넉히 긴 칸만 봅니다.

사용법: python3 scripts/validate_cell_lines.py
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

# 이만큼은 길어야 같은 글자끼리 짝지어도 믿을 수 있습니다.
LONG_ENOUGH = 40
# 꾸밈 글자는 빼고 글자만 견줍니다(build_chapters_from_hwpx.mjs의 bare와 같습니다).
DECORATION = re.compile(
    "[-–—•◦‣▪▫▶※·∙‧・…‥/⇒⇨⇩⇦⇧⇔⇙⇘⇗⇖➡➔➜→←↑↓≫≪×✕✔√☞★☆◇◆▲▼()（）\\[\\]［］\\s]"
)
PUA = re.compile("[-\U000f0000-\U000ffffd]")
IMAGE_MARK = re.compile(r"\[\[그림:[^\]]*\]\]")
# 한글이 스스로 매기는 번호는 한글파일 글자에 없고 kordoc 쪽에만 있습니다.
SKIP_SUBTREE = {"tbl"}
# 글머리표로 시작하는 줄은 들여썼어도 딸린 항목이지 이어지는 줄이 아닙니다.
MARKED = re.compile(r"^\s*(?:[•‣▸▹▶▪□○◦※*]|[-–]\s)")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def bare(value: str) -> str:
    return DECORATION.sub("", PUA.sub("", IMAGE_MARK.sub("", str(value or ""))))


def paragraphs_of(node: ET.Element):
    """칸의 문단만 냅니다. 칸 안에 든 표로는 내려가지 않습니다."""
    for child in node:
        name = local_name(child.tag).lower()
        if name in SKIP_SUBTREE:
            continue
        if name == "p":
            yield child
            continue
        yield from paragraphs_of(child)


def text_of(node: ET.Element) -> str:
    return "".join(
        "".join(piece.itertext()) for piece in node.iter() if local_name(piece.tag) == "t"
    )


def wanted_lines(path: Path) -> dict[str, int]:
    """한글파일에서 '칸의 글자 → 그 칸이 가져야 할 줄 수'를 냅니다."""
    found: dict[str, int] = {}
    with zipfile.ZipFile(path) as archive:
        for name in sorted(n for n in archive.namelist() if SECTION_RE.match(n)):
            root = ET.fromstring(archive.read(name))
            for cell in root.iter():
                if local_name(cell.tag) != "tc":
                    continue
                lines = 0
                whole = []
                for paragraph in paragraphs_of(cell):
                    raw = text_of(paragraph)
                    if not raw.strip():
                        continue
                    whole.append(raw)
                    # 들여쓴 줄은 앞줄에 이어지는 줄입니다. 세지 않습니다.
                    if lines and raw[:1].isspace() and not MARKED.match(raw):
                        continue
                    lines += 1
                key = bare("".join(whole))
                if len(key) < LONG_ENOUGH:
                    continue
                # 글자가 같은 칸이 두 군데 있고 줄 수가 다를 때가 있습니다.
                # 좁은 칸에서만 한 문장을 두 줄로 끊어 적은 자리입니다
                # (제5편 '설계변경 등으로 …' 은 한 곳은 3문단, 다른 곳은 4문단).
                # 화면에 실린 것이 어느 쪽인지 가릴 수 없으므로 적은 쪽으로
                # 봅니다. 없는 잘못을 알리는 것보다 낫습니다.
                #
                # **한 줄짜리 칸도 함께 셉니다.** 예전에는 두 줄 미만이면 아예
                # 담지 않아, 같은 글이 한 줄로도 적힌 자리를 못 보고 늘 많은
                # 쪽을 요구했습니다(제14편 앞머리 요약의 흐름 칸은 한 문단인데,
                # 차례 표의 같은 글이 두 문단이라 없는 잘못이 잡혔습니다).
                found[key] = min(found.get(key, lines), lines)
    # 어느 자리에서나 한 줄이면 지킬 줄 나눔이 없습니다.
    return {key: lines for key, lines in found.items() if lines >= 2}


def chapter_data(chapter: int) -> dict | None:
    file = ROOT / "docs" / "assets" / f"chapter{chapter}-data.js"
    if not file.exists():
        return None
    raw = file.read_text(encoding="utf-8")
    raw = raw.replace(f"window.CHAPTER{chapter}_DATA = ", "", 1).rstrip().rstrip(";")
    return json.loads(raw)


def shown_lines(data: dict) -> dict[str, int]:
    """화면 자료에서 '칸의 글자 → 그 칸에 실린 줄 수'를 냅니다."""
    found: dict[str, int] = collections.defaultdict(int)

    def walk(tables):
        for table in tables or []:
            for row in [table.get("headers") or []] + (table.get("rows") or []):
                for cell in row:
                    if not cell:
                        continue
                    said = str(cell.get("text") or "")
                    lines = [line for line in said.split("\n") if line.strip()]
                    # 들여쓴 줄은 화면에서도 앞줄에 이어 붙습니다. 세지 않습니다.
                    count = sum(
                        1
                        for at, line in enumerate(lines)
                        if at == 0 or not line[:1].isspace() or MARKED.match(line)
                    )
                    key = bare(said)
                    if key:
                        found[key] = max(found[key], count)
                    if cell.get("tables"):
                        walk(cell["tables"])

    for work in data.get("sections") or []:
        for block in work.get("contentBlocks") or []:
            walk(block.get("tables"))
    return found


def main() -> None:
    problems: list[str] = []
    checked = 0
    for path in sorted((ROOT / "source" / "manual-hwpx").glob("*.hwpx")):
        match = re.match(r"제(\d+)편", path.name)
        if not match:
            continue
        chapter = int(match.group(1))
        data = chapter_data(chapter)
        if data is None:
            continue
        shown = shown_lines(data)
        for key, want in wanted_lines(path).items():
            if key not in shown:
                # 업무 본문에 실리지 않은 지면(서식 견본)입니다.
                continue
            checked += 1
            if shown[key] >= want:
                continue
            problems.append(
                f"제{chapter:02d}편: 칸 안의 문단 나눔이 사라졌습니다 "
                f"(원문 {want}줄 → 화면 {shown[key]}줄, '{key[:36]}…')."
            )

    if problems:
        for line in problems[:20]:
            print(f"  - {line}", file=sys.stderr)
        print(f"\n칸 안의 줄 나눔 문제 {len(problems)}건", file=sys.stderr)
        raise SystemExit(1)

    print(f"칸 안의 문단 나눔 {checked}칸이 원문 그대로 실렸습니다.")


if __name__ == "__main__":
    main()
