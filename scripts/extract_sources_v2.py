from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
import xml.etree.ElementTree as element_tree

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


def extract_hwpx_paragraphs(path: Path) -> list[str]:
    paragraphs: list[str] = []
    with zipfile.ZipFile(path) as archive:
        sections = sorted(
            name
            for name in archive.namelist()
            if name.startswith("Contents/section") and name.endswith(".xml")
        )
        for section in sections:
            root = element_tree.fromstring(archive.read(section))
            for paragraph in root.iter():
                if paragraph.tag.rsplit("}", 1)[-1] != "p":
                    continue
                chunks = [
                    node.text or ""
                    for node in paragraph.iter()
                    if node.tag.rsplit("}", 1)[-1] == "t"
                ]
                text = normalize_text("".join(chunks))
                if text:
                    paragraphs.append(text)
    return paragraphs


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
    faq_text = "\n".join(extract_hwpx_paragraphs(faq))
    forms_text = "\n".join(extract_hwpx_paragraphs(forms))
    (OUTPUT_DIR / "faq.txt").write_text(faq_text, encoding="utf-8")
    (OUTPUT_DIR / "forms.txt").write_text(forms_text, encoding="utf-8")

    print(f"manual pages: {len(pages)}")
    print(f"faq characters: {len(faq_text)}")
    print(f"forms characters: {len(forms_text)}")


if __name__ == "__main__":
    main()
