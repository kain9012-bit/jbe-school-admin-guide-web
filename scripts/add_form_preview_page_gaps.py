from pathlib import Path


path = Path(__file__).with_name("build_form_assets.py")
source = path.read_text(encoding="utf-8")

old_total = """        total_height = sum(page_height(page) for page in selected_pages)

        output_root = ET.Element(
"""
new_total = """        page_gap = 18.0
        total_height = sum(page_height(page) for page in selected_pages)
        total_height += page_gap * max(0, len(selected_pages) - 1)

        output_root = ET.Element(
"""
if old_total not in source:
    raise SystemExit("preview total-height target not found")
source = source.replace(old_total, new_total, 1)

old_offset = """            output_root.append(cloned_page)
            offset += page_height(page)
"""
new_offset = """            output_root.append(cloned_page)
            offset += page_height(page) + page_gap
"""
if old_offset not in source:
    raise SystemExit("preview page-offset target not found")
source = source.replace(old_offset, new_offset, 1)

path.write_text(source, encoding="utf-8")
