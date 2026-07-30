from __future__ import annotations

import argparse
import copy
import io
import json
import re
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
MARKER_RE = re.compile(r"\[(서식|예시|참고)\s*(\d+(?:-\d+)?)\]")
SECTION_RE = re.compile(r"^Contents/section(\d+)\.xml$")
SVG_NS = "http://www.w3.org/2000/svg"


@dataclass(frozen=True)
class ChapterSource:
    chapter_id: str
    hwpx: Path
    combined_svg: Path


CHAPTERS = (
    ChapterSource(
        chapter_id="01",
        hwpx=DOCS / "downloads" / "chapter1-forms.hwpx",
        combined_svg=ROOT / "tmp" / "chapter1-forms-kordoc.svg",
    ),
    ChapterSource(
        chapter_id="03",
        hwpx=DOCS / "downloads" / "chapter3-forms.hwpx",
        combined_svg=ROOT / "tmp" / "chapter3-forms-kordoc.svg",
    ),
)


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def namespace_of(tag: str) -> str:
    if tag.startswith("{"):
        return tag[1:].split("}", 1)[0]
    return ""


def qualified_like(reference_tag: str, local: str) -> str:
    namespace = namespace_of(reference_tag)
    return f"{{{namespace}}}{local}" if namespace else local


def register_namespaces(xml_bytes: bytes) -> None:
    seen: set[tuple[str, str]] = set()
    for _, item in ET.iterparse(io.BytesIO(xml_bytes), events=("start-ns",)):
        prefix, uri = item
        key = (prefix or "", uri)
        if key in seen:
            continue
        seen.add(key)
        try:
            ET.register_namespace(prefix or "", uri)
        except ValueError:
            pass


def parse_xml(xml_bytes: bytes) -> ET.Element:
    register_namespaces(xml_bytes)
    return ET.fromstring(xml_bytes)


def element_text(element: ET.Element) -> str:
    return re.sub(r"\s+", " ", "".join(element.itertext())).strip()


def marker_sort_key(marker: str) -> tuple[int, tuple[int, ...]]:
    match = re.fullmatch(r"(서식|예시|참고)(\d+(?:-\d+)?)", marker)
    if not match:
        return (99, (999,))
    category_order = {"서식": 0, "예시": 1, "참고": 2}
    return (
        category_order[match.group(1)],
        tuple(int(part) for part in match.group(2).split("-")),
    )


def marker_slug(marker: str) -> str:
    match = re.fullmatch(r"(서식|예시|참고)(\d+(?:-\d+)?)", marker)
    if not match:
        raise ValueError(f"지원하지 않는 항목 번호: {marker}")
    prefix = {"서식": "form", "예시": "example", "참고": "reference"}[match.group(1)]
    return f"{prefix}-{match.group(2)}"


def find_section_markers(
    sections: dict[str, bytes],
) -> list[tuple[str, str, int, int]]:
    parsed = {
        name: parse_xml(xml_bytes)
        for name, xml_bytes in sections.items()
        if SECTION_RE.match(name)
    }
    section_numbers = sorted(
        int(SECTION_RE.match(name).group(1))  # type: ignore[union-attr]
        for name in parsed
    )
    candidate_numbers = section_numbers[1:] if len(section_numbers) > 1 else section_numbers

    found: list[tuple[str, str, int, int]] = []
    seen: set[str] = set()
    for section_number in candidate_numbers:
        section_name = f"Contents/section{section_number}.xml"
        root = parsed[section_name]
        children = list(root)
        for index, child in enumerate(children):
            matches = {
                f"{match.group(1)}{match.group(2)}"
                for match in MARKER_RE.finditer(element_text(child))
            }
            if len(matches) != 1:
                continue
            marker = next(iter(matches))
            if marker in seen:
                continue
            seen.add(marker)
            found.append((marker, section_name, index, len(children)))

    found.sort(key=lambda row: (int(SECTION_RE.match(row[1]).group(1)), row[2]))  # type: ignore[union-attr]
    if not found:
        raise RuntimeError("HWPX에서 서식·예시·참고 경계를 찾지 못했습니다.")
    return found


