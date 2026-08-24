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
QUALITY = 82


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
    kept = dropped = unreadable = 0

    for chapter, path in sources:
        label = f"{chapter:02d}"
        found: dict[str, dict] = {}
        with zipfile.ZipFile(path) as archive:
            for name in archive.namelist():
                if not name.startswith("BinData/"):
                    continue
                # 본문은 확장자를 떼고 'image7'이라는 이름으로 부릅니다.
                key = Path(name).stem
                raw = archive.read(name)
                try:
                    picture = Image.open(io.BytesIO(raw))
                    picture.load()
                except Exception:
                    unreadable += 1
                    continue
                width, height = picture.size
                if not is_content(width, height):
                    dropped += 1
                    continue
                picture = picture.convert("RGB")
                if width > MAX_WIDTH:
                    height = round(height * MAX_WIDTH / width)
                    width = MAX_WIDTH
                    picture = picture.resize((width, height), Image.LANCZOS)
                folder = OUT / f"chapter{label}"
                folder.mkdir(parents=True, exist_ok=True)
                picture.save(folder / f"{key}.jpg", "JPEG", quality=QUALITY, optimize=True)
                found[key] = {
                    "src": f"assets/manual-images/chapter{label}/{key}.jpg",
                    "width": width,
                    "height": height,
                    # 본문은 그림을 두 가지 이름으로 부릅니다. 문단 안에서는
                    # 한글파일에 든 이름('image7')으로, 홀로 놓인 그림은
                    # kordoc이 붙인 이름('image_005.bmp')으로 옵니다. 두 이름을
                    # 잇는 길이 없으므로 그림 자체의 지문으로 맞춥니다.
                    "sha1": hashlib.sha1(raw).hexdigest(),
                }
                kept += 1
        if found:
            manifest[label] = found
            print(f"제{chapter:2d}편 그림 {len(found)}장", file=sys.stderr)

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    size = sum(f.stat().st_size for f in OUT.rglob("*.jpg")) if OUT.exists() else 0
    print(
        f"본문 그림 {kept}장 저장 ({size // 1024}KB) · "
        f"글머리·표지 {dropped}장 제외 · 못 읽음 {unreadable}장",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
