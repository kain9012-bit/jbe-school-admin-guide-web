from pathlib import Path


path = Path(__file__).with_name("build_form_assets.py")
source = path.read_text(encoding="utf-8")

anchor = """def write_individual_hwpx(
"""
helper = """def rewrite_header_xml(header_xml: bytes) -> bytes:
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
"""
if anchor not in source:
    raise SystemExit("header helper anchor not found")
source = source.replace(anchor, helper, 1)

old_copy = """            data = source_zip.read(name)
            copied_info = copy.copy(info)
"""
new_copy = """            data = source_zip.read(name)
            if name == "Contents/header.xml":
                data = rewrite_header_xml(data)
            copied_info = copy.copy(info)
"""
if old_copy not in source:
    raise SystemExit("header rewrite target not found")
source = source.replace(old_copy, new_copy, 1)

path.write_text(source, encoding="utf-8")
