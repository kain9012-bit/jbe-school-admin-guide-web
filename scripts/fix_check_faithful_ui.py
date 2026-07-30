from pathlib import Path


path = Path(__file__).with_name("check_faithful_ui.js")
text = path.read_text(encoding="utf-8")
old = 'page.locator("[data-open-search]").last().click()'
new = 'page.locator("[data-open-search]:visible").last().click()'
if old not in text:
    raise RuntimeError("검수 코드 교체 구문을 찾지 못했습니다.")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
