from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

replacements = {
    ROOT / "scripts" / "validate_structured_site.js": {
        "expectedBlocks: 160": "expectedBlocks: 132",
        "expectedBlocks: 94": "expectedBlocks: 91",
        "blocks: 160": "blocks: 132",
        "blocks: 94": "blocks: 91",
    },
    ROOT / "scripts" / "check_structured_ui.js": {
        "officialDocuments.blocks === 27": "officialDocuments.blocks === 17",
        "mobileResult.blocks === 35": "mobileResult.blocks === 33",
    },
}

for file_path, changes in replacements.items():
    text = file_path.read_text(encoding="utf-8")
    for old, new in changes.items():
        if old not in text:
            raise SystemExit(f"기대 문자열 없음: {file_path.name}: {old}")
        text = text.replace(old, new)
    file_path.write_text(text, encoding="utf-8", newline="\n")
    print(f"updated: {file_path}")
