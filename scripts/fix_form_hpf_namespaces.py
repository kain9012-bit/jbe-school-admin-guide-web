"""이미 쪼개 둔 서식 한글파일의 content.hpf에 이름공간을 되살립니다.

build_form_assets.py가 XML을 다시 쓰면서, 당장 쓰이지 않는 이름공간(xmlns:...)을
전부 지워 버렸습니다. 원문에 14개가 적혀 있던 것이 1개만 남았습니다.
content.hpf는 한글이 꾸러미를 알아보는 설명서라, 이것이 줄어들면 한글이
온전한 hwpx로 보지 않고 열 때 보안 경고를 냅니다.

서식을 통째로 다시 만들면 10분 넘게 걸리고 100MB가 넘게 오갑니다.
바뀌는 것은 파일 안의 설명서 한 장뿐이므로 그것만 갈아 끼웁니다.

사용법: python3 scripts/fix_form_hpf_namespaces.py [--chapters 02,04] [--dry]
"""

from __future__ import annotations

import argparse
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
HPF = "Contents/content.hpf"
NAMESPACE = re.compile(rb'xmlns:([A-Za-z0-9_.-]+)="([^"]+)"')
OPENING = re.compile(rb"<[A-Za-z0-9_.:-]+[^>]*>")


def namespaces_of(raw: bytes) -> list[tuple[bytes, bytes]]:
    found = OPENING.search(raw[raw.index(b"?>") + 2 :] if b"?>" in raw else raw)
    return NAMESPACE.findall(found.group(0)) if found else []


def with_namespaces(target: bytes, source: bytes) -> bytes:
    """target의 첫 태그에 source에만 있는 이름공간을 덧붙입니다."""
    body_at = target.index(b"?>") + 2 if b"?>" in target else 0
    found = OPENING.search(target[body_at:])
    if not found:
        return target
    have = {prefix for prefix, _ in namespaces_of(target)}
    missing = b"".join(
        b' xmlns:%s="%s"' % (prefix, uri)
        for prefix, uri in namespaces_of(source)
        if prefix not in have
    )
    if not missing:
        return target
    opening = found.group(0)
    return target[:body_at] + target[body_at:].replace(
        opening, opening[:-1] + missing + b">", 1
    )


def source_hpf(chapter_id: str) -> bytes | None:
    combined = DOCS / "downloads" / f"chapter{int(chapter_id)}-forms.hwpx"
    if not combined.exists():
        return None
    with zipfile.ZipFile(combined) as archive:
        return archive.read(HPF)


def repair(path: Path, source: bytes) -> bool:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        payload = {name: archive.read(name) for name in names}
    fixed = with_namespaces(payload[HPF], source)
    if fixed == payload[HPF]:
        return False
    payload[HPF] = fixed

    # 마운트된 폴더에서는 파일을 지울 수 없어, 옆에서 만들어 덮어씁니다.
    with tempfile.NamedTemporaryFile(delete=False, suffix=".hwpx") as scratch:
        temporary = Path(scratch.name)
    with zipfile.ZipFile(temporary, "w") as archive:
        for name in names:
            archive.writestr(
                name,
                payload[name],
                zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED,
            )
    shutil.copyfile(temporary, path)
    temporary.unlink()
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chapters", help="쉼표로 나눈 편 번호 (예: 02,04)")
    parser.add_argument("--dry", action="store_true", help="고치지 않고 세어만 봅니다")
    options = parser.parse_args()
    only = set(options.chapters.split(",")) if options.chapters else None

    root = DOCS / "downloads" / "forms"
    if not root.exists():
        print("쪼개 둔 서식이 없습니다.")
        return 0

    total = 0
    for folder in sorted(root.iterdir()):
        chapter_id = folder.name.replace("chapter", "")
        if only and chapter_id not in only:
            continue
        source = source_hpf(chapter_id)
        if source is None:
            print(f"제{chapter_id}편: 통합 원본이 없어 건너뜁니다.")
            continue
        fixed = 0
        for path in sorted(folder.glob("*.hwpx")):
            if options.dry:
                with zipfile.ZipFile(path) as archive:
                    if with_namespaces(archive.read(HPF), source) != archive.read(HPF):
                        fixed += 1
            elif repair(path, source):
                fixed += 1
        total += fixed
        print(f"제{chapter_id}편: {fixed}개 / {len(list(folder.glob('*.hwpx')))}개")

    print(f"\n{'고칠 것' if options.dry else '고친 것'} 모두 {total}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
