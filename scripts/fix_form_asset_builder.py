from pathlib import Path


path = Path(__file__).with_name("build_form_assets.py")
source = path.read_text(encoding="utf-8")

old_marker_logic = """            matches = list(MARKER_RE.finditer(element_text(child)))
            if len(matches) != 1:
                continue
            marker = f"{matches[0].group(1)}{matches[0].group(2)}"
"""
new_marker_logic = """            matches = {
                f"{match.group(1)}{match.group(2)}"
                for match in MARKER_RE.finditer(element_text(child))
            }
            if len(matches) != 1:
                continue
            marker = next(iter(matches))
"""
if old_marker_logic not in source:
    raise SystemExit("marker logic target not found")
source = source.replace(old_marker_logic, new_marker_logic, 1)

old_delete_logic = """    if download_root.exists():
        shutil.rmtree(download_root)
"""
new_delete_logic = """    if download_root.exists():
        resolved_root = download_root.resolve()
        expected_parent = (DOCS / "downloads" / "forms").resolve()
        if expected_parent not in resolved_root.parents:
            raise RuntimeError(f"삭제 대상 경로 확인 실패: {resolved_root}")
        shutil.rmtree(download_root)
"""
if old_delete_logic not in source:
    raise SystemExit("delete guard target not found")
source = source.replace(old_delete_logic, new_delete_logic, 1)

path.write_text(source, encoding="utf-8")
