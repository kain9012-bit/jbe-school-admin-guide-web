"""매뉴얼 한글파일에 든 그림을 꺼내 화면에 실을 수 있게 만듭니다.

매뉴얼은 말로 설명하기 어려운 것을 사진으로 보여 줍니다.

    제1편 기록물 관리 TIP
    '문서 편철 및 보관 방법'  ← 사진 넉 장(진행문서파일, 발생·논리순 정리,
                              철표지·집게고정, 보존상자 보관)

지금까지는 이 그림을 아예 꺼내지 않고 자리 표시만 지웠습니다. 그래서
화면에는 사진 밑에 달린 이름만 '진행문서파일 / 발생 논리순 정리 / …'처럼
남아, 무엇을 설명하는 말인지 알 수 없었습니다.

그림은 한글파일 안 BinData 폴더에 들어 있고, 본문은 그것을 'image7'처럼
이름으로 부릅니다. 여기서 그 그림을 꺼내 웹에서 쓸 수 있는 크기로 줄여
docs/assets/manual-images/chapterNN/ 에 넣고, 어느 편의 어느 이름인지
tmp/manual-images.json에 적어 둡니다.

본문 그림이 아닌 것은 뺍니다.

먼저 **한글파일이 말해 주는 것**으로 뺍니다.
  · 쪽 바탕·머리글에서만 부르는 그림(지면 장식)

한글파일은 쪽 바탕을 Contents/masterpage*.xml에, 머리글·꼬리글을
hp:header·hp:footer에 따로 적어 둡니다. 그림은 저마다 이름으로 불립니다.

    제8편  쪽 바탕에서만 부르는 그림 : image1(쪽 전체 바탕), image2(머리 띠)
           본문에서 부르는 그림     : image3 image4 image5 image6

본문이 한 번도 부르지 않는 그림은 본문 그림이 아닙니다. 짐작할 것이 없습니다.

그다음도 **자리**로 봅니다.
  · 표 칸 안에 든 그림은 크기와 상관없이 본문 그림입니다.

매뉴얼은 표 칸에 사진을 넣습니다. 사진이 곧 그 칸의 내용입니다.

    제12편 물품관리 '3. 전자태그 및 장비' — 태그 종류
    라벨형 태그 | [사진 164×47] | ◦적용물품: TV, 모니터, …

크기로만 어림잡으면 이 사진(세로 47점)이 '글머리표로 쓴 작은 그림'으로
걸러집니다. 칸 안에 놓였다는 사실이 크기보다 확실합니다.

그다음 크기로 어림잡습니다. 어림은 어디까지나 어림이라, 위의 것을 대신하지
못합니다. 실제로 제8편 머리 띠(1240×1754)는 아래 세 가지를 모두 비껴가
본문 그림으로 꺼내졌고, 교육공무직원 복무 끝에 빨간 네모 띠로 남았습니다.
  · 글머리표로 쓴 아주 작은 그림(가로세로 60점 미만)
  · 편 표지처럼 쪽을 통째로 채운 그림(2000점이 넘는 것)
  · 쪽 머리에 깔린 띠(가로만 아주 긴 것)

사용법: python3 scripts/extract_manual_images.py
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    print("Pillow가 필요합니다: pip install pillow --break-system-packages", file=sys.stderr)
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets" / "manual-images"
MANIFEST = ROOT / "tmp" / "manual-images.json"

# 화면 본문 폭이 780점이므로 그보다 조금 넉넉하게 잡습니다.
# 화면이 촘촘한 기기에서도 흐려 보이지 않을 만큼입니다.
MAX_WIDTH = 900

# 그림은 **손실 없이** 저장합니다(PNG).
#
# 예전에는 JPEG(품질 82)로 저장했습니다. 매뉴얼 그림은 사진보다 화면을 찍은
# 그림이나 표·글자가 든 그림이 많습니다. JPEG는 글자 언저리를 뭉개므로
# 전자태그 사진의 글씨가 원본보다 눈에 띄게 흐려졌습니다.
#
#   "왜 사진의 화질이 원본에 비해서 너무 않좋지?"
#
# 한글파일 안에 원본이 그대로 들어 있습니다. 줄이지 않아도 되는 그림은
# 픽셀 그대로 옮깁니다. 폭이 아주 넓은 것만 줄입니다.


SECTION_RE = re.compile(r"^Contents/section(\d+)\.xml$")
MASTER_RE = re.compile(r"^Contents/masterpage\d*\.xml$")
# 쪽 머리글·꼬리글 같은 곁가지입니다(read_hwpx_tables.py의 SKIP_SUBTREE와 같습니다).
SKIP_SUBTREE = {"header", "footer", "footnote", "endnote", "hiddencomment"}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def bullet_images(archive: zipfile.ZipFile) -> set[str]:
    """글머리표로 쓴 그림 이름을 모읍니다.

    한글파일은 '●' 같은 글머리표를 그림으로 대신할 수 있습니다
    (hh:bullet useImage="1"). 그림이라고 다 본문 그림은 아닙니다. 이것은
    글머리표라, 화면에서는 이미 목록 기호로 그려집니다.

        제13편  image1(123×123) image2(69×69) image3(70×71)  ← 글머리표

    크기로 어림잡지 않고 한글파일이 적어 둔 자리(hh:bullet)로 가립니다.
    """
    found: set[str] = set()
    if "Contents/header.xml" not in archive.namelist():
        return found

    def walk(node, in_bullet: bool) -> None:
        here = in_bullet or local_name(node.tag).lower() == "bullet"
        if here:
            for name, value in node.attrib.items():
                if local_name(name) == "binaryItemIDRef" and value:
                    found.add(value)
        for child in node:
            walk(child, here)

    walk(ET.fromstring(archive.read("Contents/header.xml")), False)
    return found


def page_decoration(archive: zipfile.ZipFile) -> set[str]:
    """본문에 놓였지만 지면 장식인 그림을 모읍니다.

    편 표지 배경과 쪽 머리에 깔린 띠는 쪽 바탕(masterpage)이 아니라 본문
    section 안에 그냥 놓여 있는 편이 있습니다. 그래서 '쪽 바탕에서만 부르는
    그림'을 걷어 내는 것만으로는 걸러지지 않았습니다.

        제6편  image3·image4 : 놓인 크기 59527×84189
               쪽 크기        : 59528×84186   ← 쪽을 통째로 덮습니다
               image5        : 49322×4469    ← 쪽 머리에 깔린 납작한 띠

    한글파일은 그림을 어느 크기로 놓았는지(hp:sz), 쪽이 얼마나 큰지
    (hp:pagePr) 적어 둡니다. 짐작하지 않고 그 수치로 가립니다.
      · 쪽을 거의 다 덮는 그림(가로·세로 모두 95% 이상) → 지면 장식
      · 쪽 폭의 70%를 넘으면서 높이가 폭의 1/8도 안 되는 그림 → 머리 띠
    """
    found: set[str] = set()

    def sizes_in(node, page: list[int]) -> None:
        name = local_name(node.tag).lower()
        if name == "pagepr":
            page[0] = int(node.get("width") or 0)
            page[1] = int(node.get("height") or 0)
        if name == "pic":
            width = height = 0
            ref = ""
            for sub in node.iter():
                tag = local_name(sub.tag).lower()
                if tag == "sz" and not width:
                    width = int(sub.get("width") or 0)
                    height = int(sub.get("height") or 0)
                if tag == "img" and not ref:
                    ref = sub.get("binaryItemIDRef") or ""
            page_width, page_height = page
            if ref and width and page_width:
                covers = width >= page_width * 0.95 and height >= page_height * 0.95
                band = width >= page_width * 0.70 and height <= width / 8
                if covers or band:
                    found.add(ref)
        for child in node:
            sizes_in(child, page)

    for name in sorted(archive.namelist()):
        if SECTION_RE.match(name):
            sizes_in(ET.fromstring(archive.read(name)), [0, 0])
    return found


def placed_widths(archive: zipfile.ZipFile) -> dict[str, int]:
    """그림을 **본문 폭의 몇 %로 놓았는지** 읽습니다.

    비트맵이 몇 픽셀인지는 그림을 얼마나 크게 보여 줄지와 상관이 없습니다.
    매뉴얼을 만든 사람이 정한 것은 '지면에서 이만큼 차지한다'이고, 그 값이
    hp:pic 안의 hp:sz에 적혀 있습니다.

        제14편 [참고1] K-에듀파인 편성절차 그림
        비트맵      900점
        놓인 크기   44610 (본문 폭 49322의 90%)

    이것을 읽지 않으면 화면이 제 나름의 크기로 그립니다. 실제로 사진 한 장은
    340px로 못박혀 있어서, 원문에서 본문 폭을 거의 채우던 그림이 절반도 안
    되게 쪼그라들었습니다.
    """
    found: dict[str, int] = {}

    def walk(node, room: list[int]) -> None:
        name = local_name(node.tag).lower()
        if name == "pagepr":
            width = int(node.get("width") or 0)
            margin = next((c for c in node if local_name(c.tag).lower() == "margin"), None)
            left = int(margin.get("left") or 0) if margin is not None else 0
            right = int(margin.get("right") or 0) if margin is not None else 0
            room[0] = max(0, width - left - right)
        if name == "pic":
            width = 0
            ref = ""
            for sub in node.iter():
                tag = local_name(sub.tag).lower()
                if tag == "sz" and not width:
                    width = int(sub.get("width") or 0)
                if tag == "img" and not ref:
                    ref = sub.get("binaryItemIDRef") or ""
            if ref and width and room[0]:
                share = round(width / room[0] * 100)
                # 본문 폭을 넘겨 놓은 그림은 폭에 맞춥니다.
                found[ref] = max(found.get(ref, 0), min(share, 100))
        for child in node:
            walk(child, room)

    for name in sorted(archive.namelist()):
        if SECTION_RE.match(name):
            walk(ET.fromstring(archive.read(name)), [0])
    return found


def background_pictures(archive: zipfile.ZipFile) -> tuple[set[str], set[str]]:
    """칸 바탕에 깔린 그림을 '내용'과 '장식'으로 가릅니다.

    매뉴얼은 사진을 칸 안에 넣지 않고 **칸 바탕**으로 까는 자리가 있습니다.

        제12편 물품대장 예시 — 글 없는 칸 둘의 바탕이 물품 사진입니다
                               (borderFill 150·151 → image1·image2)

    바탕 그림이라고 다 사진은 아닙니다. 글 뒤에 까는 딱지도 있습니다.

        제15편 '붙임' 딱지 — 116×94·124×94·422×94 세 조각을 이어 붙인
                             둥근 딱지이고, 그 위에 '붙임' 글자가 놓입니다

    가르는 자리는 **그 표에 읽을 글이 있는가**입니다. 바탕 그림을 깐 칸이
    모두 비어 있으면 그림이 곧 그 표의 내용이고, 한 칸이라도 글을 이고 있으면
    그림은 글 뒤의 꾸밈입니다. 칸 하나씩 보면 안 됩니다 — '붙임' 딱지는 세
    조각으로 갈라져 있어 가운데 조각이 든 칸에는 글이 없습니다.
    """
    if "Contents/header.xml" not in archive.namelist():
        return set(), set()
    fills: dict[str, str] = {}
    for node in ET.fromstring(archive.read("Contents/header.xml")).iter():
        if local_name(node.tag).lower() != "borderfill":
            continue
        for sub in node.iter():
            if local_name(sub.tag).lower() == "img" and sub.get("binaryItemIDRef"):
                fills[node.get("id") or ""] = sub.get("binaryItemIDRef")
                break
    content: set[str] = set()
    behind: set[str] = set()
    for name in sorted(archive.namelist()):
        if not SECTION_RE.match(name):
            continue
        for table in ET.fromstring(archive.read(name)).iter():
            if local_name(table.tag).lower() != "tbl":
                continue
            here: set[str] = set()
            worded = False
            for cell in table.iter():
                if local_name(cell.tag).lower() != "tc":
                    continue
                picture = fills.get(cell.get("borderFillIDRef") or "")
                if not picture:
                    continue
                here.add(picture)
                if "".join(
                    sub.text or "" for sub in cell.iter() if local_name(sub.tag).lower() == "t"
                ).strip():
                    worded = True
            (behind if worded else content).update(here)
    return content, behind - content


def decoration_images(archive: zipfile.ZipFile) -> set[str]:
    """쪽 바탕·머리글에서만 부르는 그림 이름을 모읍니다.

    본문이 한 번이라도 부르는 그림은 빼지 않습니다. 같은 그림을 머리글에도
    본문에도 쓴 문서가 있으면 본문 쪽을 살려야 하기 때문입니다.
    """
    decoration: set[str] = set()
    body: set[str] = set()

    def walk(node, in_head: bool, into: set[str]) -> None:
        here = in_head or local_name(node.tag).lower() in ("header", "footer")
        for name, value in node.attrib.items():
            if local_name(name) == "binaryItemIDRef" and value:
                (decoration if here else into).add(value)
        for child in node:
            walk(child, here, into)

    for name in sorted(archive.namelist()):
        if MASTER_RE.match(name):
            walk(ET.fromstring(archive.read(name)), True, decoration)
        elif SECTION_RE.match(name):
            walk(ET.fromstring(archive.read(name)), False, body)
    return decoration - body


def cell_images(archive: zipfile.ZipFile) -> set[str]:
    """표 칸 안에 든 그림 이름을 모읍니다.

    칸 안에 놓였다는 것은 그 칸의 내용이라는 뜻입니다. 크기로 어림잡지
    않습니다(제12편 태그 사진은 세로 47점이라 어림에 걸렸습니다).
    """
    found: set[str] = set()

    def walk(node, skip: bool, inside: bool) -> None:
        name = local_name(node.tag).lower()
        if skip or name in SKIP_SUBTREE:
            return
        here = inside or name == "tc"
        if here:
            for key, value in node.attrib.items():
                if local_name(key) == "binaryItemIDRef" and value:
                    found.add(value)
        for child in node:
            walk(child, False, here)

    for name in sorted(archive.namelist()):
        if SECTION_RE.match(name):
            walk(ET.fromstring(archive.read(name)), False, False)
    return found


def is_content(width: int, height: int) -> bool:
    if width < 60 or height < 60:
        return False
    if width > 2000 and height > 2000:
        return False
    if width > 2000 and height < 520:
        return False
    return True


def main() -> None:
    sources = sorted(
        (int(re.match(r"제(\d+)편", path.name).group(1)), path)
        for path in (ROOT / "source" / "manual-hwpx").glob("*.hwpx")
        if re.match(r"제(\d+)편", path.name)
    )
    if OUT.exists():
        shutil.rmtree(OUT)
    manifest: dict[str, dict[str, dict]] = {}
    kept = dropped = unreadable = decoration = 0

    for chapter, path in sources:
        label = f"{chapter:02d}"
        found: dict[str, dict] = {}
        with zipfile.ZipFile(path) as archive:
            fill_content, fill_behind = background_pictures(archive)
            placed = placed_widths(archive)
            # 지면 장식입니다. 한글파일이 적어 둔 자리·크기로 가립니다.
            #   · 쪽 바탕·머리글에서만 부르는 그림
            #   · 본문에 놓였지만 쪽을 통째로 덮는 그림(편 표지 배경)과 머리 띠
            #   · 글머리표로 쓴 그림
            #   · 글 뒤에 까는 딱지 그림
            skip = (
                decoration_images(archive)
                | page_decoration(archive)
                | bullet_images(archive)
                | fill_behind
            ) - fill_content
            # 표 칸 안에 든 그림과 글 없는 칸의 바탕 그림은 크기를 재지 않고 그대로 씁니다.
            inside = cell_images(archive) | fill_content
            for name in archive.namelist():
                if not name.startswith("BinData/"):
                    continue
                # 본문은 확장자를 떼고 'image7'이라는 이름으로 부릅니다.
                key = Path(name).stem
                # 쪽 바탕·머리글에만 깔린 그림입니다. 크기를 재 볼 것도 없습니다.
                if key in skip:
                    decoration += 1
                    continue
                raw = archive.read(name)
                try:
                    picture = Image.open(io.BytesIO(raw))
                    picture.load()
                except Exception:
                    unreadable += 1
                    continue
                width, height = picture.size
                if key not in inside and not is_content(width, height):
                    dropped += 1
                    continue
                if width > MAX_WIDTH:
                    height = round(height * MAX_WIDTH / width)
                    width = MAX_WIDTH
                    picture = picture.resize((width, height), Image.LANCZOS)
                # 투명한 자리가 있는 그림은 그대로 둡니다. 흰색으로 메우면
                # 원문에 없는 흰 네모가 생깁니다.
                if picture.mode in ("RGBA", "LA", "P"):
                    picture = picture.convert("RGBA")
                elif picture.mode != "RGB":
                    picture = picture.convert("RGB")
                folder = OUT / f"chapter{label}"
                folder.mkdir(parents=True, exist_ok=True)
                picture.save(folder / f"{key}.png", "PNG", optimize=True)
                found[key] = {
                    "src": f"assets/manual-images/chapter{label}/{key}.png",
                    "width": width,
                    "height": height,
                    # 본문은 그림을 두 가지 이름으로 부릅니다. 문단 안에서는
                    # 한글파일에 든 이름('image7')으로, 홀로 놓인 그림은
                    # kordoc이 붙인 이름('image_005.bmp')으로 옵니다. 두 이름을
                    # 잇는 길이 없으므로 그림 자체의 지문으로 맞춥니다.
                    "sha1": hashlib.sha1(raw).hexdigest(),
                    # 원문이 본문 폭의 몇 %로 놓았는지입니다(위 placed_widths).
                    **({"place": placed[key]} if placed.get(key) else {}),
                }
                kept += 1
        if found:
            manifest[label] = found
            print(f"제{chapter:2d}편 그림 {len(found)}장", file=sys.stderr)

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    size = sum(f.stat().st_size for f in OUT.rglob("*.png")) if OUT.exists() else 0
    print(
        f"본문 그림 {kept}장 저장 ({size // 1024}KB) · "
        f"지면 장식 {decoration}장 제외 · 글머리·표지 {dropped}장 제외 · "
        f"못 읽음 {unreadable}장",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
