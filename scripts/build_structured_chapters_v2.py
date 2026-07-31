from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
FLOW_TITLE = "업무 흐름도"
SOURCE_FLOW = re.compile(r"^\s*[^▶\n]+\s*▶")
ORNAMENTS = {
    "제",
    "1편",
    "3편",
    "행정업무 및 보안",
    "인사관리",
    "제1편 행정업무 및 보안",
    "제3편 인사관리",
    "학교 행정업무 길라잡이",
}


def load(chapter: int) -> dict:
    path = ASSETS / f"chapter{chapter}-data.js"
    prefix = f"window.CHAPTER{chapter}_DATA = "
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw.removeprefix(prefix).removesuffix(";\n"))


def save(chapter: int, data: dict) -> None:
    path = ASSETS / f"chapter{chapter}-data.js"
    path.write_text(
        f"window.CHAPTER{chapter}_DATA = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )


def is_heading(line: str) -> bool:
    if line in {FLOW_TITLE, "관련법규 및 참고자료", "TIPTIP"}:
        return True
    if line.endswith("세부내용"):
        return True
    # 매뉴얼에는 '7 . 전보'처럼 번호와 마침표 사이가 벌어진 소제목도 있습니다.
    # 공백을 허용하지 않으면 앞 소제목 본문에 묻혀 목차에서 사라집니다.
    if re.match(r"^\d+\s*\.\s*\S", line):
        return True
    if re.match(r"^\d+\s+[가-힣A-Za-z]", line) and len(line) <= 45:
        return True
    return False


def filtered_lines(text: str, printed_page: int) -> list[str]:
    return [
        line
        for raw in text.splitlines()
        if (line := raw.strip())
        and line not in ORNAMENTS
        and line != str(printed_page)
    ]


def split_page(page: dict) -> tuple[list[dict], list[str]]:
    lines = filtered_lines(str(page["text"]), int(page["printedPage"]))
    blocks: list[dict] = []
    title = f"매뉴얼 {page['printedPage']}쪽"
    title_from_source = False
    body: list[str] = []

    def flush() -> None:
        nonlocal body
        if not body and title.startswith("매뉴얼 "):
            return
        blocks.append(
            {
                "id": f"p{page['pdfPage']}-b{len(blocks) + 1}",
                "title": title,
                "body": "\n".join(body).strip(),
                "pdfPage": page["pdfPage"],
                "printedPage": page["printedPage"],
                "sourceLineCount": len(body) + (1 if title_from_source else 0),
            }
        )
        body = []

    for line in lines:
        exact_flow = bool(SOURCE_FLOW.match(line))
        if is_heading(line) or exact_flow:
            flush()
            title = FLOW_TITLE if exact_flow else line
            title_from_source = not exact_flow
            body = [line] if exact_flow else []
        else:
            body.append(line)
    flush()
    return blocks, lines


def build(chapter: int) -> None:
    data = load(chapter)
    total_source_lines = 0
    total_block_lines = 0
    exact_flows = 0

    for section in data["sections"]:
        content_blocks = []
        flow_groups = []
        for page in section["sourcePages"]:
            blocks, lines = split_page(page)
            content_blocks.extend(blocks)
            total_source_lines += len(lines)
            total_block_lines += sum(block["sourceLineCount"] for block in blocks)
        for block in content_blocks:
            if block["title"] == FLOW_TITLE and SOURCE_FLOW.match(block["body"]):
                flow_groups.append(
                    {
                        "sourceText": block["body"],
                        "pdfPage": block["pdfPage"],
                        "printedPage": block["printedPage"],
                    }
                )
        section["contentBlocks"] = content_blocks
        section["flowGroups"] = flow_groups
        exact_flows += len(flow_groups)

    if total_source_lines != total_block_lines:
        raise RuntimeError(
            f"제{chapter}편 원문 줄 수 불일치: "
            f"{total_source_lines} != {total_block_lines}"
        )

    save(chapter, data)
    steps = {
        section["id"]: section["flowGroups"]
        for section in data["sections"]
    }
    (ASSETS / f"chapter{chapter}-steps.js").write_text(
        f"window.CHAPTER{chapter}_STEPS = "
        + json.dumps(steps, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(
        f"제{chapter}편: 원문 {total_source_lines}줄 → "
        f"구조화 블록 {sum(len(section['contentBlocks']) for section in data['sections'])}개, "
        f"원문 흐름 {exact_flows}개"
    )


def main() -> None:
    build(1)
    build(3)


if __name__ == "__main__":
    main()
