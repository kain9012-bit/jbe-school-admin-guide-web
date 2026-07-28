from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "docs" / "assets" / "chapter1-data.js"
PREFIX = "window.CHAPTER1_DATA = "


def main() -> None:
    raw = DATA_PATH.read_text(encoding="utf-8")
    data = json.loads(raw.removeprefix(PREFIX).removesuffix(";\n"))

    next_category_headers = {
        "2. 공문서 관리",
        "3. 기록물 관리",
        "4. 신원조사․결격사유조회․범죄경력조회",
        "4. 신원조사·결격사유조회·범죄경력조회",
        "5. 직무대리",
    }

    for faq in data["faqs"]:
        question = faq["question"]
        if "∘" in question:
            title, detail = question.split("∘", 1)
            faq["question"] = title.strip()
            faq["answer"] = f"질문 내용\n{detail.strip()}\n\n{faq['answer']}".strip()

        answer_lines = faq["answer"].splitlines()
        while answer_lines and answer_lines[-1].strip() in next_category_headers:
            answer_lines.pop()
        faq["answer"] = "\n".join(answer_lines).strip()

    DATA_PATH.write_text(
        PREFIX + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"FAQ 정리 완료: {len(data['faqs'])}건")


if __name__ == "__main__":
    main()