def section_ranges(
    markers: list[tuple[str, str, int, int]],
) -> list[tuple[str, str, int, int]]:
    result: list[tuple[str, str, int, int]] = []
    for index, (marker, section_name, start, child_count) in enumerate(markers):
        end = child_count
        if index + 1 < len(markers) and markers[index + 1][1] == section_name:
            end = markers[index + 1][2]
        result.append((marker, section_name, start, end))
    return result


def clone_section_slice(source_xml: bytes, start: int, end: int) -> bytes:
    source_root = parse_xml(source_xml)
    source_children = list(source_root)
    output_root = ET.Element(source_root.tag, dict(source_root.attrib))
    for child in source_children[start:end]:
        output_root.append(copy.deepcopy(child))

    if not list(output_root):
        raise RuntimeError("분리할 HWPX 구간이 비어 있습니다.")

    first_paragraph = list(output_root)[0]
    first_paragraph.set("pageBreak", "0")
    first_paragraph.set("columnBreak", "0")

    has_section_properties = any(
        local_name(node.tag) == "secPr" for node in first_paragraph.iter()
    )
    if not has_section_properties:
        section_properties = next(
            (
                node
                for node in source_root.iter()
                if local_name(node.tag) == "secPr"
            ),
            None,
        )
        first_run = next(
            (node for node in first_paragraph.iter() if local_name(node.tag) == "run"),
            None,
        )
        if section_properties is None or first_run is None:
            raise RuntimeError("분리본에 필요한 HWPX 구역 설정을 찾지 못했습니다.")
        first_run.insert(0, copy.deepcopy(section_properties))

    return ET.tostring(output_root, encoding="utf-8", xml_declaration=True)


def rewrite_content_hpf(content_hpf: bytes, marker: str) -> bytes:
    root = parse_xml(content_hpf)
    metadata = next((node for node in root if local_name(node.tag) == "metadata"), None)
    manifest = next((node for node in root if local_name(node.tag) == "manifest"), None)
    spine = next((node for node in root if local_name(node.tag) == "spine"), None)
    if manifest is None or spine is None:
        raise RuntimeError("Contents/content.hpf의 manifest 또는 spine을 찾지 못했습니다.")

    if metadata is not None:
        title = next((node for node in metadata if local_name(node.tag) == "title"), None)
        if title is not None:
            title.text = marker

    item_reference = next(
        (node for node in manifest if local_name(node.tag) == "item"),
        None,
    )
    spine_reference = next(
        (node for node in spine if local_name(node.tag) == "itemref"),
        None,
    )
    if item_reference is None or spine_reference is None:
        raise RuntimeError("Contents/content.hpf의 항목 구조를 찾지 못했습니다.")

    for node in list(manifest):
        if local_name(node.tag) == "item" and node.attrib.get("id", "").startswith("section"):
            manifest.remove(node)
    section_item = ET.Element(
        qualified_like(item_reference.tag, "item"),
        {
            "id": "section0",
            "href": "Contents/section0.xml",
            "media-type": "application/xml",
        },
    )
    settings_index = next(
        (
            index
            for index, node in enumerate(list(manifest))
            if node.attrib.get("id") == "settings"
        ),
        len(list(manifest)),
    )
    manifest.insert(settings_index, section_item)

    for node in list(spine):
        if local_name(node.tag) == "itemref" and node.attrib.get("idref", "").startswith("section"):
            spine.remove(node)
    section_ref = ET.Element(
        qualified_like(spine_reference.tag, "itemref"),
        {"idref": "section0", "linear": "yes"},
    )
    header_index = next(
        (
            index
            for index, node in enumerate(list(spine))
            if node.attrib.get("idref") == "header"
        ),
        -1,
    )
    spine.insert(header_index + 1, section_ref)

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def rewrite_header_xml(header_xml: bytes) -> bytes:
    root = parse_xml(header_xml)
    updated = False
    for node in root.iter():
        if "secCnt" in node.attrib:
            node.set("secCnt", "1")
            updated = True
    if not updated:
        raise RuntimeError("Contents/header.xml에서 secCnt를 찾지 못했습니다.")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def write_individual_hwpx(
    source: Path,
    target: Path,
    marker: str,
    section_name: str,
    section_xml: bytes,
    content_hpf: bytes,
) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source, "r") as source_zip, zipfile.ZipFile(
        target, "w"
    ) as target_zip:
        for info in source_zip.infolist():
            name = info.filename
            if SECTION_RE.match(name):
                continue
            if name in {
                "Contents/content.hpf",
                "Preview/PrvText.txt",
                "Preview/PrvImage.png",
            }:
                continue
            data = source_zip.read(name)
            if name == "Contents/header.xml":
                data = rewrite_header_xml(data)
            copied_info = copy.copy(info)
            copied_info.compress_type = (
                zipfile.ZIP_STORED if name == "mimetype" else info.compress_type
            )
            target_zip.writestr(copied_info, data)

        target_zip.writestr(
            "Contents/section0.xml",
            section_xml,
            compress_type=zipfile.ZIP_DEFLATED,
        )
        target_zip.writestr(
            "Contents/content.hpf",
            content_hpf,
            compress_type=zipfile.ZIP_DEFLATED,
        )
        target_zip.writestr(
            "Preview/PrvText.txt",
            marker.encode("utf-8"),
            compress_type=zipfile.ZIP_DEFLATED,
        )

    with zipfile.ZipFile(target, "r") as check_zip:
        names = set(check_zip.namelist())
        required = {
            "mimetype",
            "Contents/header.xml",
            "Contents/section0.xml",
            "Contents/content.hpf",
        }
        missing = required - names
        if missing:
            raise RuntimeError(f"{target.name} 필수 항목 누락: {sorted(missing)}")
        parse_xml(check_zip.read("Contents/section0.xml"))
        parse_xml(check_zip.read("Contents/content.hpf"))


