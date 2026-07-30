from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^0-9a-zA-Z가-힣]+", " ", value.lower())).strip()


def load_data() -> dict:
    raw = (ROOT / "docs" / "assets" / "chapter1-data.js").read_text(encoding="utf-8")
    return json.loads(raw.removeprefix("window.CHAPTER1_DATA = ").removesuffix(";\n"))


def load_search_index() -> list[dict]:
    raw = (ROOT / "docs" / "assets" / "guide-search-index.js").read_text(encoding="utf-8")
    return json.loads(
        raw.removeprefix("window.GUIDE_SEARCH_INDEX = ").removesuffix(";\n")
    )


def validate_search(data: dict) -> None:
    items: list[tuple[str, str, str]] = []
    for item in data["sections"]:
        text = " ".join(
            [
                item["title"],
                item["summary"],
                " ".join(item["keywords"]),
                " ".join(item["highlights"]),
                item["body"],
            ]
        )
        items.append(("업무", item["title"], text))
    for item in data["faqs"]:
        items.append(
            (
                "FAQ",
                item["question"],
                f"{item['category']} {item['question']} {item['answer']}",
            )
        )
    for item in data["forms"]:
        items.append(("서식", item["title"], item["searchText"]))

    queries = ["공인 폐기", "비전자문서", "직무대리 명령서", "범죄경력 조회", "발송 취소"]
    for query in queries:
        tokens = normalize(query).split()
        matches = [
            (kind, title)
            for kind, title, text in items
            if all(token in normalize(f"{title} {text}") for token in tokens)
        ]
        if not matches:
            raise RuntimeError(f"대표 검색어 결과 없음: {query}")
        print(f"{query}: {len(matches)}건 / {matches[:3]}")


def validate_files(data: dict) -> None:
    required = [
        ROOT / "docs" / "index.html",
        ROOT / "docs" / "assets" / "styles.css",
        ROOT / "docs" / "assets" / "app.js",
        ROOT / "docs" / "assets" / "chapter1-data.js",
        ROOT / "docs" / "assets" / "guide-search-index.js",
        *(ROOT / "docs" / relative for relative in data["downloads"].values()),
    ]
    missing = [str(path) for path in required if not path.is_file() or path.stat().st_size == 0]
    if missing:
        raise RuntimeError(f"필수 파일 누락: {missing}")


def validate_global_search_index(index: list[dict]) -> None:
    if len(index) < 128:
        raise RuntimeError(f"통합 검색 색인 항목 부족: {len(index)}건")

    faq_items = [item for item in index if item["type"] == "\uc790\uc8fc \ubb3b\ub294 \uc9c8\ubb38"]
    if len(faq_items) < 55:
        raise RuntimeError(f"통합 검색 FAQ 항목 부족: {len(faq_items)}건")
    if any(not item.get("faqNumber") for item in faq_items):
        raise RuntimeError("FAQ 검색 결과에 질문 식별자가 누락되었습니다.")
    if any(not item.get("chapterId") for item in index):
        raise RuntimeError("통합 검색 결과에 편 식별자가 누락되었습니다.")


def main() -> None:
    data = load_data()
    search_index = load_search_index()
    if len(data["sections"]) != 9:
        raise RuntimeError("업무 수가 9개가 아닙니다.")
    if len(data["faqs"]) != 55:
        raise RuntimeError("FAQ 수가 55개가 아닙니다.")
    if len(data["forms"]) != 19:
        raise RuntimeError("서식·예시 수가 19개가 아닙니다.")
    validate_files(data)
    validate_search(data)
    validate_global_search_index(search_index)
    print("사이트 데이터 및 필수 파일 검증 통과")


if __name__ == "__main__":
    main()
