from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"교체 구문을 찾지 못했습니다: {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def main() -> None:
    source = ROOT / "docs" / "index-faithful.html"
    target = ROOT / "docs" / "index.html"
    target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    bootstrap = ROOT / "docs" / "assets" / "guide-bootstrap.js"
    text = bootstrap.read_text(encoding="utf-8")
    if 'await loadScript("assets/app-v2.js");' in text:
        replace_once(
            bootstrap,
            'await loadScript("assets/app-v2.js");',
            'await loadScript("assets/app-faithful.js");',
        )
    elif 'await loadScript("assets/app-faithful.js");' not in text:
        raise RuntimeError("앱 로더 구문을 찾지 못했습니다.")

    print("원문 충실형 화면 설치 완료")


if __name__ == "__main__":
    main()