def svg_page_groups(root: ET.Element) -> list[ET.Element]:
    return [
        child
        for child in list(root)
        if local_name(child.tag) == "g" and child.attrib.get("data-page")
    ]


def svg_page_markers(page: ET.Element) -> set[str]:
    joined = "".join(
        "".join(node.itertext())
        for node in page.iter()
        if local_name(node.tag) == "text"
    )
    return {
        f"{match.group(1)}{match.group(2)}"
        for match in MARKER_RE.finditer(joined)
    }


def page_height(page: ET.Element) -> float:
    rect = next(
        (child for child in list(page) if local_name(child.tag) == "rect"),
        None,
    )
    if rect is None or not rect.attrib.get("height"):
        raise RuntimeError("SVG 페이지 높이를 찾지 못했습니다.")
    return float(rect.attrib["height"])


def build_preview_svgs(
    combined_svg: Path,
    chapter_id: str,
    markers: list[str],
) -> dict[str, dict[str, object]]:
    ET.register_namespace("", SVG_NS)
    root = ET.parse(combined_svg).getroot()
    pages = svg_page_groups(root)
    if len(pages) < 2:
        raise RuntimeError(f"{combined_svg.name}에 본문 페이지가 없습니다.")

    marker_pages: dict[str, int] = {}
    for page_index, page in enumerate(pages):
        if page_index == 0:
            continue
        for marker in svg_page_markers(page):
            if marker in markers and marker not in marker_pages:
                marker_pages[marker] = page_index

    missing = [marker for marker in markers if marker not in marker_pages]
    if missing:
        raise RuntimeError(f"SVG에서 미리보기 시작 페이지를 찾지 못했습니다: {missing}")

    ordered = sorted(markers, key=lambda marker: marker_pages[marker])
    preview_root = DOCS / "previews" / "forms" / f"chapter{chapter_id}"
    preview_root.mkdir(parents=True, exist_ok=True)
    assets: dict[str, dict[str, object]] = {}

    view_box = root.attrib.get("viewBox", "0 0 595.28 841.88").split()
    width = float(view_box[2])
    defs = next((child for child in list(root) if local_name(child.tag) == "defs"), None)

    for index, marker in enumerate(ordered):
        start = marker_pages[marker]
        end = marker_pages[ordered[index + 1]] if index + 1 < len(ordered) else len(pages)
        selected_pages = pages[start:end]
        page_gap = 18.0
        total_height = sum(page_height(page) for page in selected_pages)
        total_height += page_gap * max(0, len(selected_pages) - 1)

        output_root = ET.Element(
            f"{{{SVG_NS}}}svg",
            {
                "viewBox": f"0 0 {width:.2f} {total_height:.2f}",
                "width": f"{width:.2f}pt",
                "height": f"{total_height:.2f}pt",
                "font-family": root.attrib.get("font-family", ""),
                "{http://www.w3.org/XML/1998/namespace}space": "preserve",
            },
        )
        if defs is not None:
            output_root.append(copy.deepcopy(defs))

        offset = 0.0
        for relative_page, page in enumerate(selected_pages, start=1):
            cloned_page = copy.deepcopy(page)
            cloned_page.set("data-page", str(relative_page))
            cloned_page.set("transform", f"translate(0 {offset:.2f})")
            output_root.append(cloned_page)
            offset += page_height(page) + page_gap

        slug = marker_slug(marker)
        preview_file = preview_root / f"{slug}.svg"
        ET.ElementTree(output_root).write(
            preview_file,
            encoding="utf-8",
            xml_declaration=True,
        )
        svg_text = preview_file.read_text(encoding="utf-8")
        if "<script" in svg_text.lower() or re.search(
            r"(?:href|src)\s*=\s*[\"']https?://", svg_text, re.IGNORECASE
        ):
            raise RuntimeError(f"{preview_file.name}에 허용하지 않는 외부 실행 요소가 있습니다.")

        assets[marker] = {
            "preview": f"previews/forms/chapter{chapter_id}/{slug}.svg",
            "download": f"downloads/forms/chapter{chapter_id}/{slug}.hwpx",
            "pageCount": len(selected_pages),
        }

    return assets


