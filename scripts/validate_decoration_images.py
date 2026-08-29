"""지면 장식 그림이 본문 그림으로 섞여 들어가지 않았는지 봅니다.

한글파일에는 본문 그림 말고도 그림이 여럿 들어 있습니다.

    편 표지 배경   쪽을 통째로 덮는 그림(59527×84189 — 쪽 크기와 같습니다)
    쪽 머리 띠     본문 폭만큼 길고 아주 납작한 띠(49322×4469)
    글머리표       '●' 자리에 쓰는 작은 그림(hh:bullet useImage="1")
    딱지           '붙임' 같은 글 뒤에 까는 꾸밈(세 조각으로 갈라져 있습니다)

이것을 본문 그림으로 꺼내면 두 가지가 어그러집니다.
  · 화면 본문 한가운데에 청록색 표지 배경과 빨간 띠가 그려집니다
    (제8편 교육공무직원 복무 끝에 남았던 네모 띠)
  · 쓰지도 않는 그림이 저장소에 쌓입니다(71장 5506KB 가운데 27장이
    지면 장식이었습니다)

크기로 어림잡지 않습니다. 한글파일이 그림을 어느 자리에 어느 크기로
놓았는지 적어 두었으므로, 그것을 그대로 읽어 가립니다
(scripts/extract_manual_images.py의 page_decoration·bullet_images 등).
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from extract_manual_images import (  # noqa: E402
    background_pictures,
    bullet_images,
    decoration_images,
    page_decoration,
)

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tmp" / "manual-images.json"


def item_shas(archive: zipfile.ZipFile) -> dict[str, str]:
    """한글파일 안 그림 이름과 그 그림의 지문을 잇습니다."""
    try:
        manifest = archive.read("Contents/content.hpf").decode("utf-8", "ignore")
    except KeyError:
        return {}
    found: dict[str, str] = {}
    for match in re.finditer(r'<opf:item[^>]*id="([^"]+)"[^>]*href="(BinData/[^"]+)"', manifest):
        try:
            found[match.group(1)] = hashlib.sha1(archive.read(match.group(2))).hexdigest()
        except KeyError:
            continue
    return found


def main() -> None:
    if not MANIFEST.exists():
        print("tmp/manual-images.json이 없습니다. python3 scripts/extract_manual_images.py를 먼저 실행하세요.")
        raise SystemExit(1)
    kept = json.loads(MANIFEST.read_text(encoding="utf-8"))

    problems: list[str] = []
    checked = 0
    for path in sorted(
        (ROOT / "source" / "manual-hwpx").glob("*.hwpx"),
        key=lambda one: int(re.match(r"제(\d+)편", one.name).group(1)),
    ):
        chapter = int(re.match(r"제(\d+)편", path.name).group(1))
        label = f"{chapter:02d}"
        mine = kept.get(label) or {}
        if not mine:
            continue
        with zipfile.ZipFile(path) as archive:
            content, behind = background_pictures(archive)
            skip = (
                decoration_images(archive)
                | page_decoration(archive)
                | bullet_images(archive)
                | behind
            ) - content
            shas = item_shas(archive)
            for name, picture in mine.items():
                checked += 1
                item = next(
                    (key for key, sha in shas.items() if sha == picture.get("sha1")), ""
                )
                if item and item in skip:
                    problems.append(
                        f"제{label}편 {name}({picture['width']}×{picture['height']})은 "
                        "지면 장식입니다."
                    )
                # 꺼내 놓은 파일이 실제로 있는지도 함께 봅니다.
                if not (ROOT / "docs" / (picture["src"])).exists():
                    problems.append(f"제{label}편 {name} 그림 파일이 없습니다: {picture['src']}")

    if problems:
        print("본문 그림에 지면 장식이 섞였습니다.", file=sys.stderr)
        for line in problems:
            print("  -", line, file=sys.stderr)
        raise SystemExit(1)
    print(f"본문 그림 {checked}장 모두 지면 장식이 아닙니다.")


if __name__ == "__main__":
    main()
