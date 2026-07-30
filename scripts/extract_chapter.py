from __future__ import annotations

import argparse
import json
import re
import struct
import zipfile
import zlib
from pathlib import Path
import xml.etree.ElementTree as element_tree

import olefile
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]


def normalize_text(text: str) -> str:
    text = text.replace("\x00", " ").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\u0001-\u0008\u000b\u000c\u000e-\u001f]", " ", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pdf(path: Path) -> list[dict[str, object]]:
    reader = PdfReader(path)
    pages: list[dict[str, object]] = []
    for index, page in enumerate(reader.pages, start=1):
        text = normalize_text(page.extract_text() or "")
        pages.append(
            {
                "pdf_page": index,
                "character_count": len(text),
                "text": text,
            }
        )
    return pages


def extract_hwpx(path: Path) -> list[str]:
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


def extract_hwp(path: Path) -> list[str]:
    paragraphs: list[str] = []
    with olefile.OleFileIO(path) as document:
        header = document.openstream("FileHeader").read()
        compressed = bool(header[36] & 1)
        section_names = sorted(
            "/".join(parts)
            for parts in document.listdir()
            if len(parts) == 2 and parts[0] == "BodyText" and parts[1].startswith("Section")
        )
        for section_name in section_names:
            raw = document.openstream(section_name).read()
            if compressed:
                raw = zlib.decompress(raw, -15)
            position = 0
            while position + 4 <= len(raw):
                header_value = struct.unpack_from("<I", raw, position)[0]
                position += 4
                tag_id = header_value & 0x3FF
                size = (header_value >> 20) & 0xFFF
                if size == 0xFFF:
                    if position + 4 > len(raw):
                        break
                    size = struct.unpack_from("<I", raw, position)[0]
                    position += 4
                payload = raw[position : position + size]
                position += size
                if tag_id != 67 or not payload:
                    continue
                text = normalize_text(payload.decode("utf-16le", errors="ignore"))
                if text:
                    paragraphs.append(text)
    return paragraphs


def require_one(directory: Path, pattern: str, label: str) -> Path:
    matches = sorted(directory.glob(pattern))
    if len(matches) != 1:
        names = ", ".join(path.name for path in matches) or "없음"
        raise RuntimeError(f"{label} 파일을 하나만 찾을 수 있어야 합니다: {names}")
    return matches[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("chapter", type=int, help="추출할 편 번호")
    args = parser.parse_args()

    chapter_id = f"{args.chapter:02d}"
    source = ROOT / "source" / f"chapter-{chapter_id}" / "original"
    output = ROOT / "tmp" / "extracted" / f"chapter-{chapter_id}"
    output.mkdir(parents=True, exist_ok=True)

    manual = require_one(source, "*.pdf", "매뉴얼")
    faq = require_one(source, "*FAQ.hwp", "FAQ")
    forms = require_one(source, "*.hwpx", "서식")

    pages = extract_pdf(manual)
    faq_paragraphs = extract_hwp(faq)
    form_paragraphs = extract_hwpx(forms)

    (output / "manual-pages.json").write_text(
        json.dumps(pages, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output / "manual.txt").write_text(
        "\n\n".join(
            f"===== PDF {page['pdf_page']}쪽 =====\n{page['text']}" for page in pages
        ),
        encoding="utf-8",
    )
    (output / "faq.txt").write_text("\n".join(faq_paragraphs), encoding="utf-8")
    (output / "forms.txt").write_text("\n".join(form_paragraphs), encoding="utf-8")

    nonempty_pages = sum(bool(page["text"]) for page in pages)
    total_characters = sum(int(page["character_count"]) for page in pages)
    print(f"chapter: {chapter_id}")
    print(f"manual pages: {len(pages)}")
    print(f"manual nonempty pages: {nonempty_pages}")
    print(f"manual characters: {total_characters}")
    print(f"faq paragraphs: {len(faq_paragraphs)}")
    print(f"faq characters: {sum(len(text) for text in faq_paragraphs)}")
    print(f"forms paragraphs: {len(form_paragraphs)}")
    print(f"forms characters: {sum(len(text) for text in form_paragraphs)}")


if __name__ == "__main__":
    main()