def build_chapter(source: ChapterSource) -> dict[str, dict[str, object]]:
    if not source.hwpx.exists():
        raise FileNotFoundError(source.hwpx)
    if not source.combined_svg.exists():
        raise FileNotFoundError(
            f"{source.combined_svg}가 없습니다. kordoc render로 통합 SVG를 먼저 생성하세요."
        )

    with zipfile.ZipFile(source.hwpx, "r") as archive:
        section_xmls = {
            name: archive.read(name)
            for name in archive.namelist()
            if SECTION_RE.match(name)
        }
        content_hpf = archive.read("Contents/content.hpf")

    markers = find_section_markers(section_xmls)
    ranges = section_ranges(markers)
    download_root = DOCS / "downloads" / "forms" / f"chapter{source.chapter_id}"
    if download_root.exists():
        resolved_root = download_root.resolve()
        expected_parent = (DOCS / "downloads" / "forms").resolve()
        if expected_parent not in resolved_root.parents:
            raise RuntimeError(f"삭제 대상 경로 확인 실패: {resolved_root}")
        shutil.rmtree(download_root)
    download_root.mkdir(parents=True, exist_ok=True)

    for marker, section_name, start, end in ranges:
        section_slice = clone_section_slice(section_xmls[section_name], start, end)
        rewritten_hpf = rewrite_content_hpf(content_hpf, marker)
        target = download_root / f"{marker_slug(marker)}.hwpx"
        write_individual_hwpx(
            source.hwpx,
            target,
            marker,
            section_name,
            section_slice,
            rewritten_hpf,
        )

    marker_ids = [marker for marker, _, _, _ in ranges]
    return build_preview_svgs(
        source.combined_svg,
        source.chapter_id,
        marker_ids,
    )


def write_assets_script(all_assets: dict[str, dict[str, dict[str, object]]]) -> None:
    output = DOCS / "assets" / "form-assets.js"
    json_text = json.dumps(all_assets, ensure_ascii=False, indent=2)
    output.write_text(f"window.FORM_ASSETS = {json_text};\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="통합 HWPX와 kordoc SVG를 서식별 다운로드·미리보기 자산으로 분리합니다."
    )
    parser.parse_args()

    all_assets: dict[str, dict[str, dict[str, object]]] = {}
    for source in CHAPTERS:
        all_assets[source.chapter_id] = build_chapter(source)
    write_assets_script(all_assets)

    counts = {chapter: len(assets) for chapter, assets in all_assets.items()}
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    main()
