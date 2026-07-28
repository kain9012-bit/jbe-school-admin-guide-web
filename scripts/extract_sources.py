from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source" / "chapter-01" / "original"
OUTPUT_DIR = ROOT / "tmp" / "extracted"


def normalize_text(text: str) -> str:
    text = text.replace("\x00", " ").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pdf(path: Path) -> list[dict[str, object]]:
    reader = PdfReader(path)
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        pages.append(
            {
                "pdf_page": index,
                "printed_page": index + 4 if index >= 3 else None,
                "text": normalize_text(page.extract_text() or ""),
            }
        )
    return pages


def extract_hwpx_preview(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        raw = archive.read("Preview/PrvText.txt").decode("utf-8", errors="replace")
    return normalize_text(raw)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manual = SOURCE_DIR / "제1편행정업무및보안.pdf"
    faq = ROOT / "tmp" / "hwp" / "chapter1_faq.hwpx"
    forms = SOURCE_DIR / "제1편행정업무및보안서식및예시자료1.hwpx"

    pages = extract_pdf(manual)
    (OUTPUT_DIR / "manual-pages.json").write_text(
        json.dumps(pages, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUTPUT_DIR / "manual.txt").write_text(
        "\n\n".join(
            f"===== PDF {page['pdf_page']}쪽 =====\n{page['text']}" for page in pages
        ),
        encoding="utf-8",
    )
    (OUTPUT_DIR / "faq-preview.txt").write_text(
        extract_hwpx_preview(faq), encoding="utf-8"
    )
    (OUTPUT_DIR / "forms-preview.txt").write_text(
        extract_hwpx_preview(forms), encoding="utf-8"
    )

    print(f"manual pages: {len(pages)}")
    print(f"faq characters: {(OUTPUT_DIR / 'faq-preview.txt').stat().st_size}")
    print(f"forms characters: {(OUTPUT_DIR / 'forms-preview.txt').stat().st_size}")


if __name__ == "__main__":
    main()
